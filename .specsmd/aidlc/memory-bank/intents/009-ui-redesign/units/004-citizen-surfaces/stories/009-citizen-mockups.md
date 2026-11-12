---
story: 009-citizen-mockups
unit: 004-citizen-surfaces
intent: 009-ui-redesign
status: complete
created: '2026-11-02T18:30:00Z'
updated: '2026-11-02T18:30:00Z'
implemented: true
---

# Story 009 — Citizen Mockups

## User Story

**As a** reviewer
**I want** four mockups for the citizen surfaces
**So that** the hub, the flow shell, the list and the detail trail are
approved as one coherent family.

## Acceptance Criteria

- **Given** the Wave 2 mockups are approved
- **When** I open `gallery.html`
- **Then** I see 16 mockups

- **And** the 4 mockups exist:
  `13-home-city-activity.html`, `14-report-shell.html`,
  `15-my-reports.html`, `16-report-detail-trail.html`

- **And** each references only `var(--color-*)` tokens declared in
  `tokens.css`
- **And** each uses inline SVG icons — no emoji
- **And** each copy is Bangla-first
- **And** `tests/01-mockups.spec.ts` captures all four at 1440×900 and
  1024×768
- **And** 8 committed baselines exist
- **And** `npm run test:mockups` is green

## BDD Scenarios

### Scenario 1: The report shell shows where I am

```gherkin
Given mockups/14-report-shell.html
When I open it
Then I see a five-step progress indicator
  And one step rendered in detail
```

### Scenario 2: The detail mockup shows the trail as a timeline

```gherkin
Given mockups/16-report-detail-trail.html
When I open it
Then I see a vertical status trail with per-step icons and timestamps
  And I see the labelled before/after photo groups
```

## Out of Scope

- The page implementation — Story 010.
- Retiring the superseded `01-welcome` / `02-home-city-activity`
  mockups — done at Unit 008 sign-off.

## Linked Files

- `design-artifacts/D-Design-System/01-Visual-Design/mockups/13-home-city-activity.html`
- `design-artifacts/D-Design-System/01-Visual-Design/mockups/14-report-shell.html`
- `design-artifacts/D-Design-System/01-Visual-Design/mockups/15-my-reports.html`
- `design-artifacts/D-Design-System/01-Visual-Design/mockups/16-report-detail-trail.html`
- `tests/01-mockups.spec.ts`

## Status

Draft.
