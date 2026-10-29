# DDD-04 — Report-card thumbnail hotfix

**Bolt**: 002-004-my-reports
**Unit**: 002-citizen-report-flow/004-my-reports
**Intent**: 002-citizen-report-flow
**Date**: 2026-10-29
**Type**: Remediation pass inside a completed bolt's scope
**Trigger**: User report — *"my reports page, where the report card
doesn't show the thumbnail image"*, extended to *"similar affected
pages"*.

---

## 1. The report

The citizen's "My reports" list (`app/reports/page.tsx`) rendered
report cards with a status pill, category, ward, age and note — and
**no thumbnail at all**. The user asked for the same gap to be fixed
on the other affected surfaces.

---

## 2. Investigation

### 2.1 What was already correct (verified, not assumed)

Before changing anything, the full data path was traced and
**empirically verified** rather than inferred:

| Stage | File | Finding |
|-------|------|---------|
| Capture | `app/report/(create)/photo/page.tsx` | The picker reads the file with a `FileReader` and produces an inline `data:image/…;base64,…` URL. Correct. |
| Submit | `app/report/(create)/note/page.tsx`, `…/summary/page.tsx` | POSTs `photoUrls` (inline) **and** `photoBlobs` (raw bytes) to `POST /api/tickets`. Correct. |
| Persist | `app/api/tickets/route.ts` | Writes one `TicketPhoto` row per URL with `uploadedByRole: 'citizen'`. Correct. |
| Store | `lib/dev-store.ts` | `ticketPhoto.create` + `findManyForTicket`, ordered by `uploadedAt` ASC. Correct. |
| Join | `lib/db-switch.ts` → `getTicketWithTrail` | Joins `photos` (Prisma) / `photos` (dev store). Correct. |
| Serialize | `lib/serializers/ticket.ts` | `splitPhotosForSerializer` → `beforePhotoUrls` / `afterPhotoUrls` / union `photoUrls`. Correct. |
| Expose | `app/api/v1/activity/route.ts` | Serializes through the role-aware serializer. Correct. |

An end-to-end probe against the dev store (ticket created → photo
row written → `getTicketWithTrail` → `serializeTicketForRole`)
confirmed the photo URL survives every hop byte-for-byte:

```text
seed ticket: ticket_seed_closed_1 reporter: user_citizen_rahim
photos joined by getTicketWithTrail: 1
photo url: data:image/jpeg;base64,/9j/4AAQSkZJRgABA
serialized.photoUrls: 1
serialized.beforePhotoUrls: 1
serialized.afterPhotoUrls: 0
photoUrls[0] === DATA_URL: true
```

**The data was never lost. The data was never rendered.**

### 2.2 Defect A — the render gap (the user's reported symptom)

`app/reports/page.tsx` mapped `photoUrls` into its client state
(`ActivityItem.photoUrls`) and then… rendered no image. The card
markup jumped straight from the `<Link>` to the status pill.

The same gap existed on two staff surfaces:

- `app/dispatcher/page.tsx` — `QueueRow` showed a `<span>` with
  `categoryIcon(ticket.categorySlug)` and ignored `photoUrls`
  entirely.
- `app/crew/page.tsx` — `CrewRow` did exactly the same.

### 2.3 Defect B — the unquoted CSS `url()` (a blank square)

`app/dispatcher/monitor/page.tsx` DID render a thumbnail, but built
the style as:

```tsx
background: `url(${row.thumbnailUrl}) center/cover no-repeat`,
```

An inline `data:image/jpeg;base64,…` URL contains commas,
semicolons and may contain parentheses inside the base64 payload.
Unquoted, those terminate the CSS `url()` function early — the
square rendered blank. `lib/dispatcher/monitor.ts` compounded it by
taking the **last** array element blindly, so a trailing
unrenderable value blanked the thumbnail even when an older,
renderable photo existed.

### 2.4 Defect C — the API boundary contract (a second, narrower bug)

`POST /api/tickets` and `POST /api/v1/crew/tickets/[id]/photos`
validated the photo URL with `z.string().url()`. In Zod 3.x
(installed: **3.25.76**) that check is implemented as
`new URL(value)`, which parses **any** absolute scheme. Measured
against every shape the app actually stores:

```text
--- z.string().url() (the OLD boundary) ---
true  inline data URL
true  http URL
false root-relative
true  javascript scheme
true  data:text/html
false empty
false whitespace
```

Two real consequences:

1. **It rejected the root-relative `/api/blob/…` shape** — the local
   blob provider's URL. A report filed with the local provider
   failed validation with HTTP 400 and the photo was never
   persisted.
2. **It accepted `javascript:` and `data:text/html`** — a stored-URL
   XSS vector. The photo URL is persisted **verbatim** and later
   handed to `<img src>` and `background-image: url(...)`.

