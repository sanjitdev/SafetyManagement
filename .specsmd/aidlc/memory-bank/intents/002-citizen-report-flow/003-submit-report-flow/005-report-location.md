---
id: 005-report-location
unit: 003-submit-report-flow
intent: 002-citizen-report-flow
status: done
priority: must
created: 2026-10-04T00:00:00Z
updated: 2026-11-09T00:00:00Z
assigned_bolt: null
implemented: true
---

# Story: 005-report-location

## User Story

**As a** citizen
**I want** the first step of the report flow to show
a map with my current location and let me confirm or
move the pin
**So that** the city knows exactly where the issue
is.

## Acceptance Criteria

- [x] **Given** the report flow, **When** I tap "Submit
  a new report" from home, **Then** I land on
  `/report/location` (1.7).
- [x] **Given** the page, **When** it mounts, **Then**
  it requests Geolocation; on grant, the map centers
  on my location; on deny, it falls back to the city
  center.
- [x] **Given** the two-region layout, **When** the
  page renders on 390×844, **Then** the map is in the
  top region and the form is in the bottom region.
- [x] **Given** the pin, **When** I drag it, **Then**
  the `(lat, lng)` updates in `sessionStorage` via
  `lib/report-draft.ts`.
- [x] **Given** the geofence, **When** I move the pin
  outside the city's polygon, **Then** I see the
  geofence-reject UX with a translated message.
- [x] **Given** a valid pin, **When** I tap "Next",
  **Then** I am taken to `/report/photo`.

## Technical Notes

- 1.7 is **client-rendered** because the map needs
  `window` and the Geolocation API is async.
- Geofence polygon comes from the bootstrap endpoint
  (city config).
- The geofence-reject UX is a design gap flagged as
  R-1 in the WO-001 feasibility; the citizen can either
  move the pin back inside or cancel the flow.

## Dependencies

### Requires
- Intent 001 (auth + serializer)
- 004-home-activity (the CTA)
- Intent 002 (Unit 005 — theme + i18n)
- 017-bootstrap-endpoint (city polygon + center)

### Enables
- 006-report-photo

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Geolocation denied | Fall back to city center |
| Geolocation unavailable (browser) | Fall back to city center |
| Pin outside geofence | Reject UX with translated copy |
| Pin snapped to nearest road (v1.1) | Deferred to v1.1 |
| Session expires mid-flow | Save draft; "Sign in again" CTA on next visit |

## Out of Scope

- Address autocomplete (deferred to v1.1).
- Snap-to-road (deferred to v1.1).
- Voice location (deferred to v1.1).

## Status

Working code on the happy path. The 1.7 page renders,
the geofence check works, and the draft persists.
Visual baseline committed. Geofence-reject UX is
functional; polishing is in the active Bolt plan.