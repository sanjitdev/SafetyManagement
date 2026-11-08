/**
 * Vitest: `POST /api/tickets/:id/transition` — ADR-007 WebAuthn gate.
 *
 * ADR-007 ("admin write paths require WebAuthn") is enforced by
 * `requireWebAuthn` (lib/auth/guards.ts). Every write under
 * `/api/v1/admin/*` calls it — 16 handlers, zero gaps. But the
 * SHARED transition route (`app/api/tickets/[id]/transition/route.ts`)
 * is ALSO an admin write path, and it sat outside that tree:
 *
 *   - the pure-reassign branch (`{ assignedCrewId }` with no
 *     `toStatus`) is admin-only and writes `assignedCrewId`
 *     directly onto the ticket row;
 *   - the admin branch of `ALLOWED_BY_ROLE` can move a ticket
 *     through ANY status.
 *
 * The route's own header even said "admin writes still require
 * WebAuthn in v1.1" — a deferral that was never closed. The admin
 * UI (`app/admin/tickets/[id]/page.tsx`) POSTs both shapes to this
 * route, so a stolen admin session cookie was enough to reassign
 * crew and move tickets without a hardware-key assertion.
 *
 * This file pins the fixed behaviour:
 *
 *   1. An admin transition with NO registered WebAuthn credential
 *      → 401 `webauthn_required`. The ticket is NOT modified.
 *   2. An admin pure-reassign with no credential → 401
 *      `webauthn_required`. The assignment is NOT written.
 *   3. An admin write WITH a credential but NO fresh challenge →
 *      401 `webauthn_assertion_expired`.
 *   4. A dispatcher transition → 200. Dispatcher writes are NOT
 *      admin writes, so they are not WebAuthn-gated.
 *   5. A crew transition → 200, for the same reason.
 *   6. The guard runs AFTER the ticket load, so a non-existent
 *      ticket still 404s rather than 401-ing on a ceremony the
 *      caller cannot complete.
 *
 * The route handler is exercised through its real dependency graph
 * (dev store + guards + transition engine) rather than by mocking
 * the db, because the contract under test IS "the guard is called
 * on the admin write path" — a mock would only re-assert the mock.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  resetStore,
  devDb,
  DEV_ADMIN_ID,
  DEV_CITIZEN_ID,
  DEV_DISPATCHER_ID,
  DEV_CREW_ID,
  DEV_CITY_ID,
  DEV_WARD_ID,
  type DevWebAuthnCredential,
} from '@/lib/dev-store';
import { devMintSession } from '@/lib/dev-session';
import { WEBAUTHN_CHALLENGE_TTL_MS } from '@/lib/auth/guards';

/**
 * `next/headers` `cookies()` is a Next.js server-only API that is
 * not available in the Vitest (node) environment. The route reads
 * the session cookie through it, so we stub it with a jar the test
 * controls. The cookie's CONTENTS are what this file asserts (they
 * carry the session id), so the jar must be a real Map.
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
 * Push fan-out is best-effort and irrelevant to this contract; the
 * route already `.catch(() => undefined)`s it, but stubbing it
 * keeps the suite free of the VAPID/env surface.
 */
vi.mock('@/lib/platform/push', () => ({
  sendTicketPush: vi.fn().mockResolvedValue(undefined),
}));

const { POST } = await import('@/app/api/tickets/[id]/transition/route');

/**
 * The seeded admin starts with `webAuthnCredentials: null`, so
 * `requireWebAuthn` throws `webauthn_required` for it out of the
 * box. `registerCredential` gives the admin a credential; a
 * challenge row is needed ON TOP of that (the guard checks both).
 */
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
): Promise<string> {
  const { cookieValue } = await devMintSession(role);
  cookieJar.set('cityfix_session', cookieValue);
  return cookieValue;
}

/**
 * Create a ticket the given role is actually allowed to act on.
 *
 * The dev store's seed does not contain a `submitted` ticket in the
 * streetlight department, so the dispatcher/crew cases build their
 * own. `cat_streetlight` maps to `dept_streetlight`, which is the
 * department the dispatcher and crew personas are scoped to —
 * `requireScope` compares the ticket's department against the
 * session's, so a ticket in `cat_other` (departmentId: null) is
 * correctly REJECTED for them.
 */
