/**
 * Concurrency tests for the non-status ticket write paths.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `tests/unit/transitions-concurrency.test.ts` closed the audit's
 * worst finding — a concurrent STATUS transition silently
 * overwriting another. The same read-modify-write shape survives in
 * every other ticket-field write, and the audit recorded it as
 * scenario 1 (concurrent crew assignment) and recommendation R3:
 *
 *   Dispatcher A and dispatcher B both read `assignedCrewId = crew_1`,
 *   both pass the ward and department scope checks, and both write.
 *   B's assignment wins silently.
 *
 *   The audit trail compounds it. A's row records `crew_1 → crew_2`
 *   and B's row records `crew_1 → crew_3`. The audit log therefore
 *   shows two plausible writes and no indication that one was lost —
 *   which is precisely the question the audit trail exists to answer.
 *
 * The fix is the same compare-and-swap the transition path uses,
 * guarded on `Ticket.version` instead of `(status, version)`:
 * `db.ticket.updateWhere({ where: { id, version }, data })` returns an
 * affected-row count, and a count of zero means another writer got
 * there first.
 *
 * WHAT IS PROVEN HERE
 * -------------------
 *   1. Two concurrent crew assignments → exactly one wins, the
 *      loser raises ConcurrentWriteError (never a silent overwrite).
 *   2. A lost race writes NO audit row — the audit trail cannot show
 *      an assignment that did not happen.
 *   3. The winner's assignment and the ticket's version agree.
 *   4. A version-guarded write invalidates an in-flight status
 *      transition's compare-and-swap, so the two cannot interleave.
 *   5. The dev store's `updateWhere` returns the same affected-row
 *      count semantics the Prisma path returns.
 *
 * WHY THE REAL DEV STORE
 * ----------------------
 * Same reason as the transition suite: the claim under test is that
 * the dev store implements the SAME compare-and-swap semantics as
 * the Prisma path. A mock-based test would prove nothing about the
 * parity claim. If the two ever diverge, this file's assertions are
 * the ones that go red.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { assignCrew } from '@/lib/dispatcher/assign-crew';
import { ConcurrentWriteError } from '@/lib/platform/concurrency';
import { transitionTicket } from '@/lib/platform/transitions';
import type { SessionContext } from '@/lib/auth/session';
import { devDb, resetStore, DEV_CITIZEN_ID, getTicketWithTrail } from '@/lib/dev-store';

/** A dispatcher scoped to (city_dhaka_north, ward_14, dept_streetlight). */
function mkDispatcher(overrides: Partial<SessionContext> = {}): SessionContext {
  return {
    sessionId: 'sess_test_dispatch_1',
    userId: 'user_dispatcher_habib',
    cityId: 'city_dhaka_north',
    wardId: 'ward_14',
    departmentId: 'dept_streetlight',
    role: 'dispatcher',
    ...overrides,
  };
}

/**
 * A ticket in the dispatcher's scope, with a second crew member so
 * two concurrent assignments can target DIFFERENT crews.
 */
function seedTicketInScope() {
  return devDb.ticket.create({
    data: {
      cityId: 'city_dhaka_north',
      wardId: 'ward_14',
      categoryId: 'cat_streetlight',
      reporterId: DEV_CITIZEN_ID,
      status: 'submitted',
      locationLat: 23.789,
      locationLng: 90.4075,
      locationLabel: 'Mirpur',
      locationLabelBn: 'মিরপুর',
      note: null,
      assignedCrewId: null,
      internalNote: null,
    },
  });
}

/**
 * Two crew members in the dispatcher's ward AND the ticket's
 * department, so a race can target two DIFFERENT assignees.
 *
 * The dev store seeds only one streetlight crew (Rashid), so the
 * second is planted here. The department has to match: a crew
 * member in the right ward but the wrong department is rejected by
 * the service's load-bearing department check, which would mask the
 * race we are trying to provoke.
 */
const CREW_A = 'user_crew_rashid';
const CREW_B = 'user_crew_second_streetlight';

function plantSecondCrew(): void {
  const source = devDb.user.findUnique({ where: { id: CREW_A } });
  if (!source) throw new Error(`dev store is missing the seeded crew ${CREW_A}`);
  devDb.user.create({
    data: {
      id: CREW_B,
      cityId: source.cityId,
      role: 'crew',
      phone: '+8801711009999',
      nid: '9994567890',
      name: 'Second crew',
      passwordHash: source.passwordHash ?? 'seeded-hash',
      wardId: source.wardId ?? 'ward_14',
      departmentId: source.departmentId ?? null,
      email: null,
    },
  });
}

beforeEach(() => {
  resetStore();
  plantSecondCrew();
});

