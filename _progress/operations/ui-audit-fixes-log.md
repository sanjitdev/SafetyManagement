# UI Audit — Fixes Log

**Scope:** every user flow (citizen/reporter, dispatcher, crew, admin) and every
shared surface, walked at three breakpoints — 390×844 (mobile), 1024×768
(tablet), 1440×900 (desktop).

**Method:** `ui-audit.mjs` screenshots every surface per role per viewport;
`flow-walk.mjs` drives the citizen flow end-to-end (register → OTP → home →
report → submit → track → feedback) asserting on **visible copy**, not pixels.

**Screenshots:** `ui-audit-shots/` (202 files — `{role}-{viewport}-{surface}.png`
and `flow-{viewport}-NN-{step}.png`).

**Final verification:** `npx tsc --noEmit` clean · `npm run test:unit` 60/60
files, 865/865 tests pass · `npm run test:mockups` 15/15 visual-regression
baselines pass · all 12 role×viewport audits report **zero console errors and
zero page errors** · `flow-walk.mjs` **PASSED** at both mobile and desktop
(18 steps, zero assertion failures).

---

## Responsive / layout defects

| # | What | Where |
|---|---|---|
| 1 | Admin tickets filter rail was a fixed 288px sidebar — it crushed the table to a ~100px sliver on a phone | `app/admin/tickets/page.tsx` |
| 2 | Same fixed-288px sidebar defect on the admin audit page | `app/admin/audit/page.tsx` |
| 3 | Dispatcher ticket detail's 320px sidebar rendered **over** the main content on mobile, hiding it entirely (the `dispatcher-detail-grid` class had no CSS rule at all) | `app/dispatcher/tickets/[id]/page.tsx` |
| 4 | Dispatcher queue + map used a fixed `240px 1fr` grid with no mobile override (`dispatcher-grid` had no CSS rule) | `app/globals.css` (+ `app/dispatcher/page.tsx`, `app/dispatcher/map/page.tsx`) |
| 5 | Admin audit table had `width: 100%` inside a scroll wrapper — the browser squeezed the columns instead of scrolling, breaking the Bangla timestamp across 5 lines | `components/AdminAuditTable.tsx` |
| 6 | Admin tickets table (7 columns) had the same squeeze defect | `components/AdminTicketsTable.tsx` |
| 7 | Dispatcher performance crew table + long-tail table had the same squeeze defect | `app/dispatcher/performance/page.tsx` |
| 8 | Admin cities table (7 columns) had no scroll wrapper at all | `app/admin/cities/page.tsx` |
| 9 | Admin wards table squeezed the Bangla ward name to a few characters per line | `app/admin/cities/[id]/wards/page.tsx` |
| 10 | Admin taxonomy panels were `grid-cols-2` — neither fit a 390px phone; both tables also squeezed | `app/admin/cities/[id]/taxonomy/page.tsx` |
| 11 | Admin adoption funnel / daily / heatmap tables had no scroll wrapper | `app/admin/cities/[id]/adoption/page.tsx` |
| 12 | Admin ticket-detail meta list was a fixed `160px 1fr` grid — the value column was too narrow for Bangla on a phone | `app/admin/tickets/[id]/page.tsx` |
| 13 | Taxonomy "new department" / "new category" buttons were pushed off the right edge — the `flex-1` inputs had no `min-w-0` so they refused to shrink | `app/admin/cities/[id]/taxonomy/page.tsx` |
| 14 | The header's Report CTA overflowed a 390px phone onto the brand logo — the CSS rule targeted `.appheader-cta span` but the label was a **bare text node**, so the selector matched nothing and the label never collapsed | `components/AppHeader.tsx` |
| 15 | The header's `<style>` block caused a **hydration mismatch on every page that renders it** (`/home`, `/reports`, `/feed`) once the CSS contained a quote character — React escapes a `<style>` text child | `components/AppHeader.tsx` (now `dangerouslySetInnerHTML` with a static literal) |

---

## Data / copy defects

