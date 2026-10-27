---
id: 008-013-dispatcher-live-monitor
unit: 006-live-monitor
intent: 003-dispatcher-queue
type: simple-construction-bolt
status: complete
stories:
  - DISP-008-live-monitor
created: 2026-10-27T00:00:00Z
started: 2026-10-27T00:00:00Z
completed: 2026-10-27T00:00:00Z
updated: 2026-10-27T00:00:00Z
current_stage: null
stages_completed:
  - name: plan
    completed: 2026-10-27T00:00:00Z
    artifact: implementation-plan.md
  - name: implement
    completed: 2026-10-27T00:00:00Z
    artifact: implementation-walkthrough.md
  - name: test
    completed: 2026-10-27T00:00:00Z
    artifact: test-walkthrough.md
requires_bolts: []
enables_bolts: []
requires_units: []
blocks: false
complexity:
  avg_complexity: 3
  avg_uncertainty: 2
  max_dependencies: 2
  testing_scope: 3
  estimated_files: 7
---

# Bolt 008-013 — Dispatcher Live Monitor

## Purpose

Land the dispatcher's live monitor (Intent 003
Unit 006, story DISP-008) in one bolt:

1. A new read API, `GET /api/v1/dispatcher/monitor`,
   that returns the dispatcher's watched tickets
   plus the three chart datasets the right-hand
   strip renders.
2. A new write API,
   `POST /api/v1/dispatcher/monitor/ack`, that
   acknowledges a monitor update for a ticket and
   writes an audit row.
3. A new page, `app/dispatcher/monitor/page.tsx`,
   that polls the read API every 5 seconds, renders
   the live list with its inline row expansion and
   acknowledge button, and renders three inline-SVG
   charts — each with an accessible `<table>`
   sibling.

This surface was deferred to v1.1 alongside the map
view (Unit 005) and the performance snapshot
(Unit 007). No charting library is added: the charts
are hand-rolled inline SVG, and each one renders a
visually-hidden `<table>` sibling from the same data
array so the numbers reach screen readers and the
clipboard.

## Stories

### From Unit 006 (live monitor)
| Story ID | Title | FR |
|----|-------|----|
| DISP-008-live-monitor | Dispatcher live monitor (v1.1) | DISP-REQ-007-adjacent (v1.1 dispatcher surfaces) |

## Files Created

- `app/api/v1/dispatcher/monitor/route.ts` — new GET
  route: the watched tickets + the chart strip.
- `app/api/v1/dispatcher/monitor/ack/route.ts` — new
  POST route: the acknowledge action.
- `app/dispatcher/monitor/page.tsx` — new page: the
  live list, the filter chips, the chart strip.
- `lib/dispatcher/monitor.ts` — new service: the row
  builder, the three chart builders, the ward-scoped
  read, the acknowledge write.
- `tests/unit/dispatcher/monitor.test.ts` — new Vitest
  suite for the service.
- `tests/26-dispatcher-monitor-performance.spec.ts` —
  new shared Playwright route spec (this bolt owns
  the monitor half; Bolt 008-014 owns the performance
  half of the same spec).

## Files Modified

- `lib/i18n/keys.ts` — new `dispatcher.monitor.*`
  keys, both `bn` and `en`.

## Implementation Notes

### Service split

`lib/dispatcher/monitor.ts` splits into a set of
exported pure builders and a DB-facing pair:

| Function | Kind | Purpose |
|----------|------|---------|
| `buildMonitorRows` | pure | watched tickets → the row shape the page renders |
| `buildFlowChart` | pure | watched tickets → today's stacked flow bar |
| `buildResponseSparkline` | pure | watched tickets → 7-day avg-response sparkline |
| `buildCrewLoad` | pure | watched tickets → open tickets per crew |
| `buildMonitorCharts` | pure | the three datasets bundled together |
| `listMonitorTickets` | DB-facing | the ward-scoped read |
| `acknowledgeMonitorUpdate` | DB-facing | the acknowledge write (audit row) |

The pure builders are exported so the Vitest suite
can pin the arithmetic with fixture arrays and no
database. The DB-facing pair is exercised against the
real in-memory dev store, so the facade wiring is
covered too.

### Polling

The page polls with `POLL_INTERVAL_MS = 5_000` — the
UX spec's v1 default; WebSocket is a v1.1
enhancement. A poll that fails (network error or a
non-ok response) sets a `paused` flag, which renders
a slim `role="alert"` "Live updates paused" banner;
the interval keeps running, so the feed recovers on
its own.

The "N new updates" counter is derived client-side:
the page keeps the previous poll's rows in a ref and
counts the rows whose `latestActivity.timestamp` moved
forward since the last poll.

### Scoping

The route is the trust boundary: `requireRole(session,
'dispatcher')` plus `requireSameCity`, and a
`?cityId=` that must match the session (otherwise 403
`cross_city_access_denied`).

