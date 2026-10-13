---
id: 009-dedup-prompt
unit: 003-submit-report-flow
intent: 002-citizen-report-flow
status: in-progress
priority: must
created: 2026-10-04T00:00:00Z
updated: 2026-10-11T18:00:00Z
assigned_bolt: null
implemented: true
---

# Story: 009-dedup-prompt

## User Story

**As a** citizen
**I want** when I submit a report near an existing
open one, to be shown that existing report and asked
whether to **link to it** or **submit a new report
anyway**
**So that** the city doesn't get accidental
duplicates, but I keep control of my submission.

## Acceptance Criteria

- [x] **Given** a `dedup_match: true` response,
  **When** I land on `/report/summary`, **Then** I see
  1.10b: the existing ticket's status, distance from
  my pin, and time.
- [x] **Given** the dedup prompt, **When** I tap
  "Link to this report", **Then** a `TicketTrailEntry`
  is appended to the existing ticket with a note
  describing the citizen's choice; I am taken to
  `/report/[id]/submitted` for the existing ticket.
- [x] **Given** the dedup prompt, **When** I tap
  "Submit a new report anyway", **Then** a new ticket
  is created; the dedup-decline event is logged AND
  flagged for the WO-002 dispatcher for manual
  review; I am taken to `/report/[id]/submitted` for
  the new ticket.
- [x] **Given** the dedup prompt, **When** I tap
  "Cancel", **Then** I am taken back to
  `/report/note` with the draft intact.

## Technical Notes

- Dedup is a **prompt**, not an auto-merge; see
  `decision-index.md` ADR-006.
- Dedup-decline is logged as a structured event AND
  flagged for city-side review (per WO-001
  feasibility decision).
- The 1.10b page MUST render even if the citizen
  submitted once already — preventing the "I submitted
  but it didn't show up" anxiety.

## Dependencies

### Requires
- 008-report-note (the submit)
- Intent 001 (Unit 003 — dedup pre-filter)

### Enables
- 010-confirmation

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Existing ticket has been resolved since the dedup match | The prompt still shows (the citizen chose; their choice is honored) |
| Existing ticket is `closed` or `cancelled` | v1: still shows the prompt; the dispatcher can clean up |
| Citizen taps "Link" but the existing ticket is gone | 404; redirect to `/report/location` |
| Citizen taps "Submit anyway" twice (double-tap) | Idempotency token on the request |

## Out of Scope

- Hard auto-merge (rejected per ADR-006).
- Hard reject (rejected per ADR-006).
- Multi-ticket dedup (v1 only matches the nearest one).

## Status

Working code on the happy path. The 1.10b page renders
with both actions. Visual baseline committed.