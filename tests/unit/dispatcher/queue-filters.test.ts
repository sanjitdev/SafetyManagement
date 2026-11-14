/**
 * Vitest: `GET /api/v1/dispatcher/queue` — the status and ward
 * filters, and the SLA the row carries.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 *
 * Wave 4 / bolt 009-005 closed three gaps in this endpoint, and
 * none of them was visible from the client:
 *
 *   1. The `status` enum accepted only `submitted | routed`, so
 *      a filter rail offering "in progress" would have been
 *      answered with a 400 — a rail that lies. The enum now
 *      covers all four states the model has.
 *
 *   2. There was no `ward` parameter at all, and Zod silently
 *      STRIPS an unknown key — so a `ward=` sent here was
 *      ignored in silence. The parameter is now accepted, and it
 *      is intersected with the session's ward: it can narrow,
 *      never widen.
 *
 *   3. The `SlaPolicy` row was seeded and read by NOTHING, so
 *      the dispatcher could not tell a ticket that needed a crew
 *      today from one that did not. The queue now resolves the
 *      SLA per ticket.
 *
 * Each of those is a silent failure — a 400, a stripped key, a
 * missing field — so none of them would show up in a screenshot.
 * They are asserted here by driving the real route handler
 * against the dev store: the contract under test IS the route's
 * behaviour, so mocking it away would defeat the purpose.
 *
 * BACKEND-AGNOSTIC
 * ----------------
 *
 * The assertions here are about the SHAPE and the BOUNDARY, not
 * about seed counts. A real-Postgres run seeds a different number
 * of wards and tickets, so every count is derived from the
 * response rather than asserted as a constant.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { resetStore, getStore } from '@/lib/dev-store';

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

const { GET } = await import('@/app/api/v1/dispatcher/queue/route');

/**
 * The seeded dispatcher persona — `user_dispatcher_habib`, bound to
 * `(city_dhaka_north, ward_14, dept_streetlight)`.
 */
async function loginAsDispatcher(): Promise<void> {
  const { devMintSession } = await import('@/lib/dev-session');
  const { cookieValue } = await devMintSession('dispatcher');
  cookieJar.set('cityfix_session', cookieValue);
}

interface QueueBody {
  tickets: Array<{
    id: string;
    status: string;
    wardId: string;
    categoryId: string;
    slaTargetHours: number | null;
    slaRemainingHours: number | null;
    slaStartedAt: string | null;
    slaDueAt: string | null;
    slaTone: string | null;
  }>;
  pendingDedupCount: number;
  wards: Array<{ id: string; number: number; name: string | null }>;
  wardScoped: boolean;
  error?: string;
}

async function getQueue(
  query = '',
): Promise<{ status: number; body: QueueBody }> {
  const res = await GET(
    new NextRequest(
      `http://localhost:3000/api/v1/dispatcher/queue${query}`,
    ),
  );
  return { status: res.status, body: (await res.json()) as QueueBody };
}

beforeEach(() => {
  resetStore();
  cookieJar.clear();
});

describe('GET /api/v1/dispatcher/queue — the status filter', () => {
  it('returns only the requested status', async () => {
    await loginAsDispatcher();

    const { status, body } = await getQueue('?status=in_progress');
    expect(status).toBe(200);
    expect(body.tickets.length).toBeGreaterThan(0);
    for (const ticket of body.tickets) {
      expect(ticket.status).toBe('in_progress');
    }
  });

  it('accepts all four ticket states', async () => {
    await loginAsDispatcher();

    // A rail that offers a state the endpoint rejects with a 400
    // is a rail that lies. Every state the model has must be
    // accepted.
    for (const wanted of [
      'submitted',
      'routed',
      'in_progress',
      'resolved',
    ]) {
      const { status } = await getQueue(`?status=${wanted}`);
      expect(status, `status=${wanted} must be accepted`).toBe(200);
    }
  });

  it('rejects a status the ticket model does not have', async () => {
    await loginAsDispatcher();

    const { status, body } = await getQueue('?status=closed');
    expect(status).toBe(400);
    expect(body.error).toBe('invalid_query');
  });

  it('defaults to submitted + routed, unchanged from before', async () => {
    await loginAsDispatcher();

    const { body } = await getQueue();
    const statuses = new Set(body.tickets.map((t) => t.status));
    // The default is UNCHANGED — every existing caller sees the
    // same rows it saw before the enum was widened.
    expect(statuses.has('in_progress')).toBe(false);
    expect(statuses.has('resolved')).toBe(false);
  });
});

