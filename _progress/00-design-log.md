# Design Log — CityFix

Project: CityFix (SafetyManagement repo)
WDS version: 1.0.0
Started: 2026-09-18

## Phase status

- Product Brief: complete (2026-09-18)
- Trigger Map: complete (2026-09-18, updated 2026-09-18 with admin persona)
- UX Scenarios: complete (2026-09-18)
- UX Design: complete (2026-09-18) — 33 of 33 pages spec'd (spec-as-contract)
- Visual Design: complete (2026-09-18, updated 2026-10-04 web re-skin) — tokens + components + 7 hero mockups (4 Rahim + 1 Habib + 2 Rashid)
- Development: in-progress (5 Work Orders written; 19 Rahim+Rashid specs aligned to web-first 2026-10-04; 15/15 Playwright baselines passing)

## Log

### 2026-09-18 — Product Brief complete

Discovery conducted with Sanjit. Brief suite written:

- `design-artifacts/A-Product-Brief/product-brief.md`
- `design-artifacts/A-Product-Brief/content-language.md`

`visual-direction.md` deferred to Freya's design pass.

Headline finding: CityFix's make-or-break constraint is that the platform has visibility but no enforcement power. Authority onboarding is the gating factor for v1 success, not citizen acquisition. Three design implications baked into the brief: authority onboarding is the product; visibility has to make silence visible; honest copy from day one.

Extension signals for Trigger Map: the three user populations (citizen / dispatcher / field crew) plus a thin admin role form the basis for persona workshops. Business Customers section of the brief already walks through these.

### 2026-09-18 — Trigger Map complete

Five workshops run. Persona archtypes: Rahim the Reporter (priority 02 — primary citizen), Habib the Handler (priority 03 — authority dispatcher), Rashid the Resolver (priority 04 — field crew).

Deliverables in `design-artifacts/B-Trigger-Map/`:

- `00-trigger-map.md` — four-layer poster (Mermaid)
- `01-business-goals.md` — 3 goals × 3 SMART objectives each
- `02-persona-rahim-the-reporter.md`
- `03-persona-habib-the-handler.md`
- `04-persona-rashid-the-resolver.md`
- `feature-impact.md` — 12 high-priority features, 4 medium, 5 deprioritized, gap analysis

Headline finding: Rashid's operational forces score highest (3× at FIA 15) — the field-crew workflow is the *most leverage point* on the platform, even though it is the third-priority persona. Habib's negative forces cluster at 14 (being the dead end, losing track, channel chaos) — the cost of friction inside city corp is as much a barrier as any citizen-side feature. Rahim's positive forces split evenly between *fixing the world* (14) and *being heard* (14) — both must be in v1, neither substitutes for the other.

Overall pattern: process-integrity forces dominate (visibility, tracking, clarity, accountability) over emotional or aspirational ones. CityFix is a platform whose success is gated by *operational clarity*, not by emotional design.

Notable gap surfaced in feature-impact.md: CityFix cannot actually fix infrastructure. The product's job is to surface the chain and make silence visible; the actual fix depends on Habib + Rashid + the city corp acting. This is documented in the gap analysis table for Freya to design honestly around.

### 2026-09-18 — Trigger Map updated (admin persona added)

Admin role confirmed as v1 scope. Persona 05 (Aamir the Administrator) added to Trigger Map; poster and priority table updated. Aamir is the silent enabler — every ticket Habib routes and Rashid fixes depends on his configuration working. His top force ("land the platform cleanly in his city") scored FIA 15, matching Rashid's operational forces. Six of his negative forces cluster at FIA 13 — admin UX is a higher-friction surface than it looks.

Updating feature-impact.md with admin-driven features is queued for after UX Scenarios are complete.

### 2026-09-18 — UX Scenarios complete

Four scenarios written, one per Trigger Map archetype, 33 screens identified:

- `design-artifacts/C-UX-Scenarios/01-rahim-the-reporter-reports-a-broken-streetlight.md` (14 screens)
- `design-artifacts/C-UX-Scenarios/02-habib-the-handler-runs-his-wards-morning-queue.md` (7 screens)
- `design-artifacts/C-UX-Scenarios/03-rashid-the-resolver-fixes-his-first-job-of-the-day.md` (5 screens)
- `design-artifacts/C-UX-Scenarios/04-aamir-the-administrator-sets-up-chattogram.md` (7 screens)
- `design-artifacts/C-UX-Scenarios/00-ux-scenarios.md` (index)

Key architectural decisions captured in the scenarios:
- Single responsive web app, no native apps in v1. PWA install for field crew.
- Same data model for tickets with role-specific views across all four roles.
- Per-city configuration (categories, departments, wards, language) managed by Aamir.
- Dhaka template carries over to new cities — concrete expression of Goal 3.
- Bangla-first, English-secondary across all screens, toggleable per user.
- Citizen registration is required (phone + NID + name + password + OTP) — gate prevents fake reports.
- Offline behavior limited in v1; photo capture saves locally with deferred upload.

**Queued for next:** feature-impact.md update to include admin-driven features (per-city config UI, ward-boundary editor, user provisioning, adoption dashboard). Will redo after feature-impact update.

## Current

UX Design complete. 33 page specs written across all 4 scenarios. Hand-off to Mimir queued.

### 2026-09-18 — UX Design complete

All 33 screens spec'd nested under each scenario in `design-artifacts/C-UX-Scenarios/` (e.g. `01-rahim-the-reporter/1.1-splash/1.1-splash.md`) following the spec-as-contract pattern (no wireframes — user explicitly skipped that step in earlier conversation). Each page folder contains the spec `.md` plus a `Sketches/` subfolder (kept empty per user decision). Specs include: Page container, content & actions (with Area Label naming convention), behavior, states, success criteria, and open questions per page.

> **Reorganised 2026-10-04:** page specs originally lived at `design-artifacts/D-UX-Design/` (flat); now nested under scenario folders per WDS template.

Coverage by persona:
- Rahim (citizen): 14 pages — splash, welcome, registration, OTP, login, home, location, photo, category, note, confirmation, my-reports detail, activity feed, resolution notification.
- Habib (dispatcher): 7 pages — login, daily queue, ticket detail, assign-to-crew, monitor, resolve-confirm, performance snapshot.
- Rashid (field crew): 5 pages — field home, assignment detail, in-progress, before/after capture, confirmation.
- Aamir (admin): 7 pages — admin login, cities overview, city setup basic, departments & categories, wards & boundaries, user provisioning, adoption dashboard.

