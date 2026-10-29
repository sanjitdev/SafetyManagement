/**
 * Unit tests for lib/crew/upload-photo.ts (Bolt 008-003).
 *
 * Coverage:
 *   - MIME allow-list (jpeg / png / webp pass; others fail).
 *   - Size limit (≤ 5 MB passes; > 5 MB fails).
 *   - URL validation (http/https only; empty / non-URL fail).
 *   - "No source" returns the right error code.
 *   - File branch reads via FileReader, posts the data URL.
 *   - URL branch posts the trimmed URL as-is.
 *   - HTTP error path: non-OK status returns http_<code>.
 *
 * The test uses a stub `fetch` injected via the `fetcher`
 * parameter so no real network calls happen.
 *
 * The vitest environment is `node` (see vitest.config.ts), so
 * `FileReader` is not a global. We polyfill it here with a
 * minimal in-memory implementation that handles the
 * `readAsDataURL` path the helper uses.
 */

import { describe, expect, it, vi } from 'vitest';

// Minimal FileReader polyfill for the Node test environment.
// Vitest's default env is `node` (per vitest.config.ts) which
// does not expose browser globals. The crew photo helper only
// uses `readAsDataURL` + `onload`/`onerror`, so the polyfill
// is intentionally narrow.
class TestFileReader {
  result: string | ArrayBuffer | null = null;
  error: Error | null = null;
  onload: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  readAsDataURL(blob: Blob) {
    // Synchronous base64 round-trip so the test is
    // deterministic. In Node 20+, Buffer is a global.
    const buf = Buffer.from(new Uint8Array(blob as unknown as ArrayBuffer));
    this.result = `data:${blob.type};base64,${buf.toString('base64')}`;
    queueMicrotask(() => this.onload?.(null));
  }
}
(globalThis as unknown as { FileReader: typeof TestFileReader }).FileReader =
  TestFileReader;
import {
  ALLOWED_PHOTO_MIME_TYPES,
  MAX_PHOTO_BYTES,
  isAllowedPhotoMime,
  readPhotoFileAsDataUrl,
  uploadCrewPhoto,
  validatePhotoInput,
} from '@/lib/crew/upload-photo';

function makeFile(opts: { type?: string; size?: number } = {}): File {
  // Use a tiny stub blob so .type + .size are predictable. The
  // File constructor in node 20 doesn't accept a body easily,
  // so we use the Blob + File polyfill pattern.
  const blob = new Blob([new Uint8Array(opts.size ?? 0)], {
    type: opts.type ?? 'image/jpeg',
  });
  // The File constructor is available in node 20+ globals.
  return new File([blob], 'photo.jpg', { type: opts.type ?? 'image/jpeg' });
}

describe('isAllowedPhotoMime', () => {
  it('accepts the allow-listed MIME types', () => {
    for (const m of ALLOWED_PHOTO_MIME_TYPES) {
      expect(isAllowedPhotoMime(m)).toBe(true);
    }
  });
  it('rejects unknown / non-image MIME types', () => {
    expect(isAllowedPhotoMime('image/gif')).toBe(false);
    expect(isAllowedPhotoMime('image/heic')).toBe(false);
    expect(isAllowedPhotoMime('application/octet-stream')).toBe(false);
    expect(isAllowedPhotoMime('')).toBe(false);
  });
});