> **Correction to an earlier working hypothesis.** During
> investigation the working hypothesis was that `z.string().url()`
> rejected the inline `data:` URL, which would have dropped the
> citizen's photo at submission time. **That hypothesis was wrong**
> and was discarded once the Zod behaviour was measured rather than
> assumed — `new URL()` accepts `data:` URLs. The data path was
> never broken. The bug was entirely on the render side. The API
> boundary was still wrong, but for two *different* reasons than
> first thought, and the fix below addresses the real ones.

---

## 3. The fix

### 3.1 Design principle

> **The write-side and read-side photo-URL contracts must agree.**
> A URL shape the API accepts is a shape the renderer can display —
> and nothing else.

`lib/format/photo-url.ts` already owned the read side
(`isRenderablePhotoUrl`, `firstRenderablePhotoUrl`,
`thumbnailBackground`). The write side had drifted. The fix makes
both sides ask the same module, and adds the one helper each side
was missing.

### 3.2 `lib/format/photo-url.ts`

Added two exports (all other exports unchanged):

- **`lastRenderablePhotoUrl(urls)`** — scans BACKWARDS and returns the
  last renderable entry, so an unrenderable trailing row cannot blank
  a thumbnail. Used by the dispatcher monitor, which wants the
  freshest evidence (the crew's after-photo over the citizen's
  before-photo).
- **`isAcceptablePhotoUrl(url)`** — the write-side counterpart of
  `isRenderablePhotoUrl`. Accepts exactly the three legitimate
  shapes; rejects empty values, non-image `data:` URLs and script
  schemes.

### 3.3 `app/reports/page.tsx` — the reported page

- Card layout changed from `display: 'block'` to `display: 'flex'`
  with `gap: 'var(--space-3)'`; the text content moved into a
  `<div style={{ flex: 1, minWidth: 0 }}>` so the thumbnail and the
  text share the row.
- Added a 56×56 `<img>` with `objectFit: 'cover'`,
  `borderRadius: 'var(--radius-sm)'` and `loading="lazy"`, sourced
  from `firstRenderablePhotoUrl(tkt.photoUrls)`.
- Falls back to the shared `<PhotoPlaceholder size={56} />` — the
  genuine "no photo attached" state — when there is nothing
  renderable.

### 3.4 `app/dispatcher/page.tsx` and `app/crew/page.tsx`

Same treatment, 40×40, falling back to the pre-existing
`categoryIcon(ticket.categorySlug)` glyph when the ticket has no
photo (so the row never loses its category signal).

### 3.5 `app/dispatcher/monitor/page.tsx` + `lib/dispatcher/monitor.ts`

- The style now uses `thumbnailBackground(row.thumbnailUrl) ?? 'var(--color-surface-raised)'`,
  which quotes the URL so a data URL cannot break out of the CSS
  function.
- The thumbnail URL is resolved with `lastRenderablePhotoUrl(t.photoUrls)`
  instead of taking the last array element blindly.

### 3.6 API boundaries

`app/api/tickets/route.ts` and
`app/api/v1/crew/tickets/[id]/photos/route.ts` now validate with:

```ts
const PhotoUrl = z
  .string()
  .max(2_000_000)
  .refine(isAcceptablePhotoUrl, {
    message:
      'photo URL must be an inline image data URL, an http(s) URL, or a root-relative path',
  });
```

This accepts the root-relative local-blob path (which `z.string().url()`
rejected) and rejects script schemes (which `z.string().url()`
accepted).

### 3.7 `app/crew/tickets/[id]/page.tsx` — defence in depth

The crew detail page put a raw photo URL into a **clickable**
`<a href={u}>`. `<img src>` is not a script-execution vector, but an
`href` is. The href now goes through `isRenderablePhotoUrl` and
becomes `undefined` for an unrenderable value.

---

## 4. Surfaces audited (no change needed)

Every other surface that touches `photoUrls` was audited. All of them
already render correctly:

| Surface | How it renders | Verdict |
|---------|----------------|---------|
| `app/home/page.tsx` | `firstRenderablePhotoUrl` + `<img>` | already correct |
| `app/feed/page.tsx` | `firstRenderablePhotoUrl` + `<img>` | already correct |
| `components/PublicLandingExperience.tsx` | `firstRenderablePhotoUrl` | already correct |
| `app/reports/[id]/page.tsx` | `thumbnailBackground(url)` grid | already correct |
| `app/dispatcher/tickets/[id]/page.tsx` | `thumbnailBackground(url)` grid | already correct |
| `app/admin/tickets/[id]/page.tsx` | `<img src>` (no anchor) | already correct |
| `app/report/(create)/photo/page.tsx` | picker previews | already correct |
| `app/report/(create)/summary/page.tsx` | `thumbnailBackground` | already correct |

---

## 5. Test coverage

### 5.1 `tests/unit/format/photo-url.test.ts` (extended)