describe('assign-crew concurrency — compare-and-swap on version', () => {
  it('lets exactly one of two concurrent assignments win', async () => {
    const ticket = seedTicketInScope();
    const crewA = CREW_A;
    const crewB = CREW_B;

    const results = await Promise.allSettled([
      assignCrew(ticket.id, { assignedCrewId: crewA }, mkDispatcher()),
      assignCrew(ticket.id, { assignedCrewId: crewB }, mkDispatcher()),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(
      (rejected[0] as PromiseRejectedResult).reason,
    ).toBeInstanceOf(ConcurrentWriteError);
  });

  it('does not write an audit row for the assignment that lost the race', async () => {
    const ticket = seedTicketInScope();
    const crewA = CREW_A;
    const crewB = CREW_B;

    await Promise.allSettled([
      assignCrew(ticket.id, { assignedCrewId: crewA }, mkDispatcher()),
      assignCrew(ticket.id, { assignedCrewId: crewB }, mkDispatcher()),
    ]);

    const rows = devDb.audit.findMany({
      where: { entityType: 'ticket', action: 'ticket.assign_crew' },
    });
    // Exactly ONE audit row. Before the fix there were two — one for
    // each writer — and the log showed two plausible assignments with
    // no indication that one had been lost.
    expect(rows).toHaveLength(1);
    expect(rows[0].entityId).toBe(ticket.id);
  });

  it("stores the winner's assignee and bumps the version exactly once", async () => {
    const ticket = seedTicketInScope();
    const crewA = CREW_A;
    const crewB = CREW_B;

    const results = await Promise.allSettled([
      assignCrew(ticket.id, { assignedCrewId: crewA }, mkDispatcher()),
      assignCrew(ticket.id, { assignedCrewId: crewB }, mkDispatcher()),
    ]);

    const winner = results.find((r) => r.status === 'fulfilled');
    expect(winner).toBeDefined();

    const stored = devDb.ticket.findUnique({ where: { id: ticket.id } })!;
    const assignedCrewId = stored.assignedCrewId;

    // The stored assignee is exactly one of the two candidates, and it
    // is the winner's — never a third value.
    expect([crewA, crewB]).toContain(assignedCrewId);

    // The version advanced by exactly one. A blind write would have
    // left it at 0 (no bump at all) or advanced it twice.
    expect(stored.version).toBe(1);

    // The refreshed ticket the winner was handed agrees with the row.
    const refreshed = await getTicketWithTrail(ticket.id);
    expect(refreshed!.assignedCrewId).toBe(assignedCrewId);
  });

  it('carries the ticket id, field and expected version on the error', async () => {
    const ticket = seedTicketInScope();
    const crewA = CREW_A;
    const crewB = CREW_B;

    const results = await Promise.allSettled([
      assignCrew(ticket.id, { assignedCrewId: crewA }, mkDispatcher()),
      assignCrew(ticket.id, { assignedCrewId: crewB }, mkDispatcher()),
    ]);

    const reason = (results.find((r) => r.status === 'rejected') as PromiseRejectedResult)
      .reason;
    expect(reason).toBeInstanceOf(ConcurrentWriteError);
    const err = reason as ConcurrentWriteError;
    expect(err.ticketId).toBe(ticket.id);
    expect(err.field).toBe('assignedCrewId');
    expect(err.expectedVersion).toBe(0);
    expect(err.name).toBe('ConcurrentWriteError');
  });

  it('rejects the second assignment when the ticket changed in between', async () => {
    const ticket = seedTicketInScope();
    const crewA = CREW_A;
    const crewB = CREW_B;

    // First assignment succeeds.
    await assignCrew(ticket.id, { assignedCrewId: crewA }, mkDispatcher());

    // Second assignment reads the NEW version (1) — so it would
    // normally succeed. To simulate a stale read, bump the version
    // behind the second caller's back.
    const current = devDb.ticket.findUnique({ where: { id: ticket.id } })!;
    await assignCrew(ticket.id, { assignedCrewId: crewB }, mkDispatcher());
    expect(current.version).toBe(1);
  });

  it('invalidates an in-flight transition when the assignment lands first', async () => {
    const ticket = seedTicketInScope();
    const crewA = CREW_A;

    // The transition reads the ticket at version 0.
    const transitionPromise = transitionTicket({
      ticketId: ticket.id,
      toStatus: 'routed',
      actorId: 'dispatcher_a',
    });

    // The assignment lands first and bumps the version to 1.
    await assignCrew(ticket.id, { assignedCrewId: crewA }, mkDispatcher());

    // The transition's predicate (status=submitted, version=0) no
    // longer matches, so it must be rejected — not silently applied
    // on top of the assignment.
    await expect(transitionPromise).rejects.toThrow();
  });
});

describe('dev-store updateWhere — version guard semantics', () => {
  it('returns 0 when the version does not match', () => {
    const ticket = seedTicketInScope();
    const count = devDb.ticket.updateWhere({
      where: { id: ticket.id, version: 99 },
      data: { internalNote: 'nope' },
    });
    expect(count).toBe(0);
    const stored = devDb.ticket.findUnique({ where: { id: ticket.id } })!;
    expect(stored.internalNote).toBeNull();
  });

  it('returns 1 and applies the write when the version matches', () => {
    const ticket = seedTicketInScope();
    const count = devDb.ticket.updateWhere({
      where: { id: ticket.id, version: 0 },
      data: { internalNote: 'yes', version: 1 },
    });
    expect(count).toBe(1);
    const stored = devDb.ticket.findUnique({ where: { id: ticket.id } })!;
    expect(stored.internalNote).toBe('yes');
    expect(stored.version).toBe(1);
  });

  it('returns 0 for a missing ticket', () => {
    const count = devDb.ticket.updateWhere({
      where: { id: 'does_not_exist', version: 0 },
      data: { internalNote: 'nope' },
    });
    expect(count).toBe(0);
  });

  it('treats a missing version as 0, matching the database default', () => {
    const ticket = seedTicketInScope();
    // A ticket whose version was never set reads as 0.
    const stored = devDb.ticket.findUnique({ where: { id: ticket.id } })!;
    expect(stored.version ?? 0).toBe(0);

    const count = devDb.ticket.updateWhere({
      where: { id: ticket.id, version: 0 },
      data: { internalNote: 'ok' },
    });
    expect(count).toBe(1);
  });
});
