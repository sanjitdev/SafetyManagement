---
unit: 006-live-monitor
intent: 003-dispatcher-queue
phase: construction
status: complete
created: 2026-10-27T00:00:00Z
updated: 2026-10-27T00:00:00Z
---

# Unit Brief: Live Monitor

## Status

Delivered in Bolt 008-013 (2026-10-27). The dispatcher
live monitor stands up as the sixth dispatcher surface,
alongside the triage queue (Unit 002), the per-ticket
detail (Unit 003), the dedup-decline review (Unit 004),
the map view (Unit 005) and the performance snapshot
(Unit 007).

This surface was deferred to v1.1 alongside the map
view and the performance snapshot. It shipped with a
deliberately narrow scope: a read-only live feed of the
dispatcher's own ward, three inline-SVG charts, and an
"acknowledge" affordance that clears a notification.

## Why deferred

- The v1 triage queue (Unit 002) is already a
  list, and the dispatcher refreshes it when they want
  to see what moved. A second live surface was
  redundant until the queue grew past the point
  where a manual refresh was cheap.
- The charts the spec asks for (flow, response time,
  crew load) duplicate data the queue and the
  performance snapshot (Unit 007) already expose; the
  v1.1 argument was that the *live* strip is what
  makes the dispatcher glance rather than navigate.
- Real-time delivery was an open question in the UX
  spec (WebSocket vs polling); v1.1 was the safe
  place to land the cheap version first.

## Purpose

Stand up the dispatcher's live monitor —
`/dispatcher/monitor` — a live panel of the tickets
the dispatcher is watching, so they can see the field
move without leaving the dispatcher surface.

Layout (per UX spec 2.5, "Monitor Updates"):

- 960px page cap, full-width on mobile.
- 56px header: back arrow (left), "Live updates"
  (centre), filter chips (right).
- Single-column list of watched tickets, sorted by
  most-recently updated. Each row: 40×40 thumbnail +
  category/ward + status pill + most-recent-activity
  snippet + unread dot. Rows expand inline to reveal
  the last 3 trail steps + new photos.
- 280px right-hand chart strip (desktop only): today's
  flow (stacked bar), avg response time (sparkline,
  last 7 days), crew load (bars).
- An aggregate "N new updates" counter at the top.

Real-time: the page polls every 5 seconds (the spec's
v1 default; WebSocket is a v1.1 enhancement). A network
failure shows a slim "Live updates paused" banner and
polling continues.

Acknowledgement: the per-row "✓" button POSTs to
`/api/v1/dispatcher/monitor/ack`, which writes an
audit row.

## Scope

### In Scope

- New API:
  `GET /api/v1/dispatcher/monitor` — the watched
  tickets in the dispatcher's scope plus the three
  chart datasets. Returns
  `{ rows: MonitorRow[], charts: { flow, response,
  crewLoad }, generatedAt: string }`.
- New API:
  `POST /api/v1/dispatcher/monitor/ack` — acknowledge a
  monitor update for a ticket. Writes an audit row
  (`action: 'ticket.monitor_acknowledge'`).
- New page:
  `app/dispatcher/monitor/page.tsx` — the live list,
  the filter chips, the acknowledge button, the inline
  row expansion, and the three-chart right-hand strip.
- New service:
  `lib/dispatcher/monitor.ts` — the row builder, the
  three chart builders, the ward-scoped read, and the
  acknowledge write.
- 5-second polling on the page, with a paused banner
  on a network failure.
- Three inline-SVG charts, each with an accessible
  `<table>` sibling (caption + `<th scope="col">`)
  rendering the same data, so the chart data reaches
  screen readers and clipboard users. No charting
  library is added.
- Full ARIA on the interactive controls:
  `aria-pressed` on the filter chips, `aria-expanded`
  on the row toggle, `aria-label` on the back link, the
  chart strip, the unread dot, and both row buttons.
- Cross-ward / cross-city denial on every API.

### Out of Scope

- WebSocket / SSE delivery (v1.1; v1 polls).
- A persisted per-user read marker. The v1
  acknowledgement is client-held and the audit row
  records the intent; the Prisma schema has no
  read-marker table.
- A dashboard entry point. The page is reachable
  directly; the triage queue link is a follow-up.
- Heatmap, density overlay, time-slider filters.
- The full performance report — Unit 007.
- The map view's pin detail (Unit 005).

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
| DISP-008-live-monitor | Dispatcher live monitor (v1.1) | Should | done |

## Dependencies

### Depends On

| Unit | Reason |
|------|--------|
| Intent 001 (Unit 003) | `db.ticket.findMany` + `getTicketWithTrail` |
| Intent 001 (Unit 001) | `serializeTicketForRole` |
| Intent 003 (Unit 001) | `requireRole` + `requireSameCity` |
| Intent 007 (Unit 001) | `writeAudit` (the acknowledge action) |
| Intent 003 (Unit 002) | the ward-scoped read pattern |

## Bolt Suggestions

A single `ddd-construction-bolt` — one service, two
API routes, one page, one unit test file and one
shared Playwright spec.

## Notes

The shipped service splits into pure builders
(`buildMonitorRows`, `buildFlowChart`,
`buildResponseSparkline`, `buildCrewLoad`,
`buildMonitorCharts`) and a DB-facing pair
(`listMonitorTickets`, `acknowledgeMonitorUpdate`).
The pure builders are exported so the Vitest suite can
pin the arithmetic with fixture arrays and no database;
the DB-facing pair is exercised against the real
in-memory dev store, so the facade wiring is covered
too.

The "response time" the sparkline measures is the gap
between a ticket's creation and its first
non-`submitted` trail step — the moment the dispatcher
(or the queue) picked it up. Days with no samples are
emitted with `avgMinutes: 0` and `samples: 0` so the
x-axis keeps a fixed number of points.

The service deliberately does NOT apply the
dispatcher's department filter: the monitor is a
ward-level feed, and the spec's "category + ward" row
shape implies all categories in the ward are visible.
The ward filter is applied in code because the dev
store's `findMany` does string-equality on every `where`
key.

`acknowledgeMonitorUpdate` reports an out-of-scope
ticket as 404 (not 403) so a dispatcher cannot probe
ticket existence outside their scope — the same rule
the ticket-detail surface uses.
