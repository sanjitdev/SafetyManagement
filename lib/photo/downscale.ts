/**
 * Client-side photo downscale + re-encode (lib/photo/downscale.ts).
 *
 * ── Why this module exists ─────────────────────────────────────
 *
 * The citizen's photo picker used to inline the chosen file's bytes
 * VERBATIM (`reader.readAsDataURL(file)`). A modern phone photo is
 * 3–8 MB binary → a 4–11 MB base64 data-URL string → the API's
 * per-photo length cap rejected it → the citizen saw an opaque
 * `invalid_input` on submit. The note was never the problem; the
 * photo was.
 *
 * The compression policy was already RECORDED in the design
 * artifacts (`design-artifacts/E-Development/WO-003-field-crew-app.md`):
 *
 *   "Photo compression policy. v1 spec doesn't pin a target.
 *    Recommendation: max 1600px long edge, JPEG quality 80,
 *    EXIF stripped except GPS."
 *
 * …and was never implemented. This module implements it.
 *
 * ── Contract ───────────────────────────────────────────────────
 *
 *   - NEVER throws. Every browser API call is inside a `try/catch`
 *     and every failure returns a `Result` (repo rule: "NEVER throw
 *     exceptions across service-layer boundaries").
 *   - The downscale is an OPTIMISATION, never a new hard failure
 *     mode. On `{ ok: false }` the caller falls back to the original
 *     bytes; the API's size gate remains the last line of defence.
 *   - Small files are passed through BYTE-IDENTICALLY (see
 *     `PHOTO_PASSTHROUGH_MAX_BYTES`), which preserves PNG alpha and
 *     keeps the Playwright visual baselines unchanged.
 */

import { MAX_PHOTO_URL_CHARS } from '@/lib/format/photo-url';

/**
 * The target long edge (px) for a downscaled photo.
 *
 * Matches the WO-003 recommendation ("max 1600px long edge").
 */
export const PHOTO_MAX_LONG_EDGE = 1600;

/**
 * The JPEG quality for the re-encode.
 *
 * Matches the WO-003 recommendation ("JPEG quality 80").
 */
export const PHOTO_JPEG_QUALITY = 0.8;

/**
 * Files at or below this byte size are NOT re-encoded — the
 * original bytes are passed through verbatim.
 *
 * Rationale:
 *   - A 256 KB PNG/WebP/JPEG is already small enough to satisfy the
 *     API's per-photo cap on its own, so no downscale is needed.
 *   - Passing small files through preserves PNG alpha. Re-encoding
 *     a transparent PNG through a JPEG canvas would destroy the
 *     alpha channel and change every pixel — which would break the
 *     Playwright visual baselines (the crew after-photo fixture is a
 *     68-byte 1×1 TRANSPARENT PNG).
 */
export const PHOTO_PASSTHROUGH_MAX_BYTES = 256 * 1024;

/**
 * The image types the downscale accepts.
 *
 * Deliberately excludes HEIC/HEIF (not decodable by
 * `createImageBitmap` outside Safari — v1.1) and GIF (animated;
 * `createImageBitmap` decodes only the first frame).
 */
export const ALLOWED_DOWNSCALE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

/** The MIME type of the re-encoded photo. */
export const PHOTO_OUTPUT_MIME_TYPE = 'image/jpeg';

export type PhotoDownscaleErrorCode =
  | 'unsupported_type'
  | 'decode_failed'
  | 'encode_failed';

export interface PhotoDownscaleOk {
  ok: true;
  /** The data URL to send to the API. */
  dataUrl: string;
  /** True when the original bytes were passed through unchanged. */
  passthrough: boolean;
  /** The source width in px (0 when unknown). */
  width: number;
  /** The source height in px (0 when unknown). */
  height: number;
  /** The MIME type of `dataUrl`. */
  mimeType: string;
}

export interface PhotoDownscaleErr {
  ok: false;
  error: PhotoDownscaleErrorCode;
  /** Human-readable detail for LOGS. Never rendered to a user. */
  detail?: string;
}

export type PhotoDownscaleResult = PhotoDownscaleOk | PhotoDownscaleErr;

/**
 * PURE. Decide the target dimensions for a photo.
 *
 * Pure so it can be unit-tested in Vitest's `node` environment with
 * no DOM (the repo installs no jsdom/happy-dom).
 */
