/**
 * WebAuthn domain-service layer (lib/auth/webauthn.ts).
 *
 * Bolt 005-001 — WebAuthn (mandatory for admin writes).
 * Implements the four domain-service functions the
 * `/api/auth/webauthn/*` route handlers call:
 *
 *   - issueChallenge(userId, kind)
 *   - verifyAttestation(userId, attestationResponse, credentialName)
 *   - verifyAssertion(userId, challengeId, assertionResponse)
 *   - revokeCredential(userId, credentialId)
 *
 * Signature verification is delegated to `@simplewebauthn/server` v10.
 * This module owns:
 *   - the challenge ledger (`WebAuthnChallenge` table)
 *   - the per-user `webAuthnCredentials` JSON column
 *   - the audit log emissions (the four `webauthn.*` events)
 *   - the session cookie minting on a successful assertion
 *
 * The route handlers (under `app/api/auth/webauthn/*`) import the
 * four functions from here. The `requireWebAuthn` guard lives in
 * `lib/auth/guards.ts` and imports the TTL constant from there.
 */

import {
  generateRegistrationOptions,
  generateAuthenticationOptions,
  verifyRegistrationResponse,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from '@simplewebauthn/types';

import { db } from '@/lib/db-switch';
import { createSession, SESSION_COOKIE } from '@/lib/auth/session';
import { writeAudit } from '@/lib/platform/audit';
import { ApiError } from '@/lib/auth/guards';

// =====================================================================
// Constants + types
// =====================================================================

/** WebAuthn challenge TTL — 5 minutes (matches the citizen OTP TTL). */
export const WEBAUTHN_CHALLENGE_TTL_MS = 5 * 60 * 1000;

/** Ceremony timeout — 60 seconds. */
export const WEBAUTHN_CEREMONY_TIMEOUT_MS = 60 * 1000;

/** The Relying Party name (display only). */
const RP_NAME = 'CityFix';

// ---- Prod-RP guard (lazy) ---------------------------------------------
// We deliberately do NOT throw at module load in production: Vercel
// runs `next build` in a separate process that may not have env vars
// exposed at build time, and a module-load throw would fail the build
// before the app ever serves a request. Instead we validate the prod
// config lazily on first use, and cache the validated values so the
// check runs once per process. Loud-fail-on-first-request, same
// security posture, build-friendly.

let rpOriginCache: string | undefined;
let rpIdCache: string | undefined;

/**
 * Throws if the production RP config is missing or unsafe. Returns
 * silently in development. Called from each public WebAuthn function
 * (issueChallenge, verifyAttestation, verifyAssertion, revokeCredential)
 * so the first prod request that needs RP config will fail loudly with
 * a clear message. The dev path is unaffected.
 */
export function assertWebAuthnProdConfig(): void {
  if (process.env.NODE_ENV !== 'production') return;
  const origin = process.env.WEBAUTHN_RP_ORIGIN;
  if (!origin || !origin.startsWith('https://')) {
    throw new Error(
      `[webauthn] WEBAUTHN_RP_ORIGIN must be set to an https:// URL in production (got: ${origin ?? '<unset>'})`,
    );
  }
  const id = process.env.WEBAUTHN_RP_ID;
  if (!id || id === 'localhost') {
    throw new Error(
      `[webauthn] WEBAUTHN_RP_ID must be set to the production hostname in production (got: ${id ?? '<unset>'})`,
    );
  }
}

/** The Relying Party ID. v1: localhost in dev, prod hostname in prod. */
function rpId(): string {
  if (rpIdCache !== undefined) return rpIdCache;
  assertWebAuthnProdConfig();
  rpIdCache = process.env.WEBAUTHN_RP_ID ?? 'localhost';
  return rpIdCache;
}

/** The Relying Party origin. v1: http://localhost:3000 in dev. */
function rpOrigin(): string {
  if (rpOriginCache !== undefined) return rpOriginCache;
  assertWebAuthnProdConfig();
  rpOriginCache =
    process.env.WEBAUTHN_RP_ORIGIN ?? 'http://localhost:3000';
  return rpOriginCache;
}

/** A registered WebAuthn credential (stored in `User.webAuthnCredentials`). */
export interface WebAuthnCredential {
  credentialID: string; // base64url
  credentialPublicKey: Uint8Array;
  counter: number;
  transports?: AuthenticatorTransportFuture[];
  registeredAt: string; // ISO 8601
  name: string;
}

/** The payload returned to the browser for an assertion ceremony. */
export interface AssertionChallengePayload {
  challengeId: string;
  challenge: string;
  rpId: string;
  allowCredentials: Array<{ id: string; transports?: AuthenticatorTransportFuture[] }>;
  userVerification: 'preferred' | 'required' | 'discouraged';
  timeout: number;
}

/** The payload returned to the browser for a registration ceremony. */
export interface RegisterChallengePayload {
  challengeId: string;
  options: Awaited<ReturnType<typeof generateRegistrationOptions>>;
}

/** The session payload returned to the client after a successful assertion. */
export interface AssertionSessionResult {
  sessionId: string;
  userId: string;
  role: 'admin';
  cityId: string;
  cookieValue: string;
  expiresAt: Date;
}

function bufferToBase64Url(buf: Uint8Array | ArrayBuffer): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function randomChallenge(): string {
  return bufferToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

/**
 * Normalise the `webAuthnCredentials` JSON column into an array.
 * The dev store stores a parsed array (or null); the Prisma path
 * returns the JSON value as-is. Empty array treated as null.
 */
function readCredentialsFromUser(user: {
  webAuthnCredentials?: unknown;
}): WebAuthnCredential[] | null {
  const raw = user.webAuthnCredentials;
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw as WebAuthnCredential[];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as WebAuthnCredential[]) : null;
    } catch {
      return null;
    }
  }
  return null;
}

