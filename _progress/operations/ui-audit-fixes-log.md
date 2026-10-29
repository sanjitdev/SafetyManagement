# UI Audit — Fixes Log

**Scope:** every user flow (citizen/reporter, dispatcher, crew, admin) and every
shared surface, walked at three breakpoints — 390×844 (mobile), 1024×768
(tablet), 1440×900 (desktop).

**Method:** `ui-audit.mjs` screenshots every surface per role per viewport;
`flow-walk.mjs` drives the citizen flow end-to-end (register → OTP → home →
report → submit → track → feedback) asserting on **visible copy**, not pixels.

**Screenshots:** `ui-audit-shots/` (202 files — `{role}-{viewport}-{surface}.png`
and `flow-{viewport}-NN-{step}.png`).

**Final verification:** `npx tsc --noEmit` clean · `npm run test:unit` 63/63
files, 905/905 tests pass · `npm run test:mockups` 15/15 visual-regression
baselines pass · all 12 role×viewport audits report **zero console errors and
zero page errors** · `flow-walk.mjs` **PASSED** at both mobile and desktop
(18 steps, zero assertion failures) · the full Playwright **route suite**
(28 spec files) passes **262 passed / 7 skipped / 0 failed**.

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
| 32 | **A database outage took down the whole public site with a 500** — the landing page and `/feed` both read from `GET /api/v1/activity/public`, and its three DB reads were unguarded, so an unreachable database returned HTTP 500 to every anonymous visitor. The route already returned an empty feed when no cities were seeded; the outage path just never reached that branch | `app/api/v1/activity/public/route.ts` (city lookup, category+ticket queries and per-ticket trail hydration all degrade to an empty feed) + NEW `tests/unit/public-activity-db-outage.test.ts` |

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
| 33 | **The live-audit spec pointed at port 3002 while Playwright's `webServer` runs on 3000** — it was auditing a stale, unrelated server where every route but `/` returned 404, so 24 of its 40 tests failed on routes that were never broken. The other 28 route specs all use 3000 | `tests/02-live-audit.spec.ts` |
| 34 | **The admin write specs could never pass** — every write under `/api/v1/admin/*` passes through `requireWebAuthn`, which demands a registered WebAuthn credential plus a live challenge. The rig has no virtual authenticator and no physical key, so those writes answered `401 webauthn_required`. The dev seam (`DEV_SKIP_WEBAUTHN=1`, gated on the dev store) existed but was never set on the Playwright web server | `playwright.config.ts` (`webServer.env`) |
| 35 | The crew dev-login spec asserted a **relative** `Location` header (`/crew`), but `NextResponse.redirect` requires an absolute URL — the route was correct, the assertion was wrong | `tests/13-crew-auth.spec.ts` (assert on `new URL(location).pathname`) |
| 36 | **The crew's in-progress list was permanently empty** — the crew list, the dispatcher queue and the dispatcher map all filtered on `t.categoryId !== 'cat_streetlight'`, a hardcoded shortcut for the one seeded streetlight category. Every other category in the ward was dropped, so a crew member saw an empty assignments list. The route's own comment flagged it as v1.1 work | `app/api/v1/crew/tickets/route.ts`, `app/api/v1/dispatcher/queue/route.ts`, `app/api/v1/dispatcher/map/tickets/route.ts` (resolve the ticket's department from its category's `departmentId`) |
| 37 | The seed contradicted that department rule — the in-progress ticket was a `pothole` (`dept_roads`) assigned to Rashid, a `dept_streetlight` crew. The in-progress ticket is now a streetlight ticket (matching Rashid's department, with its copy updated to match), and the resolved drainage ticket is assigned to Karim, who is bound to `dept_roads` | `lib/dev-store.ts` |
| 38 | The crew-assignments spec asserted `?status=submitted` returns 200 with an empty list, but the API's Zod enum is `['routed', 'in_progress']` — `submitted` is a dispatcher status and is correctly rejected with 400 `invalid_query` | `tests/14-crew-assignments-light.spec.ts` |
| 39 | **The admin-cities "visual baseline" was not a baseline at all** — the spec called `page.screenshot({ path })`, which overwrites the committed PNG on every run and asserts nothing, so the gate could never fail. Converted to `expect(page).toHaveScreenshot(...)`; the committed baselines were stale and had to be re-captured, and the folder renamed to the convention `17-admin-cities-light.spec.ts/` | `tests/17-admin-cities-light.spec.ts` + `tests-mockups/baselines/17-admin-cities-light.spec.ts/` |
| 40 | The per-run audit screenshots (`tests-mockups/audit/`) were **tracked** and rewritten by every spec run — the spec headers claim they "are NOT committed baselines and are gitignored", but no `.gitignore` rule existed. Untracked the tree and added the missing rule | `.gitignore` |
| 41 | **The admin-audit spec clicked the wrong expand button** — `page.locator('button[aria-expanded]').first()` matched the `AppHeader`'s mobile **hamburger** (which also carries `aria-expanded`), not the audit row's ▶ toggle, so no row expanded and the before/after JSON never rendered. Pre-existing on `main` (verified by stashing). Scoped the locator to `table tbody button[aria-expanded]` | `tests/18-admin-audit-light.spec.ts` |
| 42 | The slow-motion E2E spec aimed at **port 3100** (the dedicated `playwright.config.local.ts` rig) while the standard suite's `webServer` runs on **3000** — every request died with `ECONNREFUSED ::1:3100`. Same class of defect as #33. Defaulted to 3000 | `tests/22-slow-motion-e2e-demo.spec.ts` |
| 43 | **Playwright swept the Vitest files.** `testDir: './tests'` had no `testMatch`, so the runner tried to execute the unit suite and died on "Vitest cannot be imported in a CommonJS module using require()". Scoped the sweep to the top-level route specs | `playwright.config.ts` (`testMatch: '*.spec.ts'`) |
| 44 | The admin-tickets spec asserted `?categoryId=cat_streetlight` returns **1** ticket — the coherent seed now has **2** (the routed one and the in-progress one, both `dept_streetlight`). Assertion updated to pin both ids | `tests/19-admin-tickets-light.spec.ts` |
| 45 | The rate-limit unit test raced the wall clock — it slept 1100ms and asserted a token had refilled. `setTimeout` can fire marginally early and a loaded CI box can stall the event loop, so the test failed intermittently with no code change to blame. Switched to fake timers, which the refill's `Date.now()` basis supports exactly | `tests/unit/platform/rate-limit.test.ts` |
| 46 | **The "no photo" placeholder was a bare `linear-gradient(135deg, primary-soft, surface-raised)` square** — an unlabelled teal-grey blob that read as a broken image rather than as an intentional empty state. Three surfaces each carried their own copy of it. Extracted the camera-glyph empty state that already existed inline in `PublicLandingExperience` (Bolt 008-011) into `components/ui/PhotoPlaceholder.tsx` and pointed all three at it | `components/ui/PhotoPlaceholder.tsx` (new), `app/feed/page.tsx`, `app/home/page.tsx`, `components/ui/ReportCard.tsx`, `components/PublicLandingExperience.tsx` |
| 47 | **The feed-photo regression spec could only run against the dev store.** It minted its session with `POST /api/dev/login`, which returns **404** now that development targets the real local Postgres — so the spec's authenticated POST came back **401** and the spec failed for a harness reason that looked like an app bug. Added `tests/helpers/auth.ts`, which uses the dev store when it is running and falls back to the real register → OTP → verify flow when it is not | `tests/helpers/auth.ts` (new), `tests/24-feed-photo-thumbnail.spec.ts` |
| 48 | The same spec hard-coded the **seed's** ids (`city_dhaka_north`, `ward_14`, `cat_streetlight`) — but the real database assigns **Prisma CUIDs** to every city / ward / category. The ids are now resolved from the live API, which works against both backends | `tests/24-feed-photo-thumbnail.spec.ts` |
| 49 | The same spec posted a **fixed coordinate**, so on the second run `POST /api/tickets` hit the 50m **dedup** check and answered `200 {dedup_match:true}` instead of `201` — no ticket created, and the assertion failed with no obvious cause. Coordinates are now jittered per call | `tests/24-feed-photo-thumbnail.spec.ts` |
| 50 | The same spec located its row with a bare `getByText(fixtureNote)`, which is **strict-mode ambiguous** once a persistent database holds more than one run's fixtures. Scoped to the first matching row (the feed is newest-first, so that is this run's) | `tests/24-feed-photo-thumbnail.spec.ts` |

