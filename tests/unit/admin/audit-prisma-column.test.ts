/**
 * Vitest: audit read path — PRISMA column-name translation.
 *
 * Regression guard for a bug that only surfaced against the real
 * Postgres: `GET /api/v1/admin/audit` returned **500** with
 * `Unknown argument 'createdAt'` because the Prisma `AuditEntry`
 * model has no `createdAt` column — the column is named
 * `timestamp` (prisma/schema.prisma → `model AuditEntry`).
 *
 * WHY THIS TEST EXISTS
 * --------------------
 * The dev store names the audit row's time column `createdAt`
 * (`DevAuditEntry` in lib/dev-store.ts) and its `findMany`
 * filters/sorts on that key. `lib/admin/audit-query.ts` speaks
 * that dialect (`where.createdAt`, `orderBy.createdAt`) and the
 * adapter in `lib/db-switch.ts` is responsible for translating it
 * to the Prisma column names.
 *
 * Every pre-existing audit test drives the dev store, so the
 * translation was never exercised — the bug shipped green. This
 * file forces the NON-dev-store path with a mocked Prisma client
 * and asserts the adapter emits `timestamp` (not `createdAt`).
 *
 * The test is non-vacuous: reverting the adapter to pass
 * `args` through unchanged makes the "no `createdAt` leaks into
 * the Prisma query" assertion fail.
 */

import { describe, expect, test, vi, beforeEach } from 'vitest';

const auditEntryFindMany = vi.fn().mockResolvedValue([]);
const userFindUnique = vi.fn().mockResolvedValue(null);

/**
 * Mock the Prisma client (`@/lib/db`) so importing `lib/db-switch`
 * does not open a real database connection. The mock is hoisted by
 * Vitest, so it is registered before the dynamic import below.
 */
vi.mock('@/lib/db', () => ({
  prisma: {
    auditEntry: { findMany: auditEntryFindMany },
    user: { findUnique: userFindUnique },
  },
}));

/**
 * Force the Prisma path: `isDevStore()` in lib/dev-store.ts reads
 * `process.env.CITYFIX_DEV_STORE`, and the vitest config sets it to
 * '1'. The module is imported AFTER the env var is cleared so the
 * adapter takes the Postgres branch.
 */
process.env.CITYFIX_DEV_STORE = '0';

const { db } = await import('@/lib/db-switch');

beforeEach(() => {
  auditEntryFindMany.mockClear();
  auditEntryFindMany.mockResolvedValue([]);
  userFindUnique.mockClear();
  userFindUnique.mockResolvedValue(null);
});

describe('audit.findMany — Prisma column translation', () => {
  test('filters on `timestamp`, not `createdAt`', async () => {
    await db.audit.findMany({
      where: {
        createdAt: {
          gte: '2026-10-01T00:00:00.000Z',
          lte: '2026-10-31T00:00:00.000Z',
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 51,
    });

    expect(auditEntryFindMany).toHaveBeenCalledTimes(1);
    const args = auditEntryFindMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
      orderBy: Record<string, unknown>;
      take: number;
    };

    // The Prisma `AuditEntry` model has NO `createdAt` column —
    // passing one makes Prisma throw
    // `Unknown argument 'createdAt'` at query time.
    expect(args.where).not.toHaveProperty('createdAt');
    expect(args.orderBy).not.toHaveProperty('createdAt');

    // ...it is called `timestamp`.
    expect(args.where.timestamp).toEqual({
      gte: '2026-10-01T00:00:00.000Z',
      lte: '2026-10-31T00:00:00.000Z',
    });
    expect(args.orderBy.timestamp).toBe('desc');
    expect(args.take).toBe(51);
  });

  test('translates the cursor bound onto `timestamp`', async () => {
    await db.audit.findMany({
      where: {
        createdAt: {
          gte: '2026-10-01T00:00:00.000Z',
          lte: '2026-10-31T00:00:00.000Z',
          lt: '2026-10-20T00:00:00.000Z',
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const args = auditEntryFindMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
      orderBy: Record<string, unknown>;
    };
    expect(args.where.timestamp).toMatchObject({
      lt: '2026-10-20T00:00:00.000Z',
    });
    expect(args.orderBy.timestamp).toBe('asc');
  });

  test('passes the non-time filters through unchanged', async () => {
    await db.audit.findMany({
      where: {
        actorId: 'user_dispatcher_habib',
        action: { in: ['ticket_create', 'ticket_resolve'] },
        entityType: 'ticket',
        createdAt: { gte: '2026-10-01T00:00:00.000Z' },
      },
    });

    const args = auditEntryFindMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(args.where.actorId).toBe('user_dispatcher_habib');
    expect(args.where.action).toEqual({
      in: ['ticket_create', 'ticket_resolve'],
    });
    expect(args.where.entityType).toBe('ticket');
    expect(args.where).not.toHaveProperty('createdAt');
  });

  test('omits `timestamp` entirely when no time bound is supplied', async () => {
    await db.audit.findMany({
      where: { actorId: 'user_admin_anwar' },
    });

    const args = auditEntryFindMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(args.where).not.toHaveProperty('timestamp');
    expect(args.where).not.toHaveProperty('createdAt');
    expect(args.where.actorId).toBe('user_admin_anwar');
  });
});
