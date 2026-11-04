---
unit: 002-design-foundation
intent: 009-ui-redesign
status: complete
created: 2026-11-02T18:20:00Z
updated: 2026-11-02T19:10:00Z
---

# Unit 002 — Design Foundation (unit-brief)

## Goal

Build the layer every later wave composes from. Nothing in Waves 2–6
may be implemented until this unit is green: a token, an icon or a
primitive invented inside a page is a token, an icon or a primitive
that will drift.

## Files

### Tokens + global CSS

- `design-artifacts/D-Design-System/01-Visual-Design/tokens.css` —
  rewritten to the locked palette; `--color-accent`, `--shadow-focus`,
  `--icon-size-{sm,md,lg}`, `--border-input`, `--border-focus`; a
  full `.theme-dark` block **and** a `prefers-color-scheme: dark`
  block; `.theme-outdoor` preserved black/white; Bangla leading floor
  1.6.
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

### Chrome

- `components/AppHeader.tsx` — brand mark swap, Phosphor nav icons,
  inline nav, Report CTA, lang/theme/user cluster.

### Library reference

- `components.html` + `gallery.html` rewritten to the new direction.

## Stories

### 002-token-and-global-css-system

**As a** page author
**I want** every colour, type step, radius, shadow and icon size
declared once in `tokens.css`
**So that** two pages can never disagree about what "primary" means.

### 003-phosphor-icon-registry

**As a** page author
**I want** icons resolved from one registry
**So that** a category icon is the same shape on the citizen card, the
dispatcher list and the crew ticket.

### 004-ui-primitive-library

**As a** page author
**I want** a primitive for every recurring UI element
**So that** I compose pages instead of hand-rolling `<button>`s.

### 005-chart-primitives-with-data-tables

**As a** dispatcher or admin reading a trend
**I want** the chart's underlying data reachable without a chart
**So that** I can read exact values and the page survives a
colour-blind reading.

### 006-cityfix-brand-assets

**As a** user landing on CityFix for the first time
**I want** a real mark and wordmark
**So that** the product reads as a civic platform rather than a form.

## Acceptance

- Every primitive has a unit test under `tests/unit/components/` and
  is exported from `components/ui/index.ts`.
- `tests/unit/ui/tokens-contrast.test.ts` — every colour pair clears
  AA across `:root`, `.theme-dark` and `.theme-outdoor`.
- `tests/unit/ui/mockup-tokens.test.ts` — every `var(--token)` in the
  mockups and the component library names a token `tokens.css`
  defines.
- `tests/unit/admin-theme-tokens.test.ts` — the dark block defines no
  token the light block lacks.
- `tests/unit/ui/brand-assets.test.ts` — the brand assets parse and
  carry the expected licence notices.
- `tests/unit/ui/icon-map.test.ts` — every category slug maps to an
  icon and a colour.
- `npm run check:i18n` green · `npm run build` green.
- `npm run test:unit` → 98 files / 1430 tests green.

## Notes

Two runtime dependencies were added, and only two:
`@phosphor-icons/react` (per-icon SSR imports, tree-shaken) and
`recharts` (charts are `dynamic()`-imported so server components stay
server components).

The three prior mockups that used the old `categoryIcon()` emoji
helpers were migrated to `<CategoryIcon slug={ticket.categorySlug} />`.
The source-scan assertion in
`tests/unit/report-card-thumbnail-render.test.ts` was updated to match
the new contract.

## Status

Shipped — commit `b279228` ("feat(design): Wave 1 foundation — AA-verified
token system, global CSS, icon registry").
