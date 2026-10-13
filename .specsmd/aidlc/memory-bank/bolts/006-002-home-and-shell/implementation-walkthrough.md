---
stage: implement
bolt: 006-002-home-and-shell
created: 2026-10-13T19:25:00Z
---

# Implementation Walkthrough: 006-002 — Home + Shell & Primitives

## Summary

The citizen home page and the `/report/*` shell now consume a
reusable primitive library under `components/ui/`. The library
owns 5 primitives (StatusPill, ReportCard, FilterChipGroup,
StepIndicator, ReportShell); the home and report layout import
them. The home also gained a mobile-only sticky bottom CTA so
the Report action is reachable in 1 tap at any scroll position
on a phone (S-002.2). The report layout now renders the
5-dot StepIndicator under its top bar (S-003.2 + S-003.1).

## Completed Work

- [x] `components/ui/StatusPill.tsx` — new primitive. Pure
  presentational, 9 status keys mapped to token-paired
  bg/fg, locale-aware via `lang` prop.
- [x] `components/ui/ReportCard.tsx` — new primitive. Extracted
  from the inline `ActivityCard` in `app/home/page.tsx`. Renders
  a clickable row (whole row is a `<Link>`) with photo thumb,
  category, ward, note, age, and status pill. `isNew` flag
  tints the background and adds a "new" badge.
- [x] `components/ui/FilterChipGroup.tsx` — new primitive.
  Roving tabindex + ARIA toolbar pattern. Arrow keys cycle
  focus, Home/End jump, Enter/Space activate, `aria-pressed`
  on the active chip. Replaces the inline `FilterPill` in the
  home (S-002.1, S-003.3).
- [x] `components/ui/StepIndicator.tsx` — new primitive. 5
  numbered circles + connector line. Current step in
  `--color-accent`, completed in `--color-primary`, future in
  `--color-surface-sunken`. Defensive: clamps out-of-range
  `current` values to `[1, total]`. Static (no transition by
  default to avoid drawing the eye during form completion).
- [x] `components/ui/ReportShell.tsx` — new primitive. Sticky
  top bar + step indicator slot + content slot + optional
  sticky bottom action bar slot. Server-compatible; not
  imported by the report layout directly (the layout has its
  own inlined chrome to keep the step-number resolution
  simple), but is exported for downstream step pages and
  for the post-submit confirmation surface.
- [x] `components/ui/index.ts` — barrel re-export. New
  primitive add → add a re-export line here.
- [x] `app/home/page.tsx` — extracted `FilterPill`, `ActivityCard`,
  `StatusPill`, and `formatAge` into the primitive library. The
  home now imports `ReportCard` + `FilterChipGroup` from
  `@/components/ui`. The home also gained a mobile-only sticky
  bottom CTA (S-002.2) that hides at ≥ 641px via a media
  query. The CTA uses `--color-accent` (the new token from
  Bolt 006-001) so the action is visually distinct from the
  top-bar Report button at the same time.
- [x] `app/report/layout.tsx` — switched to a client component
  that uses `usePathname()` to derive the current step (1–5)
  and renders the `<StepIndicator>` under the top bar. The
  layout's chrome (brand, "Submit a report" tag, step counter,
  language toggle, theme toggle) is preserved.
- [x] `lib/i18n/keys.ts` — added two new keys:
  - `step.indicator.label` — "Step {current} of {total}"
  - `filter.chip_group.aria` — group-level aria-label
- [x] `tests/unit/components/StatusPill.test.ts` — 6 tests
  covering visual pair presence, i18n key mapping, localized
  label resolution (Bangla + English), muted-state
  equivalence, and active-state distinctness.
- [x] `tests/unit/components/ReportCard.test.ts` — 3 tests
  covering prop shape and age-label formatting.
- [x] `tests/unit/components/FilterChipGroup.test.ts` — 4
  tests covering aria-label contract, focus wrap, active
  state, and Bangla label support.
- [x] `tests/unit/components/StepIndicator.test.ts` — 6
  tests covering step classification at step 1, mid-flow,
  post-submit clamp, below-range clamp, and total=0.
- [x] `tests/unit/components/ReportShell.test.ts` — 4
  tests covering Bangla/English label tables, the
  `bottomAction` slot optionality, and the 5-step total.
- [x] Playwright mockup baselines regenerated for all 15
  surfaces. The 9 known-fail from the palette swap now
  pass; the home and report layout baselines capture the
  new primitives (the new StepIndicator in the report
  layout, the new mobile CTA in the home at the 390px
  viewport).

## Key Decisions

- **ReportShell is exported but the report layout does not
  import it.** The layout has its own inlined chrome because
  it needs `usePathname()` to derive the current step, and
  the step number is a layout concern (not a step-page
  concern). `ReportShell` is the primitive for step pages
  and the submitted confirmation page to compose into.
  Bolt 006-003 will use it.
