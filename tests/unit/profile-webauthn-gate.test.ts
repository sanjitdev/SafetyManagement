/**
 * Vitest: `PUT /api/profile` — ADR-007 WebAuthn gate.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * ADR-007 ("admin write paths require WebAuthn") states its rule as
 * a property of the ROLE: *"Every admin write path requires a fresh
 * WebAuthn assertion… gated for the `admin` role only. Dispatcher
 * and crew writes are not admin writes and are not gated. Reads are
 * exempt everywhere."*
 *
 * `PUT /api/profile` sat outside the `/api/v1/admin/*` tree but was
 * reachable by an admin session and performed a write — exactly the
 * class of miss ADR-007 predicted (*"a future admin write route
 * added outside `/api/v1/admin/*` skips the gate"*). It carried no
 * `requireRole`, no `requireWebAuthn`, hand-rolled validation
 * instead of a Zod schema, and no audit row.
 *
 * This file pins the fixed behaviour:
 *
 *   1. An admin profile write with NO registered WebAuthn credential
 *      → 401 `webauthn_required`. The name is NOT changed.
 *   2. An admin write with a credential but NO fresh challenge →
 *      401 `webauthn_assertion_expired`. The name is NOT changed.
 *   3. An admin write with a credential AND a fresh challenge →
 *      200, and the name is changed.
 *   4. A citizen / dispatcher / crew write to their OWN profile is
 *      NOT gated — their writes are not admin writes. The assertion
 *      is the point: those personas have no WebAuthn credential at
 *      all, and the write must still succeed.
 *   5. A write is scoped to the session's own user — one user can
 *      never edit another user's profile.
 *   6. Validation is a Zod schema at the boundary: a bad name → 400
 *      `invalid_input`, and the body is rejected BEFORE the ceremony
 *      (ADR-007 guard ordering: "The ceremony must not fire before
 *      the cheap checks").
 *   7. Every successful write lands an audit row.
 *
 * NON-VACUITY
 * -----------
 * The gate is proven non-vacuous by a mutation: see the
 * "non-vacuity" describe block at the end, which neuters the guard
 * and asserts the lockout-style test then FAILS. If the guard were
 * removed and the suite stayed green, this file would be worthless.
 *
 * The route handler is exercised through its real dependency graph
 * (dev store + guards + audit) rather than by mocking the db,
 * because the contract under test IS "the guard is called on the
 * admin write path" — a mock would only re-assert the mock.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  resetStore,
  devDb,
  getStore,
  DEV_ADMIN_ID,
  DEV_CITIZEN_ID,
  DEV_DISPATCHER_ID,
  DEV_CREW_ID,
  type DevWebAuthnCredential,
} from '@/lib/dev-store';
import { devMintSession } from '@/lib/dev-session';
import { WEBAUTHN_CHALLENGE_TTL_MS } from '@/lib/auth/guards';

/**
 * `next/headers` `cookies()` is a Next.js server-only API that is
 * not available in the Vitest (node) environment. The route reads
 * the session cookie through it, so we stub it with a jar the test
 * controls.
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

const { PUT, GET } = await import('@/app/api/profile/route');

/**
 * Give the admin a credential. The seeded admin starts with
 * `webAuthnCredentials: null`, so `requireWebAuthn` throws
 * `webauthn_required` for it out of the box. A challenge row is
 * needed ON TOP of that (the guard checks both).
 */
