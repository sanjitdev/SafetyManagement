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

    await assignCrew(
      ticket.id,
      { assignedCrewId: 'user_crew_karim' },
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
    expect(row.afterValue).toEqual({ assignedCrewId: 'user_crew_karim' });
  });

  it('reassign from one crew to another writes two audit rows with prev/next', async () => {
    const ticket = seedTicketInScope();
    const dispatcher = mkDispatcher();

    await assignCrew(
      ticket.id,
      { assignedCrewId: DEV_CREW_ID },
      dispatcher,
    );
    await assignCrew(
      ticket.id,
      { assignedCrewId: 'user_crew_karim' },
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
        r.afterValue?.assignedCrewId === 'user_crew_karim',
    );
    expect(reassign).toBeDefined();
    expect(reassign!.actorId).toBe(dispatcher.userId);
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
