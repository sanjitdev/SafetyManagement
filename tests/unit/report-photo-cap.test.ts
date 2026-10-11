/**
 * Unit tests for the photo-cap derivation helper
 * (lib/report-photo-cap.ts).
 *
 * Covers the Bolt 002-003a Bolt Decision 2
 * (photo cap surface) — the default is 3; a
 * narrow category (narrowCategoryPhotoCap set)
 * narrows the cap; a null categoryId yields
 * the default.
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PHOTO_CAP,
  derivePhotoCap,
  type CategorySummaryLike,
} from '@/lib/report-photo-cap';

const categories: CategorySummaryLike[] = [
  { id: 'cat_streetlight', narrowCategoryPhotoCap: 2 },
  { id: 'cat_pothole', narrowCategoryPhotoCap: null },
  { id: 'cat_drainage', narrowCategoryPhotoCap: null },
  { id: 'cat_garbage', narrowCategoryPhotoCap: null },
  { id: 'cat_other', narrowCategoryPhotoCap: null },
];

describe('derivePhotoCap', () => {
  it('returns the default cap when the draft has no categoryId', () => {
    expect(derivePhotoCap(null, categories)).toBe(DEFAULT_PHOTO_CAP);
    expect(derivePhotoCap({ categoryId: null }, categories)).toBe(DEFAULT_PHOTO_CAP);
  });

  it('returns the default cap when the category has no narrow cap', () => {
    expect(derivePhotoCap({ categoryId: 'cat_pothole' }, categories)).toBe(DEFAULT_PHOTO_CAP);
  });

  it('returns the narrow cap when the category has narrowCategoryPhotoCap set', () => {
    expect(derivePhotoCap({ categoryId: 'cat_streetlight' }, categories)).toBe(2);
  });

  it('returns the default cap when the draft categoryId is not in the category list', () => {
    // Defensive: a stale draft referencing a category the city no longer
    // ships should not throw; the cap falls back to the default.
    expect(derivePhotoCap({ categoryId: 'cat_unknown' }, categories)).toBe(DEFAULT_PHOTO_CAP);
  });

  it('returns the default cap when the categories list is empty', () => {
    expect(derivePhotoCap({ categoryId: 'cat_streetlight' }, [])).toBe(DEFAULT_PHOTO_CAP);
  });
});
