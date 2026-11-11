/**
 * Unit tests for the dispatcher assign-crew service
 * (lib/dispatcher/assign-crew.ts).
 *
 * Bolt 007-002 (Intent 007 — Citizen Resolution Visibility):
 * the dispatcher crew picker. The endpoint is the load-bearing
 * trust boundary — the picker UI is a hint, not the source of
 * truth. This test pins the contract:
 *
 *   - happy-path: dispatcher assigns a crew in the same ward
 *     and department; the ticket is updated; one audit row
 *     `ticket.assign_crew` is written with
 *     `{ assignedCrewId: prev | next }` in before / after.
 *   - clear via null: dispatcher clears an existing assignment;
 *     the ticket is updated; one audit row
 *     `ticket.unassign_crew` is written.
 *   - same-value no-op: a save click that doesn't change
 *     `assignedCrewId` returns the unchanged ticket and writes
 *     no audit row.
 *   - cross-ward reject: a dispatcher cannot assign a crew
 *     member from a different ward, even with a valid session.
 *   - non-crew user reject: a dispatcher cannot promote a
 *     citizen / dispatcher / admin to crew via this endpoint.
 *   - non-existent user: assigning to a userId that does not
 *     exist returns `not_found` (404).
 *   - out-of-scope ticket: a cross-ward ticket returns
 *     `not_found` (404, not 403 — to prevent probing).
 *   - audit row shape: entityType='ticket', actorId matches
 *     session.userId, before / after carry the right prev/next.
 *
 * Runs against the real in-memory dev store (the platform layer's
 * test seam). No mocks: the service goes through `db`,
 * `getTicketWithTrail`, and `writeAudit` end-to-end.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { ApiError } from '@/lib/auth/guards';
import type { SessionContext } from '@/lib/auth/session';
import {
  devDb,
  resetStore,
  DEV_CITIZEN_ID,
  getTicketWithTrail,
  DEV_CREW_ID,
} from '@/lib/dev-store';
import { assignCrew } from '@/lib/dispatcher/assign-crew';

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

/** A ticket created in (city_dhaka_north, ward_14, dept_streetlight). */
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

beforeEach(() => {
  resetStore();
});

