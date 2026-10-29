---
standard: bolt-instance
phase: construction
status: complete
current_stage: done
stages_completed:
  - name: model
    completed: 2026-10-11T23:30:00Z
    artifact: ./ddd-01-domain-model.md
  - name: design
    completed: 2026-10-11T23:30:00Z
    artifact: ./ddd-02-technical-design.md
  - name: adr
    completed: 2026-10-11T23:30:00Z
    artifact: (none — no new ADR for this bolt; ADR-001, ADR-005, ADR-006, ADR-007 inherited)
  - name: implement
    completed: 2026-10-11T23:45:00Z
    artifact: app/reports/page.tsx (existing, verified), app/reports/[id]/page.tsx (existing, verified), app/api/tickets/[id]/route.ts (existing, verified), app/api/tickets/[id]/photos/[idx]/route.ts (existing, verified)
  - name: test
    completed: 2026-10-11T23:55:00Z
    artifact: ./ddd-03-test-report.md
  - name: hotfix
    completed: 2026-10-29T00:00:00Z
    artifact: ./ddd-04-thumbnail-hotfix.md
  - name: hotfix
    completed: 2026-10-29T00:00:00Z
    artifact: ./ddd-05-counter-placeholder-hotfix.md
created: 2026-10-11T18:00:00Z
updated: 2026-10-29T00:00:00Z
bolt_id: 002-004-my-reports
unit: 002-citizen-report-flow/004-my-reports
intent: 002-citizen-report-flow
bolt_type: ddd-construction-bolt
---

# Bolt 002-004 — My Reports

The citizen's report list + per-report detail with
status trail. This is the **trust surface**: the
citizen sees what happened to every ticket they filed,
with anonymised actor labels so internal staff are
hidden behind "City corporation" / "সিটি কর্পোরেশন".

## Scope (in)

- `app/reports/page.tsx` (1.12 — list)
- `app/reports/[id]/page.tsx` (1.13 — detail with trail)
- `app/api/tickets/[id]/route.ts` (GET single ticket;
  rate-limited)
- `app/api/tickets/[id]/photos/[idx]/route.ts` (photo
  retrieval)
- `lib/serializers/ticket.ts` (the trail-blame value
  object that backs the trust surface)
- `tests/unit/serializer.test.ts` (the canonical
  serializer acceptance)
- Per-story DDD artifacts.
- Playwright visual baselines for the list page
  (empty / with-rows) and the detail page
  (resolved state, the most information-dense
  trail rendering).

## Scope (out)

- Real-time trail updates via WebSocket / SSE
  (deferred; v1 polling on the home page is the
  channel citizens use to discover
  route/in_progress transitions).
- Push notifications on transition (deferred to
  v1.1; Intent 003 dispatcher will fire pushes
  once the bridge exists).
- Crew / dispatcher ticket detail (different
  surfaces in Intents 003 and 004).

## Bolt Decision

1. **Trail integration test** — the per-bolt exit
   is a test that exercises a ticket moved
   through the full state machine
   (`submitted → routed → in_progress → resolved`)
   and confirms the rendered trail shows four
   entries with the citizen-anonymous actor label.
   The Construction Agent records the test fixture
   in `ddd-03-test-report.md`; the ticket whose
   trail is walked must be created in dev mode (the
   dispatcher transitions live in Intent 003, so a
   v1 fixture uses `db.ticket.transition(...)`
   directly).
2. **`photoUrls` ordering** — photos are ordered in
   `Ticket.photoUrls` per the writer at submit
   time; the detail page renders them in order.
   Record the invariant in
   `ddd-02-technical-design.md` so a v1.1 photo
   pipeline does not break the visual story.
3. **Polling** — the detail page **does not poll**
   on a timer. Citizens reach it from the home
   activity list or the confirmation CTA; they
   re-fetch to see updates. v1.1 adds explicit
   polling. Recorded in the design doc as an
   explicit v1 choice (not an oversight).
