# DDD-06 — Photo-size hotfix: the downscale, the raised cap, and the readable message

**Bolt**: 002-004-my-reports
**Unit**: 002-citizen-report-flow/004-my-reports
**Intent**: 002-citizen-report-flow
**Date**: 2026-10-29
**Type**: Remediation pass inside a completed bolt's scope
**Trigger**: User report — *"report note input shows invalid input when
submitting"*.

---

## 1. The report

The citizen completes the report flow — location → category → photo →
note — and taps submit. The submit fails with the literal string:

```text
invalid_input
```

**The note was never the problem. The photo was.**

---

## 2. Root cause

### 2.1 The photo picker inlined the original bytes

`app/report/(create)/photo/page.tsx` `addFiles()` read the chosen file
with a raw `reader.readAsDataURL(file)` — no downscale, no compression,
no size check. A modern phone photo is 3–8 MB binary → a 4–11 MB
base64 data-URL string.

### 2.2 The API capped the photo at ~1.5 MB binary

`app/api/tickets/route.ts` validated the photo URL with:

```ts
PhotoUrl = z.string().max(2_000_000).refine(isAcceptablePhotoUrl)
```

2,000,000 characters ≈ 1.5 MB binary — far below a normal phone photo.
The route answered `400 { error: 'invalid_input' }`.

### 2.3 The note page rendered the raw machine code

`app/report/(create)/note/page.tsx` did:

```ts
setError(body.error ?? …);
```

so the citizen saw the literal string `invalid_input` — an API
contract code presented as if it were a message.

### 2.4 The cap was a regression

Commit `a7ef078` (the thumbnail hotfix) replaced `z.string().url()`
(no length cap) with `z.string().max(2_000_000)…`. The boundary was
measured over HTTP before the fix:

| Payload | Response |
|---|---|
| 2,000,000 chars | 200 |
| 2,000,023 chars | 400 `too_big max=2000000` |
| 4 M / 8 M chars | 400 |

### 2.5 The crew path had the identical defect

`app/api/v1/crew/tickets/[id]/photos/route.ts` carried the same
`.max(2_000_000)` on its `url` branch, and
`lib/crew/upload-photo.ts` gated only the **raw** file at 5 MB without
downscaling — a 4 MB photo passes that gate and still produces a 5.5 MB
base64 string.

### 2.6 The design intent was recorded but never implemented

`design-artifacts/E-Development/WO-003-field-crew-app.md:177`:

> **Photo compression policy.** v1 spec doesn't pin a target.
> Recommendation: max 1600px long edge, JPEG quality 80, EXIF stripped
> except GPS.

`next.config.js:21` even carries
`experimental.serverActions.bodySizeLimit: '4mb'` with the comment
`// generous for citizen photo upload (max 1600px q80)` — but
`bodySizeLimit` governs **server actions only**, not route handlers.
It was dead code for this flow.

---

## 3. Why the fix is two-sided

CityFix v1 is live on Vercel + Neon. Vercel's serverless request-body
ceiling (~4.5 MB) sits **below** the raised 7 M-char cap (~5.25 MB
binary). Therefore:

- **The client-side downscale is the load-bearing fix.** After a
  1600px/q80 downscale a photo is ~200–400 KB binary → ~270–540 K
  base64 chars → comfortably under every limit.
- **The raised Zod cap is the backstop** (and the effective
  local/dev behaviour).
- **The dedicated `photo_too_large` code** guarantees a readable
  Bangla message even if a client skips the downscale entirely.

---

## 4. The fix

### 4.1 `lib/format/photo-url.ts` — the shared constant

```ts
export const MAX_PHOTO_URL_CHARS = 7_000_000;
```

`MAX_BLOB_BYTES = 5 * 1024 * 1024` (5,242,880 bytes) →
`ceil(5_242_880 / 3) × 4` = 6,990,508 base64 chars + a 64-char
`data:` prefix allowance = 6,990,572 → rounded up to 7,000,000. The
cap therefore admits everything the blob store would accept. The
module stays **zero-import** so it remains client- and server-safe.

### 4.2 `lib/photo/downscale.ts` — the compression policy, implemented

The WO-003 recommendation, verbatim. Named exports only (repo rule).

- `PHOTO_MAX_LONG_EDGE = 1600`, `PHOTO_JPEG_QUALITY = 0.8`.
- **MIME gate first** — `['image/jpeg','image/png','image/webp']`.
  An empty `file.type` is *unsupported*, never defaulted to jpeg.
- **Passthrough gate** — files ≤ 256 KB keep their **original bytes**
  (PNG alpha survives; the 68-byte 1×1 transparent PNG Playwright
  fixture stays byte-identical, so the visual baselines do not move).
- **Decode** — `createImageBitmap(file, { imageOrientation: 'from-image' })`
  with a no-options retry, falling back to `HTMLImageElement` +
  object URL. `bitmap.close()` frees the pixels.