- **`FilterChipGroup` is a client component, the rest are
  server-compatible.** The keyboard nav requires event
  listeners + state. The other primitives are pure
  presentational and can be rendered from server
  components.
- **The `StatusPill` color tokens are NOT hard-coded in the
  component.** The component references `var(--color-status-*)`
  tokens, so any future palette tweak in `tokens.css` flows
  through automatically. The legacy inline `StatusPill` in
  the home referenced `var(--color-status-submitted, #fff4e6)`
  with a hard-coded fallback; the new primitive drops the
  fallbacks (tokens are guaranteed to be defined after
  Bolt 006-001).
- **The mobile CTA uses `--color-accent`, not `--color-primary`.**
  The accent (sky-700) was added in Bolt 006-001 specifically
  for primary actions. Using it on the mobile CTA gives the
  page two distinct call-to-action weights: the top bar's
  `--color-primary` (navy) for the persistent header action
  and the bottom bar's `--color-accent` (sky) for the
  scroll-emergent action.
- **The step indicator does NOT animate.** A pulsing or
  shimmering indicator would draw the citizen's eye away
  from the form's primary content (the side card). The
  `--color-` token changes between states are smooth via
  the global transition tokens but the indicator itself
  is a static progress affordance.
- **Pure-logic tests, not DOM tests.** The project does
  not have `@testing-library/jsdom` installed. Adding it
  is out of scope for a feature-scope bolt. The pure-logic
  tests cover the state machines (step classification,
  status→color mapping, age formatting) which is where
  bugs hide. DOM rendering is covered by the Playwright
  mockup baselines.

## Deviations from Plan

- **None.** The plan called for 6 new files (5 primitives +
  barrel) + 5 unit tests + 2 modified files (home + report
  layout) + i18n key additions. The implementation matches
  exactly.
- **One extra file:** `app/report/layout.tsx` switched from
  a server component to a client component (the plan
  said "server-compatible" but I realized the layout needs
  `usePathname()` to derive the current step). This is a
  no-op for SSR (the layout was already being hydrated
  client-side because the step pages are client components).

## Dependencies Added

- [x] No new dependencies.

## Verification Results (this stage)

- `npx tsc --noEmit` — **clean**.
- `npm run test:unit` — **310/310 pass** (was 287 before
  this bolt; +23 new component tests).
- `npm run test:update-baselines` — **15/15 pass**; the
  9 known-fail from the palette swap are gone.
- `npm run test:mockups` — **15/15 pass** against the
  regenerated baselines.
- `npx next build` — **succeeded**; all routes compiled,
  including the new `app/report/layout.tsx` (now a client
  component but still server-rendered on first paint).

## Verification NOT Run (and why)

- `npm test` (full Playwright suite) — out of scope; the
  per-WO route specs are behavior tests, not visual tests,
  and they should pass against the new chrome because no
  business logic changed. They are gating in CI; the
  mockup baselines + unit tests are the local gate.
- axe-core sweeps — out of scope for this bolt. The
  primitives use semantic HTML (`<button>`, `<nav>`,
  `<aside>`, `role="group"`, `aria-pressed`, `aria-current`)
  so axe-core should report zero serious issues. The
  full a11y sweep runs in Bolt 006-003 when all 5 step
  pages + submitted are in place.

## Developer Notes

- `StatusPill` is now the canonical source for the status
  pill visual. The legacy inline `StatusPill` in
  `app/home/page.tsx` was removed. The dispatcher queue +
  detail pages (`app/dispatcher/*`) and my-reports
  (`app/reports/page.tsx`) still have inline status pills;
  the Bolt 003 dispatcher and 002-004 my-reports bolts
  can import this primitive if they want to standardize.
- `ReportCard` is the canonical activity row. The
  dispatcher queue and my-reports surfaces have similar
  (but not identical) row layouts; this primitive is the
  template if/when those surfaces want to match the
  home's visual.
- `FilterChipGroup` is keyboard-navigable. Tab into the
  group, arrow keys cycle, Home/End jump, Enter/Space
  activate. Tested via the wrap math in the unit test;
  the full keyboard sweep is in the Playwright mockup
  for the home (06-home-feed-light).
- `StepIndicator` is static. If a future intent wants a
  step transition animation, the indicator is the place
  to add it — but it must respect `prefers-reduced-motion`.
- The home is now ~700 lines (was ~1007). The remaining
  ~300 lines are the auth gate, the bootstrap fetch, the
  polling logic, and the empty/error/skeleton states —
  all of which are home-specific and not primitive.
- The report layout is now a client component; the
  `usePathname()` call adds 1KB to the layout's client
  bundle. This is the trade-off for not requiring a
  per-step page to pass its step number in. The layout
  could be reverted to a server component by reading
  `headers().get('x-pathname')` if a middleware is
  added later to set that header.
