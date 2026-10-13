---
id: 006-001-token-system-refresh
unit: 001-token-system-refresh
intent: 006-citizen-home-and-report-redesign
type: simple-construction-bolt
status: complete
current_stage: null
stages_completed:
  - name: plan
    completed: 2026-10-13T18:45:00Z
    artifact: implementation-plan.md
  - name: implement
    completed: 2026-10-13T18:55:00Z
    artifact: implementation-walkthrough.md
  - name: test
    completed: 2026-10-13T19:05:00Z
    artifact: test-walkthrough.md
started: 2026-10-13T18:45:00Z
completed: 2026-10-13T19:10:00Z
stories:
  - S-001.1
created: 2026-10-13T18:40:00Z
requires_bolts: []
enables_bolts:
  - 006-002-home-and-shell
  - 006-003-report-steps
complexity: small
estimated_files: 1
---

# Bolt 006-001 — Token System Refresh

## Purpose

Land the new civic-service palette (slate-900 navy + sky-700
accent) by updating the hex values in `tokens.css`. This is the
**foundation bolt**: every other bolt in this intent depends on
the new tokens being live.

## Stories

| ID | Title |
|----|-------|
| S-001.1 | Token values updated to new palette |

## Files Changed

- `design-artifacts/D-Design-System/01-Visual-Design/tokens.css`
  — hex values only; no name changes; no structural changes.

## Implementation Notes

- The new palette values are listed in the Unit 001 brief and the
  FR-1 spec.
- If a color token name in the spec doesn't exist in
  `tokens.css`, the construction agent adds it under `:root`.
  No renames.
- `.theme-hc` overrides may need a small re-tune to maintain
  WCAG-AA contrast; only the override values change, never the
  base names.

## Verification

- `npx tsc --noEmit && npm run test:unit && npm run test:mockups`
  (the test:mockups run will show baseline failures by design —
  the construction agent regenerates them in Bolt 006-002)
- Visual: open `/home` and one `/report/*` step locally; confirm
  the new palette renders.
- axe-core on `/home` (light + `.theme-hc`) confirms WCAG-AA
  contrast.

## Out of Scope

- No new tokens beyond what's listed (warning/success are added
  in Unit 003 if needed; this bolt doesn't ship them).
- No per-component code changes.
- No Playwright baseline regeneration (that's Bolt 006-002's job;
  this bolt ships the tokens and lets the baselines fail
  knowingly).