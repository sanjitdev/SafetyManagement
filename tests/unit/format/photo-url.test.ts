/**
 * Unit tests for the photo-URL helper (lib/format/photo-url.ts).
 *
 * Context: a `TicketPhoto.url` column stores whatever the uploader
 * handed to the API, verbatim. That means ONE column holds three
 * shapes:
 *
 *   1. `data:image/jpeg;base64,…` — the inline path. This is the
 *      DEFAULT (no blob provider is configured out of the box), and
 *      it is what the Playwright visual baselines capture.
 *   2. `https://cdn.example.com/tickets/<key>` — the R2/S3 path with
 *      a public base URL.
 *   3. `/api/blob/<key>` — the local-filesystem blob path.
 *
 * Several surfaces guarded their thumbnail with `startsWith('http')`,
 * which matched ONLY shape 2. The citizen's own submitted photo —
 * shape 1, the default — rendered as a blank gradient square in the
 * feed, the home list, and every report card.
 *
 * These tests pin the accepted / rejected URL shapes so the guard
 * cannot silently regress.
 */

import { describe, expect, it } from 'vitest';
import {
  firstRenderablePhotoUrl,
  isRenderablePhotoUrl,
  thumbnailBackground,
} from '@/lib/format/photo-url';

const DATA_URL =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJ';

describe('isRenderablePhotoUrl', () => {
  it('accepts an inline data URL (the default upload path)', () => {
    expect(isRenderablePhotoUrl(DATA_URL)).toBe(true);
  });

  it('accepts an absolute http(s) URL (the R2/S3 path)', () => {
    expect(isRenderablePhotoUrl('https://cdn.example.com/tickets/a.jpg')).toBe(true);
    expect(isRenderablePhotoUrl('http://cdn.example.com/tickets/a.jpg')).toBe(true);
  });

  it('accepts a root-relative path (the local blob path)', () => {
    expect(isRenderablePhotoUrl('/api/blob/tickets/a.jpg')).toBe(true);
  });

  it('rejects an empty or whitespace-only value', () => {
    expect(isRenderablePhotoUrl('')).toBe(false);
    expect(isRenderablePhotoUrl('   ')).toBe(false);
    expect(isRenderablePhotoUrl(null)).toBe(false);
    expect(isRenderablePhotoUrl(undefined)).toBe(false);
  });

  it('rejects a script scheme (stored-URL XSS vector)', () => {
    expect(isRenderablePhotoUrl('javascript:alert(1)')).toBe(false);
    expect(isRenderablePhotoUrl('vbscript:msgbox(1)')).toBe(false);
  });

  it('rejects a non-image data URL', () => {
    expect(isRenderablePhotoUrl('data:text/html;base64,PHNjcmlwdD4=')).toBe(false);
  });
});

describe('firstRenderablePhotoUrl', () => {
  it('returns the first renderable URL', () => {
    expect(firstRenderablePhotoUrl([DATA_URL])).toBe(DATA_URL);
    expect(
      firstRenderablePhotoUrl([
        'https://cdn.example.com/a.jpg',
        DATA_URL,
      ]),
    ).toBe('https://cdn.example.com/a.jpg');
  });

  it('skips an unrenderable entry rather than blanking the thumbnail', () => {
    expect(
      firstRenderablePhotoUrl(['javascript:alert(1)', DATA_URL]),
    ).toBe(DATA_URL);
  });

  it('returns null for an empty, null, or fully-unrenderable list', () => {
    expect(firstRenderablePhotoUrl([])).toBeNull();
    expect(firstRenderablePhotoUrl(null)).toBeNull();
    expect(firstRenderablePhotoUrl(undefined)).toBeNull();
    expect(firstRenderablePhotoUrl(['javascript:alert(1)'])).toBeNull();
  });

  it('trims surrounding whitespace', () => {
    expect(firstRenderablePhotoUrl(['  ' + DATA_URL + '  '])).toBe(DATA_URL);
  });
});

describe('thumbnailBackground', () => {
  it('builds a quoted cover-cropped background', () => {
    expect(thumbnailBackground('https://cdn.example.com/a.jpg')).toBe(
      'url("https://cdn.example.com/a.jpg") center/cover no-repeat',
    );
  });

  it('quotes a data URL so the CSS function cannot be broken out of', () => {
    const bg = thumbnailBackground(DATA_URL);
    expect(bg).not.toBeNull();
    // The URL is wrapped in double quotes — an unquoted data URL
    // would be ambiguous to the CSS parser.
    expect(bg!.startsWith('url("data:image/jpeg;base64,')).toBe(true);
    expect(bg!.endsWith('") center/cover no-repeat')).toBe(true);
  });

  it('escapes a double quote in the URL', () => {
    const bg = thumbnailBackground('/api/blob/a".jpg');
    expect(bg).toBe('url("/api/blob/a%22.jpg") center/cover no-repeat');
  });

  it('returns null when there is nothing renderable', () => {
    expect(thumbnailBackground('')).toBeNull();
    expect(thumbnailBackground(null)).toBeNull();
    expect(thumbnailBackground('javascript:alert(1)')).toBeNull();
  });
});
