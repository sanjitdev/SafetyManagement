---
id: 008-report-note
unit: 003-submit-report-flow
intent: 002-citizen-report-flow
status: in-progress
priority: must
created: 2026-10-04T00:00:00Z
updated: 2026-10-11T18:00:00Z
assigned_bolt: null
implemented: true
---

# Story: 008-report-note

## User Story

**As a** citizen
**I want** to add an optional short note (≤ 280
chars) and then submit my report
**So that** I can add context that photos and
location alone don't capture.

## Acceptance Criteria

- [x] **Given** the report flow, **When** I reach
  step 4, **Then** I land on `/report/note` (1.10).
- [x] **Given** the note field, **When** I type, **Then**
  the character count updates (e.g., "120 / 280").
- [x] **Given** 280+ chars, **When** I keep typing,
  **Then** the input is truncated.
- [x] **Given** a valid note (or empty), **When** I
  tap "Submit", **Then** `POST /api/tickets` is called.
- [x] **Given** a 201 response, **When** it arrives,
  **Then** I am taken to `/report/summary` (1.10b).
- [x] **Given** a 200 dedup_match response, **When** it
  arrives, **Then** I am taken to
  `/report/summary?dedup=true&...`.
- [x] **Given** a 400 response, **When** it arrives,
  **Then** I stay on the page with a translated error.

## Technical Notes

- Note is optional; empty note is acceptable.
- The submit body shape is validated by Zod on the
  server.

## Dependencies

### Requires
- 007-report-category (the in-flight draft)

### Enables
- 009-dedup-prompt

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Submit fails (network) | Show translated error; keep the draft |
| Note contains profanity | v1: not filtered (community norms); v1.1 may add a denylist |
| Note > 280 chars | Truncated at the input boundary |
| User navigates back from summary | Draft persists |

## Out of Scope

- Note denylist (deferred to v1.1).
- Voice-to-text note (deferred to v1.1).

## Status

Working code on the happy path. The 1.10 page renders
and submits. Visual baseline committed.