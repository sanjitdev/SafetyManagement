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

describe('buildWhere', () => {
  test('default 7d window + cityId when no other filters are passed', () => {
    const before = Date.now();
    const { where, fromIso, toIso } = buildWhere({ cityId: 'city_dncc' });
    const after = Date.now();
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

  test('adds status when supplied', () => {
    const { where } = buildWhere({
      cityId: 'city_dncc',
      status: 'submitted',
    });
    expect(where.status).toBe('submitted');
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
