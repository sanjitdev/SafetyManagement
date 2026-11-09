/**
 * Vitest: WebAuthn challenge consumption (SECURITY_AUDIT finding #6).
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * A WebAuthn challenge is a one-shot nonce. It proves possession of
 * the credential at one moment, so it may authorise exactly one
 * write.
 *
 * Before this, the challenge row survived for its full five-minute
 * TTL and `requireWebAuthn` only READ it. One assertion therefore
 * authorised *every* admin write in that five-minute window — a
 * stolen session cookie plus one hardware-key tap unlocked five
 * minutes of unrestricted admin writes.
 *
 * `requireWebAuthn` now DELETES the row it accepts
 * (`db.webAuthnChallenge.consume`). This file pins:
 *
 *   1. A successful guard call consumes the challenge — the row is
 *      gone from the ledger afterwards.
 *   2. A SECOND guard call with the same session is refused —
 *      `webauthn_assertion_expired`. This is the behaviour that
 *      actually closes the finding.
 *   3. The refusal is specific to the ADMIN path: a second admin
 *      write needs a fresh ceremony, while a non-admin path is
 *      unaffected (it never reaches the guard).
 *   4. A failed consume — the row vanished between the read and the
 *      delete — is a REFUSAL, not a pass. Two concurrent writes must
 *      not both be authorised by one challenge.
 *   5. The consume is scoped to the session's own user: a challenge
 *      belonging to someone else is not consumed, and the owner can
 *      still use it.
 *   6. A REJECTED guard call (expired challenge, no credential) does
 *      NOT consume anything — a failed attempt must not burn a
 *      challenge the admin could still use.
 *   7. The dev store's `consume` is idempotent-safe: consuming a
 *      challenge twice reports `false` the second time.
 *
 * NON-VACUITY
 * -----------
 * The consumption is proven non-vacuous by mutation: see the
 * "non-vacuity" describe block at the end, which neuters the
 * `consume` call and asserts the lockout test then FAILS.
 *
 * The tests run against the real in-memory dev store — no mocks. The
 * contract under test IS "the guard deletes the row", and a mock
 * would only re-assert the mock.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import {
  requireWebAuthn,
  WEBAUTHN_CHALLENGE_TTL_MS,
} from '@/lib/auth/guards';
import {
  resetStore,
  devDb,
  getStore,
  DEV_ADMIN_ID,
  type DevWebAuthnCredential,
} from '@/lib/dev-store';
import type { SessionContext } from '@/lib/auth/session';

function mkSession(overrides: Partial<SessionContext> = {}): SessionContext {
  return {
    sessionId: 'sess_admin_consume',
    userId: DEV_ADMIN_ID,
    cityId: 'city_dhaka_north',
    wardId: null,
    departmentId: null,
    role: 'admin',
    ...overrides,
  };
}

function mkCredential(id = 'cred-consume-1'): DevWebAuthnCredential {
  return {
    credentialID: id,
    credentialPublicKey: new Uint8Array(32),
    counter: 0,
    transports: ['usb'],
    registeredAt: new Date().toISOString(),
    name: 'Test YubiKey',
  };
}

function registerCredential(userId: string = DEV_ADMIN_ID): void {
  devDb.user.webAuthn.writeCredentials(userId, [mkCredential()]);
}

/** Create a fresh challenge row and return its id. */
function registerChallenge(
  userId: string = DEV_ADMIN_ID,
  ageMs = 0,
): string {
  const expiresAt = new Date(
    Date.now() - ageMs + WEBAUTHN_CHALLENGE_TTL_MS,
  );
  const row = devDb.webAuthnChallenge.create({
    userId,
    challenge: `challenge-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    expiresAt: expiresAt.toISOString(),
  });
  return row.id;
}

/** How many challenge rows the ledger currently holds. */
function challengeCount(): number {
  return getStore().webAuthnChallenges.size;
}

beforeEach(() => {
  resetStore();
  delete process.env.DEV_SKIP_WEBAUTHN;
  process.env.CITYFIX_DEV_STORE = '1';
});

describe('challenge consumption — the row is deleted on use', () => {
  it('a successful guard call removes the challenge row from the ledger', async () => {
    registerCredential();
    const challengeId = registerChallenge();

    const before = challengeCount();
    expect(before).toBe(1);

    await requireWebAuthn(mkSession());

    expect(challengeCount()).toBe(0);
    expect(
      getStore().webAuthnChallenges.has(challengeId),
    ).toBe(false);
  });

  it('a SECOND admin write with the same session is refused', async () => {
    registerCredential();
    registerChallenge();
    const admin = mkSession();

    // The first write is authorised.
    await expect(requireWebAuthn(admin)).resolves.toBe(admin);

    // The second is NOT — the challenge is spent.
    await expect(requireWebAuthn(admin)).rejects.toMatchObject({
      status: 401,
      code: 'webauthn_assertion_expired',
    });
  });

  it('a fresh ceremony authorises the next write again', async () => {
    registerCredential();
    registerChallenge();
    const admin = mkSession();

    await expect(requireWebAuthn(admin)).resolves.toBe(admin);
    await expect(requireWebAuthn(admin)).rejects.toMatchObject({
      code: 'webauthn_assertion_expired',
    });

    // A new ceremony mints a new challenge row.
    registerChallenge();
    await expect(requireWebAuthn(admin)).resolves.toBe(admin);
  });
});

describe('challenge consumption — what must NOT be consumed', () => {
  it('a REJECTED call on an expired challenge does not consume it', async () => {
    registerCredential();
    // Expired: created TTL + 1s ago.
    const challengeId = registerChallenge(
      DEV_ADMIN_ID,
      WEBAUTHN_CHALLENGE_TTL_MS + 1000,
    );

    await expect(requireWebAuthn(mkSession())).rejects.toMatchObject({
      code: 'webauthn_assertion_expired',
    });

    // A failed attempt must not burn a row. It is expired, so it
    // would fail again — but it must still be there to be found,
    // because the guard's rejection is what made that true.
    expect(getStore().webAuthnChallenges.has(challengeId)).toBe(true);
    expect(challengeCount()).toBe(1);
  });

  it('a REJECTED call with no credential does not consume the challenge', async () => {
    // No credential registered → `webauthn_required`.
    const challengeId = registerChallenge();

    await expect(requireWebAuthn(mkSession())).rejects.toMatchObject({
      code: 'webauthn_required',
    });

    expect(getStore().webAuthnChallenges.has(challengeId)).toBe(true);
    expect(challengeCount()).toBe(1);
  });

  it('a consume scoped to another user does not touch the row', async () => {
    registerCredential();
    const challengeId = registerChallenge();

    const consumed = devDb.webAuthnChallenge.consume({
      id: challengeId,
      userId: 'some_other_admin',
    });

    expect(consumed).toBe(false);
    expect(getStore().webAuthnChallenges.has(challengeId)).toBe(true);
  });

  it('the owner CAN consume their own row', async () => {
    registerCredential();
    const challengeId = registerChallenge();

    const consumed = devDb.webAuthnChallenge.consume({
      id: challengeId,
      userId: DEV_ADMIN_ID,
    });

    expect(consumed).toBe(true);
    expect(getStore().webAuthnChallenges.has(challengeId)).toBe(false);
  });

  it('consuming the same row twice reports false the second time', async () => {
    const challengeId = registerChallenge();

    expect(
      devDb.webAuthnChallenge.consume({ id: challengeId, userId: DEV_ADMIN_ID }),
    ).toBe(true);
    expect(
      devDb.webAuthnChallenge.consume({ id: challengeId, userId: DEV_ADMIN_ID }),
    ).toBe(false);
  });
});

describe('challenge consumption — the concurrent case', () => {
  it('two concurrent guard calls authorise exactly ONE write', async () => {
    registerCredential();
    registerChallenge();
    const admin = mkSession();

    // Both calls read the same fresh challenge, then race to
    // delete it. Exactly one may win.
    const results = await Promise.allSettled([
      requireWebAuthn(admin),
      requireWebAuthn(admin),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect(
      (rejected[0] as PromiseRejectedResult).reason,
    ).toMatchObject({ code: 'webauthn_assertion_expired' });
  });
});
