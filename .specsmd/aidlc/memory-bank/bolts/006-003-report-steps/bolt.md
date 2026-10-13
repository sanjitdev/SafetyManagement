---
id: 006-003-report-steps
unit: 004-report-flow-steps
intent: 006-citizen-home-and-report-redesign
type: ddd-construction-bolt
status: complete
stories:
  - S-004.1
  - S-004.2
  - S-004.3
  - S-004.4
  - S-004.5
  - S-004.6
created: 2026-10-13T18:40:00Z
requires_bolts:
  - 006-001-token-system-refresh
  - 006-002-home-and-shell
enables_bolts: []
complexity: large
estimated_files: 6
---

# Bolt 006-003 — Report Flow Steps (5 steps + submitted)

## Purpose

Update each of the 5 step pages (`/report/location`, `/photo`,
`/category`, `/note`, `/summary`) and the post-submit
confirmation (`/report/[id]/submitted`) to the new visual +
interaction spec. Each page composes `<ReportShell>` from Bolt
006-002.

## Stories

| ID | Title | FR |
|----|-------|----|
| S-004.1 | Location step redesign | FR-4 |
| S-004.2 | Photo step redesign | FR-5 |
| S-004.3 | Category step redesign | FR-6 |
| S-004.4 | Note step redesign | FR-7 |
| S-004.5 | Summary step redesign | FR-8 |
| S-004.6 | Submitted confirmation redesign | FR-9 |

## Files Modified

- `app/report/location/page.tsx` — restructure side card (FR-4).
- `app/report/photo/page.tsx` — primary photo area + thumbnail
  strip + counter.
- `app/report/category/page.tsx` — 2-column grid + search
  filter.
- `app/report/note/page.tsx` — labeled textarea + char counter.
- `app/report/summary/page.tsx` — 2-column confirmation + Edit
  buttons + Submit.
- `app/report/[id]/submitted/page.tsx` — success surface.

## Files Updated (mockup baselines)

- `tests-mockups/baselines/01-mockups.spec.ts/` — every
  redesigned `/report/*` page regenerates. The construction
  agent surfaces the diff in the PR description.

## Implementation Notes

- Form state preservation across step changes is existing
  behavior; the redesign does not change it.
- The 5-step shape is preserved (Checkpoint 2 default).
- Bangla-first: every new English string has a Bangla
  equivalent in `lib/i18n/keys.ts`.
- The photo step's CTA copy is "Add photo" (Checkpoint 2
  default).
- The submitted page's "What happens next" list is Bangla
  only; the English toggle reveals the same list in English
  when active (Checkpoint 2 default).
- No new icons beyond lucide-react; if a missing icon is
  needed, the construction agent picks the closest match and
  documents the choice in the bolt completion notes.
- Step transition is client-side; no full-page reload.
- `prefers-reduced-motion: reduce` collapses every transition
  to instant (or ≤ 50ms).

## Verification

- `npx tsc --noEmit && npm run test:unit && npm run test:mockups`
- Manual: complete a full report end-to-end locally; confirm
  every step's primary action is reachable in 1 tap; resize
  the window to 375 / 768 / 1024 / 1440 and confirm layouts
  hold.
- axe-core on every redesigned `/report/*` page shows zero
  serious or critical issues.

## Out of Scope

- No collapse of the 5-step shape (Checkpoint 2 default).
- No changes to the data layer.
- No new dependencies.