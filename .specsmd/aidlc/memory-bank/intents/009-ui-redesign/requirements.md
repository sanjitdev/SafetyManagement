---
intent: 009-ui-redesign
phase: inception
status: in-progress
created: 2026-11-02T18:00:00Z
updated: 2026-11-02T19:10:00Z
---

# Requirements: 009-ui-redesign

## Intent Overview

Redesign the entire CityFix surface set — from `/login` through every
citizen, dispatcher, crew and admin page — so the product reads as a
modern, professional civic platform rather than a set of inline-styled
screens.

Deliverables: a real brand mark, a coherent token system, an icon
family, professional status/indicator language, redesigned charts on the
ops dashboards, and refreshed HTML mockups that gate each implementation
wave.

**Type**: brown-field (frontend feature — full-surface redesign on top
of the shipped v1). The backend, the API surface, the roles and the
transports are all unchanged. This intent changes how every route
*looks* and how it *behaves at the chrome level* (labels, indicators,
validation states), and it re-implements the affected pages on a shared
primitive library.

**Visual direction (locked)**: Accessible + Swiss/Minimal. Civic
trust, high-contrast navy/blue, flat surfaces, hairline borders, 8px
rhythm, dense-but-calm. Bangla-first.

## Business Goals

| Goal | Success Metric | Priority |
|------|----------------|----------|
| Every route reads as one coherent civic product | A reviewer opening any two routes sees the same chrome, the same type scale, the same status language | Must |
| Status is legible without colour perception | Every status indicator carries an icon **and** a word **and** a colour; no indicator encodes meaning by hue alone | Must |
| Icons come from one family | Zero hand-rolled glyphs, zero emoji in chrome; every icon resolves through `lib/ui/icon-map.ts` | Must |
| Auth is honest about failure | Every invalid-input path shows a focusable error summary linked to the offending field, plus inline `role="alert"` errors | Must |
| Ops dashboards carry professional chart language | Trend, category and SLA charts are labelled, tabular and paired with a visible sortable data table | Should |
| The redesign does not break the shipped v1 | Every existing unit test, visual baseline, route spec and CI gate stays green throughout | Must |

## Locked Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Visual direction | Accessible + Swiss/Minimal | Matches the civic-trust brand personality; high contrast works on cheap handsets and in daylight. |
| Runtime dependencies | `@phosphor-icons/react` + `recharts` — and only those two | One icon family, one chart library. Phosphor ships per-icon exports so the bundle stays tree-shaken. |
| Sequencing | Waves — foundation + auth → citizen → dispatcher → crew → admin | Each wave ends in a mockup-approval gate, so a visual regression is caught before three waves of pages inherit it. |
| Brand | A new CityFix logo mark + wordmark as in-repo SVG | The product had no mark. Ships as favicon, header lockup and OG image. |
| Typography | Noto Sans Bengali for **both** Bangla and Latin | The only face in the stack that renders Bangla. The skill's Poppins/Open Sans suggestion was rejected for this reason. |
| Third-party marks | Authentic or absent — never fabricated | A Dhaka North City Corporation seal is **not** drawn; a documented neutral placeholder ships instead. OSM + MapLibre attribution is a licence requirement, not decoration. |

## Design System — palette and tokens

| Token | Value | Role |
|---|---|---|
| `--color-primary` | `#1E40AF` | Civic blue. Primary actions only — at most one CTA in view. 8.72:1 on white. |
| `--color-primary-hover` / `-pressed` | `#1D3FA1` / `#173285` | Hover + pressed states. |
| `--color-primary-soft` | `#EFF6FF` | Selected / active fill. |
| `--color-accent` | `#0369A1` | Links and focus accents. Deliberately distinct from primary so a link never reads as a button. |
| `--color-ink` | `#020617` | Near-black primary text. |
| `--color-ink-secondary` | `#475569` | Secondary text. |
| `--color-ink-tertiary` | `#64748B` | Tertiary text, metadata. |
| `--color-surface-page` | `#F8FAFC` | Cool off-white app background. |
| `--color-surface-card` | `#FFFFFF` | Cards, modals. |
| `--color-surface-raised` | `#F1F5F9` | Inputs, fills. |
| `--color-surface-sunken` | `#E8ECF1` | Sunken wells. |
| `--color-border` / `-strong` | `#E2E8F0` / `#CBD5E1` | Hairlines. |
| `--color-success` | `#15803D` | An **outcome**, never a CTA. There is no green button. |
| `--color-warning` | `#B45309` | Attention required. |
| `--color-danger` | `#C81E1E` | Destructive actions and failures. |

