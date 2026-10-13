---
id: 004-home-activity
unit: 002-home-and-activity
intent: 002-citizen-report-flow
status: in-progress
priority: must
created: 2026-10-04T00:00:00Z
updated: 2026-10-11T18:00:00Z
assigned_bolt: null
implemented: true
---

# Story: 004-home-activity

## User Story

**As a** citizen
**I want** to see a map of recent activity plus a side
panel listing the 20 most recent reports in my city
**So that** I have **civic observability** — silence
becomes unmaintainable when issues are visible.

## Acceptance Criteria

- [x] **Given** a citizen session, **When** I land on
  `/home`, **Then** I see 1.6 (map + side panel).
- [x] **Given** the map, **When** it renders, **Then**
  MapLibre GL JS + OSM raster tiles are used in dev.
- [x] **Given** the side panel, **When** it renders,
  **Then** I see the 20 most recent tickets in my
  city.
- [x] **Given** each item, **When** it renders, **Then**
  I see: category icon, distance (if my location is
  set), short title, relative time.
- [x] **Given** the polling, **When** 15s elapse,
  **Then** the panel re-fetches
  `/api/v1/activity?limit=20`.
- [x] **Given** the "Submit a new report" CTA, **When**
  I tap it, **Then** I am taken to `/report/location`.

## Technical Notes

- Page-level server component is rejected at the file
  boundary; `app/home/page.tsx` starts with `'use client'`.
- MapLibre + OSM in dev; Mapbox tiles in production if
  load justifies.
- 15s polling cadence is the v1 trade-off (no
  WebSocket / SSE).

## Dependencies

### Requires
- Intent 001 (auth + serializer + `/api/v1/activity`)
- 001-splash-welcome (the post-login landing)
- Intent 002 (Unit 005 — theme + i18n)

### Enables
- The CTA into 003-submit-report-flow

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| `cityId` is missing on the session | Redirect to `/welcome` |
| Activity feed returns 0 tickets | Side panel shows "No reports yet" |
| Polling fails (network blip) | Last known data stays; retry next tick |
| Geolocation is denied | Map centers on city default |
| Map tiles fail (Mapbox outage) | OSM brownout fallback |

## Out of Scope

- WebSocket / SSE push (deferred to v1.1).
- Per-ward filter on the side panel (deferred to v1.1).

## Status

Working code on the happy path. The 1.6 page renders.
Visual baseline committed. The "Submit a new report"
CTA enters the 5-step flow.