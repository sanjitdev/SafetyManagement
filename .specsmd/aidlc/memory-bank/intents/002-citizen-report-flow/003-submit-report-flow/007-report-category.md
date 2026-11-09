---
id: 007-report-category
unit: 003-submit-report-flow
intent: 002-citizen-report-flow
status: done
priority: must
created: 2026-10-04T00:00:00Z
updated: 2026-11-09T00:00:00Z
assigned_bolt: null
implemented: true
---

# Story: 007-report-category

## User Story

**As a** citizen
**I want** to pick a category (Pothole, Drainage,
Streetlight, etc.)
**So that** the report is routed to the right
department.

## Acceptance Criteria

- [x] **Given** the report flow, **When** I reach
  step 3, **Then** I land on `/report/category` (1.9).
- [x] **Given** the page, **When** it mounts, **Then**
  it reads the categories from the bootstrap endpoint
  (5-min client cache).
- [x] **Given** each category, **When** it renders,
  **Then** I see: icon, name (BN + EN), department
  hint.
- [x] **Given** my selection, **When** I tap a
  category, **Then** it's persisted to `sessionStorage`.
- [x] **Given** a valid selection, **When** I tap
  "Next", **Then** I am taken to `/report/note`.

## Technical Notes

- Categories are city-scoped; the bootstrap endpoint
  returns the active city's categories.
- The narrow-category photo cap (2) will be wired in
  WO-005 (admin city setup).

## Dependencies

### Requires
- 006-report-photo (the in-flight draft)
- 017-bootstrap-endpoint (categories)

### Enables
- 008-report-note

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| No category selected | "Next" is disabled |
| Categories fail to load | Show translated error; retry CTA |
| City has 0 categories | Reject the flow (admin hasn't configured) |
| User selects a category then navigates back | Selection persists in `sessionStorage` |

## Out of Scope

- Sub-categories (deferred to v1.1).
- Category search (deferred to v1.1).
- Per-category photo cap (deferred to WO-005).

## Status

Working code on the happy path. The 1.9 page renders,
the bootstrap loads, and the selection persists.
Visual baseline committed.