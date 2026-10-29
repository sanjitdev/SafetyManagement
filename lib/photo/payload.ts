/**
 * Photo payload probes (lib/photo/payload.ts).
 *
 * ── Why this module exists ─────────────────────────────────────
 *
 * The API boundary needs to tell "this photo is too large" apart
 * from "this request is invalid". Zod's `.max()` failure is NOT a
 * usable signal: a length violation produces the issue code
 * `too_big`, and a long `note` produces the IDENTICAL issue code —
 * so inspecting `issues[].code === 'too_big'` would misclassify a
 * long note as a photo problem. The issue's `path` is an array
 * (`['photoUrls', 0]`), so a path-based check is fragile and couples
 * the HTTP contract to a library implementation detail.
 *
 * Instead, the dedicated `photo_too_large` code is decided on the
 * RAW request body, BEFORE the Zod parse, where the photo fields are
 * still addressable BY NAME.
 *
 * The module is client-safe (no server-only imports) so both API
 * routes and the unit test can share it.
 */

import { MAX_PHOTO_URL_CHARS } from '@/lib/format/photo-url';

function isOverCap(value: unknown): boolean {
  return typeof value === 'string' && value.length > MAX_PHOTO_URL_CHARS;
}

/**
 * True when the request carries a photo whose base64 payload
 * exceeds the API boundary's per-photo cap.
 *
 * Handles all three payload shapes the app uses:
 *
 *   - `photoUrls: string[]` — the citizen's inline data-URL array.
 *   - `photoBlobs: [{ dataBase64 }]` — the citizen's raw-bytes array.
 *   - a bare `{ url }` / `{ dataBase64 }` — the crew route's
 *     single-photo payload.
 *
 * The cap is measured over the WHOLE data-URL string (prefix +
 * payload) for the inline shapes, matching the Zod `.max()` on
 * `PhotoUrl`. Bare base64 has no prefix and is measured directly.
 *
 * NEVER throws.
 */
export function hasOversizedPhoto(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;

  // Branch 1 — the inline data-URL array.
  if (Array.isArray(b.photoUrls)) {
    for (const url of b.photoUrls) {
      if (isOverCap(url)) return true;
    }
  }

  // Branch 2 — the raw-bytes array.
  if (Array.isArray(b.photoBlobs)) {
    for (const photo of b.photoBlobs) {
      if (
        photo &&
        typeof photo === 'object' &&
        isOverCap((photo as { dataBase64?: unknown }).dataBase64)
      ) {
        return true;
      }
    }
  }

  // Branch 3 — the crew route's bare `{ url }` / `{ dataBase64 }`.
  if (isOverCap(b.url)) return true;
  if (isOverCap(b.dataBase64)) return true;

  return false;
}
