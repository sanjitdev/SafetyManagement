---
unit: 005-dispatcher-console
intent: 009-ui-redesign
status: not-started
created: 2026-11-02T18:35:00Z
updated: 2026-11-02T18:35:00Z
---

# Unit 005 — Dispatcher Console (unit-brief)

## Goal

Redesign the dispatcher's cockpit. This is the densest working surface
in the product — six routes, a three-region layout, a live ops board
and a charts page — and it runs on a wall display in a municipal
office.

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

## Files

- `design-artifacts/D-Design-System/01-Visual-Design/mockups/17-triage-queue.html` (new)
- `design-artifacts/D-Design-System/01-Visual-Design/mockups/18-dispatcher-ticket-detail.html` (new)
- `design-artifacts/D-Design-System/01-Visual-Design/mockups/19-dispatcher-map.html` (new)
- `design-artifacts/D-Design-System/01-Visual-Design/mockups/20-dispatcher-monitor.html` (new)
- `design-artifacts/D-Design-System/01-Visual-Design/mockups/21-dispatcher-performance.html` (new)
- `design-artifacts/D-Design-System/01-Visual-Design/gallery.html`
- `tests/01-mockups.spec.ts` + 10 new baselines (5 × 2 viewports;
  `20-dispatcher-monitor` also gets a `.theme-dark` variant if the
  switch is a runtime toggle rather than a separate route)
- `app/dispatcher/page.tsx`, `app/dispatcher/tickets/[id]/page.tsx`,
  `app/dispatcher/map/page.tsx`, `app/dispatcher/dedup/page.tsx`,
  `app/dispatcher/monitor/page.tsx`, `app/dispatcher/performance/page.tsx`
- `tests/34-ui-redesign-dispatcher.spec.ts`

## Stories

### 011-dispatcher-mockups

**As a** dispatcher
**I want** the console mockups to show the real density of my working
day
**So that** I can approve a layout that fits the work, not a layout
that fits a portfolio.

### 012-dispatcher-page-implementation

**As a** dispatcher working the triage queue
**I want** the filter rail, the list and the detail to stay in sync as
I work
**So that** I never lose my place while a phone call comes in.

**Given** I am filtering the queue by ward and status
**When** I select a ticket
**Then** the detail pane updates in place without a full navigation
**And** the SLA countdown chip shows the remaining time against target.

**Given** I am on the performance page
**When** I look at the trend chart
**Then** every series is labelled directly
**And** the underlying figures are reachable in a data table.

## Acceptance

- The five mockups are approved, token-pure and wired into the gallery
  + baseline spec; 10 new committed baselines.
- The 3-region layout, the sticky action bar, the SLA countdown chip
  and the searchable crew-picker combobox all survive the redesign.
- The trend + category charts are labelled, tabular and paired with a
  visible sortable data table.
- No series is encoded by hue alone.
- Route spec + baselines committed.

### Exit gate

The Unit 003 exit gate, plus `tests/34-ui-redesign-dispatcher.spec.ts`
green and `tests/29-admin-dark-theme.spec.ts` green (the monitor board
is the first `.theme-dark` surface in the redesign).

## Status

Not started. The Wave 2 mockups (`08`–`12`) must be approved first.

## Notes

`05-daily-queue-dashboard.html` is the existing desktop reference for
the 3-region layout. `17-triage-queue` supersedes it; `05` is retired
rather than kept in parallel.
