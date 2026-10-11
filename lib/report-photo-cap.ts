/**
 * Photo-cap derivation for the report flow
 * (lib/report-photo-cap.ts).
 *
 * The default cap is 3 photos per the UX Review
 * revision #6 (2026-09-18). Narrow categories
 * (currently just `cat_streetlight`, cap 2) have
 * a lower cap. The cap is applied at the photo
 * step (1.8), not the category step (1.9).
 *
 * This helper is pure so it can be unit-tested
 * without a React runtime. The home page and the
 * bootstrap endpoint both read the category
 * list, but only the photo step consumes this
 * helper.
 */

import type { ReportDraft } from './report-draft';

export const DEFAULT_PHOTO_CAP = 3;

export interface CategorySummaryLike {
  id: string;
  /** When set, overrides the default cap for this category. */
  narrowCategoryPhotoCap: number | null;
}

/**
 * Compute the photo cap for the in-flight draft:
 *   - if the draft has a `categoryId` AND the
 *     matching category in `categories` has
 *     `narrowCategoryPhotoCap` set, return that.
 *   - else, return `DEFAULT_PHOTO_CAP`.
 *
 * A `null` `categoryId` (the citizen has not
 * picked a category yet) yields the default;
 * this is the common case on the first visit to
 * the photo step.
 */
export function derivePhotoCap(
  draft: Pick<ReportDraft, 'categoryId'> | null,
  categories: readonly CategorySummaryLike[],
): number {
  if (!draft?.categoryId) return DEFAULT_PHOTO_CAP;
  const cat = categories.find((c) => c.id === draft.categoryId);
  if (cat?.narrowCategoryPhotoCap != null) {
    return cat.narrowCategoryPhotoCap;
  }
  return DEFAULT_PHOTO_CAP;
}
