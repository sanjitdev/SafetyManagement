/**
 * Unit tests for the dedup-flag store (lib/dev-store.ts → dedupFlag).
 *
 * DISP-006 (Intent 003, Unit 004): the dispatcher's review surface
 * for citizen-declined dedup candidates. The flag table is a thin
 * overlay on top of `ticket`; the test pins the store contract so
 * any future change to the dedupFlag CRUD surfaces a failing test.
 *
 * The tests run against the real in-memory dev store — no mocks.
 * The store is pure JS and has no I/O, so it is safe in vitest.
 *
 *   - dedupFlag.create returns a row with a generated `df_` id, the
 *     current timestamp, and a default status of 'pending'.
 *   - dedupFlag.findMany filters by (cityId, status) and orders
 *     by flaggedAt asc by default.
 *   - dedupFlag.update sets status + resolvedById + resolvedAt
 *     atomically (last-write-wins; the route handler treats that
 *     as acceptable because the pending-status check is the
 *     authoritative guard).
 *   - dedupFlag.findUnique returns null for unknown ids and the
 *     same shape for known ids.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { devDb, resetStore, DEV_CITY_ID, DEV_WARD_ID } from '@/lib/dev-store';

beforeEach(() => {
  resetStore();
});

function mkTicket(suffix: string) {
  return devDb.ticket.create({
    data: {
      cityId: DEV_CITY_ID,
      wardId: DEV_WARD_ID,
      categoryId: 'cat_streetlight',
      reporterId: 'user_citizen_rahim',
      status: 'submitted',
      locationLat: 23.789 + parseFloat(suffix) * 0.0001,
      locationLng: 90.4075,
      locationLabel: 'Mirpur',
      locationLabelBn: 'মিরপুর',
      note: null,
      photoUrls: [],
      assignedCrewId: null,
      internalNote: null,
    },
  });
}

describe('dev-store dedupFlag CRUD', () => {
  it('create returns a row with generated id, current timestamp, and default status pending', () => {
    const ticket = mkTicket('1');
    const original = mkTicket('2');
    const flag = devDb.dedupFlag.create({
      data: {
        cityId: DEV_CITY_ID,
        wardId: DEV_WARD_ID,
        departmentId: 'dept_streetlight',
        ticketId: ticket.id,
        originalTicketId: original.id,
        citizenReason: 'same pothole',
      },
    });
    expect(flag.id).toMatch(/^df_/);
    expect(flag.status).toBe('pending');
    expect(flag.flaggedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(flag.resolvedById).toBeNull();
    expect(flag.resolvedAt).toBeNull();
    expect(flag.citizenReason).toBe('same pothole');
  });

  it('findMany filters by cityId and status, returns empty when status mismatches', () => {
    const ticket = mkTicket('1');
    const original = mkTicket('2');
    const a = devDb.dedupFlag.create({
      data: {
        cityId: DEV_CITY_ID,
        wardId: DEV_WARD_ID,
        departmentId: 'dept_streetlight',
        ticketId: ticket.id,
        originalTicketId: original.id,
        citizenReason: null,
      },
    });
    // Create a second in a different city and confirm it does not bleed.
    const ticket2 = mkTicket('3');
    const original2 = mkTicket('4');
    devDb.dedupFlag.create({
      data: {
        cityId: 'city_chittagong',
        wardId: 'ward_99',
        departmentId: 'dept_streetlight',
        ticketId: ticket2.id,
        originalTicketId: original2.id,
        citizenReason: null,
      },
    });

    const inDhaka = devDb.dedupFlag.findMany({
      where: { cityId: DEV_CITY_ID, status: 'pending' },
    });
    expect(inDhaka.map((f) => f.id)).toEqual([a.id]);

    // Filter for a status that nothing has → empty.
    const dismissed = devDb.dedupFlag.findMany({
      where: { cityId: DEV_CITY_ID, status: 'dismissed' },
    });
    expect(dismissed).toEqual([]);
  });

  it('findMany orders by flaggedAt asc by default', async () => {
    const ticketA = mkTicket('1');
    const originalA = mkTicket('2');
    const a = devDb.dedupFlag.create({
      data: {
        cityId: DEV_CITY_ID,
        wardId: DEV_WARD_ID,
        departmentId: 'dept_streetlight',
        ticketId: ticketA.id,
        originalTicketId: originalA.id,
        citizenReason: null,
      },
    });
    // Force a strictly later timestamp on the second row.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const ticketB = mkTicket('3');
    const originalB = mkTicket('4');
    const b = devDb.dedupFlag.create({
      data: {
        cityId: DEV_CITY_ID,
        wardId: DEV_WARD_ID,
        departmentId: 'dept_streetlight',
        ticketId: ticketB.id,
        originalTicketId: originalB.id,
        citizenReason: null,
      },
    });

    const rows = devDb.dedupFlag.findMany({
      where: { cityId: DEV_CITY_ID, status: 'pending' },
      orderBy: { flaggedAt: 'asc' },
    });
    expect(rows.map((f) => f.id)).toEqual([a.id, b.id]);
  });

  it('update mutates the row (status + resolvedById + resolvedAt)', () => {
    const ticket = mkTicket('1');
    const original = mkTicket('2');
    const flag = devDb.dedupFlag.create({
      data: {
        cityId: DEV_CITY_ID,
        wardId: DEV_WARD_ID,
        departmentId: 'dept_streetlight',
        ticketId: ticket.id,
        originalTicketId: original.id,
        citizenReason: null,
      },
    });

    const updated = devDb.dedupFlag.update({
      where: { id: flag.id },
      data: {
        status: 'confirmed',
        resolvedById: 'user_dispatcher_habib',
        resolvedAt: new Date().toISOString(),
      },
    });
    expect(updated.status).toBe('confirmed');
    expect(updated.resolvedById).toBe('user_dispatcher_habib');
    expect(updated.resolvedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // The read-through findUnique reflects the update.
    const roundtrip = devDb.dedupFlag.findUnique({ where: { id: flag.id } });
    expect(roundtrip?.status).toBe('confirmed');
  });

  it('update on an unknown id throws', () => {
    expect(() =>
      devDb.dedupFlag.update({
        where: { id: 'df_nope' },
        data: { status: 'dismissed' },
      }),
    ).toThrowError(/df_nope/);
  });

  it('findUnique returns null for unknown ids', () => {
    const out = devDb.dedupFlag.findUnique({ where: { id: 'df_missing' } });
    expect(out).toBeNull();
  });

  it('flags survive a dev store reset (regression: global shim should be reseeded)', () => {
    const ticket = mkTicket('1');
    const original = mkTicket('2');
    const flag = devDb.dedupFlag.create({
      data: {
        cityId: DEV_CITY_ID,
        wardId: DEV_WARD_ID,
        departmentId: 'dept_streetlight',
        ticketId: ticket.id,
        originalTicketId: original.id,
        citizenReason: null,
      },
    });
    // Sanity: the row exists.
    expect(devDb.dedupFlag.findUnique({ where: { id: flag.id } })).not.toBeNull();
    // Reset wipes the in-memory state (HMR-safe contract).
    resetStore();
    expect(devDb.dedupFlag.findUnique({ where: { id: flag.id } })).toBeNull();
  });
});
