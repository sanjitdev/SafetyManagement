/**
 * The maximum number of characters a single inline photo URL may
 * contain at an API boundary.
 *
 * ── Why this number ───────────────────────────────────────────
 *
 * The inline `data:image/…;base64,…` URL carries 4 base64
 * characters per 3 binary bytes, plus the `data:<mime>;base64,`
 * prefix. The blob store's own hard ceiling is `MAX_BLOB_BYTES`
 * (5 MiB binary) in `lib/storage/blob.ts` — that module is
 * server-only (it pulls in `next/headers` via `lib/auth/guards`),
 * so this constant CANNOT import it. The value is therefore
 * derived here from the same number and kept in sync by
 * `tests/unit/photo-url-api-boundary.test.ts`:
 *
 *   5 MiB = 5 × 1024 × 1024 = 5_242_880 binary bytes
 *   base64 length = ceil(5_242_880 / 3) × 4 = 6_990_508 characters
 *   + a generous `data:image/jpeg;base64,` prefix allowance (64)
 *   = 6_990_572 → rounded UP to 7_000_000
 *
 * The round-up is deliberate: the API never rejects a photo the
 * blob store would have accepted.
 *
 * ── Why the client-side downscale is still the load-bearing fix ──
 *
 * On Vercel the serverless request-body ceiling (~4.5 MB) sits
 * BELOW 7_000_000 chars (~5.25 MB binary). This constant is the
 * BACKSTOP and the effective local/dev behaviour; the real fix is
 * the client-side 1600px/q80 downscale (`lib/photo/downscale.ts`),
 * which produces ~270–540 K chars.
 *
 * The previous cap was 2_000_000 chars (≈1.5 MB binary), which
 * rejected a normal 3–8 MB phone photo inlined as a data URL —
 * the citizen saw an opaque `invalid_input` on submit.
 */
export const MAX_PHOTO_URL_CHARS = 7_000_000;

/**
 * Photo URL helpers (lib/format/photo-url.ts).
 *
 * ── Why this module exists ─────────────────────────────────────
 *
 * A `TicketPhoto.url` is whatever the uploader handed to the API,
 * and the app persists it VERBATIM (see
 * `app/api/tickets/route.ts` → `db.ticketPhoto.create({ data: { url } })`).
 * That means one column holds three different shapes:
 *
 *   1. `data:image/jpeg;base64,…`
 *      The inline fallback. The photo picker reads the chosen file
 *      with a `FileReader` and inlines the bytes; the API stores
 *      the data URL as-is. This is the DEFAULT path — no blob
 *      provider is configured out of the box, and the Playwright
 *      visual baselines depend on it.
 *
 *   2. `https://cdn.example.com/tickets/<key>.jpg`
 *      The blob path. `lib/storage/blob.ts` → `publicUrlFor(key)`
 *      returns `${BLOB_PUBLIC_BASE_URL}/${key}` when the operator
 *      sets a public base URL, or `${endpoint}/${bucket}/${key}`
 *      when they only set an S3-compatible endpoint.
 *
 *   3. `/api/blob/<key>`
 *      The local-filesystem blob path (`BLOB_PROVIDER=local` with a
 *      `BLOB_LOCAL_DIR`). Root-relative, same-origin.
 *
 * Several surfaces guarded their thumbnail with
 * `photoUrl.startsWith('http')`. That matches shape 2 ONLY — so a
 * `data:` URL (shape 1, the default!) and a root-relative
 * `/api/blob/…` URL (shape 3) both fell through to the "no photo"
 * gradient. The citizen's own submitted photo was invisible in the
 * feed, the home list, and the report cards even though the bytes
 * were sitting right there in the row.
 *
 * The fix is to stop sniffing the string shape at each call site and
 * ask this module instead.
 */