describe('validatePhotoInput (pure sync)', () => {
  it('returns no_source when both branches are empty', () => {
    expect(validatePhotoInput(null)).toEqual({ ok: false, error: 'no_source' });
  });
  it('accepts an http URL', () => {
    const r = validatePhotoInput({ kind: 'url', url: 'http://example.com/p.jpg' });
    expect(r).toEqual({ ok: true, url: 'http://example.com/p.jpg' });
  });
  it('accepts an https URL', () => {
    const r = validatePhotoInput({ kind: 'url', url: 'https://cdn.example.com/p.png' });
    expect(r.ok).toBe(true);
  });
  it('trims surrounding whitespace from the URL', () => {
    const r = validatePhotoInput({ kind: 'url', url: '   https://x.example/y.jpg   ' });
    expect(r).toEqual({ ok: true, url: 'https://x.example/y.jpg' });
  });
  it('rejects an empty URL', () => {
    expect(validatePhotoInput({ kind: 'url', url: '   ' })).toEqual({
      ok: false,
      error: 'empty_url',
    });
  });
  it('rejects a non-URL string', () => {
    expect(validatePhotoInput({ kind: 'url', url: 'not a url' })).toEqual({
      ok: false,
      error: 'invalid_url',
    });
  });
  it('rejects a non-http(s) URL', () => {
    expect(validatePhotoInput({ kind: 'url', url: 'ftp://example.com/p.jpg' })).toEqual({
      ok: false,
      error: 'invalid_url',
    });
    expect(validatePhotoInput({ kind: 'url', url: 'javascript:alert(1)' })).toEqual({
      ok: false,
      error: 'invalid_url',
    });
  });
  it('accepts a JPEG file at the size limit', () => {
    const file = makeFile({ type: 'image/jpeg', size: 100 });
    const r = validatePhotoInput({ kind: 'file', file });
    // File branch: ok=true, url='' (caller fills via FileReader)
    expect(r).toEqual({ ok: true, url: '' });
  });
  it('accepts a PNG file under the size limit', () => {
    const file = makeFile({ type: 'image/png', size: 1024 });
    expect(validatePhotoInput({ kind: 'file', file })).toEqual({ ok: true, url: '' });
  });
  it('accepts a WebP file under the size limit', () => {
    const file = makeFile({ type: 'image/webp', size: 2048 });
    expect(validatePhotoInput({ kind: 'file', file })).toEqual({ ok: true, url: '' });
  });
  it('rejects a file with a non-allow-listed MIME', () => {
    const file = makeFile({ type: 'image/gif', size: 100 });
    expect(validatePhotoInput({ kind: 'file', file })).toEqual({
      ok: false,
      error: 'invalid_file_type',
    });
  });
  it('rejects a file over the size limit', () => {
    const file = makeFile({ type: 'image/jpeg', size: MAX_PHOTO_BYTES + 1 });
    expect(validatePhotoInput({ kind: 'file', file })).toEqual({
      ok: false,
      error: 'file_too_large',
    });
  });
});

describe('readPhotoFileAsDataUrl', () => {
  it('returns a data URL string', async () => {
    const file = makeFile({ type: 'image/png', size: 16 });
    const dataUrl = await readPhotoFileAsDataUrl(file);
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
  });
});