- **Encode** — canvas at the target size, `fillStyle='#ffffff'` +
  `fillRect` **before** `drawImage` (JPEG has no alpha; without the
  white fill transparent regions encode black), then
  `toDataURL('image/jpeg', 0.8)`.
- **The result's MIME prefix is verified** — a browser that cannot
  encode the requested MIME silently falls back to PNG, and we must not
  hand back a PNG under an `image/jpeg` promise.
- **Never throws.** Every browser call is inside a `try/catch`; every
  failure returns a `Result`. The downscale is an *optimisation*, never
  a new hard failure mode — on `{ ok: false }` the caller falls back to
  the original bytes.

### 4.3 `lib/photo/payload.ts` — the pre-check

```ts
export function hasOversizedPhoto(body: unknown): boolean;
```

**Why a pre-check rather than inspecting `issues[].code === 'too_big'`?**
A Zod `.max()` failure is indistinguishable from any other invalid
input — a long `note` produces the *identical* `too_big` issue code.
Deciding the dedicated code on the **raw payload** (before
`safeParse`), where the photo fields are still addressable by name,
avoids coupling the HTTP contract to Zod internals and avoids
misclassifying a long note as a photo problem. Pinned by a unit test.

Handles all three payload shapes: `photoUrls: string[]`,
`photoBlobs: [{ dataBase64 }]`, and the crew route's bare
`{ url }` / `{ dataBase64 }`.

### 4.4 `lib/photo/error-code.ts` — the code → key mapping

```ts
export function photoErrorKeyForCode(code: unknown): 'report.note.photo_too_large' | null;
```

Unknown codes map to `null`, and the caller renders its generic
localised fallback. The raw machine code is never rendered.

### 4.5 The API routes — `photo_too_large` / 413

Both routes run the probe **between the JSON parse and `safeParse`**:

```ts
if (hasOversizedPhoto(body)) {
  return NextResponse.json(
    { error: 'photo_too_large', max_chars: MAX_PHOTO_URL_CHARS },
    { status: 413 },
  );
}
```

413 is semantically correct and distinguishable from 400. On the crew
route the probe slots in **after** the auth check and **before** the
ticket lookup, so an unauthenticated caller cannot probe the limit and
an oversized body is rejected before any DB work.

| Condition | Status | `error` | Citizen sees |
|---|---|---|---|
| Photo > cap | **413** | `photo_too_large` | Bangla message |
| Any other schema violation | 400 | `invalid_input` | generic localised submit-failed |
| Body is not JSON | 400 | `invalid_json` | generic localised submit-failed |

### 4.6 The client wiring

**`app/report/(create)/photo/page.tsx`** — `downscalePhotoFile` runs
before the data URL is built; on failure the original bytes are used.
Two latent bugs were corrected here:

- `photoUrls` and `photoBlobs` were built by two **independent**
  `.filter()` passes and could drift when the blob provider was
  inactive. They are now derived from a single `photoEntries` array of
  `{ url, blob }` pairs — the drift is structurally impossible.
- The draft's `photoBlobs` are now **restored on mount** alongside
  `photoUrls`; previously only the URLs were restored, so the bytes were
  lost on refresh.
- `photoBlobs[].mimeType` is the **downscaled** MIME (`image/jpeg`), not
  the original file's MIME — otherwise the blob store writes JPEG bytes
  under a `.png` key.
- A `processing` state renders `report.photo.processing` while a large
  photo is decoded (a 4000×3000 decode + JPEG encode takes ~300–800 ms
  on a mid-range phone).

**`app/report/(create)/note/page.tsx`** and **`summary/page.tsx`** —
the raw code is replaced by the mapper:

```ts
const specificKey = photoErrorKeyForCode(body?.error);
setError(
  specificKey
    ? t(specificKey, null, LANG)
    : `${t('report.note.submit_failed', null, LANG)} (${res.status})`,
);
```

**`lib/crew/upload-photo.ts`** — the downscale now runs in **both**
branches (the inline `{ url }` branch and the
`{ dataBase64, mimeType, fileName }` branch, which must send
`mimeType: 'image/jpeg'` when the downscale re-encoded). The failure
path now **reads the response body**, so `photo_too_large` survives
instead of collapsing into the generic `invalid_url` bucket:

```ts
let code: string = `http_${res.status}`;
try {
  const errorBody = (await res.clone().json()) as { error?: string };
  if (errorBody?.error === 'photo_too_large') code = 'photo_too_large';
} catch { /* keep http_<status> */ }
```

**`app/crew/tickets/[id]/page.tsx`** — the new code is mapped to
`crew.photo.error.too_large` **before** the generic fall-through.

### 4.7 The i18n keys

Four new keys, Bangla-first, English-secondary, **all carrying no
placeholder** — the copy names no number, so it survives any future
change to the cap.

