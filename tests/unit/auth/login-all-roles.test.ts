/**
 * Vitest: `POST /api/v1/auth/login` — ALL FOUR ROLES.
 *
 * The login route used to hard-code `role: 'citizen'` in its user
 * lookup, so only citizens could sign in. Dispatcher, crew and admin
 * had NO password path at all and could only be issued a session by
 * the dev-only `/api/dev/issue-session` route — which made the
 * seeded staff passwords unusable.
 *
 * This file pins the fixed behaviour:
 *
 *  1. Every role's account is found by `(cityId, phone)` with NO role
 *     filter, and a session is minted for each.
 *  2. The response carries the role, so the client can route to the
 *     right home surface.
 *  3. The session is bound to the user's OWN scope:
 *       - dispatcher / crew → their wardId + departmentId
 *       - citizen / admin   → both null
 *  4. A wrong password is still rejected (401) for every role, and
 *     the error stays vague — it must not reveal whether the phone
 *     exists.
 *  5. A phone with no account is ALSO 401 `wrong_credentials` — the
 *     same code, so a wrong phone and a wrong password are
 *     indistinguishable.
 *
 * The route handler is exercised through its real dependency graph
 * (dev store + argon2 + session minting) rather than by mocking the
 * db, because the contract under test is precisely "the lookup does
 * not filter by role" — a mock would only re-assert the mock.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { resetStore, getStore } from '@/lib/dev-store';
import { hashPassword } from '@/lib/auth/password';
import { resetLoginAttempts } from '@/lib/auth/login-lockout';

/**
 * `next/headers` `cookies()` is a Next.js server-only API that is not
 * available in the Vitest (node) environment. The route calls
 * `cookies()` to SET the session cookie. We stub it so the route can
 * run; the cookie's contents are not what this file asserts (the
 * session ROW is — see `devDb.session`).
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

/**
 * `rateLimit` is a per-IP, per-second limiter. The login route calls
 * it, so a suite that fires several logins in quick succession would
 * trip the limiter and get 429s instead of the real assertions. Stub
 * it to always allow — the limiter has its own tests.
 */
vi.mock('@/lib/platform/rate-limit', () => ({
  rateLimit: () => ({ allowed: true, retryAfterMs: 0 }),
}));

const { POST } = await import('@/app/api/v1/auth/login/route');

const CITY_ID = 'city_dhaka_north';
const PASSWORD = 'cityfix123';

interface SeedUser {
  id: string;
  role: 'citizen' | 'dispatcher' | 'crew' | 'admin';
  name: string;
  phone: string;
  wardId: string | null;
  departmentId: string | null;
}

const PERSONAS: SeedUser[] = [
  {
    id: 'user_citizen_rahim',
    role: 'citizen',
    name: 'Rahim',
    phone: '+8801711000000',
    wardId: 'ward_14',
    departmentId: null,
  },
  {
    id: 'user_dispatcher_habib',
    role: 'dispatcher',
    name: 'Habib',
    phone: '+8801711000001',
    wardId: 'ward_14',
    departmentId: 'dept_streetlight',
  },
  {
    id: 'user_crew_rashid',
    role: 'crew',
    name: 'Rashid',
    phone: '+8801711000002',
    wardId: 'ward_14',
    departmentId: 'dept_streetlight',
  },
  {
    id: 'user_admin_anwar',
    role: 'admin',
    name: 'Anwar',
    phone: '+8801711000003',
    wardId: null,
    departmentId: null,
  },
];

async function seedUsers(): Promise<void> {
  const passwordHash = await hashPassword(PASSWORD);
  for (const p of PERSONAS) {
    getStore().users.set(p.id, {
      id: p.id,
      cityId: CITY_ID,
      role: p.role,
      phone: p.phone,
      nid: '1234567890',
      name: p.name,
      email: null,
      passwordHash,
      wardId: p.wardId,
      departmentId: p.departmentId,
      languageOverride: null,
      webAuthnCredentials: null,
      webAuthnChallenge: null,
    } as never);
  }
}

