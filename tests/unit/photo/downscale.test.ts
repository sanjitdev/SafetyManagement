/**
 * Vitest: the client-side photo downscale helper
 * (`lib/photo/downscale.ts`).
 *
 * ## What this pins
 *
 * The citizen's photo picker used to inline the chosen file's bytes
 * VERBATIM (`reader.readAsDataURL(file)`). A modern phone photo is
 * 3–8 MB binary → a 4–11 MB base64 data-URL string → the API's
 * per-photo cap rejected it → the citizen saw an opaque
 * `invalid_input` on submit. The compression policy was already
 * recorded in the design artifacts:
 *
 *   "max 1600px long edge, JPEG quality 80, EXIF stripped except GPS"
 *
 * …and was never implemented. This module implements it, and these
 * tests pin it.
 *
 * ## Why the DOM is stubbed
 *
 * `vitest.config.ts` sets `environment: 'node'` and the repo
 * installs no jsdom/happy-dom, so `document` / `createImageBitmap`
 * are absent. The pure dimension maths is therefore tested
 * directly, and the browser-only encode path is exercised with a
 * minimal stub injected into `globalThis` — the same polyfill
 * technique `tests/unit/crew/upload-photo.test.ts` uses for
 * `FileReader`.
 */

import { describe, expect, it, afterEach } from 'vitest';
import {
  ALLOWED_DOWNSCALE_MIME_TYPES,
  base64PayloadFromDataUrl,
  computeDownscaleDimensions,
  downscalePhotoFile,
  encodeScaledBitmap,
  PHOTO_JPEG_QUALITY,
  PHOTO_MAX_LONG_EDGE,
  PHOTO_PASSTHROUGH_MAX_BYTES,
} from '@/lib/photo/downscale';
import { MAX_PHOTO_URL_CHARS } from '@/lib/format/photo-url';

// ── Test doubles ─────────────────────────────────────────────────

/**
 * A minimal `File` stand-in. The real `File` is available in Node
 * 20, but constructing one with a specific `type` and `size` is
 * simpler with a plain object, and the helper only reads
 * `file.type`, `file.size` and (via FileReader) `file.name`.
 */
function makeFile(opts: {
  type: string;
  size: number;
  name?: string;
}): File {
  return {
    type: opts.type,
    size: opts.size,
    name: opts.name ?? 'photo.jpg',
  } as unknown as File;
}

/**
 * A `FileReader` stub that resolves the given data URL. The repo
 * already polyfills `FileReader` in the crew upload test; this one
 * is minimal and always succeeds.
 */
class StubFileReader {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  result: string | ArrayBuffer | null = null;
  error: unknown = null;
  readAsDataURL(_file: File) {
    this.result = 'data:image/jpeg;base64,STUB';
    this.onload?.();
  }
  readAsArrayBuffer(_file: File) {
    this.result = new ArrayBuffer(0);
    this.onload?.();
  }
}

/**
 * A `FileReader` stub whose read ALWAYS FAILS. Exercises the
 * `reader.onerror` branch of `readFileAsDataUrl`.
 */
class FailingFileReader {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  result: string | ArrayBuffer | null = null;
  error: unknown = null;
  readAsDataURL(_file: File) {
    this.error = new Error('read_failed');
    this.onerror?.();
  }
}

/**
 * A `FileReader` stub whose read THROWS synchronously. Exercises
 * the `try/catch` around the read promise.
 */
class ThrowingFileReader {
  readAsDataURL(_file: File): never {
    throw new Error('boom');
  }
}

const g = globalThis as unknown as Record<string, unknown>;

afterEach(() => {
  delete g.FileReader;
  delete g.createImageBitmap;
  delete g.document;
  delete g.Image;
  delete g.URL;
});

// ── The pure core ───────────────────────────────────────────────