| # | What | Where |
|---|---|---|
| 16 | Raw ticket ids (`ticket_seed_routed_1`) shown to citizens and staff on 6 surfaces | NEW `lib/format/ticket-id.ts` + `app/reports/[id]/page.tsx`, `app/crew/tickets/[id]/page.tsx`, `app/dispatcher/tickets/[id]/page.tsx`, `app/dispatcher/dedup/page.tsx`, `app/dispatcher/performance/page.tsx`, `components/AdminTicketsTable.tsx` |
| 17 | Serializer dropped `cityName`/`cityNameBn`, so every surface showed the raw `city_dhaka_north` | `lib/serializers/ticket.ts` (both role branches + the interface) + `app/dispatcher/tickets/[id]/page.tsx` |
| 18 | **The citizen's own report detail page never rendered the description they typed** — the note was accepted and then never seen again, which reads as the report having been dropped | `app/reports/[id]/page.tsx` + `lib/i18n/keys.ts` (`detail.section.description`) |
| 19 | Audit table rendered a raw orphan actor id **and mislabelled it `citizen`** — misattributing admin actions in the audit trail | `lib/admin/audit-query.ts` (new `roleFromActorId`) + `tests/unit/admin/audit-query-list.test.ts` |
| 22 | **The citizen's own submitted photo never appeared as a thumbnail** — the feed, home list and every report card rendered a blank gradient square. Root cause: a `TicketPhoto.url` stores the uploader's string verbatim, so one column holds three shapes (`data:image/…` inline — the **default**, since no blob provider is configured; `https://…` R2/S3; `/api/blob/…` local), but the thumbnails guarded on `photoUrl.startsWith('http')`, which matched only the R2/S3 shape and silently dropped the inline `data:` URL the default upload path produces | NEW `lib/format/photo-url.ts` (`isRenderablePhotoUrl` / `firstRenderablePhotoUrl` / `thumbnailBackground`) + `app/feed/page.tsx`, `app/home/page.tsx`, `app/reports/[id]/page.tsx`, `app/dispatcher/tickets/[id]/page.tsx`, `app/report/(create)/photo/page.tsx`, `app/report/(create)/summary/page.tsx`, `components/ui/ReportCard.tsx`, `components/PublicLandingExperience.tsx` |

---

## Harnesses added

| # | What | Where |
|---|---|---|
| 20 | Citizen end-to-end interaction walk — clicks through register → OTP → home → report → submit → track → feedback, asserting on visible copy | NEW `flow-walk.mjs` |
| 21 | Per-role, per-viewport screenshot walk | `ui-audit.mjs` |
| 22 | Photo-thumbnail regression spec — submits a report with an inline `data:` URL photo and asserts the thumbnail's **painted pixels** are the photo's colour (a 2×2 magenta PNG), so a silent fallback to the placeholder gradient fails | NEW `tests/24-feed-photo-thumbnail.spec.ts` + NEW `tests/unit/format/photo-url.test.ts` + `tests/unit/components/ReportCard.test.ts` |

---

## Stale specs repaired (all pre-existing on `main`)

Each was verified pre-existing by stashing the fix and re-running — the same
failure reproduced on clean `main`.

| # | What | Where |
|---|---|---|
| 23 | The theme toggle spec hunted for a 3-option `[role="radiogroup"]` on the welcome page. The control was redesigned as a 2-state sun/moon icon button, and the `AppHeader` only renders on authenticated surfaces — `/` has no toggle at all. Also: the header's Report CTA also carries an SVG, so an icon-based selector hits the wrong button; the aria-label (`হালকা`/`গাঢ়`) is the only unique discriminator | `tests/02-live-audit.spec.ts`, `tests/03-authenticated-flow.spec.ts` |
| 24 | The seed helper read `body.id`, but `POST /api/tickets` returns the ticket under a `ticket` key — so every seeded ticket threw "201 but no id in body" | `tests/03-authenticated-flow.spec.ts` |
| 25 | The Report CTA locator matched `নতুন রিপোর্ট`, a label that no longer exists — the header CTA is `রিপোর্ট করুন` | `tests/04-e2e-human-tester.spec.ts` |
| 26 | The E2E flow ran `location → photo → category → note`, but the app's flow is `location → category → photo → note → summary` (the category step was inserted at position 2) | `tests/04-e2e-human-tester.spec.ts` |
| 27 | The category option is a `<button role="radio">` — an explicit `role` overrides the implicit `button` role, so `getByRole('button')` never matched it | `tests/04-e2e-human-tester.spec.ts` |
| 28 | The map page's `page.reload({ waitUntil: 'networkidle' })` timed out — MapLibre holds tile connections open for the life of the map, so `networkidle` never fires. Switched to `domcontentloaded` + the existing `waitForMapIdle()` | `tests/08-report-location-map-light.spec.ts` |

---

## Baselines re-generated