/**
 * True when `url` is a usable image source for an `<img src>` /
 * `background-image: url(...)`.
 *
 * Accepts:
 *   - absolute `http://` / `https://` URLs
 *   - `data:` URLs (the inline photo bytes)
 *   - root-relative paths (`/api/blob/…`) — same-origin, so they
 *     resolve against the current origin without a base URL
 *
 * Rejects: empty strings, whitespace, `javascript:` / `vbscript:`
 * schemes (an XSS vector if a stored URL ever carried one), and any
 * other scheme we do not explicitly render.
 */
export function isRenderablePhotoUrl(
  url: string | null | undefined,
): url is string {
  if (!url) return false;
  const trimmed = url.trim();
  if (!trimmed) return false;

  const lower = trimmed.toLowerCase();
  if (lower.startsWith('data:image/')) return true;
  if (lower.startsWith('http://') || lower.startsWith('https://')) return true;
  // Root-relative — the local blob provider's `/api/blob/<key>`.
  if (trimmed.startsWith('/')) return true;

  return false;
}

/**
 * The first renderable photo URL in a list, or `null`.
 *
 * The serializer hands consumers `beforePhotoUrls`, `afterPhotoUrls`,
 * and the legacy union `photoUrls`. A ticket can legitimately have
 * an empty photo list, and a stored row can hold a value we cannot
 * render — this picks the first one that IS renderable so a single
 * unusable row does not blank the whole thumbnail.
 */
export function firstRenderablePhotoUrl(
  urls: readonly string[] | null | undefined,
): string | null {
  if (!urls) return null;
  for (const url of urls) {
    if (isRenderablePhotoUrl(url)) return url.trim();
  }
  return null;
}

/**
 * The LAST renderable photo URL in a list, or `null`.
 *
 * Used by surfaces that want the freshest evidence (e.g. the
 * dispatcher monitor prefers the crew's after-photo over the
 * citizen's before-photo). Scans BACKWARDS and returns the first
 * renderable entry, so an unrenderable trailing row does not blank
 * the thumbnail.
 */
export function lastRenderablePhotoUrl(
  urls: readonly string[] | null | undefined,
): string | null {
  if (!urls) return null;
  for (let i = urls.length - 1; i >= 0; i -= 1) {
    const url = urls[i];
    if (isRenderablePhotoUrl(url)) return url.trim();
  }
  return null;
}

/**
 * A CSS `background` value that renders `url` as a cover-cropped
 * thumbnail, or `null` when there is nothing renderable.
 *
 * The `url(...)` is quoted so a data URL (which contains `;` and `,`
 * and may contain parentheses inside the base64 payload) cannot break
 * out of the CSS function.
 */
export function thumbnailBackground(
  url: string | null | undefined,
): string | null {
  if (!isRenderablePhotoUrl(url)) return null;
  return `url("${url.trim().replace(/"/g, '%22')}") center/cover no-repeat`;
}

/**
 * True when `url` is an acceptable photo source at an API boundary
 * (i.e. a value we are willing to persist and later render).
 *
 * This is the WRITE-side counterpart of `isRenderablePhotoUrl`. The
 * two must agree: a URL shape that the API accepts is a shape the
 * renderer can display, and vice versa.
 *
 * The API boundary used to be `z.string().url()`, which is not the
 * same contract. In Zod 3.x that check is `new URL(value)`, which
 * parses ANY absolute scheme — so it:
 *
 *   - rejected the root-relative `/api/blob/…` shape (the local blob
 *     provider's URL), failing the whole submission with HTTP 400;
 *   - ACCEPTED `javascript:` and `data:text/html` URLs. The photo
 *     URL is persisted VERBATIM and later handed to `<img src>` and
 *     `background-image: url(...)`, so a stored script scheme is a
 *     stored-URL XSS vector.
 *
 * Accepted shapes:
 *   - `data:image/<subtype>;base64,<payload>` (inline, the default)
 *   - `http://` / `https://` absolute URLs
 *   - root-relative paths (`/api/blob/…`, `/bucket/key`)
 *
 * Rejected: empty values, non-image `data:` URLs, and script schemes.
 */
export function isAcceptablePhotoUrl(
  url: string | null | undefined,
): url is string {
  return isRenderablePhotoUrl(url);
}
