---
story: 011-dispatcher-mockups
unit: 005-dispatcher-console
intent: 009-ui-redesign
status: draft
created: 2026-11-02T18:35:00Z
updated: 2026-11-02T18:35:00Z
implemented: false
---

# Story 011 — Dispatcher Mockups

## User Story

**As a** dispatcher
**I want** the console mockups to show the real density of my working
day
**So that** I can approve a layout that fits the work, not a layout
that fits a portfolio.

## Acceptance Criteria

- **Given** the citizen mockups are approved
- **When** I open `gallery.html`
- **Then** I see 21 mockups

- **And** the 5 mockups exist:
  `17-triage-queue.html`, `18-dispatcher-ticket-detail.html`,
  `19-dispatcher-map.html`, `20-dispatcher-monitor.html`,
  `21-dispatcher-performance.html`

- **And** `20-dispatcher-monitor.html` renders in the dark theme
  (`.theme-dark`) — the ops board runs on a wall display
- **And** each mockup references only `var(--color-*)` tokens declared
  in `tokens.css`
- **And** each uses inline SVG icons — no emoji
- **And** each copy is Bangla-first
- **And** `tests/01-mockups.spec.ts` captures all five at 1440×900 and
  1024×768
- **And** 10 committed baselines exist
- **And** `npm run test:mockups` is green

## BDD Scenarios

### Scenario 1: The triage queue is three regions

```gherkin
Given mockups/17-triage-queue.html
When I open it
Then I see a filter rail on the left
  And a ticket list in the middle
  And a detail pane on the right
```

### Scenario 2: The performance mockup pairs every chart with data

```gherkin
Given mockups/21-dispatcher-performance.html
When I open it
Then I see a trend chart with directly-labelled series
  And I see a category bar chart sorted descending
  And every chart has a reachable data table
```

## Out of Scope

- The page implementation — Story 012.

## Linked Files

- `design-artifacts/D-Design-System/01-Visual-Design/mockups/17-triage-queue.html`
- `design-artifacts/D-Design-System/01-Visual-Design/mockups/18-dispatcher-ticket-detail.html`
- `design-artifacts/D-Design-System/01-Visual-Design/mockups/19-dispatcher-map.html`
- `design-artifacts/D-Design-System/01-Visual-Design/mockups/20-dispatcher-monitor.html`
- `design-artifacts/D-Design-System/01-Visual-Design/mockups/21-dispatcher-performance.html`
- `tests/01-mockups.spec.ts`

## Status

Draft.
