/**
 * Unit tests for the dispatcher set-priority service
 * (lib/dispatcher/set-priority.ts).
 *
 * The endpoint is the load-bearing trust boundary: the picker UI
 * is a hint, not the source of truth. This test pins the contract:
 *
 *   - happy path: a dispatcher sets a band; the ticket is updated;
 *     ONE audit row `ticket.priority` is written with
 *     `{ priority: prev | next }` in before / after.
 *   - the timestamp: `prioritySetAt` is stamped, and it is an ISO
 *     STRING — the dev store's `updateWhere` spreads `data` onto
 *     the row, so a `Date` would be stored where the type says a
 *     string and the queue's `toMillis()` would then return NaN and
 *     sort the ticket LAST. The write would succeed, the row would
 *     read back, and only the ORDER would be wrong.
 *   - the FIRST triage of `low` is a real change, not a no-op. A
 *     ticket that has never been triaged carries the default `low`
 *     band, so comparing the band alone would swallow the
 *     dispatcher's explicit decision and leave the ticket in the
 *     untriaged part of the queue forever.
 *   - same-value no-op: setting a band a triaged ticket already
 *     carries writes NO audit row and bumps NO version.
 *   - closed ticket: a resolved / closed / cancelled ticket cannot
 *     be triaged (409).
 *   - out-of-scope ticket: a cross-ward ticket returns
 *     `not_found` (404, not 403 — to prevent probing).
 *   - cross-city ticket: `not_found` for the same reason.
 *   - unknown ticket id: `not_found`.
 *   - the compare-and-swap: a stale version loses the write and
 *     raises `ConcurrentWriteError`.
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
} from '@/lib/dev-store';
import { setPriority } from '@/lib/dispatcher/set-priority';
import { ConcurrentWriteError } from '@/lib/platform/concurrency';

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
function seedTicketInScope(overrides: Record<string, unknown> = {}) {
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
      ...overrides,
    },
  });
}

beforeEach(() => {
  resetStore();
});

describe('setPriority — happy path', () => {
  it('sets the band, stamps the timestamp, and writes one audit row', async () => {
    const ticket = seedTicketInScope();
    const dispatcher = mkDispatcher();

    const result = await setPriority(
      ticket.id,
      { priority: 'urgent' },
      dispatcher,
    );

    expect(result.changed).toBe(true);
    expect(result.auditAction).toBe('ticket.priority');
    expect(result.ticket.priority).toBe('urgent');

    const stored = devDb.ticket.findUnique({ where: { id: ticket.id } });
    expect(stored!.priority).toBe('urgent');
    expect(stored!.prioritySetAt).not.toBeNull();

    const rows = devDb.audit.findMany({
      where: { entityType: 'ticket', action: 'ticket.priority' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].entityId).toBe(ticket.id);
    expect(rows[0].actorId).toBe(dispatcher.userId);
    expect(rows[0].beforeValue).toEqual({ priority: 'low' });
    expect(rows[0].afterValue).toEqual({ priority: 'urgent' });
  });

  it('stamps prioritySetAt as an ISO STRING, not a Date', async () => {
    // The dev store's `updateWhere` spreads `data` straight onto
    // the row. A `Date` would be stored where the type says a
    // string, and `Date.parse()` on it would then return NaN — so
    // the queue's `toMillis()` would sort the ticket LAST and the
    // write would look successful while the ORDER was wrong.
    const ticket = seedTicketInScope();
    await setPriority(ticket.id, { priority: 'high' }, mkDispatcher());

    const stored = devDb.ticket.findUnique({ where: { id: ticket.id } });
    expect(typeof stored!.prioritySetAt).toBe('string');
    expect(Number.isNaN(Date.parse(stored!.prioritySetAt as string))).toBe(false);
  });

  it('bumps the version so a concurrent transition loses its own CAS', async () => {
    const ticket = seedTicketInScope();
    const before = ticket.version ?? 0;
    await setPriority(ticket.id, { priority: 'high' }, mkDispatcher());
    const after = devDb.ticket.findUnique({ where: { id: ticket.id } })!;
    expect(after.version).toBe(before + 1);
  });
});

describe('setPriority — the no-op', () => {
  it('treats the FIRST triage of low on an untriaged ticket as a real change', async () => {
    // The defect this guards: an untriaged ticket carries the
    // default `low` band. Comparing the band alone would make
    // "explicitly triaged as low" indistinguishable from "nobody
    // has looked at this yet", the no-op would return without
    // stamping `prioritySetAt`, and the ticket would sit in the
    // untriaged part of the queue FOREVER despite a dispatcher
    // having explicitly set it aside.
    const ticket = seedTicketInScope();
    expect(ticket.prioritySetAt).toBeNull();

    const result = await setPriority(
      ticket.id,
      { priority: 'low' },
      mkDispatcher(),
    );

    expect(result.changed).toBe(true);
    expect(result.auditAction).toBe('ticket.priority');
    expect(result.ticket.prioritySetAt).not.toBeNull();

    const rows = devDb.audit.findMany({
      where: { entityType: 'ticket', action: 'ticket.priority' },
    });
    expect(rows).toHaveLength(1);
  });

  it('writes no audit row when a TRIAGED ticket is re-set to the same band', async () => {
    const ticket = seedTicketInScope();
    await setPriority(ticket.id, { priority: 'urgent' }, mkDispatcher());

    const versionAfterFirst = devDb.ticket.findUnique({
      where: { id: ticket.id },
    })!.version;

    const result = await setPriority(
      ticket.id,
      { priority: 'urgent' },
      mkDispatcher(),
    );

    expect(result.changed).toBe(false);
    expect(result.auditAction).toBeNull();

    const rows = devDb.audit.findMany({
      where: { entityType: 'ticket', action: 'ticket.priority' },
    });
    // Still just the one row from the first triage.
    expect(rows).toHaveLength(1);

    const after = devDb.ticket.findUnique({ where: { id: ticket.id } })!;
    expect(after.version).toBe(versionAfterFirst);
  });
});

describe('setPriority — a closed ticket is not triaged', () => {
  for (const status of ['resolved', 'closed', 'cancelled'] as const) {
    it(`refuses a ${status} ticket`, async () => {
      const ticket = seedTicketInScope({ status });
      await expect(
        setPriority(ticket.id, { priority: 'urgent' }, mkDispatcher()),
      ).rejects.toThrow(ApiError);

      await expect(
        setPriority(ticket.id, { priority: 'urgent' }, mkDispatcher()),
      ).rejects.toMatchObject({ status: 409, code: 'ticket_not_open' });
    });
  }
});

describe('setPriority — the authorisation boundary', () => {
  it('refuses an unknown ticket id with not_found', async () => {
    await expect(
      setPriority('tkt_does_not_exist', { priority: 'high' }, mkDispatcher()),
    ).rejects.toMatchObject({ status: 404, code: 'not_found' });
  });

  it('refuses a cross-ward ticket with not_found, not 403', async () => {
    // 404 rather than 403: a 403 would confirm the ticket EXISTS,
    // which lets a dispatcher probe for tickets outside their scope.
    const ticket = seedTicketInScope({ wardId: 'ward_15' });
    await expect(
      setPriority(ticket.id, { priority: 'high' }, mkDispatcher()),
    ).rejects.toMatchObject({ status: 404, code: 'not_found' });
  });

  it('refuses a cross-city ticket with not_found', async () => {
    const ticket = seedTicketInScope({ cityId: 'city_dhaka_south' });
    await expect(
      setPriority(ticket.id, { priority: 'high' }, mkDispatcher()),
    ).rejects.toMatchObject({ status: 404, code: 'not_found' });
  });

  it('refuses a cross-department ticket with not_found', async () => {
    const ticket = seedTicketInScope({ categoryId: 'cat_pothole' });
    await expect(
      setPriority(ticket.id, { priority: 'high' }, mkDispatcher()),
    ).rejects.toMatchObject({ status: 404, code: 'not_found' });
  });
});

describe('setPriority — the compare-and-swap', () => {
  it('lets exactly one of two concurrent triages win', async () => {
    // Two dispatchers read the same version and both write. The
    // second must not clobber the first — otherwise the audit
    // trail shows two plausible decisions with no indication that
    // one was lost, which is precisely the question the audit
    // trail exists to answer.
    //
    // The two writes are issued TOGETHER, because that is what
    // puts them between the service's read and its write: the
    // service awaits `getTicketWithTrail`, and the dev store's
    // read-then-write pair is only atomic by accident of Node's
    // single-threaded event loop. Bumping the version BEFORE the
    // call would not test anything — the service re-reads, so it
    // would see the bumped version and its predicate would still
    // match.
    const ticket = seedTicketInScope();

    const results = await Promise.allSettled([
      setPriority(ticket.id, { priority: 'urgent' }, mkDispatcher()),
      setPriority(ticket.id, { priority: 'low' }, mkDispatcher()),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(
      (rejected[0] as PromiseRejectedResult).reason,
    ).toBeInstanceOf(ConcurrentWriteError);
  });

  it('reports the field and the expected version on the conflict', async () => {
    const ticket = seedTicketInScope();

    const results = await Promise.allSettled([
      setPriority(ticket.id, { priority: 'urgent' }, mkDispatcher()),
      setPriority(ticket.id, { priority: 'low' }, mkDispatcher()),
    ]);

    const rejected = results.find((r) => r.status === 'rejected');
    expect(rejected).toBeDefined();
    expect((rejected as PromiseRejectedResult).reason).toMatchObject({
      ticketId: ticket.id,
      field: 'priority',
    });
  });

  it('writes ONE audit row when two dispatchers triage at once', async () => {
    const ticket = seedTicketInScope();

    await Promise.allSettled([
      setPriority(ticket.id, { priority: 'urgent' }, mkDispatcher()),
      setPriority(ticket.id, { priority: 'low' }, mkDispatcher()),
    ]);

    const rows = devDb.audit.findMany({
      where: { entityType: 'ticket', action: 'ticket.priority' },
    });
    // Exactly ONE row. Two would show two plausible decisions with
    // no indication that one was lost.
    expect(rows).toHaveLength(1);
    expect(rows[0].entityId).toBe(ticket.id);
  });

  it('leaves the winning band on the ticket', async () => {
    const ticket = seedTicketInScope();

    await Promise.allSettled([
      setPriority(ticket.id, { priority: 'urgent' }, mkDispatcher()),
      setPriority(ticket.id, { priority: 'low' }, mkDispatcher()),
    ]);

    const stored = devDb.ticket.findUnique({ where: { id: ticket.id } })!;
    // The loser's band must not have overwritten the winner's.
    const audit = devDb.audit.findMany({
      where: { entityType: 'ticket', action: 'ticket.priority' },
    })[0];
    const winner = (audit.afterValue as { priority: string }).priority;
    expect(stored.priority).toBe(winner);
  });
});