---

## Baselines re-generated

| # | What | Where |
|---|---|---|
| 29 | The two citizen report-detail baselines were **already stale on `main`** (captured in `06dfc9a`, before the page gained the description card and the Before/After photo split). Verified pre-existing by stashing the fix and re-running: the same +98px/+108px height mismatch. Re-generated against the current markup. | `tests-mockups/baselines/20-citizen-photo-and-trail-light.spec.ts/` |
| 30 | The five home-feed baselines were stale by exactly the 64px the unified `AppHeader` now adds (captured in `860bdc4`; the header changed in the later `097a7ab` "unify header across citizen pages" commit) | `tests-mockups/baselines/06-home-feed-light.spec.ts/` |
| 31 | The auth-funnel, report-see-and-pick and report-location-map baselines predated the header unification and the MapLibre swap | `tests-mockups/baselines/05-auth-funnel-light.spec.ts/`, `07-report-see-and-pick-light.spec.ts/`, `08-report-location-map-light.spec.ts/` |
| 45 | The **admin-tickets** and **admin-audit** baselines still showed the raw ids (`cat_streetlight`, `ward_14`, `user_admin_ffcc`, `user_citizen_r…`) that fixes #16/#17/#19 replaced with human-readable names (`রাস্তার আলো`, `ওয়ার্ড১৪ — মিরপুর`, `Anwar (admin)`, `Rahim (citizen)`) | `tests-mockups/baselines/19-admin-tickets-light.spec.ts/`, `tests-mockups/baselines/18-admin-audit-light.spec.ts/` |
| 46 | The **crew-assignments** and **crew-ticket-detail** baselines had never been captured (the specs wrote them with `page.screenshot`, so no gate existed) | `tests-mockups/baselines/14-crew-assignments-light.spec.ts/`, `15-crew-ticket-light.spec.ts/` |

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
- **A stale browser tab is not proof that the code is broken.** The feed
  thumbnail looked broken in the user's tab while the source was already
  fixed — the tab was running a bundle compiled before the fix. Before
  changing code, drive a real browser at the running server and read the
  DOM (`hasImg`, `img.complete`, `naturalWidth`): that distinguishes "the
  code is wrong" from "the tab is stale" in one step.
