/**
 * Unit tests for the photo bucket helper
 * (lib/serializers/trail.ts → bucketPhotosByRole).
 *
 * Bolt 007-001 (Intent 007 — Citizen Resolution Visibility).
 *
 * Pinned behaviours:
 *   - `bucketPhotosByRole` partitions by `uploadedByRole`:
 *       'crew'  → afterPhotoUrls
 *       anything else (citizen / unknown) → beforePhotoUrls
 *   - The defensive fallback for unknown roles is intentional: a
 *     malformed legacy row never bleeds into the After group.
 *   - Ordering of the input is preserved in each output bucket
 *     (the function is non-sorting).
 *   - Empty input returns two empty arrays (not null).
 */

import { describe, expect, it } from 'vitest';
import { bucketPhotosByRole, type PhotoLike } from '@/lib/serializers/trail';

function mkPhoto(
  url: string,
  role: string,
  uploadedAt = '2026-10-01T09:59:00.000Z',
): PhotoLike {
  return { id: `tph_${url.slice(-3)}`, url, uploadedByRole: role, uploadedAt };
}

describe('bucketPhotosByRole', () => {
  it('partitions a 2-citizen + 1-crew fixture correctly', () => {
    const photos: PhotoLike[] = [
      mkPhoto('data:image/jpeg;base64,AAA', 'citizen', '2026-10-01T09:59:00.000Z'),
      mkPhoto('data:image/jpeg;base64,BBB', 'citizen', '2026-10-01T10:00:00.000Z'),
      mkPhoto('data:image/jpeg;base64,CCC', 'crew', '2026-10-02T08:30:00.000Z'),
    ];
    const out = bucketPhotosByRole(photos);
    expect(out.beforePhotoUrls).toEqual([
      'data:image/jpeg;base64,AAA',
      'data:image/jpeg;base64,BBB',
    ]);
    expect(out.afterPhotoUrls).toEqual(['data:image/jpeg;base64,CCC']);
  });

  it('handles a 0-citizen + 1-crew fixture (Before empty, After has 1)', () => {
    const photos: PhotoLike[] = [
      mkPhoto('data:image/jpeg;base64,CCC', 'crew'),
    ];
    const out = bucketPhotosByRole(photos);
    expect(out.beforePhotoUrls).toEqual([]);
    expect(out.afterPhotoUrls).toEqual(['data:image/jpeg;base64,CCC']);
  });

  it('handles a 1-citizen + 0-crew fixture (After empty, Before has 1)', () => {
    const photos: PhotoLike[] = [
      mkPhoto('data:image/jpeg;base64,AAA', 'citizen'),
    ];
    const out = bucketPhotosByRole(photos);
    expect(out.beforePhotoUrls).toEqual(['data:image/jpeg;base64,AAA']);
    expect(out.afterPhotoUrls).toEqual([]);
  });

  it('returns two empty arrays for empty input', () => {
    const out = bucketPhotosByRole([]);
    expect(out.beforePhotoUrls).toEqual([]);
    expect(out.afterPhotoUrls).toEqual([]);
  });

  it('buckets an unknown role as "citizen" (defensive fallback)', () => {
    // A malformed legacy row that ships a role string outside the
    // documented {'citizen', 'crew'} set must never appear in the
    // After group — that would imply the city has confirmed a fix
    // that may never have happened.
    const photos: PhotoLike[] = [
      mkPhoto('data:image/jpeg;base64,AAA', 'unknown'),
      mkPhoto('data:image/jpeg;base64,BBB', 'admin'),
      mkPhoto('data:image/jpeg;base64,CCC', ''),
    ];
    const out = bucketPhotosByRole(photos);
    expect(out.beforePhotoUrls).toEqual([
      'data:image/jpeg;base64,AAA',
      'data:image/jpeg;base64,BBB',
      'data:image/jpeg;base64,CCC',
    ]);
    expect(out.afterPhotoUrls).toEqual([]);
  });

  it('preserves input ordering within each bucket (non-sorting)', () => {
    const photos: PhotoLike[] = [
      mkPhoto('url-1', 'citizen', '2026-10-01T10:00:00.000Z'),
      mkPhoto('url-2', 'crew', '2026-10-02T10:00:00.000Z'),
      mkPhoto('url-3', 'citizen', '2026-10-01T11:00:00.000Z'),
      mkPhoto('url-4', 'crew', '2026-10-02T11:00:00.000Z'),
    ];
    const out = bucketPhotosByRole(photos);
    expect(out.beforePhotoUrls).toEqual(['url-1', 'url-3']);
    expect(out.afterPhotoUrls).toEqual(['url-2', 'url-4']);
  });

  it('does not mutate the input array', () => {
    const photos: PhotoLike[] = [
      mkPhoto('url-1', 'citizen'),
      mkPhoto('url-2', 'crew'),
    ];
    const before = [...photos];
    bucketPhotosByRole(photos);
    expect(photos).toEqual(before);
  });

  it('treats an empty uploadedByRole string as a citizen (defensive)', () => {
    const photos: PhotoLike[] = [mkPhoto('url-1', '')];
    const out = bucketPhotosByRole(photos);
    expect(out.beforePhotoUrls).toEqual(['url-1']);
    expect(out.afterPhotoUrls).toEqual([]);
  });
});
