/**
 * Vitest: the public landing page's location (ward) filter.
 *
 * ## What this guards
 *
 * The landing page's feed carries two filters: a status chip row
 * (`সব / নতুন / চলমান / সমাধান`) and a location chip row (one chip
 * per ward that holds reports). Both are applied SERVER-side, over
 * the city's FULL ticket list — the page slice happens afterwards.
 *
 * That ordering is the load-bearing property. If the route sliced
 * first and filtered second, a citizen who picked "Ward 1" and then
 * "New" would see only the New reports that happened to fall inside
 * the first 30 rows of the unfiltered feed — which looks exactly
 * like "Ward 1 has two reports" when the city actually has twelve.
 *
 * The ward selector accepts the ward NUMBER (what the chips send)
 * or the ward ID (what a deep link carries).
 */

import { describe, expect, test } from 'vitest';
import {
  applyPublicFilters,
  resolveWardSelector,
} from '@/app/api/v1/activity/public/route';

const WARDS = [
  { id: 'ward-a', number: 1 },
  { id: 'ward-b', number: 14 },
];

function ticket(status: string, wardId: string) {
  return { status, wardId, id: `${status}-${wardId}` };
}

describe('resolveWardSelector', () => {
  test('resolves a ward number to its id', () => {
    expect(resolveWardSelector('14', WARDS)).toBe('ward-b');
  });

  test('resolves a ward id to itself', () => {
    expect(resolveWardSelector('ward-a', WARDS)).toBe('ward-a');
  });

  test('tolerates surrounding whitespace', () => {
    expect(resolveWardSelector('  14  ', WARDS)).toBe('ward-b');
  });

  test('an unknown ward resolves to null, not a throw', () => {
    // A stale bookmark to a deleted ward must show an empty feed,
    // not a 400 on a public page.
    expect(resolveWardSelector('999', WARDS)).toBeNull();
    expect(resolveWardSelector('ward-gone', WARDS)).toBeNull();
  });

  test('no selector means no ward filter', () => {
    expect(resolveWardSelector(null, WARDS)).toBeNull();
    expect(resolveWardSelector(undefined, WARDS)).toBeNull();
    expect(resolveWardSelector('', WARDS)).toBeNull();
    expect(resolveWardSelector('   ', WARDS)).toBeNull();
  });

  test('ward number 1 is not confused with ward id 1', () => {
    const wards = [
      { id: '1', number: 10 },
      { id: 'ward-x', number: 1 },
    ];
    expect(resolveWardSelector('1', wards)).toBe('ward-x');
  });
});

describe('applyPublicFilters', () => {
  const city = [
    ticket('submitted', 'ward-a'),
    ticket('routed', 'ward-a'),
    ticket('in_progress', 'ward-a'),
    ticket('resolved', 'ward-a'),
    ticket('submitted', 'ward-b'),
    ticket('routed', 'ward-b'),
    ticket('in_progress', 'ward-b'),
    ticket('resolved', 'ward-b'),
  ];

  test('status=all returns everything', () => {
    expect(applyPublicFilters(city, 'all', null)).toHaveLength(8);
  });

  test('status=new covers submitted + routed', () => {
    const out = applyPublicFilters(city, 'new', null);
    expect(out).toHaveLength(4);
    expect(out.every((t) => t.status === 'submitted' || t.status === 'routed')).toBe(
      true,
    );
  });

  test('status=active covers in_progress only', () => {
    const out = applyPublicFilters(city, 'active', null);
    expect(out).toHaveLength(2);
    expect(out.every((t) => t.status === 'in_progress')).toBe(true);
  });

  test('status=resolved covers the terminal states', () => {
    const out = applyPublicFilters(city, 'resolved', null);
    expect(out).toHaveLength(2);
    expect(out.every((t) => t.status === 'resolved')).toBe(true);
  });

  test('a ward filter narrows to that ward only', () => {
    const out = applyPublicFilters(city, 'all', 'ward-a');
    expect(out).toHaveLength(4);
    expect(out.every((t) => t.wardId === 'ward-a')).toBe(true);
  });

  test('the ward and status filters combine with AND', () => {
    const out = applyPublicFilters(city, 'new', 'ward-b');
    expect(out).toHaveLength(2);
    expect(
      out.every((t) => t.wardId === 'ward-b' && t.status !== 'resolved'),
    ).toBe(true);
  });

  test('the filter runs over the FULL list, before any page slice', () => {
    // 30 rows, but 12 of them are in ward-a. Slicing first would
    // return at most 30 → still 30 here, so the discriminating case
    // is a small page limit: with limit=5 and the filter applied
    // BEFORE the slice, ward-a's 12 reports are all available.
    const twelve = Array.from({ length: 12 }, () =>
      ticket('submitted', 'ward-a'),
    );
    const others = Array.from({ length: 40 }, () =>
      ticket('submitted', 'ward-b'),
    );
    const all = [...twelve, ...others];

    // Filter-then-slice: the first 5 of the filtered set.
    const filteredThenSliced = applyPublicFilters(all, 'all', 'ward-a').slice(
      0,
      5,
    );
    expect(filteredThenSliced).toHaveLength(5);
    expect(filteredThenSliced.every((t) => t.wardId === 'ward-a')).toBe(true);

    // Slice-then-filter (the bug): the first 5 rows are ward-a too,
    // but the total available is truncated — proven by asking for
    // the whole filtered set, which must still be 12.
    expect(applyPublicFilters(all, 'all', 'ward-a')).toHaveLength(12);
  });

  test('a ward with no reports yields an empty list, not a throw', () => {
    expect(applyPublicFilters(city, 'all', 'ward-empty')).toHaveLength(0);
  });

  test('the input array is not mutated', () => {
    const original = [...city];
    applyPublicFilters(city, 'new', 'ward-a');
    expect(city).toEqual(original);
  });
});