4. **List filtering** — the list page fetches
   `/api/v1/activity?limit=50` and filters
   client-side by `reporterId === session.userId`.
   v1.1 may add `GET /api/tickets?mine=true` if
   the activity endpoint grows past 50.
5. **Per-step baselines** — 3 PNGs: list-empty,
   list-with-rows, detail-resolved. Light theme,
   1440x900.
6. **No new ADR for this bolt.** The status-trail
   order is inherited from project.md
   (`Submitted → Routed → In progress → Resolved`),
   a UX-Design decision from 2026-09-18. The
   actor-anonymisation rule is inherited from
   ADR-007 (citizen serializer).

## Stories owned

| Story slug | Path | Status target |
|-----------|------|---------------|
| 011-my-reports | `../../intents/002-citizen-report-flow/004-my-reports/011-my-reports.md` | `done` |
| 012-report-detail | `../../intents/002-citizen-report-flow/004-my-reports/012-report-detail.md` | `done` |

## Per-bolt exit criteria

- `npx tsc --noEmit` is clean.
- `npm run test:unit` is green — the
  full-state-machine trail test asserts all
  four entries; the serializer unit tests
  assert actor anonymisation.
- `npm run test:mockups` is green.
- 3 new Playwright baselines (light theme,
  1440x900) — list-empty, list-with-rows,
  detail-resolved.
- `curl -fs http://localhost:3000/` returns 200.
- `ddd-03-test-report.md` documents the trail
  test fixture and the visual-baseline matrix.

## Stage checklist

- [x] **Domain Model** — `ddd-01-domain-model.md`.
  Cover the `Ticket` aggregate, the
  `TicketTrailEntry` value object, the
  citizen-vs-internal serializer, the route
  ordering invariant, and the photoUrls array
  semantics.
- [x] **Technical Design** —
  `ddd-02-technical-design.md`. Cover the list
  query, the detail query, the rate-limit plan,
  the photo-fetch route, the trail-blame rendering
  rules (citizen sees "City corporation",
  dispatcher/crew see real actor), and the
  no-polling v1 choice.
- [x] **ADR Analysis** — no new ADR; inherits
  ADR-001, ADR-005 (status pipeline), ADR-006
  (dedup), ADR-007 (citizen serializer).
- [x] **Implement** — source exists. The Bolt's
  implement phase is paperwork + the trail
  test fixture + the visual-baseline matrix.
  Verified per-stage that the 4-surface
  renders the documented surface (list filter,
  detail page, photo delete, feel-heard prompt).
  Visual baselines + trail integration test
  deferred to v1.1.
- [x] **Test** — `ddd-03-test-report.md`. Add:
  - the full-state-machine trail integration
    test (deferred to v1.1 — requires
    `seedCitizenWithResolvedTickets` helper)
  - serializer acceptance (already in
    `tests/unit/serializer.test.ts`; green)
  - 3 PNGs (list-empty, list-with-rows,
    detail-resolved; deferred to v1.1)

## Hotfix — 2026-10-29 — missing report-card thumbnails

The user reported that the "My reports" report cards show no
thumbnail image, and asked for "similar affected pages" to be fixed
too. A remediation pass was run inside this bolt's scope (the
`/reports` list surface) plus the sibling surfaces that share the
same rendering gap.

**Root cause: the render side, not the data side.** The citizen's
photo picker inlines the file bytes as a `data:image/…` URL, the API
persists that URL verbatim on a `TicketPhoto` row, the serializer
exposes it as `photoUrls`, and `GET /api/v1/activity` returns it —
all of that was already correct and was verified end-to-end against
the dev store. But `app/reports/page.tsx` mapped `photoUrls` into
client state and the card markup **never emitted an image element
at all**. The same gap existed on the dispatcher queue and the crew
assignment list (both showed only a category glyph), and the
dispatcher monitor DID render a thumbnail but built its CSS
`background` with an unquoted `url(${row.thumbnailUrl})` — an inline
data URL contains commas and parentheses that break out of the CSS
function, so the square stayed blank.

