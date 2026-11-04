---
story: 010-citizen-page-implementation
unit: 004-citizen-surfaces
intent: 009-ui-redesign
status: draft
created: 2026-11-02T18:30:00Z
updated: 2026-11-02T18:30:00Z
implemented: false
---

# Story 010 — Citizen Page Implementation

## User Story

**As a** citizen reporting a pothole
**I want** each step of the report flow to show where I am, what is
still missing, and how many photos I may still add
**So that** I never abandon the flow half-finished.

## Acceptance Criteria

- **Given** the 4 citizen mockups are approved
- **When** I open `/home`, any `/report/(create)/*` step,
  `/report/[id]/submitted`, `/reports` or `/reports/[id]`
- **Then** the page renders from `components/ui/` primitives

- **And** **given** I am on the photo step
- **When** I have added 1 of 3 allowed photos
- **Then** the cap indicator reads `1 / 3 ছবি`
- **And** the progress indicator shows step 3 of 5

- **And** **given** a report exists matching my location and category
- **When** I reach the summary step
- **Then** the dedup prompt appears with both options explained

- **And** the citizen detail page keeps the labelled before/after
  photo groups (Intent 007) and the `tkt_*` pill (Intent 008)
- **And** the status trail is a vertical `Timeline` with a per-step
  icon and a timestamp
- **And** no raw internal id is visible on any citizen surface
- **And** `tests/33-ui-redesign-citizen.spec.ts` is green
- **And** a committed baseline exists per route

## BDD Scenarios

### Scenario 1: The photo cap is visible

```gherkin
Given I am on the report photo step
When I have attached one photo
Then the cap indicator reads "1 / 3 ছবি"
```

### Scenario 2: The trail is a timeline

```gherkin
Given I open /reports/<id>
When I read the status section
Then I see a vertical timeline
  And every step has an icon and a timestamp
```

## Out of Scope

- The map internals — chrome only.
- New report fields or steps.

## Linked Files

- `app/home/page.tsx`
- `app/report/(create)/*/page.tsx`
- `app/report/[id]/submitted/page.tsx`
- `app/reports/page.tsx`
- `app/reports/[id]/page.tsx`
- `tests/33-ui-redesign-citizen.spec.ts`

## Status

Draft.