| # | What | Where |
|---|---|---|
| 29 | The two citizen report-detail baselines were **already stale on `main`** (captured in `06dfc9a`, before the page gained the description card and the Before/After photo split). Verified pre-existing by stashing the fix and re-running: the same +98px/+108px height mismatch. Re-generated against the current markup. | `tests-mockups/baselines/20-citizen-photo-and-trail-light.spec.ts/` |
| 30 | The five home-feed baselines were stale by exactly the 64px the unified `AppHeader` now adds (captured in `860bdc4`; the header changed in the later `097a7ab` "unify header across citizen pages" commit) | `tests-mockups/baselines/06-home-feed-light.spec.ts/` |
| 31 | The auth-funnel, report-see-and-pick and report-location-map baselines predated the header unification and the MapLibre swap | `tests-mockups/baselines/05-auth-funnel-light.spec.ts/`, `07-report-see-and-pick-light.spec.ts/`, `08-report-location-map-light.spec.ts/` |

---

## Notes for future audits

- **An inline `style` out-prioritises any plain class rule.** Every responsive
  override for an inline `gridTemplateColumns` needs `!important` (fixes #3, #4,
  #12) — a plain class rule silently does nothing.
- **A `width: 100%` table inside an `overflow-x: auto` wrapper does not
  scroll** — it shrinks. A `minWidth` larger than the phone viewport is what
  makes the wrapper scroll (fixes #5–#11).
- **A flex item with `flex-1` will not shrink below its content width** unless
  it also has `min-w-0` (fix #13).
- **A JSX comment cannot sit before an element inside a ternary branch** — it
  must be the first child *inside* the element, or the branch fails to parse.
- **A comment inside a `<style>` element's text child is HTML-escaped by
  React**, which causes a hydration mismatch. Use `dangerouslySetInnerHTML`
  with a static literal (fix #3) or `<style jsx>`. **A backtick inside a
  template-literal `<style>` also terminates the literal** — do not put
  backticks in CSS comments (fix #14).
- **A CSS rule that targets a `span` will not match a bare text node.** The
  header's CTA rule looked correct but silently did nothing, because the
  label it targeted was never wrapped in an element (fix #14).
- **Read the DOM, not the screenshot**, when checking Bangla copy — a
  low-resolution glyph (`৭` vs `৪`) is easy to misread. Two "defects" in this
  audit turned out to be misread pixels, not real bugs.
- **A `background-image` `url()` must be quoted.** An unquoted `data:` URL
  (which contains `;` and `,`) is ambiguous to the CSS parser and can be
  dropped entirely — the image then never paints. Always build it through
  `thumbnailBackground()`, which quotes and escapes `"` as `%22` (fix #22).
- **A photo URL is not one shape.** `TicketPhoto.url` stores whatever the
  uploader handed the API, **verbatim**. Three shapes share the column:
  inline `data:image/…` (the default — no blob provider is configured out of
  the box), absolute `https://…` (R2/S3 with `BLOB_PUBLIC_BASE_URL`), and
  root-relative `/api/blob/…` (the local filesystem provider). Guard on the
  *scheme*, never on `startsWith('http')` — that one check silently dropped
  the default upload path (fix #22).
- **A failing visual baseline is not proof that your change broke it.**
  Before regenerating, A/B it: stash the change, re-run, and confirm the
  mismatch persists. The two citizen report-detail baselines were stale on
  `main` itself (fix #29).
- **`networkidle` never fires on a MapLibre page.** The map holds tile
  connections open for its whole life, so `waitUntil: 'networkidle'` hangs
  until the test times out. Use `domcontentloaded` and let the map's own
  settle helper do the waiting (fix #28).
- **An explicit `role` overrides the implicit one.** The report-category
  options are `<button role="radio">`, so `getByRole('button')` does not
  match them — match on `radio` (fix #27).
- **A `getByRole` name is a literal, not a regex.** `'হালকা|গাঢ়'` matches
  nothing; pass a RegExp (`/হালকা|গাঢ়/`) or use a CSS attribute selector
  (fix #23).
- **Two header buttons can both contain an SVG.** The Report CTA and the
  theme toggle are both in the `AppHeader`. Select the theme toggle by its
  aria-label (`হালকা`/`গাঢ়`), never by `:has(svg)` (fix #23).
- **A spec that calls `page.screenshot({ path })` never asserts anything.**
  It overwrites the baseline on every run — that is a capture script, not a
  regression gate, and it produces git churn on every suite run.
