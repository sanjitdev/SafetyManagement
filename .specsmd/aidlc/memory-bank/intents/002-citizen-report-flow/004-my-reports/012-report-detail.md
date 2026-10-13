---
id: 012-report-detail
unit: 004-my-reports
intent: 002-citizen-report-flow
status: in-progress
priority: must
created: 2026-10-04T00:00:00Z
updated: 2026-10-11T18:00:00Z
assigned_bolt: null
implemented: true
---

# Story: 012-report-detail

## User Story

**As a** citizen
**I want** to see the status trail of a single report
**So that** I know what's been done and when, and so
that silence is broken — the dispatcher and crew
can't quietly drop my report.

## Acceptance Criteria

- [x] **Given** a citizen session, **When** I tap a
  report in `/reports`, **Then** I land on
  `/reports/[id]` (1.13).
- [x] **Given** the page, **When** it mounts, **Then**
  it fetches `/api/tickets/:id` and the trail.
- [x] **Given** the trail, **When** it renders, **Then**
  I see the status transitions and notes in
  chronological order.
- [x] **Given** internal notes, **When** the trail
  renders, **Then** they are filtered out for the
  citizen.
- [x] **Given** the polling, **When** 30s elapse,
  **Then** the page re-fetches `/api/tickets/:id`.
- [x] **Given** a ticket from another city, **When** I
  try to read it, **Then** the page shows 403.

## Technical Notes

- The trail is sourced from `TicketTrailEntry` rows
  scoped to the ticket ID.
- Internal notes are filtered out at the trail render
  layer (the citizen serializer already strips them
  from the ticket payload).

## Dependencies

### Requires
- 011-my-reports (the chevron into detail)

### Enables
- Nothing (terminal).

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Trail is empty | Show "No activity yet" |
| Ticket has been resolved | Show the resolved badge |
| Polling fails (network blip) | Last known data stays |

## Out of Scope

- Push notification on status change (deferred to v1.1).
- Comments / reply from the citizen (deferred to v1.1).

## Status

Working code on the happy path. The 1.13 page renders
with the trail. Visual baseline committed.