describe('assignCrew — happy paths', () => {
  it('assigns a crew member in the same ward: ticket updates, audit row written', async () => {
    const ticket = seedTicketInScope();
    const dispatcher = mkDispatcher();

    const result = await assignCrew(
      ticket.id,
      { assignedCrewId: DEV_CREW_ID },
      dispatcher,
    );

    expect(result.changed).toBe(true);
    expect(result.auditAction).toBe('ticket.assign_crew');
    expect(result.ticket.assignedCrewId).toBe(DEV_CREW_ID);

    // Ticket is updated in the store.
    const stored = devDb.ticket.findUnique({ where: { id: ticket.id } });
    expect(stored!.assignedCrewId).toBe(DEV_CREW_ID);

    // One audit row was written, action ticket.assign_crew.
    const rows = devDb.audit.findMany({
      where: { entityType: 'ticket', action: 'ticket.assign_crew' },
    });
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.entityId).toBe(ticket.id);
    expect(row.actorId).toBe(dispatcher.userId);
    expect(row.beforeValue).toEqual({ assignedCrewId: null });
    expect(row.afterValue).toEqual({ assignedCrewId: DEV_CREW_ID });
  });

  it('clears the assignment when assignedCrewId is null: audit row is ticket.unassign_crew', async () => {
    // Seed a ticket that already has an assigned crew.
    const ticket = seedTicketInScope();
    await devDb.ticket.update({
      where: { id: ticket.id },
      data: { assignedCrewId: DEV_CREW_ID },
    });
    const dispatcher = mkDispatcher();

    const result = await assignCrew(
      ticket.id,
      { assignedCrewId: null },
      dispatcher,
    );

    expect(result.changed).toBe(true);
    expect(result.auditAction).toBe('ticket.unassign_crew');
    expect(result.ticket.assignedCrewId).toBeNull();

    const stored = devDb.ticket.findUnique({ where: { id: ticket.id } });
    expect(stored!.assignedCrewId).toBeNull();

    const unassignRows = devDb.audit.findMany({
      where: { entityType: 'ticket', action: 'ticket.unassign_crew' },
    });
    expect(unassignRows).toHaveLength(1);
    expect(unassignRows[0].beforeValue).toEqual({
      assignedCrewId: DEV_CREW_ID,
    });
    expect(unassignRows[0].afterValue).toEqual({ assignedCrewId: null });

    // No ticket.assign_crew row from this call (only the original
    // assign_crew if it had been called earlier).
    const assignRows = devDb.audit.findMany({
      where: { entityType: 'ticket', action: 'ticket.assign_crew' },
    });
    expect(assignRows).toHaveLength(0);
  });

  it('returns the unchanged ticket and writes no audit row on same-value no-op (assign → assign same)', async () => {
    // Seed a ticket that already has the same crew assigned.
    const ticket = seedTicketInScope();
    await devDb.ticket.update({
      where: { id: ticket.id },
      data: { assignedCrewId: DEV_CREW_ID },
    });
    const dispatcher = mkDispatcher();

    const result = await assignCrew(
      ticket.id,
      { assignedCrewId: DEV_CREW_ID },
      dispatcher,
    );

    expect(result.changed).toBe(false);
    expect(result.auditAction).toBeNull();
    expect(result.ticket.assignedCrewId).toBe(DEV_CREW_ID);

    const rows = devDb.audit.findMany({
      where: { entityType: 'ticket' },
    });
    expect(rows).toHaveLength(0);
  });

  it('returns the unchanged ticket and writes no audit row on same-value no-op (null → null)', async () => {
    const ticket = seedTicketInScope();
    const dispatcher = mkDispatcher();

    const result = await assignCrew(
      ticket.id,
      { assignedCrewId: null },
      dispatcher,
    );

    expect(result.changed).toBe(false);
    expect(result.auditAction).toBeNull();
    expect(result.ticket.assignedCrewId).toBeNull();

    const rows = devDb.audit.findMany({
      where: { entityType: 'ticket' },
    });
    expect(rows).toHaveLength(0);
  });
});

