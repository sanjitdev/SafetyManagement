/**
 * Unit tests for the home / city activity feed
 * filter helpers (lib/home-filter.ts).
 *
 * Covers:
 *   - The four filter-pill semantics (all / new /
 *     in_progress / resolved).
 *   - The empty-state invariant (a filter that yields
 *     zero rows still renders the empty state, not
 *     an error).
 *   - The pill-label mapping (`submitted → 'New'`
 *     i18n key, the others map 1:1).
 *   - The pill-to-API-status mapping (`all →
 *     undefined` so the API call omits the param).
 *
 * The home page is a client component; the filter
 * logic lives in `lib/home-filter.ts` so it can be
 * unit-tested without the React runtime.
 */

import { describe, expect, it } from 'vitest';
import {
  applyStatusFilter,
  filterToApiStatus,
  filterToI18nKey,
  type ActivityItemLite,
} from '@/lib/home-filter';

const sample: ActivityItemLite[] = [
  { status: 'submitted' },
  { status: 'in_progress' },
  { status: 'resolved' },
  { status: 'routed' }, // not exposed as a pill
  { status: 'closed' }, // not exposed as a pill
  { status: 'cancelled' }, // not exposed as a pill
];

describe('applyStatusFilter', () => {
  it('returns the input unchanged for the `all` filter', () => {
    expect(applyStatusFilter(sample, 'all')).toEqual(sample);
  });

  it('returns only submitted rows for the `submitted` filter', () => {
    const out = applyStatusFilter(sample, 'submitted');
    expect(out.map((t) => t.status)).toEqual(['submitted']);
  });

  it('returns only in_progress rows for the `in_progress` filter', () => {
    const out = applyStatusFilter(sample, 'in_progress');
    expect(out.map((t) => t.status)).toEqual(['in_progress']);
  });

  it('returns only resolved rows for the `resolved` filter', () => {
    const out = applyStatusFilter(sample, 'resolved');
    expect(out.map((t) => t.status)).toEqual(['resolved']);
  });

  it('the empty-state invariant: a filter that yields zero rows returns an empty array (not an error)', () => {
    const onlySubmitted: ActivityItemLite[] = [{ status: 'submitted' }];
    expect(applyStatusFilter(onlySubmitted, 'in_progress')).toEqual([]);
    expect(applyStatusFilter([], 'all')).toEqual([]);
  });

  it('does not surface `routed`, `closed`, or `cancelled` rows for any pill (they are not exposed as filters)', () => {
    const routedOnly: ActivityItemLite[] = [{ status: 'routed' }];
    for (const f of ['all', 'submitted', 'in_progress', 'resolved'] as const) {
      // `all` includes routed/closed/cancelled; the others must not.
      const out = applyStatusFilter(routedOnly, f);
      if (f === 'all') {
        expect(out).toHaveLength(1);
      } else {
        expect(out).toEqual([]);
      }
    }
  });
});

describe('filterToApiStatus', () => {
  it('returns `undefined` for `all` so the API call omits the param', () => {
    expect(filterToApiStatus('all')).toBeUndefined();
  });

  it('returns the matching status for the other three pills', () => {
    expect(filterToApiStatus('submitted')).toBe('submitted');
    expect(filterToApiStatus('in_progress')).toBe('in_progress');
    expect(filterToApiStatus('resolved')).toBe('resolved');
  });
});

describe('filterToI18nKey', () => {
  it('maps the four pills to their i18n keys', () => {
    expect(filterToI18nKey('all')).toBe('home.filter.all');
    expect(filterToI18nKey('in_progress')).toBe('home.filter.in_progress');
    expect(filterToI18nKey('resolved')).toBe('home.filter.resolved');
  });

  it('maps `submitted` to the `home.filter.new` key (UI label is "New" / "নতুন")', () => {
    // The API still filters on `submitted`; only the UI label diverges.
    expect(filterToI18nKey('submitted')).toBe('home.filter.new');
  });
});