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
 * The server contract is `{ url: string }` JSON; the helper
 * is responsible for translating `File → data URL`.
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

  let finalUrl: string;
  if (source!.kind === 'file') {
    try {
      finalUrl = await readPhotoFileAsDataUrl(source!.file);
    } catch {
      return { ok: false, error: 'invalid_file_type' };
    }
  } else {
    finalUrl = validation.url;
  }

  const res = await f(`/api/v1/crew/tickets/${encodeURIComponent(ticketId)}/photos`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: finalUrl }),
  });
  if (!res.ok) {
    return { ok: false, error: `http_${res.status}` };
  }
  const data = (await res.json()) as { ticket: unknown };
  return { ok: true, ticket: data.ticket };
}