describe('GET /api/v1/dispatcher/queue — the ward filter', () => {
  it('accepts a ward parameter without a 400', async () => {
    await loginAsDispatcher();

    // Before Wave 4 there was no `ward` key in the schema, and
    // Zod silently strips unknown keys — so this was ignored, not
    // rejected. The rail could not be driven from this endpoint.
    const { status } = await getQueue('?ward=ward_14');
    expect(status).toBe(200);
  });

  it('never widens the session scope', async () => {
    await loginAsDispatcher();

    // The dispatcher is bound to ward_14. Asking for another ward
    // must not return that ward's tickets.
    const { body } = await getQueue('?ward=ward_15');
    for (const ticket of body.tickets) {
      expect(ticket.wardId).toBe('ward_14');
    }
  });

  it('returns an EMPTY queue for a ward the dispatcher does not hold', async () => {
    await loginAsDispatcher();

    // The request and the session are two conditions that must
    // BOTH hold, and a ticket can only be in one ward. Asking for
    // ward_15 therefore yields nothing — not the dispatcher's own
    // ward.
    //
    // The empty result is deliberate. Returning ward_14 would be
    // friendlier, but the endpoint would then be answering a
    // question the caller did not ask.
    const { body } = await getQueue('?ward=ward_15');
    expect(body.tickets).toHaveLength(0);
  });

  it('returns the dispatcher own ward when THAT ward is requested', async () => {
    await loginAsDispatcher();

    const { body } = await getQueue('?ward=ward_14');
    expect(body.tickets.length).toBeGreaterThan(0);
    expect(
      body.tickets.every((ticket) => ticket.wardId === 'ward_14'),
    ).toBe(true);
  });

  it('reports the reachable wards, and whether the scope is ward-bound', async () => {
    await loginAsDispatcher();

    const { body } = await getQueue();
    expect(body.wardScoped).toBe(true);
    // A ward-bound dispatcher reaches exactly one ward. Listing
    // more would be a rail full of rows that select zero tickets.
    expect(body.wards.length).toBe(1);
    expect(body.wards[0].id).toBe('ward_14');
  });

  it('reads the ward list from the store, not from a constant', async () => {
    await loginAsDispatcher();

    const { body } = await getQueue();
    const seededWardIds = [...getStore().wards.keys()].sort();
    // The dev store seeds 2 wards and real Postgres seeds 50, so
    // the reachable set is derived from the store and the route
    // narrows it to what the session can reach.
    expect(seededWardIds.length).toBeGreaterThan(body.wards.length);
    for (const ward of body.wards) {
      expect(seededWardIds).toContain(ward.id);
    }
  });
});

describe('GET /api/v1/dispatcher/queue — the SLA read path', () => {
  it('carries the target, the remaining time and the tone', async () => {
    await loginAsDispatcher();

    const { body } = await getQueue();
    const withTarget = body.tickets.filter((t) => t.slaTargetHours !== null);
    expect(withTarget.length).toBeGreaterThan(0);
    for (const ticket of withTarget) {
      expect(ticket.slaTargetHours).toBeGreaterThan(0);
      expect(ticket.slaTone).not.toBeNull();
    }
  });

  it('carries NO tone for a category with no policy', async () => {
    await loginAsDispatcher();

    const { body } = await getQueue();
    const withoutTarget = body.tickets.filter(
      (t) => t.slaTargetHours === null,
    );
    // The "Other" category has no policy in the seed, so a ticket
    // in it must report "no target" — never "on track".
    for (const ticket of withoutTarget) {
      expect(ticket.slaTone).toBeNull();
    }
  });

  it('starts the clock at the routed transition', async () => {
    await loginAsDispatcher();

    const { body } = await getQueue('?status=routed');
    expect(body.tickets.length).toBeGreaterThan(0);
    for (const ticket of body.tickets) {
      expect(ticket.slaStartedAt).not.toBeNull();
      expect(ticket.slaDueAt).not.toBeNull();
    }
  });

  it('reports no remaining time for a ticket that was never routed', async () => {
    await loginAsDispatcher();

    const { body } = await getQueue('?status=submitted');
    expect(body.tickets.length).toBeGreaterThan(0);
    for (const ticket of body.tickets) {
      // The clock has not started: the target is still owed, and
      // the remaining time is unknown rather than "0".
      expect(ticket.slaStartedAt).toBeNull();
      expect(ticket.slaRemainingHours).toBeNull();
      expect(ticket.slaTone).toBe('not_started');
    }
  });

  it('resolves the target from the category policy', async () => {
    await loginAsDispatcher();

    const { body } = await getQueue();
    const byCategory = new Map(
      body.tickets.map((ticket) => [ticket.categoryId, ticket.slaTargetHours]),
    );
    // The policy is per CATEGORY, so two tickets in the same
    // category must report the same target.
    for (const [categoryId, target] of byCategory) {
      const sameCategory = body.tickets.filter(
        (t) => t.categoryId === categoryId,
      );
      for (const ticket of sameCategory) {
        expect(ticket.slaTargetHours).toBe(target);
      }
    }
  });
});
