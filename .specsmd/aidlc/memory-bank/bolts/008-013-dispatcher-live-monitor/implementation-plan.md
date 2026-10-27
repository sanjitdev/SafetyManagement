---
stage: plan
bolt: 008-013-dispatcher-live-monitor
created: 2026-10-27T00:00:00Z
---

## Implementation Plan: 006-live-monitor — Bolt 008-013

### Objective

Land the dispatcher's live monitor (Intent 003 Unit
006, story DISP-008): a read API that returns the
dispatcher's watched tickets plus the three chart
datasets, a write API that acknowledges a monitor
update, and a page that polls the read API every 5
seconds and renders the live list with three
inline-SVG charts.

The surface was deferred to v1.1 alongside the map view
(Unit 005) and the performance snapshot (Unit 007).
It ships now because the dispatcher's day is spread
across four surfaces and the "see the field move"
loop deserves its own home.

### Deliverables

- A service that turns a set of watched tickets into
  the row shape the page renders, and into the three
  chart datasets the right-hand strip draws.
- A read API that returns `{ rows, charts,
  generatedAt }` for the dispatcher's scope.
- A write API that acknowledges a monitor update for a
  ticket and records the acknowledgement in the audit
  log.
- A page that polls the read API every 5 seconds,
  renders the live list (with inline row expansion and
  an acknowledge button), and renders three inline-SVG
  charts — each with an accessible `<table>` sibling.
- Localized copy for every new string, in both `bn`
  and `en`.
- A unit suite covering the pure builders and the
  DB-facing read/ack pair, plus a Playwright route
  spec shared with the performance bolt.

### Dependencies

- `lib/db-switch.ts` — the `db` facade and
  `getTicketWithTrail`, so the service works on Prisma
  or the in-memory dev store.
- `lib/auth/guards.ts` — `requireRole`,
  `requireSameCity` and the `ApiError` class.
- `lib/platform/audit.ts` — `writeAudit` for the
  acknowledge action.
- `lib/serializers/ticket.ts` —
  `serializeTicketForRole`, so the monitor rows are
  built from the same projection the other dispatcher
  surfaces use.
- `lib/identity/actor-role-map.ts` — the actor-role
  map for the trail steps.
- `lib/identity/display-name.ts` — `categoryLabel`
  and `displayNameFor` for the row labels.
- `lib/i18n/keys.ts` — the `dispatcher.monitor.*`
  registry entries.
- `components/ui/StatusPill.tsx` — the shared status
  pill used on the rows and the trail steps.

### Technical Approach

The service is split in two. The **pure builders**
(`buildMonitorRows`, `buildFlowChart`,
`buildResponseSparkline`, `buildCrewLoad`,
`buildMonitorCharts`) take a ticket array and return
the shapes the page renders; they are exported so the
Vitest suite can pin the arithmetic with fixture
arrays and no database. The **DB-facing pair**
(`listMonitorTickets`, `acknowledgeMonitorUpdate`) go
through the `db` facade and are exercised against the
real in-memory dev store, so the facade wiring is
covered too.

The read is ward-scoped in code rather than in the
query: the dev store's `findMany` does string-equality
on every `where` key, so a range or membership clause
never matches there. The department filter is
deliberately not applied — the monitor is a ward-level
feed, and the spec's "category + ward" row shape
implies all categories in the ward are visible.

The page polls with `POLL_INTERVAL_MS = 5_000` (the
UX spec's v1 default; WebSocket is a v1.1
enhancement). A failed poll sets a `paused` flag that
renders a slim `role="alert"` banner; the interval
keeps running so the feed recovers on its own. The
aggregate "N new updates" counter is derived
client-side by comparing the current poll's
`latestActivity.timestamp` against the previous poll's.

The charts are hand-rolled inline SVG — no charting
library is added. Each chart renders a visually-hidden
`<table>` sibling from the same data array, with a
`<caption>` and `<th scope="col">` headers, so the
numbers reach screen readers and the clipboard.

### Acceptance Criteria

- [x] The dispatcher sees only the watched tickets in
      their own ward, sorted by most-recently updated.
- [x] The page re-polls every 5 seconds and the
      "N new updates" counter tracks rows whose
      activity moved forward.
- [x] A failed poll shows the "Live updates paused"
      banner and polling continues.
- [x] The three filter chips scope the list and
      carry `aria-pressed`.
- [x] A row expands to reveal the last 3 trail steps
      and collapses again; the toggle carries
      `aria-expanded`.
- [x] The acknowledge button POSTs, the API responds
      200, and an audit row
      `ticket.monitor_acknowledge` is written.
- [x] Each of the three charts renders an accessible
      `<table>` sibling with a caption and scoped
      column headers.
- [x] An out-of-ward ticket returns 404 (not 403) on
      the acknowledge route.
- [x] Another city's `?cityId=` returns 403
      `cross_city_access_denied`.
- [x] Every new user-facing string is localized in
      both `bn` and `en`.
- [x] `npx tsc --noEmit` is clean and the unit suite
      stays green.
