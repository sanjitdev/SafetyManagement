/**
 * Vitest: `POST /api/v1/dispatcher/tickets/[id]/priority` — the
 * dispatcher's triage write.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 *
 * The service (`lib/dispatcher/set-priority.ts`) is tested in
 * `set-priority.test.ts`. This file drives the ROUTE, because the
 * route carries three things the service does not:
 *
 *   1. The role gate. A citizen must not be able to triage.
 *   2. The input validation. An unknown band must be a 400, not a
 *      silently-ignored value.
 *   3. The error mapping. A conflict must be a 409 with
 *      `concurrent_write`; a closed ticket a 409 with
 *      `ticket_not_open`; an out-of-scope ticket a 404.
 *
 * These are all SILENT failures if they are wrong — a 500 instead
 * of a 409 still "fails", but the client cannot tell a conflict
 * from a bug, so it cannot offer the dispatcher "reload and try
 * again".
 *
 * The route handler is driven directly against the dev store: the
 * contract under test IS the route's behaviour, so mocking it away
 * would defeat the purpose.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { resetStore, devDb } from '@/lib/dev-store';

/**
 * `next/headers` `cookies()` is a Next.js server-only API that is
 * not available in the Vitest (node) environment. The route reads
 * the session cookie through it, so we stub it with a jar the
 * test controls.
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

const { POST } = await import(
  '@/app/api/v1/dispatcher/tickets/[id]/priority/route'
);

async function loginAs(role: 'dispatcher' | 'citizen'): Promise<void> {
  const { devMintSession } = await import('@/lib/dev-session');
  const { cookieValue } = await devMintSession(role);
  cookieJar.set('cityfix_session', cookieValue);
}

/** A ticket in the dispatcher's scope (ward_14, streetlight). */
function seedTicketInScope(overrides: Record<string, unknown> = {}) {
  return devDb.ticket.create({
    data: {
      cityId: 'city_dhaka_north',
      wardId: 'ward_14',
      categoryId: 'cat_streetlight',
      reporterId: 'user_citizen_rahim',
      status: 'submitted',
      locationLat: 23.789,
      locationLng: 90.4075,
      locationLabel: 'Mirpur',
      locationLabelBn: 'মিরপুর',
      note: null,
      assignedCrewId: null,
      internalNote: null,
      ...overrides,
    },
  });
}

async function post(
  id: string,
  body: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await POST(
    new NextRequest(
      `http://localhost:3000/api/v1/dispatcher/tickets/${id}/priority`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    ),
    { params: Promise.resolve({ id }) },
  );
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

beforeEach(() => {
  resetStore();
  cookieJar.clear();
});

describe('POST /api/v1/dispatcher/tickets/[id]/priority — the happy path', () => {
  it('sets the band and reports whether anything changed', async () => {
    await loginAs('dispatcher');
    const ticket = seedTicketInScope();

    const { status, json } = await post(ticket.id, { priority: 'urgent' });

    expect(status).toBe(200);
    expect(json.changed).toBe(true);
    const ticket_ = json.ticket as { priority: string; prioritySetAt: string };
    expect(ticket_.priority).toBe('urgent');
    expect(ticket_.prioritySetAt).not.toBeNull();
  });

  it('reports changed=false for a no-op', async () => {
    await loginAs('dispatcher');
    const ticket = seedTicketInScope();

    await post(ticket.id, { priority: 'high' });
    const { json } = await post(ticket.id, { priority: 'high' });

    expect(json.changed).toBe(false);
  });
});

describe('POST /api/v1/dispatcher/tickets/[id]/priority — the role gate', () => {
  it('refuses a citizen', async () => {
    await loginAs('citizen');
    const ticket = seedTicketInScope();

    const { status, json } = await post(ticket.id, { priority: 'urgent' });

    expect(status).toBe(403);
    expect(json.error).toBeDefined();
  });

  it('refuses an unauthenticated caller', async () => {
    const ticket = seedTicketInScope();

    const { status } = await post(ticket.id, { priority: 'urgent' });

    expect(status).toBe(401);
  });
});

describe('POST /api/v1/dispatcher/tickets/[id]/priority — validation', () => {
  it('rejects a band the scale does not have', async () => {
    await loginAs('dispatcher');
    const ticket = seedTicketInScope();

    const { status, json } = await post(ticket.id, { priority: 'catastrophic' });

    expect(status).toBe(400);
    expect(json.error).toBe('invalid_input');
  });

  it('rejects a missing band', async () => {
    await loginAs('dispatcher');
    const ticket = seedTicketInScope();

    const { status, json } = await post(ticket.id, {});

    expect(status).toBe(400);
    expect(json.error).toBe('invalid_input');
  });

  it('rejects a body that is not JSON', async () => {
    await loginAs('dispatcher');
    const ticket = seedTicketInScope();

    const res = await POST(
      new NextRequest(
        `http://localhost:3000/api/v1/dispatcher/tickets/${ticket.id}/priority`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'not json' },
      ),
      { params: Promise.resolve({ id: ticket.id }) },
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_json');
  });
});

describe('POST /api/v1/dispatcher/tickets/[id]/priority — the error mapping', () => {
  it('answers 404 for a ticket outside the dispatcher scope', async () => {
    await loginAs('dispatcher');
    const ticket = seedTicketInScope({ wardId: 'ward_15' });

    const { status, json } = await post(ticket.id, { priority: 'urgent' });

    // 404, not 403 — a 403 would confirm the ticket EXISTS.
    expect(status).toBe(404);
    expect(json.error).toBe('not_found');
  });

  it('answers 404 for a ticket that does not exist', async () => {
    await loginAs('dispatcher');

    const { status, json } = await post('tkt_nope', { priority: 'urgent' });

    expect(status).toBe(404);
    expect(json.error).toBe('not_found');
  });

  it('answers 409 with ticket_not_open for a closed ticket', async () => {
    await loginAs('dispatcher');
    const ticket = seedTicketInScope({ status: 'resolved' });

    const { status, json } = await post(ticket.id, { priority: 'urgent' });

    expect(status).toBe(409);
    expect(json.error).toBe('ticket_not_open');
  });

  it('answers 409 with concurrent_write when the CAS loses', async () => {
    await loginAs('dispatcher');
    const ticket = seedTicketInScope();

    // Two triages at once: the loser must report the conflict so
    // the client can re-read and re-apply, rather than seeing a
    // 500 it cannot interpret.
    const results = await Promise.all([
      post(ticket.id, { priority: 'urgent' }),
      post(ticket.id, { priority: 'low' }),
    ]);

    const conflicts = results.filter((r) => r.status === 409);
    const wins = results.filter((r) => r.status === 200);
    expect(wins).toHaveLength(1);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].json.error).toBe('concurrent_write');
    expect(conflicts[0].json.ticket_id).toBe(ticket.id);
    expect(conflicts[0].json.field).toBe('priority');
  });
});
