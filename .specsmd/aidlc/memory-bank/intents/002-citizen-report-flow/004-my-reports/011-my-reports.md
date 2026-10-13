---
id: 011-my-reports
unit: 004-my-reports
intent: 002-citizen-report-flow
status: in-progress
priority: must
created: 2026-10-04T00:00:00Z
updated: 2026-10-11T18:00:00Z
assigned_bolt: null
implemented: true
---

# Story: 011-my-reports

## User Story

**As a** citizen
**I want** to see a list of the reports I've submitted
**So that** I can follow up on each one and see its
current status.

## Acceptance Criteria

- [x] **Given** a citizen session, **When** I land on
  `/reports`, **Then** I see 1.12 — a list of my own
  reports.
- [x] **Given** each item, **When** it renders, **Then**
  I see: status pill, category, relative time.
- [x] **Given** the list, **When** I tap an item,
  **Then** I am taken to `/reports/[id]`.
- [x] **Given** the polling, **When** 30s elapse,
  **Then** the list re-fetches `/api/tickets`.
- [x] **Given** an empty list, **When** I land on
  `/reports`, **Then** I see the "No reports yet"
  state with a CTA to `/report/location`.

## Technical Notes

- `GET /api/tickets` filters by `reporterId =
  session.userId` (the citizen serializer already
  strips internal fields).
- 30s polling cadence.
- v1 hard cap: `take: 20`.

## Dependencies

### Requires
- Intent 001 (auth + serializer + `/api/tickets`)
- 001-splash-welcome (auth-gated)
- 010-confirmation (the "See my reports" CTA)

### Enables
- 012-report-detail (the chevron)

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Citizen has 0 reports | Empty state |
| `/api/tickets` returns an error | Last known list stays; retry next tick |
| Citizen has > 20 reports | v1: first 20; v1.1: cursor pagination |

## Out of Scope

- Cursor pagination (deferred to v1.1).
- Search / filter (deferred to v1.1).

## Status

Working code on the happy path. The 1.12 page renders.
Visual baseline committed.