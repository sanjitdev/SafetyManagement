---
unit: 005-map-view
intent: 003-dispatcher-queue
phase: construction
status: ready
created: 2026-10-11T23:55:00Z
updated: 2026-10-12T05:00:00Z
---

# Unit Brief: Map View

## Status

Promoted to v1 on 2026-10-12 per the
design log's bolt-progress note ("Construction
loop moves on to Bolt 003-005 next"). The
dispatcher map view stands up as the third
dispatcher surface alongside the triage queue
(Unit 002) and the per-ticket detail (Unit 003).

The v1 triage queue (Unit 002) is a list;
the v1 ticket detail (Unit 003) is per-
ticket. A map view (pins on a MapLibre
canvas, clustered by ward) is the
natural v1 dispatch-side surface once
the dispatcher is comfortable with the
list flow.

## Why deferred

- The dispatcher persona in v1 is
  scoping a single ward at a time;
  the queue is a small list (~10s of
  rows, ~100s at scale) and a list is
  faster to triage than a map at this
  volume.
- The list is the dispatcher's primary
  action surface (route, reassign,
  transition); a map is read-only and
  duplicates the queue's information.
- The MapLibre + OSM stack is wired in
  Intent 002 (1.7 location page); the
  dispatcher can re-use the same
  `MapView` component for v1.1, but
  that's an "in 1 sprint" addition
  once the list is stable.

## Purpose (v1.1)

Stand up the dispatcher's map view —
`/dispatcher/map` — a MapLibre canvas
centered on the dispatcher's city,
showing all tickets in scope (in
`submitted`, `routed`, `in_progress`
status) as pins. Pins are colored by
status; clicking a pin opens a side
panel with the ticket summary and a
"View ticket" link to
`/dispatcher/tickets/[id]`.

## Scope (v1.1)

### In Scope (v1.1, not in v1)

- New API:
  `GET /api/v1/dispatcher/map/tickets`
  — list of `{ id, lat, lng, status,
  category, age }` for tickets in the
  dispatcher's scope.
- New page:
  `app/dispatcher/map/page.tsx` —
  MapLibre canvas + side panel.
- Header link from `/dispatcher` and
  `/dispatcher/dedup` to
  `/dispatcher/map`.
- Pin clustering for > 50 tickets in
  view (MapLibre's built-in cluster
  source).

### Out of Scope (v1.1)

- Heatmap / density overlay.
- Time-slider ("show me only tickets
  submitted in the last 24h").
- Real-time updates (WebSocket / SSE
  on the map).
- Crew-side map view (Intent 004).

## Story Summary

| Metric | Count |
|--------|-------|
| Total Stories | 1 |
| Must Have | 0 |
| Should Have | 1 |
| Could Have | 0 |

### Stories

| Story ID | Title | Priority | Status |
|----------|-------|----------|--------|
| DISP-007-dispatcher-map | Dispatcher map view (v1.1) | Should | deferred |

## Dependencies

### Depends On

| Unit | Reason |
|------|--------|
| Intent 001 (Unit 003) | `db.ticket.findMany` |
| Intent 001 (Unit 001) | `serializeTicketForRole` |
| Intent 003 (Unit 001) | `requireRole` + `requireScope` |
| Intent 002 (Unit 005) | `MapView` component |
| Intent 002 (Unit 001) | MapLibre + OSM tiles (inherited) |

## Bolt Suggestions (v1.1)

A single `ddd-construction-bolt` —
reuses the inherited `MapView` component
+ one API + one page.

## Notes

This unit is the v1.1 candidate that
lives in the same intent as the rest of
the dispatcher queue work. The intent
breaks down as: v1 = Units 001-004;
v1.1 = Unit 005. The unit-brief is filed
so the v1.1 work has a head start when
it's unblocked.

The construction team can promote this
unit by flipping `status: deferred` to
`status: ready` in this file and
removing the "DEFERRED" banner.
