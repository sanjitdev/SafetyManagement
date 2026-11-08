/**
 * Vitest: admin tickets-query helper.
 *
 * Bolt admin-tickets (Intent 005, Unit 005 — admin /admin/tickets).
 * 8 checks mirroring tests/unit/audit-query.test.ts:
 *
 *  1. `buildWhere({ cityId })` returns
 *     `{ cityId, createdAt: { gte, lte } }` (default 7d window).
 *  2. `buildWhere({ status: 'submitted' })` adds
 *     `status: 'submitted'`.
 *  3. `buildWhere({ categoryId, wardId })` adds both equality keys.
 *  4. `buildWhere({ q: 'tkt_xxx' })` adds `id: 'tkt_xxx'`.
 *  5. `buildWhere({ from, to })` overrides the default window.
 *  6. `buildWhere({ cursor: '<iso>' })` adds `createdAt.lt`.
 *  7. `clampLimit(200)` clamps to 100.
 *  8. `clampLimit(0)` clamps to 1.
 */

import { describe, expect, test } from 'vitest';
import {
  buildWhere,
  clampLimit,
  TICKET_STATUS_VALUES,
} from '@/lib/admin/tickets-query';
import { nowMs } from '@/lib/format/clock';

describe('buildWhere', () => {
  test('default 7d window + cityId when no other filters are passed', () => {
    // Measured against the shared pinned clock the query builder
    // reads — a wall-clock reference measures a different instant
    // entirely, and under a pinned harness the two are days apart.
    const before = nowMs();
    const { where, fromIso, toIso } = buildWhere({ cityId: 'city_dncc' });
    const after = nowMs();
    expect(fromIso).toMatch(/T/);
    expect(toIso).toMatch(/T/);
    const fromMs = Date.parse(fromIso);
    const toMs = Date.parse(toIso);
    expect(fromMs).toBeGreaterThanOrEqual(before - 7 * 86_400_000 - 100);
    expect(fromMs).toBeLessThanOrEqual(after - 7 * 86_400_000 + 100);
    expect(toMs).toBeGreaterThanOrEqual(before - 100);
    expect(toMs).toBeLessThanOrEqual(after + 100);
    expect(where).toMatchObject({
      cityId: 'city_dncc',
      createdAt: { gte: fromIso, lte: toIso },
    });
  });

  test('adds status when supplied (as { in: [...] } for both backends)', () => {
    const { where } = buildWhere({
      cityId: 'city_dncc',
      status: 'submitted',
    });
    // The shape `{ in: [...] }` is what both Prisma and the dev
    // store expect — the dev store's filter mapper at
    // lib/dev-store.ts:1155 reads `v.in`, not `v` directly. A
    // bare string would silently return 0 rows on the dev backend.
    expect(where.status).toEqual({ in: ['submitted'] });
  });

  test('adds categoryId and wardId as exact equality keys', () => {
    const { where } = buildWhere({
      cityId: 'city_dncc',
      categoryId: 'cat_streetlight',
      wardId: 'ward_14',
    });
    expect(where.categoryId).toBe('cat_streetlight');
    expect(where.wardId).toBe('ward_14');
  });

  test('adds id when q is supplied (exact-match ticket id)', () => {
    const { where } = buildWhere({
      cityId: 'city_dncc',
      q: 'tkt_seed_submitted_1',
    });
    expect(where.id).toBe('tkt_seed_submitted_1');
  });

  test('overrides the default window with from + to', () => {
    const from = '2026-10-01T00:00:00.000Z';
    const to = '2026-10-12T00:00:00.000Z';
    const { fromIso, toIso, where } = buildWhere({
      cityId: 'city_dncc',
      from,
      to,
    });
    expect(fromIso).toBe(from);
    expect(toIso).toBe(to);
    expect(where.createdAt).toMatchObject({ gte: from, lte: to });
  });

  test('adds createdAt.lt when a cursor is supplied', () => {
    const cursor = '2026-10-12T10:00:00.000Z';
    const { where } = buildWhere({ cityId: 'city_dncc', cursor });
    expect(where.createdAt).toMatchObject({ lt: cursor });
  });

  test('TICKET_STATUS_VALUES is the closed enum (6 values)', () => {
    expect(TICKET_STATUS_VALUES).toEqual([
      'submitted',
      'routed',
      'in_progress',
      'resolved',
      'closed',
      'cancelled',
    ]);
  });
});

describe('clampLimit', () => {
  test('200 → 100 (clamped to max)', () => {
    expect(clampLimit(200)).toBe(100);
  });

  test('0 → 1 (clamped to min)', () => {
    expect(clampLimit(0)).toBe(1);
  });

  test('undefined → 50 (default)', () => {
    expect(clampLimit(undefined)).toBe(50);
  });

  test('NaN → 50 (default)', () => {
    expect(clampLimit(NaN)).toBe(50);
  });

  test('50 → 50 (in range)', () => {
    expect(clampLimit(50)).toBe(50);
  });
});
