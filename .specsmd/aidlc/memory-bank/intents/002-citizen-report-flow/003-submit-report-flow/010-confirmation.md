---
id: 010-confirmation
unit: 003-submit-report-flow
intent: 002-citizen-report-flow
status: in-progress
priority: must
created: 2026-10-04T00:00:00Z
updated: 2026-10-11T18:00:00Z
assigned_bolt: null
implemented: true
---

# Story: 010-confirmation

## User Story

**As a** citizen
**I want** a clear confirmation page after submitting
**So that** I know my report was received and what
to do next.

## Acceptance Criteria

- [x] **Given** a successful submit, **When** I land
  on `/report/[id]/submitted`, **Then** I see 1.11:
  the new ticket ID, a short status, and two CTAs.
- [x] **Given** the page, **When** I tap "See my
  reports", **Then** I am taken to `/reports`.
- [x] **Given** the page, **When** I tap "Back to
  home", **Then** I am taken to `/home`.
- [x] **Given** the in-flight draft, **When** I land
  on the confirmation, **Then** `clearReportDraft()`
  clears `sessionStorage`.

## Technical Notes

- The confirmation page is a **trust signal** — see
  WO-001 intent framing ("Civic observability is the
  visibility layer that makes silence unmaintainable;
  trust signals — status trail, push, feel-heard
  feedback — are how observability translates into
  restored trust").

## Dependencies

### Requires
- 009-dedup-prompt (or the 201 path from 008-report-note)

### Enables
- 011-my-reports (the "See my reports" CTA)

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Ticket ID is invalid | 404 |
| Ticket is in another city | `requireSameCity` rejects; 403 |
| Citizen refreshes the page | Confirmation re-renders (idempotent) |

## Out of Scope

- A "share" CTA (deferred to v1.1).

## Status

Working code on the happy path. The 1.11 page renders
with both CTAs. Visual baseline committed.