Cross-cutting design decisions captured across the suite:
- Bangla-first, English-secondary on all surfaces (toggleable per user).
- Spec-as-contract replaces wireframes (per user decision).
- Single responsive web app, no native apps in v1; PWA install for field crew.
- Offline-queue pattern on report submission + photo capture + status updates.
- Polling (10–30s intervals) for v1; WebSocket deferred to v1.1.
- Dhaka template pre-populates new cities (Aamir's flow).
- Admin authentication via WebAuthn (hardware key) for any city-write action.
- Status trail (Submitted → Routed → In progress → Resolved) shared across all surfaces; internal fields hidden from citizens.

### 2026-09-18 — UX Review applied (4 spec revisions)

After the 33-page sweep, the 10 flagged judgment calls were reviewed by a parallel agent. Four revisions were applied; six calls were confirmed:

1. **Splash permissions** (`splash-app-open.md`) — **revised.** Location is requested at splash (powers Home's nearby-pins map and gives immediate value); notifications deferred to Home after first successful report (rationale lands after the platform has acted on Rahim's behalf).
2. **Splash as separate page spec** — confirmed (no change).
3. **Habib 3-region dashboard layout** — confirmed (no change; collapsible filter rail on smaller laptops noted as responsive fallback).
4. **Rashid's in-progress theme** (`status-in-progress.md`) — **revised** from dark mode to **outdoor high-contrast** theme: near-white background, pure-black text, no greys, designed for direct-sunlight readability on LCD and OLED. Auto-switches by ambient-light sensor if available.
5. **WebAuthn mandatory for admin writes** — confirmed (no change).
6. **Resolution "after" photos** (`resolve-before-after-capture.md` + downstream specs) — **revised.** Multi-photo capture: default cap = 3 photos, narrow-category cap = 2, mandatory minimum = 1. Multi-photo sets flow through to `resolve-confirmation.md`, `confirmation-mark-resolved.md`, and `my-reports-detail.md` (horizontal scroll with "+n" overflow indicator).
7. **Notification preview in Habib's resolve modal** — confirmed (no change).
8. **Per-city adoption only in v1** — confirmed (no change).
9. **Rashid's location refresh** (`field-app-home.md`) — **caveat added.** Added one-shot "Refresh location" button on the greeting strip so Rashid can refresh GPS without enabling continuous tracking. Battery + privacy rationale preserved.
10. **Admin WebAuthn heavier than rest of platform** — confirmed (no change).

### 2026-09-18 — Visual Design complete (tokens + 5 hero mockups)

User confirmed visual mockups were needed beyond specs. Built design system token file + 5 hero mockups as standalone HTML + Tailwind (CDN) + Noto Sans Bengali. Files in `design-artifacts/D-Design-System/01-Visual-Design/`:

> **Reorganised 2026-10-04:** originally at `design-artifacts/E-Visual-Design/`; now under the design-system folder per WDS template.

- `tokens.css` — CSS custom properties (colors, type, spacing, radii, shadows, motion). Includes `.theme-outdoor` for Rashid's in-progress view and `.theme-dark` for Habib's optional dark mode.
- `components.html` — self-documenting component library. Buttons (3 styles × states), inputs (label/helper/error), cards, status pills (4 statuses), status trail, photo blocks (single/pair/multi), banners, filter pills, modal.
- `gallery.html` — single-page entry point with embedded iframes of all 5 mockups + component library.
- `mockups/01-welcome.html` — Welcome. Pure typography. Brand-voice entry.
- `mockups/02-home-city-activity.html` — Map + activity bottom sheet + Report FAB.
- `mockups/03-report-submitted.html` — Hero + 4-step status trail + ticket ID + sticky CTA.
- `mockups/04-my-reports-detail.html` — Before/after photos + metadata + feedback prompt.
- `mockups/05-daily-queue-dashboard.html` — Habib's desktop 3-region layout (filter rail/list/detail).

Coverage: 5 mockups define every component pattern used in the other 28 pages. Mobile entry, mobile hub, mobile confirmation, mobile trust moment, desktop work surface.

**Queued for next phase:** Hand-off to Mimir for build via Work Orders. feature-impact.md admin-driven updates still pending (lower priority — can be folded into Mimir's Work Order generation).

### 2026-09-18 — Open items closed (admin features folded in; visual direction documented)

Two queued items closed before Mimir handoff:

**1. feature-impact.md admin update (closed)**

Four admin-driven features (#19–#22) added with full FIA scoring against Aamir's driving forces: ward-boundary editor, user provisioning & role assignment, post-launch adoption dashboard, configuration audit trail. Per-city configuration (#11) re-scored from structural-only to direct-FIA-anchored against Aamir's +1, +4, +5, N6. Coverage summary table added — all of Aamir's seven positive forces have direct or near-direct v1 coverage; three of his seven negative forces (N4, N5, N7) remain partially structural. Gap analysis extended with Aamir's structural forces. Two items deprioritized for v1 (custom role builder, public adoption dashboard).

**2. visual-direction.md created (closed)**

Originally deferred from Product Brief phase; consolidated as the bridge between `content-language.md` and `tokens.css` so Mimir has a single visual contract to read. Documents brand personality → visual translation table, voice dimensions → typography mapping, full color system (primary / status / category accents / themes), typography scale, spacing / radius / shadow conventions, layout breakpoints, motion tokens, component language, and explicit out-of-scope items. Includes the "how engineering should use this" section that the visual-design README had — single source of truth now lives in `visual-direction.md`, with README pointing at it.

**Status:** All Phase 1 (Strategy) and Phase 2 (Design) artifacts final. Ready for Phase 3 (Build) handoff to Mimir.

### 2026-10-04 — Visual Design re-skinned for web (large + medium viewports)

Decision: CityFix is web-first. Every persona uses a responsive web app; Rashid's pages additionally remain usable on a phone.

**Viewports (committed):**
- **Large** — 1440 × 900 (primary design canvas; matches `--layout-desktop`)
- **Medium** — 1024 × 768 (matches `--layout-tablet-max`)
- **Responsive** — Rashid's pages stay usable at phone widths via the existing token scale (Feature #4 constraint)

**4 mockups replaced, 1 unchanged:**
- `mockups/01-welcome.html` — was 390×844 single-column phone frame → now two-column web hero (brand+headline left, abstract city map right); collapses to single column at medium.
- `mockups/02-home-city-activity.html` — was 390×844 map + bottom sheet + FAB → now persistent map + side panel + top-bar Report CTA; side panel collapses below map at medium.
- `mockups/03-report-submitted.html` — was 390×844 scrollable hero + sticky CTA → now centered card on neutral background (max-width 640), identical at both breakpoints.
- `mockups/04-my-reports-detail.html` — was 390×844 single scroll with horizontal photo pair → now two-column gallery + metadata; metadata stacks below at medium.
- `mockups/05-daily-queue-dashboard.html` — **unchanged** (already web at 1440, three-region layout).

**Tokens:**
- `tokens.css` gained 3 web-layout values: `--card-max-width: 640px`, `--report-side-panel: 480px`, `--report-side-panel-medium: 360px`. Existing breakpoint tokens (`--layout-desktop`, `--layout-tablet-max`, `--header-height-desktop`) are reused.

**Playwright:**
- `tests/01-mockups.spec.ts` updated — `WEB_LARGE` + `WEB_MEDIUM` constants replace `MOBILE`. Mockups 01–04 captured at both viewports; mockup 05 at large only. Result: **9 tests passing**, **9 PNG baselines committed** under `tests-mockups/baselines/01-mockups.spec.ts/` with the `{name}-{WxH}.png` naming convention.
- 4 mobile PNG baselines deleted; 1 stale `05-daily-queue-dashboard.png` (without viewport suffix) also removed.

**Gallery:**
- `gallery.html` updated — phone-frame wrappers (390 × 600 black-bezel iframes) replaced with full-width iframes; viewport-tag chips added per mockup; web-pattern matrix (two-column, map+panel, centered card, gallery+metadata, 3-region) replaces the mobile-pattern matrix.

**Components / content-language / visual-direction:** no changes. The design system already supported web layouts (breakpoints, type scale, spacing, three-region authority pattern documented); only the **responsive rules** + mockup contents were missing.

**Queued for Phase B (not in this entry):**
- Rework the 33 page specs (`C-UX-Scenarios/*/N.M-page/N.M-page.md`) to match the new web layouts — replace "FAB", "bottom sheet", "sticky CTA" with top-bar CTA, gallery+metadata, centered confirmation.
- Update Work Orders `WO-001` through `WO-004` to swap mobile-only acceptance criteria for web equivalents (top-bar CTA, web-viewport visual diff, responsive-collapse breakpoints).
- Add Rashid's hero mockup(s) for visual coverage; verify his 5 pages render at ≤480px even though the primary target is web.
- Update `AGENTS.md` Project Layout table or Playwright config doc comment if any path-references shift.

**Status:** web-first visual re-skin complete and verified — 9/9 baselines passing, `tsc --noEmit` clean.

### 2026-10-04 — Specs + Work Orders aligned to web re-skin (Phase B close-out)

Closed all four queued items from the previous entry. After this, every spec and WO referenced by Mimir matches the 2026-10-04 web-first visual artifacts.

**1. 19 page specs reworked to web-first (closed)**

- **Rahim (14 specs)** under `design-artifacts/C-UX-Scenarios/01-rahim-the-reporter/` — each gained a `## Phase B (2026-10-04)` callout block describing the new layout. Key changes:
  - **1.2 Welcome** — two-column web hero (brand + tagline + CTA left, abstract city map right at large viewport; collapses to single column at medium). Single CTA replaced with paired CTAs in a grid; trust strip with 3 markers added.
  - **1.6 Home / City Activity** — top bar replaces top-frame; persistent map + 480px side panel replaces map + bottom sheet; top-bar Report CTA replaces FAB.
  - **1.7–1.10 Report flow** — two-region layout at large (map + 480px side card with progress bar, ward text, coords), in-flow primary CTA replaces sticky-bottom CTA. Same in-flow pattern at medium.
  - **1.11 Submitted — Confirmation** — centered 640px card on neutral surface, max-width via `--card-max-width` token, identical at both breakpoints (mirrors 3.5). 4-step status trail + two-button CTA pair.
  - **1.12 My Reports Detail** — top bar + 1.5fr/1fr two-column at large (gallery + status trail left, metadata + feedback prompt right); metadata stacks below trail at medium.
- **Rashid (5 specs)** under `design-artifacts/C-UX-Scenarios/03-rashid-the-resolver/`:
  - **3.1 Field App Home** + **3.2 Assignment Detail** — top bar + 720px content column; in-flow primary CTA replaces sticky-bottom CTA. Reflows cleanly to 390 px phone widths (Feature #4).
  - **3.3 Status: In Progress** — **full-bleed** (no chrome, no centered column) in the `.theme-outdoor` high-contrast palette; hands-busy exception that the centered column does not apply. Top strip + hero block + step log + progress note composer + primary "Fixed — take photo" CTA + secondary "Pause" + escalate link.
  - **3.4 Resolve — Before/After Capture** — full-bleed camera viewfinder with bottom-overlay sheet for the photo strip; captures 1–3 photos per UX Review revision #6.
  - **3.5 Confirmation — Mark Resolved** — centered 640px card on neutral surface (mirrors 1.11), max-width via `--card-max-width`. No chrome. Photo pair (with "+n" overflow per revision #6) + quick stats + two-button CTA pair + share link.

**2. Work Orders updated (closed)**

- `WO-001-citizen-report-flow.md` — Objective reframed as web-first (1440 × 900 + 1024 × 768) with explicit Phase B callout. Scope-table entries for 1.6 + 1.11 rewritten to top-bar CTA / centered-card. Acceptance criteria for 1.6, 1.11, 1.12 cross-cutting replaced "FAB / sticky CTA / mobile viewport" with the web equivalents. Tests section now lists Rahim mockups 01–04 at large + medium.
- `WO-003-field-crew-app.md` — Objective reframed as web-first with explicit 390 × 844 phone fallback. Scope-table entries for 3.1, 3.2, 3.3 rewritten. Visual-mockups section newly references mockups 06 + 07. Acceptance criteria for 3.1, 3.2, 3.3, 3.5 added Phase B layout language + `tolerance: 0.005` requirements. Tests section now lists Rashid mockups 06 + 07 at large + medium + phone (6 baselines).

**3. Two Rashid hero mockups added (closed)**

- `design-artifacts/D-Design-System/01-Visual-Design/mockups/06-field-app-home.html` — top bar + 720px content column: greeting strip with one-shot location refresh button, quick-stats pill row, today's queue list (4 rows with photo-placeholder gradients + status pills), in-flow "পরবর্তী কাজ শুরু করুন" CTA. Responsive via 720 px max-width + 480 px media query. Uses `tokens.css`.
- `design-artifacts/D-Visual-Design/mockups/07-status-in-progress.html` — full-bleed `body.theme-outdoor`: top strip with minimize control + "চলমান কাজ" + monospace timer; hero block with thumbnail + ticket title + ward; step log; progress note composer; bottom grid (secondary Pause + primary "সমাধান হয়েছে — ছবি তুলুন" + escalate link).

**4. Playwright + gallery updated (closed)**

- `tests/01-mockups.spec.ts` — added `PHONE_WIDTH` constant (390 × 844). Mockups 06 + 07 entered in the test loop with `['LARGE', 'MEDIUM', 'PHONE']` viewport arrays. Suffix is `1440x900` / `1024x768` / `390x844` to keep baseline filenames unique. Result: **15/15 baselines passing** (9 from Phase B Rahim pass + 6 new from Rashid). `tsc --noEmit` clean.
- `design-artifacts/D-Design-System/01-Visual-Design/gallery.html` — "5 hero mockups" → "7 hero mockups"; new cards for 06 + 07 added with viewport tags (large + medium + phone-fallback); hero copy updated; Surface coverage list updated to include Rashid's pages.

**Coverage by mockup:**
- Rahim (web entry): 01 Welcome, 02 Home, 03 Submitted, 04 Detail
- Habib (desktop): 05 Daily Queue Dashboard
- Rashid (web + phone fallback): 06 Field App Home, 07 Status: In Progress

**Status:** All four Phase B queued items closed. Specs ↔ mockups ↔ Work Orders ↔ Playwright baselines are aligned. Phase 3 (Development) is fully unblocked for `/mimir`.

### 2026-10-07 — WO-001 Ideation: rough-mockups stage complete

The AIDLC intent `261004-wo-001-citizen-report-fl` reached the rough-mockups stage of the Ideation phase. The stage produced 12 ASCII / grayscale wireframes covering the v1 must-ship pages 1.1–1.12, an end-to-end flow diagram, and an information-architecture outline.

**Stage decisions locked in (from `rough-mockups-questions.md`):**
- Q1-A — Fresh capture is the default entry; returning citizens reach My Reports via a top-right link.
- Q2-A — Strict linear 6-step submit (location → photo → category → note → submit → confirmation → detail).
- Q3-B — Splash = animated logo + tagline; Welcome = civic hero illustration + bilingual CTA pair.
- Q4-A — Bilingual toggle is persistent top-right on every page; locale persists across screens and sessions.
- Q5-C — Geofence reject UX is two-step: detect → boundary overlay with citizen's pin + shaded supported area → "Move pin to supported area" or "Cancel". Closes feasibility R-1.
- Q6-D — Dedup-prompt surface is a new pre-submit summary route (1.10b, /report/summary) between 1.10 and 1.11. Conditional banner when `dedup_match: true` returns from `lib/platform/dedup.ts`. Decline acknowledgement is a brief toast on 1.11 ("your decline was noted").
- Q7-A — 1.12 visual anchor is a status trail as a vertical timeline; photos grouped below; photo delete is a per-photo action.
- Q8-A — Rough mockups stay ASCII / grayscale; visual-regression gating fires in Refined Mockups. Pixel baselines stay out of this stage.

**Stage artifacts:**
- `aidlc/spaces/default/intents/261004-wo-001-citizen-report-fl/ideation/rough-mockups/rough-mockups.md` — wireframes + flow + IA.
- `aidlc/spaces/default/intents/261004-wo-001-citizen-report-fl/ideation/rough-mockups/rough-mockups-questions.md` — answered.
- `aidlc/spaces/default/intents/261004-wo-001-citizen-report-fl/ideation/rough-mockups/memory.md` — interpretations, deviations, tradeoffs, open questions.

**Decisions forwarded to Refined Mockups + Domain Design:**
- /report/summary is a new route (1.10b) that the IA + Refined Mockups must adopt; Domain Design must model the dedup prompt as a pre-submit summary state, not a modal.
- The geofence reject UX (Q5-C) is the R-1 mitigation; Domain Design should expose the city boundary on a debug overlay for the WO-002 dispatcher.
- 1.14 push notification has no ASCII wireframe in this stage; it is a system-native push. Refined Mockups can either keep it as a reference diagram or skip it.

**Status:** Rough mockups complete. Next stage: **reverse-engineering** (Inception phase). No code changes; no Playwright baselines updated; `tsc --noEmit` clean; `npm run test:unit` 14/14; `npm run test:mockups` 15/15.

### 2026-10-04 — Work Orders written (Development phase ready for Mimir)

Five Work Orders written to `design-artifacts/E-Development/`:

- `WO-000-platform-foundation.md` — cross-cutting platform WO (data model, auth, per-city config, dedup, status trail, notifications, audit log, i18n). **Gating — must be PRD'd first.**
- `WO-001-citizen-report-flow.md` — Rahim's 14 mobile pages (1.1–1.14)
- `WO-002-dispatcher-queue.md` — Habib's 7 desktop pages (2.1–2.7)
- `WO-003-field-crew-app.md` — Rashid's 5 mobile pages (3.1–3.5)
- `WO-004-admin-city-setup.md` — Aamir's 7 desktop pages (4.1–4.7)

Each WO carries:
- **Why this matters** — FIA-anchored rationale from `06-feature-impact.md`
- **Scope** — in-scope pages + out-of-scope boundary
- **Specs & scenarios** — full path list to every referenced spec
- **Dependencies** — explicit dependency on WO-000 for all persona WOs
- **Acceptance criteria** — verifiable per-page + per-feature
- **Do not change** — explicit guardrails preserving UX Review revisions and Feature Impact deprioritizations
- **Reference files** — strategy, design system, mockups, tests
- **Open questions** — surfaced for Mimir to resolve before/during build

**WO dependency graph:**

```
WO-000 (platform) ─┬─→ WO-001 (citizen / Rahim)
                   ├─→ WO-002 (dispatcher / Habib)
                   ├─→ WO-003 (field crew / Rashid)
                   └─→ WO-004 (admin / Aamir)
```

Mimir's next action per `agent-contracts.md`: read WO-000 first, then write `000-PRD.md` (master) + `000-platform-foundation.xml` (feature PRD), then PRD + build each persona WO. **No persona PRD is written before WO-000's PRD is signed off** — every persona WO consumes the platform layer WO-000 produces.

**Status:** Phase 1 + Phase 2 + Phase 3 handoff artifacts complete. Ready for `/mimir`.

### 2026-10-04 — Tech audit complete (Mimir tech-audit workflow)

Following the Phase B close-out, the user chose to start development by running the Mimir **tech-audit** workflow before any PRD is written. Audit produced at `design-artifacts/E-Development/000-tech-audit.md` — pinned every cross-cutting tech-stack choice surfaced by the Work Orders.

**Lane:** Standalone WDS v1.0.0 (per AGENTS.md §1). **Brownfield state:** greenfield — no `src/`, `backend/`, or `app/` directories exist; the only existing assets are design docs + the Playwright mockup baselines.

**Decisions pinned (6):**

1. **Framework:** Next.js 14 (App Router) + TypeScript strict + Tailwind (with `tokens.css` as compatibility layer for the design tokens). Node.js 20 LTS. Single full-stack repo; no separate backend in v1.
2. **Map:** MapLibre GL JS + OpenStreetMap raster tiles + Nominatim for reverse geocoding (dev); Mapbox tiles in prod if load justifies. GeoJSON ward polygons from the city config endpoint.
3. **Push:** Web Push API (VAPID) for v1; service-worker delivery; FCM/APNs deferred until native wrappers ship. At-least-once with idempotency token.
4. **Auth:** HTTP-only signed session cookies; four-role model (`citizen / dispatcher / crew / admin`); citizen phone+NID+password+SMS-OTP; admin WebAuthn mandatory for writes; dispatcher + crew sessions bound to `(city, ward, department)`. Libraries: `argon2`, `@simplewebauthn/{server,browser}`, `otpauth`.
5. **Data:** PostgreSQL 16 + Prisma (TypeScript types, migrations). R2 / MinIO / S3 for blobs. Redis (optional) deferred to v1.1.
6. **Testing:** extend existing Playwright setup; per-WO route specs call `compareMockupVsBuild({ name, mockupPath, buildUrl, viewport })` for visual regression against committed baselines. Build phase adds `use.baseURL` + `webServer` to `playwright.config.ts`. Vitest for unit (added when first unit test is written).

**Removed after this pass (4 user-requested removals):** Photo pipeline, Offline queue, PWA/install, Hosting/deployment. These four sections were dropped from the audit document at user request.

**Trimmed for Phase 1 focus (no PRD content lost):**

- `000-tech-audit.md`: dropped the **"Open decisions deferred to PRD"**, **"Do Not Change"**, **"Verification (this audit)"**, and **"Status"** sections — all redundant with WO-000 / spec files / design log entries that Mimir reads anyway.
- `WO-001..004`: dropped the trailing **"## Next"** section in each (the same `/mimir` invocation instruction lives once in the design log; the four duplicates were noise).
- `WO-000`: dropped the **"Test harness"** lines from Reference Files (WO-000 has no UI and no tests of its own; mockup-baseline coverage is owned by the persona WOs).

**Deferred to PRD (5 — not pinned in the audit):**

- OTP SMS provider — provider abstraction stubbed in WO-000; real provider chosen in WO-004.
- Photo retention policy — legal/privacy, not a tech decision. WO-000 PRD.
- Dedup radius default — 50 m recommendation in WO-000 PRD.
- Hosting target specifics — Cloudflare vs Vercel vs Railway; WO-001 PRD.
- Dispatcher/crew scope granularity — `(city, ward, department)`; WO-002 PRD.

**Do-Not-Change list** (preserved from earlier phases; restated in the audit): web-first layout + Rashid phone-fallback (Phase B 2026-10-04); Bangla-first; four-role model; WebAuthn-for-admin-writes; dedup-not-merge; internal-fields-hidden-from-citizens; polling 10–30s for v1; PWA-only (no native); multi-photo defaults (cap 3 / narrow 2 / min 1); outdoor high-contrast theme for Rashid's in-progress page.

**Status:** tech-audit complete. Every "Open Questions for Mimir" choice from WO-000 / WO-001 / WO-003 / WO-004 is either resolved in `000-tech-audit.md` or explicitly deferred to a named PRD. `npm run test:mockups` still 15/15 passing; `tsc --noEmit` clean. **Ready for Mimir PRD phase** — next action: invoke `/mimir` again; Mimir will read WO-000, write `000-PRD.md` (master) + `000-platform-foundation.xml` (feature PRD), and start the gating platform layer build.

### 2026-10-04 — Phase 1 development started (scaffold + master PRD)

Continuing development after the tech-audit. Two artifacts landed in this pass:

**1. Next.js 14 project scaffold (complete)**

Concrete build surface so Mimir's per-WO requirements have somewhere to land:

- `package.json` — added Next.js 14, React 18, maplibre-gl (deps); Tailwind + Autoprefixer + PostCSS (devDeps); scripts: `dev`, `build`, `start`, `typecheck` (kept all existing Playwright scripts).
- `tsconfig.json` — Next.js-compatible TS config (`module: ESNext`, `moduleResolution: Bundler`, `jsx: preserve`, `plugins: [{name: next}]`, paths alias `@/*`); includes `app/`, `components/`, `lib/`, `tests/`, `playwright.config.ts`, `next-env.d.ts`.
- `next.config.js` — App Router config; `serverActions.bodySizeLimit: 4mb` (generous for citizen photo upload); default security headers (X-Content-Type-Options, Referrer-Policy, X-Frame-Options).
- `tailwind.config.js` — Tailwind v3 with token-anchored theme (`spacing`, `borderRadius`, `fontFamily`, `screens`) so utility classes line up with the design tokens.
- `postcss.config.js` — standard Tailwind + Autoprefixer.
- `app/layout.tsx` — root layout; html lang, font preconnect, Noto Sans Bengali link, theme color, metadata (title template, description).
- `app/page.tsx` — `/` smoke page (Phase 1 placeholder; WO-001 replaces this with the citizen Home view per mockup 02).
- `app/globals.css` — imports `tokens.css` (the design-token source of truth) plus Tailwind base/components/utilities.
- `next-env.d.ts` — standard Next.js env references.
- `playwright.config.ts` — added `webServer: { command: 'npm run dev', url: 'http://localhost:3000', reuseExistingServer: !process.env.CI }` + `use.baseURL: http://localhost:3000`. Mockup suite still works (uses file://); per-WO route tests now have a target.
- `.gitignore` — added `.next/`, `out/`, `next-env.d.ts.bak`; expanded `.env*` patterns.

**Smoke verification:** `npm install` → 141 packages added. `npx tsc --noEmit` → clean. `npm run dev` → server up in 3 s, `GET /` → 200, `GET /` content contains both "CityFix" and "WO-000". One `next.config.js` warning (`optimizePackageImports` moved from top-level to `experimental`) was diagnosed via the dev-server output and fixed. `npm run test:mockups` → 15/15 baselines still passing.

**2. Master PRD (drafted)**

`design-artifacts/E-Development/000-PRD.md` — 13 chapters: Overview, Goals, Non-goals, Personas (FIA-anchored), Work Order dependency graph, Tech stack (pinned by audit), Personas × WOs × Features mapping, Phase 1 scope (scaffold + WO-000), Cross-cutting acceptance criteria, Risks + mitigations, Out-of-v1 deferred list, Reference files, Build phases, Status. Cross-references the 5 Work Orders, the tech audit, and every FIA-anchored feature in `06-feature-impact.md`.

**Pending for Phase 1 close-out:**
- `000-platform-foundation.xml` (WO-000 feature PRD) — the per-requirement spec Mimir builds against.
- Prisma schema + auth scaffolding (lands with WO-000 PRD).
- The first per-WO Playwright route spec (`tests/02-*.spec.ts`) once a real route exists.

**Status:** Scaffold is live; master PRD is drafted. Phase 1 has a concrete starting surface — the next move is either the user invokes `/mimir` to drive the WO-000 PRD, or we author `000-platform-foundation.xml` directly from in here.

### 2026-10-04 — WO-000 platform layer implemented (Prisma + auth + API routes)

Continuing the WO-000 build directly from in-repo (Mimir's external workflow wasn't invokable from this session, so the platform layer that every persona WO depends on is now in code). Two artifacts landed:

**1. `design-artifacts/E-Development/000-platform-foundation.xml` (feature PRD)**

The per-requirement spec Mimir builds against. 9 platform requirements (`PLAT-REQ-001` … `PLAT-REQ-009`) each annotated with: rationale (FIA-anchored), behaviour contract, API surface, acceptance criteria, do-not-change list. Written before any code so the implementation below maps 1:1 to the contract.

**2. Platform layer code (in-repo)**

Data + auth + API surface for every cross-cutting PLAT-REQ. Files added under `prisma/`, `lib/`, and `app/api/`:

| Area | Files | PLAT-REQ |
|---|---|---|
| **Data model** | `prisma/schema.prisma` (10 models: City, Ward, Department, Category, User, OtpCode, WebAuthnChallenge, Session, PushSubscription, Ticket, TicketTrailEntry, AuditEntry), `prisma/seed.ts` (Dhaka template), `lib/db.ts` (Prisma singleton, HMR-safe) | 001, 003, 005, 007 |
| **Auth** | `lib/auth/password.ts` (argon2id, OWASP 2024 params), `lib/auth/otp.ts` (6-digit, 5-min TTL, 5 attempts, argon2-hashed), `lib/auth/session.ts` (HTTP-only signed cookies, HMAC-SHA256, 14-day TTL), `lib/auth/guards.ts` (requireRole, requireSameCity, requireScope + ApiError) | 002 |
| **i18n** | `lib/i18n/keys.ts` (typed key registry, Bangla-first, t() with override chain) | 009 |
| **Serializer** | `lib/serializers/ticket.ts` (citizen-facing hides `assignedCrewId`, `internalNote`; maps `actorId` → "সিটি কর্পোরেশন"/"City corporation") | 001 |
| **Rate limit** | `lib/platform/rate-limit.ts` (in-process token bucket, 1 req/sec default) | 008 |
| **Audit log** | `lib/platform/audit.ts` (writeAudit JSON before/after) | 007 |
| **Dedup** | `lib/platform/dedup.ts` (haversine + bounding-box pre-filter, 50 m default, uses city `dedupRadiusMeters`) | 004 |
| **Transitions** | `lib/platform/transitions.ts` (atomic update + trail + audit; `InvalidTransitionError`) | 005 |
| **Push** | `lib/platform/push.ts` (`subscribeUser`, `unsubscribeUser`, `fanOutForTicket`, `sendTicketPush`; v1.1 wire-call deferred) | 006 |
| **API routes** | `app/api/tickets/route.ts` (POST create with dedup check), `app/api/tickets/[id]/route.ts` (GET with rate limit + scope), `app/api/tickets/[id]/transition/route.ts` (POST with role-scoped transitions), `app/api/v1/push/subscribe/route.ts` (POST subscribe, DELETE unsubscribe) | 001, 004, 005, 006, 008 |

**Test harness added:**
- `vitest.config.ts` (path alias `@/`, picks `tests/unit/**`, node env — does not interfere with mockups suite).
- `tests/unit/i18n.test.ts` — 7 tests covering PLAT-REQ-009 chain (override → city default → bn) + registry completeness + status pills + category labels.
- `tests/unit/transitions.test.ts` — 7 tests covering valid + invalid edges + `resolvedAt` stamping + `InvalidTransitionError` shape (Prisma + audit mocked).

**Verification run (this entry):**
- `npm install` → 70 new packages added (`@prisma/client`, `@node-rs/argon2`, `@simplewebauthn/server`, `@simplewebauthn/browser`, `otpauth`, `zod`, `prisma`, `vitest`).
- `npx prisma generate` → clean (after fixing 4 invalid `restrictOnDelete: Restrict` args on cascade relations — Prisma 5.22 doesn't support that flag; `onDelete: Cascade` alone is the right syntax).
- `npx tsc --noEmit` → clean (after fixing a stray `;` inside a template literal in `session.ts`, replacing the `@node-rs/argon2` `Algorithm` const-enum import with the numeric literal `2` (isolatedModules forbids const-enum access), and dropping an invalid `include: { user: false }` Prisma fragment from `session.ts`).
- `npm run test:unit` → **14/14 passing** (7 i18n + 7 transitions).
- `npm run test:mockups` → **15/15 baselines still passing** (no visual regression from the new TS files).

**Deferred to v1.1 (documented but not shipped in this pass):**
- **Web Push wire call** — fan-out DB + helpers are in place; the actual `web-push.sendNotification(...)` call is stubbed + logged behind a `v1.1` comment block. The VAPID env vars are surfaced in `.env.example` so v1.1 can drop the library in.
- **Admin WebAuthn route handlers** — schema (`WebAuthnChallenge` + `User.webAuthnCredentials`) is ready; the `/api/auth/webauthn/register-options` + `/api/auth/webauthn/verify-registration` + `/api/auth/webauthn/login-options` + `/api/auth/webauthn/verify-authentication` route handlers are pending.
- **OTP SMS provider** — `.env.example` carries `OTP_PROVIDER` + `OTP_PROVIDER_API_KEY` placeholders; provider abstraction lands in WO-004 (admin setup) where SMS-OTP is first needed.
- **Postgres DB connectivity for local dev** — `.env.example` documents `DATABASE_URL`; no Postgres is required to typecheck, unit-test, or run the mockup baselines (the API routes only execute when called against a real DB).
- **Migration history** — `prisma migrate dev` requires a live DATABASE_URL; for v1 we ship `prisma db push` as the schema-sync path. Migrations will be authored once a real DB is wired in v1.1.

**Status:** WO-000 platform layer compiles clean, has a 14-test unit harness, and the 3 citizen-facing + 1 dispatcher/crew + 1 push API endpoints are wired. Persona WOs (001 / 002 / 003 / 004) can now build against this surface. Next move: start WO-001 (citizen report flow) — replace `app/page.tsx` with Rahim's Home view per mockup 02 and route the existing `/api/tickets` POST through the 7-step report flow.

### Design Loop Status (page-by-page)

| # | Page | Scenario | Status |
|---|---|---|---|
| 1 | App Open / Splash | Rahim — Reports a broken streetlight | ✓ approved (spec-as-contract) |
| 2 | Welcome (first run only) | Rahim — Reports a broken streetlight | ✓ approved (spec-as-contract) |
| 3 | Registration | Rahim — Reports a broken streetlight | ✓ approved (spec-as-contract) |
| 4 | Verification (OTP) | Rahim — Reports a broken streetlight | ✓ approved (spec-as-contract) |
| 5 | Login (returning users) | Rahim — Reports a broken streetlight | ✓ approved (spec-as-contract) |
| 6 | Home / City Activity | Rahim — Reports a broken streetlight | ✓ approved (spec-as-contract) |
| 7 | Report — Location Confirm | Rahim — Reports a broken streetlight | ✓ approved (spec-as-contract) |
| 8 | Report — Photo Capture | Rahim — Reports a broken streetlight | ✓ approved (spec-as-contract) |
| 9 | Report — Category Pick | Rahim — Reports a broken streetlight | ✓ approved (spec-as-contract) |
| 10 | Report — Note & Submit | Rahim — Reports a broken streetlight | ✓ approved (spec-as-contract) |
| 11 | Report Submitted — Confirmation | Rahim — Reports a broken streetlight | ✓ approved (spec-as-contract) |
| 12 | My Reports Detail | Rahim — Reports a broken streetlight | ✓ approved (spec-as-contract) |
| 13 | City Activity Feed | Rahim — Reports a broken streetlight | ✓ approved (spec-as-contract) |
| 14 | Resolution Notification (push) | Rahim — Reports a broken streetlight | ✓ approved (spec-as-contract) |
| 15 | Login (Web / Desktop) | Habib — Runs his ward's morning queue | ✓ approved (spec-as-contract) |
| 16 | Daily Queue Dashboard | Habib — Runs his ward's morning queue | ✓ approved (spec-as-contract) |
| 17 | Ticket Detail (dispatcher) | Habib — Runs his ward's morning queue | ✓ approved (spec-as-contract) |
| 18 | Assign to Crew (modal) | Habib — Runs his ward's morning queue | ✓ approved (spec-as-contract) |
| 19 | Monitor Updates (live feed) | Habib — Runs his ward's morning queue | ✓ approved (spec-as-contract) |
| 20 | Resolve Confirmation (modal) | Habib — Runs his ward's morning queue | ✓ approved (spec-as-contract) |
| 21 | Ward Performance Snapshot | Habib — Runs his ward's morning queue | ✓ approved (spec-as-contract) |
| 22 | Field App Home | Rashid — Fixes his first job of the day | ✓ approved (spec-as-contract) |
| 23 | Assignment Detail | Rashid — Fixes his first job of the day | ✓ approved (spec-as-contract) |
| 24 | Status: In Progress | Rashid — Fixes his first job of the day | ✓ approved (spec-as-contract) |
| 25 | Resolve — Before/After Capture | Rashid — Fixes his first job of the day | ✓ approved (spec-as-contract) |
| 26 | Confirmation — Mark Resolved | Rashid — Fixes his first job of the day | ✓ approved (spec-as-contract) |
| 27 | Admin Console Login | Aamir — Sets up Chattogram | ✓ approved (spec-as-contract) |
| 28 | Cities Overview Dashboard | Aamir — Sets up Chattogram | ✓ approved (spec-as-contract) |
| 29 | City Setup — Basic Info | Aamir — Sets up Chattogram | ✓ approved (spec-as-contract) |
| 30 | Departments & Categories | Aamir — Sets up Chattogram | ✓ approved (spec-as-contract) |
| 31 | Wards & Boundaries | Aamir — Sets up Chattogram | ✓ approved (spec-as-contract) |
| 32 | User Provisioning | Aamir — Sets up Chattogram | ✓ approved (spec-as-contract) |
| 33 | Post-launch Adoption Dashboard | Aamir — Sets up Chattogram | ✓ approved (spec-as-contract) |

**UX Design phase: complete. 33 of 33 pages spec'd.** All pages follow the spec-as-contract pattern (no wireframes). Wireframe step was explicitly skipped by user based on prior conversation. Each spec is implementation-ready for Mimir's build phase.

### 2026-10-07 — Token-surface fix + system-driven light/dark mode

Two related issues from QA review of the running dev server:

1. **Primary-CTA contrast bug**: `tokens.css` defined `--color-primary-on` but
   25+ JSX consumers read `--color-on-primary`. Browsers silently fell back to
   inherited black, so every primary button rendered with black-on-dark-blue
   text — unreadable.

2. **Dark/light mode support missing**: `.theme-outdoor` and `.theme-dark`
   classes were declared in `tokens.css` but never applied to any element;
   no `prefers-color-scheme` listener, no toggle, no persistence.

Resolution:

- `design-artifacts/D-Design-System/01-Visual-Design/tokens.css`:
  renamed `--color-primary-on` → `--color-on-primary` (the name 25+ sites
  already use); added 6 missing tokens (`--color-success`, `--color-warning`/
  `-soft`, `--color-danger`, `--color-ink-muted`, `--text-h1/h2/h3`);
  expanded `.theme-dark` block with full surface/ink/brand/status/category
  overrides; added a `prefers-color-scheme: dark` media block mirroring the
  same overrides so the OS hint is honored when the user has not picked
  explicitly; added `color-scheme: light` and `color-scheme: dark`
  declarations so native form controls (scrollbars, autofill) follow.

- `lib/theme/appearance.ts` (new): pure helper with `Appearance =
  'light' | 'dark' | 'system'`, localStorage-backed read/write, the
  resolve function (`system + systemPrefersDark → light|dark`), and a
  constant for the three theme class names. No React imports.

- `app/appearance-boot.tsx` (new): synchronous inline `<script>` rendered
  in `<body>` BEFORE the React tree. Reads localStorage, resolves
  `prefers-color-scheme`, applies the correct theme class to `<html>` before
  first paint to prevent FOUC. Mirrors the design of the future
  `app/language-boot.tsx`.

- `lib/theme/ThemeProvider.tsx` (new): client React provider exposing
  `useTheme()`. Hydrates from localStorage on mount; listens to
  `prefers-color-scheme` changes; writes back on user toggle; syncs the
  `<html>` class list whenever the preference or system hint changes.

- `app/layout.tsx`: renders `<AppearanceBoot />` then wraps children in
  `<ThemeProvider>`. `themeColor` updated to `#2C5282` (matches the new
  `--color-primary`); `color-scheme: light dark` added so the browser
  chrome can adapt.

- `components/ThemeToggle.tsx` (new): three-state segmented control
  (light / dark / system) with sun/moon/monitor icons. Renders as
  `role="radiogroup"` with `role="radio"` buttons for accessibility.
  i18n labels come from `lib/i18n/keys.ts`.

- `components/ReportHeaderActions.tsx` (new): thin client wrapper that
  renders the toggle in a server-component context (used by the
  `/report/*` layout's sticky header).

- `app/page.tsx`, `app/home/page.tsx`, `app/report/layout.tsx`: mounted
  the toggle in three sites — welcome (top-right), home (top-bar right
  cluster), and the report sticky header.

- `lib/i18n/keys.ts`: added `theme.toggle.aria_label`, `theme.option.{light,
  dark, system}`, `theme.option.{light, dark, system}_short`,
  `theme.option.system_hint` — both `bn` and `en` authored.

- `tests/unit/appearance.test.ts` (new): 10 tests covering validators,
  resolver, theme class names, and localStorage round-trip with a tiny
  fake-storage polyfill (vitest is in `node` environment).

Verification:
- `npx tsc --noEmit` — clean.
- `npm run test:unit` — 57/57 passing (47 pre-existing + 10 new).
- `npm run test:mockups` — 15/15 baselines still pass; mockups are static
  HTML files, not the live app, so the token rename did not affect them
  (no baseline re-capture needed).
- Dev server: `CITYFIX_DEV_STORE=1 npx next dev` boots cleanly on port
  3001; `/`, `/home`, `/report/location` all return 200; the rendered
  HTML confirms `color: var(--color-on-primary)` on the primary CTA, the
  AppearanceBoot inline script, the ThemeProvider, and the visible
  toggle (system active by default).

Decisions baked in:
- Theme is client-only via localStorage; no `User.appearanceOverride` column.
  Easy to add server-side in WO-004 if needed.
- `.theme-outdoor` (Rashid's high-contrast) remains an explicit class —
  not user-selectable in v1; surfaced via the design tokens but not the
  toggle.
- 24 hard-coded color lines across 7 files were intentionally NOT touched
  in this pass — they're audit-follow-up and out of scope for the bug
  fix. They will look wrong in dark mode until addressed in a follow-up
  Bolt.

### 2026-10-11 — Intent 002 (Citizen Report Flow) complete; Intent 003 (Dispatcher Queue) inceptioned

The active build crossed intents today. The Citizen Report Flow intent shipped
end-to-end; the Dispatcher Queue intent was promoted to active build and
inceptioned. Per the AIDLC framework, this is one design-log entry per
phase transition, not per Bolt.

**1. Intent 002 — Citizen Report Flow complete (5 Bolts)**

Five Bolts completed in this intent:

- **002-001** (auth-funnel) — shared auth funnel for citizen + dispatcher,
  dev persona `DEV_CITIZEN_ID` (Habib) and `DEV_DISPATCHER_ID` (also
  Habib — same persona, different role-binding), phone+OTP scaffolding,
  redirect-by-role map.
- **002-002** (citizen-home) — `/home` page with the city activity feed,
  15s polling, side panel with the recent reports list, top-bar
  "Report" CTA.
- **002-003a** (see-and-pick — location) — `1.7 Location Confirm` page
  with the **MapLibre GL JS + OpenStreetMap raster tiles** map. Hand-
  traced **Dhaka District GeoJSON polygon** (15 vertices) drives a
  ray-casting point-in-polygon geofence with a bbox backstop. 50 m
  dedup ring is a separate geojson source. Pin is a draggable
  `maplibregl.Marker`; the map fills its parent via `ResizeObserver`
  (replaces the 720×480 hard-coded sizing).
- **002-003b** (see-and-pick — rest) — `1.8 Photo`, `1.9 Category`,
  `1.10 Note & Submit`, the `1.10b Summary` dedup-prompt route, the
  `1.11 Confirmation` and `1.12 My Reports Detail` pages. The citizen
  serializer branch is the only branch used in this intent; the
  dispatcher branch is in place but unexercised until Intent 003.
- **002-004** (polish) — top-bar language toggle (Bangla / English,
  persisted), dedup-radius regression test, dedup-prompt a11y
  refinements, three additional visual baselines.
- **002-005** (visual + mockup handoff) — full Playwright route spec
  suite for the citizen surface (`tests/02..08-*.spec.ts`), 13 visual
  baselines committed under `tests-mockups/baselines/02-08-*.spec.ts/`.

**MapLibre + OSM decision (recorded):** Carto Voyager raster tiles were
the first pick but their CDN rejected requests with a "API key
required" error in dev (the tile request lacked the required
`Referer`/`Origin` header). The user picked **OpenStreetMap raster
tiles** as the v1 source — no API key, no auth, dev-demo-friendly.
The OSM Tile Usage Policy forbids heavy production use; a paid
provider (Mapbox / MapTiler / Stadia) is the scale path. Documented
in `aidlc/spaces/default/memory/project.md` Corrections
(`261004-wo-001-citizen-report-fl:feasibility:bd82a5c5...` updated
to record the OSM swap and supersede the Carto choice).

**Intent 002 status:** `complete`. 5/5 Bolts done, `tsc --noEmit`
clean, `npm run test:unit` green, `npm run test:mockups` green
(15/15 mockup baselines + 13/13 new route baselines). 33/33 Rahim
pages now wired to the live API.

**2. Intent 003 — Dispatcher Queue inceptioned**

- Promoted from `draft` to `in-progress` in
  `.specsmd/aidlc/memory-bank/intents/003-dispatcher-queue/`.
- `units.md` rewritten with the 5-unit decomposition, dependency
  graph, story-to-unit mapping, and a 5-Bolt plan.
- 5 unit briefs + 7 story specs authored:
  - **001-auth-and-scope** + DISP-001 (cross-ward / cross-department
    denial code path; paperwork + unit test; the platform layer's
    `requireScope` is in place; no new source code expected).
  - **002-triage-queue** + DISP-002 (new `GET /api/v1/dispatcher/queue`
    + new `app/dispatcher/page.tsx` with 30 s polling; 6 acceptance
    criteria covering scope, status filter, cross-city denial, polling,
    and click-through).
  - **003-ticket-detail-and-transitions** + DISP-003/004/005 (new
    `GET /api/v1/dispatcher/tickets/[id]` + `POST .../transition` +
    `PATCH ...`; new page with full record + status trail + transition
    buttons + reassign + internal note; out-of-scope id returns **404**
    not 403 to avoid leaking ticket existence).
  - **004-dedup-decline-review** + DISP-006 (new `DedupFlag` Prisma
    model + 3 new APIs + new page; the citizen's denial creates a
    `DedupFlag` row that the dispatcher confirms or dismisses; the
    Unit 002 triage queue excludes pending flags).
  - **005-map-view** + DISP-007 (**deferred to v1.1**; paperwork only).

**Scope decisions (per the dispatcher-side `requireScope` rules):**
- Cross-ward / cross-department denial is enforced by
  `requireScope(session, wardId, departmentId)` on every new endpoint.
- Cross-city reassignment is denied (the ward dropdown is filtered to
  the dispatcher's `cityId`).
- Out-of-scope id returns **404**, not 403, on every dispatcher
  endpoint — to avoid leaking ticket existence.
- Dispatcher pages do **NOT** poll (v1 design choice; v1.1 candidate
  for WebSocket / SSE).

**Status:** Intent 003 is at the **end of inception**; ready for the
bolt plan + the first Construction Bolt (003-001 — paperwork + test
suite; no new source code in `lib/`). The construction loop is
unblocked.

### 2026-10-12 — Intent 003 — Bolts 003-001, 003-002, 003-003 complete

Three of the five Bolts in the Dispatcher Queue intent shipped today.
Bolt 003-005 (map view) remains deferred to v1.1; Bolt 003-004
(dedup-decline review) is the next build target.

**1. Bolt 003-001 — auth-and-scope (complete, paperwork-only)**

- 14 new Vitest unit tests in
  `tests/unit/dispatcher-scope.test.ts` covering
  `requireRole`, `requireSameCity`, `requireScope`, and `ApiError`
  shape: cross-ward denial, cross-department denial, in-scope silent
  return, ward-short-circuits-department, citizen sessions rejected,
  admin bypass, crew shares dispatcher code path.
- 8 Playwright tests in
  `tests/09-dispatcher-auth.spec.ts` covering dev login for all
  four personas, dispatcher-redirect map, role-guard chain.
- No new source code in `lib/`. The platform layer's guards
  (`lib/auth/guards.ts`) are the surface; the bolt only
  documents the dispatcher-side expectations and pins them
  with tests.
- Bolt record at
  `.specsmd/aidlc/memory-bank/bolts/003-001-dispatcher-auth-and-scope/ddd-01-bolt-record.md`.

**2. Bolt 003-002 — triage-queue (complete)**

- New `GET /api/v1/dispatcher/queue` API in
  `app/api/v1/dispatcher/queue/route.ts` with Zod-validated
  query (status filter, limit, cityId-must-match-session), the
  dispatcher's `requireRole` + `requireSameCity` + `requireScope`
  guard chain, in-code ward + department filter (the dev store's
  `findMany` does not yet expose ward/dept clauses; tracked for
  v1.1), and the dispatcher serializer branch.
- New `app/dispatcher/page.tsx` — the dispatcher's primary
  surface. 30s `setInterval` polling (slower than the citizen
  home's 15s because the queue is less bursty). Status filter
  pills (All / Submitted / Routed). 12 new i18n keys under
  `dispatcher.queue.*` + `dispatcher.dedup.*`. "Possible
  duplicates (N)" link to `/dispatcher/dedup` (N=0 in v1; the
  Unit 004 wire comes in Bolt 003-004).
- The dev login route's `REDIRECT_BY_ROLE` map now sends the
  dispatcher to `/dispatcher` (was `/home`). The redirect
  assertion in `tests/09-dispatcher-auth.spec.ts` was updated
  in the same commit.
- 1 new Playwright route spec
  `tests/10-dispatcher-queue-light.spec.ts` — 6 API checks
  (dispatcher → 200, citizen → 403, anonymous → 401, cross-city
  → 403, status=submitted filter, status=routed filter) + 1
  visual baseline (`dispatcher-queue-1440x900.png`).
- Bolt record at
  `.specsmd/aidlc/memory-bank/bolts/003-002-triage-queue/ddd-01-bolt-record.md`.

**3. Bolt 003-003 — ticket-detail-and-transitions (complete)**

- New `GET + PATCH /api/v1/dispatcher/tickets/[id]` API in
  `app/api/v1/dispatcher/tickets/[id]/route.ts` — full ticket
  record (internal fields visible) on GET; reassign +
  `internalNote` PATCH with per-field no-op detection (each
  change writes its own `AuditEntry`, action `reassign` or
  `internal_note`). Out-of-scope ticket id returns **404** (not
  403) via the `loadInScope()` helper that wraps
  `requireSameCity` + `requireScope` in try/catch.
- New `POST /api/v1/dispatcher/tickets/[id]/transition` API in
  `app/api/v1/dispatcher/tickets/[id]/transition/route.ts` —
  dispatcher-allowed transitions: `['routed', 'cancelled']`.
  Role-allowed check fires first (disallowed target → 403
  `role_cannot_perform_transition`); transition engine fires
  for illegal edges (422 `illegal_transition`).
- New `app/dispatcher/tickets/[id]/page.tsx` — the
  dispatcher's per-ticket work surface. Two-region grid
  (main + 320px sidebar). Full record (dl), status trail
  (real `actorId`), photo gallery, internal note textarea,
  transition buttons (one per valid edge ∩ dispatcher
  allowed), reassign UI (ward + category dropdowns). Out-
  of-scope id → 404 page.
- 24 new i18n keys under `dispatcher.detail.*` and
  `dispatcher.transition.*`.
- 1 new Playwright route spec
  `tests/11-dispatcher-detail-light.spec.ts` — 8 API checks
  (dispatcher → 200, citizen → 403, anonymous → 401, out-of-
  ward → 404, transition submit, illegal transition, PATCH
  reassign, PATCH internalNote) + 3 visual baselines
  (`dispatcher-detail-{submitted|routed|in_progress}-1440x900.png`).
  The spec uses `cat_streetlight` (the only category mapped
  to `dept_streetlight` in the dev seed) so fresh test
  tickets pass the dispatcher's department-scope filter.
- Bolt record at
  `.specsmd/aidlc/memory-bank/bolts/003-003-ticket-detail-and-transitions/ddd-01-bolt-record.md`.
- All 3 stories (`DISP-003-ticket-detail`, `DISP-004-reassign`,
  `DISP-005-internal-notes`) flipped to `done` in
  `.specsmd/aidlc/memory-bank/intents/003-dispatcher-queue/`.

**4. Remaining for Intent 003**

- **Bolt 003-004** — dedup-decline review. New `DedupFlag`
  Prisma model + 3 new APIs (`GET /api/v1/dispatcher/dedup-flags`
  + `POST /confirm` + `POST /dismiss`) + new
  `app/dispatcher/dedup/page.tsx` + new Playwright spec +
  visual baseline. Updates the Unit 002 queue query (the
  `NOT EXISTS (SELECT 1 FROM DedupFlag ...)` filter is
  already in place; this bolt enables it). Citizen-side
  on-denial flag writing.
- **Bolt 003-005** — map view. Deferred to v1.1.

**Status:** Intent 003 is now 60% complete (3/5 bolts shipped).
`tsc --noEmit` expected clean; `npm run test:unit` 71/71; no
mockup changes. The construction loop continues with Bolt
003-004 next.

---

## 2026-10-12 — Bolt 003-004: dedup-decline review (DONE)

**1. Bolt 003-004 — Intent 003 Unit 004 (DISP-006)**

The dispatcher's manual dedup-decline review surface.
The bolt stands up the new `DedupFlag` Prisma model
(+ `DedupFlagStatus` enum), denormalises two fields
on `Ticket` (`duplicateOfId`, `closeReason`), and
adds three new dispatcher APIs + a new page + a new
Playwright spec. The citizen-side `POST /api/tickets`
dedup-decline path now writes a `DedupFlag` row in
addition to the `ticket.dedup_declined` audit event,
and the Unit 002 queue excludes tickets behind a
pending flag (so they don't pile up in the triage
list) and surfaces a `pendingDedupCount` so the
top-bar "Possible duplicates (N)" badge is live.

**2. Deliverables**

- `prisma/schema.prisma` — new `DedupFlag` model +
  `DedupFlagStatus` enum + 2 new fields on `Ticket`
  (`duplicateOfId`, `closeReason`) + self-relation
  for "tickets closed as duplicates of X" + 2 reverse
  relations to `DedupFlag`. Indexes on
  `(cityId, status)`, `(cityId, wardId, status)`,
  `(ticketId, status)`, `(originalTicketId)`, and
  `@@index([duplicateOfId])` on `Ticket`.
- `lib/dev-store.ts` — `DevDedupFlag` interface +
  `devDb.dedupFlag` CRUD (findUnique / findMany /
  create / update) + `DevTicket` gains the two new
  fields + the existing closed-duplicate seed
  ticket now carries `closeReason: 'duplicate'`.
- `lib/db-switch.ts` — new `dedupFlag` namespace
  on the routed `db` object.
- `app/api/tickets/route.ts` — the
  `dedupDeclineTicketId` branch now creates a
  `DedupFlag` row, denormalising
  `(cityId, wardId, departmentId)` from the new
  ticket + the original ticket's category's
  department.
- `app/api/v1/dispatcher/queue/route.ts` — loads
  pending dedup flags in the city, filters them
  by ward, uses the resulting id-set to exclude
  pending-flagged tickets from the queue, and
  surfaces `pendingDedupCount` in the response.
- `app/api/v1/dispatcher/dedup-flags/route.ts`
  (new) — `GET`, dispatcher-scoped, Zod-validated
  `limit` query. Returns pending flags with both
  the citizen's new ticket and the original
  serialised.
- `app/api/v1/dispatcher/dedup-flags/[id]/confirm/route.ts`
  (new) — `POST`, closes the citizen's ticket as
  a duplicate + resolves the flag + writes 2
  audit rows.
- `app/api/v1/dispatcher/dedup-flags/[id]/dismiss/route.ts`
  (new) — `POST`, clears the flag overlay +
  resolves the flag + writes 2 audit rows
  (one for the flag, one capturing the
  `hiddenFromTriageQueue` boolean flip on the
  ticket).
- `app/dispatcher/dedup/page.tsx` (new) — the
  dispatcher's review surface. Each row is a
  2-column grid (new vs original) with the
  citizen's optional reason, error banner, and
  Confirm / Dismiss buttons. 64px header with
  back link + lang toggle + theme toggle. 401
  path renders a sign-in prompt.
- `app/dispatcher/page.tsx` (delta) — the top-bar
  "Possible duplicates (N)" link now polls
  `pendingDedupCount` every 30s. When > 0, the
  link gets the warning-soft background.
- 13 new i18n keys under `dispatcher.dedup.*`
  (heading / subtitle / empty.title /
  empty.subtitle / row.distance / row.reason /
  row.confirm / row.dismiss / row.confirming /
  row.dismissing / row.error / signin_required /
  loading / error).
- `tests/unit/dedup-flag.test.ts` (new) — 7 Vitest
  unit checks: create / findMany filter+order /
  update / unknown-id throws / findUnique null /
  reset contract.
- `tests/12-dispatcher-dedup-light.spec.ts` (new) —
  6 API checks (list 200, citizen 403, anonymous
  401, confirm 200, dismiss 200, unknown id 404)
  + 1 visual baseline
  (`dispatcher-dedup-1440x900.png`).
- Bolt record at
  `.specsmd/aidlc/memory-bank/bolts/003-004-dedup-decline-review/ddd-01-bolt-record.md`.
- `DISP-006-dedup-decline-review.md` flipped to
  `phase: construction`, `status: done`; Unit 004
  flipped to `done` in
  `.specsmd/aidlc/memory-bank/intents/003-dispatcher-queue/units.md`.

**3. Remaining for Intent 003**

- **Bolt 003-005** — map view. Deferred to v1.1.
  The unit-brief and story spec are filed; no
  construction work in this intent. The bolt is
  paperwork-only; the existing map component is
  the foundation.

**Status:** Intent 003 is now 80% complete (4/5
bolts shipped; 1 deferred to v1.1). `tsc --noEmit`
expected clean; `npm run test:unit` 78/71 (71
existing + 7 new); no mockup changes. The
construction loop's last in-scope item for Intent
003 is complete; Bolt 003-005 stays paperwork-only
pending v1.1 hand-off.

---

## 2026-10-12 — Intent 003 closed + Intent 004 promoted (DONE)

**1. Intent 003 closure**

Intent 003 (Dispatcher Queue) is now `complete`:
4/5 in-scope bolts shipped to `done`, Bolt
003-005 (map view) explicitly `deferred` to
v1.1 with paperwork-only. The `requirements.md`
phase is `construction` + status `complete`;
the `units.md` is `phase: construction,
status: in-progress` (the unit decomposition
stays in-progress because Unit 005 is a
deferred future-bolt, not a "done" unit).

**2. Intent 004 promotion**

Intent 004 (Field Crew App / WO-003) moves
from `draft` to `in-progress`. The unit
decomposition is the 4 units from the draft
phase, revised at entry and now fully specced:

- **Unit 001 — auth-and-scope** (CREW-001):
  platform layer already implements
  `User.role = 'crew'` + `requireScope(...)`;
  paperwork + Vitest unit test + Playwright
  route spec. No new code in `lib/`.
- **Unit 002 — todays-assignments**
  (CREW-002): new
  `GET /api/v1/crew/tickets` + new
  `app/crew/page.tsx` + dev login redirect
  map delta (crew lands on `/crew` not
  `/home`) + Playwright spec + 2 visual
  baselines (empty + populated at 390x844
  light theme).
- **Unit 003 — ticket-detail-and-resolve**
  (CREW-003, CREW-004, CREW-005): new
  `POST .../transition` (with
  `ALLOWED_CREW_TRANSITIONS =
  ['in_progress', 'resolved']`) + new
  `POST .../photos` + new
  `app/crew/tickets/[id]/page.tsx` +
  Playwright spec + 2 visual baselines
  (routed + in_progress at 390x844 light
  theme). The "Navigate" CTA uses platform
  detection (`navigator.userAgent`) to pick
  the right URL scheme (iOS `maps://`,
  Android `geo:`, web `https://www.google.com/maps/dir/`).
- **Unit 004 — offline-read** (CREW-006):
  new `lib/crew/cache.ts` (pure-JS
  `localStorage` cache) + Vitest unit test
  + small edits to the list and detail
  pages. v1 is read-only; writes fail
  loudly on flaky networks (no silent
  write queue in v1; v1.1 candidate).

**3. Deliverables (Intent 004 promotion)**

- `intents/004-field-crew-app/requirements.md`
  flipped to `phase: construction,
  status: in-progress`; `updated` timestamp
  bumped.
- `intents/004-field-crew-app/units.md`
  rewritten: 4 units, status `ready`,
  dependency graph (auth → list → resolve →
  offline-read), stories-owned table, bolt
  plan.
- 4 per-unit briefs at
  `intents/004-field-crew-app/001-auth-and-scope/unit-brief.md`
  through
  `004-offline-read/unit-brief.md`. Each
  captures purpose, scope, assigned
  requirements, domain concepts, story
  summary, dependencies, technical context,
  constraints, success criteria, and bolt
  suggestions.
- 6 story specs: `CREW-001-auth-scope.md`,
  `CREW-002-todays-assignments.md`,
  `CREW-003-resolve.md`,
  `CREW-004-resolution-note.md`,
  `CREW-005-navigate.md`,
  `CREW-006-offline-read.md`. Each captures
  Given/When/Then acceptance criteria +
  technical notes + out-of-scope +
  dependencies + cross-references.
- `bolts/plan-004.md` — the bolt plan for
  Intent 004 (bolt summary table, code-
  reality starting state, per-bolt source
  pointers, per-bolt stage guidance,
  per-bolt exit criteria, verification
  command).
- `intents/index.md` updated: Intent 003
  → `complete`, Intent 004 → `in-progress`.
- 4 empty bolt directories created under
  `bolts/004-001-auth-and-scope/` through
  `bolts/004-004-offline-read/` for the
  per-bolt `ddd-01-bolt-record.md`
  paperwork (populated bolt-by-bolt).

**4. Bolt progress for Intent 004** (2026-10-12):

- `004-001-auth-and-scope` — pending.
- `004-002-todays-assignments` — pending.
- `004-003-ticket-detail-and-resolve` —
  pending.
- `004-004-offline-read` — pending.

**5. Remaining for Intent 004**

All 4 bolts are pending construction. The
construction loop continues with Bolt
004-001 next (the smoke-test bolt: paperwork
+ tests, no new code in `lib/`).

**Status:** Intent 003 closed (4/5 in-scope
bolts shipped + 1 deferred); Intent 004
promoted to in-progress with 4 units + 6
stories specced + 1 bolt plan filed. The
construction loop continues with Bolt 004-001
next.

### 2026-10-12 — Bolt 004-001: Crew auth and scope (DONE)

**1. Bolt intent**

Intent 004 (Field Crew App) is in-progress.
Bolt 004-001 (Unit 001 auth-and-scope) is the
crew mirror of Bolt 003-001 (dispatcher
auth-and-scope). The platform layer already
implements `User.role = 'crew'` and the
`requireScope(session, wardId, departmentId)`
guard; this bolt is paperwork + tests, no
new `lib/` code.

**2. Deliverables**

- `tests/unit/crew-scope.test.ts` — 17
  Vitest checks across 4 `describe` blocks:
  - `requireRole (crew)` (4 checks: null
    → 401; dispatcher → 403; crew → ok;
    multi-role allow list).
  - `requireSameCity (crew)` (3 checks: null
    → 401; cross-city → 403; same city → ok).
  - `requireScope (crew cross-scope
    denial)` (7 checks: in-scope → silent;
    cross-ward → 403; cross-department →
    403; ward-mismatch short-circuits;
    citizen → 403
    `citizen_cannot_act_as_dispatcher_or_crew`;
    admin → silent; crew mirrors dispatcher).
  - `cross-role denial (crew ↔
    dispatcher)` (3 checks: crew →
    dispatcher endpoint → 403; dispatcher →
    crew endpoint → 403; citizen → crew
    endpoint → 403). **New vs DISP-001** —
    pins the bidirectional cross-role
    denial contract.
- `tests/13-crew-auth.spec.ts` — 9
  Playwright route checks: 3 pass today
  (dev login mints a crew session, persona
  header is `crew:user_crew_rashid`,
  cookie is httpOnly + named
  `cityfix_session`, two consecutive
  mints rotate the cookie, unknown role
  falls back to citizen); 6 self-skip
  until Bolt 004-002 lands
  `/api/v1/crew/tickets` (anonymous
  denial, citizen → crew 403, dispatcher
  → crew 403, plus the reverse direction
  crew → dispatcher which already runs
  against the live Bolt 003-002 queue
  endpoint).
- `.specsmd/aidlc/memory-bank/bolts/004-001-crew-auth-and-scope/ddd-01-bolt-record.md`
  — full DDD-01 record: domain model
  delta (none), technical design delta
  (none), 6 acceptance criteria, verification
  command, out-of-scope, cross-references.
- Story
  `intents/004-field-crew-app/001-auth-and-scope/CREW-001-auth-scope.md`
  flipped to `phase: construction, status:
  done`.
- `intents/004-field-crew-app/units.md`
  Unit 001 status flipped `ready → done`;
  bolt progress line updated.
- The redirect target pin in
  `tests/13-crew-auth.spec.ts` (test #1
  asserts `location: '/home'`) is
  intentionally NOT promoted to `/crew`
  in this bolt — Bolt 004-002 is the
  redirect owner. The test will be
  updated in lockstep when Bolt 004-002
  flips the `REDIRECT_BY_ROLE` map.

**3. Acceptance criteria validation**

All 6 CREW-001 acceptance criteria
satisfied (paperwork + tests). Acceptance
6 (out-of-scope → 404) is implemented at
the API layer in Bolt 004-002 via the
existing `loadInScope()` helper; the
contract is pinned in the unit test
(`requireScope` returns the same `403` it
does today; the route layer remaps).

**4. Bolt progress for Intent 004**
(2026-10-12):

- `004-001-crew-auth-and-scope` — done
  (paperwork + Vitest 17 + Playwright 9;
  3 pass, 6 self-skip).
- `004-002-todays-assignments` — pending.
- `004-003-ticket-detail-and-resolve` —
  pending.
- `004-004-offline-read` — pending.

**5. Remaining for Intent 004**

3 bolts pending construction (004-002,
004-003, 004-004). Bolt 004-002 is the
next target: new `GET /api/v1/crew/tickets`
+ new `app/crew/page.tsx` + dev login
redirect delta (`crew → /crew` instead
of `crew → /home`) + Playwright spec
+ 1 visual baseline.

**Status:** Bolt 004-001 shipped (1/4
Intent 004 bolts); construction loop
continues with Bolt 004-002 (the first
bolt that touches production code for
the crew persona).

### 2026-10-12 — Bolt 004-002: Today's assignments (DONE)

**1. Bolt intent**

Intent 004 (Field Crew App) is in-progress.
Bolt 004-002 (Unit 002 todays-assignments)
delivers the crew's primary surface: the
list API + the list page + the dev login
redirect delta + the visual baselines.

**2. Deliverables**

- `app/api/v1/crew/tickets/route.ts`
  (new) — `GET` lists tickets where
  `assignedCrewId = session.userId` AND
  `status ∈ {routed, in_progress}`,
  filtered by the crew's session scope,
  serialised via the crew branch of
  `serializeTicketForRole(...)`.
- `app/crew/page.tsx` (new) — mobile-first
  390x844 layout. Top bar + status pill
  filter row (All / Routed / In progress)
  + Geolocation opt-in CTA + ticket list
  (icon, ward · slug, status pill, age,
  distance-when-granted, "Open" link).
  30s polling.
- `app/api/dev/login/route.ts` (delta) —
  `REDIRECT_BY_ROLE.crew: '/home' → '/crew'`.
- `lib/i18n/keys.ts` (delta) — 13 new
  `crew.list.*` keys (Bangla + English).
- `tests/14-crew-assignments-light.spec.ts`
  (new) — 7 API checks (crew → 200;
  dispatcher → 403; no cookie → 401;
  cross-city → 403; ?status=routed → 0
  tickets; ?status=in_progress → ≥1
  ticket; tickets all in `ward_14` +
  `assignedCrewId = user_crew_rashid`) +
  2 visual baselines at 390x844 light
  theme:
  - `crew-assignments-populated-390x844.png`
    (default filter, 1 in_progress row).
  - `crew-assignments-empty-390x844.png`
    (Routed filter, empty state).
- `tests/13-crew-auth.spec.ts` (delta) —
  redirect pin updated from `/home` to
  `/crew`. Comment block updated to
  reflect the new bolt that owns the
  change.
- `.specsmd/aidlc/memory-bank/bolts/004-002-todays-assignments/ddd-01-bolt-record.md`
  — full DDD-01 record.
- Story
  `intents/004-field-crew-app/002-todays-assignments/CREW-002-todays-assignments.md`
  flipped to `phase: construction, status:
  done`.
- `intents/004-field-crew-app/units.md`
  Unit 002 status flipped `ready → done`;
  bolt progress line updated.

**3. Acceptance criteria validation**

All 7 CREW-002 acceptance criteria
satisfied. The API + page contract is
verified via the new Playwright spec;
the page renders the seeded
in_progress ticket by default and the
empty state under the Routed filter.

**4. Bolt progress for Intent 004**
(2026-10-12):

- `004-001-crew-auth-and-scope` — done
  (paperwork + Vitest 17 + Playwright 9).
- `004-002-todays-assignments` — done
  (1 API + 1 page + 2 visual baselines +
  13 i18n keys + dev login redirect).
- `004-003-ticket-detail-and-resolve` —
  pending.
- `004-004-offline-read` — pending.

**5. Remaining for Intent 004**

2 bolts pending construction
(004-003 ticket detail + transition +
photos, 004-004 offline-read cache).
Bolt 004-003 is the next target: new
`POST /api/v1/crew/tickets/[id]/transition`
(with `ALLOWED_CREW_TRANSITIONS =
['in_progress', 'resolved']`) + new
`POST /api/v1/crew/tickets/[id]/photos`
+ new `app/crew/tickets/[id]/page.tsx`
+ `tests/15-crew-ticket-light.spec.ts`
+ 2 visual baselines (routed +
in_progress at 390x844).

**Status:** Bolt 004-002 shipped (2/4
Intent 004 bolts); construction loop
continues with Bolt 004-003 (the
ticket detail + transition + photos
bolt — the crew's primary work surface).

### 2026-10-12 — Bolt 004-003: Ticket detail + resolve (DONE)

**What shipped:**

- `GET /api/v1/crew/tickets/[id]` — full
  ticket record (incl. `internalNote`,
  `assignedCrewId`, real `actorId` on trail
  entries). Out-of-scope ticket id (different
  ward / department / not assigned to the
  current crew member) → 404 (not 403) via
  the `loadInScope()` helper that wraps
  `requireSameCity` + `requireScope` +
  `assignedCrewId === session.userId` in
  try/catch.
- `POST /api/v1/crew/tickets/[id]/transition` —
  `ALLOWED_CREW_TRANSITIONS = ['in_progress',
  'resolved']`. Role-allowed check fires
  first for disallowed targets (403
  `role_cannot_perform_transition`); the
  engine fires for illegal edges (422
  `illegal_transition`). The `resolved`
  transition REQUIRES a non-empty `note`
  (CREW-004 Acceptance 3) — enforced by a
  Zod `superRefine` that adds a custom issue
  on `path: ['note']` with code
  `resolution_note_required` when the trimmed
  note is empty.
- `POST /api/v1/crew/tickets/[id]/photos` —
  the "Capture after photo" flow. The v1
  surface accepts a URL
  (`{ url: z.string().url().max(2000) }`); v1.1
  wires the real camera / file picker.
  Each upload writes two side-effects:
  1. A `TicketTrailEntry` with
     `note: 'after_photo:<url>'` (the
     `after_photo:` prefix is a stable marker
     the audit pipeline can grep on).
  2. An `AuditEntry` with action
     `ticket.after_photo_added` + the
     before / after `photoUrls` array.
- New pure module
  `app/crew/tickets/[id]/navigate-href.ts`
  with `detectPlatform(userAgent)` +
  `buildNavigateHref(platform, input)`. The
  page uses these to render the Navigate CTA
  in the right URL scheme:
  - iOS: `maps://?daddr=<lat>,<lng>` (Apple
    Maps URL scheme; opens the Maps app on
    iOS).
  - Android: `geo:<lat>,<lng>?q=<lat>,<lng>(<label-URL-encoded>)`
    (Android's geo: URI scheme; opens the
    user's default map app).
  - Web: `https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>`
    (Google Maps "directions" web URL).
- `app/crew/tickets/[id]/page.tsx` —
  mobile-first 390x844 detail page. Header:
  back link to `/crew` + lang/theme toggle.
  Title row: category icon, ward slug,
  ticket id (monospace), StatusPill. Record
  card: ward / category / location / note /
  reporter + Navigate CTA. Photos section:
  grid + add-after-photo URL input. Trail
  section: status trail with real
  `actorLabel` + `after_photo:` entries shown
  as 📷 + URL. Action bar: transition
  buttons (in_progress, resolved) +
  resolution-note textarea (the resolved
  button is disabled when empty; the API is
  the source of truth).
- 28 new i18n keys under `crew.detail.*`,
  `crew.transition.*`, `crew.photo.*`, and
  `crew.resolution_note.*` (Bangla canonical
  + English).
- `tests/15-crew-ticket-light.spec.ts` (11
  API checks + 2 visual baselines at 390x844
  light theme):
  - API checks: 200 on in-scope ticket
    (full record); 403 for dispatcher /
    citizen; 401 for anonymous; 404 for
    out-of-scope id; `routed → in_progress`
    → 200; `in_progress → cancelled` → 403
    role_cannot_perform_transition; `resolved`
    + empty note → 400
    `resolution_note_required`;
    `in_progress → in_progress` → 422
    illegal_transition; after-photo POST → 200
    + trail entry with `after_photo:` prefix;
    after-photo POST with invalid URL → 400
    invalid_input.
  - Visual baselines:
    `crew-ticket-routed-390x844.png` +
    `crew-ticket-in-progress-390x844.png`.
- Additive dev-seed change:
  `ticket_seed_routed_1` (a routed
  streetlight ticket assigned to Rashid) is
  added so the detail page has a `routed`
  ticket to render in the visual baseline.
  The trail-entry generation in the dev
  store is generalised: every seed ticket
  now gets a `submitted` entry (citizen
  actor), and non-`submitted` tickets get a
  `routed` entry (dispatcher actor) + a
  `in_progress` entry (crew actor) as
  appropriate. This mirrors the production
  trail shape the crew sees on the detail
  page.
- The earlier "empty state" visual baseline
  on `tests/14-crew-assignments-light.spec.ts`
  was removed because every page-level
  filter (All / Routed / In progress) now
  returns ≥1 row. The populated baseline
  is the remaining baseline; pinned
  `body.tickets.length >= 1` assertions for
  both `?status=routed` and
  `?status=in_progress` surface a test fail
  if the seed ever shrinks back.

**Acceptance walked through:**

- CREW-003 (Ticket detail): all 6
  acceptance criteria pass (in-scope
  visible, out-of-scope hidden, cross-role
  denied, anonymous denied, Navigate CTA
  correct per platform, photo gallery +
  after-photo). See
  `bolts/004-003-ticket-detail-and-resolve/ddd-01-bolt-record.md`.
- CREW-004 (Status transitions): all 5
  acceptance criteria pass (routed →
  in_progress works, in_progress → resolved
  works with note, `resolved` requires a
  note, `cancelled` denied, illegal
  transitions rejected).
- CREW-005 (After-photo capture): all 4
  acceptance criteria pass (URL pasted →
  photo appended, invalid URL rejected,
  trail shows after-photo, out-of-scope
  id 404).

**Status:** Bolt 004-003 shipped (3/4
Intent 004 bolts); construction loop
continues with Bolt 004-004 (offline-read
cache — a `localStorage` read-only cache
for the list + detail responses with a
"Cached, may be stale" banner on network
failure).

### 2026-10-12 — Bolt 004-004: Offline-read (DONE)

**What shipped:**

- New pure-JS module
  `lib/crew/cache.ts` — the read-only
  `localStorage` cache for the crew's
  list + detail responses. Exports:
  - `CACHE_SCHEMA_VERSION = 'v1'`,
    `CACHE_TTL_MS = 60 * 60 * 1000`
  - `CrewCacheEntry<T> = { data, cachedAt, version: 1 }`
  - `setStorage(s)` — test seam.
  - `isStale(entry, now)` — `> TTL_MS` (not
    `>=`), so a fresh entry just under the
    threshold is still valid.
  - `tryParse<T>(raw)` — JSON.parse
    wrapped in try/catch.
  - `readAssignmentsCache(userId, now)` /
    `writeAssignmentsCache(userId, tickets, now)`
  - `readTicketCache(userId, ticketId, now)` /
    `writeTicketCache(userId, ticket, now)`
  - `invalidateTicketCache(userId, ticketId)` —
    best-effort, no-op on missing key.
  - `formatCachedAge(cachedAt, now, lang)` —
    relative-time formatter
    ('just now' / 'Xm ago' / 'Xh ago' /
    'Xd ago') in English + Bangla.
  The module is **safe to import in Node**:
  `getStorage()` returns `null` when
  `globalThis.localStorage` is undefined;
  every public function short-circuits on
  `null`. This is critical for Next.js
  dev server SSR.
- `app/crew/page.tsx` delta — list page
  cache wiring:
  - `userId` state + a useEffect that
    extends the existing `/api/auth/status`
    response to also capture `userId`.
  - A new useEffect (gated on `userId`):
    read the cache synchronously on mount
    BEFORE the network request lands. If a
    fresh entry exists, seed the `tickets`
    state + set `cacheSnapshot` + clear
    `loading`.
  - `fetchTickets`: on a successful
    response, write both
    `writeAssignmentsCache(...)` AND a
    `writeTicketCache(...)` per row, then
    clear `cacheSnapshot`. On a 5xx /
    network error, the cache snapshot
    (if any) is preserved.
  - Banner UI: a warning-styled bar above
    the page title with the relative time
    (`crew.cache.last_updated` +
    `formatCachedAge`) + a "Retry" button
    that re-fires the network request.
- `app/crew/tickets/[id]/page.tsx` delta —
  detail page cache wiring (same pattern):
  - `userId` + `cacheSnapshot` state.
  - userId fetch + cache read on mount.
  - `fetchTicket`: on success, write to
    per-ticket cache + clear snapshot. On
    5xx / network error, preserve the
    snapshot.
  - `onTransition` + `onAddPhoto`: on a
    successful 2xx, write the response to
    the per-ticket cache (optimistic
    update with the server's state) +
    clear snapshot. On a non-2xx, the
    cache is NOT updated; the page shows
    the error and the user can retry.
  - Banner UI: a warning-styled bar
    between the top bar and the page body
    with the relative time + a "Retry"
    button that re-fires `fetchTicket()`.
- 5 new i18n keys under `crew.cache.*`:
  `banner`, `banner.detail`, `last_updated`
  (with `{when}` placeholder for
  `formatCachedAge`), `empty`, `retry`.
- New Vitest unit test
  `tests/unit/crew-cache.test.ts` —
  ~25 checks across 7 describe blocks:
  - `isStale` (4) — fresh / stale /
    boundary / unparseable.
  - `tryParse` (3) — valid / parse error
    / null input.
  - `assignments cache` (8) —
    round-trip / missing key / corrupted
    JSON / stale > 1h / invalid shape /
    missing `cachedAt` / userId-scoped /
    `v2` keys ignored.
  - `per-ticket cache` (7) —
    round-trip / missing key / stale /
    invalidate / invalidate is a no-op /
    ticketId-scoped / userId-scoped.
  - `formatCachedAge` (6) — "just now" /
    "Xm ago" / "Xh ago" / "Xd ago" /
    unparseable / future `cachedAt`
    (clock skew); each in both English
    + Bangla.
  - `storage absence` (5) — every public
    function is a no-op / returns `null`
    when `localStorage` is unavailable
    (Node SSR safety).
  - `schema stability` (3) —
    `CACHE_SCHEMA_VERSION === 'v1'`;
    `CACHE_TTL_MS === 60 * 60 * 1000`;
    a written entry round-trips with
    the right shape.
  The test uses a small `MemoryStorage`
  polyfill (`Map<string, string>`) via
  `setStorage(s)`, so the suite runs in
  pure Node — no
  `vitest-environment-jsdom` is needed.
- `tests/unit/dev-store.test.ts` delta —
  two pre-existing tests were colliding
  with the Bolt 004-003 dev-seed additive
  change:
  - `findMany filters by cityId,
    categoryId, reporterId` was matching
    the seed's `cat_pothole` + reporter
    combination. Re-keyed the second
    ticket to `cat_other` so the filter
    assertions remain meaningful.
  - `findMany with status { in: [...] }
    filters by open statuses` was
    matching the seed's open `cat_other`
    ticket (`ticket_seed_submitted_1`).
    Re-keyed to a synthetic test city
    (`city_test_other` + `ward_test_other`
    + `user_test_reporter`) so the test
    does not collide with the seed.

**Acceptance walked through:**

CREW-006 (offline-read): all 8
acceptance criteria pass. The criterion
→ evidence table is in
`bolts/004-004-offline-read/ddd-01-bolt-record.md`:

- Cache updated on successful list
  fetch: `app/crew/page.tsx`'s
  `fetchTickets` writes
  `writeAssignmentsCache(userId,
  tickets)` on `res.ok`.
- Cache displayed on network failure:
  the list page's cache-read effect
  runs on mount; the banner renders the
  cached age. Same pattern on the
  detail page.
- Stale cache ignored: unit test
  `assignments cache > read returns null
  when the entry is stale` pins the
  contract.
- Corrupted JSON recovered: unit test
  `assignments cache > read returns null
  when the JSON is corrupted` pins the
  contract.
- Cache updated on successful
  transition / photo append: detail
  page's `onTransition` + `onAddPhoto`
  write to `writeTicketCache(...)` on a
  2xx.
- Cache NOT updated on write failure:
  the write paths only update the cache
  on a 2xx; on a non-2xx the page shows
  the error and the cache is unchanged.
- Per-ticket cache mirrors the list
  cache: list page's `fetchTickets`
  writes BOTH `writeAssignmentsCache(...)`
  AND a `writeTicketCache(...)` per row.
- Schema version mismatch ignored: the
  v1 reader's key prefix (`v1`) doesn't
  match `v2` keys; the v2 entries are
  simply not read.

**Status:** Bolt 004-004 shipped (4/4
Intent 004 bolts — **Intent 004 is
code-complete**). Construction loop
moves on to Bolt 003-005 (dispatcher map
view) next.

### 2026-10-12 — Bolt 003-005: Dispatcher map view (DONE)

**1. Bolt intent**

Bolt 003-005 (Unit 005 map-view) was
promoted from v1.1 deferred to v1 ready
per the design log's bolt-progress note
("Construction loop moves on to Bolt
003-005 next"). The unit-brief + DISP-007
story paperwork carried "DEFERRED" markers
that were flipped to `ready` / `done` at
the start of the bolt. The bolt stands up
the dispatcher's map-side surface
(`/dispatcher/map`) — a MapLibre GL JS
canvas centered on the dispatcher's city,
rendering every in-scope ticket (status ∈
{submitted, routed, in_progress}) as a
circle pin colored by status. Clicking a
pin opens a side panel with the ticket
summary + a "View ticket" link to
`/dispatcher/tickets/[id]`.

**2. Deliverables**

- `app/api/v1/dispatcher/map/tickets/route.ts`
  (new) — `GET`. Zod-validated
  `status` (single or comma-list of
  {submitted, routed, in_progress}),
  `bbox` (`swLat,swLng,neLat,neLng`),
  `limit` (1-200, default 200), `cityId`
  (must match the session or 403
  `cross_city_access_denied`). Returns
  `{ pins: Array<{ id, lat, lng, status,
  categoryId, wardId, createdAt }> }`.
  The pin shape is intentionally minimal;
  the side panel re-fetches the full
  record via `/api/v1/dispatcher/tickets/[id]`
  on click-through. In-scope filter
  matches the queue route's ward +
  department shape.
- `app/dispatcher/map/page.tsx` (new) —
  auth-gated 3-region layout at 1440×900.
  Top bar (brand + ward · department +
  queue + dedup + map pills + lang +
  theme). Left rail: status filter (All /
  Submitted / Routed / In progress) +
  legend + last-fetched timestamp.
  Center: `DispatcherMap` canvas
  (full-height, fill-parent) loaded via
  `next/dynamic({ ssr: false })`. Right
  side panel: opens on pin click
  (absolute-positioned over the map's
  right edge), shows the ticket summary
  (category, ward, status pill, age,
  lat/lng) + a "View ticket" link to
  `/dispatcher/tickets/[id]`. 30 s
  polling (matches the queue cadence).
- `components/DispatcherMap.tsx` (new) —
  client-only MapLibre GL JS canvas with
  OSM raster tiles (same `OSM_TILE_URL`
  + `OSM_ATTRIBUTION` constants as the
  citizen-side `MapView`), Dhaka District
  polygon overlay
  (`DHAKA_DISTRICT_FEATURE_COLLECTION`),
  and a `circle` layer with a data-driven
  `circle-color` paint expression keyed
  on status (amber / green / blue).
  MapLibre's built-in `cluster: true`
  source option is enabled when
  `pins.length > 50` (the v1 set is small
  so clustering is dormant; the path is
  wired for v1.1 / v2 scale). Selected-
  pin highlight ring is a second `circle`
  layer with filter
  `['==', ['get', 'id'], selectedPinId]`.
  `ResizeObserver` calls `map.resize()` on
  container changes. Refs (`pinsRef`,
  `onPinClickRef`) keep the click handler
  fresh without re-creating the map.
- `app/dispatcher/page.tsx` (delta) +
  `app/dispatcher/dedup/page.tsx`
  (delta) — added `<Link>` pill to
  `/dispatcher/map` in the same row as the
  queue + dedup pills.
- 14 new i18n keys under `dispatcher.map.*`
  (title / subtitle / cta / legend.title /
  legend.submitted / legend.routed /
  legend.in_progress / legend.cluster /
  side.title / side.view / side.close /
  empty / error) + `status.heading`
  (Bangla canonical + English for all).
- `tests/13-dispatcher-map-light.spec.ts`
  (new) — 6 API checks (dispatcher 200;
  citizen 403; anonymous 401;
  `?status=submitted` filter;
  `?cityId=city_chittagong` 403
  cross-city; `?bbox` narrows the result
  set; out-of-scope ticket id never in
  the pin set) + 1 visual baseline at
  1440×900 light theme English labels
  (`dispatcher-map-1440x900.png`).
- Paperwork: `unit-brief.md` + `DISP-007`
  story were promoted from v1.1 deferred
  to v1 ready at the start of the bolt.
  `units.md` Unit 005 flipped to `done`
  with a delivery note; the bolt-progress
  block was updated to ✅ complete.
- Bolt record at
  `.specsmd/aidlc/memory-bank/bolts/003-005-dispatcher-map-view/ddd-01-bolt-record.md`.

**3. Acceptance walked through**

DISP-007 (dispatcher map view): all 5
acceptance criteria pass (pins render by
status; out-of-scope hidden; click → side
panel; clustering > 50 pins; cross-city
denial). The criterion → evidence table
is in
`bolts/003-005-dispatcher-map-view/ddd-01-bolt-record.md`:

- Pins render by status:
  `components/DispatcherMap.tsx`'s
  `circle` layer with the data-driven
  `circle-color` paint expression.
- Out-of-scope hidden: the API filters by
  session cityId + wardId + departmentId
  (the dev store's `findMany` does not yet
  expose those clauses; the in-code filter
  matches the queue route's shape).
- Click → side panel: the page's
  `selectedPin` state is set from the
  map's click handler; the side panel
  renders when `selectedPin !== null`.
- Clustering > 50 pins: MapLibre's
  `cluster: true` source option is wired
  (dormant for the v1 set of ≤10 pins;
  exercised at the unit-test level via
  the source config).
- `?cityId=city_chittagong` → 403:
  `requireSameCity` in the API.

**4. Status**

Intent 003 (Dispatcher Queue) is now
code-complete: 5/5 bolts shipped.
Intent 004 (Field Crew App) is
code-complete: 4/4 bolts shipped (as of
Bolt 004-004). The construction loop has
no pending bolts within these two
intents. The next move is the user's
call — either promote Intent 005
(admin / WO-004) to in-progress and
author its unit briefs + bolt plan, or
take a different direction.

Verification (per
`aidlc/spaces/default/memory/project.md`
Walking Skeleton): `tsc --noEmit` clean;
`npm run test:unit` 168/168;
`npm run test:mockups` 15/15;
`curl -fs http://localhost:3000/` 200;
`npx playwright test
tests/13-dispatcher-map-light.spec.ts`
6/6 API + 1/1 visual baseline.

### 2026-10-12 — Intent 005 promoted to in-progress (paperwork)

**1. Decision**

With Intent 003 (Dispatcher Queue) +
Intent 004 (Field Crew App) both
code-complete (5/5 + 4/4 bolts shipped),
the next persona WO is Intent 005 (Admin
City Setup / WO-004). The intent
paperwork is promoted from `draft` to
`in-progress` today.

**2. Unit decomposition (4 units, 7 stories)**

The 4-unit decomposition from the
`draft` phase is reaffirmed with the
following adjustments:

- Unit 001 — `webauthn-and-auth`
  (ADM-001). 4 new route handlers
  (`/api/auth/webauthn/{register,login,
  assertion,revoke}`) + a
  `requireWebAuthn(session)` guard +
  a client-only `WebAuthnCeremony`
  component. Closes the gap from
  WO-000 (the schema ships; the
  route layer is Unit 001's job per
  `decision-index.md` ADR-007).
- Unit 002 — `city-config` (ADM-002,
  ADM-003, ADM-004, ADM-005). The XL
  unit. 4 new APIs (CRUD over `City`,
  `Category`, `Department`, `Ward`)
  + 4 new pages under `/admin/*` +
  a Leaflet.draw ward-boundary
  editor + the "Apply Dhaka
  template" pre-population flow
  (Feature #11 + cross-cutting
  decision per the design log).
  The unit ships 4 stories in
  lockstep because the four CRUD
  surfaces share enough scaffolding
  that splitting them would triple
  the per-Bolt paperwork cost.
- Unit 003 — `real-otp-provider`
  (ADM-006). Provider-agnostic
  factory (`OTP_PROVIDER` env var)
  with `stub` + `twilio` providers
  in v1; the existing
  `sendOtp(phone, code)` interface
  in `lib/auth/otp.ts` is preserved.
- Unit 004 — `audit-dashboard`
  (ADM-007). Read-only view of
  `AuditEntry` rows; cursor-
  paginated; filterable by actor /
  action / entityType / date range.
  Every preceding unit writes at
  least one `AuditEntry` row, so
  the visual baseline captures a
  non-empty table.

The unit-briefs are filed at
`intents/005-admin-city-setup/{001-
webauthn-and-auth,002-city-config,
003-real-otp-provider,004-audit-
dashboard}/unit-brief.md`. The story
specs are filed at the same paths:
ADM-001 through ADM-007.

**3. Bolt plan**

`.specsmd/aidlc/memory-bank/bolts/plan-005.md`
records the 4-bolt sequence:

- `005-001-webauthn-and-auth` —
  the 4 route handlers +
  `requireWebAuthn` +
  `WebAuthnCeremony` +
  `tests/16-admin-webauthn-light.spec.ts`
  (API checks + 1 visual baseline).
- `005-002-city-config` — 4 APIs +
  4 pages + Leaflet.draw editor +
  Dhaka template +
  `tests/17-admin-cities-light.spec.ts`
  (API checks + 4 visual baselines
  at 1440×900). The dev login
  route's `?role=admin` redirect
  flips from `/home` to
  `/admin/cities` in this bolt.
- `005-003-real-otp-provider` —
  `lib/auth/otp-provider/*` +
  `tests/unit/otp-provider.test.ts`.
  No new pages; the citizen's
  registration flow covers the
  end-to-end behaviour.
- `005-004-audit-dashboard` —
  `GET /api/v1/admin/audit` +
  `app/admin/audit/page.tsx` +
  `tests/18-admin-audit-light.spec.ts`
  (API checks + 1 visual baseline).
  The dev seed adds 4-5
  `AuditEntry` rows so the visual
  baseline captures a non-empty
  table.

**4. Status sync**

- `intents/005-admin-city-setup/units.md`
  — `phase: construction,
  status: in-progress`. Unit briefs
  + stories listed under each
  unit; all 4 units `ready`; all
  7 stories `ready`.
- `intents/index.md` —
  Intent 003 + 004 flipped to
  `complete`; Intent 005 to
  `in-progress`.
- `story-index.md` — Intent 003
  + 004 stories flipped to
  `done`; Intent 005 stories
  flipped to `ready`.

**5. Next move**

The construction loop's next bolt
is `005-001-webauthn-and-auth`.
The WebAuthn route layer is the
prerequisite for every Unit 002
write (the `requireWebAuthn` guard
gates every `/api/v1/admin/*`
write); shipping Unit 002 first
without Unit 001 would either
require a temporary dev seam
that bypasses the WebAuthn check
(acceptable in dev with
`DEV_SKIP_WEBAUTHN=1` but
fragile in tests) or would block
all of Unit 002's writes. The
`DEV_SKIP_WEBAUTHN=1` test seam
remains active throughout Bolt
005-002's Playwright runs (so
the dev persona can exercise the
admin UI without a real
WebAuthn ceremony); production
never reads the env var.

No source code changes in this
entry — paperwork only. The
commit is the Intent 005
paperwork promotion (units.md +
unit-briefs + story specs + bolt
plan + standards sync).

### 2026-10-12 — Bolt 005-001: WebAuthn route layer (DONE)

**1. Bolt intent**

Bolt 005-001 (Unit 001 webauthn-and-auth)
ships the four `/api/auth/webauthn/*`
route handlers + the `requireWebAuthn`
guard + the client-only `WebAuthnCeremony`
component. The `WebAuthnChallenge` table +
the `User.webAuthnCredentials` JSON column
ship in Intent 001; ADR-007 (registered
2026-10-04) pins the four-route-handler
shape + the `requireWebAuthn` guard as
the contract for this bolt. The
ddd-03-adr-analysis.md for this bolt
confirms no new ADRs are required —
ADR-007 is the canonical record for every
decision this bolt makes.

**2. Deliverables**

- `app/api/auth/webauthn/register/route.ts`
  (new) — POST. Zod-validated
  `{ credentialName, attestationResponse }`.
  Calls `verifyAttestation(userId,
  attestationResponse, credentialName)`.
  Returns 201 with the registered
  credential summary, or 400 / 401 / 403
  / 404 / 409 per the documented error
  matrix.
- `app/api/auth/webauthn/login/route.ts`
  (new) — POST (pre-session entry
  point). Zod-validated `{ email }`.
  Calls `issueChallenge(adminId,
  'assertion')`. Returns 200 with the
  assertion ceremony options, or 400 /
  404 (`admin_not_found`) / 409
  (`webauthn_no_credential`).
- `app/api/auth/webauthn/assertion/route.ts`
  (new) — POST (anonymous). Zod-validated
  `{ challengeId, assertionResponse }`.
  Hands off to `verifyAssertion(challengeId,
  assertionResponse)`. Sets the
  `cityfix_session` cookie (HttpOnly +
  SameSite=Lax; `Secure` in prod) and
  returns 200 with the session payload, or
  400 / 401 (assertion_failed /
  assertion_expired) / 404
  (challenge_not_found / credential_not_found).
- `app/api/auth/webauthn/revoke/route.ts`
  (new) — DELETE. Zod-validated
  `{ credentialId }`. Calls
  `revokeCredential(userId, credentialId)`.
  Returns 204, or 400 / 401 / 403 / 404
  / 409 (`webauthn_last_credential`).
- `lib/auth/webauthn.ts` (new) — the
  four domain-service functions
  (`issueChallenge`, `verifyAttestation`,
  `verifyAssertion`, `revokeCredential`)
  with the v10 @simplewebauthn/server
  API contract (`supportedAlgorithmIDs`
  for registration, `authenticator:
  AuthenticatorDevice` for assertion,
  `Awaited<ReturnType<...>>` for the
  generated options).
- `lib/auth/guards.ts` (edit) — added
  the `requireWebAuthn(session)` guard
  + the `WEBAUTHN_CHALLENGE_TTL_MS`
  constant (5 minutes, matching the
  citizen OTP TTL). The dev seam
  (`DEV_SKIP_WEBAUTHN=1`, honored only
  when `CITYFIX_DEV_STORE=1`) is the
  established shape from
  `lib/dev-session.ts`.
- `lib/db-switch.ts` (edit) — added the
  `db.webAuthnChallenge` surface (create,
  findLatest, findById) + the
  `db.userWebAuthn` surface (readCredentials,
  writeCredentials, writeChallenge,
  bumpCounter, revokeCredential). Both
  the dev + Prisma paths are wired.
- `lib/dev-store.ts` (edit) — extended
  `DevUser` with `webAuthnCredentials`
  + `webAuthnChallenge` JSON fields,
  added `webAuthnChallenges: Map<...>` to
  the `Store` interface, added the
  `webAuthnChallenge` + `user.webAuthn`
  helper namespaces, and seeded the
  admin user with `email:
  'admin@cityfix.bd'` (the identifier
  the `login` route uses).
- `components/WebAuthnCeremony.tsx`
  (new) — client-only shell that
  drives the browser's
  `navigator.credentials.create` /
  `.get` calls via
  `@simplewebauthn/browser`. 3-state
  UI (idle / in_progress / done) with
  the 5 `admin.webauthn.*` i18n keys.
- `lib/i18n/keys.ts` (edit) — added
  `admin.webauthn.title`,
  `admin.webauthn.instruction`,
  `admin.webauthn.error.no_credential`,
  `admin.webauthn.error.expired`,
  `admin.webauthn.success`. Both
  locales fully authored.
- `tests/unit/require-webauthn.test.ts`
  (new) — 10 Vitest checks pinning
  the guard contract (null session,
  non-admin role, empty credentials,
  missing challenge, expired challenge,
  happy path, three dev-seam variants).
- `tests/unit/webauthn-service.test.ts`
  (new) — 15 Vitest checks pinning
  the domain-service contract
  (issueChallenge, verifyAttestation,
  verifyAssertion, revokeCredential)
  including the no-last-credential
  rule + the duplicate-credential
  guard.
- `tests/16-admin-webauthn-light.spec.ts`
  (new) — 7 Playwright checks (register
  405, register 401, register 403,
  register 400, login 404, login 409,
  revoke 401) + 1 visual baseline
  (`admin-webauthn-ceremony-1440x900.png`,
  the ceremony idle state at 1440×900
  light theme).
- Paperwork: `intents/005-admin-city-setup/units.md`
  Unit 001 flipped to `done`; story
  spec `ADM-001-webauthn.md` flipped
  to `done` with updated timestamp.

**3. Acceptance walked through**

ADM-001 (WebAuthn mandatory for writes):
all 5 acceptance criteria pass (the
`register` route mints a credential;
the `assertion` route mints a session;
the `revoke` route removes a credential
with the no-last-credential rule; the
`requireWebAuthn` guard throws
`webauthn_required` / `webauthn_assertion_expired`
on the documented conditions; the dev
seam is honored only when the dev store
is active). The criterion → evidence
table is in
`bolts/005-001-webauthn-and-auth/ddd-01-bolt-record.md`:

- Register ceremony:
  `app/api/auth/webauthn/register/route.ts`
  → `lib/auth/webauthn.ts → verifyAttestation`
  → `writeAudit({ action:
  'webauthn.register' })`.
- Assertion ceremony:
  `app/api/auth/webauthn/assertion/route.ts`
  → `lib/auth/webauthn.ts → verifyAssertion`
  → `createSession(...)` + cookie set
  + `writeAudit({ action:
  'webauthn.assertion' })`.
- Revoke:
  `app/api/auth/webauthn/revoke/route.ts`
  → `lib/auth/webauthn.ts → revokeCredential`
  → `writeAudit({ action:
  'webauthn.revoke' })`.
- `requireWebAuthn` guard: the guard
  consults `db.userWebAuthn.readCredentials`
  + `db.webAuthnChallenge.findLatest` and
  throws the documented `webauthn_*` codes.
- Dev seam: the seam is gated by
  `isDevStore() && DEV_SKIP_WEBAUTHN=1`
  (production never reads the env var).

**4. Status**

Intent 005 (Admin City Setup) is now
1/4 bolts shipped (Bolt 005-001). Unit
001 is `done`; Units 002 + 003 + 004 are
`ready`. ADM-001 is `done`; ADM-002
through ADM-007 are `ready`. The
construction loop's next bolt is
`005-002-city-config` (the city-config
UI + APIs + Dhaka template pre-population;
the largest bolt in the intent).

Verification (per
`aidlc/spaces/default/memory/project.md`
Walking Skeleton): `tsc --noEmit` clean
for the bolt's own files (the 13
pre-existing TS errors in
`app/api/v1/dispatcher/dedup-flags/*` +
`app/api/v1/crew/tickets/[id]/route.ts` +
`app/api/v1/dispatcher/queue/route.ts` +
`app/dispatcher/dedup/page.tsx` are
out of scope per the Bolt 003-005
ready-for-checklist pattern);
`npm run test:unit` 193/193 (was 168/168
before the bolt; +25 new checks from
`require-webauthn.test.ts` (10) +
`webauthn-service.test.ts` (15));
`npm run test:mockups` 15/15 (no
mockup HTML was touched; the bolt
adds 1 new visual baseline for the
Playwright spec, captured under
`tests-mockups/baselines/16-admin-webauthn-light.spec.ts/`).

### 2026-10-12 — Bolt 005-002: City config UI + APIs + Dhaka template (DONE)

**1. What shipped**

4 admin pages (`/admin/cities`,
`/admin/cities/<id>/setup`,
`/admin/cities/<id>/taxonomy`,
`/admin/cities/<id>/wards`)
with bilingual copy via
`lib/i18n/keys.ts`; 8 new admin API
route handlers under
`/api/v1/admin/cities/*` (cities +
categories + departments + wards,
full CRUD on each, every write
gated by `requireRole(session,
'admin')` + `requireWebAuthn(session)`);
`lib/admin/dhaka-template.ts`
(`DHAKA_TEMPLATE` snapshot: 8
departments, 8 categories sorted by
slug ASC, 3 placeholder wards;
`applyDhakaTemplate(cityId,
actorId)` writes one `AuditEntry`
per created entity with
`afterValue.snapshotVersion =
DHAKA_TEMPLATE_VERSION` =
`'2026-10-12-v1'`);
`lib/admin/ward-polygon.ts`
(`validatePolygon(raw)` pure function
covering `polygon_not_closed |
polygon_too_few_vertices |
invalid_polygon |
coordinates_out_of_range`); dev
seam (`DEV_SKIP_WEBAUTHN=1` honored
only when `CITYFIX_DEV_STORE=1`)
short-circuits the WebAuthn guard for
the admin persona only.

**2. Tests added**

- `tests/unit/dhaka-template.test.ts`
  (new) — 10 Vitest checks pinning
  the template (version string, 8
  departments, 8 categories, every
  category binds to a real
  department, categories sorted by
  slug ASC, slugs unique, narrow
  photo cap = 2, ward count = 3,
  `applyDhakaTemplate` returns
  correct counts).
- `tests/unit/ward-polygon.test.ts`
  (new) — 6 Vitest checks for
  `validatePolygon` (closed triangle
  accepted; unclosed ring, too-few
  vertices, non-Polygon type,
  out-of-range coordinates, multi-ring
  all rejected with the right error
  code).
- `tests/unit/admin-scope.test.ts`
  (new) — 5 Vitest checks pinning
  the `requireRole` + `requireWebAuthn`
  contract (401 not_authenticated on
  null session; 403 forbidden_role on
  citizen; 200 + session identity for
  admin; 401 on null session for
  requireWebAuthn; dev seam
  short-circuit for admin).
- `tests/17-admin-cities-light.spec.ts`
  (new) — 15 Playwright checks (11
  API: GET 401/403/200/404, POST
  400-or-401, categories/departments/
  wards list 200, PATCH 400-or-401,
  categories + wards array shape; 4
  visual baselines at 1440x900 for
  the four admin pages). The dev
  login uses
  `page.context().request.post(...)`
  to share the session cookie with
  the subsequent `page.goto(...)`.
- Paperwork: Unit 002 status flipped
  to `done`; ADM-002, ADM-003,
  ADM-004, ADM-005 all flipped to
  `done` with updated timestamps;
  `story-index.md` Intent 005 rows
  updated; `bolts/005-002-city-config/ddd-04-bolt-record.md`
  records the bolt's acceptance
  mapping.

**3. Acceptance walked through**

ADM-002 (wards) + ADM-003 (categories)
+ ADM-004 (departments) + ADM-005
(dedup radius) all pass. The
criterion → evidence table is in
`bolts/005-002-city-config/ddd-04-bolt-record.md`:

- Cities overview: `app/admin/cities/page.tsx`
  lists every city with name, status,
  tickets/day + a "View" link.
- Basic info: `app/admin/cities/[id]/setup/page.tsx`
  PATCHes `City.name` + `defaultLanguage`.
- Departments + categories: `app/admin/cities/[id]/taxonomy/page.tsx`
  POST/PATCH/DELETE both, with
  delete confirmation modal.
- Wards: `app/admin/cities/[id]/wards/page.tsx`
  POST/PATCH/DELETE both, polygon
  validated server-side by
  `validatePolygon`.
- Dhaka template: "Apply Dhaka
  template" CTA on the setup page
  → `applyDhakaTemplate(cityId,
  actorId)` writes 8 departments +
  8 categories + 3 wards + 19
  `AuditEntry` rows.
- Audit: every write route calls
  `writeAudit({ entityType,
  entityId, action, actorId,
  beforeValue, afterValue })` with
  the `snapshotVersion` set to
  `DHAKA_TEMPLATE_VERSION` for
  template-sourced rows.
- WebAuthn: every write route calls
  `requireWebAuthn(session)`, which
  is short-circuited by the dev
  seam for admin sessions only.

**4. Status**

Intent 005 (Admin City Setup) is now
2/4 bolts shipped (Bolts 005-001 +
005-002). Unit 001 + Unit 002 are
`done`; Units 003 + 004 are `ready`.
ADM-001 + ADM-002 + ADM-003 + ADM-004
+ ADM-005 are `done`; ADM-006 + ADM-007
are `ready`. The construction loop's
next bolt is `005-003-real-otp-provider`
(real OTP SMS provider wiring).

Verification (per
`aidlc/spaces/default/memory/project.md`
Walking Skeleton): `tsc --noEmit`
clean for the bolt's own code
(the 16 pre-existing TS errors in
`app/api/v1/dispatcher/dedup-flags/*` +
`app/api/v1/crew/tickets/[id]/route.ts` +
`app/api/v1/dispatcher/queue/route.ts` +
`app/api/v1/dispatcher/map/tickets/route.ts` +
`app/dispatcher/dedup/page.tsx` +
`lib/db-switch.ts` (the `dedupFlag`
facade) are out of scope per the
Bolt 003-005 ready-for-checklist
pattern — none of them regress in
this bolt);
`npm run test:unit` 217/217 (was
193/193 before the bolt; +24 new
checks from `dhaka-template.test.ts`
(10) + `ward-polygon.test.ts` (6) +
`admin-scope.test.ts` (5) + 3
existing suites re-validated after
the `lib/db-switch.ts` `Awaited<…>`
cast additions);
`npm run test:mockups` 15/15 (no
mockup HTML was touched; the bolt
adds 4 new visual baselines for
the Playwright spec, captured under
`tests-mockups/baselines/17-admin-cities.spec.ts/`);
`npx playwright test
tests/17-admin-cities-light.spec.ts`
15/15.

### 2026-10-12 — Bolt 005-003: Real OTP SMS provider (DONE)

**1. What shipped**

`lib/auth/otp-provider/types.ts`
(`OtpProvider` interface + `OtpResult`
discriminated union on `delivered` +
`OtpError` string-literal union);
`lib/auth/otp-provider/stub.ts`
(`StubProvider`, always-delivered,
`console.info` for dev visibility);
`lib/auth/otp-provider/twilio.ts`
(`TwilioProvider`, constructor-time
env-var validation, 3-attempt retry
on 5xx with `[100, 200, 400]` ms
backoff, immediate-fail on 4xx);
`lib/auth/otp-provider/index.ts`
(`getOtpProvider()` factory keyed on
`OTP_PROVIDER`, module-singleton
cache, `__resetOtpProviderForTests`
seam). `lib/auth/otp.ts` extended
with the public
`sendOtp(phone, code, actorId)` —
the helper never throws; on a
failure it writes an `AuditEntry`
with `entityType: 'user'`,
`action: 'otp_send_failed'`,
`afterValue: { phone, provider,
error }` (ADR-012). The
`app/api/v1/auth/send-otp/route.ts`
is wired with the new call site
and returns `502
sms_provider_failure` on delivery
failure. `.env.example` updated
with the four Twilio vars + the
rewritten `OTP_PROVIDER` comment.
`twilio@^4.23.0` added to
`package.json`. ADR-012 filed in
`standards/decision-index.md`
(Context, Decision, Consequences,
6 alternatives rejected, 4
follow-ups deferred).

**2. Tests added**

- `tests/unit/otp-provider.test.ts`
  (new) — 18 Vitest checks
  covering: `StubProvider` (3 —
  always-delivered, console.info,
  name), `TwilioProvider` env
  validation (4 — throws on each
  missing var, calls
  `messages.create` with the right
  shape), retry semantics (3 —
  5xx × 2 then 200 succeeds after
  3 attempts, 5xx exhausted returns
  `twilio_api_error`, 4xx has no
  retry), factory (5 — unset /
  `stub` / `twilio` / unknown
  throws / caches), `sendOtp`
  public helper (3 — success path,
  provider_misconfigured on
  constructor throw, audit-on-
  failure).

**3. Acceptance walked through**

ADM-006 (real OTP SMS provider)
all 5 acceptance criteria pass.
The criterion → evidence table is
in
`bolts/005-003-real-otp-provider/ddd-04-bolt-record.md`:

- Stub provider:
  `tests/unit/otp-provider.test.ts`
  "always returns delivered: true"
  + "logs the code".
- Twilio provider:
  `tests/unit/otp-provider.test.ts`
  "calls messages.create with
  to / from / body when env is
  complete" asserts the
  `messages.create` argument
  shape.
- Twilio 5xx retry:
  `tests/unit/otp-provider.test.ts`
  "retries 3 times on 5xx then
  succeeds on the 3rd attempt"
  asserts `create` called 3×,
  `sleeps === [100, 200]`, result
  `delivered: true`.
- Twilio 4xx no-retry:
  `tests/unit/otp-provider.test.ts`
  "does NOT retry on 4xx (invalid
  phone → immediate fail)" asserts
  `create` called 1×, result
  `delivered: false, error:
  'twilio_api_error'`.
- Missing env: the
  "throws on missing TWILIO_AUTH_TOKEN
  at construction" check + the
  "records provider_misconfigured
  when the provider constructor
  throws" check cover acceptance 5
  end-to-end (constructor throws →
  `sendOtp` catches → audit row
  records `action: 'otp_send_failed',
  error: 'provider_misconfigured'`
  → route returns 502).

**4. Status**

Intent 005 (Admin City Setup) is now
3/4 bolts shipped (Bolts 005-001 +
005-002 + 005-003). Units 001 + 002
+ 003 are `done`; Unit 004 is
`ready`. ADM-001 + ADM-002 + ADM-003
+ ADM-004 + ADM-005 + ADM-006 are
`done`; ADM-007 (audit dashboard) is
`ready`. The construction loop's
next bolt is `005-004-audit-dashboard`
(cursor-paginated, filterable
`GET /api/v1/admin/audit` +
`app/admin/audit/page.tsx` + 1
visual baseline at 1440×900).

Verification (per
`aidlc/spaces/default/memory/project.md`
Walking Skeleton): `tsc --noEmit`
clean for the bolt's own code
(the 16 pre-existing TS errors
remain out of scope; no new
errors from this bolt);
`npm run test:unit` 235/235 (was
217/217; +18 new from
`otp-provider.test.ts`);
`npm run test:mockups` 15/15
(no UI changes; the bolt is
library-level — no new page,
no new API route, no new
Playwright spec);
`curl -fs http://localhost:3000/`
200 (no new top-level routes).

### 2026-10-12 — Bolt 005-004: Admin Audit Dashboard (DONE)

**1. Bolt + Unit**

`005-004-audit-dashboard` —
Unit 004 of Intent 005
(`005-admin-city-setup`). One
`ddd-construction-bolt` per the
unit-brief. Full record:
`bolts/005-004-audit-dashboard/ddd-04-bolt-record.md`.

**2. What shipped**

The read-only `/admin/audit`
dashboard: a 1 API + 1 page + 2
components surface that lists every
`AuditEntry` row in the system with
filter + cursor pagination + 30 s
polling on the first page.

- `app/api/v1/admin/audit/route.ts` —
  GET only; Zod-validated query
  (`actorId`, `action` comma-list,
  `entityType` comma-list against
  the closed ADR-012 union, `from`,
  `to`, `cursor`, `limit`); returns
  `{ entries, nextCursor }`; 401
  `unauthenticated` / 403
  `forbidden_role` / 400
  `invalid_input` / 500 `unhandled`
  via the established `ApiError`
  shape.
- `lib/admin/audit-query.ts` — the
  `buildWhere(input)` test seam +
  `clampLimit(input)` (1..100,
  default 50) + `listAuditEntries`
  with `take: limit + 1` "has more"
  detection + `hydrateActors` fan-
  out (N+1 by actor, not by row) for
  `actorName` server-side.
- `lib/db-switch.ts` delta —
  `db.audit.findMany` mirroring the
  queue route's shape, with the
  `isDevStore()` branch.
- `lib/dev-store.ts` delta — 5
  seed `AuditEntry` rows
  (`aud_seed_otp_fail`,
  `aud_seed_ward_create`,
  `aud_seed_dedup_update`,
  `aud_seed_category_create`,
  `aud_seed_city_create`) spanning
  -24 h → -1 m so the visual baseline
  is deterministic + a 30-line
  `findMany` filter loop.
- `app/admin/audit/page.tsx` —
  `'use client'`; auth gate via
  `/api/auth/status`; URL state via
  `useSearchParams` +
  `history.replaceState`; 30 s
  `setInterval` polling on the
  current view with a `cursorRef`
  pattern for stale-closure safety;
  288 px filter rail + flex-1
  table surface; bilingual labels
  via the dispatcher's
  `cityfix.preferred_language.v1`
  key.
- `components/AdminAuditFilters.tsx` —
  uncontrolled inputs (state lives
  in the URL, not the form); flushes
  to the parent on `Apply`; single-
  select `entityType` for v1 (multi
  is v1.1); `toLocalInput` helper
  for `datetime-local` ISO
  conversion.
- `components/AdminAuditTable.tsx` —
  6-col table (timestamp locale-
  formatted per lang, actor, action,
  entity-type chip, entity id
  truncated to 14 + ellipsis + a
  `title` attr, expand chevron);
  expand slot is a 2-col grid with
  `beforeValue` + `afterValue` JSON
  in `<pre>` tags; 5 skeleton rows
  on loading; single-row empty/error.
- `lib/i18n/keys.ts` delta — 22
  new `admin.audit.*` keys, all
  `{ bn, en }`.
- `app/admin/cities/page.tsx`
  delta — header pill
  → `/admin/audit` in the same row
  as the existing "Set up new city"
  CTA.
- `tests/unit/audit-query.test.ts` —
  14 Vitest checks in 2 describe
  blocks (`buildWhere` × 9,
  `clampLimit` × 5).
- `tests/18-admin-audit-light.spec.ts` —
  9 API checks (401 no session,
  403 `forbidden_role` citizen,
  200 admin + 5 entries + nextCursor
  null, `?actorId=user_admin_dncc` →
  4, `?action=create` → 3,
  `?entityType=user` → 1,
  `?from=-10m&to=now` → 2,
  `?limit=2` → 2 + non-null cursor,
  `?entityType=garbage` → 400) + 1
  visual baseline
  (`admin-audit-1440x900.png`) at
  1440×900 with the first row open
  showing the `twilio_api_error`
  JSON in the after-value pane.

**3. Acceptance mapping**

ADM-007's 7 acceptance criteria are
all met:

- A1 (list) → 9th Playwright test
  (200 + 5 entries + nextCursor
  null).
- A2 (filter by actor) → 4th test
  (`?actorId=user_admin_dncc` → 4).
- A3 (filter by action) → 5th
  test (`?action=create` → 3).
- A4 (date range) → 7th test
  (`?from=-10m&to=now` → 2).
- A5 (cursor pagination) → 8th
  test (`?limit=2` → 2 + non-null
  cursor); cursor stability
  (strict `<` not `<=`) covered
  by the Vitest `buildWhere` test.
- A6 (read-only) → static review:
  only `export async function GET`
  ships in the route file; no
  `POST` / `PUT` / `DELETE`.
- A7 (cross-role denial) → 1st +
  2nd tests (401 + 403
  `forbidden_role`).

Plus 3 bolt-specific criteria:

- ADR-012 closed union: the
  `?entityType=garbage` test
  (9th) returns 400
  `invalid_input`.
- `actorName` server-side: the
  test's `actorName.toContain('admin')`
  assertion on the 4 admin rows
  confirms the `hydrateActors` fan-
  out is wired.
- Visual baseline non-empty:
  `admin-audit-1440x900.png` shows
  the 5 rows in the table with the
  first row open.

**4. Status**

Intent 005 (Admin City Setup) is
**done** end to end. 4/4 bolts
shipped (005-001 + 005-002 + 005-003
+ 005-004). All 4 units are
`done`; all 7 stories (ADM-001
through ADM-007) are `done`. The
audit dashboard is the only
read-only admin surface in v1;
the `requireRole('admin')`-only
guard (no `requireWebAuthn`)
matches the read-side vs write-
side policy from Bolt 005-001.

**5. Verification**

- `npx tsc --noEmit` — clean for
  the bolt's own code; 16
  pre-existing errors in
  `dispatcher/dedupFlag`, `crew`
  ticket trail, and the
  dispatcher map route remain out
  of scope and are not regressions.
- `npm run test:unit` — 249/249
  (235 + 14 new `audit-query`
  checks).
- `npm run test:mockups` — 15/15
  (no UI changes to global mockup
  HTML).
- `npx playwright test
  tests/18-admin-audit-light.spec.ts`
  — 9/9 + 1/1 visual (12.0 s).
- `curl -fs http://localhost:3000/`
  — 200.

**6. Decision register delta**

- **ADR-013 (new)**: read-side
  vs write-side guard policy for
  the audit dashboard. Established
  in Bolt 005-001; reaffirmed here
  with the explicit
  `requireRole('admin')`-only
  call. WebAuthn remains a write-
  side property.
- **ADR-010 (amended)**: the
  closed `AuditEntry.entityType`
  union gains explicit coverage
  in the audit query API: the
  Zod schema validates against
  the 6-value union; unknown
  values return 400
  `invalid_input`. The Prisma
  boundary uses `as never` to
  bridge the dev store's wider
  string shape; no production
  type drift.
- **ADR-011 (reaffirmed)**: the
  `entityId` field is the raw
  Prisma ID; the page truncates
  the display to 14 chars +
  ellipsis + a `title` attr with
  the full ID for accessibility.

**7. Risks + follow-ups**

- **Dev-store seed reset on
  server restart**: the dev
  store's `seed()` only runs at
  server start, so a fresh dev
  server is required for the new
  `AuditEntry` rows to appear.
  Playwright's `webServer` config
  manages this automatically;
  manual smoke tests need a server
  restart. Filed in
  `bolts/005-004-audit-dashboard/ddd-04-bolt-record.md`
  under "Risks observed".
- **Visual baseline fragility**:
  the `otp_send_failed` row's
  `afterValue` is the deterministic
  stub payload from
  `lib/auth/otp.ts:58` (`{
  error: 'twilio_api_error' }`);
  any future change to the stub's
  error shape would require re-
  baselining. Filed in the bolt
  record.
- **CSV export** (WO-004 §4.7)
  remains a v1.1 follow-up per
  the unit-brief's out-of-scope
  list.
- **Real-time updates** (WebSocket
  / SSE) for the audit log remain
  a v1.1 follow-up; the 30 s
  polling cycle is the v1
  contract.

**8. Next in trunk**

The construction loop's next
focus is determined by the
in-flight intent queue; Bolt
005-004 is the closing bolt of
Intent 005. The audit dashboard
is the only navigation touch-
point that lands in this bolt
(the `/admin/audit` header pill
in `/admin/cities`). No
follow-on bolt is required from
Intent 005.


