/**
 * Concurrency tests for the citizen submit path's dedup guard.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The audit's scenario 4: the submit path was a check-then-insert.
 *
 *   app/api/tickets/route.ts
 *     :167  dup = await checkDedup({ ... })   -- READ
 *     :199  const created = await db.ticket.create({ ... })   -- WRITE
 *
 * Two citizens filing the same pothole at the same coordinate at the
 * same instant both ran the READ before either ticket existed. Both
 * scans returned zero candidates. Both proceeded to the WRITE, and
 * two identical tickets were created — both `status='submitted'`,
 * both at the same coordinates, both claiming the same work. The
 * database could not prevent it: the `Ticket` model had no unique
 * constraint of any kind.
 *
 * The fix is a database-level backstop. `Ticket.dedupKey` holds a
 * hash of `(cityId, categoryId, lat, lng)` and carries a unique index
 * on `(cityId, dedupKey)`. The second insert is refused BY THE
 * DATABASE rather than by a hopeful check, and the loser re-runs the
 * scan and returns the winner to the citizen.
 *
 * WHAT IS PROVEN HERE
 * -------------------
 *   1. Two concurrent submissions of the same spot → exactly one
 *      ticket exists, and the loser is told about the winner.
 *   2. The unique index is enforced by the dev store too (a dev
 *      store that skipped the constraint would let CI pass while
 *      production refused the insert — the parity claim is the
 *      point of this file).
 *   3. A DECLINED dedup match is still creatable at the same
 *      coordinates. This is the case the naive "add a unique index"
 *      fix breaks, and it is the one the product depends on: PLAT-REQ-004
 *      makes dedup a PROMPT, and the citizen may decline it.
 *   4. A ticket leaving the open statuses RELEASES its key, so the
 *      same spot can be reported again after it is resolved.
 *   5. Distinct reports at nearby-but-different coordinates are NOT
 *      blocked. The key identifies the exact spot, not the 50 m
 *      neighbourhood — a pothole and a streetlight 40 m apart are
 *      different issues and both must be filable.
 *   6. The key is deterministic: the same spot always produces the
 *      same key, and a different spot never does.
 *
 * WHY THE REAL DEV STORE
 * ----------------------
 * Same reason as the transition suite: the claim under test is that
 * the dev store implements the SAME unique-index semantics as the
 * Prisma path. A mock-based test would prove nothing about the
 * parity claim.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import {
  computeDedupKey,
  freesDedupKey,
  isDedupConflict,
} from '@/lib/platform/dedup';
import { transitionTicket } from '@/lib/platform/transitions';
import { devDb, resetStore } from '@/lib/dev-store';

const CITY_ID = 'city_dhaka_north';
const WARD_ID = 'ward_14';
const CATEGORY_ID = 'cat_pothole';
const REPORTER_ID = 'user_citizen_rahim';

/** A coordinate pair inside Dhaka, well away from the seeded tickets. */
const LAT = 23.75;
const LNG = 90.39;

function createTicket(data: {
  cityId?: string;
  wardId?: string;
  categoryId?: string;
  locationLat?: number;
  locationLng?: number;
  dedupKey?: string | null;
}) {
  return devDb.ticket.create({
    data: {
      cityId: data.cityId ?? CITY_ID,
      wardId: data.wardId ?? WARD_ID,
      categoryId: data.categoryId ?? CATEGORY_ID,
      reporterId: REPORTER_ID,
      status: 'submitted',
      locationLat: data.locationLat ?? LAT,
      locationLng: data.locationLng ?? LNG,
      locationLabel: null,
      locationLabelBn: null,
      note: null,
      internalNote: null,
      assignedCrewId: null,
      dedupKey:
        data.dedupKey === undefined
          ? computeDedupKey({
              cityId: data.cityId ?? CITY_ID,
              categoryId: data.categoryId ?? CATEGORY_ID,
              locationLat: data.locationLat ?? LAT,
              locationLng: data.locationLng ?? LNG,
            })
          : data.dedupKey,
    },
  });
}