function makeRequest(body: unknown) {
  return new Request('http://localhost:3000/api/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

beforeEach(async () => {
  resetStore();
  resetLoginAttempts();
  cookieJar.clear();
  await seedUsers();
});

describe('POST /api/v1/auth/login — every role can sign in', () => {
  it.each(PERSONAS.map((p) => [p.role, p] as const))(
    'mints a session for the %s account',
    async (_role, persona) => {
      const res = await POST(makeRequest({ phone: persona.phone, password: PASSWORD }));
      expect(res.status).toBe(200);

      const body = (await res.json()) as { ok: boolean; userId: string; role: string };
      expect(body.ok).toBe(true);
      expect(body.userId).toBe(persona.id);
      // The role travels back so the client can route to the right
      // home surface (citizen → /home, dispatcher → /dispatcher, ...).
      expect(body.role).toBe(persona.role);
    },
  );

  it.each(PERSONAS.map((p) => [p.role, p] as const))(
    'creates a Session row for the %s account',
    async (_role, persona) => {
      await POST(makeRequest({ phone: persona.phone, password: PASSWORD }));

      const sessions = [...getStore().sessions.values()];
      expect(sessions).toHaveLength(1);
      expect(sessions[0].userId).toBe(persona.id);
      expect(sessions[0].cityId).toBe(CITY_ID);
    },
  );
});

describe('POST /api/v1/auth/login — session scope binding', () => {
  it('binds a dispatcher session to their ward and department', async () => {
    await POST(
      makeRequest({ phone: '+8801711000001', password: PASSWORD }),
    );
    const session = [...getStore().sessions.values()][0];
    expect(session.wardId).toBe('ward_14');
    expect(session.departmentId).toBe('dept_streetlight');
  });

  it('binds a crew session to their ward and department', async () => {
    await POST(
      makeRequest({ phone: '+8801711000002', password: PASSWORD }),
    );
    const session = [...getStore().sessions.values()][0];
    expect(session.wardId).toBe('ward_14');
    expect(session.departmentId).toBe('dept_streetlight');
  });

  it('binds a citizen session to their own ward but no department', async () => {
    // The citizen's ward is their registered home ward. The report
    // flow reads it from `/api/report/bootstrap` to file the ticket
    // under the right ward, so dropping it at login made every
    // password-logged-in citizen's report land in the bootstrap
    // fallback ward ("first ward by number") instead of their own —
    // which put the ticket outside the dispatcher/crew scope that
    // could actually pick it up.
    //
    // The department stays null: a citizen is not on a department's
    // roster.
    await POST(
      makeRequest({ phone: '+8801711000000', password: PASSWORD }),
    );
    const session = [...getStore().sessions.values()][0];
    expect(session.wardId).toBe('ward_14');
    expect(session.departmentId).toBeNull();
  });

  it('binds an admin session to no ward or department scope (city-wide)', async () => {
    await POST(
      makeRequest({ phone: '+8801711000003', password: PASSWORD }),
    );
    const session = [...getStore().sessions.values()][0];
    expect(session.wardId).toBeNull();
    expect(session.departmentId).toBeNull();
  });
});

describe('POST /api/v1/auth/login — rejections stay vague', () => {
  it.each(PERSONAS.map((p) => [p.role, p] as const))(
    'rejects a wrong password for the %s account',
    async (_role, persona) => {
      const res = await POST(
        makeRequest({ phone: persona.phone, password: 'wrongpassword1' }),
      );
      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe('wrong_credentials');
    },
  );

  it('returns the SAME error code for an unknown phone', async () => {
    // A wrong phone and a wrong password must be indistinguishable,
    // so an attacker cannot enumerate registered numbers.
    const unknown = await POST(
      makeRequest({ phone: '+8801799999999', password: PASSWORD }),
    );
    const wrongPassword = await POST(
      makeRequest({ phone: '+8801711000000', password: 'wrongpassword1' }),
    );
    expect(unknown.status).toBe(401);
    expect(wrongPassword.status).toBe(401);
    expect((await unknown.json()).error).toBe('wrong_credentials');
    expect((await wrongPassword.json()).error).toBe('wrong_credentials');
  });

  it('does not mint a session for a rejected login', async () => {
    await POST(
      makeRequest({ phone: '+8801711000001', password: 'wrongpassword1' }),
    );
    expect(getStore().sessions.size).toBe(0);
  });
});

describe('POST /api/v1/auth/login — lockout after repeated failures', () => {
  it('locks the IP after 5 consecutive failures, then returns 423', async () => {
    // The route's in-process counter: 5 failures within the 10-minute
    // window locks the IP for 10 minutes. The counter lives in
    // lib/auth/login-lockout.ts and is reset in `beforeEach`, so this
    // assertion is independent of the other tests in the file.
    const statuses: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      const res = await POST(
        makeRequest({ phone: '+8801711000000', password: 'wrongpassword1' }),
      );
      statuses.push(res.status);
    }
    // The first failures are 401; once the threshold is crossed the
    // route answers 423 `locked` and stays locked.
    expect(statuses[0]).toBe(401);
    expect(statuses).toContain(423);
    expect(statuses[statuses.length - 1]).toBe(423);
  });

  it('clears the failure count after a successful login', async () => {
    // A legitimate user who mistypes once must not be one typo away
    // from a lockout, so a success clears the counter.
    for (let i = 0; i < 4; i += 1) {
      await POST(
        makeRequest({ phone: '+8801711000000', password: 'wrongpassword1' }),
      );
    }
    const ok = await POST(
      makeRequest({ phone: '+8801711000000', password: PASSWORD }),
    );
    expect(ok.status).toBe(200);

    // The counter is cleared, so four more failures do NOT lock.
    const statuses: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const res = await POST(
        makeRequest({ phone: '+8801711000000', password: 'wrongpassword1' }),
      );
      statuses.push(res.status);
    }
    expect(statuses.every((s) => s === 401)).toBe(true);
  });
});