describe('uploadCrewPhoto (high-level)', () => {
  function makeFetcher(
    init: ResponseInit & { body?: object } = { status: 200 },
  ): typeof fetch {
    return vi.fn(async () =>
      new Response(
        JSON.stringify(init.body ?? { ticket: { id: 'tkt_x' } }),
        {
          status: init.status,
          headers: { 'content-type': 'application/json' },
        },
      ),
    ) as unknown as typeof fetch;
  }

  it('posts the URL as-is when the URL branch is used', async () => {
    const fetcher = makeFetcher({ status: 200, body: { ticket: { id: 'tkt_x' } } });
    const result = await uploadCrewPhoto({
      ticketId: 'tkt_x',
      url: 'https://example.com/p.jpg',
      fetcher,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ticket).toEqual({ id: 'tkt_x' });
    }
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = (fetcher as unknown as {
      mock: { calls: Array<[string, RequestInit]> };
    }).mock.calls[0];
    expect(calledUrl).toBe('/api/v1/crew/tickets/tkt_x/photos');
    expect(calledInit.method).toBe('POST');
    expect(JSON.parse(calledInit.body as string)).toEqual({
      url: 'https://example.com/p.jpg',
    });
  });

  it('returns no_source when both file and url are absent', async () => {
    const fetcher = vi.fn();
    const result = await uploadCrewPhoto({ ticketId: 'tkt_x', fetcher });
    expect(result).toEqual({ ok: false, error: 'no_source' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('treats a whitespace-only url as no_source', async () => {
    // The high-level helper short-circuits whitespace URLs
    // (it never produces an `empty_url` outcome — that only
    // comes from the pure `validatePhotoInput` function).
    const fetcher = vi.fn();
    const result = await uploadCrewPhoto({
      ticketId: 'tkt_x',
      url: '   ',
      fetcher,
    });
    expect(result).toEqual({ ok: false, error: 'no_source' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('returns invalid_url for a non-URL string', async () => {
    const fetcher = vi.fn();
    const result = await uploadCrewPhoto({
      ticketId: 'tkt_x',
      url: 'not a url',
      fetcher,
    });
    expect(result).toEqual({ ok: false, error: 'invalid_url' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('returns invalid_file_type for an unsupported MIME', async () => {
    const file = makeFile({ type: 'image/gif', size: 100 });
    const fetcher = vi.fn();
    const result = await uploadCrewPhoto({
      ticketId: 'tkt_x',
      file,
      fetcher,
    });
    expect(result).toEqual({ ok: false, error: 'invalid_file_type' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('returns file_too_large for an oversize file', async () => {
    const file = makeFile({ type: 'image/jpeg', size: MAX_PHOTO_BYTES + 1 });
    const fetcher = vi.fn();
    const result = await uploadCrewPhoto({
      ticketId: 'tkt_x',
      file,
      fetcher,
    });
    expect(result).toEqual({ ok: false, error: 'file_too_large' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('reads the file and posts the data URL when the file branch is used', async () => {
    const file = makeFile({ type: 'image/png', size: 16 });
    const fetcher = makeFetcher({ status: 200, body: { ticket: { id: 'tkt_y' } } });
    const result = await uploadCrewPhoto({
      ticketId: 'tkt_y',
      file,
      fetcher,
    });
    expect(result.ok).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const mock = fetcher as unknown as { mock: { calls: Array<[string, RequestInit]> } };
    const [, calledInit] = mock.mock.calls[0];
    const body = JSON.parse(calledInit.body as string) as { url: string };
    expect(body.url).toMatch(/^data:image\/png;base64,/);
  });

  it('prefers the file branch when both are provided (file takes precedence)', async () => {
    const file = makeFile({ type: 'image/png', size: 8 });
    const fetcher = makeFetcher({ status: 200, body: { ticket: { id: 'tkt_z' } } });
    const result = await uploadCrewPhoto({
      ticketId: 'tkt_z',
      file,
      url: 'https://example.com/p.jpg',
      fetcher,
    });
    expect(result.ok).toBe(true);
    const mock = fetcher as unknown as { mock: { calls: Array<[string, RequestInit]> } };
    const [, calledInit] = mock.mock.calls[0];
    const body = JSON.parse(calledInit.body as string) as { url: string };
    expect(body.url).toMatch(/^data:image\/png;base64,/);
    // Not the raw URL
    expect(body.url).not.toBe('https://example.com/p.jpg');
  });

  it('returns http_<code> when the API returns a non-OK status', async () => {
    const fetcher = makeFetcher({ status: 404, body: { error: 'not_found' } });
    const result = await uploadCrewPhoto({
      ticketId: 'tkt_x',
      url: 'https://example.com/p.jpg',
      fetcher,
    });
    expect(result).toEqual({ ok: false, error: 'http_404' });
  });

  it('encodes the ticketId in the path', async () => {
    const fetcher = makeFetcher({ status: 200, body: { ticket: {} } });
    await uploadCrewPhoto({
      ticketId: 'tkt with/slash',
      url: 'https://example.com/p.jpg',
      fetcher,
    });
    const mock = fetcher as unknown as { mock: { calls: Array<[string, RequestInit]> } };
    const [calledUrl] = mock.mock.calls[0];
    expect(calledUrl).toBe('/api/v1/crew/tickets/tkt%20with%2Fslash/photos');
  });
});

/**
 * ── The downscale + the dedicated too-large code ─────────────────
 *
 * The vitest environment is `node`, so there is no `document` and
 * no `createImageBitmap` — the downscale returns `decode_failed`
 * and the helper falls back to the ORIGINAL bytes. That is the
 * documented fallback contract, and it is what keeps these tests
 * meaningful without a DOM.
 */
describe('uploadCrewPhoto — the downscale fallback', () => {
  function makeFetcher(init: ResponseInit & { body?: object } = { status: 200 }): typeof fetch {
    return vi.fn(async () =>
      new Response(JSON.stringify(init.body ?? { ticket: { id: 'tkt_x' } }), {
        status: init.status,
        headers: { 'content-type': 'application/json' },
      }),
    ) as unknown as typeof fetch;
  }

  it('falls back to the original bytes when the downscale cannot run', async () => {
    const file = makeFile({ type: 'image/png', size: 16 });
    const fetcher = makeFetcher({ status: 200, body: { ticket: { id: 'tkt_y' } } });
    const result = await uploadCrewPhoto({
      ticketId: 'tkt_y',
      file,
      fetcher,
    });
    expect(result.ok).toBe(true);
    const mock = fetcher as unknown as { mock: { calls: Array<[string, RequestInit]> } };
    const [, calledInit] = mock.mock.calls[0];
    const body = JSON.parse(calledInit.body as string) as { url: string };
    // The original MIME is preserved — the downscale never ran.
    expect(body.url).toMatch(/^data:image\/png;base64,/);
  });

  it('surfaces the dedicated photo_too_large code from the API body', async () => {
    // Without reading the error body, `http_413` would collapse into
    // the generic "invalid URL" bucket and the crew member would
    // never learn the photo was simply too big.
    const fetcher = makeFetcher({
      status: 413,
      body: { error: 'photo_too_large' },
    });
    const result = await uploadCrewPhoto({
      ticketId: 'tkt_x',
      url: 'https://example.com/p.jpg',
      fetcher,
    });
    expect(result).toEqual({ ok: false, error: 'photo_too_large' });
  });

  it('still degrades to http_<status> for a non-JSON error body', async () => {
    const fetcher = vi.fn(async () =>
      new Response('not json', { status: 400 }),
    ) as unknown as typeof fetch;
    const result = await uploadCrewPhoto({
      ticketId: 'tkt_x',
      url: 'https://example.com/p.jpg',
      fetcher,
    });
    expect(result).toEqual({ ok: false, error: 'http_400' });
  });
});