export function computeDownscaleDimensions(
  width: number,
  height: number,
  maxLongEdge: number = PHOTO_MAX_LONG_EDGE,
): { width: number; height: number; changed: boolean } {
  // Degenerate input — the caller bails; never divide by zero.
  if (width <= 0 || height <= 0 || maxLongEdge <= 0) {
    return { width, height, changed: false };
  }
  const longEdge = Math.max(width, height);
  if (longEdge <= maxLongEdge) {
    return { width, height, changed: false };
  }
  const scale = maxLongEdge / longEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    changed: true,
  };
}

/**
 * Read a `File` as a data URL. NEVER throws.
 */
async function readFileAsDataUrl(file: File): Promise<string | null> {
  try {
    if (typeof FileReader === 'undefined') return null;
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve(typeof reader.result === 'string' ? reader.result : null);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  } catch {
    return null;
  }
}

/**
 * Decode a `File` into an `ImageBitmap`. NEVER throws.
 *
 * `createImageBitmap` is the primary path. The
 * `{ imageOrientation: 'from-image' }` option applies the EXIF
 * orientation, so a portrait phone photo (stored as 4000×3000 with
 * a "rotate 90°" EXIF tag) is decoded upright. Older Safari rejects
 * the options overload, so we retry without it — the spec default is
 * `from-image` anyway, so orientation is still honoured.
 */
async function decodeBitmap(file: File): Promise<ImageBitmap | null> {
  const maybe = globalThis as unknown as {
    createImageBitmap?: (
      blob: Blob,
      options?: { imageOrientation?: string },
    ) => Promise<ImageBitmap>;
  };
  if (typeof maybe.createImageBitmap !== 'function') return null;
  try {
    return await maybe.createImageBitmap(file, {
      imageOrientation: 'from-image',
    });
  } catch {
    try {
      return await maybe.createImageBitmap(file);
    } catch {
      return null;
    }
  }
}

/**
 * Decode a `File` via an `HTMLImageElement` + object URL. NEVER throws.
 *
 * The fallback for browsers without `createImageBitmap`. Every modern
 * browser applies the EXIF orientation during decode, so the two
 * paths agree on orientation.
 */
async function decodeViaImageElement(
  file: File,
): Promise<HTMLImageElement | null> {
  try {
    if (
      typeof Image === 'undefined' ||
      typeof URL === 'undefined' ||
      typeof URL.createObjectURL !== 'function'
    ) {
      return null;
    }
    const objectUrl = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = objectUrl;
      if (typeof img.decode === 'function') {
        await img.decode();
      } else {
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('image_decode_failed'));
        });
      }
      return img;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return null;
  }
}

/**
 * Encode a decoded image onto a canvas and return a JPEG data URL.
 *
 * Split out of `downscalePhotoFile` so the DOM-dependent lines stay
 * isolated (the unit test env has no DOM).
 *
 * The canvas is filled WHITE before the image is drawn: JPEG has no
 * alpha channel, and `drawImage` onto an opaque canvas composites
 * transparent pixels as transparent-black, which `toDataURL('image/jpeg')`
 * then writes as black. The white fill makes a transparent region read
 * as white paper, which is what a citizen expects.
 *
 * The returned data URL's MIME prefix is VERIFIED: a browser that
 * cannot encode the requested MIME silently falls back to PNG, and we
 * must not hand back a PNG under an `image/jpeg` promise.
 */