describe('computeDownscaleDimensions', () => {
  it('scales a landscape photo to the 1600px long edge', () => {
    expect(computeDownscaleDimensions(4000, 3000)).toEqual({
      width: 1600,
      height: 1200,
      changed: true,
    });
  });

  it('scales a portrait photo to the 1600px long edge', () => {
    expect(computeDownscaleDimensions(3000, 4000)).toEqual({
      width: 1200,
      height: 1600,
      changed: true,
    });
  });

  it('scales a square photo to the 1600px long edge', () => {
    expect(computeDownscaleDimensions(2000, 2000)).toEqual({
      width: 1600,
      height: 1600,
      changed: true,
    });
  });

  it('leaves an already-small photo alone', () => {
    expect(computeDownscaleDimensions(1600, 900)).toEqual({
      width: 1600,
      height: 900,
      changed: false,
    });
  });

  it('leaves a 1×1 image alone (the crew test fixture)', () => {
    expect(computeDownscaleDimensions(1, 1)).toEqual({
      width: 1,
      height: 1,
      changed: false,
    });
  });

  it('does not divide by zero on a degenerate size', () => {
    expect(computeDownscaleDimensions(0, 0)).toEqual({
      width: 0,
      height: 0,
      changed: false,
    });
    expect(computeDownscaleDimensions(-5, 10).changed).toBe(false);
  });

  it('never returns a zero dimension', () => {
    const out = computeDownscaleDimensions(10000, 3);
    expect(out.width).toBeGreaterThanOrEqual(1);
    expect(out.height).toBeGreaterThanOrEqual(1);
  });

  it('preserves the aspect ratio within a pixel', () => {
    const out = computeDownscaleDimensions(4032, 3024);
    expect(out.width / out.height).toBeCloseTo(4032 / 3024, 1);
  });

  it('respects a custom max long edge', () => {
    expect(computeDownscaleDimensions(4000, 3000, 800)).toEqual({
      width: 800,
      height: 600,
      changed: true,
    });
  });
});

describe('the recorded WO-003 compression policy', () => {
  it('is 1600px long edge, JPEG quality 80', () => {
    expect(PHOTO_MAX_LONG_EDGE).toBe(1600);
    expect(PHOTO_JPEG_QUALITY).toBe(0.8);
  });

  it('passes small files through untouched (PNG alpha must survive)', () => {
    expect(PHOTO_PASSTHROUGH_MAX_BYTES).toBe(256 * 1024);
  });

  it('allow-lists exactly the three decodable image types', () => {
    expect([...ALLOWED_DOWNSCALE_MIME_TYPES]).toEqual([
      'image/jpeg',
      'image/png',
      'image/webp',
    ]);
  });
});

// ── The gates ───────────────────────────────────────────────────

describe('downscalePhotoFile — the gates', () => {
  it('rejects an unsupported type (HEIC)', async () => {
    const result = await downscalePhotoFile(
      makeFile({ type: 'image/heic', size: 5_000_000 }),
    );
    expect(result).toEqual({
      ok: false,
      error: 'unsupported_type',
      detail: 'image/heic',
    });
  });

  it('rejects a GIF (animated — only the first frame decodes)', async () => {
    const result = await downscalePhotoFile(
      makeFile({ type: 'image/gif', size: 5_000_000 }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('unsupported_type');
  });

  it('rejects an empty file type rather than guessing jpeg', async () => {
    const result = await downscalePhotoFile(
      makeFile({ type: '', size: 5_000_000 }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('unsupported_type');
  });

  it('never throws — the promise always resolves', async () => {
    await expect(
      downscalePhotoFile(makeFile({ type: 'image/jpeg', size: 5_000_000 })),
    ).resolves.toBeDefined();
  });

  it('passes a small file through byte-identically', async () => {
    g.FileReader = StubFileReader;
    const result = await downscalePhotoFile(
      makeFile({ type: 'image/png', size: 68 }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.passthrough).toBe(true);
      expect(result.mimeType).toBe('image/png');
      expect(result.dataUrl.startsWith('data:image/')).toBe(true);
    }
  });
});

// ── The browser-only encode path (DOM-stubbed) ──────────────────

describe('downscalePhotoFile — the encode path (DOM stubbed)', () => {
  it('downscales and re-encodes a large photo to JPEG q80', async () => {
    g.FileReader = StubFileReader;
    g.createImageBitmap = async () => ({
      width: 4000,
      height: 3000,
      close: () => undefined,
    });
    const calls: Array<{ width: number; height: number }> = [];
    g.document = {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({
          fillStyle: '',
          fillRect: (..._args: unknown[]) => undefined,
          drawImage: () => undefined,
        }),
        toDataURL: (mime: string, _quality: number) => {
          calls.push({ width: 0, height: 0 });
          return `data:${mime};base64,DOWNSCALED`;
        },
      }),
    };

    const result = await downscalePhotoFile(
      makeFile({ type: 'image/jpeg', size: 5_000_000 }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.passthrough).toBe(false);
      expect(result.mimeType).toBe('image/jpeg');
      expect(result.width).toBe(1600);
      expect(result.height).toBe(1200);
      expect(result.dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true);
    }
  });

  it('reports encode_failed when the browser silently falls back to PNG', () => {
    g.document = {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({
          fillStyle: '',
          fillRect: () => undefined,
          drawImage: () => undefined,
        }),
        // A browser that cannot encode the requested MIME returns a
        // PNG data URL instead.
        toDataURL: () => 'data:image/png;base64,NOTJPEG',
      }),
    };
    const result = encodeScaledBitmap({ width: 10, height: 10 } as never, 10, 10);
    expect(result).toEqual({
      ok: false,
      error: 'encode_failed',
      detail: 'mime_fallback',
    });
  });

  it('reports encode_failed when there is no document', () => {
    const result = encodeScaledBitmap({ width: 10, height: 10 } as never, 10, 10);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('encode_failed');
  });
});

