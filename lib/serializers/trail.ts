/**
 * Trail filter + photo bucketing (lib/serializers/trail.ts).
 *
 * Bolt 007-001 (Intent 007 — Citizen Resolution Visibility).
 *
 * Two named exports, both pure functions with no I/O:
 *
 *   1. `applyCitizenTrailFilter(trail, language)` — rewrites any trail
 *      entry whose `note` matches the marker regex `^[a-z_]+:` to the
 *      localized "After photo added" string. Strategy: Replace (the
 *      citizen benefits from the "feel heard" trust signal — the trail
 *      entry remains in the timeline but in natural prose). A `note`
 *      that is `null` or doesn't match the regex is passed through
 *      unchanged. A non-citizen caller (dispatcher / crew / admin) gets
 *      a no-op.
 *
 *   2. `bucketPhotosByRole(photos)` — partitions `TicketPhoto[]` rows
 *      into `beforePhotoUrls` (uploadedByRole === 'citizen') and
 *      `afterPhotoUrls` (uploadedByRole === 'crew'). Unknown roles are
 *      bucketed as 'citizen' defensively so a malformed legacy row
 *      never bleeds into the After group.
 *
 * Kept out of the page file so:
 *   - The page stays presentation-only.
 *   - Any future citizen-facing surface that reads the trail benefits
 *     from the same filter.
 *   - The bucketing logic is unit-testable without a React render.
 */

import type { TrailEntryLike } from '@/lib/serializers/ticket';
import type { TicketStatus } from '@prisma/client';
import { t } from '@/lib/i18n/keys';

/**
 * Regex that detects any internal marker-shaped note the audit
 * pipeline or future v1.1+ writers might emit. The prefix is a single
 * word in `[a-z_]+` followed by a colon (`: `). The marker body is
 * not captured — the whole thing is replaced wholesale by the
 * localised "After photo added" string.
 */
const MARKER_REGEX = /^[a-z_]+:/;

export function applyCitizenTrailFilter<T extends TrailEntryLike>(
  trail: readonly T[],
  language: 'bn' | 'en',
): T[] {
  const localized = t('trail.afterPhotoAdded', null, language);
  return trail.map((entry) => {
    if (entry.note == null) return entry;
    if (!MARKER_REGEX.test(entry.note)) return entry;
    // Replace strategy: keep the trail entry in the timeline; rewrite
    // the note to the localised "After photo added" string. The
    // timestamp + toStatus are preserved so the entry still slots into
    // the visual progress timeline.
    return { ...entry, note: localized };
  });
}

export interface PhotoLike {
  id?: string;
  url: string;
  uploadedByRole: string;
  uploadedAt: Date | string;
}

export interface BeforeAfterBuckets {
  beforePhotoUrls: string[];
  afterPhotoUrls: string[];
}

export function bucketPhotosByRole(
  photos: readonly PhotoLike[],
): BeforeAfterBuckets {
  const beforePhotoUrls: string[] = [];
  const afterPhotoUrls: string[] = [];
  for (const photo of photos) {
    if (photo.uploadedByRole === 'crew') {
      afterPhotoUrls.push(photo.url);
    } else {
      // 'citizen' OR unknown (defensive fallback) → Before group.
      // A malformed legacy row never accidentally appears in the After
      // group, which would imply the city has confirmed a fix that
      // may never have happened.
      beforePhotoUrls.push(photo.url);
    }
  }
  return { beforePhotoUrls, afterPhotoUrls };
}

/**
 * Re-exported for backward compatibility with any test fixture that
 * imports `TicketStatus` from this module (the trail filter is the
 * only place the public type was historically re-exported).
 */
export type { TicketStatus };