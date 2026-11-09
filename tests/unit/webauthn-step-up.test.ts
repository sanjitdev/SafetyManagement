/**
 * Vitest: `POST /api/auth/webauthn/step-up` — the session-authenticated
 * WebAuthn ceremony.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * ADR-007 ("admin write paths require WebAuthn") gates the admin's
 * ticket transition and crew reassignment behind a fresh WebAuthn
 * assertion. The guard (`requireWebAuthn`) enforces it by checking
 * that the most-recent challenge row for the session's user is
 * unexpired.
 *
 * Until this route existed, there was NO way for a signed-in admin to
 * obtain that challenge. The only issuer was
 * `POST /api/auth/webauthn/login` — anonymous, email-keyed, and its
 * verify sibling `/api/auth/webauthn/assertion` MINTS A NEW SESSION.
 * So an admin who was already signed in and hit a gated write got a
 * bare `401 webauthn_required` and had to log out and back in through
 * the login ceremony to proceed. ADR-007 recorded this as a known
 * gap: *"the admin ticket page has no ceremony affordance, so an
 * admin who has not registered a key sees a bare error code with no
 * path to fix it."*
 *
 * This file pins the step-up contract:
 *
 *   1. No session → 401 `not_authenticated`.
 *   2. A non-admin session → 403 `forbidden_role`.
 *   3. `action: 'challenge'` with a registered credential → 200 with
 *      the ceremony options, and the challenge is bound to the
 *      SESSION'S user (not to anything the client supplied).
 *   4. `action: 'challenge'` with NO registered credential → 409
 *      `webauthn_no_credential` (the admin must register first).
 *   5. `action: 'verify'` with a challenge that belongs to ANOTHER
 *      user → 403 `webauthn_challenge_owner_mismatch`. This is the
 *      security-critical case: without the check, a signed-in admin
 *      could complete someone else's challenge and have it count as
 *      their own step-up.
 *   6. `action: 'verify'` with an unknown challenge → 404.
 *   7. `action: 'verify'` with a malformed assertion → 400.
 *   8. A malformed body → 400 `invalid_input`.
 *
 * The signature verification itself is NOT re-tested here — it is
 * covered by `tests/unit/webauthn-service.test.ts`, which exercises
 * `verifyAssertion` against real challenge rows. What this file
 * pins is the step-up route's OWN contract: who may step up, whose
 * challenge may be used, and what the route does with the challenge
 * afterwards.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  resetStore,
  devDb,
  DEV_ADMIN_ID,
  DEV_CITIZEN_ID,
  type DevWebAuthnCredential,
} from '@/lib/dev-store';
import { devMintSession } from '@/lib/dev-session';

/**
 * `next/headers` `cookies()` is a Next.js server-only API that is
 * not available in the Vitest (node) environment. The step-up route
 * reads the session cookie through it, so we stub it with a jar the
 * test controls. The cookie's CONTENTS are what this file asserts
 * (they carry the session id), so the jar must be a real Map.
 */
const cookieJar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
    delete: (name: string) => {
      cookieJar.delete(name);
    },
  }),
}));

const { POST } = await import('@/app/api/auth/webauthn/step-up/route');

/** Give the admin a registered authenticator. */
function registerCredential(
  userId: string = DEV_ADMIN_ID,
  id = 'cred_admin_1',
): void {
  const credential: DevWebAuthnCredential = {
    credentialID: id,
    credentialPublicKey: new Uint8Array(32),
    counter: 0,
    transports: ['usb'],
    registeredAt: new Date().toISOString(),
    name: 'Test YubiKey',
  };
  devDb.user.webAuthn.writeCredentials(userId, [credential]);
}

