---
story: DISP-008-live-monitor
unit: 006-live-monitor
intent: 003-dispatcher-queue
phase: construction
status: done
created: 2026-10-27T00:00:00Z
updated: 2026-10-27T00:00:00Z
---

# Story: DISP-008 — Dispatcher Live Monitor

> Deferred to v1.1 alongside the map view (DISP-007)
> and the performance snapshot (DISP-009).
> Construction: Bolt 008-013 (complete, 2026-10-27).

## Given / When / Then

### Acceptance 1 — The live list renders

**Given** a dispatcher session bound to
`(city_dhaka_north, ward_14)`
with watched tickets in
`submitted`/`routed`/`in_progress`/`resolved`
**When** the dispatcher opens
`/dispatcher/monitor`
**Then** the page renders a header ("Live
updates" + a back arrow to the triage queue +
three filter chips), a single-column list of
watched tickets sorted by most-recently updated,
and the 280px chart strip on desktop. Each row
shows a 40×40 thumbnail, the category label, the
ward, a status pill, a most-recent-activity
snippet, and an unread dot when the activity is
unread.

### Acceptance 2 — The page polls every 5 seconds

**Given** the dispatcher is on `/dispatcher/monitor`
**When** 5 seconds elapse
**Then** the page re-requests
`GET /api/v1/dispatcher/monitor` and the row list
refreshes in place. When a row's latest-activity
timestamp has moved forward since the previous
poll, the aggregate "N new updates" counter
increments by the number of such rows.

### Acceptance 3 — A network failure shows a paused banner

**Given** the monitor poll fails (network error or
a non-ok response)
**When** the request settles
**Then** a slim "Live updates paused" banner
(`role="alert"`) appears at the top of the page
and the polling interval continues, so the feed
resumes on its own once the network recovers.

### Acceptance 4 — Filter chips scope the list

**Given** the dispatcher is on `/dispatcher/monitor`
**When** the dispatcher presses the "My ward" chip
**Then** the request carries `?filter=my_ward` and
only tickets in the dispatcher's session ward are
returned; "My crews" sends `?filter=my_crews` and
only tickets with an assigned crew member are
returned; "All" sends no filter. The pressed chip
carries `aria-pressed="true"` and the other two
carry `aria-pressed="false"`.

### Acceptance 5 — A row expands to reveal the trail

**Given** a watched ticket
**When** the dispatcher presses the row's expand
toggle
**Then** the toggle's `aria-expanded` flips to
`true` and an inline panel appears showing the
last 3 trail steps (status pill + actor + age) and
the new-photo count, plus a link to the full
report at `/dispatcher/tickets/[id]`. Pressing the
toggle again collapses the panel.

### Acceptance 6 — Acknowledge writes an audit row

**Given** a watched ticket with an unread update
**When** the dispatcher presses the row's "✓"
button
**Then** the page POSTs
`{ ticketId }` to
`POST /api/v1/dispatcher/monitor/ack`, the API
responds `200 { ticketId, acknowledgedAt }`, an
audit row with
`action: 'ticket.monitor_acknowledge'` is written,
and the row's unread dot clears. The
acknowledgement is optimistic: the local state
updates first and the next poll re-syncs if the
request failed.

### Acceptance 7 — Every chart has an accessible table

**Given** the chart strip is rendered
**When** the dispatcher uses a screen reader or
copies the data
**Then** each of the three charts (today's flow,
avg response time, crew load) is an inline SVG
with `role="img"` and an `aria-label`, and each
renders a sibling `<table>` carrying the same data
with a `<caption>` and `<th scope="col">`
headers. No charting library is loaded.

### Acceptance 8 — Cross-ward denial

**Given** a dispatcher in `ward_14`
**When** the API
`POST /api/v1/dispatcher/monitor/ack` is called
with a ticket id from another ward
**Then** the API returns 404 (`not_found`) — not
403 — so the dispatcher cannot probe ticket
existence outside their scope.

### Acceptance 9 — Cross-city denial

**Given** a dispatcher in `city_dhaka_north`
**When** the API
`GET /api/v1/dispatcher/monitor?cityId=city_chittagong`
is called
**Then** the API returns 403
(`cross_city_access_denied`).

## Technical Notes

- The service (`lib/dispatcher/monitor.ts`) splits
  into pure builders and a DB-facing pair. The pure
  builders are exported so the Vitest suite can pin
  the arithmetic with fixture arrays and no
  database; the DB-facing pair is exercised against
  the real in-memory dev store.
- The page polls with
  `POLL_INTERVAL_MS = 5_000` (the UX spec's v1
  default; WebSocket is a v1.1 enhancement).
- The ward filter is applied in code, not in the
  query: the dev store's `findMany` does
  string-equality on every `where` key, so a
  `{gte, lte}`-style clause never matches there.
- The department filter is deliberately NOT applied:
  the monitor is a ward-level feed, and the spec's
  "category + ward" row shape implies all
  categories in the ward are visible.
- "Response time" is the gap between a ticket's
  creation and its first non-`submitted` trail step.
  Days with no samples are emitted with
  `avgMinutes: 0` and `samples: 0` so the x-axis
  keeps a fixed number of points.
- The acknowledgement is client-held in v1. The
  audit row records the intent; the Prisma schema
  has no read-marker table.
- The three charts are inline SVG. Each renders a
  visually-hidden `<table>` sibling from the same
  data array (caption + `<th scope="col">`), so
  the data is available to screen readers and for
  copy/paste.
- `aria-pressed` (filter chips), `aria-expanded`
  (row toggle) and `aria-label` (back link, chart
  strip, unread dot, both row buttons) are wired on
  the shipped page.

## Cross-references

- `app/api/v1/dispatcher/monitor/route.ts` —
  new API (GET).
- `app/api/v1/dispatcher/monitor/ack/route.ts` —
  new API (POST).
- `app/dispatcher/monitor/page.tsx` — new page.
- `lib/dispatcher/monitor.ts` — new service.
- `tests/unit/dispatcher/monitor.test.ts` — Vitest
  unit suite.
- `tests/26-dispatcher-monitor-performance.spec.ts`
  — Playwright route spec (shared with Unit 007).