describe('assignCrew — rejections', () => {
  it('rejects assigning a crew from a different ward with cross_ward_access_denied (403)', async () => {
    const ticket = seedTicketInScope();
    const dispatcher = mkDispatcher();

    // user_crew_jamal lives in ward_other (a different ward).
    let caught: unknown;
    try {
      await assignCrew(
        ticket.id,
        { assignedCrewId: 'user_crew_jamal' },
        dispatcher,
      );
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(403);
    expect((caught as ApiError).code).toBe('cross_ward_access_denied');

    // The ticket is unchanged and no audit row was written.
    const stored = devDb.ticket.findUnique({ where: { id: ticket.id } });
    expect(stored!.assignedCrewId).toBeNull();
    const rows = devDb.audit.findMany({ where: { entityType: 'ticket' } });
    expect(rows).toHaveLength(0);
  });

  it('rejects assigning a non-crew user (citizen) with forbidden_role (403)', async () => {
    const ticket = seedTicketInScope();
    const dispatcher = mkDispatcher();

    // DEV_CITIZEN_ID is a citizen, not a crew member.
    let caught: unknown;
    try {
      await assignCrew(
        ticket.id,
        { assignedCrewId: DEV_CITIZEN_ID },
        dispatcher,
      );
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(403);
    expect((caught as ApiError).code).toBe('forbidden_role');

    const stored = devDb.ticket.findUnique({ where: { id: ticket.id } });
    expect(stored!.assignedCrewId).toBeNull();
  });

  it('rejects assigning a non-existent user with not_found (404)', async () => {
    const ticket = seedTicketInScope();
    const dispatcher = mkDispatcher();

    let caught: unknown;
    try {
      await assignCrew(
        ticket.id,
        { assignedCrewId: 'user_does_not_exist' },
        dispatcher,
      );
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(404);
    expect((caught as ApiError).code).toBe('not_found');
  });

  it('rejects an out-of-scope ticket (different ward) with not_found (404, not 403)', async () => {
    // Seed a ticket in a different ward than the dispatcher's session.
    const otherWardTicket = devDb.ticket.create({
      data: {
        cityId: 'city_dhaka_north',
        wardId: 'ward_other',
        categoryId: 'cat_streetlight',
        reporterId: DEV_CITIZEN_ID,
        status: 'submitted',
        locationLat: 23.789,
        locationLng: 90.4075,
        locationLabel: 'Other',
        locationLabelBn: 'অন্য',
        note: null,
        assignedCrewId: null,
        internalNote: null,
      },
    });
    const dispatcher = mkDispatcher({ wardId: 'ward_14' });

    let caught: unknown;
    try {
      await assignCrew(
        otherWardTicket.id,
        { assignedCrewId: DEV_CREW_ID },
        dispatcher,
      );
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ApiError);
    // 404 (not 403) so a dispatcher cannot probe ticket existence
    // outside their scope.
    expect((caught as ApiError).status).toBe(404);
    expect((caught as ApiError).code).toBe('not_found');
  });

  it('rejects an out-of-scope ticket (different city) with not_found (404, not 403)', async () => {
    const otherCityTicket = devDb.ticket.create({
      data: {
        cityId: 'city_chittagong',
        wardId: 'ward_14',
        categoryId: 'cat_streetlight',
        reporterId: DEV_CITIZEN_ID,
        status: 'submitted',
        locationLat: 22.33,
        locationLng: 91.81,
        locationLabel: 'CTG',
        locationLabelBn: 'চট্টগ্রাম',
        note: null,
        assignedCrewId: null,
        internalNote: null,
      },
    });
    const dispatcher = mkDispatcher({ cityId: 'city_dhaka_north' });

    let caught: unknown;
    try {
      await assignCrew(
        otherCityTicket.id,
        { assignedCrewId: DEV_CREW_ID },
        dispatcher,
      );
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(404);
    expect((caught as ApiError).code).toBe('not_found');
  });

  it('rejects a missing ticket id with not_found (404)', async () => {
    const dispatcher = mkDispatcher();
    let caught: unknown;
    try {
      await assignCrew(
        'tkt_does_not_exist',
        { assignedCrewId: DEV_CREW_ID },
        dispatcher,
      );
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(404);
    expect((caught as ApiError).code).toBe('not_found');
  });
});

describe('assignCrew — audit row shape', () => {
  it('audit row carries the previous assignedCrewId in beforeValue and the new one in afterValue', async () => {
    const ticket = seedTicketInScope();
    const dispatcher = mkDispatcher();

    // DEV_CREW_ID (Rashid) is bound to `dept_streetlight`, the same
    // department as the ticket's category. Assigning a crew member
    // from a DIFFERENT department is refused — see the
    // "department scope" block below.
    await assignCrew(
      ticket.id,
      { assignedCrewId: DEV_CREW_ID },
      dispatcher,
    );

    const rows = devDb.audit.findMany({
      where: { entityType: 'ticket', action: 'ticket.assign_crew' },
    });
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.actorId).toBe(dispatcher.userId);
    expect(row.entityType).toBe('ticket');
    expect(row.entityId).toBe(ticket.id);
    expect(row.beforeValue).toEqual({ assignedCrewId: null });
    expect(row.afterValue).toEqual({ assignedCrewId: DEV_CREW_ID });
  });

  it('reassign from one crew to another writes two audit rows with prev/next', async () => {
    const ticket = seedTicketInScope();
    const dispatcher = mkDispatcher();

    await assignCrew(
      ticket.id,
      { assignedCrewId: DEV_CREW_ID },
      dispatcher,
    );
    // Reassign to a different crew member in the SAME department.
    // `user_crew_karim` is bound to `dept_roads`, so he cannot be
    // given a streetlight ticket; `user_crew_jamal` is the waste
    // crew in another ward, so he cannot be given one either. A
    // synthetic same-department crew member stands in for the
    // "different crew" case.
    const sameDeptCrew = 'user_crew_jamal_alt';
    const rashid = devDb.user.findUnique({ where: { id: DEV_CREW_ID } })!;
    devDb.user.create({
      data: {
        id: sameDeptCrew,
        cityId: rashid.cityId,
        role: 'crew',
        phone: '+8801711000099',
        nid: '9234567890',
        name: 'Jamal Alt',
        passwordHash: rashid.passwordHash!,
        wardId: 'ward_14',
        departmentId: 'dept_streetlight',
      },
    });
    await assignCrew(
      ticket.id,
      { assignedCrewId: sameDeptCrew },
      dispatcher,
    );

    const rows = devDb.audit.findMany({
      where: { entityType: 'ticket', action: 'ticket.assign_crew' },
    });
    expect(rows).toHaveLength(2);

    // The dev-store `audit.findMany` sort is by ISO-string
    // timestamp and is not stable for ties (both calls land in
    // the same millisecond), so look up rows by their (before,
    // after) shape rather than relying on index order.
    const firstAssign = rows.find(
      (r) =>
        r.beforeValue?.assignedCrewId === null &&
        r.afterValue?.assignedCrewId === DEV_CREW_ID,
    );
    expect(firstAssign).toBeDefined();
    expect(firstAssign!.actorId).toBe(dispatcher.userId);

    const reassign = rows.find(
      (r) =>
        r.beforeValue?.assignedCrewId === DEV_CREW_ID &&
        r.afterValue?.assignedCrewId === sameDeptCrew,
    );
    expect(reassign).toBeDefined();
    expect(reassign!.actorId).toBe(dispatcher.userId);
  });
});

describe('assignCrew — department scope', () => {
  // A crew member's department decides which tickets they can SEE:
  // `GET /api/v1/crew/tickets` filters on the ticket's category
  // department matching the CREW MEMBER's department. Assigning a
  // streetlight ticket to a roads-drainage crew member therefore
  // produced an assignment that vanished from that member's list —
  // the dispatcher believed the work was assigned and nobody could
  // see it. The picker used to offer every crew in the ward, so this
  // was reachable through the UI.
  it('refuses a crew member from a different department', async () => {
    const ticket = seedTicketInScope(); // cat_streetlight → dept_streetlight
    const dispatcher = mkDispatcher();

    let caught: unknown;
    try {
      await assignCrew(
        ticket.id,
        { assignedCrewId: 'user_crew_karim' }, // dept_roads
        dispatcher,
      );
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(403);
    expect((caught as ApiError).code).toBe('cross_department_access_denied');
  });

  it('leaves the ticket unassigned after a refused cross-department assignment', async () => {
    const ticket = seedTicketInScope();
    const dispatcher = mkDispatcher();

    await assignCrew(
      ticket.id,
      { assignedCrewId: 'user_crew_karim' },
      dispatcher,
    ).catch(() => undefined);

    const refreshed = await getTicketWithTrail(ticket.id);
    expect(refreshed?.assignedCrewId).toBeNull();
  });
});

describe('assignCrew — round-trips through getTicketWithTrail', () => {
  it('returns a refreshed ticket with the new assignedCrewId visible via getTicketWithTrail', async () => {
    const ticket = seedTicketInScope();
    const dispatcher = mkDispatcher();

    const result = await assignCrew(
      ticket.id,
      { assignedCrewId: DEV_CREW_ID },
      dispatcher,
    );

    expect(result.ticket.assignedCrewId).toBe(DEV_CREW_ID);
    // getTicketWithTrail reads through the same backend and should
    // show the same value.
    const fromStore = getTicketWithTrail(ticket.id);
    expect(fromStore!.assignedCrewId).toBe(DEV_CREW_ID);
  });
});

describe('assignCrew — capacity', () => {
  // The UX spec (`2.4-assign-to-crew.md`) designs a load limit that
  // was never implemented: the crew card shows "current load" badged
  // red above 5, the list sorts by load, and a 409 comes back when
  // "crew just took another job". This block pins the enforcement.
  //
  // Rashid (DEV_CREW_ID) holds FOUR active tickets in the seed, so
  // one more assignment takes him to exactly the limit of 5.

  it('allows an assignment that brings a crew member TO the limit', async () => {
    const ticket = seedTicketInScope();
    const dispatcher = mkDispatcher();

    // Rashid is at 4; this makes it 5, which is allowed.
    const result = await assignCrew(
      ticket.id,
      { assignedCrewId: DEV_CREW_ID },
      dispatcher,
    );
    expect(result.changed).toBe(true);
    expect(result.ticket.assignedCrewId).toBe(DEV_CREW_ID);
  });

  it('refuses an assignment that would take a crew member OVER the limit (409 crew_at_capacity)', async () => {
    // Take Rashid to 5 first.
    const first = seedTicketInScope();
    await assignCrew(
      first.id,
      { assignedCrewId: DEV_CREW_ID },
      mkDispatcher(),
    );

    // This would be the sixth.
    const second = seedTicketInScope();
    let caught: unknown;
    try {
      await assignCrew(
        second.id,
        { assignedCrewId: DEV_CREW_ID },
        mkDispatcher(),
      );
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(409);
    expect((caught as ApiError).code).toBe('crew_at_capacity');
  });

  it('leaves the ticket unassigned and writes no audit row after a capacity refusal', async () => {
    const first = seedTicketInScope();
    await assignCrew(
      first.id,
      { assignedCrewId: DEV_CREW_ID },
      mkDispatcher(),
    );
    const auditAfterFirst = devDb.audit.findMany({
      where: { entityType: 'ticket' },
    }).length;

    const second = seedTicketInScope();
    await assignCrew(
      second.id,
      { assignedCrewId: DEV_CREW_ID },
      mkDispatcher(),
    ).catch(() => undefined);

    const stored = devDb.ticket.findUnique({ where: { id: second.id } });
    expect(stored!.assignedCrewId).toBeNull();
    // The refusal wrote no audit row — the same discipline the
    // concurrent-write rejection follows.
    expect(
      devDb.audit.findMany({ where: { entityType: 'ticket' } }).length,
    ).toBe(auditAfterFirst);
  });

  it('does not count a ticket the member already holds against them', async () => {
    // Rashid holds four active tickets, one of which is
    // `ticket_seed_inprogress_1`. Re-assigning THAT ticket to him
    // changes nothing, and it must not be refused for capacity —
    // the ticket being assigned is excluded from the count.
    const dispatcher = mkDispatcher();
    const result = await assignCrew(
      'ticket_seed_inprogress_1',
      { assignedCrewId: DEV_CREW_ID },
      dispatcher,
    );
    expect(result.changed).toBe(false);
    expect(result.auditAction).toBeNull();
  });

  it('frees capacity when a ticket becomes terminal', async () => {
    // Rashid holds four. Take him to five, then resolve one of his
    // tickets — that ticket leaves the load, so he is assignable
    // again.
    const ticket = seedTicketInScope();
    await assignCrew(
      ticket.id,
      { assignedCrewId: DEV_CREW_ID },
      mkDispatcher(),
    );

    await devDb.ticket.update({
      where: { id: 'ticket_seed_crew_routed_2' },
      data: { status: 'resolved' },
    });

    const second = seedTicketInScope();
    const result = await assignCrew(
      second.id,
      { assignedCrewId: DEV_CREW_ID },
      mkDispatcher(),
    );
    expect(result.changed).toBe(true);
  });
});
