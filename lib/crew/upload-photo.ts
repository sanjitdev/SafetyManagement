/**
 * Crew after-photo upload helper (lib/crew/upload-photo.ts).
 *
 * Bolt 008-003 — Intent 008 (UX polish from slow-motion demo).
 * The crew ticket-detail page used to accept only a URL for the
 * after-photo. The slow-motion demo showed that a real file
 * picker is the v1 surface the design calls for; URLs are a
 * power-user fallback.
 *
 * Design choice: the v1 dev store (and v1 production schema) do
 * not persist file bytes — photos are stored as `TicketPhoto.url`
 * strings. To support both flows in v1 with the same storage
 * shape, the client reads the chosen file via `FileReader` and
 * inlines the bytes as a `data:image/<mime>;base64,…` URL. The
 * server contract (POST `{ url: string }`) is unchanged.
 *
 * ── Storage (reworked for the platform-layer batch build) ─────
 *
 * WO-000's technical design closed the "Photo storage" open
 * question with:
 *
 *   > "S3-compatible blob storage or local filesystem for v1?
 *   >  Recommendation: blob storage with local-filesystem fallback
 *   >  for dev."
 *
 * This helper now routes the bytes through the blob store
 * (`lib/storage/blob.ts`) and the API persists the blob metadata
 * alongside the rendered URL:
 *
 *   - `TicketPhoto.url`        — the rendered URL (UNCHANGED
 *                                contract; the citizen + crew
 *                                serializers read it directly).
 *   - `TicketPhoto.storageKey` — the provider-side object key.
 *   - `TicketPhoto.mimeType`   — the stored MIME type.
 *   - `TicketPhoto.sizeBytes`  — the stored byte length.
 *
 * ── The inline fallback (visual-baseline safety) ─────────────
 *
 * The inline data-URL behaviour is KEPT when no blob provider is
 * configured (`isBlobProviderActive()` is false — the default in
 * dev). That preserves the existing Playwright visual baselines
 * byte-for-byte: the baseline images capture `<img src="data:...">`
 * thumbnails, and switching the `src` to an `/api/blob/...` URL
 * would shift every rendered pixel.
 *
 * When `BLOB_PROVIDER` IS configured (s3, or local with an
 * explicit `BLOB_LOCAL_DIR`), the bytes are stored in the blob
 * provider and the API returns the provider URL.
 *
 * The helper exposes a tiny pure API so the page component and
 * the unit test can both call the same functions:
 *
 *   - `validatePhotoFile(file)` — MIME + size gate.
 *   - `readPhotoFileAsDataUrl(file)` — async file reader.
 *   - `uploadCrewPhoto({ ticketId, source, lang, fetcher? })` —
 *     the high-level entry point: takes either a `File` or a
 *     raw URL string, validates, and POSTs to the API.
 *
 * The optional `fetcher` injection lets the unit test use a
 * stub instead of touching the global `fetch` and the
 * network.
 *
 * Constraints (mirror the citizen route's
 * `app/api/tickets/route.ts` allow-list):
 *
 *   - MIME allow-list: `image/jpeg`, `image/png`, `image/webp`.
 *   - Size limit: 5 MB (5 * 1024 * 1024 bytes).
 *
 * Out of scope for v1:
 *   - HEIC / HEIF (mobile-only; deferred to v1.1).
 *   - Camera capture (`capture="environment"`) — the native
 *     file picker is enough for the v1 demo.
 *   - EXIF stripping — the v1 dev store does not surface EXIF,
 *     and the production path will route through the upload
 *     pipeline (R2/MinIO) where EXIF handling is a separate
 *     concern.
 */

// Client-safe import: `lib/storage/blob.ts` is server-only (it pulls
// in `next/headers` via `lib/auth/guards`). The provider-detection
// helper lives in a dependency-free module so this file — which is
// imported by `'use client'` pages — stays browser-safe.
import { isBlobProviderActive } from '@/lib/storage/blob-provider';

