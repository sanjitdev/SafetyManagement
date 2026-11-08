/**
 * Unit tests for the transaction helper (lib/platform/transaction.ts).
 *
 * The helper has two backends with the same contract:
 *
 *   - Prisma: `prisma.$transaction(async (tx) => ...)`. The tx client
 *     is transaction-scoped, so every statement inside it commits
 *     together or rolls back together.
 *   - Dev store: there is no database, so the helper SNAPSHOTS its
 *     mutable collections before the callback and RESTORES them if the
 *     callback throws.
 *
 * The Prisma path is exercised here through a mock of `@/lib/db` so
 * the CI suite (which has no Postgres) still proves the facade is
 * wired to the transaction-scoped client rather than to the root
 * client. That distinction is the whole point of the helper: a
 * statement made through the root client would NOT be part of the
 * transaction.
 *
 * The dev-store path is exercised against the real dev store.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getStore, resetStore } from '@/lib/dev-store';

/**
 * The mock of the transaction-scoped Prisma client. Declared at
 * module scope so the `vi.mock` factory below can close over it.
 */
const txTicket = {
  updateMany: vi.fn(),
  findUnique: vi.fn(),
};
const txTicketTrailEntry = { create: vi.fn() };
const txAuditEntry = { create: vi.fn() };
const txClient = {
  ticket: txTicket,
  ticketTrailEntry: txTicketTrailEntry,
  auditEntry: txAuditEntry,
};

/** The root (non-transactional) Prisma client. */
const rootTicket = { updateMany: vi.fn() };
const rootTicketTrailEntry = { create: vi.fn() };
const rootAuditEntry = { create: vi.fn() };

const $transaction = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => $transaction(fn),
    ticket: rootTicket,
    ticketTrailEntry: rootTicketTrailEntry,
    auditEntry: rootAuditEntry,
  },
}));

/** Toggle between the dev-store backend and the Prisma backend. */
let devStore = true;
vi.mock('@/lib/dev-store', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/dev-store')>();
  return {
    ...actual,
    isDevStore: () => devStore,
  };
});

const { runInTransaction } = await import('@/lib/platform/transaction');
const { db } = await import('@/lib/db-switch');

beforeEach(() => {
  devStore = true;
  resetStore();
  vi.clearAllMocks();
});

