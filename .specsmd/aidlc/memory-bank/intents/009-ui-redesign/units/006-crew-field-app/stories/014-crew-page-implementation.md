---
story: 014-crew-page-implementation
unit: 006-crew-field-app
intent: 009-ui-redesign
status: draft
created: 2026-11-02T18:40:00Z
updated: 2026-11-02T18:40:00Z
implemented: false
---

# Story 014 — Crew Page Implementation

## User Story

**As a** crew member standing at a broken streetlight
**I want** to open the ticket, take the after-photo, mark it resolved
and note what I did — in as few taps as possible
**So that** the work is recorded before I walk away.

## Acceptance Criteria

- **Given** the 2 crew mockups are approved
- **When** I open `/crew` or `/crew/tickets/[id]`
- **Then** the page renders from `components/ui/` primitives

- **And** every touch target is ≥48px
- **And** the after-photo capture is a single thumb-reachable target
- **And** the before/after photo cards keep their labels (Intent 008)
- **And** the status action is one large button carrying a label plus
  a status icon
- **And** `.theme-outdoor` is preserved — pure black on pure white —
  and re-verified at AA contrast
- **And** `tests/35-ui-redesign-crew.spec.ts` is green
- **And** a committed baseline exists per route

## BDD Scenarios

### Scenario 1: The work view is one-handed

```gherkin
Given I am on /crew/tickets/<id>
When I look at the actions
Then the resolve action is a single large button
  And the photo capture is a single large target
```

### Scenario 2: The outdoor theme is untouched

```gherkin
Given the crew ticket-detail page
When I read its tokens
Then the outdoor theme is still pure black on pure white
```

## Out of Scope

- The photo downscale / size policy — shipped in the platform layer.
- New crew endpoints.

## Linked Files

- `app/crew/page.tsx`
- `app/crew/tickets/[id]/page.tsx`
- `tests/35-ui-redesign-crew.spec.ts`

## Status

Draft.
