/**
 * Unit tests for the crew capacity rule.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The concurrency audit's scenario 5 recorded that a crew member could
 * be assigned N tickets with nothing stopping it, and left the
 * question open: "if double-booking is a business rule, it exists
 * nowhere in the codebase. If it is not, the absence should be
 * recorded as a decision rather than left ambiguous."
 *
 * The rule DID exist — in the UX spec
 * (`design-artifacts/C-UX-Scenarios/02-habib-the-handler/
 * 2.4-assign-to-crew/2.4-assign-to-crew.md`), which designs a load
 * badge, a load sort and a 409 "crew just took another job". None of
 * it was implemented.
 *
 * So these tests pin the implemented behaviour:
 *
 *   - the load counts only ACTIVE tickets (terminal ones do not);
 *   - the limit is 5, and the boundary is exact (5 is allowed, 6 is
 *     not);
 *   - the ticket being assigned is excluded from its own member's
 *     count, so a re-assignment does not count the ticket twice;
 *   - the picker reports the same count the assign service enforces,
 *     so the hint and the trust boundary cannot disagree.
 *
 * WHY THE REAL DEV STORE
 * ----------------------
 * No mocks. The load count is a `findMany` over tickets filtered by
 * `assignedCrewId` and status, and the interesting cases are the
 * status-filter edge cases — a mock would assert the mock's filter,
 * not the store's.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { resetStore, devDb } from '@/lib/dev-store';
import {
  CREW_CAPACITY_LIMIT,
  checkCrewCapacity,
  countCrewActiveLoad,
  countCrewActiveLoads,
} from '@/lib/dispatcher/crew-capacity';
import { listCrewForWard } from '@/lib/dispatcher/list-crew-for-ward';

const CREW = 'user_crew_rashid';
const CREW2 = 'user_crew_karim';

/**
 * Create an active ticket assigned to `crewId`.
 *
 * The status defaults to `in_progress` — the state a crew member's
 * work is actually in. The dev store generates the ticket id.
 */
function makeActiveTicket(
  crewId: string,
  status: 'submitted' | 'routed' | 'in_progress' = 'in_progress',
) {
  return devDb.ticket.create({
    data: {
      cityId: 'city_dhaka_north',
      wardId: 'ward_14',
      categoryId: 'cat_streetlight',
      reporterId: 'user_citizen_rahim',
      assignedCrewId: crewId,
      status,
      locationLat: 23.75,
      locationLng: 90.39,
      locationLabel: null,
      locationLabelBn: null,
      note: null,
      internalNote: null,
      dedupKey: null,
    },
  });
}