function createTicket(
  categoryId: string,
  wardId: string = DEV_WARD_ID,
  status: 'submitted' | 'routed' | 'in_progress' = 'submitted',
): string {
  return devDb.ticket.create({
    data: {
      cityId: DEV_CITY_ID,
      wardId,
      categoryId,
      reporterId: DEV_CITIZEN_ID,
      assignedCrewId: null,
      status,
      locationLng: 90.4,
      locationLat: 23.78,
      locationLabel: 'Test location',
      locationLabelBn: 'পরীক্ষার ঠিকানা',
      note: 'A ticket created by the transition WebAuthn suite.',
      internalNote: null,
    },
  }).id;
}

function makeRequest(body: unknown, id = 'ticket_seed_submitted_1') {
  return {
    req: new Request(`http://localhost:3000/api/tickets/${id}/transition`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }) as never,
    ctx: { params: Promise.resolve({ id }) },
  };
}

async function post(body: unknown, id = 'ticket_seed_submitted_1') {
  const { req, ctx } = makeRequest(body, id);
  return POST(req, ctx);
}

beforeEach(() => {
  resetStore();
  cookieJar.clear();
  delete process.env.DEV_SKIP_WEBAUTHN;
});

describe('POST /api/tickets/:id/transition — ADR-007 WebAuthn gate', () => {
  it('rejects an admin status transition with 401 webauthn_required', async () => {
    await loginAs('admin');
    // Sanity: the seeded admin has no credential yet.
    expect(
      devDb.user.findUnique({ where: { id: DEV_ADMIN_ID } })?.webAuthnCredentials,
    ).toBeNull();

    const res = await post({ toStatus: 'routed' });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('webauthn_required');
  });

  it('does NOT write the transition when the admin has no credential', async () => {
    await loginAs('admin');
    await post({ toStatus: 'routed' });

    const ticket = devDb.ticket.findUnique({
      where: { id: 'ticket_seed_submitted_1' },
    });
    expect(ticket?.status).toBe('submitted');
  });

  it('rejects an admin pure-reassign with 401 webauthn_required', async () => {
    await loginAs('admin');

    const res = await post({ assignedCrewId: DEV_CREW_ID });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('webauthn_required');
  });

  it('does NOT write the assignment when the admin has no credential', async () => {
    await loginAs('admin');
    await post({ assignedCrewId: DEV_CREW_ID });

    const ticket = devDb.ticket.findUnique({
      where: { id: 'ticket_seed_submitted_1' },
    });
    expect(ticket?.assignedCrewId).toBeNull();
  });

  it('rejects with 401 webauthn_assertion_expired when there is no fresh challenge', async () => {
    await loginAs('admin');
    registerCredential();
    // A credential but no challenge row — the admin has not
    // completed a ceremony, so the write must not go through.

    const res = await post({ toStatus: 'routed' });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('webauthn_assertion_expired');
  });

  it('rejects with 401 webauthn_assertion_expired when the challenge has expired', async () => {
    await loginAs('admin');
    registerCredential();
    // A challenge created 5 min + 1 s ago — past the TTL.
    registerFreshChallenge(DEV_ADMIN_ID, WEBAUTHN_CHALLENGE_TTL_MS + 1000);

    const res = await post({ toStatus: 'routed' });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('webauthn_assertion_expired');
  });

  it('allows an admin transition once a credential and a fresh challenge exist', async () => {
    await loginAs('admin');
    registerCredential();
    registerFreshChallenge();

    const res = await post({ toStatus: 'routed' });
    expect(res.status).toBe(200);

    const ticket = devDb.ticket.findUnique({
      where: { id: 'ticket_seed_submitted_1' },
    });
    expect(ticket?.status).toBe('routed');
  });

  it('allows an admin pure-reassign once a credential and a fresh challenge exist', async () => {
    await loginAs('admin');
    registerCredential();
    registerFreshChallenge();

    const res = await post({ assignedCrewId: DEV_CREW_ID });
    expect(res.status).toBe(200);

    const ticket = devDb.ticket.findUnique({
      where: { id: 'ticket_seed_submitted_1' },
    });
    expect(ticket?.assignedCrewId).toBe(DEV_CREW_ID);
  });
});