+81 lines. New `describe('lastRenderablePhotoUrl')` (4 tests) and
`describe('isAcceptablePhotoUrl')` (5 tests), covering: the last
renderable entry wins; an unrenderable trailing entry is skipped
rather than blanking the thumbnail; empty / null / undefined /
fully-unrenderable lists return `null`; whitespace is trimmed; and
`isAcceptablePhotoUrl` agrees with `isRenderablePhotoUrl` on every
case.

### 5.2 `tests/unit/photo-url-api-boundary.test.ts` (new — 12 tests)

Pins the API-boundary contract:

- the three legitimate shapes are accepted;
- `javascript:`, `data:text/html`, and empty values are rejected;
- `z.string().url()` is asserted to be the **wrong** contract
  (it accepts `javascript:` and rejects `/api/blob/…`) so the
  reasoning cannot silently regress;
- source-level assertions: `POST /api/tickets` must not contain
  `z.array(z.string().url())` and must contain
  `photoUrls: z.array(PhotoUrl)` + `isAcceptablePhotoUrl`; the crew
  photos route must not contain `url: z.string().url()` and must
  contain `isAcceptablePhotoUrl`.

### 5.3 `tests/unit/report-card-thumbnail-render.test.ts` (new — 13 tests)

Pins the render contract at the source level for every list-row
surface that receives `photoUrls`:

- `app/reports/page.tsx` — resolves via `firstRenderablePhotoUrl`,
  emits `<img src={photoUrl!}>`, falls back to `PhotoPlaceholder`;
- `app/dispatcher/page.tsx` and `app/crew/page.tsx` — same, falling
  back to `categoryIcon(ticket.categorySlug)`;
- `app/dispatcher/monitor/page.tsx` — must NOT contain an unquoted
  `` `url(${row.thumbnailUrl})` `` and must use
  `thumbnailBackground(row.thumbnailUrl)`;
- `app/crew/tickets/[id]/page.tsx` — must not put a raw photo URL
  into a clickable `href`.

---

## 6. Verification evidence

| Gate | Command | Result |
|------|---------|--------|
| Types | `npx tsc --noEmit` | **clean** |
| Unit | `npm run test:unit` | **939 passed / 939**, 65 files |
| Visual | `npm run test:mockups` | **15 passed** |
| Lint | `npm run lint` | **0 errors** (53 pre-existing warnings, none in touched files) |

All three gates are mandated by
`aidlc/spaces/default/memory/team.md`:

- *"ALWAYS run `npx tsc --noEmit` before declaring a Bolt complete."*
- *"ALWAYS run `npm run test:unit` after editing any file under `lib/`."*
- *"ALWAYS run `npm run test:mockups` before declaring any UI work complete."*

### A note on one test failure seen mid-run

`tests/unit/webauthn-prod-guard.test.ts` timed out at 5000 ms in
the first full-suite run. It was confirmed **pre-existing and
unrelated**: it passes in isolation (2337 ms), and it passes on a
clean stashed tree with the same timing (1857 ms) — it is a
5-second-timeout flake under parallel transform load. The final
suite run shows it green (1922 ms).

---

## 7. Residual / follow-up

- The bolt's **3 deferred Playwright baselines** (list-empty,
  list-with-rows, detail-resolved) are still outstanding. The
  `list-with-rows` baseline is now affected by this hotfix — the
  `/reports` row layout changed from a single column to a
  thumbnail + text row — so when it is eventually captured, the
  citizen report card will show the thumbnail.
- The citizen's report detail page (`app/reports/[id]/page.tsx`)
  renders before/after photo grids with a delete affordance; that
  surface was already correct and was not touched.

---

## 8. File manifest

**Modified (source)**

- `lib/format/photo-url.ts` — +`lastRenderablePhotoUrl`,
  +`isAcceptablePhotoUrl`
- `lib/dispatcher/monitor.ts` — `lastRenderablePhotoUrl` for the
  thumbnail URL
- `app/reports/page.tsx` — thumbnail row + `PhotoPlaceholder`
  fallback
- `app/dispatcher/page.tsx` — thumbnail + category-glyph fallback
- `app/crew/page.tsx` — thumbnail + category-glyph fallback
- `app/dispatcher/monitor/page.tsx` — quoted `thumbnailBackground`
- `app/crew/tickets/[id]/page.tsx` — guarded photo `href`
- `app/api/tickets/route.ts` — `isAcceptablePhotoUrl` boundary
- `app/api/v1/crew/tickets/[id]/photos/route.ts` —
  `isAcceptablePhotoUrl` boundary

**Modified (tests)**

- `tests/unit/format/photo-url.test.ts` — extended (+81 lines)

**New (tests)**

- `tests/unit/photo-url-api-boundary.test.ts` — 12 tests
- `tests/unit/report-card-thumbnail-render.test.ts` — 13 tests
