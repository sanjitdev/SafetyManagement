---
id: 009-002-design-foundation
unit: 002-design-foundation
intent: 009-ui-redesign
type: simple-construction-bolt
status: complete
stories:
  - 002-token-and-global-css-system
  - 003-phosphor-icon-registry
  - 004-ui-primitive-library
  - 005-chart-primitives-with-data-tables
  - 006-cityfix-brand-assets
created: 2026-11-02T18:20:00Z
started: 2026-11-02T18:20:00Z
completed: 2026-11-02T18:55:00Z
updated: 2026-11-02T18:55:00Z
current_stage: null
stages_completed:
  - name: plan
    completed: 2026-11-02T18:20:00Z
    artifact: implementation-plan.md
  - name: implement
    completed: 2026-11-02T18:45:00Z
    artifact: implementation-walkthrough.md
  - name: test
    completed: 2026-11-02T18:55:00Z
    artifact: test-walkthrough.md
requires_bolts:
  - 009-001-ci-unblock
enables_bolts:
  - 009-003-auth-and-public-surfaces
requires_units: []
blocks: false
complexity:
  avg_complexity: 3
  avg_uncertainty: 2
  max_dependencies: 1
  testing_scope: 3
  estimated_files: 45
---

# Bolt 009-002 — Design Foundation

## Purpose

Build the layer every later wave composes from. Nothing in Waves 2–6
may be implemented until this bolt is green: a token, an icon or a
primitive invented inside a page is a token, an icon or a primitive
that will drift.

## Stories

| Story ID | Title | FR |
|----------|-------|-----|
| 002-token-and-global-css-system | Token + global CSS system | FR-2 |
| 003-phosphor-icon-registry | Phosphor icon registry | FR-2 |
| 004-ui-primitive-library | UI primitive library | FR-2 |
| 005-chart-primitives-with-data-tables | Chart primitives with data tables | FR-2 |
| 006-cityfix-brand-assets | CityFix brand assets | FR-2 |

## Files Modified

### Tokens + global CSS

- `design-artifacts/D-Design-System/01-Visual-Design/tokens.css` —
  rewritten to the locked palette; `--color-accent`, `--shadow-focus`,
  `--icon-size-{sm,md,lg}`, `--border-input`, `--border-focus`; a
  full `.theme-dark` block **and** a `prefers-color-scheme: dark`
  block; `.theme-outdoor` preserved; Bangla leading floor 1.6.
- `app/globals.css` — focus-visible ring, reduced-motion block, 8px
  rhythm, `.sr-only`, Bangla line-height correction, print styles.
- `app/layout.tsx` — `themeColor` → `#2C5282`.

### Icons

- `lib/ui/icon-map.ts` — Phosphor SSR per-icon registry (`ICONS`,
  `CATEGORY_ICONS`, `categoryIcon()`, `categoryIconColor()`).

### Primitives

- `components/ui/` — `Button`, `IconButton`, `Field`, `Input`,
  `Select`, `Textarea`, `Card`, `Panel`, `Badge`, `StatusPill`,
  `Avatar`, `Toolbar`, `FilterBar`, `DataTable`, `EmptyState`,
  `ErrorState`, `LoadingState`, `Breadcrumb`, `SideNav`, `Tabs`,
  `Modal`, `Toast`, `KpiRow`, `Timeline`, `CategoryIcon`.
- `components/ui/charts/` — `ChartFrame`, `TrendLine`,
  `TrendLineCanvas`, `CategoryBar`, `CategoryBarCanvas`, `SlaBullet`,
  `StatCard`.

### Brand

- `design-artifacts/D-Design-System/02-Assets/logo/` —
  `cityfix-mark.svg`, `cityfix-wordmark.svg`, `favicon.svg`,
  `og-image.svg`, `NOTICE.md`, `README.md`.
- `public/favicon.svg`, `public/og-image.svg` — runtime copies.

### Chrome + library reference