The ward filter is applied in code, not in the query:
the dev store's `findMany` does string-equality on
every `where` key, so a `{gte, lte}`-style clause
never matches there. The department filter is
deliberately NOT applied — the monitor is a ward-level
feed, and the spec's "category + ward" row shape
implies all categories in the ward are visible.

### Acknowledge

`acknowledgeMonitorUpdate` writes an audit row with
`action: 'ticket.monitor_acknowledge'` via
`writeAudit(...)` from `lib/platform/audit.ts`, as
`team.md` Mandated for any state-changing operation.

The acknowledgement itself is client-held in v1 — the
audit row records the intent; the Prisma schema has no
per-user read-marker table. The page applies the
acknowledgement optimistically and the next poll
re-syncs.

Out-of-scope tickets are reported as 404 `not_found`
(not 403) so a dispatcher cannot probe ticket existence
outside their scope — the same rule the ticket-detail
surface uses.

### Charts

Three inline-SVG charts, each with a visually-hidden
`<table>` sibling built from the same data array:

| Chart | Shape | Data |
|-------|-------|------|
| Today's flow | stacked bar | one count per watched status, in the canonical status order |
| Avg response time | sparkline | one point per day over the last 7 days |
| Crew load | bars | open (non-resolved) tickets per crew, highest first |

Each SVG carries `role="img"` and an `aria-label`; each
table sibling carries a `<caption>` and
`<th scope="col">` headers. Crew with no assigned
tickets are not emitted from the load chart — the chart
shows the load that exists, not the roster.

### Accessibility

- The filter chips carry `aria-pressed` (`true` on the
  selected chip, `false` on the others).
- The row toggle carries `aria-expanded` and an
  `aria-label` that flips between the expand and
  collapse copy.
- The acknowledge button carries an `aria-label` and a
  `title` that reads "Acknowledged" once acknowledged.
- The back link, the chart strip and the unread dot
  carry `aria-label`s.

### i18n keys

The new keys live under `dispatcher.monitor.*` and
ship in both `bn` and `en`, per `team.md` Mandated:
`title`, `back`, `filter.all` / `filter.my_ward` /
`filter.my_crews`, `new_updates`, `unread_count`,
`row.activity`, `row.activity_unknown_actor`,
`row.acknowledge`, `row.acknowledged`, `row.expand`,
`row.collapse`, `row.open_detail`, `row.trail_heading`,
`row.new_photos`, `empty.title`, `empty.subtitle`,
`empty.link`, `error`, `paused`, `signin_required`,
`chart.flow.title`, `chart.response.title`,
`chart.crew.title`, the three chart table captions,
the six chart column headers, `chart.no_data`, and
the four `age.*` relative-time formats.

The row's relative-time formatter shares the
`dispatcher.performance.duration.*` keys with the
performance surface (Bolt 008-014) — the two surfaces
format durations identically, so the keys are shared
rather than duplicated.

## Verification

- `npm run build` — compiled successfully, 58/58
  static pages generated.
- `npx tsc --noEmit` — clean, 0 errors.
- `npm run lint` — 0 errors, 53 warnings.
- `npm run test:unit` — 825 passed across 58 test
  files.
- `npm run test:unit:coverage` — 90.89% lines /
  80.85% branches / 94.11% functions (80% floor).
- `npm run test:mockups` — 15 passed, no baseline
  regenerated.
- The new unit test is green.
- The new Playwright route spec is green.

## Out of Scope

- WebSocket / SSE delivery (v1.1; v1 polls).
- A persisted per-user read marker.
- A dashboard entry point linking to the monitor.
- Heatmap, density overlay, time-slider filters.
- The full performance report — Bolt 008-014.
- The map view's pin detail — Bolt 003-005.
- A charting library — the charts are inline SVG with
  accessible table siblings.

## Risk Posture

| Risk | Mitigation |
|------|-----------|
| The 5-second poll hammers the dev store | The poll is gated behind the signed-in check, the interval is cleared on unmount, and the read is ward-scoped. |
| A network failure leaves the page stale forever | The paused banner surfaces the failure and the interval keeps running, so the feed recovers on its own. |
| The ward filter is applied in code, not in the query | The dev store's `findMany` does string-equality on every `where` key, so a range clause never matches there; the code-level filter is the only shape that works on both backends. |
| The acknowledge leaks ticket existence outside the ward | Out-of-scope tickets return 404, not 403 — the dispatcher cannot distinguish "exists elsewhere" from "does not exist". |
| The audit write fails silently | `writeAudit` is awaited inside the service and the route serialises any failure as a 500 `monitor_ack_failed`. |
| The charts are unreadable to screen-reader users | Each chart renders a `<table>` sibling from the same data array, with a `<caption>` and scoped column headers. |
| A new i18n key ships without a Bangla translation | Every new key ships in both `bn` and `en`; the registry's typed i18n check runs before merge. |
| The time-dependent page would gate the merge on a stale visual baseline | The Playwright spec carries no visual-regression baseline — the surface is live-polling and date-dependent, so baselines are left to the mockup suite. |
