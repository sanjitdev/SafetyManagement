/**
 * Vitest: regression guard for the Prisma query-shape bug that
 * shipped a 500 on `GET /api/tickets` in production.
 *
 * ## The bug
 *
 * `GET /api/tickets` (the citizen's own reports page) built its
 * Prisma query like this:
 *
 * ```ts
 * db.ticket.findMany({
 *   where: { cityId: session.cityId },
 *   reporterId: session.userId,   // ← sibling of `where`, not inside it
 *   orderBy: { createdAt: 'desc' },
 * })
 * ```
 *
 * Prisma rejects unknown top-level filter keys, so production threw
 * `PrismaClientValidationError: Unknown argument 'reporterId'` and
 * the route returned HTTP 500.
 *
 * ## Why the test suite did not catch it
 *
 * The in-memory dev store (`lib/dev-store.ts`) had grown a
 * top-level `reporterId` argument of its own, mirroring the
 * malformed call. Every unit test ran against the dev store, so
 * the buggy shape passed 857 green tests while only real Prisma
 * rejected it.
 *
 * These tests pin BOTH halves of the fix:
 *
 *  1. The route source nests `reporterId` inside `where`.
 *  2. The dev store refuses unknown top-level filter arguments, so
 *     the same class of bug can no longer hide behind the shim.
 */

import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROUTE_PATH = path.join(
  process.cwd(),
  'app',
  'api',
  'tickets',
  'route.ts',
);

describe('GET /api/tickets — Prisma query shape', () => {
  const source = readFileSync(ROUTE_PATH, 'utf8');

  test('reporterId is nested inside `where`, not a sibling of it', () => {
    // The malformed form put `reporterId` on its own line directly
    // after the `where` object closed.
    expect(source).not.toMatch(
      /where:\s*\{[^}]*\},\s*\n\s*reporterId\s*:/,
    );
  });

  test('the findMany call filters by both cityId and reporterId', () => {
    const findMany = source.slice(source.indexOf('export async function GET'));
    expect(findMany).toContain('where: { cityId: session.cityId');
    expect(findMany).toMatch(/reporterId:\s*session\.userId/);
    // Both must live in the SAME `where` literal.
    expect(findMany).toMatch(
      /where:\s*\{[^}]*cityId:\s*session\.cityId[^}]*reporterId:\s*session\.userId[^}]*\}/,
    );
  });
});

describe('dev-store — rejects malformed findMany arguments', () => {
  test('a top-level filter key throws instead of silently filtering', async () => {
    const { devDb } = await import('@/lib/dev-store');
    expect(() =>
      devDb.ticket.findMany({
        where: { cityId: 'city_x' },
        // The exact shape that shipped the production 500.
        reporterId: 'user_x',
      } as never),
    ).toThrow(/unsupported ticket\.findMany argument "reporterId"/);
  });

  test('the correct nested shape still works', async () => {
    const { devDb, DEV_CITY_ID, DEV_CITIZEN_ID } = await import(
      '@/lib/dev-store'
    );
    const results = devDb.ticket.findMany({
      where: { cityId: DEV_CITY_ID, reporterId: DEV_CITIZEN_ID },
    });
    expect(Array.isArray(results)).toBe(true);
    // Every returned row must actually belong to that reporter.
    for (const t of results) {
      expect(t.reporterId).toBe(DEV_CITIZEN_ID);
    }
  });
});
