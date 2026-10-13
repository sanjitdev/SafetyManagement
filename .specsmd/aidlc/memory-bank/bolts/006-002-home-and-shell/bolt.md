---
id: 006-002-home-and-shell
unit: 002-home-activity-redesign
intent: 006-citizen-home-and-report-redesign
type: ddd-construction-bolt
status: complete
current_stage: null
stages_completed:
  - name: plan
    completed: 2026-10-13T19:15:00Z
    artifact: implementation-plan.md
  - name: implement
    completed: 2026-10-13T19:25:00Z
    artifact: implementation-walkthrough.md
  - name: test
    completed: 2026-10-13T19:30:00Z
    artifact: test-walkthrough.md
started: 2026-10-13T19:15:00Z
completed: 2026-10-13T19:35:00Z
stories:
  - S-002.1
  - S-002.2
  - S-002.3
  - S-003.1
  - S-003.2
  - S-003.3
  - S-003.4
created: 2026-10-13T18:40:00Z
requires_bolts:
  - 006-001-token-system-refresh
enables_bolts:
  - 006-003-report-steps
complexity: medium
estimated_files: 12
---

# Bolt 006-002 — Home Redesign + Report Flow Shell & Primitives

## Purpose

Land the home page redesign AND the layout primitives
(StepIndicator, ReportShell, FilterChipGroup, ReportCard,
StatusPill) AND the `/report/*` layout shell in one bolt. The
primitives are exported from `components/ui/` and consumed by
both this bolt (home) and Bolt 006-003 (report steps).

This is the **single biggest bolt** of the intent because the
home redesign depends on the new primitives, and the primitives
have nothing else to anchor against if they land without the
home. The two Units (002 + 003) ship together.

## Stories

### From Unit 002 (home)
| ID | Title |
|----|-------|
| S-002.1 | Side-panel hierarchy + Filter chip group |
| S-002.2 | Sticky CTA + floating map controls |
| S-002.3 | Pin selected/unselected states |

### From Unit 003 (primitives + shell)
| ID | Title |
|----|-------|
| S-003.1 | StepIndicator primitive |
| S-003.2 | ReportShell + sticky top/bottom bars |
| S-003.3 | FilterChipGroup primitive (keyboard + ARIA) |
| S-003.4 | ReportCard + StatusPill standardization |

## Files Created

- `components/ui/StepIndicator.tsx`
- `components/ui/ReportShell.tsx`
- `components/ui/FilterChipGroup.tsx`
- `components/ui/StatusPill.tsx` (standardized)
- `components/ui/ReportCard.tsx`
- `app/report/layout.tsx` (wraps `/report/*` in `<ReportShell>`)

## Files Modified

- `app/home/page.tsx` (or equivalent) — use the new
  `<ReportCard>` + `<FilterChipGroup>` primitives.
- `app/home/_components/` — refresh the map pin component.
- `components/map/MapControls.tsx` — move to floating action
  cluster, 48dp touch targets.
- `app/home/_components/CtaButton.tsx` — pin to bottom on
  mobile.
- `components/ui/StatusPill.tsx` — standardize (may already exist
  in some form).

## Tests Added

- `tests/unit/components/StepIndicator.test.tsx`
- `tests/unit/components/ReportShell.test.tsx`
- `tests/unit/components/FilterChipGroup.test.tsx`
- `tests/unit/components/StatusPill.test.tsx`
- `tests/unit/components/ReportCard.test.tsx`

## Files Updated (mockup baselines)

- `tests-mockups/baselines/01-mockups.spec.ts/` — every visual
  surface that references the old palette regenerates. The
  construction agent surfaces the diff in the PR description.

## Implementation Notes

- The five primitives are pure presentational components; they
  take props and emit JSX. No data fetching, no server-side
  imports.
- The shell layout wraps `/report/*` but does NOT modify the
  step pages themselves — those come in Bolt 006-003. The shell
  is visible but inert (no step pages have content yet) until
  Bolt 006-003 lands.

## Verification

- `npx tsc --noEmit && npm run test:unit && npm run test:mockups`
- Manual: open `/home` locally; click each pin; click each
  filter chip; resize to 375 / 768 / 1024 / 1440.
- Manual: open `/report/location` locally (the shell is visible
  but the step content is the v1 placeholder); confirm sticky
  bars appear; resize to 375px and confirm step indicator
  collapses.
- axe-core on `/home` shows zero serious or critical issues.

## Out of Scope

- No per-step page redesigns (those are Bolt 006-003).
- No changes to dispatcher / crew / admin surfaces.
- No new API routes; the home consumes existing
  `GET /api/v1/tickets`.
- The `/report/*` step pages keep their v1 content; only the
  shell (top + bottom bars, step indicator placeholder) is
  visible until Bolt 006-003 lands.