describe('base64PayloadFromDataUrl', () => {
  it('strips the data-URL prefix', () => {
    expect(base64PayloadFromDataUrl('data:image/jpeg;base64,PAYLOAD')).toBe(
      'PAYLOAD',
    );
  });

  it('returns a bare string unchanged', () => {
    expect(base64PayloadFromDataUrl('PAYLOAD')).toBe('PAYLOAD');
  });
});

// ── The decode fallbacks ────────────────────────────────────────
//
// `createImageBitmap` is the primary decoder. These suites cover the
// paths a real browser takes when it is absent, when it rejects the
// `{ imageOrientation }` overload, or when neither decoder works.

/**
 * A canvas stub whose `getContext` returns `null` — the browser
 * refuses a 2D context (e.g. too many live canvases).
 */
function stubCanvasWithoutContext(): void {
  g.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => null,
      toDataURL: () => 'data:image/jpeg;base64,NEVER',
    }),
  };
}

/**
 * A canvas stub that succeeds and records the calls the helper makes.
 */
function stubCanvas(recorder?: { fills: number; draws: number }): void {
  g.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        fillStyle: '',
        fillRect: () => {
          if (recorder) recorder.fills += 1;
        },
        drawImage: () => {
          if (recorder) recorder.draws += 1;
        },
      }),
      toDataURL: (mime: string) => `data:${mime};base64,DOWNSCALED`,
    }),
  };
}

describe('decodeBitmap — the createImageBitmap retry', () => {
  it('retries without the imageOrientation option when the overload is rejected', async () => {
    // Older Safari rejects the options overload. The spec default is
    // `from-image` anyway, so orientation is still honoured.
    const seen: Array<unknown> = [];
    g.createImageBitmap = async (_blob: Blob, options?: unknown) => {
      seen.push(options);
      if (options !== undefined) {
        throw new Error('options_not_supported');
      }
      return { width: 4000, height: 3000, close: () => undefined };
    };
    stubCanvas();

    const result = await downscalePhotoFile(
      makeFile({ type: 'image/jpeg', size: 5_000_000 }),
    );
    expect(result.ok).toBe(true);
    // First call carried the options, second did not.
    expect(seen).toHaveLength(2);
    expect(seen[0]).toEqual({ imageOrientation: 'from-image' });
    expect(seen[1]).toBeUndefined();
  });

  it('returns decode_failed when both createImageBitmap attempts reject', async () => {
    g.createImageBitmap = async () => {
      throw new Error('not_supported');
    };

    const result = await downscalePhotoFile(
      makeFile({ type: 'image/jpeg', size: 5_000_000 }),
    );
    expect(result).toEqual({
      ok: false,
      error: 'decode_failed',
      detail: 'no_decoder',
    });
  });
});

