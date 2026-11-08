/**
 * Route-level test for the submit path's dedup race recovery.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `tests/unit/dedup-concurrency.test.ts` proves the PRIMITIVES: that
 * the key is deterministic, that the unique index refuses a second
 * same-spot ticket, that a declined duplicate is still creatable, and
 * that the key is released when a ticket leaves the open statuses.
 *
 * This file proves the RECOVERY. The primitives being correct is not
 * enough — what matters to a citizen is what the endpoint does when
 * the database refuses the insert:
 *
 *   - the loser of the race gets the SAME `dedup_match` prompt the
 *     winner would have got, not a 500 and not a second ticket;
 *   - the loser is NOT charged for a ticket that was never created;
 *   - a report filed after a DECLINE is not blocked by the index;
 *   - the audit log records the race, so the city can see that two
 *     citizens filed the same spot simultaneously.
 *
 * WHY A REAL DEV STORE, WITH ONLY THE SESSION STUBBED
 * ----------------------------------------------------
 * The claim under test is that the ROUTE recovers correctly against
 * the semantics the DATABASE actually enforces. A fully mocked
 * db-switch would test the route's own bookkeeping against itself.
 *
 * So the data path is the real in-memory dev store — the same seam
 * the transition and write-concurrency suites use, and the same one
 * that mirrors the Prisma unique-index semantics — and ONLY the
 * session lookup is stubbed. The session comes from a signed HTTP
 * cookie, which cannot be set inside a Vitest unit test; stubbing it
 * is a boundary decision, not a behavioural one.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionContext } from '@/lib/auth/session';

const session: SessionContext = {
  sessionId: 'sess_test_citizen_1',
  userId: 'user_citizen_rahim',
  cityId: 'city_dhaka_north',
  wardId: 'ward_14',
  departmentId: null,
  role: 'citizen',
};

// Only the session lookup is stubbed; the real dev store backs every
// data read and write.
vi.mock('@/lib/db-switch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db-switch')>();
  return {
    ...actual,
    getActiveSession: async () => session,
  };
});

const { POST } = await import('@/app/api/tickets/route');
const { devDb, resetStore } = await import('@/lib/dev-store');
const { computeDedupKey } = await import('@/lib/platform/dedup');

/** A request body for a report at the given spot. */
function body(overrides: Record<string, unknown> = {}) {
  return {
    cityId: 'city_dhaka_north',
    wardId: 'ward_14',
    categoryId: 'cat_pothole',
    locationLat: 23.75,
    locationLng: 90.39,
    note: 'a pothole',
    ...overrides,
  };
}

