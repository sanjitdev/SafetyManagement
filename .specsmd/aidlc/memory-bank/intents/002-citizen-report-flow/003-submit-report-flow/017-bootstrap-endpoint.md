---
id: 017-bootstrap-endpoint
unit: 003-submit-report-flow
intent: 002-citizen-report-flow
status: done
priority: must
created: 2026-10-04T00:00:00Z
updated: 2026-11-09T00:00:00Z
assigned_bolt: null
implemented: true
---

# Story: 017-bootstrap-endpoint

## User Story

**As a** client page
**I want** a single endpoint that returns the city,
wards, categories, and i18n defaults
**So that** I can paint the report flow's first
screens without seven separate fetches.

## Acceptance Criteria

- [x] **Given** `GET /api/report/bootstrap?cityId=...`,
  **When** called by an auth-gated client, **Then** the
  response is
  `{ city, wards, categories, defaults: { language, theme } }`.
- [x] **Given** the city, **When** I read the response,
  **Then** `city` includes `id`, `slug`, `name`,
  `dedupRadiusMeters`, `polygon` (GeoJSON).
- [x] **Given** the categories, **When** I read the
  response, **Then** each category has `id`, `slug`,
  `name` (BN + EN), `departmentId?`, `isNarrow`.
- [x] **Given** the client, **When** I cache the
  response, **Then** the 5-minute cache is respected.
- [x] **Given** a missing city, **When** the endpoint
  is called, **Then** the response is 404.

## Technical Notes

- The endpoint is the citizen-facing read of the city
  config; the WO-002 dispatcher reads a similar shape
  with extra fields.
- The polygon is GeoJSON in v1 (`String?`); v1.1 may
  add a PostGIS `geometry` column.

## Dependencies

### Requires
- Intent 001 (auth + city/ward/category models)

### Enables
- 005-report-location (geofence polygon)
- 007-report-category (categories list)
- 004-home-activity (city defaults for the map)

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Citizen's session cityId differs from the query cityId | Use the session's cityId (ignore the query) |
| City has 0 wards | The wards list is empty |
| City has 0 categories | The report flow rejects (admin hasn't configured) |

## Out of Scope

- The dispatcher-scoped bootstrap (deferred to WO-002).

## Status

Working code on the happy path. The endpoint returns
the expected shape. Unit tests cover the cache + the
missing-city paths.