describe('the crew capacity limit', () => {
  beforeEach(() => {
    resetStore();
  });

  it('is 5 — the UX spec badges red above 5, so 5 is the last unflagged load', () => {
    expect(CREW_CAPACITY_LIMIT).toBe(5);
  });

  it('counts only ACTIVE tickets — a resolved one is not load', async () => {
    // The seed gives Rashid FOUR active tickets (`ticket_seed_routed_1`
    // routed, `ticket_seed_inprogress_1` in_progress,
    // `ticket_seed_crew_routed_2` and `_3` routed) and THREE resolved
    // ones. Only the active four are load.
    expect(await countCrewActiveLoad(CREW)).toBe(4);
    // Karim holds only `ticket_seed_resolved_1`, which is resolved —
    // so he has no load at all.
    expect(await countCrewActiveLoad(CREW2)).toBe(0);
  });

  it('does not count a cancelled or closed ticket', async () => {
    const closed = makeActiveTicket(CREW, 'in_progress');
    const cancelled = makeActiveTicket(CREW, 'in_progress');

    await devDb.ticket.update({
      where: { id: closed.id },
      data: { status: 'closed' },
    });
    await devDb.ticket.update({
      where: { id: cancelled.id },
      data: { status: 'cancelled' },
    });

    // Both are gone from the load; only the seed's four remain.
    expect(await countCrewActiveLoad(CREW)).toBe(4);
  });

  it('counts a submitted ticket — assigned but not yet started is still work', async () => {
    const t = makeActiveTicket(CREW, 'submitted');
    expect(await countCrewActiveLoad(CREW)).toBe(5);
    expect(t.assignedCrewId).toBe(CREW);
  });

  it('excludes the ticket being assigned from its own member count', async () => {
    // Re-assigning a ticket Rashid ALREADY holds must not count that
    // ticket against him twice — otherwise a dispatcher re-assigning
    // an existing ticket would be told the member is busier than he
    // is, and at the boundary could be refused a re-assignment that
    // changes nothing.
    const before = await countCrewActiveLoad(CREW);
    expect(before).toBe(4);

    const excluding = await countCrewActiveLoad(
      CREW,
      'ticket_seed_inprogress_1',
    );
    expect(excluding).toBe(3);
  });

  it('reports the count and the limit, and agrees with the count', async () => {
    const check = await checkCrewCapacity(CREW);
    expect(check.activeCount).toBe(4);
    expect(check.limit).toBe(CREW_CAPACITY_LIMIT);
    expect(check.atCapacity).toBe(false);
  });

  it('marks a member at the limit as at capacity', async () => {
    // Rashid already holds 4. Add one more to reach exactly 5.
    makeActiveTicket(CREW);

    const check = await checkCrewCapacity(CREW);
    expect(check.activeCount).toBe(5);
    expect(check.limit).toBe(5);
    // 5 is AT capacity: the badge fires above 5, and the next
    // assignment is the sixth.
    expect(check.atCapacity).toBe(true);
  });

  it('does not mark a member just below the limit as at capacity', async () => {
    const check = await checkCrewCapacity(CREW);
    expect(check.activeCount).toBe(4);
    expect(check.atCapacity).toBe(false);
  });

  it('counts loads for several members in one pass', async () => {
    const loads = await countCrewActiveLoads([CREW, CREW2]);
    expect(loads.get(CREW)).toBe(4);
    expect(loads.get(CREW2)).toBe(0);
  });

  it('returns an empty map for an empty crew list', async () => {
    const loads = await countCrewActiveLoads([]);
    expect(loads.size).toBe(0);
  });
});

describe('the crew picker reports the same load the assign service enforces', () => {
  beforeEach(() => {
    resetStore();
  });

  it('reports the active count and the limit on each candidate', async () => {
    const rows = await listCrewForWard({
      cityId: 'city_dhaka_north',
      wardId: 'ward_14',
    });

    const rashid = rows.find((r) => r.id === CREW);
    const karim = rows.find((r) => r.id === CREW2);
    expect(rashid?.activeCount).toBe(4);
    expect(karim?.activeCount).toBe(0);
    for (const row of rows) {
      expect(row.capacityLimit).toBe(CREW_CAPACITY_LIMIT);
      expect(row.atCapacity).toBe(row.activeCount >= CREW_CAPACITY_LIMIT);
    }
  });

  it('sorts the least-loaded member first, per the UX spec', async () => {
    // Rashid holds 4; give Karim 1 so the load order and the name
    // order disagree — the load must win.
    makeActiveTicket(CREW2);
    const rows = await listCrewForWard({
      cityId: 'city_dhaka_north',
      wardId: 'ward_14',
    });

    expect(rows.map((r) => r.id)).toEqual([CREW2, CREW]);
    expect(rows[0].activeCount).toBe(1);
    expect(rows[1].activeCount).toBe(4);
  });

  it('breaks a load tie by name, so the order is stable', async () => {
    const rows = await listCrewForWard({
      cityId: 'city_dhaka_north',
      wardId: 'ward_14',
    });
    // Both hold 4? No — Karim holds 0 (his seed ticket is resolved)
    // and Rashid holds 4, so this is NOT a tie. Give Karim a matching
    // load to make the tie real, then the name decides.
    for (let i = 0; i < 4; i++) makeActiveTicket(CREW2);
    const tied = await listCrewForWard({
      cityId: 'city_dhaka_north',
      wardId: 'ward_14',
    });
    expect(tied[0].activeCount).toBe(4);
    expect(tied[1].activeCount).toBe(4);
    expect(tied.map((r) => r.name)).toEqual(['Karim', 'Rashid']);
    expect(rows.length).toBe(2);
  });

  it('flags a member at the limit as at capacity', async () => {
    makeActiveTicket(CREW);
    const rows = await listCrewForWard({
      cityId: 'city_dhaka_north',
      wardId: 'ward_14',
    });
    expect(rows.find((r) => r.id === CREW)?.atCapacity).toBe(true);
    expect(rows.find((r) => r.id === CREW2)?.atCapacity).toBe(false);
  });
});