Status + category semantic tokens keep their meaning but move to AA
contrast in all three theme contexts (`:root`, `.theme-dark`,
`.theme-outdoor`). The outdoor theme (Rashid's sunlight surface) is
preserved as pure black on pure white and re-verified, not softened.

Type: Noto Sans Bengali, scale 12 / 14 / 15 / 16 / 17 / 20 / 24 / 32 /
44 px, **1.6 leading floor** on Bangla body copy (Bangla matras clip
below that inside pills and buttons), tabular numerals on every figure.

Icons: Phosphor Outline, one family. Central registry at
`lib/ui/icon-map.ts` maps category slugs → icons and replaces the ad-hoc
`categoryIcon` emoji helpers.

## Functional Requirements

### FR-1: CI gate unblocked before any design work

- **Description**: The CI pipeline must be a usable gate before the
  redesign starts. Two defects are fixed: `lib/db.ts` runs
  `assertProductionDatabaseConfig()` at **module load** (which fails
  the build whenever `DATABASE_URL` points at a loopback address, as
  it does in CI), and `tests/28-role-walkthrough.spec.ts` declares a
  `let` that is never reassigned.
- **Acceptance**:
  - The production DB guard fires on **first real DB use**, not at
    import — loud-fail on the first request, never on the build.
  - A unit test (`tests/unit/db-lazy-guard.test.ts`) covers the guard.
  - `npm run lint` reports 0 errors · `npx tsc --noEmit` clean ·
    `npm run test:unit` green · `npm run build` green · CI green on
    `main`.
- **Priority**: Must
- **Related Stories**: 001-lazy-production-db-guard

### FR-2: Design foundation — tokens, global CSS, icons, charts, primitives, brand

- **Description**: Ship the shared foundation every later wave
  composes from:
  - `tokens.css` rewritten to the palette above, plus `--color-accent`,
    `--shadow-focus`, `--icon-size-{sm,md,lg}`, `--border-input`,
    `--border-focus`, a full `.theme-dark` block and a
    `prefers-color-scheme: dark` block, with `.theme-outdoor`
    preserved.
  - `app/globals.css`: focus-visible ring, reduced-motion block, 8px
    rhythm utilities, Bangla line-height correction, `.sr-only`, print
    styles.
  - `lib/ui/icon-map.ts`: per-icon Phosphor SSR registry +
    `categoryIcon()` / `categoryIconColor()`.
  - `components/ui/`: `Button`, `IconButton`, `Field`, `Input`,
    `Select`, `Textarea`, `Card`, `Panel`, `Badge`, `StatusPill`,
    `Avatar`, `Toolbar`, `FilterBar`, `DataTable`, `EmptyState`,
    `ErrorState`, `LoadingState`, `Breadcrumb`, `SideNav`, `Tabs`,
    `Modal`, `Toast`, `KpiRow`, `Timeline`, `CategoryIcon`, and
    `components/ui/charts/`: `ChartFrame`, `TrendLine`,
    `CategoryBar`, `SlaBullet`, `StatCard`.
  - `design-artifacts/D-Design-System/02-Assets/`: `cityfix-mark.svg`,
    `cityfix-wordmark.svg`, `favicon.svg`, `og-image.svg`, plus
    `NOTICE.md` and `README.md` documenting the swap slot for the
    city seal.
  - `components/AppHeader.tsx`: brand mark swap + Phosphor nav icons.
- **Acceptance**:
  - Every primitive ships a unit test in `tests/unit/components/` and
    is exported from `components/ui/index.ts`.
  - Every colour pair clears WCAG AA in every theme context
    (`tests/unit/ui/tokens-contrast.test.ts`).
  - `StatusPill` renders an icon **and** a label — never colour alone.
  - Every chart ships a visible, sortable data table.
  - `npm run check:i18n` green · `npm run build` green.
- **Priority**: Must
- **Related Stories**: 002-token-and-global-css-system,
  003-phosphor-icon-registry, 004-ui-primitive-library,
  005-chart-primitives-with-data-tables,
  006-cityfix-brand-assets

### FR-3: Auth + public surfaces

- **Description**: Redesign the entry surfaces — `/login`,
  `/register`, `/verify-otp`, `/` (public landing), `/feed`, `/splash`.
  Each is mockup-approved before implementation.
- **Acceptance**:
  - Mockups `08-login`, `09-register`, `10-verify-otp`,
    `11-public-landing`, `12-feed` exist, use only `var(--color-*)`
    tokens, inline SVG icons (no emoji) and Bangla-first copy, and are
    wired into `gallery.html` + the Playwright baseline spec.
  - Every invalid-input path shows a **focusable error summary linked
    to the offending field** plus inline `role="alert"` errors.
  - Every input has a `<label for>` — no placeholder-only fields.
  - Password rules show a per-rule icon + word, never colour alone.
  - The OTP screen names its delivery channel (SMS), shows a resend
    countdown, and offers a recovery path when the code does not
    arrive.
  - The public landing shows live stats with tabular numerals and a
    PII-stripped activity feed.
  - New Playwright route specs + baselines for the six routes.
- **Priority**: Must
- **Related Stories**: 007-auth-and-public-mockups,
  008-auth-and-public-page-implementation

### FR-4: Citizen surfaces

- **Description**: Redesign `/home`, the five-step report flow,
  `/report/[id]/submitted`, `/reports`, `/reports/[id]`.
  Mockups `13-home-city-activity`, `14-report-shell`,
  `15-my-reports`, `16-report-detail-trail`.
- **Acceptance**:
  - Mockups approved before implementation.
  - The report flow keeps its progress indicator, the photo cap
    indicator (`0 / 3 ছবি`), the dedup prompt, and the vertical
    `Timeline` status trail with per-step icons + timestamps.
  - New Playwright route specs + baselines.
- **Priority**: Should
- **Related Stories**: 009-citizen-mockups,
  010-citizen-page-implementation

### FR-5: Dispatcher console

- **Description**: Redesign `/dispatcher`,
  `/dispatcher/tickets/[id]`, `/dispatcher/map`, `/dispatcher/dedup`,
  `/dispatcher/monitor`, `/dispatcher/performance`.
  Mockups `17-triage-queue`, `18-dispatcher-ticket-detail`,
  `19-dispatcher-map`, `20-dispatcher-monitor` (dark ops board),
  `21-dispatcher-performance` (charts).
- **Acceptance**:
  - Mockups approved before implementation.
  - The dense 3-region layout (filter rail / list / detail), the
    sticky action bar, the SLA countdown chip and the searchable crew
    picker combobox survive the redesign.
  - Trend + category charts are labelled and tabular.
  - New Playwright route specs + baselines.
- **Priority**: Should
- **Related Stories**: 011-dispatcher-mockups,
  012-dispatcher-page-implementation

### FR-6: Crew field app

- **Description**: Redesign `/crew` and `/crew/tickets/[id]`.
  Mockups `22-crew-assignments`, `23-crew-ticket-detail` (outdoor
  high-contrast).
- **Acceptance**:
  - Mockups approved before implementation.
  - Touch targets stay ≥48px, the one-thumb capture flow survives, and
    the before/after photo cards keep their labels.
  - `.theme-outdoor` is preserved and re-verified at AA contrast.
  - New Playwright route specs + baselines.
- **Priority**: Should
- **Related Stories**: 013-crew-mockups,
  014-crew-page-implementation

### FR-7: Admin console

- **Description**: Redesign `/admin`, `/admin/tickets`,
  `/admin/tickets/[id]`, `/admin/audit`, `/admin/cities`,
  `/admin/cities/[id]/{setup,wards,taxonomy,users,adoption}`.
  Mockups `24-admin-console`, `25-admin-tickets`, `26-admin-audit`,
  `27-admin-city-setup`, `28-admin-adoption`.
- **Acceptance**:
  - Mockups approved before implementation.
  - Data tables carry sortable + focusable headers with `aria-sort`,
    bulk selection, and a CSV-export affordance.
  - The audit stream shows actor + action chips; the adoption
    dashboard carries a KPI row + trend + category bar + SLA bullet.
  - New Playwright route specs + baselines.
- **Priority**: Should
- **Related Stories**: 015-admin-mockups,
  016-admin-page-implementation

### FR-8: Verification and sign-off

- **Description**: Regenerate every committed baseline, capture the new
  ones, run the full gate, and refresh the project documentation.
- **Acceptance**:
  - `npx tsc --noEmit` clean · `npm run lint` 0 errors ·
    `npm run test:unit` green · `npm run test:unit:coverage` ≥80% ·
    `npm run test:mockups` green · `npm run check:i18n` green ·
    `npm run build` green · CI green.
  - Accessibility pass: contrast audit on every token pair in every
    theme, keyboard walk on login + triage queue,
    `prefers-reduced-motion` honoured, screen-reader labels on every
    icon-only control, no colour-only status encoding.
  - `_progress/00-design-log.md`, `_progress/wds-project-outline.yaml`
    and `design-artifacts/D-Design-System/00-design-system.md` are
    refreshed.
- **Priority**: Must
- **Related Stories**: 017-full-gate-and-accessibility-pass,
  018-project-documentation-refresh

## Non-Functional Requirements

### Performance
| Requirement | Metric | Target |
|-------------|--------|--------|
| No page regresses materially | First Contentful Paint on the heaviest route (`/report/location`, map bundle) | ≤ 100 ms delta vs. v1 |
| Chart libraries stay off the server path | Recharts is `dynamic()`-imported; Phosphor imports per-icon | First Load JS on non-chart routes grows ≤ 5 kB |
| Icons tree-shake | `@phosphor-icons/react` per-icon imports only | No whole-library import in any file |

### Accessibility
| Requirement | Standard | Notes |
|-------------|----------|-------|
| Colour contrast | WCAG 2.1 AA (4.5:1 body, 3:1 large text + UI boundaries) | Enforced by `tests/unit/ui/tokens-contrast.test.ts` across `:root`, `.theme-dark` and `.theme-outdoor`. |
| Status never colour-alone | Shape (icon) + word + colour | `StatusPill` contract; unit-tested. |
| Focus visibility | 3–4px visible focus ring, ≥44px touch targets | `--shadow-focus` ring + `prefers-reduced-motion` block. |
| Keyboard operability | Every interactive element reachable and operable; focusable error summaries | Keyboard walk on `/login` and `/dispatcher`. |
| Bangla legibility | 1.6 leading floor; no clipped matras in pills/buttons | Audit per wave. |
| Screen readers | Label on every icon-only control; `aria-sort` on sortable table headers | Unit-tested per primitive. |

### Reliability
| Requirement | Standard | Notes |
|-------------|----------|-------|
| Visual baselines are gating | Every chrome change ships a committed PNG baseline | `npm run test:update-baselines`, reviewed in the PR. |
| Token drift is caught | A `var(--token)` with no declaration fails a unit test | `tests/unit/ui/mockup-tokens.test.ts`. |
| i18n drift is caught | Every `t(...)` key referenced by `app/**` is registered | `npm run check:i18n`. |
| No raw internal ids on user-facing surfaces | Display names everywhere; ids only in `data-testid` / tooltips | Carried over from Intent 008; must not regress. |

### Compliance
| Requirement | Standard | Notes |
|-------------|----------|-------|
| Bilingual parity | Every new key ships `bn` + `en` in the same commit | Per `team.md` Mandated. |
| Third-party attribution | OSM + MapLibre attribution on every map; Noto OFL; Phosphor MIT | `02-Assets/NOTICE.md`. |
| No fabricated authority marks | The city seal is a documented placeholder | `02-Assets/README.md`. |

## Constraints

- **No new endpoints, no new roles, no new transports.** This is a
  surface redesign on top of the shipped v1.
- **No backend / API / schema changes.** The serializer remains the
  load-bearing trust boundary for citizen surfaces.
- **One design system.** `design-artifacts/D-Design-System/` is the
  single source of truth; the skill's `--persist` output is
  deliberately not written.
- **Only two new runtime dependencies**: `@phosphor-icons/react` and
  `recharts`.
- **The mockup-approval gate is real.** No page in a wave is
  implemented until that wave's mockups are approved.
- **Wave boundaries are route lists.** Anything outside them is out of
  scope.
- **CI must be green before Wave 1 starts.** A red gate masks
  regressions.

## Assumptions

| Assumption | Risk if invalid | Mitigation |
|------------|----------------|------------|
| The existing 31 routes still enumerate the full surface set | A route outside the wave list ships un-redesigned | The wave exit gate includes a route sweep against the Next.js build manifest. |
| Bangla copy for the new surfaces can be written in the existing `bn` + `en` registry shape | The registry needs a structural change | Wave 1's `check:i18n` gate catches the shape mismatch early. |
| The mockup static-HTML approach (Tailwind CDN + `tokens.css`) still renders offline in CI | The baseline suite needs a different renderer | Baselines are captured with Playwright + Chromium, already proven by the existing 15. |
| Recharts renders identically in the CI image and on the reviewer's machine | Baseline churn on a different font stack | `maxDiffPixelRatio: 0.01` already in `playwright.config.ts`; charts render in a fixed-size `ChartFrame`. |

## Out of Scope (Won't)

- Backend / API / schema changes · new roles · new endpoints ·
  push/VAPID wiring · a real SMS provider · multi-city tenancy ·
  native mobile apps · analytics tracking · copy rewrites beyond
  chrome, labels and indicators · the MapLibre map internals (chrome
  only).
- Real photographs — photo blocks use gradient placeholders; city
  photography is a content task.
- Animation work — tokens define durations and easings; the mockups
  are static.
- A real Dhaka North City Corporation seal.

## Open Questions

| Question | Resolution |
|----------|------------|
| Does the redesign change the i18n key set wholesale? | **No.** Existing keys are reused wherever they already carry the right meaning; new keys are added per wave with `bn` + `en` together. |
| Is a dark ops board in scope for `/dispatcher/monitor`? | **Yes** — a `.theme-dark` variant of the monitor mockup (`20-dispatcher-monitor`), since the dispatcher runs it on a wall display. |
| How are the mockups reviewed? | Each wave's mockups are opened in a browser from `gallery.html`; approval is a human gate recorded in the design log. |

## Next Stage

Units + stories + bolt plan — see `units.md`.
