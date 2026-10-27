---
stage: implement
bolt: 008-013-dispatcher-live-monitor
created: 2026-10-27T00:00:00Z
---

## Implementation Walkthrough: 006-live-monitor — Bolt 008-013

### Summary

Stood up the dispatcher's live monitor: a ward-scoped
read API that returns the watched tickets plus the three
chart datasets, an acknowledge API that records the
acknowledgement in the audit log, and a page that polls
the read every 5 seconds and renders the live list
alongside three inline-SVG charts. The service is split
into exported pure builders (which the Vitest suite
drives with fixture arrays, no database) and a DB-facing
read/ack pair (exercised against the real in-memory dev
store, so the facade wiring is covered too).

### Structure Overview

- **Service** — `lib/dispatcher/monitor.ts` holds the
  row builder, the three chart builders, the
  ward-scoped read, and the acknowledge write.
- **Read API** — `app/api/v1/dispatcher/monitor/route.ts`
  (GET) is the trust boundary: `requireRole(session,
  'dispatcher')`, `requireSameCity`, and a `?cityId=`
  that must match the session.
- **Write API** —
  `app/api/v1/dispatcher/monitor/ack/route.ts` (POST)
  takes a Zod-validated `{ ticketId }` body and
  delegates to the service.
- **Page** — `app/dispatcher/monitor/page.tsx` renders
  the header, the filter chips, the live list and the
  280px chart strip.

### Completed Work

- [x] `lib/dispatcher/monitor.ts` — new service.
  Exports `MONITOR_WATCHED_STATUSES`, `MONITOR_FILTERS`,
  `MONITOR_TRAIL_STEPS` (3), the row/chart types, and
  the functions `clampMonitorLimit`,
  `normalizeMonitorFilter`, `compareByUpdatedAtDesc`,
  `isoDayKey`, `buildMonitorRows`, `buildFlowChart`,
  `buildResponseSparkline`, `buildCrewLoad`,
  `buildMonitorCharts`, `listMonitorTickets` and
  `acknowledgeMonitorUpdate`.
- [x] `app/api/v1/dispatcher/monitor/route.ts` — new GET
  route. Zod-validates `filter`, `limit` (1–200,
  default 50) and `cityId`; returns
  `{ rows, charts, generatedAt }`.
- [x] `app/api/v1/dispatcher/monitor/ack/route.ts` — new
  POST route. Zod-validates `{ ticketId }`; returns
  `{ ticketId, acknowledgedAt }`.
- [x] `app/dispatcher/monitor/page.tsx` — new page.
  Polls every 5 s, renders the header, the paused
  banner, the unread / new-updates counters, the
  skeleton, the empty state, the row list and the
  chart strip.
- [x] `lib/i18n/keys.ts` — new `dispatcher.monitor.*`
  keys, both `bn` and `en`.
- [x] `tests/unit/dispatcher/monitor.test.ts` — new
  Vitest suite.
- [x] `tests/26-dispatcher-monitor-performance.spec.ts` —
  new shared Playwright route spec covering this
  bolt's monitor half (the performance half is Bolt
  008-014's).

### Key Decisions

- **Split the service into pure builders and a
  DB-facing pair.** The arithmetic (flow counts, the
  response-time averages, the crew-load counts) is the
  part that is easy to get subtly wrong and expensive to
  debug through a page. Exporting the builders lets the
  Vitest suite pin them with fixture arrays and no
  database, while the DB-facing pair is still exercised
  against the real in-memory dev store so the facade
  wiring is covered rather than mocked away.
- **Apply the ward filter in code, not in the query.**
  The dev store's `findMany` does string-equality on
  every `where` key, so a `{gte, lte}` clause never
  matches there. Filtering in code is the only shape that
  behaves identically on both backends. This mirrors the
  queue route's documented limitation.
- **Do NOT apply the department filter.** The monitor is
  a ward-level feed; the spec's "category + ward" row
  shape implies all categories in the ward are visible.
  Adding a department filter would silently hide
  cross-department tickets the dispatcher may need to
  see.
- **Derive the "N new updates" counter client-side.**
  The page keeps the previous poll's rows in a ref and
  counts the rows whose `latestActivity.timestamp` moved
  forward. This avoids a second "what changed" API and
  costs one extra map per poll.
- **Hand-roll the charts as inline SVG with table
  siblings.** No charting library is added. Each chart
  renders a visually-hidden `<table>` from the same data
  array, with a `<caption>` and `<th scope="col">`
  headers — the chart is the visual, the table is the
  accessible equivalent. This is the pattern both
  dispatcher surfaces use.
- **Report out-of-scope tickets as 404, not 403.** The
  same rule the ticket-detail surface uses: a 403 would
  confirm that the ticket exists somewhere, letting a
  dispatcher probe outside their scope.
- **Keep the acknowledgement client-held in v1.** The
  audit row records the intent; the Prisma schema has no
  per-user read-marker table, and migrations are owned
  elsewhere. The page applies the acknowledgement
  optimistically and the next poll re-syncs.

### Deviations from Plan

- **The chart strip renders from the same read API as
  the list, not from a separate charts endpoint.** The
  plan left the chart transport open. A single
  `{ rows, charts }` envelope keeps the poll atomic — the
  list and the charts can never disagree about the
  moment they describe.
- **The response-time sparkline measures creation →
  first non-`submitted` trail step.** The plan said
  "avg response time" without pinning the interval. The
  shipped definition is the dispatcher-pickup gap, which
  is the interval the dispatcher can actually influence.
  The doc comment records the definition explicitly.
- **No `dispatcher.monitor.*` key count of 7.** The
  summary that seeded this paperwork described the
  namespace as "7 keys"; the shipped namespace carries
  every string the surface renders (titles, filter
  labels, row copy, chart titles, table captions, column
  headers, relative-time formats, and the empty / error
  / paused states) in both `bn` and `en`.
- **The row's duration formatter shares
  `dispatcher.performance.duration.*` with the
  performance surface.** The two surfaces format
  durations identically, so the keys are shared rather
  than duplicated under a second namespace.

### Dependencies Added

None. The bolt uses the browser `Blob` /
`URL.createObjectURL` APIs only where already
available, and adds no package dependency. The charts
are plain JSX `<svg>` elements.

### Developer Notes

- The service's `buildMonitorRows` accepts an optional
  `lastReadAt` map (ticket id → ISO timestamp) and
  derives the `unread` flag from it: a ticket with a
  trail entry but no marker counts as unread the first
  time it is seen. The shipped `listMonitorTickets`
  calls it without a marker, so every watched ticket
  with a trail entry starts unread — the page's
  acknowledgement set is what suppresses the dot in the
  session.
- `MONITOR_TRAIL_STEPS` is 3: the expanded panel shows
  the last 3 trail steps, oldest first.
- The chart strip is desktop-only: the page's scoped
  `<style jsx>` block flips it on above 1025px and
  collapses the grid to one column below 1024px.
- The `formatAge` helper renders "just now", "N min ago",
  "N hr ago" and "N day ago" from the
  `dispatcher.monitor.age.*` keys.
- The page reads the language from
  `localStorage` (`cityfix.preferred_language.v1`) and
  re-syncs on the `storage` event, on `focus`, and on a
  1-second interval — the same language-sync shape the
  other dispatcher pages use.
- `acknowledgeMonitorUpdate` throws `ApiError(404,
  'not_found')` for a missing ticket, a cross-city
  ticket, and a cross-ward ticket; the route serialises
  it to `{ error: 'not_found' }` with the matching
  status.