// =====================================================================
// issueChallenge
// =====================================================================

/**
 * Issue a fresh WebAuthn challenge. The challenge is stored in
 * the `WebAuthnChallenge` table + mirrored into the JSON column
 * on `User.webAuthnChallenge` (the assertion route reads the
 * table for the nonce the browser signed against).
 */
export async function issueChallenge(
  userId: string,
  kind: 'assertion' | 'registration',
): Promise<AssertionChallengePayload | RegisterChallengePayload> {
  assertWebAuthnProdConfig();
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new ApiError(404, 'admin_not_found');
  }
  const credentials = readCredentialsFromUser(user);
  if (kind === 'assertion' && (!credentials || credentials.length === 0)) {
    throw new ApiError(409, 'webauthn_no_credential');
  }

  const challenge = randomChallenge();
  const expiresAt = new Date(Date.now() + WEBAUTHN_CHALLENGE_TTL_MS);
  const row = await db.webAuthnChallenge.create({
    userId,
    challenge,
    expiresAt,
  });
  // Mirror to the JSON column so the guard's fast-path can read it.
  await db.userWebAuthn.writeChallenge(userId, { challenge, expiresAt });

  if (kind === 'registration') {
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: rpId(),
      userID: new TextEncoder().encode(user.id),
      userName: user.name ?? user.id,
      userDisplayName: user.name ?? user.id,
      timeout: WEBAUTHN_CEREMONY_TIMEOUT_MS,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
      // The COSE algorithm identifiers the RP accepts.
      // Defaults to [-8, -7, -257] (EdDSA, ES256, RS256).
      supportedAlgorithmIDs: [-7, -257],
    });
    return { challengeId: row.id, options };
  }

  const allowCredentials = (credentials ?? []).map((c) => ({
    id: c.credentialID,
    transports: c.transports,
  }));
  const options = await generateAuthenticationOptions({
    rpID: rpId(),
    timeout: WEBAUTHN_CEREMONY_TIMEOUT_MS,
    userVerification: 'preferred',
    allowCredentials,
  });
  return {
    challengeId: row.id,
    challenge,
    rpId: rpId(),
    allowCredentials,
    userVerification: 'preferred',
    timeout: WEBAUTHN_CEREMONY_TIMEOUT_MS,
  };
}

