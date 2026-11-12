---
id: 009-005-dispatcher-console
unit: 005-dispatcher-console
intent: 009-ui-redesign
type: simple-construction-bolt
status: in-progress
stories:
  - 011-dispatcher-mockups
  - 012-dispatcher-page-implementation
created: '2026-11-12T23:10:00Z'
started: '2026-11-12T23:10:00Z'
updated: '2026-11-12T23:10:00Z'
current_stage: plan
stages_completed: []
requires_bolts:
  - 009-004-citizen-surfaces
enables_bolts:
  - 009-006-crew-field-app
requires_units: []
blocks: false
complexity:
  avg_complexity: 3
  avg_uncertainty: 3
  max_dependencies: 1
  testing_scope: 4
  estimated_files: 24
---

# Bolt 009-005 — Dispatcher Console

## Purpose

Redesign the dispatcher's cockpit — the densest working surface in the
product. Six routes, a three-region triage layout, a live ops board and
a charts page, running on a wall display in a municipal office.

## Stories

| Story ID | Title | FR | State |
|----------|-------|-----|-------|
| 011-dispatcher-mockups | Dispatcher mockups | FR-5 | pending |
| 012-dispatcher-page-implementation | Dispatcher page implementation | FR-5 | pending |

## Unit brief

`intents/009-ui-redesign/units/005-dispatcher-console/unit-brief.md`

## Scope

### Mockups (approval gate)

| Mockup | Surface | Pattern |
|--------|---------|---------|
| `17-triage-queue.html` | `/dispatcher` | 3-region: filter rail / ticket list / detail |
| `18-dispatcher-ticket-detail.html` | `/dispatcher/tickets/[id]` | Sticky action bar, crew picker, internal notes |
| `19-dispatcher-map.html` | `/dispatcher/map` | Full-bleed map + floating controls |
| `20-dispatcher-monitor.html` | `/dispatcher/monitor` | Dark ops board (`.theme-dark`) |
| `21-dispatcher-performance.html` | `/dispatcher/performance` | Trend line + category bars + SLA bullet |

### Implementation

`/dispatcher`, `/dispatcher/tickets/[id]`, `/dispatcher/map`,
`/dispatcher/dedup`, `/dispatcher/monitor`, `/dispatcher/performance`.

## Risk Posture

| Risk | Mitigation |
|------|-----------|
| The 3-region triage layout does not exist today | The `dispatcher/page.tsx` header comment still advertises filter rail / queue list / detail, but the page is now a dashboard with no detail pane. Restoring it is the deliverable, not an assumption. |
| No SLA countdown exists anywhere | `SlaPolicy` is seeded but consulted on no dispatcher surface; `components/ui/charts/SlaBullet.tsx` has 0 call sites. The chip must be BUILT. |
| The crew picker is a raw `<select>` | Story 012 requires a searchable combobox. It must be BUILT. |
| Charts encode series by hue alone | `ChartFrame` rule #2 already forbids this; the route spec asserts a second, non-hue channel on every series. |
| Filter state is lost on selection | The triage spec asserts the ward/status filters still hold after the detail pane updates in place. |
| Two pages shadow `components/ui/StatusPill` | The duplicate local implementations are deleted, not reconciled. |

## Notes

`05-daily-queue-dashboard.html` is the existing desktop reference for
the 3-region layout. `17-triage-queue` supersedes it; `05` is retired
rather than kept in parallel.

Wave 4 needs a NEW `mockups/dispatcher-surfaces.css` —
`citizen-surfaces.css` carries citizen topbar/nav/`.ticket-id`
(citizen-only id) semantics that must not be reused for dispatcher
internal ids.