- `components/AppHeader.tsx` — brand mark swap, Phosphor nav icons.
- `components.html` + `gallery.html` — rewritten to the new system.
- `design-artifacts/D-Design-System/01-Visual-Design/README.md`.

### Migration

- `app/crew/page.tsx`, `app/crew/tickets/[id]/page.tsx`,
  `app/dispatcher/page.tsx` — the ad-hoc `categoryIcon()` emoji
  helpers replaced by `<CategoryIcon slug={ticket.categorySlug} />`.
- `components/AdminAuditFilters.tsx`, `components/AdminAuditTable.tsx`,
  `components/AdminTicketsFilters.tsx` — token-only styling.
- `lib/i18n/keys.ts` — the new keys the primitives need.

### Dependencies

- `package.json` / `package-lock.json` — `@phosphor-icons/react` and
  `recharts` added. **Only** these two.

### Tests

- `tests/unit/components/*.test.tsx` — 13 files, one per primitive
  area (Avatar, Badge, Button, CategoryIcon, Charts, DataTable, Field,
  IconButton, Input, Navigation, Overlays, Select, States, Textarea).
- `tests/unit/ui/brand-assets.test.ts`
- `tests/unit/ui/mockup-tokens.test.ts`
- `tests/unit/ui/tokens-contrast.test.ts`
- `tests/unit/ui/icon-map.test.ts`
- `vitest.config.ts` — picks up the jsdom component tests.

## Implementation Notes

### The token rename that broke seven mockups

The Wave 1.1 rewrite renamed `--color-primary-on` to
`--color-on-primary`. Seven mockups kept the old name. Because an
undefined `var()` resolves to nothing, the declaration it belongs to
was silently dropped — the element inherited whatever it would have
inherited, and the page rendered a button with the wrong text colour.
**No console error, no build error, no failing test.**

The mockups still *looked* fine in a casual glance, so the drift
survived until an audit script compared the two token sets. The fix
was to make it a test: `tests/unit/ui/mockup-tokens.test.ts` now
asserts that every `var(--token)` in every mockup, in the component
library and in the gallery names a token `tokens.css` declares. That
test is the reason the Wave 2 mockups are token-pure by construction
rather than by discipline.

### The emoji → Phosphor migration

The category glyph was an emoji helper duplicated in three pages.
Replacing it with `<CategoryIcon>` meant the shape and the colour
live in one registry. The source-scan assertion in
`tests/unit/report-card-thumbnail-render.test.ts` referenced the old
helper string, so the two assertions were updated to the new contract
(`CategoryIcon` + `slug={ticket.categorySlug}`).

### Brand mark rationale

The mark is a map pin whose negative space forms a check — "reported →
resolved" in one shape. Navy `#0F172A` body, civic blue `#1E40AF`
arc, service green `#16A34A` check, on a 24×24 grid.

## Verification

| Gate | Command | Result |
|------|---------|--------|
| Types | `npx tsc --noEmit` | clean |
| Lint | `npm run lint` | 0 errors (56 warnings, pre-existing) |
| Unit | `npm run test:unit` | 98 files / **1430 passed** |
| Visual | `npm run test:mockups` | 15/15 (pre-Wave-2 count) |
| i18n | `npm run check:i18n` | ok |
| Build | `npm run build` | green |

## Out of Scope

- Any page implementation — Units 003–007.
- A real city seal — a documented swap slot ships instead.
- Native mobile apps.

## Risk Posture

| Risk | Mitigation |
|------|-----------|
| A later wave hand-rolls a component instead of using a primitive | The primitives are exported from one barrel and the token-drift test catches ad-hoc styling that references undefined tokens. |
| Adding a chart library pulls Recharts into every bundle | Charts are `dynamic()`-imported; Phosphor imports are per-icon. |
| The dark theme drifts from the light theme | `tests/unit/admin-theme-tokens.test.ts` asserts the dark block defines no token the light block lacks — the class of bug that once made two admin panels transparent. |