| Key | bn | en |
|---|---|---|
| `report.note.photo_too_large` | ছবিটি বড় হওয়ায় রিপোর্টটি জমা দেওয়া যায়নি। অনুগ্রহ করে ছবির সাইজ ছোট করে আবার চেষ্টা করুন, অথবা ছবি ছাড়া রিপোর্টটি জমা দিন। | The photo is too large, so the report could not be submitted. Please try a smaller photo, or submit the report without a photo. |
| `report.photo.processing` | ছবি প্রস্তুত করা হচ্ছে… | Preparing your photo… |
| `report.photo.too_large` | ছবিটি বড়। ছোট করে আবার চেষ্টা করুন। | That photo is too large. Please try a smaller one. |
| `crew.photo.error.too_large` | ছবিটি বড় হওয়ায় আপলোড হয়নি। অনুগ্রহ করে ছোট ছবি বেছে নিন। | The photo was too large to upload. Please choose a smaller image. |

---

## 5. Test coverage

### 5.1 New — `tests/unit/photo/downscale.test.ts` (42 tests)

- `computeDownscaleDimensions`: 4000×3000 → `{1600,1200,changed:true}`;
  portrait; square; ≤1600 unchanged; 1×1 unchanged; 0×0 no
  divide-by-zero; never-zero dimensions; aspect ratio preserved within
  1 px; a custom `maxLongEdge`.
- The recorded policy: `PHOTO_MAX_LONG_EDGE === 1600`,
  `PHOTO_JPEG_QUALITY === 0.8`, `PHOTO_PASSTHROUGH_MAX_BYTES === 256 KiB`.
- The gates: HEIC / GIF / empty type → `unsupported_type`; the promise
  always resolves; a small file passes through byte-identically.
- The encode path under a **DOM stub** (the repo's established
  polyfill technique, cf. `tests/unit/crew/upload-photo.test.ts`):
  downscale → JPEG q80; the `mime_fallback` detection; `no_context`;
  `no_document`; a throwing canvas; the white-fill-before-draw
  ordering; a custom quality/MIME; the zero-dimension guard.
- The decode fallbacks: the `createImageBitmap` no-options retry; both
  attempts rejecting; the `HTMLImageElement` path; the
  `onload`/`onerror` pair when `img.decode` is absent; a broken image;
  a missing `URL.createObjectURL`.
- The backstops: `still_too_large`, the FileReader `onerror` path, a
  throwing FileReader, a missing FileReader, a custom `maxLongEdge` /
  `quality`, `bitmap.close()` being called, and `close()` throwing.

### 5.2 New — `tests/unit/photo/payload.test.ts` (11 tests)

The cap boundary (exactly at → `false`; `+1` → `true`), every element
of `photoUrls`, non-string elements ignored, the `photoBlobs` array,
the bare `{ dataBase64 }` and `{ url }` crew shapes, an empty object,
non-object bodies never throwing — and
`hasOversizedPhoto({ note: 'A'.repeat(10_000) })` is **`false`**: a long
note is NOT a photo problem.

### 5.3 New — `tests/unit/photo/error-code.test.ts` (7 tests)

The mapping, `null` for unknown codes, no throw on non-string input;
the mapped key is registered with both locales and carries no
placeholder.

### 5.4 New — `tests/unit/photo/wiring.test.ts` (13 tests)

Source-level assertions — the honest strategy given Vitest's
`environment: 'node'` (the repo installs no jsdom/happy-dom, so the
canvas path cannot be unit-tested directly; cf. the established
`tests/unit/report-card-thumbnail-render.test.ts` pattern).

The direct regression guard for the reported symptom:

```ts
expect(CITIZEN_NOTE_PAGE).not.toMatch(/setError\(body\.error\b/);
```

plus: the photo page calls `downscalePhotoFile`, keeps the URL and its
blob in ONE paired array (`photoEntries`), sends the downscaled MIME,
shows the processing hint; the summary page never renders the raw
code; the crew helper downscales and reads the error body; the crew
page maps the code; and both routes use the shared constant and run the
oversize probe, with the old `2_000_000` literal **gone**.

### 5.5 Modified — `tests/unit/photo-url-api-boundary.test.ts`

Now imports `MAX_PHOTO_URL_CHARS` instead of mirroring a hard-coded
`.max(2_000_000)`. Added: a photo exactly at the cap is accepted;
one char over is rejected with `code === 'too_big'`; **a 4,000,000-char
data URL is accepted** (the direct regression guard for the reported
bug); `MAX_PHOTO_URL_CHARS >= Math.ceil((5*1024*1024)/3)*4 + 64`;
`lib/storage/blob.ts` still declares `MAX_BLOB_BYTES = 5 * 1024 * 1024`
so the two cannot drift; neither route contains `2_000_000`.

