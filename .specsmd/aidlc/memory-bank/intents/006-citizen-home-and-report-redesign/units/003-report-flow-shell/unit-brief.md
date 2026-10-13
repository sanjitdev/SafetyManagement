---
intent: 006-citizen-home-and-report-redesign
unit: 003-report-flow-shell
phase: construction
status: complete
priority: must
created: 2026-10-13T18:25:00Z
updated: 2026-10-13T19:35:00Z
completed: 2026-10-13T19:35:00Z
depends_on: [001-token-system-refresh]
enables: [002-home-activity-redesign, 004-report-flow-steps]
---

# Unit 003 — Report Flow Shell & Primitives

## Scope

Build the layout primitives that both `/home` and the 5-step report
flow compose. The shell (sticky top bar + sticky bottom action bar
+ in-card action row on desktop) wraps every step page. Five new
primitives are extracted under `components/ui/`. The `/report/*`
layout is wired so all 5 step pages + the submitted page share it.

## FRs Covered

- FR-3 (Report flow — step progress + consistent shell)
- FR-10 (Layout primitives & shared components — full set)

## Stories

| ID | Title | Priority |
|----|-------|----------|
| S-003.1 | StepIndicator primitive | Must |
| S-003.2 | ReportShell + sticky top/bottom bars | Must |
| S-003.3 | FilterChipGroup primitive (keyboard + ARIA) | Must |
| S-003.4 | ReportCard + StatusPill standardization | Must |

## Implementation Notes

### Files Created

- `components/ui/StepIndicator.tsx` — numbered circles + connecting
  line; collapses to "Step N of 5" text on 375px viewport.
- `components/ui/ReportShell.tsx` — wraps each step page; sticky top
  bar (brand mark, "Submit a report" badge, step indicator, language
  toggle); sticky bottom bar on mobile (Back / Continue); in-card
  action row on desktop.
- `components/ui/FilterChipGroup.tsx` — chip-style toggle, keyboard
  navigable, ARIA `role="radiogroup"`.
- `components/ui/StatusPill.tsx` — already exists in some form;
  standardize visual + ARIA + variants (submitted / routed /
  in-progress / resolved / closed).
- `components/ui/ReportCard.tsx` — list variant + map variant;
  status pill, category + ward, age, ellipsis-truncated note.
- `app/report/layout.tsx` (or equivalent) — wraps all `/report/*`
  routes with `<ReportShell>`.

### Constraint

- All new primitives live under `components/ui/` and are typed
  (no `any`).
- Each primitive has at least one Vitest unit test covering the
  default and one variant state.
- Primitives do not import from app routes (server-only imports
  forbidden).
- No new dependencies. lucide-react icons used where needed.

## Acceptance Criteria

- [ ] All 5 new primitives exist under `components/ui/` and are
      exported as named exports.
- [ ] Each primitive has ≥ 1 Vitest unit test.
- [ ] `/report/*` layout uses `<ReportShell>`; every step route
      renders the same shell.
- [ ] The "Back" button is always reachable without scrolling on
      mobile (sticky bottom).
- [ ] The "Continue" button is disabled until the current step's
      required field is filled; disabled state has 50% opacity
      and `aria-disabled="true"`.
- [ ] Form fields use visible labels (not placeholder-only) and
      inline validation on blur.
- [ ] On a 375px viewport, the step indicator collapses to
      "Step 2 of 5" text only.
- [ ] axe-core shows zero serious or critical issues on each
      `/report/*` page after the unit lands (the unit itself only
      ships the shell; the step pages come in Unit 004 — but the
      shell alone must be accessible).
- [ ] All 287 unit tests + 19 Playwright route specs pass.
- [ ] `npx tsc --noEmit` is clean.

## Verification

- `npx tsc --noEmit && npm run test:unit && npm run test:mockups`
- Manual: open `/report/location` locally; confirm the sticky
  bars appear; resize to 375px and confirm step indicator
  collapses.

## Out of Scope

- No per-step page redesigns (those are Unit 004).
- No changes to the home page (Unit 002).
- No new tokens; if a missing token is needed (e.g.
  `--color-focus-ring`), the construction agent adds it as part
  of Unit 001's token file edit (no new name; an existing name
  repurposed if necessary).
