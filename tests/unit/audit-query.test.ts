/**
 * Vitest: audit-query helper.
 *
 * Bolt 005-004 (Intent 005, Unit 004). 8 checks:
 *
 *  1. `buildWhere({})` returns
 *     `{ createdAt: { gte: <now-7d>, lte: <now> } }`
 *     (no filters, default 7d window).
 *  2. `buildWhere({ actorId: 'u1' })` adds
 *     `actorId: 'u1'`.
 *  3. `buildWhere({ action: ['a', 'b'] })` adds
 *     `action: { in: ['a', 'b'] }`; single-element array
 *     collapses to a string.
 *  4. `buildWhere({ entityType: ['city'] })` adds
 *     `entityType: 'city'`.
 *  5. `buildWhere({ from, to })` overrides the default
 *     window.
 *  6. `buildWhere({ cursor: '<iso>' })` adds
 *     `createdAt.lt = '<iso>'`.
 *  7. `clampLimit(200)` clamps to 100.
 *  8. `clampLimit(0)` clamps to 1.
 */

import { describe, expect, test } from 'vitest';
import { buildWhere, clampLimit } from '@/lib/admin/audit-query';
import { nowMs } from '@/lib/format/clock';

describe('buildWhere', () => {
  test('default 7d window when no filters are passed', () => {
    // The window must be measured against the SAME clock the query
    // builder uses. `buildWhere` reads the shared pinned clock
    // (`lib/format/clock.ts`), so a wall-clock reference would be
    // measuring a different instant entirely — and under a pinned
    // test harness the two are days apart.
    const before = nowMs();
    const { where, fromIso, toIso } = buildWhere({});
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
      createdAt: { gte: fromIso, lte: toIso },
    });
    expect((where as Record<string, unknown>).actorId).toBeUndefined();
  });

  test('adds actorId when supplied', () => {
    const { where } = buildWhere({ actorId: 'u1' });
    expect((where as Record<string, unknown>).actorId).toBe('u1');
  });

  test('collapses single-element action array to a string', () => {
    const { where } = buildWhere({ action: ['create'] });
    expect((where as Record<string, unknown>).action).toBe('create');
  });

  test('uses action.in for multi-element action array', () => {
    const { where } = buildWhere({ action: ['create', 'update'] });
    expect((where as Record<string, unknown>).action).toEqual({
      in: ['create', 'update'],
    });
  });

  test('collapses single-element entityType array to a string', () => {
    const { where } = buildWhere({ entityType: ['city'] });
    expect((where as Record<string, unknown>).entityType).toBe('city');
  });

  test('uses entityType.in for multi-element entityType array', () => {
    const { where } = buildWhere({ entityType: ['city', 'ward'] });
    expect((where as Record<string, unknown>).entityType).toEqual({
      in: ['city', 'ward'],
    });
  });

  test('overrides the default window with from + to', () => {
    const from = '2026-10-01T00:00:00.000Z';
    const to = '2026-10-12T00:00:00.000Z';
    const { where, fromIso, toIso } = buildWhere({ from, to });
    expect(fromIso).toBe(from);
    expect(toIso).toBe(to);
    expect((where as Record<string, unknown>).createdAt).toMatchObject({
      gte: from,
      lte: to,
    });
  });

  test('adds createdAt.lt when a cursor is supplied', () => {
    const cursor = '2026-10-12T10:00:00.000Z';
    const { where } = buildWhere({ cursor });
    expect((where as Record<string, unknown>).createdAt).toMatchObject({
      lt: cursor,
    });
  });

  test('omits the cursor branch when no cursor is supplied', () => {
    const { where } = buildWhere({});
    expect(
      ((where as Record<string, unknown>).createdAt as Record<
        string,
        unknown
      >).lt,
    ).toBeUndefined();
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