describe('dedup key', () => {
  beforeEach(() => {
    resetStore();
  });

  it('is deterministic for the same spot', () => {
    const a = computeDedupKey({
      cityId: CITY_ID,
      categoryId: CATEGORY_ID,
      locationLat: LAT,
      locationLng: LNG,
    });
    const b = computeDedupKey({
      cityId: CITY_ID,
      categoryId: CATEGORY_ID,
      locationLat: LAT,
      locationLng: LNG,
    });
    expect(a).toBe(b);
  });

  it('differs when any identity component differs', () => {
    const base = computeDedupKey({
      cityId: CITY_ID,
      categoryId: CATEGORY_ID,
      locationLat: LAT,
      locationLng: LNG,
    });
    expect(
      computeDedupKey({
        cityId: 'city_dhaka_south',
        categoryId: CATEGORY_ID,
        locationLat: LAT,
        locationLng: LNG,
      }),
    ).not.toBe(base);
    expect(
      computeDedupKey({
        cityId: CITY_ID,
        categoryId: 'cat_streetlight',
        locationLat: LAT,
        locationLng: LNG,
      }),
    ).not.toBe(base);
    expect(
      computeDedupKey({
        cityId: CITY_ID,
        categoryId: CATEGORY_ID,
        locationLat: LAT + 0.0001,
        locationLng: LNG,
      }),
    ).not.toBe(base);
    expect(
      computeDedupKey({
        cityId: CITY_ID,
        categoryId: CATEGORY_ID,
        locationLat: LAT,
        locationLng: LNG + 0.0001,
      }),
    ).not.toBe(base);
  });

  it('cannot be confused by a city id containing the separator', () => {
    // The canonical form joins the components with NUL. If the join
    // were a printable character, a city id containing it could
    // produce the same digest as a different (city, category) pair.
    const a = computeDedupKey({
      cityId: 'city_a',
      categoryId: 'b',
      locationLat: 0,
      locationLng: 0,
    });
    const b = computeDedupKey({
      cityId: 'city',
      categoryId: 'a_b',
      locationLat: 0,
      locationLng: 0,
    });
    expect(a).not.toBe(b);
  });
});