export function encodeScaledBitmap(
  bitmap: ImageBitmap | HTMLImageElement,
  width: number,
  height: number,
  options?: { quality?: number; mimeType?: string },
): PhotoDownscaleResult {
  const quality = options?.quality ?? PHOTO_JPEG_QUALITY;
  const mimeType = options?.mimeType ?? PHOTO_OUTPUT_MIME_TYPE;
  try {
    if (typeof document === 'undefined') {
      return { ok: false, error: 'encode_failed', detail: 'no_document' };
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return { ok: false, error: 'encode_failed', detail: 'no_context' };
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap as CanvasImageSource, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL(mimeType, quality);
    if (!dataUrl.startsWith(`data:${mimeType};base64,`)) {
      return { ok: false, error: 'encode_failed', detail: 'mime_fallback' };
    }
    return {
      ok: true,
      dataUrl,
      passthrough: false,
      width: canvas.width,
      height: canvas.height,
      mimeType,
    };
  } catch (e) {
    return {
      ok: false,
      error: 'encode_failed',
      detail: e instanceof Error ? e.message : 'unknown',
    };
  }
}

/**
 * ASYNC. Downscale + re-encode a `File` into a bounded data URL.
 *
 * NEVER throws — always returns a Result.
 */
export async function downscalePhotoFile(
  file: File,
  options?: { maxLongEdge?: number; quality?: number },
): Promise<PhotoDownscaleResult> {
  const maxLongEdge = options?.maxLongEdge ?? PHOTO_MAX_LONG_EDGE;
  const quality = options?.quality ?? PHOTO_JPEG_QUALITY;

  try {
    // ── 1. MIME gate ───────────────────────────────────────────
    // Runs FIRST, before any DOM access. An EMPTY `file.type` is
    // treated as unsupported (not defaulted to `image/jpeg`) — the
    // file may be a HEIC with no recognised type, and guessing
    // would hand the API bytes it cannot decode.
    if (
      !file.type ||
      !(ALLOWED_DOWNSCALE_MIME_TYPES as readonly string[]).includes(file.type)
    ) {
      return {
        ok: false,
        error: 'unsupported_type',
        detail: file.type || 'empty_type',
      };
    }

    // ── 2. Passthrough gate ─────────────────────────────────────
    // Small files keep their ORIGINAL bytes and MIME — PNG alpha and
    // WebP are preserved, and the visual baselines stay identical.
    if (file.size <= PHOTO_PASSTHROUGH_MAX_BYTES) {
      const original = await readFileAsDataUrl(file);
      if (!original) {
        return { ok: false, error: 'decode_failed', detail: 'read_failed' };
      }
      return {
        ok: true,
        dataUrl: original,
        passthrough: true,
        width: 0,
        height: 0,
        mimeType: file.type,
      };
    }

    // ── 3. Decode ──────────────────────────────────────────────
    let bitmap: ImageBitmap | HTMLImageElement | null =
      await decodeBitmap(file);
    if (!bitmap) {
      bitmap = await decodeViaImageElement(file);
    }
    if (!bitmap) {
      return { ok: false, error: 'decode_failed', detail: 'no_decoder' };
    }

    try {
      const srcWidth = bitmap.width;
      const srcHeight = bitmap.height;
      const target = computeDownscaleDimensions(
        srcWidth,
        srcHeight,
        maxLongEdge,
      );

      // ── 4. Encode ────────────────────────────────────────────
      const encoded = encodeScaledBitmap(bitmap, target.width, target.height, {
        quality,
        mimeType: PHOTO_OUTPUT_MIME_TYPE,
      });
      if (!encoded.ok) return encoded;

      // A defensive backstop: the raised API cap is generous, but a
      // pathological image could still exceed it. Fall back to the
      // original bytes rather than sending an unusable payload.
      if (encoded.dataUrl.length > MAX_PHOTO_URL_CHARS) {
        return {
          ok: false,
          error: 'encode_failed',
          detail: 'still_too_large',
        };
      }

      return {
        ok: true,
        dataUrl: encoded.dataUrl,
        passthrough: false,
        width: target.width,
        height: target.height,
        mimeType: PHOTO_OUTPUT_MIME_TYPE,
      };
    } finally {
      // `ImageBitmap.close()` frees the decoded pixels; an
      // `HTMLImageElement` has no `close`, so guard it.
      const closable = bitmap as ImageBitmap;
      if (typeof closable.close === 'function') {
        try {
          closable.close();
        } catch {
          // best-effort
        }
      }
    }
  } catch (e) {
    return {
      ok: false,
      error: 'decode_failed',
      detail: e instanceof Error ? e.message : 'unknown',
    };
  }
}

/**
 * Strip the `data:<mime>;base64,` prefix from a data URL.
 *
 * The API route re-assembles the bytes from the bare base64 payload.
 * A string without a comma is returned unchanged.
 */
export function base64PayloadFromDataUrl(dataUrl: string): string {
  const comma = dataUrl.indexOf(',');
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}
