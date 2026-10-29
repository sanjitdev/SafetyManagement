/**
 * Vitest: the photo-payload size probe (`lib/photo/payload.ts`).
 *
 * ## What this pins
 *
 * The API must tell "this photo is too large" apart from "this
 * request is invalid". Zod's `.max()` failure is NOT a usable
 * signal — a long `note` produces the IDENTICAL `too_big` issue
 * code — so the dedicated `photo_too_large` code is decided on the
 * RAW payload, before the Zod parse.
 *
 * These tests pin the boundary (exactly at the cap is OK, one
 * character over is not) and the three payload shapes the app uses.
 */

import { describe, expect, it } from 'vitest';
import { hasOversizedPhoto } from '@/lib/photo/payload';
import { MAX_PHOTO_URL_CHARS } from '@/lib/format/photo-url';

const over = MAX_PHOTO_URL_CHARS + 1;
const at = MAX_PHOTO_URL_CHARS;

describe('hasOversizedPhoto', () => {
  it('accepts a photo under the cap', () => {
    expect(
      hasOversizedPhoto({ photoUrls: ['data:image/jpeg;base64,AAAA'] }),
    ).toBe(false);
  });

  it('accepts a photo exactly AT the cap', () => {
    expect(hasOversizedPhoto({ photoUrls: ['A'.repeat(at)] })).toBe(false);
  });

  it('rejects a photo one character over the cap', () => {
    expect(hasOversizedPhoto({ photoUrls: ['A'.repeat(over)] })).toBe(true);
  });

  it('checks EVERY element of photoUrls, not just the first', () => {
    expect(
      hasOversizedPhoto({
        photoUrls: ['data:image/jpeg;base64,AAAA', 'A'.repeat(over)],
      }),
    ).toBe(true);
  });

  it('ignores non-string array elements', () => {
    expect(hasOversizedPhoto({ photoUrls: [123, null, undefined] })).toBe(
      false,
    );
  });

  it('handles the citizen photoBlobs array', () => {
    expect(
      hasOversizedPhoto({
        photoBlobs: [{ dataBase64: 'A'.repeat(over), mimeType: 'image/jpeg' }],
      }),
    ).toBe(true);
    expect(
      hasOversizedPhoto({
        photoBlobs: [{ dataBase64: 'AAAA', mimeType: 'image/jpeg' }],
      }),
    ).toBe(false);
  });

  it('handles the crew route\'s bare { dataBase64 } payload', () => {
    expect(
      hasOversizedPhoto({ dataBase64: 'A'.repeat(over) }),
    ).toBe(true);
    expect(hasOversizedPhoto({ dataBase64: 'AAAA' })).toBe(false);
  });

  it('handles the crew route\'s bare { url } payload', () => {
    expect(hasOversizedPhoto({ url: 'A'.repeat(over) })).toBe(true);
    expect(hasOversizedPhoto({ url: 'https://example.com/a.jpg' })).toBe(false);
  });

  it('is false for an empty object', () => {
    expect(hasOversizedPhoto({})).toBe(false);
  });

  it('never throws on a non-object body', () => {
    expect(hasOversizedPhoto(null)).toBe(false);
    expect(hasOversizedPhoto(undefined)).toBe(false);
    expect(hasOversizedPhoto('a string')).toBe(false);
    expect(hasOversizedPhoto(42)).toBe(false);
  });

  it('does not flag a long note as a photo problem', () => {
    // The whole reason the probe exists on the RAW body: a
    // length-capped `note` produces the same Zod issue code as an
    // oversize photo, so the probe must key on the photo FIELDS.
    expect(hasOversizedPhoto({ note: 'A'.repeat(10_000) })).toBe(false);
  });
});