- **A dev-store-only endpoint makes a spec fail as if the app were
  broken.** `/api/dev/login` returns 404 the moment development points at
  the real database, and the spec's next authenticated request comes back
  401 — a harness mismatch dressed up as an application bug. Probe the
  endpoint, don't assume it exists (fix #47).
- **A persistent database does not reset between runs.** Fixtures from
  earlier runs accumulate, so (a) a fixed coordinate hits the 50m dedup
  check and answers `200 {dedup_match}` instead of `201`, and (b) a
  `getByText(fixtureNote)` becomes strict-mode ambiguous once more than
  one row matches. Jitter the coordinates and scope the locator to the
  first matching row (fixes #49, #50).
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
- **"Can't reach database server" from Prisma does not mean the server is
  unreachable.** Prisma reports every connection-phase failure with that
  one message. The real cause was a Neon **account quota** failure
  (`53000 Your account or project has exceeded the quota`), which Postgres
  returns at the auth stage — long after TCP connect and the TLS
  handshake succeed. Diagnose it with a real client (`pg`), which surfaces
  the raw SQLSTATE; the `pg` error text names the cause outright. A raw
  SSLRequest probe is not enough: it stops at the `S` byte and tells you
  TLS is fine, nothing more.
- **A public read surface must degrade, not 500.** A backend fault should
  cost the marketing site its data, not its availability. Guard the DB
  reads on any endpoint an anonymous visitor can reach (fix #32).
- **A hardcoded test port is a silent lie.** `tests/02-live-audit.spec.ts`
  aimed at 3002 while Playwright starts the server on 3000, so it spent
  its run auditing whatever else was listening — and the failures looked
  like app bugs (fix #33). Take the base URL from `baseURL`/the
  `webServer` port, or keep every spec on the same port.
- **A 401 from an admin write may be the WebAuthn guard, not the
  session.** `requireWebAuthn` throws 401 `webauthn_required` for a
  valid admin session with no registered credential. Read the error
  *code*, not just the status — "401" pointed at auth, the code pointed
  at the credential check (fix #34).
- **`NextResponse.redirect` always sends an absolute `Location`.** Assert
  on `new URL(location).pathname`, never on the raw header string
  (fix #35).
- **A "baseline" that is written with `page.screenshot({ path })` is a
  capture script, not a gate.** It overwrites the committed PNG on every
  run, asserts nothing, and produces git churn on every suite run (fix #39).
  The audit screenshots under `tests-mockups/audit/` have the same
  property — they must be gitignored, not committed (fix #40).
- **A bare attribute selector can match an element from a different
  component.** `button[aria-expanded]` matched the `AppHeader`'s mobile
  hamburger before the audit table's row toggle, because the header
  renders first and its burger carries the same attribute (fix #41).
  Always scope a selector to the component under test — `table tbody
  button[aria-expanded]`.
- **A spec that ships with the standard suite must use the standard
  suite's port.** The slow-motion spec kept the local rig's 3100 while
  the suite's `webServer` runs on 3000, so it failed with
  `ECONNREFUSED` for a reason unrelated to the app (fix #42).
- **A `testDir` that contains another test runner's files needs a
  `testMatch`.** `testDir: './tests'` swept the Vitest unit suite and
  died on a CommonJS/ESM import error before a single assertion ran
  (fix #43).
- **A wall-clock sleep is a race, even when it sleeps "long enough".**
  A 1100ms sleep asserting a 1000ms refill boundary fails whenever the
  timer fires early or the event loop stalls. If the code under test
  reads the clock, drive the clock instead: fake timers make the
  assertion exact and the test 200× faster (fix #45).
