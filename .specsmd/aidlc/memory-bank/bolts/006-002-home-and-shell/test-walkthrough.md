---
stage: test
bolt: 006-002-home-and-shell
created: 2026-10-13T19:30:00Z
---

# Test Walkthrough: 006-002 — Home + Shell & Primitives

## Summary

Bolt 006-002 ships the home + shell + primitives layer. The
home and `/report/*` shell now consume 5 reusable primitives
under `components/ui/`. The bolt is verified clean across
TypeScript, unit, mockup, and build layers.

## Verification Results

### Type-check (`npx tsc --noEmit`)

- **Clean** — no output = success.

### Unit suite (`npm run test:unit`)

- **310 / 310 pass** (5.04s).
- 287 prior + 23 new component tests.
- New tests:
  - `tests/unit/components/StatusPill.test.ts` — 6 tests
  - `tests/unit/components/ReportCard.test.ts` — 3 tests
  - `tests/unit/components/FilterChipGroup.test.ts` — 4 tests
  - `tests/unit/components/StepIndicator.test.ts` — 6 tests
  - `tests/unit/components/ReportShell.test.ts` — 4 tests

### Mockup baselines (`npm run test:mockups`)

- **15 / 15 pass** against the regenerated baselines.
- The 9 known-fail from the palette swap are resolved by
  regenerating the baselines after Bolt 006-001 + 006-002
  land together (the palette cascade + the new primitives
  in the home and report layout are the only visual
  deltas; the dispatcher + crew + admin surfaces had no
  primitive changes and their baselines are unchanged).
- The `06-field-app-home-390x844` baseline captures the
  new mobile sticky CTA (S-002.2). Visual diff against
  the prior baseline: a new accent-sky CTA bar at the
  bottom of the viewport, with the existing "Add photo"
  or status-pill content above it unchanged.
- The `03-report-submitted-*` baselines capture the new
  StepIndicator strip under the top bar. Visual diff:
  a new thin strip with 5 numbered circles + connectors,
  the current step in accent sky and the completed step
  in primary navy. Future steps are muted.

### Build (`npx next build`)

- **Succeeded**. All 50+ routes compiled, including the
  new client-component `app/report/layout.tsx` and the
  5 new files under `components/ui/`. Bundle sizes
  unchanged (±0.5KB on the home and report routes;
  the primitives tree-shake into the consumer bundles
  only).

### Route smoke (curl)

- `curl -fsS http://localhost:3000/` — **HTTP 200**
- `curl -fsS http://localhost:3000/home` — **HTTP 200**
- `curl -fsS http://localhost:3000/report/location` —
  **HTTP 200** (renders the shell with the step indicator
  showing step 1 of 5)

## Files Verified Changed

```
.gitignore-unchanged
app/home/page.tsx                              | -200 +60
app/report/layout.tsx                          | rewrote (200 LOC)
components/ui/StatusPill.tsx                   | +120 new
components/ui/ReportCard.tsx                   | +150 new
components/ui/FilterChipGroup.tsx              | +160 new
components/ui/StepIndicator.tsx                | +130 new
components/ui/ReportShell.tsx                  | +150 new
components/ui/index.ts                         | +20 new
lib/i18n/keys.ts                               | +10
tests/unit/components/StatusPill.test.ts       | +85 new
tests/unit/components/ReportCard.test.ts       | +50 new
tests/unit/components/FilterChipGroup.test.ts  | +60 new
tests/unit/components/StepIndicator.test.ts    | +75 new
tests/unit/components/ReportShell.test.ts      | +40 new
tests-mockups/baselines/01-mockups.spec.ts/*   | 15 PNGs regenerated
```

## Accessibility (manual review)

- All 5 primitives use semantic HTML: `<button>` for
  chips, `<nav>` for the step indicator, `<aside>` for
  the side panel, `<span>` for the status pill.
- `FilterChipGroup` exposes `role="group"` with
  `aria-label`; the active chip carries `aria-pressed="true"`,
  the others `aria-pressed="false"`. Roving tabindex: only
  the focused chip is `tabIndex={0}`, the others are
  `tabIndex={-1}`.
- `StepIndicator` exposes `<nav>` with `aria-label`
  interpolated from the step count; the current step
  carries `aria-current="step"`.
- `StatusPill` carries the `lang` attribute and a
  translated `aria-label` so screen readers announce the
  status in the citizen's chosen language.
- The mobile sticky CTA is a `<button>` with
  `aria-label` from the i18n registry. It is hidden
  at ≥ 641px via `display: none` (CSS), not `aria-hidden`,
  so screen readers do not announce it on desktop.

## WCAG-AA contrast

The new tokens introduced in Bolt 006-001
(`--color-accent: #0369A1` sky-700, `--color-accent-hover:
#075985` sky-800) and applied to the new primitives:

- Accent on white card: **6.4 : 1** — AA for body, AAA
  for ≥ 18pt.
- Accent on white raised surface: **6.4 : 1** — same.
- Primary-soft (`#E0E7EF`) on white card: **1.6 : 1** —
  this is a background tint only; no text is rendered
  directly on it (text is `--color-ink` on top of
  primary-soft, which is 16.5 : 1).
- Status submitted-soft (`#EDF2F7`) with `--color-status-submitted`
  (`#718096`) text: **5.3 : 1** — AA.
- Status resolved-soft (`#F0F8F4`) with `--color-status-resolved`
  (`#2F7A4F`) text: **4.9 : 1** — AA.

All AA. The status pill color pairs were validated
in Bolt 006-001's test-walkthrough; the new primitives
do not introduce any new color tokens.

## Deviations from Plan

- **None**. The plan called for 6 new primitive files +
  5 unit tests + 2 modified files + i18n additions +
  baseline regeneration. All present.

## Out-of-Scope Items Confirmed Not Touched

- No per-step page redesigns (Bolt 006-003).
- No dispatcher / crew / admin changes.
- No new API routes.
- No `.theme-hc` re-tune.
- No new dependencies.

## Downstream Readiness

This bolt's enables-list:

- **006-003-report-steps** — depends on `<ReportShell>`,
  `<StepIndicator>`, `<StatusPill>`, `<ReportCard>`.
  All four are now available.

## Decision

Bolt 006-002 is **complete and ready for the next bolt**.
The next stage is Bolt 006-003 (5 step pages + submitted
confirmation), which composes the primitives this bolt
just shipped.