describe('decodeViaImageElement — the no-createImageBitmap fallback', () => {
  /**
   * An `Image` stub whose `decode()` resolves. Mirrors a browser
   * without `createImageBitmap` (older Firefox / Safari).
   */
  class StubImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    width = 4000;
    height = 3000;
    src = '';
    async decode(): Promise<void> {
      return undefined;
    }
  }

  it('decodes through an HTMLImageElement when createImageBitmap is absent', async () => {
    g.Image = StubImage;
    const revoked: string[] = [];
    g.URL = {
      createObjectURL: () => 'blob:stub',
      revokeObjectURL: (u: string) => revoked.push(u),
    };
    stubCanvas();

    const result = await downscalePhotoFile(
      makeFile({ type: 'image/jpeg', size: 5_000_000 }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.width).toBe(1600);
      expect(result.height).toBe(1200);
      expect(result.mimeType).toBe('image/jpeg');
    }
    // The object URL must be revoked — a leak per photo would be
    // visible as a memory climb on a citizen's phone.
    expect(revoked).toEqual(['blob:stub']);
  });

  it('falls back to the onload/onerror pair when img.decode is absent', async () => {
    class LegacyImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      width = 3000;
      height = 4000;
      src = '';
      constructor() {
        // Fire the load event on the next microtask, the way a
        // browser does once the object URL resolves.
        queueMicrotask(() => this.onload?.());
      }
    }
    g.Image = LegacyImage;
    g.URL = {
      createObjectURL: () => 'blob:legacy',
      revokeObjectURL: () => undefined,
    };
    stubCanvas();

    const result = await downscalePhotoFile(
      makeFile({ type: 'image/jpeg', size: 5_000_000 }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Portrait: the long edge is the height.
      expect(result.width).toBe(1200);
      expect(result.height).toBe(1600);
    }
  });

  it('returns decode_failed when the image element errors', async () => {
    class BrokenImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      width = 0;
      height = 0;
      src = '';
      constructor() {
        queueMicrotask(() => this.onerror?.());
      }
    }
    g.Image = BrokenImage;
    g.URL = {
      createObjectURL: () => 'blob:broken',
      revokeObjectURL: () => undefined,
    };

    const result = await downscalePhotoFile(
      makeFile({ type: 'image/jpeg', size: 5_000_000 }),
    );
    expect(result).toEqual({
      ok: false,
      error: 'decode_failed',
      detail: 'no_decoder',
    });
  });

  it('returns decode_failed when URL.createObjectURL is unavailable', async () => {
    g.Image = StubImage;
    g.URL = {};

    const result = await downscalePhotoFile(
      makeFile({ type: 'image/jpeg', size: 5_000_000 }),
    );
    expect(result).toEqual({
      ok: false,
      error: 'decode_failed',
      detail: 'no_decoder',
    });
  });
});

describe('encodeScaledBitmap — the remaining failure modes', () => {
  it('reports encode_failed when the canvas has no 2D context', () => {
    stubCanvasWithoutContext();
    const result = encodeScaledBitmap({ width: 10, height: 10 } as never, 10, 10);
    expect(result).toEqual({
      ok: false,
      error: 'encode_failed',
      detail: 'no_context',
    });
  });

  it('reports encode_failed when the canvas throws', () => {
    g.document = {
      createElement: () => {
        throw new Error('canvas_creation_failed');
      },
    };
    const result = encodeScaledBitmap({ width: 10, height: 10 } as never, 10, 10);
    expect(result).toEqual({
      ok: false,
      error: 'encode_failed',
      detail: 'canvas_creation_failed',
    });
  });

  it('reports encode_failed with an `unknown` detail for a non-Error throw', () => {
    g.document = {
      createElement: () => {
        throw 'a string';
      },
    };
    const result = encodeScaledBitmap({ width: 10, height: 10 } as never, 10, 10);
    expect(result).toEqual({
      ok: false,
      error: 'encode_failed',
      detail: 'unknown',
    });
  });

  it('fills the canvas white BEFORE drawing the image', () => {
    // JPEG has no alpha. Without the white fill, transparent PNG
    // regions are composited as transparent-black and encode black.
    const order: string[] = [];
    g.document = {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({
          fillStyle: '',
          fillRect: () => order.push('fill'),
          drawImage: () => order.push('draw'),
        }),
        toDataURL: (mime: string) => `data:${mime};base64,DOWNSCALED`,
      }),
    };
    const result = encodeScaledBitmap({ width: 10, height: 10 } as never, 10, 10);
    expect(result.ok).toBe(true);
    expect(order).toEqual(['fill', 'draw']);
  });

  it('honours a custom quality and MIME type', () => {
    const seen: Array<{ mime: string; quality: number }> = [];
    g.document = {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({
          fillStyle: '',
          fillRect: () => undefined,
          drawImage: () => undefined,
        }),
        toDataURL: (mime: string, quality: number) => {
          seen.push({ mime, quality });
          return `data:${mime};base64,CUSTOM`;
        },
      }),
    };
    const result = encodeScaledBitmap(
      { width: 10, height: 10 } as never,
      10,
      10,
      { quality: 0.5, mimeType: 'image/webp' },
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.mimeType).toBe('image/webp');
    expect(seen).toEqual([{ mime: 'image/webp', quality: 0.5 }]);
  });

  it('never lets a zero or negative dimension reach the canvas', () => {
    // `Math.max(1, …)` in the helper keeps the canvas valid.
    const dims: Array<{ width: number; height: number }> = [];
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        fillStyle: '',
        fillRect: () => undefined,
        drawImage: () => undefined,
      }),
      toDataURL: (mime: string) => {
        dims.push({ width: canvas.width, height: canvas.height });
        return `data:${mime};base64,DOWNSCALED`;
      },
    };
    g.document = { createElement: () => canvas };

    const result = encodeScaledBitmap({ width: 0, height: 0 } as never, 0, 0);
    expect(result.ok).toBe(true);
    expect(dims).toEqual([{ width: 1, height: 1 }]);
  });
});