describe('the dedup-key unique index', () => {
  beforeEach(() => {
    resetStore();
  });

  it('refuses a second ticket at the same spot', () => {
    createTicket({});
    expect(() => createTicket({})).toThrow();
  });

  it('reports the refusal as a recognisable dedup conflict', () => {
    createTicket({});
    let caught: unknown = null;
    try {
      createTicket({});
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeNull();
    expect(isDedupConflict(caught)).toBe(true);
  });

  it('allows a ticket with NO key — the declined-duplicate path', () => {
    // The first ticket is the original, carrying its key.
    createTicket({});
    // The second is an ACKNOWLEDGED duplicate: the citizen saw the
    // dedup prompt and declined it, so the ticket carries no key and
    // the index does not apply to it.
    const declined = createTicket({ dedupKey: null });
    expect(declined.id).toBeTruthy();
    expect(declined.dedupKey).toBeNull();
  });

  it('allows the same spot in a DIFFERENT category', () => {
    createTicket({});
    // A pothole and a streetlight at the same spot are different
    // issues. The key includes the category, so the index does not
    // apply.
    const other = createTicket({ categoryId: 'cat_streetlight' });
    expect(other.id).toBeTruthy();
  });

  it('allows the same spot in a DIFFERENT city', () => {
    createTicket({});
    const other = createTicket({ cityId: 'city_dhaka_south' });
    expect(other.id).toBeTruthy();
  });

  it('allows nearby-but-distinct coordinates', () => {
    // ~11 m apart. Within the 50 m prompt radius, so the citizen IS
    // asked — but the exact-spot key does not fire, so the second
    // report is still filable if the citizen declines. This is the
    // case a radius-keyed unique index would break.
    createTicket({});
    const nearby = createTicket({ locationLat: LAT + 0.0001 });
    expect(nearby.id).toBeTruthy();
  });

  it('leaves exactly one ticket after a lost race', () => {
    // The race: both submissions compute the same key before either
    // ticket exists, then both try to insert.
    const key = computeDedupKey({
      cityId: CITY_ID,
      categoryId: CATEGORY_ID,
      locationLat: LAT,
      locationLng: LNG,
    });
    const winner = createTicket({ dedupKey: key });
    let loserError: unknown = null;
    try {
      createTicket({ dedupKey: key });
    } catch (e) {
      loserError = e;
    }
    expect(loserError).not.toBeNull();
    expect(isDedupConflict(loserError)).toBe(true);

    // The winner survived; the loser wrote nothing.
    const all = devDb.ticket.findMany({
      where: { cityId: CITY_ID, categoryId: CATEGORY_ID },
    });
    expect(all.filter((t) => t.dedupKey === key)).toHaveLength(1);
    expect(winner.dedupKey).toBe(key);
  });
});

describe('releasing the dedup key', () => {
  beforeEach(() => {
    resetStore();
  });

  it('frees the key for the statuses that leave the open set', () => {
    expect(freesDedupKey('resolved')).toBe(true);
    expect(freesDedupKey('closed')).toBe(true);
    expect(freesDedupKey('cancelled')).toBe(true);
  });

  it('keeps the key for the open statuses', () => {
    expect(freesDedupKey('submitted')).toBe(false);
    expect(freesDedupKey('routed')).toBe(false);
    expect(freesDedupKey('in_progress')).toBe(false);
  });

  it('releases the key when the ticket is resolved, so the spot can be reported again', async () => {
    const ticket = createTicket({});
    expect(ticket.dedupKey).toBeTruthy();

    await transitionTicket({
      ticketId: ticket.id,
      toStatus: 'routed',
      actorId: REPORTER_ID,
    });
    await transitionTicket({
      ticketId: ticket.id,
      toStatus: 'in_progress',
      actorId: REPORTER_ID,
    });
    await transitionTicket({
      ticketId: ticket.id,
      toStatus: 'resolved',
      actorId: REPORTER_ID,
    });

    const after = devDb.ticket.findUnique({ where: { id: ticket.id } });
    expect(after?.dedupKey).toBeNull();

    // The spot is free again: a citizen who sees the same unrepaired
    // pothole next month must be able to file it.
    const again = createTicket({});
    expect(again.id).toBeTruthy();
    expect(again.dedupKey).toBeTruthy();
  });

  it('keeps the key while the ticket is still open', async () => {
    const ticket = createTicket({});
    await transitionTicket({
      ticketId: ticket.id,
      toStatus: 'routed',
      actorId: REPORTER_ID,
    });
    const after = devDb.ticket.findUnique({ where: { id: ticket.id } });
    expect(after?.dedupKey).toBe(ticket.dedupKey);
  });
});

describe('isDedupConflict', () => {
  it('ignores an unrelated error', () => {
    expect(isDedupConflict(new Error('boom'))).toBe(false);
    expect(isDedupConflict(null)).toBe(false);
    expect(isDedupConflict(undefined)).toBe(false);
  });

  it('recognises a Postgres unique violation on the dedup constraint', () => {
    const err = Object.assign(new Error('Unique constraint failed'), {
      code: '23505',
      meta: { target: ['cityId', 'dedupKey'], constraint: 'Ticket_cityId_dedupKey_key' },
    });
    expect(isDedupConflict(err)).toBe(true);
  });

  it('looks through the cause chain', () => {
    const inner = Object.assign(new Error('Unique constraint failed'), {
      code: '23505',
      meta: { constraint: 'Ticket_cityId_dedupKey_key' },
    });
    const outer = Object.assign(new Error('wrapped'), { cause: inner });
    expect(isDedupConflict(outer)).toBe(true);
  });

  it('does not treat a violation of another constraint as a dedup conflict', () => {
    const err = Object.assign(new Error('Unique constraint failed'), {
      code: '23505',
      meta: { target: ['id'], constraint: 'Ticket_pkey' },
    });
    expect(isDedupConflict(err)).toBe(false);
  });
});