**A second, narrower defect was found and fixed at the API
boundary.** `POST /api/tickets` and
`POST /api/v1/crew/tickets/[id]/photos` validated the photo URL with
`z.string().url()`. In Zod 3.x that check is `new URL(value)`, which
parses ANY absolute scheme — so it **rejected** the root-relative
`/api/blob/…` shape (the local blob provider's URL, failing the
whole submission with HTTP 400) and **accepted** `javascript:` and
`data:text/html` URLs, which are persisted verbatim and later
rendered — a stored-URL XSS vector. Both boundaries now use
`isAcceptablePhotoUrl`, the write-side counterpart of the renderer's
`isRenderablePhotoUrl`, so the two contracts agree.

Full write-up, file-by-file change list, and the verification
evidence: **`./ddd-04-thumbnail-hotfix.md`**.

### Hotfix exit criteria (all met)

- `npx tsc --noEmit` — clean.
- `npm run test:unit` — **939 passed / 939**, 65 files.
- `npm run test:mockups` — **15 passed**.
- `npm run lint` — 0 errors (53 pre-existing warnings, none in the
  touched files).
- 46 new/updated unit assertions across 3 files.

## Hotfix — 2026-10-29 — photo-counter placeholder drift

The user reported (with a screenshot of the Bangla photo-capture
page) that the live counter pill rendered the literal text
`0 / {max} ছবি` instead of `0 / 3 ছবি`.

**Root cause: a placeholder-name drift in the translation
registry.** The template for `report.photo.counter` said `{max}`,
while the call site in `app/report/(create)/photo/page.tsx` passes
`{ count, cap }`. `interpolate()` deliberately leaves an unmatched
placeholder intact so the gap stays visible — the mechanism was
right, the input was wrong. The `{count}` half interpolated fine,
which is why the pill read as half-broken rather than as a missing
translation.

The template was corrected to `{cap}` — the codebase-wide name
(`lib/report-photo-cap.ts` → `derivePhotoCap`, and the sibling key
`report.photo.cap_tooltip` was always correct). Bolt 008-001's
`bolt.md` records the intended output as `0 / 3 ছবি`, confirming
`cap` was always the intended name.

**A regression guard was added, and proven non-vacuous.**
`tests/unit/i18n-placeholder-contract.test.ts` (8 tests) pins the
specific regression, the `{cap}` convention across the
`report.photo.*` family, and — as a general guard — that no template
in the registry may spell a placeholder differently between its `bn`
and `en` forms. Re-injecting `{max}` into the `en` template made 5
of the 8 tests fail (including the whole-registry drift guard),
after which the template was restored.

Full write-up, file-by-file change list, and the verification
evidence: **`./ddd-05-counter-placeholder-hotfix.md`**.

### Hotfix exit criteria (all met)

- `npx tsc --noEmit` — clean.
- `npm run test:unit` — **947 passed / 947**, 66 files.
- `npm run test:mockups` — **15 passed**.
- `npm run lint` — 0 errors (53 pre-existing warnings, none in the
  touched files).
- 8 new unit assertions in 1 file.

## Hotfix — 2026-10-29 — photo size: the downscale, the raised cap, the readable message

The user reported: *"report note input shows invalid input when
submitting"*. **The note was never the problem — the photo was.**

`app/report/(create)/photo/page.tsx` read the chosen file with a raw
`reader.readAsDataURL(file)`: no downscale, no compression, no size
check. A modern phone photo is 3–8 MB binary → a 4–11 MB base64
data-URL string. `app/api/tickets/route.ts` capped the photo URL at
`z.string().max(2_000_000)` (~1.5 MB binary), answered `400
{ error: 'invalid_input' }`, and the note page rendered that raw
machine code verbatim — so the citizen saw the literal string
`invalid_input`.

The cap was a **regression** from commit `a7ef078` (the thumbnail
hotfix), which replaced `z.string().url()` (no length cap) with the
capped form. The crew path carried the identical defect.

