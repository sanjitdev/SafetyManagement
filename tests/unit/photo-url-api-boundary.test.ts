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
  MAX_PHOTO_URL_CHARS,
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

const BLOB_STORE_SOURCE = path.join(
  process.cwd(),
  'lib',
  'storage',
  'blob.ts',
);

const DATA_URL =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJ';

/**
 * The photo-URL schema the routes use. Mirrors the route source:
 * a string with a length cap, refined by `isAcceptablePhotoUrl`.
 */
const PhotoUrlSchema = z
  .string()
  .max(MAX_PHOTO_URL_CHARS)
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

/**
 * ── The per-photo size cap ──────────────────────────────────────
 *
 * The cap used to be 2,000,000 characters (≈1.5 MB binary). A
 * modern phone photo is 3–8 MB binary → a 4–11 MB base64 data-URL
 * string → the API rejected it → the citizen saw the literal
 * string `invalid_input` on submit. The cap now matches the blob
 * store's own ceiling, and the client downscales to 1600px/q80
 * before sending (`lib/photo/downscale.ts`).
 */
describe('the per-photo size cap', () => {
  const atCap = `data:image/jpeg;base64,${'A'.repeat(
    MAX_PHOTO_URL_CHARS - 'data:image/jpeg;base64,'.length,
  )}`;

  it('accepts a photo at exactly the cap', () => {
    expect(atCap.length).toBe(MAX_PHOTO_URL_CHARS);
    expect(PhotoUrlSchema.safeParse(atCap).success).toBe(true);
  });

  it('rejects a photo one character over the cap', () => {
    const parsed = PhotoUrlSchema.safeParse(`${atCap}A`);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.code).toBe('too_big');
    }
  });

  it('accepts a 4 MB data URL — the size that broke the submission', () => {
    // The regression guard for "report note input shows invalid
    // input when submitting". Under the old 2 M cap this was a
    // 400 `invalid_input`.
    const big = `data:image/jpeg;base64,${'A'.repeat(4_000_000)}`;
    expect(PhotoUrlSchema.safeParse(big).success).toBe(true);
  });

  it('admits everything the blob store would accept', () => {
    // 5 MiB binary → base64 is 4 chars per 3 bytes.
    const base64CharsForMaxBlob = Math.ceil((5 * 1024 * 1024) / 3) * 4;
    expect(MAX_PHOTO_URL_CHARS).toBeGreaterThanOrEqual(
      base64CharsForMaxBlob + 64,
    );
  });

  it('stays in sync with the blob store\'s own 5 MiB ceiling', () => {
    // The URL cap cannot import `MAX_BLOB_BYTES` (that module is
    // server-only), so the relationship is pinned here instead.
    const blobSource = readFileSync(BLOB_STORE_SOURCE, 'utf8');
    expect(blobSource).toMatch(
      /MAX_BLOB_BYTES\s*=\s*5\s*\*\s*1024\s*\*\s*1024/,
    );
  });
});

describe('the shared cap constant is used by both routes', () => {
  const createSource = readFileSync(CREATE_TICKET_ROUTE, 'utf8');
  const crewSource = readFileSync(CREW_PHOTO_ROUTE, 'utf8');

  it('replaces the old hard-coded 2,000,000 literal', () => {
    expect(createSource).not.toMatch(/2_000_000/);
    expect(crewSource).not.toMatch(/2_000_000/);
  });

  it('is imported by both routes', () => {
    expect(createSource).toContain('MAX_PHOTO_URL_CHARS');
    expect(crewSource).toContain('MAX_PHOTO_URL_CHARS');
  });

  it('gives both routes the dedicated photo_too_large code', () => {
    expect(createSource).toContain("'photo_too_large'");
    expect(crewSource).toContain("'photo_too_large'");
    expect(createSource).toContain('hasOversizedPhoto');
    expect(crewSource).toContain('hasOversizedPhoto');
  });
});