describe('POST /api/tickets/:id/transition — non-admin roles are not WebAuthn-gated', () => {
  it('allows a dispatcher transition (submitted → routed) without WebAuthn', async () => {
    await loginAs('dispatcher');
    // A ticket in the dispatcher's own department (streetlight) and
    // ward. The dispatcher has NO WebAuthn credential — the point
    // of the assertion is that a dispatcher write does not need one.
    const ticketId = createTicket('cat_streetlight');

    const res = await post({ toStatus: 'routed' }, ticketId);
    expect(res.status).toBe(200);

    const ticket = devDb.ticket.findUnique({ where: { id: ticketId } });
    expect(ticket?.status).toBe('routed');
  });

  it('allows a crew transition (routed → in_progress) without WebAuthn', async () => {
    await loginAs('crew');
    const ticketId = createTicket('cat_streetlight', DEV_WARD_ID, 'routed');

    const res = await post({ toStatus: 'in_progress' }, ticketId);
    expect(res.status).toBe(200);

    const ticket = devDb.ticket.findUnique({ where: { id: ticketId } });
    expect(ticket?.status).toBe('in_progress');
  });

  it('still rejects a citizen (the role gate fires first)', async () => {
    await loginAs('citizen');

    const res = await post({ toStatus: 'routed' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/tickets/:id/transition — guard ordering', () => {
  it('404s on a missing ticket before demanding a WebAuthn ceremony', async () => {
    await loginAs('admin');

    // No credential — but the ticket does not exist either. The
    // route must 404 rather than 401, so the caller learns the
    // ticket is gone instead of being asked for a ceremony that
    // cannot change anything.
    const res = await post({ toStatus: 'routed' }, 'ticket_does_not_exist');
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not_found');
  });

  it('keeps the city/ward scope checks ahead of the WebAuthn ceremony', async () => {
    // A dispatcher scoped to ward_14 may not touch another ward's
    // ticket. That check must fire BEFORE the WebAuthn gate, or
    // the dispatcher would get a WebAuthn error for a request they
    // were never allowed to make.
    await loginAs('dispatcher');

    // The dev store seeds every ticket in ward_14, so the
    // out-of-scope ticket is created here in `ward_other`.
    const otherId = createTicket('cat_streetlight', 'ward_other');

    const res = await post({ toStatus: 'routed' }, otherId);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).not.toBe('webauthn_required');
    expect(body.error).not.toBe('webauthn_assertion_expired');
  });

  it('rejects a dispatcher acting on a ticket outside their department', async () => {
    await loginAs('dispatcher');
    // `cat_other` has departmentId: null, which is outside the
    // dispatcher's `dept_streetlight` scope. The route must reject
    // it — the department check compares the ticket's category
    // department against the session's.
    const otherDeptId = createTicket('cat_other');

    const res = await post({ toStatus: 'routed' }, otherDeptId);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('cross_department_access_denied');
  });
});

describe('POST /api/tickets/:id/transition — dev-store shape sanity', () => {
  it('seeds the personas the suite depends on', () => {
    // If the dev store's seed IDs change, this suite silently
    // stops exercising the admin path. Pin them.
    expect(devDb.user.findUnique({ where: { id: DEV_ADMIN_ID } })?.role).toBe(
      'admin',
    );
    expect(
      devDb.user.findUnique({ where: { id: DEV_DISPATCHER_ID } })?.role,
    ).toBe('dispatcher');
    expect(devDb.user.findUnique({ where: { id: DEV_CREW_ID } })?.role).toBe(
      'crew',
    );
    expect(devDb.user.findUnique({ where: { id: DEV_CITIZEN_ID } })?.role).toBe(
      'citizen',
    );
  });

  it('keeps the admin unscoped and the dispatcher scoped to ward_14', () => {
    expect(
      devDb.user.findUnique({ where: { id: DEV_ADMIN_ID } })?.wardId,
    ).toBeNull();
    expect(
      devDb.user.findUnique({ where: { id: DEV_DISPATCHER_ID } })?.wardId,
    ).toBe(DEV_WARD_ID);
    expect(
      devDb.user.findUnique({ where: { id: DEV_DISPATCHER_ID } })?.cityId,
    ).toBe(DEV_CITY_ID);
  });
});