// =====================================================================
// verifyAttestation
// =====================================================================

/**
 * Verify a registration ceremony's attestation response. On
 * success, append a new `WebAuthnCredential` to the user's
 * `webAuthnCredentials` and emit the `webauthn.register` audit row.
 * Throws `ApiError` on failure (no audit row).
 */
export async function verifyAttestation(
  userId: string,
  attestationResponse: unknown,
  credentialName: string,
): Promise<WebAuthnCredential> {
  assertWebAuthnProdConfig();
  if (
    !attestationResponse ||
    typeof attestationResponse !== 'object' ||
    !('id' in attestationResponse) ||
    !('rawId' in attestationResponse) ||
    !('response' in attestationResponse)
  ) {
    throw new ApiError(400, 'invalid_input');
  }
  const reg = attestationResponse as RegistrationResponseJSON;

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new ApiError(404, 'admin_not_found');
  }
  const existing = readCredentialsFromUser(user) ?? [];
  if (existing.some((c) => c.credentialID === reg.id)) {
    throw new ApiError(409, 'webauthn_duplicate_credential');
  }

  // The most-recent challenge for this user is the expected one.
  const latest = await db.webAuthnChallenge.findLatest({ userId });
  const expectedChallenge = latest?.challenge ?? '';

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: reg,
      expectedChallenge,
      expectedOrigin: rpOrigin(),
      expectedRPID: rpId(),
      requireUserVerification: false,
    });
  } catch {
    throw new ApiError(401, 'webauthn_attestation_failed');
  }
  if (!verification.verified || !verification.registrationInfo) {
    throw new ApiError(401, 'webauthn_attestation_failed');
  }
  const info = verification.registrationInfo;
  const credential: WebAuthnCredential = {
    credentialID: info.credentialID,
    credentialPublicKey: info.credentialPublicKey,
    counter: info.counter,
    transports: (reg.response.transports ?? undefined) as
      | AuthenticatorTransportFuture[]
      | undefined,
    registeredAt: new Date().toISOString(),
    name: credentialName,
  };

  await db.userWebAuthn.writeCredentials(userId, [...existing, credential]);

  await writeAudit({
    entityType: 'user',
    entityId: userId,
    action: 'webauthn.register',
    actorId: userId,
    afterValue: {
      credentialId: credential.credentialID,
      name: credential.name,
      registeredAt: credential.registeredAt,
    },
  });

  return credential;
}

// =====================================================================
// verifyAssertion
// =====================================================================

/**
 * Verify an assertion ceremony's response. On success:
 *   1. Bump the credential's `counter` to the new value.
 *   2. Mint a new `Session` via `createSession(...)`.
 *   3. Emit the `webauthn.assertion` audit row.
 *   4. Return the session info + the cookie value to set.
 *
 * The function takes the `challengeId` (not the userId) — the
 * challenge row's `userId` is the authoritative source. This
 * keeps the route anonymous (the body's challengeId is the
 * only authority for which user is being asserted).
 */