export const ALLOWED_PHOTO_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;
export type AllowedPhotoMime = (typeof ALLOWED_PHOTO_MIME_TYPES)[number];

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Bolt 008-003: the upload source. The page component picks
 * one branch based on whether the user used the file picker
 * or the URL-override disclosure.
 */
export type CrewPhotoSource =
  | { kind: 'file'; file: File }
  | { kind: 'url'; url: string };

export type CrewPhotoValidationError =
  | 'invalid_file_type'
  | 'file_too_large'
  | 'invalid_url'
  | 'empty_url'
  | 'no_source';

export interface CrewPhotoValidationOk {
  ok: true;
  /**
   * The URL the helper will POST to the server. For `kind:
   * 'file'` this is a `data:` URL produced by
   * `readPhotoFileAsDataUrl`; for `kind: 'url'` it is the
   * trimmed URL.
   */
  url: string;
}

export interface CrewPhotoValidationErr {
  ok: false;
  error: CrewPhotoValidationError;
}

export type CrewPhotoValidationResult =
  | CrewPhotoValidationOk
  | CrewPhotoValidationErr;

/**
 * Validate the MIME type. Returns `true` when the file is
 * one of the allow-listed image types. The check uses
 * `file.type` (the browser-computed value, not a raw
 * extension); the file picker populates this from the OS
 * metadata so a renamed `.exe` → `.jpg` is rejected (the OS
 * reports `application/octet-stream`).
 */
export function isAllowedPhotoMime(mime: string): mime is AllowedPhotoMime {
  return (ALLOWED_PHOTO_MIME_TYPES as readonly string[]).includes(mime);
}

/**
 * Pure input-shape check: at least one of (file, url) is
 * provided. Returns a `CrewPhotoValidationResult` with
 * `no_source` when both are empty.
 */
export function validatePhotoInput(source: CrewPhotoSource | null): CrewPhotoValidationResult {
  if (!source) {
    return { ok: false, error: 'no_source' };
  }
  if (source.kind === 'url') {
    const trimmed = source.url.trim();
    if (trimmed.length === 0) {
      return { ok: false, error: 'empty_url' };
    }
    try {
      const u = new URL(trimmed);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        return { ok: false, error: 'invalid_url' };
      }
    } catch {
      return { ok: false, error: 'invalid_url' };
    }
    return { ok: true, url: trimmed };
  }
  // File branch
  const { file } = source;
  if (!isAllowedPhotoMime(file.type)) {
    return { ok: false, error: 'invalid_file_type' };
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return { ok: false, error: 'file_too_large' };
  }
  // The data URL is built by the caller (readPhotoFileAsDataUrl);
  // we cannot produce it inside a pure sync helper because
  // FileReader is async. The high-level `uploadCrewPhoto`
  // helper composes these.
  return { ok: true, url: '' };
}

/**
 * Asynchronously read a `File` as a `data:` URL. Returns
 * the string on success and rejects with a `DOMException` on
 * read failure.
 */
export function readPhotoFileAsDataUrl(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        resolve(result);
      } else {
        reject(new Error('FileReader returned a non-string result'));
      }
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('FileReader error'));
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Asynchronously read a `File` as raw bytes. Used by the blob
 * path: the client sends the bytes to the API, and the API is
 * the layer that writes to the blob provider (the browser never
 * talks to S3/R2 directly — it has no credentials and must not
 * have any).
 */
export function readPhotoFileAsBytes(file: File): Promise<Uint8Array> {
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (result instanceof ArrayBuffer) {
        resolve(new Uint8Array(result));
      } else if (result && typeof result === 'object' && 'buffer' in result) {
        // Node's Blob-like objects expose `.buffer` in the test
        // environment; the DOM FileReader path yields an
        // ArrayBuffer directly.
        const buf = (result as { buffer: ArrayBuffer }).buffer;
        resolve(new Uint8Array(buf));
      } else {
        reject(new Error('FileReader returned a non-buffer result'));
      }
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('FileReader error'));
    };
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Base64-encode raw bytes WITHOUT the `data:` URL prefix. The
 * API route re-assembles the `data:` URL (or the raw bytes) from
 * this payload and stores them via the blob provider.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(
      ...bytes.subarray(i, Math.min(i + chunk, bytes.length)),
    );
  }
  if (typeof btoa === 'function') {
    return btoa(binary);
  }
  // Node fallback (the unit test runs in the `node` environment).
  return Buffer.from(bytes).toString('base64');
}