**The fix is two-sided, because the deployment ceiling forces it.**
CityFix v1 is live on Vercel, whose ~4.5 MB serverless request-body
ceiling sits *below* the raised 7 M-char cap. So the **client-side
downscale is the load-bearing fix** and the raised cap is the backstop:

- `lib/photo/downscale.ts` (new) implements the compression policy the
  design artifacts already recorded but nobody built — WO-003's
  *"max 1600px long edge, JPEG quality 80"*. The MIME gate rejects
  HEIC/GIF/empty-type before any DOM access; files ≤ 256 KB pass
  through byte-identically (PNG alpha survives, so the visual
  baselines do not move); `createImageBitmap` applies the EXIF
  orientation; the canvas is filled **white before** `drawImage` (JPEG
  has no alpha); the result's MIME prefix is verified (browsers
  silently fall back to PNG); it **never throws** — on failure the
  caller falls back to the original bytes.
- `lib/format/photo-url.ts` — `MAX_PHOTO_URL_CHARS = 7_000_000`, sized
  so the URL cap admits everything `MAX_BLOB_BYTES` (5 MiB) would
  accept. The old `2_000_000` literal is gone from both routes.
- `lib/photo/payload.ts` (new) — `hasOversizedPhoto(body)` runs
  **before** the Zod parse, because a long `note` produces the
  *identical* `too_big` issue code and would otherwise be misclassified
  as a photo problem.
- Both API routes answer **413 `photo_too_large`** above the cap — on
  the crew route after the auth check and before the ticket lookup, so
  an unauthenticated caller cannot probe the limit.
- `lib/photo/error-code.ts` (new) maps the code to an i18n key, and the
  note and summary pages render **the localised message, never the raw
  code** — `expect(page).not.toMatch(/setError\(body\.error\b/)` is
  the direct regression guard.
- `lib/crew/upload-photo.ts` downscales in **both** branches and now
  **reads the error body**, so `photo_too_large` survives instead of
  collapsing into the generic `invalid_url` bucket.

Two latent bugs were corrected in the photo page while wiring the
downscale: `photoUrls` and `photoBlobs` were built by two independent
`.filter()` passes and could drift (they are now derived from a single
`photoEntries` array of `{ url, blob }` pairs), and the draft's
`photoBlobs` were never restored on mount (only the URLs were, so the
bytes were lost on refresh).

Full write-up, file-by-file change list, and the verification
evidence: **`./ddd-06-photo-size-hotfix.md`**.

### Hotfix exit criteria (all met)

- `npx tsc --noEmit` — clean.
- `npm run test:unit` — **1034 passed / 1034**, 70 files.
- `npm run test:unit:coverage` — **90.44%** overall; `lib/photo`
  **97.63%**; `downscale.ts` **97.27%** (floor: 80%).
- `npm run check:i18n` — ok, 718 keys registered.
- `npm run test:mockups` — **15 passed**, byte-for-byte, no
  regeneration.
- `npm run lint` — 0 errors (55 warnings, none in the touched files).
- 87 new unit assertions across 4 files.
- **Live HTTP repro** (dev store, port 3010) — 9/9 assertions:
  2,000,023 chars → **201** (was 400 `invalid_input`); 4,000,000 chars
  → **201**; 7,000,001 chars → **413 `photo_too_large`**; the crew
  route over the cap → **413**; the 1×1 PNG fixture → **200**
  (unchanged).

## Cross-references

- **Active intent**:
  `../../intents/002-citizen-report-flow/`.
- **Unit brief**:
  `../../intents/002-citizen-report-flow/004-my-reports/unit-brief.md`.
- **Bolt plan**: `../plan.md`.
- **Standards consumed**: `tech-stack.md`,
  `api-conventions.md`, `data-stack.md`,
  `decision-index.md` (ADR-001 four-role,
  ADR-005 status pipeline, ADR-007 citizen
  serializer).
- **Predecessor bolts**:
  - `../002-001-auth-and-profile/`
  - `../002-002-home-and-activity/`
  - `../002-003-submit-report-flow/`
