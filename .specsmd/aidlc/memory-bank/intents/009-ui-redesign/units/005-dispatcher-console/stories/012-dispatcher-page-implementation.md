---
story: 012-dispatcher-page-implementation
unit: 005-dispatcher-console
intent: 009-ui-redesign
status: draft
created: 2026-11-02T18:35:00Z
updated: 2026-11-02T18:35:00Z
implemented: false
---

# Story 012 — Dispatcher Page Implementation

## User Story

**As a** dispatcher working the triage queue
**I want** the filter rail, the list and the detail to stay in sync as
I work
**So that** I never lose my place while a phone call comes in.

## Acceptance Criteria

- **Given** the 5 dispatcher mockups are approved
- **When** I open `/dispatcher`, `/dispatcher/tickets/[id]`,
  `/dispatcher/map`, `/dispatcher/dedup`, `/dispatcher/monitor` or
  `/dispatcher/performance`
- **Then** the page renders from `components/ui/` primitives

- **And** the 3-region layout (filter rail / list / detail) survives
- **And** the sticky action bar survives
- **And** the SLA countdown chip shows the remaining time against
  target
- **And** the crew picker is a searchable combobox
- **And** the trend + category charts are labelled, tabular and paired
  with a visible sortable data table
- **And** no series is encoded by hue alone
- **And** `tests/34-ui-redesign-dispatcher.spec.ts` is green
- **And** `tests/29-admin-dark-theme.spec.ts` is green (the monitor
  board is the redesign's first `.theme-dark` surface)
- **And** a committed baseline exists per route

## BDD Scenarios

### Scenario 1: Selecting a ticket does not lose the filter state

```gherkin
Given I am filtering the queue by ward 14
When I select a ticket
Then the detail pane updates in place
  And the ward filter is still applied
```

### Scenario 2: The SLA chip reads as remaining time

```gherkin
Given a ticket routed 40 minutes ago with a 24-hour SLA
When I open the detail pane
Then the SLA chip shows the remaining time against the target
```

## Out of Scope

- New dispatch endpoints.
- Real-time transport changes — the existing polling stays.

## Linked Files

- `app/dispatcher/**`
- `tests/34-ui-redesign-dispatcher.spec.ts`

## Status

Draft.