describe('runInTransaction — dev store backend', () => {
  it('commits the callback writes when the callback resolves', async () => {
    const before = getStore().trail.length;

    await runInTransaction(db, async (tx) => {
      await tx.trail.create({
        data: {
          ticketId: 't1',
          toStatus: 'routed',
          actorId: 'u1',
          note: null,
        },
      });
    });

    expect(getStore().trail.length).toBe(before + 1);
  });

  it('rolls back the callback writes when the callback throws', async () => {
    const before = getStore().trail.length;

    await expect(
      runInTransaction(db, async (tx) => {
        await tx.trail.create({
          data: {
            ticketId: 't1',
            toStatus: 'routed',
            actorId: 'u1',
            note: null,
          },
        });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(getStore().trail.length).toBe(before);
  });

  it('rolls back the audit rows the callback wrote', async () => {
    const before = getStore().audit.length;

    await expect(
      runInTransaction(db, async (tx) => {
        await tx.audit.create({
          data: {
            entityType: 'ticket',
            entityId: 't1',
            action: 'ticket.transition',
            actorId: 'u1',
            beforeValue: null,
            afterValue: null,
          },
        });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(getStore().audit.length).toBe(before);
  });

  it('restores a ticket row the callback changed', async () => {
    const ticketId = 'tx_rollback_ticket';
    const now = new Date().toISOString();
    getStore().tickets.set(ticketId, {
      id: ticketId,
      cityId: 'city_dhaka_north',
      wardId: 'ward_14',
      categoryId: 'cat_pothole',
      reporterId: 'user_citizen_rahim',
      assignedCrewId: null,
      status: 'submitted',
      locationLng: 90.4,
      locationLat: 23.8,
      locationLabel: null,
      locationLabelBn: null,
      note: null,
      internalNote: null,
      duplicateOfId: null,
      closeReason: null,
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
      version: 0,
    });

    await expect(
      runInTransaction(db, async (tx) => {
        await tx.ticket.updateWhere({
          where: { id: ticketId, status: 'submitted', version: 0 },
          data: { status: 'routed', version: 1 },
        });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const restored = getStore().tickets.get(ticketId);
    expect(restored?.status).toBe('submitted');
    expect(restored?.version).toBe(0);
  });

  it('leaves another writer’s rows alone when it rolls back', async () => {
    // The regression this guards: the first version of the helper
    // restored the whole trail collection on rollback, which erased
    // the rows a CONCURRENT writer had legitimately written. The
    // helper now removes only the rows its own callback appended.
    const winnerTicket = 'tx_winner_ticket';
    const now = new Date().toISOString();
    getStore().tickets.set(winnerTicket, {
      id: winnerTicket,
      cityId: 'city_dhaka_north',
      wardId: 'ward_14',
      categoryId: 'cat_pothole',
      reporterId: 'user_citizen_rahim',
      assignedCrewId: null,
      status: 'submitted',
      locationLng: 90.4,
      locationLat: 23.8,
      locationLabel: null,
      locationLabelBn: null,
      note: null,
      internalNote: null,
      duplicateOfId: null,
      closeReason: null,
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
      version: 0,
    });

    // Writer A wins and appends its trail row.
    await runInTransaction(db, async (tx) => {
      await tx.ticket.updateWhere({
        where: { id: winnerTicket, status: 'submitted', version: 0 },
        data: { status: 'routed', version: 1 },
      });
      await tx.trail.create({
        data: {
          ticketId: winnerTicket,
          toStatus: 'routed',
          actorId: 'u1',
          note: null,
        },
      });
    });

    const trailAfterWinner = getStore().trail.length;

    // Writer B fails and rolls back.
    await expect(
      runInTransaction(db, async (tx) => {
        await tx.trail.create({
          data: {
            ticketId: winnerTicket,
            toStatus: 'cancelled',
            actorId: 'u2',
            note: null,
          },
        });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    // Writer A's row survived; writer B's did not.
    expect(getStore().trail.length).toBe(trailAfterWinner);
    const rows = getStore().trail.filter((t) => t.ticketId === winnerTicket);
    expect(rows).toHaveLength(1);
    expect(rows[0].toStatus).toBe('routed');
  });

  it('propagates the callback’s return value', async () => {
    const value = await runInTransaction(db, async () => 'result');
    expect(value).toBe('result');
  });

  it('does not touch collections outside the snapshot', async () => {
    // Sessions and OTPs are NOT rolled back by the dev-store helper.
    // The transition path does not touch them, but the limitation is
    // pinned here so a future widening of the helper's use is a
    // deliberate decision rather than an accident.
    const sessionsBefore = getStore().sessions.size;
    await expect(
      runInTransaction(db, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(getStore().sessions.size).toBe(sessionsBefore);
  });
});

describe('runInTransaction — Prisma backend', () => {
  it('runs the callback inside prisma.$transaction', async () => {
    devStore = false;
    $transaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(txClient),
    );

    await runInTransaction(db, async () => 'ok');

    expect($transaction).toHaveBeenCalledTimes(1);
  });

  it('routes ticket writes to the transaction-scoped client, not the root client', async () => {
    devStore = false;
    txTicket.updateMany.mockResolvedValueOnce({ count: 1 });
    $transaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(txClient),
    );

    await runInTransaction(db, async (tx) => {
      await tx.ticket.updateWhere({
        where: { id: 't1', status: 'submitted', version: 0 },
        data: { status: 'routed', version: 1 },
      });
    });

    // The write went through `tx.ticket` (the transaction client)…
    expect(txTicket.updateMany).toHaveBeenCalledTimes(1);
    // …and NOT through the root client, which would have escaped the
    // transaction entirely.
    expect(rootTicket.updateMany).not.toHaveBeenCalled();
  });

  it('routes bumpVersion to the transaction-scoped client, not the root client', async () => {
    // `bumpVersion` is a facade method that reaches for the root
    // Prisma client. Inside a transaction it must reach for the
    // TRANSACTION-scoped client, or the bump would escape the
    // transaction and would not roll back with the rest of the work.
    devStore = false;
    txTicket.updateMany.mockResolvedValueOnce({ count: 1 });
    $transaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(txClient),
    );

    await runInTransaction(db, async (tx) => {
      await tx.ticket.bumpVersion({ where: { id: 't1' } });
    });

    expect(txTicket.updateMany).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { version: { increment: 1 } },
    });
    expect(rootTicket.updateMany).not.toHaveBeenCalled();
  });

  it('routes trail writes to the transaction-scoped ticketTrailEntry delegate', async () => {    devStore = false;
    txTicketTrailEntry.create.mockResolvedValueOnce({ id: 'trail1' });
    $transaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(txClient),
    );

    await runInTransaction(db, async (tx) => {
      await tx.trail.create({
        data: {
          ticketId: 't1',
          toStatus: 'routed',
          actorId: 'u1',
          note: null,
        },
      });
    });

    expect(txTicketTrailEntry.create).toHaveBeenCalledTimes(1);
    expect(rootTicketTrailEntry.create).not.toHaveBeenCalled();
  });

  it('routes audit writes to the transaction-scoped auditEntry delegate', async () => {
    devStore = false;
    txAuditEntry.create.mockResolvedValueOnce({ id: 'audit1' });
    $transaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(txClient),
    );

    await runInTransaction(db, async (tx) => {
      await tx.audit.create({
        data: {
          entityType: 'ticket',
          entityId: 't1',
          action: 'ticket.transition',
          actorId: 'u1',
          beforeValue: null,
          afterValue: null,
        },
      });
    });

    expect(txAuditEntry.create).toHaveBeenCalledTimes(1);
    expect(rootAuditEntry.create).not.toHaveBeenCalled();
  });

  it('rolls back when the transaction-scoped write throws', async () => {
    devStore = false;
    txTicketTrailEntry.create.mockRejectedValueOnce(new Error('db down'));
    $transaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(txClient),
    );

    await expect(
      runInTransaction(db, async (tx) => {
        await tx.trail.create({
          data: {
            ticketId: 't1',
            toStatus: 'routed',
            actorId: 'u1',
            note: null,
          },
        });
      }),
    ).rejects.toThrow('db down');
  });

  it('delegates non-transactional namespaces through to the root facade', async () => {
    devStore = false;
    $transaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(txClient),
    );

    // `session` is not one of the three re-pointed namespaces, so it
    // is delegated to the root facade. That is a documented
    // limitation of the helper, pinned here so it stays visible.
    await runInTransaction(db, async (tx) => {
      expect(tx.session).toBeDefined();
      expect(tx.ticket).toBeDefined();
    });
  });

  it('falls back to the root facade for a property the tx delegate does not expose', async () => {
    devStore = false;
    $transaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(txClient),
    );

    await runInTransaction(db, async (tx) => {
      // `ticket` on the tx client has no `findMany` in the mock, so
      // the scoped facade falls back to the root namespace's method
      // rather than throwing. The transition path only needs
      // `updateWhere` / `create`, but the fallback keeps the facade
      // from breaking on an unrelated read.
      expect(typeof (tx.ticket as Record<string, unknown>).findMany).toBe(
        'function',
      );
    });
  });

  it('throws a clear error when the tx client has no matching delegate', async () => {
    devStore = false;
    $transaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) =>
      // A tx client missing every delegate — the shape the helper
      // must refuse rather than silently write to the root client.
      fn({}),
    );

    await expect(
      runInTransaction(db, async (tx) => {
        await tx.trail.create({
          data: {
            ticketId: 't1',
            toStatus: 'routed',
            actorId: 'u1',
            note: null,
          },
        });
      }),
    ).rejects.toThrow(/no "ticketTrailEntry" delegate/);
  });
});