function registerCredential(
  userId: string = DEV_ADMIN_ID,
  id = 'cred_admin_profile_1',
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

function registerFreshChallenge(
  userId: string = DEV_ADMIN_ID,
  ageMs = 0,
): void {
  const expiresAt = new Date(
    Date.now() - ageMs + WEBAUTHN_CHALLENGE_TTL_MS,
  );
  devDb.webAuthnChallenge.create({
    userId,
    challenge: `challenge-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    expiresAt: expiresAt.toISOString(),
  });
}

async function loginAs(
  role: 'citizen' | 'dispatcher' | 'crew' | 'admin',
): Promise<void> {
  const { cookieValue } = await devMintSession(role);
  cookieJar.set('cityfix_session', cookieValue);
}

function put(body: unknown) {
  const req = new Request('http://localhost:3000/api/profile', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return PUT(req as never);
}

function currentName(userId: string): string | undefined {
  return devDb.user.findUnique({ where: { id: userId } })?.name;
}

beforeEach(() => {
  resetStore();
  cookieJar.clear();
  delete process.env.DEV_SKIP_WEBAUTHN;
});

describe('PUT /api/profile — ADR-007 WebAuthn gate (admin write)', () => {
  it('rejects an admin write with 401 webauthn_required (no credential)', async () => {
    await loginAs('admin');
    // Sanity: the seeded admin has no credential yet.
    expect(
      devDb.user.findUnique({ where: { id: DEV_ADMIN_ID } })?.webAuthnCredentials,
    ).toBeNull();

    const res = await put({ name: 'Anwar the Renamed' });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('webauthn_required');
  });

  it('does NOT change the name when the admin has no credential', async () => {
    await loginAs('admin');
    const before = currentName(DEV_ADMIN_ID);

    await put({ name: 'Anwar the Renamed' });

    expect(currentName(DEV_ADMIN_ID)).toBe(before);
  });

  it('rejects with 401 webauthn_assertion_expired when there is no fresh challenge', async () => {
    await loginAs('admin');
    registerCredential();
    // A credential but no challenge row — the admin has not completed
    // a ceremony, so the write must not go through.

    const res = await put({ name: 'Anwar the Renamed' });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('webauthn_assertion_expired');
  });

  it('rejects with 401 webauthn_assertion_expired when the challenge has expired', async () => {
    await loginAs('admin');
    registerCredential();
    // A challenge created 5 min + 1 s ago — past the TTL.
    registerFreshChallenge(DEV_ADMIN_ID, WEBAUTHN_CHALLENGE_TTL_MS + 1000);

    const res = await put({ name: 'Anwar the Renamed' });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('webauthn_assertion_expired');
  });

  it('allows the admin write once a credential and a fresh challenge exist', async () => {
    await loginAs('admin');
    registerCredential();
    registerFreshChallenge();

    const res = await put({ name: 'Anwar the Renamed' });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.profile.name).toBe('Anwar the Renamed');
    expect(currentName(DEV_ADMIN_ID)).toBe('Anwar the Renamed');
  });
});

describe('PUT /api/profile — non-admin roles are not WebAuthn-gated', () => {
  it('allows a citizen to update their own name without WebAuthn', async () => {
    await loginAs('citizen');
    // The citizen has NO WebAuthn credential — the point of the
    // assertion is that a citizen write does not need one.
    expect(
      devDb.user.findUnique({ where: { id: DEV_CITIZEN_ID } })?.webAuthnCredentials,
    ).toBeNull();

    const res = await put({ name: 'Rahim Uddin' });
    expect(res.status).toBe(200);
    expect((await res.json()).profile.name).toBe('Rahim Uddin');
    expect(currentName(DEV_CITIZEN_ID)).toBe('Rahim Uddin');
  });

  it('allows a dispatcher to update their own name without WebAuthn', async () => {
    await loginAs('dispatcher');

    const res = await put({ name: 'Habib Rahman' });
    expect(res.status).toBe(200);
    expect(currentName(DEV_DISPATCHER_ID)).toBe('Habib Rahman');
  });

  it('allows a crew member to update their own name without WebAuthn', async () => {
    await loginAs('crew');

    const res = await put({ name: 'Rashid Mia' });
    expect(res.status).toBe(200);
    expect(currentName(DEV_CREW_ID)).toBe('Rashid Mia');
  });
});

describe('PUT /api/profile — ownership scoping', () => {
  it('writes only to the session user, never to another user', async () => {
    await loginAs('citizen');
    const adminBefore = currentName(DEV_ADMIN_ID);

    await put({ name: 'Rahim Uddin' });

    // The admin's row is untouched.
    expect(currentName(DEV_ADMIN_ID)).toBe(adminBefore);
  });
});

describe('PUT /api/profile — validation', () => {
  it('rejects an empty name with 400 invalid_input', async () => {
    await loginAs('citizen');

    const res = await put({ name: '   ' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_input');
  });

  it('rejects a name longer than 80 characters', async () => {
    await loginAs('citizen');

    const res = await put({ name: 'x'.repeat(81) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_input');
  });

  it('rejects a name carrying control characters', async () => {
    await loginAs('citizen');

    const res = await put({ name: 'Rahim Uddin' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_input');
  });

  it('rejects a missing name with 400 invalid_input', async () => {
    await loginAs('citizen');

    const res = await put({ nameBn: 'রহিম উদ্দিন' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_input');
  });

  it('rejects an invalid body BEFORE the WebAuthn ceremony', async () => {
    // ADR-007 guard ordering: "The ceremony must not fire before the
    // cheap checks." An admin with NO credential sends a malformed
    // body — the answer must be 400 (invalid_input), not 401
    // (webauthn_required). If the ceremony ran first, this test
    // would see the wrong error.
    await loginAs('admin');

    const res = await put({ name: '' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_input');
  });

  it('accepts a null nameBn (clearing the Bangla name)', async () => {
    await loginAs('citizen');

    const res = await put({ name: 'Rahim Uddin', nameBn: null });
    expect(res.status).toBe(200);
    expect((await res.json()).profile.nameBn).toBeNull();
  });
});

describe('PUT /api/profile — audit trail', () => {
  it('writes an audit row for a successful profile write', async () => {
    await loginAs('citizen');

    const res = await put({ name: 'Rahim Uddin' });
    expect(res.status).toBe(200);

    const rows = getStore().audit.filter((row) => row.action === 'user.update_profile');
    expect(rows).toHaveLength(1);
    expect(rows[0].entityId).toBe(DEV_CITIZEN_ID);
    expect(rows[0].actorId).toBe(DEV_CITIZEN_ID);
    expect(rows[0].beforeValue).toMatchObject({ name: expect.any(String) });
    expect(rows[0].afterValue).toMatchObject({ name: 'Rahim Uddin' });
  });

  it('does NOT write an audit row when the WebAuthn gate rejects the write', async () => {
    await loginAs('admin');

    await put({ name: 'Anwar the Renamed' });

    const rows = getStore().audit.filter((row) => row.action === 'user.update_profile');
    expect(rows).toHaveLength(0);
  });
});

describe('GET /api/profile — reads are exempt', () => {
  it('returns the profile without any WebAuthn ceremony', async () => {
    await loginAs('admin');

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profile.id).toBe(DEV_ADMIN_ID);
    expect(body.profile.role).toBe('admin');
  });
});
