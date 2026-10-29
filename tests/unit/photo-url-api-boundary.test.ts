/**
 * Vitest: regression guard for the photo-URL validation contract at
 * the API boundary.
 *
 * ## What this pins
 *
 * A `TicketPhoto.url` is persisted VERBATIM and later handed to
 * `<img src>` and `background-image: url(...)`. The API boundary
 * therefore has to accept exactly the shapes the renderer can
 * display — no more, no less:
 *
 *   - `data:image/<subtype>;base64,<payload>` (the inline default —
 *     the citizen's photo picker inlines the file bytes)
 *   - `http://` / `https://` absolute URLs (the R2/S3 path)
 *   - root-relative paths (`/api/blob/…`, the local blob provider)
 *
 * ## Why `z.string().url()` is not that contract
 *
 * In Zod 3.x, `z.string().url()` is implemented as `new URL(value)`,
 * which parses ANY absolute scheme. That means it:
 *
 *   - REJECTS the root-relative `/api/blob/…` shape — so a report
 *     filed with the local blob provider failed validation with
 *     HTTP 400 and the photo was never persisted;
 *   - ACCEPTS `javascript:` and `data:text/html` — a stored-URL XSS
 *     vector, since the value is persisted and later rendered.
 *
 * So the boundary uses `isAcceptablePhotoUrl` from
 * `lib/format/photo-url.ts` — the WRITE-side counterpart of the
 * renderer's `isRenderablePhotoUrl`. The two must agree.
 *
 * These tests pin that agreement, and pin that the raw
 * `z.string().url()` shape cannot silently come back.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import {
  isAcceptablePhotoUrl,
  isRenderablePhotoUrl,
} from '@/lib/format/photo-url';

const CREATE_TICKET_ROUTE = path.join(
  process.cwd(),
  'app',
  'api',
  'tickets',
  'route.ts',
);

const CREW_PHOTO_ROUTE = path.join(
  process.cwd(),
  'app',
  'api',
  'v1',
  'crew',
  'tickets',
  '[id]',
  'photos',
  'route.ts',
);

const DATA_URL =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJ';

/**
 * The photo-URL schema the routes use. Mirrors the route source:
 * a string with a length cap, refined by `isAcceptablePhotoUrl`.
 */
const PhotoUrlSchema = z
  .string()
  .max(2_000_000)
  .refine(isAcceptablePhotoUrl, {
    message:
      'photo URL must be an inline image data URL, an http(s) URL, or a root-relative path',
  });

describe('photo URL validation — the shapes the app actually stores', () => {
  it('accepts the inline data URL (the default upload path)', () => {
    const parsed = PhotoUrlSchema.safeParse(DATA_URL);
    expect(parsed.success).toBe(true);
  });

  it('accepts an absolute http(s) URL (the R2/S3 path)', () => {
    expect(PhotoUrlSchema.safeParse('https://cdn.example.com/a.jpg').success).toBe(
      true,
    );
    expect(PhotoUrlSchema.safeParse('http://cdn.example.com/a.jpg').success).toBe(
      true,
    );
  });

  it('accepts a root-relative path (the local blob path)', () => {
    // This is the shape `z.string().url()` rejected — the whole
    // submission failed with HTTP 400 and the photo was dropped.
    expect(PhotoUrlSchema.safeParse('/api/blob/tickets/a.jpg').success).toBe(true);
  });

  it('rejects a script scheme (stored-URL XSS vector)', () => {
    const parsed = PhotoUrlSchema.safeParse('javascript:alert(1)');
    expect(parsed.success).toBe(false);
  });

  it('rejects a non-image data URL', () => {
    expect(
      PhotoUrlSchema.safeParse('data:text/html;base64,PHNjcmlwdD4=').success,
    ).toBe(false);
  });

  it('rejects an empty value', () => {
    expect(PhotoUrlSchema.safeParse('').success).toBe(false);
  });

  it('does not use z.string().url() — it is the wrong contract', () => {
    // Zod 3.x's `url()` check is `new URL(value)`, which parses ANY
    // absolute scheme. It therefore ACCEPTED a script scheme…
    expect(z.string().url().safeParse('javascript:alert(1)').success).toBe(true);
    // …and REJECTED the root-relative local-blob path, which failed
    // the whole submission with HTTP 400.
    expect(z.string().url().safeParse('/api/blob/tickets/a.jpg').success).toBe(
      false,
    );
  });

  it('keeps the write-side and read-side contracts in agreement', () => {
    const cases: Array<string | null | undefined> = [
      DATA_URL,
      'https://cdn.example.com/a.jpg',
      'http://cdn.example.com/a.jpg',
      '/api/blob/tickets/a.jpg',
      '',
      '   ',
      null,
      undefined,
      'javascript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
    ];
    for (const value of cases) {
      expect(isAcceptablePhotoUrl(value)).toBe(isRenderablePhotoUrl(value));
    }
  });
});

describe('POST /api/tickets — photo URL boundary', () => {
  const source = readFileSync(CREATE_TICKET_ROUTE, 'utf8');

  it('does not validate photoUrls with z.string().url()', () => {
    expect(source).not.toMatch(/photoUrls:\s*z\.array\(z\.string\(\)\.url\(\)\)/);
    expect(source).not.toMatch(/z\.array\(z\.string\(\)\.url\(\)\)/);
  });

  it('validates photoUrls with the shared photo-URL contract', () => {
    expect(source).toContain('isAcceptablePhotoUrl');
    expect(source).toMatch(/photoUrls:\s*z\.array\(PhotoUrl\)/);
  });
});

describe('POST /api/v1/crew/tickets/[id]/photos — photo URL boundary', () => {
  const source = readFileSync(CREW_PHOTO_ROUTE, 'utf8');

  it('does not validate the inline photo url with z.string().url()', () => {
    expect(source).not.toMatch(/url:\s*z\.string\(\)\.url\(\)/);
  });

  it('validates the inline photo url with the shared contract', () => {
    expect(source).toContain('isAcceptablePhotoUrl');
  });
});
