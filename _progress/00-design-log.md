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


