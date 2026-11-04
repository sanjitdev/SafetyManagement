---
story: 015-admin-mockups
unit: 007-admin-console
intent: 009-ui-redesign
status: draft
created: 2026-11-02T18:45:00Z
updated: 2026-11-02T18:45:00Z
implemented: false
---

# Story 015 — Admin Mockups

## User Story

**As a** city administrator
**I want** the admin mockups to show real configuration density
**So that** I can approve a console that reflects the work, not a
sparse marketing page.

## Acceptance Criteria

- **Given** the crew mockups are approved
- **When** I open `gallery.html`
- **Then** I see 28 mockups

- **And** the 5 mockups exist:
  `24-admin-console.html`, `25-admin-tickets.html`,
  `26-admin-audit.html`, `27-admin-city-setup.html`,
  `28-admin-adoption.html`

- **And** each mockup references only `var(--color-*)` tokens declared
  in `tokens.css`
- **And** each uses inline SVG icons — no emoji
- **And** each copy is Bangla-first
- **And** `tests/01-mockups.spec.ts` captures all five at 1440×900 and
  1024×768
- **And** 10 committed baselines exist
- **And** `npm run test:mockups` is green

## BDD Scenarios

### Scenario 1: The tickets table is a real table

```gherkin
Given mockups/25-admin-tickets.html
When I open it
Then I see a dense data table with sortable headers
  And I see a bulk-selection affordance
  And I see a CSV export action
```

### Scenario 2: The adoption dashboard pairs charts with data

```gherkin
Given mockups/28-admin-adoption.html
When I open it
Then I see a KPI row
  And a trend chart
  And a category bar chart
  And an SLA bullet
  And every chart has a reachable data table
```

## Out of Scope

- The page implementation — Story 016.

## Linked Files

- `design-artifacts/D-Design-System/01-Visual-Design/mockups/24-admin-console.html`
- `design-artifacts/D-Design-System/01-Visual-Design/mockups/25-admin-tickets.html`
- `design-artifacts/D-Design-System/01-Visual-Design/mockups/26-admin-audit.html`
- `design-artifacts/D-Design-System/01-Visual-Design/mockups/27-admin-city-setup.html`
- `design-artifacts/D-Design-System/01-Visual-Design/mockups/28-admin-adoption.html`
- `tests/01-mockups.spec.ts`

## Status

Draft.
