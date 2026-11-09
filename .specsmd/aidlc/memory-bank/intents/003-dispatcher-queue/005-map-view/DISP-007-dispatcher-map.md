---
story: DISP-007-dispatcher-map
unit: 005-map-view
intent: 003-dispatcher-queue
phase: construction
status: done
created: 2026-10-11T23:55:00Z
updated: 2026-11-09T00:00:00Z
---

# Story: DISP-007 — Dispatcher Map View

> Promoted to v1 on 2026-10-12 per the
> design log's bolt-progress note.
> Construction: Bolt 003-005 (in progress).

## Given / When / Then

### Acceptance 1 — Pins render

**Given** a dispatcher session bound to
`(city_dhaka_north, ward_14, dept_streetlight)`
with 5 tickets in scope in
`submitted`/`routed`/`in_progress`
**When** the dispatcher opens
`/dispatcher/map`
**Then** the page renders a MapLibre
canvas centered on
`city_dhaka_north` with 5 pins, each
colored by status (gray = submitted,
blue = routed, amber = in_progress).

### Acceptance 2 — Out-of-scope tickets hidden

**Given** 5 in-scope tickets + 3
out-of-scope tickets (ward_15, dept_water)
**When** the dispatcher opens
`/dispatcher/map`
**Then** only the 5 in-scope pins
render.

### Acceptance 3 — Click pin → side panel

**Given** a pin
**When** the dispatcher clicks it
**Then** a side panel opens with the
ticket summary (category, status, age,
ward) and a "View ticket" link to
`/dispatcher/tickets/[id]`.

### Acceptance 4 — Clustering

**Given** 100 tickets in scope
**When** the dispatcher zooms out to
city level
**Then** the pins cluster (MapLibre
built-in cluster source) — clusters
show a count badge.

### Acceptance 5 — Cross-ward denial

**Given** a dispatcher in
`city_dhaka_north`
**When** the API
`GET /api/v1/dispatcher/map/tickets?cityId=city_chittagong`
is called
**Then** the API returns 403
(`cross_city_access_denied`).

## Technical Notes

- The `MapView` component from
  Intent 002 Unit 005 is reused
  (MapLibre + OSM raster tiles, Dhaka
  District polygon overlay).
- The pins are a MapLibre
  `circle` layer with a data-driven
  `circle-color` based on status.
- The side panel is a simple
  absolutely-positioned div on the
  right edge of the map.
- The dispatcher's `cityId`,
  `wardId?`, `departmentId?` scope is
  applied server-side in the new API.

## Cross-references

- `app/api/v1/dispatcher/map/tickets/route.ts` —
  new API (v1.1).
- `app/dispatcher/map/page.tsx` —
  new page (v1.1).
- `components/MapView.tsx` — inherited
  from Intent 002.
- `tests/13-dispatcher-map-light.spec.ts` —
  Playwright route spec (v1.1).
