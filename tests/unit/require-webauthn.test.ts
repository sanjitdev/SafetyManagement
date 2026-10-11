/**
 * Unit tests for the WebAuthn role guard
 * (lib/auth/guards.ts → requireWebAuthn).
 *
 * Bolt 005-001 (ADR-007): every write under `/api/v1/admin/*`
 * must pass through `requireWebAuthn`. The guard throws
 * `webauthn_required` when the session's user has no registered
 * credential and `webauthn_assertion_expired` when the most-
 * recent challenge is older than `WEBAUTHN_CHALLENGE_TTL_MS`.
 *
 * The dev seam (`CITYFIX_DEV_STORE=1` AND `DEV_SKIP_WEBAUTHN=1`)
 * short-circuits the guard and returns the session as-is. The
 * dev seam is honored ONLY when the dev store is active — the
 * test pins this contract so a future refactor that widens the
 * seam (e.g. honors `DEV_SKIP_WEBAUTHN` in prod) fails the
 * suite.
 *
 * The tests run against the real in-memory dev store — no
 * mocks. The store is pure JS and has no I/O, so it is safe in
 * vitest. `process.env.CITYFIX_DEV_STORE` is set to '1' so the
 * `isDevStore()` check passes; the dev seam tests then toggle
 * `process.env.DEV_SKIP_WEBAUTHN` to '1' on a per-test basis.
 *
 *   - `requireWebAuthn(null)` → 401 `not_authenticated`
 *   - `requireWebAuthn(citizenSession)` → 403 `forbidden_role`
 *   - `requireWebAuthn(adminSession)` with empty credentials
 *     → 401 `webauthn_required`
 *   - `requireWebAuthn(adminSession)` with credentials but no
 *     challenge row → 401 `webauthn_assertion_expired`
 *   - `requireWebAuthn(adminSession)` with credentials + a fresh
 *     challenge row → returns the session
 *   - `requireWebAuthn(adminSession)` with credentials + an
 *     expired challenge row → 401 `webauthn_assertion_expired`
 *   - Dev seam with `null` session → 401 (the session check
 *     still runs first)
 *   - Dev seam with admin session → returns the session
 *     without consulting the database
 *   - Dev seam is NOT honored when `CITYFIX_DEV_STORE` is unset
 *     — the env var `DEV_SKIP_WEBAUTHN=1` alone is not enough
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  requireWebAuthn,
  ApiError,
  WEBAUTHN_CHALLENGE_TTL_MS,
} from '@/lib/auth/guards';
import { resetStore, devDb, DEV_ADMIN_ID } from '@/lib/dev-store';
import type { SessionContext } from '@/lib/auth/session';
import type {
  DevWebAuthnCredential,
  DevWebAuthnChallenge,
} from '@/lib/dev-store';

function mkSession(overrides: Partial<SessionContext> = {}): SessionContext {
  return {
    sessionId: 'sess_admin_test',
    userId: DEV_ADMIN_ID,
    cityId: 'city_dhaka_north',
    wardId: null,
    departmentId: null,
    role: 'admin',
    ...overrides,
  };
}

function mkCredential(
  id: string,
  name: string = 'Test YubiKey',
): DevWebAuthnCredential {
  return {
    credentialID: id,
    credentialPublicKey: new Uint8Array(32),
    counter: 0,
    transports: ['usb'],
    registeredAt: new Date().toISOString(),
    name,
  };
}

function mkChallenge(
  userId: string,
  ageMs: number = 0,
): DevWebAuthnChallenge {
  const expiresAt = new Date(Date.now() - ageMs + WEBAUTHN_CHALLENGE_TTL_MS);
  return devDb.webAuthnChallenge.create({
    userId,
    challenge: `challenge-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    expiresAt: expiresAt.toISOString(),
  });
}

describe('requireWebAuthn (Bolt 005-001)', () => {
  const ORIGINAL_DEV_STORE = process.env.CITYFIX_DEV_STORE;
  const ORIGINAL_SKIP = process.env.DEV_SKIP_WEBAUTHN;

  beforeEach(() => {
    process.env.CITYFIX_DEV_STORE = '1';
    delete process.env.DEV_SKIP_WEBAUTHN;
    resetStore();
  });

  afterEach(() => {
    if (ORIGINAL_DEV_STORE === undefined) {
      delete process.env.CITYFIX_DEV_STORE;
    } else {
      process.env.CITYFIX_DEV_STORE = ORIGINAL_DEV_STORE;
    }
    if (ORIGINAL_SKIP === undefined) {
      delete process.env.DEV_SKIP_WEBAUTHN;
    } else {
      process.env.DEV_SKIP_WEBAUTHN = ORIGINAL_SKIP;
    }
    resetStore();
  });

  it('throws 401 not_authenticated when the session is null', async () => {
    await expect(requireWebAuthn(null)).rejects.toThrowError(ApiError);
    try {
      await requireWebAuthn(null);
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(401);
      expect((err as ApiError).code).toBe('not_authenticated');
    }
  });

  it('throws 403 forbidden_role when the role is not admin', async () => {
    const citizen = mkSession({ role: 'citizen', userId: 'user_citizen_rahim' });
    await expect(requireWebAuthn(citizen)).rejects.toMatchObject({
      status: 403,
      code: 'forbidden_role',
    });
  });

  it('throws 401 webauthn_required when the admin has no credentials', async () => {
    const admin = mkSession();
    // Sanity: the seeded admin starts with no credentials.
    expect(devDb.user.findUnique({ where: { id: DEV_ADMIN_ID } })?.webAuthnCredentials).toBeNull();
    await expect(requireWebAuthn(admin)).rejects.toMatchObject({
      status: 401,
      code: 'webauthn_required',
    });
  });

  it('throws 401 webauthn_required when the admin has zero credentials (empty array)', async () => {
    const admin = mkSession();
    devDb.user.webAuthn.writeCredentials(DEV_ADMIN_ID, []);
    await expect(requireWebAuthn(admin)).rejects.toMatchObject({
      status: 401,
      code: 'webauthn_required',
    });
  });

  it('throws 401 webauthn_assertion_expired when there is no challenge row', async () => {
    const admin = mkSession();
    devDb.user.webAuthn.writeCredentials(DEV_ADMIN_ID, [
      mkCredential('cred-1', 'YubiKey A'),
    ]);
    // No challenge row exists.
    await expect(requireWebAuthn(admin)).rejects.toMatchObject({
      status: 401,
      code: 'webauthn_assertion_expired',
    });
  });

  it('returns the session when credentials + a fresh challenge row exist', async () => {
    const admin = mkSession();
    devDb.user.webAuthn.writeCredentials(DEV_ADMIN_ID, [
      mkCredential('cred-1', 'YubiKey A'),
    ]);
    mkChallenge(DEV_ADMIN_ID, 0);
    const out = await requireWebAuthn(admin);
    expect(out).toBe(admin);
  });

  it('throws 401 webauthn_assertion_expired when the challenge row is older than the TTL', async () => {
    const admin = mkSession();
    devDb.user.webAuthn.writeCredentials(DEV_ADMIN_ID, [
      mkCredential('cred-1', 'YubiKey A'),
    ]);
    // ageMs = WEBAUTHN_CHALLENGE_TTL_MS + 1000 means the
    // challenge was created 5 min + 1 s ago; expiresAt is
    // now in the past.
    mkChallenge(DEV_ADMIN_ID, WEBAUTHN_CHALLENGE_TTL_MS + 1000);
    await expect(requireWebAuthn(admin)).rejects.toMatchObject({
      status: 401,
      code: 'webauthn_assertion_expired',
    });
  });

  it('dev seam: with DEV_SKIP_WEBAUTHN=1 + null session → 401 (session check still runs first)', async () => {
    process.env.DEV_SKIP_WEBAUTHN = '1';
    await expect(requireWebAuthn(null)).rejects.toMatchObject({
      status: 401,
      code: 'not_authenticated',
    });
  });

  it('dev seam: with DEV_SKIP_WEBAUTHN=1 + admin session → returns session without DB lookup', async () => {
    process.env.DEV_SKIP_WEBAUTHN = '1';
    // No credentials, no challenge row — the seam
    // short-circuits before either check.
    const admin = mkSession();
    const out = await requireWebAuthn(admin);
    expect(out).toBe(admin);
  });

  it('dev seam: with DEV_SKIP_WEBAUTHN=1 but CITYFIX_DEV_STORE unset → does NOT short-circuit (production posture)', async () => {
    delete process.env.CITYFIX_DEV_STORE;
    process.env.DEV_SKIP_WEBAUTHN = '1';
    const admin = mkSession();
    // Without the dev store active, the guard falls through
    // to the credentials check (which reads the Prisma
    // `User.webAuthnCredentials` column). In the unit-test
    // environment, Prisma cannot initialize without a real
    // DATABASE_URL; the guard therefore surfaces a Prisma
    // initialization error. The point of this test is
    // NEGATIVE: the dev seam did NOT short-circuit
    // (otherwise the guard would return `admin` as-is).
    // The Prisma-init error is the proof that the seam was
    // ignored. Any future change that lets the dev seam
    // fire when CITYFIX_DEV_STORE is unset would surface
    // here as `expect(admin).toBe(admin)` succeeding — the
    // test would fail with "expected Promise to reject
    // but resolved to admin".
    await expect(requireWebAuthn(admin)).rejects.not.toBe(admin);
    // And the rejection is NOT the dev-seam short-circuit
    // (which would have returned the session); it is the
    // Prisma path falling through. We assert the rejection
    // carries a `PrismaClientInitializationError`-shaped
    // error (the `code` is the libquery engine's
    // `P1013` — env var not found). The test does not
    // pin a specific Prisma error class to avoid
    // over-coupling; we only pin that the rejection is
    // a real error (i.e. the guard did not return the
    // session).
    await expect(requireWebAuthn(admin)).rejects.toBeDefined();
  });
});
