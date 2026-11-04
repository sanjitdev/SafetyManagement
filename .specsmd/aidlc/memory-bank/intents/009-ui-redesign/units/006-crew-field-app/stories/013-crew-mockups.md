---
story: 013-crew-mockups
unit: 006-crew-field-app
intent: 009-ui-redesign
status: draft
created: 2026-11-02T18:40:00Z
updated: 2026-11-02T18:40:00Z
implemented: false
---

# Story 013 — Crew Mockups

## User Story

**As a** field crew member
**I want** the field mockups to be legible in sunlight
**So that** I can read a ticket without shielding my phone with my
hand.

## Acceptance Criteria

- **Given** the dispatcher mockups are approved
- **When** I open `gallery.html`
- **Then** I see 23 mockups

- **And** the 2 mockups exist:
  `22-crew-assignments.html`, `23-crew-ticket-detail.html`

- **And** `23-crew-ticket-detail.html` renders in `.theme-outdoor` —
  pure black on pure white, deliberately not softened
- **And** every touch target in both mockups is ≥48px
- **And** each mockup references only `var(--color-*)` tokens declared
  in `tokens.css`
- **And** each uses inline SVG icons — no emoji
- **And** `tests/01-mockups.spec.ts` captures both at 1440×900,
  1024×768 and 390×844
- **And** 6 committed baselines exist
- **And** `npm run test:mockups` is green

## BDD Scenarios

### Scenario 1: The work view is legible in sunlight

```gherkin
Given mockups/23-crew-ticket-detail.html
When I open it
Then the background is pure white and the text is pure black
  And the primary action is a single large button
```

### Scenario 2: The phone width still works

```gherkin
Given mockups/22-crew-assignments.html
When I open it at 390x844
Then the assignments stack in one column
  And every action target is at least 48px
```

## Out of Scope

- The page implementation — Story 014.

## Linked Files

- `design-artifacts/D-Design-System/01-Visual-Design/mockups/22-crew-assignments.html`
- `design-artifacts/D-Design-System/01-Visual-Design/mockups/23-crew-ticket-detail.html`
- `tests/01-mockups.spec.ts`

## Status

Draft.
