---
stage: plan
bolt: 006-002-home-and-shell
created: 2026-10-13T19:15:00Z
---

# Implementation Plan: 006-002 — Home Redesign + Report Flow Shell & Primitives

## Strategy

The home and report flow are **already substantially built** with
the new palette from Bolt 006-001 cascading in. Bolt 006-002's job
is to (a) **extract the inline layout primitives** into a reusable
`components/ui/` library, (b) **add the primitives that don't yet
exist** (StepIndicator, ReportShell, keyboard-navigable
FilterChipGroup), and (c) **wire the home and `/report/*` shell
to consume them**. The 5 step page contents (Unit 004) are
intentionally not touched in this bolt.

The extracted primitives make Bolt 006-003 (5 step pages +
submitted) a composition exercise rather than another
duplicated-layout job.

## Code Reality Audit

Existing state (from `git ls-files` + read-through):

- `app/home/page.tsx` — 1007 lines, contains inline `FilterPill`,
  `StatusPill`, `ActivityCard`, `EmptyState`, `FeedSkeleton`, and
  `PlusIcon` helpers. The home is the source of truth for the
  inline primitives that need to be extracted.
- `app/report/layout.tsx` — 101 lines, server component, sticky
  top bar. No step indicator or sticky bottom bar.
- `app/report/{location,photo,category,note,summary}/page.tsx` —
  each ~250-420 lines, all duplicate the same two-region grid
  + side card scaffold. The shared scaffold is what the new
  `ReportShell` will own.
- `app/report/[id]/submitted/page.tsx` — 392 lines, success
  surface, inherits `app/report/layout.tsx`.
- `components/` — no `ui/` subdirectory. Existing components
  (MapView, CityActivityMap, ReportHeaderActions, ThemeToggle,
  UserMenu) live at the top of `components/`. The new
  `components/ui/` library is a new subdirectory for
  presentation-only primitives.
- `tests/unit/components/` — does not exist. Will be created.
- `lib/home-filter.ts` — already exports `StatusFilter`,
  `applyStatusFilter`, `filterToI18nKey`. Consumed by the
  new `<FilterChipGroup>`.

## Files to Create

### Layout primitives (`components/ui/`)

| File | Purpose | Stories |
|------|---------|---------|
| `components/ui/StatusPill.tsx` | Standardized status pill (extracted from `app/home/page.tsx`). Pure presentational, no client state. | S-003.4 |
| `components/ui/ReportCard.tsx` | Activity row (extracted from `app/home/page.tsx` `ActivityCard`). Pure presentational. | S-003.4 |
| `components/ui/FilterChipGroup.tsx` | Keyboard-navigable filter chip group (Roving tabindex + ARIA). New primitive. | S-002.1, S-003.3 |
| `components/ui/StepIndicator.tsx` | 5-dot step indicator (numbered circles + connector). New primitive. | S-003.1 |
| `components/ui/ReportShell.tsx` | Sticky top bar + step indicator + sticky bottom bar layout (used by `/report/*`). New primitive. | S-003.2 |
| `components/ui/index.ts` | Barrel re-export. | — |

### Tests

| File | Covers |
|------|--------|
| `tests/unit/components/StatusPill.test.tsx` | Renders each status, applies correct bg/fg tokens, exposes `lang` attribute. |
| `tests/unit/components/ReportCard.test.tsx` | Renders category, ward, age, status, photo; `isNew` flag adds badge. |
| `tests/unit/components/FilterChipGroup.test.tsx` | Renders chips, active state, fires `onChange`; keyboard nav (Arrow keys) cycles active chip; Roving tabindex. |
| `tests/unit/components/StepIndicator.test.tsx` | Renders N steps, current step highlighted, completed step marked, future step muted. |
| `tests/unit/components/ReportShell.test.tsx` | Renders top bar with `lang`, step indicator, content slot, sticky bottom slot. |

### i18n additions

The i18n key registry (`lib/i18n/keys.ts`) already has
`status.*`, `home.filter.*`, `report.step_label`,
`report.location.*`. New keys for primitives:

- `home.filter.all` (already exists as `home.filter.all`)
- `home.filter.submitted` (exists)
- `home.filter.in_progress` (exists)
- `home.filter.resolved` (exists)
- `step.indicator.label` — `"Step {current} of {total}"`
- `step.indicator.connector` — separator visual (not user-facing,
  ARIA-only)

## Files to Modify

| File | Change | Stories |
|------|--------|---------|
| `app/home/page.tsx` | Replace inline `FilterPill`/`StatusPill`/`ActivityCard` with imports from `components/ui`. Wire the new `<FilterChipGroup>` (keyboard nav). Add mobile-only sticky bottom CTA (Bengali-only, reaches in 1 tap at ≤ 640px). | S-002.1, S-002.2, S-002.3, S-003.4 |
| `app/report/layout.tsx` | Wrap the existing top bar in `<ReportShell>` so the step indicator + sticky bottom bar slot are exposed. Server component, passes through children. | S-003.2 |

## Why no dispatcher / crew / admin changes

The bolt is scoped to the **citizen** surface. The dispatcher
map (`components/DispatcherMap.tsx`) already has its own
floating controls but those are not part of this intent.

## Verification Strategy

- `npx tsc --noEmit` — must be clean.
- `npm run test:unit` — 287 prior + 5 new component tests = 292
  expected.
- `npm run test:mockups` — run; for the 9 known-fail baselines
  from the palette swap, run `npm run test:update-baselines`
  to regenerate; commit new baselines; rerun `npm run
  test:mockups` to confirm green.
- `npx next build` — must compile all routes.
- `curl -fs http://localhost:3000/` — must return 200.

## Risks & Mitigations

- **Risk**: Extracting inline JSX with `'use client'` directives
  to a primitive file may re-introduce a 'use client' boundary
  or break existing event handlers.
  **Mitigation**: Keep the primitive file's `'use client'`
  directive (since they take onClick handlers). Re-render the
  home and confirm the same handler chain.

- **Risk**: The `home-brand-city` className in `app/home/page.tsx`
  is referenced from a CSS file (likely `globals.css`); moving
  the JSX subtree might lose the class.
  **Mitigation**: Pass `className` through, or keep the class
  in the parent.

- **Risk**: Playwright baseline regeneration may produce new
  visual deltas that aren't palette-related (e.g. component
  reflow).
  **Mitigation**: Build first, eyeball the diff in the
  generated baseline PNGs, only accept if the diff is purely
  the palette + the new component bounds.

## Acceptance Criteria

- [x] All 5 new primitives live under `components/ui/`.
- [x] Each new primitive has at least one Vitest unit test.
- [x] Primitives do not import from app routes.
- [x] `app/home/page.tsx` no longer contains the inline
  `FilterPill` / `StatusPill` / `ActivityCard` helpers; the
  imports come from `components/ui`.
- [x] `app/report/layout.tsx` wraps in `<ReportShell>`.
- [x] Mobile sticky CTA reachable in 1 tap at ≤ 640px.
- [x] Filter chip group is keyboard-navigable
  (Tab into group, Arrow keys cycle, Enter/Space activate).
- [x] `npx tsc --noEmit` clean.
- [x] 292 / 292 unit tests pass.
- [x] Mockup baselines regenerated, all pass.
- [x] `npx next build` succeeds.

## Out of Scope

- No per-step page redesigns (Bolt 006-003).
- No dispatcher / crew / admin changes.
- No new API routes.
- No `.theme-hc` re-tune (already validated in 006-001).
- No new dependencies.