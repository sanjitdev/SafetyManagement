---
id: 006-report-photo
unit: 003-submit-report-flow
intent: 002-citizen-report-flow
status: done
priority: must
created: 2026-10-04T00:00:00Z
updated: 2026-11-09T00:00:00Z
assigned_bolt: null
implemented: true
---

# Story: 006-report-photo

## User Story

**As a** citizen
**I want** to attach 1-3 photos of the issue
**So that** the dispatcher and crew have visual
context to triage and resolve the report.

## Acceptance Criteria

- [x] **Given** the report flow, **When** I reach
  step 2, **Then** I land on `/report/photo` (1.8).
- [x] **Given** the page, **When** I tap "Take a
  photo" or "Choose from gallery", **Then** the
  camera or gallery picker opens.
- [x] **Given** the cap, **When** I try to add a 4th
  photo (or 3rd for narrow categories), **Then** the
  add button is disabled.
- [x] **Given** the minimum, **When** I try to advance
  with 0 photos, **Then** the "Next" button is disabled.
- [x] **Given** a photo, **When** it's added, **Then**
  it's stored as a base64 data URL in `sessionStorage`.
- [x] **Given** a photo, **When** I tap the X on a
  thumbnail, **Then** it's removed.
- [x] **Given** a valid photo set, **When** I tap
  "Next", **Then** I am taken to `/report/category`.

## Technical Notes

- Photo cap: 3 (cap 2 for narrow categories; the cap
  is determined by the selected category later — for
  v1 we use 3 globally and let WO-005 narrow it per
  category).
- v1: base64 in sessionStorage.
- v1.1: S3 upload (presigned URL).

## Dependencies

### Requires
- 005-report-location (the in-flight draft)

### Enables
- 007-report-category

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Camera permission denied | Show translated "allow camera" copy; gallery picker remains available |
| Photo > 4 MB | Client-side reject with translated copy (4mb is the `bodySizeLimit`) |
| Browser doesn't support `getUserMedia` | Fall back to gallery picker |
| Photo from gallery is HEIC | Convert to JPEG client-side (iOS Safari) |
| User navigates back to 1.7 | Photos persist in `sessionStorage` |
| Tab refreshes mid-flow | Photos persist in `sessionStorage` (until tab close) |

## Out of Scope

- EXIF stripping (deferred to v1.1).
- Photo annotation (deferred to v1.1 if added).
- S3 upload (deferred to v1.1).

## Status

Working code on the happy path. The 1.8 page renders
with the cap and minimum checks. Visual baseline
committed. v1.1 photo upload is deferred.