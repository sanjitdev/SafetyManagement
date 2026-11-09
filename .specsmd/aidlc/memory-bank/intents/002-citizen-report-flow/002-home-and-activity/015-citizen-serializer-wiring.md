---
id: 015-citizen-serializer-wiring
unit: 002-home-and-activity
intent: 002-citizen-report-flow
status: done
priority: must
created: 2026-10-04T00:00:00Z
updated: 2026-11-09T00:00:00Z
assigned_bolt: null
implemented: true
---

# Story: 015-citizen-serializer-wiring

## User Story

**As a** platform engineer
**I want** every citizen-facing endpoint to route
through `serializeTicketForRole('citizen', ticket)`
**So that** internal fields never leak to the citizen
view, even by accident.

## Acceptance Criteria

- [x] **Given** `GET /api/v1/activity`, **When** a
  citizen calls it, **Then** every item is run through
  `serializeTicketForRole('citizen', ticket)`.
- [x] **Given** the activity feed response, **When** I
  inspect the items, **Then** none of them include
  `assignedCrewId`, `internalNote`, or raw actor
  names.
- [x] **Given** the activity feed, **When** the actor
  field is rendered, **Then** it is mapped to "City
  corporation" / "সিটি কর্পোরেশন".

## Technical Notes

- The serializer is the contract; see
  `standards/api-conventions.md` and
  `decision-index.md` ADR-005.
- A failure to serialize (e.g., missing field) is a
  bug; tests cover the allow + deny paths.

## Dependencies

### Requires
- Intent 001 (Unit 002 — `serializeTicketForRole`)
- Intent 001 (Unit 003 — `/api/v1/activity`)

### Enables
- The citizen-facing activity feed (1.6)
- 011-my-reports (1.12)
- 012-report-detail (1.13)

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Ticket has no actor | Serializer emits "System" / "সিস্টেম" |
| Ticket has `internalNote: null` | Field is omitted from the response |
| Ticket is in a different city | `requireSameCity` rejects first; serializer never sees it |

## Out of Scope

- Field-level encryption (deferred to v1.1).

## Status

Working code on the happy path. The serializer is
wired into the activity feed. Unit tests cover all
four roles.