/** Mint a challenge row for a user and return its id. */
function createChallenge(userId: string, challenge?: string): string {
  return devDb.webAuthnChallenge.create({
    userId,
    challenge:
      challenge ?? `challenge-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  }).id;
}

async function loginAs(
  role: 'citizen' | 'dispatcher' | 'crew' | 'admin',
): Promise<string> {
  const { cookieValue } = await devMintSession(role);
  cookieJar.set('cityfix_session', cookieValue);
  return cookieValue;
}

function post(body: unknown) {
  const req = new Request('http://localhost:3000/api/auth/webauthn/step-up', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return POST(req as never);
}

beforeEach(() => {
  resetStore();
  cookieJar.clear();
});

describe('POST /api/auth/webauthn/step-up — authentication', () => {
  it('rejects an anonymous caller with 401 not_authenticated', async () => {
    const res = await post({ action: 'challenge' });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('not_authenticated');
  });

  it('rejects a citizen session with 403 forbidden_role', async () => {
    await loginAs('citizen');
    const res = await post({ action: 'challenge' });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('forbidden_role');
  });
});

describe('POST /api/auth/webauthn/step-up — action: challenge', () => {
  it('returns the ceremony options for an admin with a credential', async () => {
    await loginAs('admin');
    registerCredential();

    const res = await post({ action: 'challenge' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.challengeId).toBeTruthy();
    expect(body.challenge).toBeTruthy();
    expect(body.rpId).toBeTruthy();
    expect(Array.isArray(body.allowCredentials)).toBe(true);
    expect(body.allowCredentials[0].id).toBe('cred_admin_1');
  });

  it('binds the challenge to the SESSION’S user', async () => {
    await loginAs('admin');
    registerCredential();

    const res = await post({ action: 'challenge' });
    const body = await res.json();
    const row = devDb.webAuthnChallenge.findLatest({ userId: DEV_ADMIN_ID });
    expect(row?.id).toBe(body.challengeId);
    expect(row?.userId).toBe(DEV_ADMIN_ID);
  });

  it('answers 409 webauthn_no_credential when the admin has no key', async () => {
    await loginAs('admin');
    const res = await post({ action: 'challenge' });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('webauthn_no_credential');
  });
});

describe('POST /api/auth/webauthn/step-up — action: verify', () => {
  it('rejects a challenge that belongs to ANOTHER user', async () => {
    // The security-critical case. The citizen's challenge must not
    // be usable as the admin's step-up.
    await loginAs('admin');
    registerCredential();
    const citizenChallenge = createChallenge(DEV_CITIZEN_ID);

    const res = await post({
      action: 'verify',
      challengeId: citizenChallenge,
      assertionResponse: {
        id: 'cred_admin_1',
        rawId: 'cred_admin_1',
        response: {},
        type: 'public-key',
        clientExtensionResults: {},
      },
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('webauthn_challenge_owner_mismatch');
  });

  it('answers 404 for an unknown challenge', async () => {
    await loginAs('admin');
    registerCredential();

    const res = await post({
      action: 'verify',
      challengeId: 'wbc_does_not_exist',
      assertionResponse: {
        id: 'cred_admin_1',
        rawId: 'cred_admin_1',
        response: {},
        type: 'public-key',
        clientExtensionResults: {},
      },
    });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('webauthn_challenge_not_found');
  });

  it('answers 400 for a malformed assertion', async () => {
    await loginAs('admin');
    registerCredential();
    const challengeId = createChallenge(DEV_ADMIN_ID);

    const res = await post({
      action: 'verify',
      challengeId,
      assertionResponse: { not: 'an assertion' },
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_input');
  });

  it('answers 401 for a signature that does not verify', async () => {
    await loginAs('admin');
    registerCredential();
    const challengeId = createChallenge(DEV_ADMIN_ID);

    const res = await post({
      action: 'verify',
      challengeId,
      assertionResponse: {
        id: 'cred_admin_1',
        rawId: 'cred_admin_1',
        response: {
          authenticatorData: 'AAAA',
          clientDataJSON: 'AAAA',
          signature: 'AAAA',
          userHandle: 'AAAA',
        },
        type: 'public-key',
        clientExtensionResults: {},
      },
    });
    // The signature check is the real gate — a forged assertion must
    // not refresh the challenge ledger.
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('webauthn_assertion_failed');
  });
});

describe('POST /api/auth/webauthn/step-up — request validation', () => {
  it('answers 400 for a body with no action', async () => {
    await loginAs('admin');
    const res = await post({});
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_input');
  });

  it('answers 400 for an unknown action', async () => {
    await loginAs('admin');
    const res = await post({ action: 'something-else' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_input');
  });

  it('answers 400 when the verify action omits the challengeId', async () => {
    await loginAs('admin');
    const res = await post({ action: 'verify', assertionResponse: {} });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_input');
  });
});