export async function verifyAssertion(
  challengeId: string,
  assertionResponse: unknown,
): Promise<AssertionSessionResult> {
  assertWebAuthnProdConfig();
  if (
    !assertionResponse ||
    typeof assertionResponse !== 'object' ||
    !('id' in assertionResponse) ||
    !('rawId' in assertionResponse) ||
    !('response' in assertionResponse)
  ) {
    throw new ApiError(400, 'invalid_input');
  }
  const assertion = assertionResponse as AuthenticationResponseJSON;

  // The challenge row is the authoritative source for the
  // userId the assertion is bound to. `findById` requires both
  // `id` and `userId`; for the prod path we look up by id
  // alone (challenge ids are globally unique). The dev-store
  // helper does the id-only scan via `getStore()` — see the
  // db.webAuthnChallenge wrapper in lib/db-switch.ts which
  // dispatches to the correct implementation.
  const challenge = await db.webAuthnChallenge.findById({
    id: challengeId,
    userId: '',
  });
  if (!challenge) {
    throw new ApiError(404, 'webauthn_challenge_not_found');
  }
  const userId = challenge.userId;
  const expiresAt =
    challenge.expiresAt instanceof Date
      ? challenge.expiresAt
      : new Date(challenge.expiresAt);
  if (expiresAt < new Date()) {
    throw new ApiError(401, 'webauthn_assertion_expired');
  }

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new ApiError(404, 'webauthn_credential_not_found');
  }
  const credentials = readCredentialsFromUser(user) ?? [];
  const stored = credentials.find((c) => c.credentialID === assertion.id);
  if (!stored) {
    throw new ApiError(404, 'webauthn_credential_not_found');
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: assertion,
      expectedChallenge: challenge.challenge,
      expectedOrigin: rpOrigin(),
      expectedRPID: rpId(),
      authenticator: {
        credentialID: stored.credentialID,
        credentialPublicKey: stored.credentialPublicKey,
        counter: stored.counter,
        transports: stored.transports,
      },
      requireUserVerification: false,
    });
  } catch {
    throw new ApiError(401, 'webauthn_assertion_failed');
  }
  if (!verification.verified) {
    throw new ApiError(401, 'webauthn_assertion_failed');
  }
  const newCounter = verification.authenticationInfo.newCounter;

  // Bump the credential's counter.
  const updated = credentials.map((c) =>
    c.credentialID === stored.credentialID
      ? { ...c, counter: newCounter }
      : c,
  );
  await db.userWebAuthn.writeCredentials(userId, updated);

  // Mint the session.
  const { sessionId, cookieValue, expiresAt: sessionExpiresAt } =
    await createSession({
      userId: user.id,
      cityId: user.cityId,
      wardId: null,
      departmentId: null,
    });

  await writeAudit({
    entityType: 'user',
    entityId: userId,
    action: 'webauthn.assertion',
    actorId: userId,
    beforeValue: { counter: stored.counter },
    afterValue: {
      counter: newCounter,
      sessionId,
      expiresAt: sessionExpiresAt.toISOString(),
    },
  });

  return {
    sessionId,
    userId: user.id,
    role: 'admin',
    cityId: user.cityId,
    cookieValue,
    expiresAt: sessionExpiresAt,
  };
}

// =====================================================================
// revokeCredential
// =====================================================================

/**
 * Revoke a registered credential. The no-last-credential rule
 * (a 409) is enforced here.
 */
export async function revokeCredential(
  userId: string,
  credentialId: string,
): Promise<{ removed: WebAuthnCredential; remaining: number }> {
  assertWebAuthnProdConfig();
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new ApiError(404, 'webauthn_credential_not_found');
  }
  const credentials = readCredentialsFromUser(user) ?? [];
  const target = credentials.find((c) => c.credentialID === credentialId);
  if (!target) {
    throw new ApiError(404, 'webauthn_credential_not_found');
  }
  if (credentials.length <= 1) {
    throw new ApiError(409, 'webauthn_last_credential');
  }
  const removed = await db.userWebAuthn.revokeCredential(userId, credentialId);
  await writeAudit({
    entityType: 'user',
    entityId: userId,
    action: 'webauthn.revoke',
    actorId: userId,
    beforeValue: {
      credentialId: target.credentialID,
      name: target.name,
    },
  });
  return removed;
}

/** Re-export the cookie name so route handlers don't import session twice. */
export { SESSION_COOKIE };