/**
 * Decode a base64 string back to bytes. Used by the API route.
 */
export function base64ToBytes(b64: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(b64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  }
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

export interface UploadCrewPhotoArgs {
  ticketId: string;
  /**
   * Either a `File` (the file picker branch) or a string
   * (the URL-override branch). At least one must be
   * provided.
   */
  file?: File | null;
  url?: string | null;
  /**
   * Optional fetch override; the unit test injects a stub
   * here so the helper never touches the real network.
   */
  fetcher?: typeof fetch;
  /**
   * Optional override for the blob-provider probe. The unit test
   * injects `false` to force the inline data-URL path regardless
   * of the ambient env.
   */
  blobActive?: boolean;
}

export interface UploadCrewPhotoOk {
  ok: true;
  ticket: unknown;
}

export interface UploadCrewPhotoErr {
  ok: false;
  /**
   * Either a validation error (no network call was made) or
   * the raw HTTP error code (network call returned a non-OK
   * response).
   */
  error: CrewPhotoValidationError | string;
}

export type UploadCrewPhotoResult = UploadCrewPhotoOk | UploadCrewPhotoErr;

/**
 * High-level entry point. The page component calls this with
 * either `file` or `url`; the helper validates, reads the file
 * if needed, and POSTs to `/api/v1/crew/tickets/<id>/photos`.
 *
 * ── The wire contract ─────────────────────────────────────────
 *
 * Two shapes, selected by the blob-provider probe:
 *
 *   - Blob provider ACTIVE → `{ dataBase64, mimeType, fileName }`.
 *     The bytes travel to the API, and the API writes them to the
 *     blob provider (`lib/storage/blob.ts`) and persists the
 *     `storageKey` / `mimeType` / `sizeBytes` metadata. The
 *     browser never talks to S3/R2 directly — it has no
 *     credentials and must not have any.
 *
 *   - Blob provider NOT active (the default in dev) → `{ url }`
 *     holding the inline `data:image/<mime>;base64,…` URL. This
 *     is the ORIGINAL v1 contract and is kept verbatim so the
 *     existing Playwright visual baselines stay byte-identical.
 *
 * The URL-override branch always sends `{ url }` — there are no
 * bytes to store, the photo already lives somewhere.
 */
export async function uploadCrewPhoto(
  args: UploadCrewPhotoArgs,
): Promise<UploadCrewPhotoResult> {
  const { ticketId, file, url, fetcher } = args;
  const f = fetcher ?? fetch;

  const source: CrewPhotoSource | null = file
    ? { kind: 'file', file }
    : url != null && url.trim().length > 0
      ? { kind: 'url', url }
      : null;

  const validation = validatePhotoInput(source);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  const blobActive = args.blobActive ?? isBlobProviderActive();

  let body: Record<string, unknown>;
  if (source!.kind === 'file') {
    if (blobActive) {
      let bytes: Uint8Array;
      try {
        bytes = await readPhotoFileAsBytes(source!.file);
      } catch {
        return { ok: false, error: 'invalid_file_type' };
      }
      body = {
        dataBase64: bytesToBase64(bytes),
        mimeType: source!.file.type,
        fileName: source!.file.name,
      };
    } else {
      let dataUrl: string;
      try {
        dataUrl = await readPhotoFileAsDataUrl(source!.file);
      } catch {
        return { ok: false, error: 'invalid_file_type' };
      }
      body = { url: dataUrl };
    }
  } else {
    body = { url: validation.url };
  }

  const res = await f(`/api/v1/crew/tickets/${encodeURIComponent(ticketId)}/photos`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    return { ok: false, error: `http_${res.status}` };
  }
  const data = (await res.json()) as { ticket: unknown };
  return { ok: true, ticket: data.ticket };
}
