---
story: 016-admin-page-implementation
unit: 007-admin-console
intent: 009-ui-redesign
status: draft
created: 2026-11-02T18:45:00Z
updated: 2026-11-02T18:45:00Z
implemented: false
---

# Story 016 — Admin Page Implementation

## User Story

**As a** city administrator reviewing tickets
**I want** to sort by any column, select several rows and export them
**So that** I can hand the ward teams an accurate list.

## Acceptance Criteria

- **Given** the 5 admin mockups are approved
- **When** I open any of the 10 admin routes
- **Then** the page renders from `components/ui/` primitives

- **And** **given** the tickets table is rendered
- **When** I focus a column header
- **Then** it is a focusable button
- **And** it carries `aria-sort="ascending" | "descending" | "none"`
  matching the current sort
- **And** activating it re-sorts the rows without a full page reload

- **And** **given** I select two or more rows
- **When** I choose "Export CSV"
- **Then** the export contains exactly the selected rows

- **And** the audit stream shows actor + action chips
- **And** the adoption dashboard carries a KPI row + trend + category
  bar + SLA bullet, each with a visible data table
- **And** `tests/36-ui-redesign-admin.spec.ts` is green
- **And** `tests/29-admin-dark-theme.spec.ts` is green
- **And** a committed baseline exists per route

## BDD Scenarios

### Scenario 1: Sorting is announced

```gherkin
Given the admin tickets table
When I sort by ward
Then the ward header carries aria-sort="ascending"
  And the rows are ordered by ward
```

### Scenario 2: The export honours the selection

```gherkin
Given I selected two specific tickets
When I export to CSV
Then the file contains exactly those two rows
```

## Out of Scope

- The WebAuthn write path — unchanged.
- New admin endpoints.

## Linked Files

- `app/admin/**`
- `tests/36-ui-redesign-admin.spec.ts`

## Status

Draft.