describe('downscalePhotoFile — the defensive backstops', () => {
  it('reports encode_failed when the re-encoded photo still exceeds the cap', async () => {
    // A pathological image could still exceed the raised cap. The
    // helper returns an error so the caller falls back to the
    // original bytes rather than sending an unusable payload.
    g.createImageBitmap = async () => ({
      width: 4000,
      height: 3000,
      close: () => undefined,
    });
    g.document = {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({
          fillStyle: '',
          fillRect: () => undefined,
          drawImage: () => undefined,
        }),
        toDataURL: (mime: string) =>
          `data:${mime};base64,${'A'.repeat(MAX_PHOTO_URL_CHARS + 1)}`,
      }),
    };

    const result = await downscalePhotoFile(
      makeFile({ type: 'image/jpeg', size: 5_000_000 }),
    );
    expect(result).toEqual({
      ok: false,
      error: 'encode_failed',
      detail: 'still_too_large',
    });
  });

  it('reports decode_failed when the passthrough read fails', async () => {
    g.FileReader = FailingFileReader;
    const result = await downscalePhotoFile(
      makeFile({ type: 'image/png', size: 68 }),
    );
    expect(result).toEqual({
      ok: false,
      error: 'decode_failed',
      detail: 'read_failed',
    });
  });

  it('reports decode_failed when the passthrough read throws', async () => {
    g.FileReader = ThrowingFileReader;
    const result = await downscalePhotoFile(
      makeFile({ type: 'image/png', size: 68 }),
    );
    expect(result).toEqual({
      ok: false,
      error: 'decode_failed',
      detail: 'read_failed',
    });
  });

  it('reports decode_failed when there is no FileReader at all', async () => {
    // Node without the DOM global — the caller falls back to its own
    // read path.
    const result = await downscalePhotoFile(
      makeFile({ type: 'image/png', size: 68 }),
    );
    expect(result).toEqual({
      ok: false,
      error: 'decode_failed',
      detail: 'read_failed',
    });
  });

  it('honours a custom maxLongEdge', async () => {
    g.createImageBitmap = async () => ({
      width: 4000,
      height: 3000,
      close: () => undefined,
    });
    stubCanvas();

    const result = await downscalePhotoFile(
      makeFile({ type: 'image/jpeg', size: 5_000_000 }),
      { maxLongEdge: 800 },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.width).toBe(800);
      expect(result.height).toBe(600);
    }
  });

  it('honours a custom quality', async () => {
    const seen: number[] = [];
    g.createImageBitmap = async () => ({
      width: 4000,
      height: 3000,
      close: () => undefined,
    });
    g.document = {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({
          fillStyle: '',
          fillRect: () => undefined,
          drawImage: () => undefined,
        }),
        toDataURL: (mime: string, quality: number) => {
          seen.push(quality);
          return `data:${mime};base64,DOWNSCALED`;
        },
      }),
    };

    await downscalePhotoFile(makeFile({ type: 'image/jpeg', size: 5_000_000 }), {
      quality: 0.42,
    });
    expect(seen).toEqual([0.42]);
  });

  it('closes the bitmap after encoding', async () => {
    // `ImageBitmap.close()` frees the decoded pixels. Leaking them
    // per photo is visible as a memory climb on a citizen's phone.
    let closed = 0;
    g.createImageBitmap = async () => ({
      width: 4000,
      height: 3000,
      close: () => {
        closed += 1;
      },
    });
    stubCanvas();

    await downscalePhotoFile(makeFile({ type: 'image/jpeg', size: 5_000_000 }));
    expect(closed).toBe(1);
  });

  it('survives a bitmap whose close() throws', async () => {
    g.createImageBitmap = async () => ({
      width: 4000,
      height: 3000,
      close: () => {
        throw new Error('close_failed');
      },
    });
    stubCanvas();

    const result = await downscalePhotoFile(
      makeFile({ type: 'image/jpeg', size: 5_000_000 }),
    );
    expect(result.ok).toBe(true);
  });
});