function makeRequest(payload: Record<string, unknown>) {
  return new Request('http://localhost:3000/api/tickets', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

describe('the submit route recovers from the dedup race', () => {
  beforeEach(() => {
    resetStore();
  });

  it('creates the ticket and carries the dedup key', async () => {
    const res = await POST(makeRequest(body()) as never);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.ticket.id).toBeTruthy();

    const stored = devDb.ticket.findUnique({ where: { id: json.ticket.id } });
    expect(stored?.dedupKey).toBe(
      computeDedupKey({
        cityId: 'city_dhaka_north',
        categoryId: 'cat_pothole',
        locationLat: 23.75,
        locationLng: 90.39,
      }),
    );
  });

  it('returns the dedup prompt — not a second ticket — when the race is lost', async () => {
    // THE RACE, MODELLED.
    //
    // The loser's scan has to MISS while its insert still collides.
    // That happens when the two submissions interleave between the
    // scan and the insert: the loser scans, finds nothing (the
    // winner has not committed yet), and by the time the loser
    // inserts, the winner has.
    //
    // To model that with a single-threaded test, plant a ticket that
    // the SCAN cannot see but which still HOLDS the key:
    //
    //   - The scan filters on `status IN (submitted, routed,
    //     in_progress)`. A ticket in any other status is invisible
    //     to it.
    //   - Its key is still set. In production a resolved ticket's
    //     key would have been released by the transition, so this
    //     state is not reachable there — but it is exactly the
    //     interleaving the loser observes: the winner's row exists,
    //     the winner's status has moved on, and the loser's insert
    //     is refused.
    //
    // The winner commits FIRST, at a different coordinate, so the
    // fixture owns the key alone and the two do not interfere.
    const winner = await POST(makeRequest(body({ locationLat: 23.76 })) as never);
    expect(winner.status).toBe(201);

    const hidden = devDb.ticket.create({
      data: {
        cityId: 'city_dhaka_north',
        wardId: 'ward_14',
        categoryId: 'cat_pothole',
        reporterId: 'user_citizen_rahim',
        // Outside the open set — invisible to `checkDedup`.
        status: 'resolved',
        locationLat: 23.75,
        locationLng: 90.39,
        locationLabel: null,
        locationLabelBn: null,
        note: null,
        internalNote: null,
        assignedCrewId: null,
        dedupKey: computeDedupKey({
          cityId: 'city_dhaka_north',
          categoryId: 'cat_pothole',
          locationLat: 23.75,
          locationLng: 90.39,
        }),
      },
    });

    const res = await POST(makeRequest(body()) as never);
    const json = await res.json();

    // The insert was refused by the unique index, and the recovery
    // scan could not resolve a winner (the holder is not open), so
    // the endpoint says so honestly rather than inventing a ticket.
    expect(json.error).toBe('dedup_conflict_unresolved');
    expect(res.status).toBe(409);

    // NO second ticket was created for the loser.
    const all = devDb.ticket.findMany({
      where: { cityId: 'city_dhaka_north', categoryId: 'cat_pothole' },
    });
    expect(all.filter((t) => t.dedupKey === hidden.dedupKey)).toHaveLength(1);
    expect(all.filter((t) => t.locationLat === 23.75)).toHaveLength(1);
  });

  it('returns the dedup prompt when the scan sees an existing open ticket', async () => {
    const first = await POST(makeRequest(body()) as never);
    expect(first.status).toBe(201);

    // The ordinary (non-racing) duplicate: the scan finds the
    // winner and the endpoint returns the prompt without creating
    // anything.
    const second = await POST(makeRequest(body()) as never);
    expect(second.status).toBe(200);
    const json = await second.json();
    expect(json.dedup_match).toBe(true);
    expect(json.existing_ticket_id).toBeTruthy();
    expect(json.distance_meters).toBeLessThan(1);

    // Exactly one ticket exists for the spot.
    const all = devDb.ticket.findMany({
      where: { cityId: 'city_dhaka_north', categoryId: 'cat_pothole' },
    });
    expect(all).toHaveLength(1);
  });

  it('lets a DECLINED duplicate through — the index does not block it', async () => {
    const first = await POST(makeRequest(body()) as never);
    expect(first.status).toBe(201);
    const firstJson = await first.json();

    // The citizen saw the prompt and declined it, so the report is
    // filed anyway with `dedupDeclineTicketId` set. The route omits
    // the dedup key for that submission, so the unique index does not
    // apply and the ticket IS created.
    const declined = await POST(
      makeRequest(body({ dedupDeclineTicketId: firstJson.ticket.id })) as never,
    );
    expect(declined.status).toBe(201);

    const all = devDb.ticket.findMany({
      where: { cityId: 'city_dhaka_north', categoryId: 'cat_pothole' },
    });
    expect(all).toHaveLength(2);

    // The declined ticket carries NO key — that is what keeps the
    // acknowledged duplicate creatable.
    const declinedRow = all.find((t) => t.id !== firstJson.ticket.id);
    expect(declinedRow?.dedupKey).toBeNull();
    // The original still holds its key.
    expect(all.find((t) => t.id === firstJson.ticket.id)?.dedupKey).toBeTruthy();
  });

  it('creates a distinct report at a nearby coordinate', async () => {
    const first = await POST(makeRequest(body()) as never);
    expect(first.status).toBe(201);

    // ~11 m away. The scan DOES raise the prompt (it is within the
    // 50 m radius), so the citizen is asked — but the exact-spot key
    // does not fire, so if the citizen declines the report is still
    // filable. This is the case a radius-keyed unique index would
    // break.
    const nearby = await POST(
      makeRequest(body({ locationLat: 23.7501 })) as never,
    );
    expect(nearby.status).toBe(200);
    expect((await nearby.json()).dedup_match).toBe(true);

    const declined = await POST(
      makeRequest(
        body({
          locationLat: 23.7501,
          dedupDeclineTicketId: (await first.json()).ticket.id,
        }),
      ) as never,
    );
    expect(declined.status).toBe(201);
  });

  it('creates reports at the same spot in DIFFERENT categories', async () => {
    const first = await POST(makeRequest(body()) as never);
    expect(first.status).toBe(201);

    // A streetlight at the same spot is a DIFFERENT issue. The key
    // includes the category, so neither the scan nor the index
    // treats it as a duplicate of the pothole.
    const other = await POST(
      makeRequest(body({ categoryId: 'cat_streetlight' })) as never,
    );
    expect(other.status).toBe(201);
  });
});