### 5.6 Modified — `tests/unit/crew/upload-photo.test.ts`

Three new tests: the original bytes are used when the downscale cannot
run (the node env has no DOM → `decode_failed`); a `413
{ error: 'photo_too_large' }` response surfaces as the dedicated code;
a non-JSON 400 body still degrades to `http_400`.

### 5.7 Modified — `tests/unit/i18n-placeholder-contract.test.ts`

The four new keys are registered with both locales, carry no
placeholder, and render without leaving a literal `{`.

---

## 6. Verification evidence

### 6.1 Static gates

| Gate | Command | Result |
|------|---------|--------|
| Types | `npx tsc --noEmit` | **clean** |
| Unit | `npm run test:unit` | **1034 passed / 1034**, 70 files |
| Coverage | `npm run test:unit:coverage` | **90.44%** lines overall; `lib/photo` **97.63%**; `downscale.ts` **97.27%** (floor: 80%) |
| i18n | `npm run check:i18n` | **ok** — 718 keys registered |
| Lint | `npm run lint` | **0 errors** (55 warnings, none in the touched files) |
| Visual | `npm run test:mockups` | **15 passed** — byte-for-byte, **no regeneration** |

Unit count moved from 947 → 1034 (66 → 70 files); the delta is the 87
new tests across the four new/changed photo test files.

### 6.2 Live HTTP repro (dev store, port 3010)

Measured against the running server — **9/9 assertions passed**:

| Payload | Before | After |
|---|---|---|
| 2,000,023 chars (the old cliff) | 400 `invalid_input` | **201 Created** |
| 4,000,000 chars | 400 `invalid_input` | **201 Created** |
| 7,000,001 chars (over the cap) | 400 `invalid_input` | **413** `{"error":"photo_too_large","max_chars":7000000}` |
| 300,000 chars (a downscaled photo) | — | **201 Created** |
| Crew route, over the cap | 400 | **413** `photo_too_large` |
| Crew route, the 1×1 PNG fixture | 200 | **200** (unchanged) |

---

## 7. Residual / follow-up

- **HEIC/HEIF (the iPhone default)** is not decodable by
  `createImageBitmap` outside Safari and is not in the allow-list →
  rejected by the MIME gate → the helper falls back to the original
  bytes and the API rejects it. A dedicated
  `report.photo.unsupported_type` key is a **v1.1** item; the repo
  already documents "HEIC / HEIF (mobile-only; deferred to v1.1)" in
  `lib/crew/upload-photo.ts`. Not in scope here.
- **A total-body guard** (`request_too_large`) is a v1.1 hardening item.
  5 photos × 7 M chars is far above Vercel's ~4.5 MB ceiling — the
  downscale is what makes the worst case unreachable in practice.
- **`next.config.js` `bodySizeLimit`** governs server actions only. A
  correcting comment was added so no one relies on it as the photo cap.
- **Low-end phones** — a 4000×3000 decode transiently allocates ~60 MB
  and blocks the main thread for ~0.5–1 s. The `processing` state gives
  feedback. Acceptable for v1.
- The bolt's **3 deferred Playwright baselines** remain outstanding
  (see `ddd-04-thumbnail-hotfix.md` § 7).

---

## 8. File manifest

**New (source)**

- `lib/photo/downscale.ts` — the compression policy
- `lib/photo/payload.ts` — `hasOversizedPhoto`
- `lib/photo/error-code.ts` — `photoErrorKeyForCode`

**Modified (source)**

- `lib/format/photo-url.ts` — `MAX_PHOTO_URL_CHARS = 7_000_000`
- `app/api/tickets/route.ts` — shared cap + the 413 pre-check
- `app/api/v1/crew/tickets/[id]/photos/route.ts` — same
- `app/report/(create)/photo/page.tsx` — downscale + `photoEntries`
- `app/report/(create)/note/page.tsx` — the code → key mapping
- `app/report/(create)/summary/page.tsx` — the code → key mapping
- `lib/crew/upload-photo.ts` — downscale in both branches + read the body
- `app/crew/tickets/[id]/page.tsx` — `crew.photo.error.too_large`
- `lib/i18n/keys.ts` — 4 new keys

**New (tests)**

- `tests/unit/photo/downscale.test.ts` — 42 tests
- `tests/unit/photo/payload.test.ts` — 11 tests
- `tests/unit/photo/error-code.test.ts` — 7 tests
- `tests/unit/photo/wiring.test.ts` — 13 tests

**Modified (tests)**

- `tests/unit/photo-url-api-boundary.test.ts`
- `tests/unit/crew/upload-photo.test.ts`
- `tests/unit/i18n-placeholder-contract.test.ts`

**Modified (artifacts)**

- `bolt.md` — hotfix stage + section
- `maintenance-log.md` — entry
- `_progress/00-design-log.md` — entry
