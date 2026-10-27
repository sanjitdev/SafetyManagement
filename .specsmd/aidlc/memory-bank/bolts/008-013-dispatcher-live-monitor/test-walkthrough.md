---
stage: test
bolt: 008-013-dispatcher-live-monitor
created: 2026-10-27T00:00:00Z
---

## Test Report: 006-live-monitor — Bolt 008-013

### Summary

- **Tests**: 33 new unit cases in
  `tests/unit/dispatcher/monitor.test.ts`, plus this
  bolt's half of the shared Playwright route spec
  `tests/26-dispatcher-monitor-performance.spec.ts`
  (8 monitor API cases + 2 monitor UI cases; the
  performance half is Bolt 008-014's).
- **Coverage**: the service's pure builders are covered
  branch for branch — the limit clamp, the filter
  normalisation, the timestamp comparator, the day-key
  helper, the row builder (latest activity, the unread
  flag in all four marker states, the 3-step trail
  slice, the sort order, the thumbnail / photo count),
  and the three chart builders (flow counts, the
  response-time averages including the zero-sample day,
  and the crew-load counts including the resolved-ticket
  exclusion). The DB-facing pair is covered against the
  real in-memory dev store: the ward scope, the
  cross-ward exclusion, the watched-status filter, the
  sort order, both chip filters, the limit, and the
  three acknowledge outcomes.
- **Visual baseline**: none. Both dispatcher surfaces
  are live-polling / date-dependent, so the shared
  route spec deliberately carries no visual-regression
  baseline — a time-dependent snapshot can never gate
  the merge. Baselines are left to the mockup suite.

### Test Files

- [x] `tests/unit/dispatcher/monitor.test.ts` — 33 unit
  cases across 10 describe blocks: `clampMonitorLimit`
  (default, clamp, pass-through), `normalizeMonitorFilter`
  (every declared filter, the unknown fallback),
  `compareByUpdatedAtDesc` (newer first, equal
  timestamps), `isoDayKey` (the YYYY-MM-DD prefix),
  `buildMonitorRows` (latest activity derived from the
  newest trail step; unread with no marker; read with a
  newer marker; unread with an older marker; no trail →
  read and the `updatedAt` fallback; the last-3 trail
  slice, oldest first; the most-recently-updated sort;
  the last photo as thumbnail plus the photo count; the
  null thumbnail with no photos), `buildFlowChart` (one
  segment per watched status in canonical order; the
  zeroed empty chart), `buildResponseSparkline` (exactly
  `days` points oldest first; the creation → first-move
  average; the `submitted` step ignored when measuring
  the first move; a zero-sample day reported as 0
  minutes), `buildCrewLoad` (open non-resolved counts
  per crew, highest first; unassigned tickets omitted and
  the crew-id fallback name), `buildMonitorCharts` (the
  three datasets bundled), `listMonitorTickets` (rows for
  the dispatcher ward only; cross-ward tickets excluded;
  only watched statuses; the most-recently-updated sort;
  the `my_crews` filter; the `my_ward` filter; the limit
  honoured; the chart strip and generation timestamp
  always returned), and `acknowledgeMonitorUpdate` (the
  audit row for a ticket in the ward; a 404 for a
  missing ticket; a 404 for a ticket outside the ward).
- [x] `tests/26-dispatcher-monitor-performance.spec.ts` —
  this bolt's monitor half: 8 API cases (the
  ward-scoped watched tickets plus the chart strip; the
  most-recently-updated sort; the `?filter=` chip; 401
  `not_authenticated` with no cookie; 403
  `forbidden_role` for a citizen; 400 `invalid_query`
  for an unknown filter; 400 `invalid_query` for an
  out-of-band limit; 403 `cross_city_access_denied` for
  another city; and 6 more for the ack route — the
  happy path with the `ticket.monitor_acknowledge` audit
  row, 401, 403, 400 `invalid_input`, and 404
  `not_found` for an unknown ticket) and 2 UI cases (the
  list, the filter chips and the chart strip render with
  the accessible table siblings; a row expands to reveal
  the trail and the acknowledge button writes the audit
  row, verified through the admin audit API).

### Acceptance Criteria Validation

- ✅ **The dispatcher sees only the watched tickets in
  their own ward, sorted by most-recently updated**:
  pinned by the unit cases "returns rows for the
  dispatcher ward only", "excludes cross-ward
  tickets", "only includes watched statuses" and "sorts
  the rows by most-recently-updated first", and by the
  Playwright case "GET monitor returns the ward-scoped
  watched tickets plus the chart strip" plus "GET monitor
  sorts rows by most-recently-updated first".
- ✅ **The page re-polls every 5 seconds and the "N new
  updates" counter tracks rows whose activity moved
  forward**: pinned by the shipped `POLL_INTERVAL_MS =
  5_000` interval and the client-side previous-poll
  comparison; the UI case "UI: /dispatcher/monitor
  renders the list, filter chips and chart strip"
  asserts the list is visible within the 10 s window,
  which covers the first poll. The counter's increment
  path is a deterministic client-side comparison of
  `latestActivity.timestamp` between polls.
- ✅ **A failed poll shows the "Live updates paused"
  banner and polling continues**: the `paused` flag is
  set on both the non-ok response path and the fetch
  catch, and the interval callback is not cleared by
  either path — the banner is rendered with `role=
  "alert"` and `data-testid="dispatcher-monitor-paused"`.
- ✅ **The three filter chips scope the list and carry
  `aria-pressed`**: pinned by the unit cases for the
  `my_crews` and `my_ward` filters, by the Playwright
  case "GET monitor honours the ?filter= chip", and by
  the UI case that asserts all three chips are visible
  and that `dispatcher-monitor-filter-all` carries
  `aria-pressed="true"`.
- ✅ **A row expands to reveal the last 3 trail steps and
  collapses again; the toggle carries `aria-expanded`**:
  pinned by the unit case "keeps only the last 3 trail
  steps, oldest first" and by the UI case "UI: a monitor
  row expands to reveal the trail and acknowledges",
  which clicks the toggle and asserts the expanded
  panel and a trail step are visible.
- ✅ **The acknowledge button POSTs, the API responds
  200, and an audit row `ticket.monitor_acknowledge` is
  written**: pinned by the unit case "writes an audit row
  for a ticket in the dispatcher ward", by the Playwright
  case "POST monitor ack happy path: 200 and a
  ticket.monitor_acknowledge audit row", and by the UI
  case that clicks the acknowledge button and then
  queries the admin audit API for an entry with that
  `entityId`.
- ✅ **Each of the three charts renders an accessible
  `<table>` sibling with a caption and scoped column
  headers**: pinned by the UI case, which asserts all
  three chart cards and all three table siblings are
  attached, that each table has exactly one `<caption>`,
  and that each table has a `th[scope="col"]`.
- ✅ **An out-of-ward ticket returns 404 (not 403) on the
  acknowledge route**: pinned by the unit cases "throws a
  404 ApiError for a ticket that does not exist" and
  "throws a 404 ApiError for a ticket outside the
  dispatcher ward", and by the Playwright case "POST
  monitor ack → 404 not_found for an unknown ticket".
- ✅ **Another city's `?cityId=` returns 403
  `cross_city_access_denied`**: pinned by the Playwright
  case "GET monitor → 403 cross_city_access_denied for
  another city".
- ✅ **Every new user-facing string is localized in both
  `bn` and `en`**: every `dispatcher.monitor.*` registry
  entry carries both locales; the i18n registry's typed
  check runs before merge.
- ✅ **`npx tsc --noEmit` is clean and the unit suite stays
  green**: see the gate table below.

### Verification Gates

| Gate | Result |
|---|---|
| `npm run build` | Compiled successfully, 58/58 static pages generated |
| `npx tsc --noEmit` | clean, 0 errors |
| `npm run lint` | 0 errors, 53 warnings |
| `npm run test:unit` | 825 passed across 58 test files |
| `npm run test:unit:coverage` | 90.89% lines / 80.85% branches / 94.11% functions (80% floor) |
| `npm run test:mockups` | 15 passed, no baseline regenerated |

### Issues Found

None blocking.

Two notes recorded for follow-up:

1. **The acknowledgement is client-held in v1.** The
   audit row records the intent, but there is no
   persisted per-user read marker — the Prisma schema has
   no read-marker table and migrations are owned
   elsewhere. The `buildMonitorRows` builder already
   accepts a `lastReadAt` map, so the persisted-marker
   path is a service-level change once the table
   exists.
2. **A ticket with a trail entry starts unread on every
   load.** `listMonitorTickets` calls `buildMonitorRows`
   without a `lastReadAt` map, so the unread flag is
   derived from "has a trail entry" rather than from a
   stored marker. Within a session the page's
   acknowledgement set suppresses the dot; across
   sessions the row shows unread again. This is the v1
   behaviour the follow-up above would change.

### Notes

- The Playwright spec resets the in-memory dev store in
  a `beforeEach`, so every case sees the same seed
  fixture set.
- The cross-ward unit cases plant a ticket directly into
  the dev store (every seeded ticket lives in ward_14),
  which is why the test reaches for `getStore()`.
- The bolt added no package dependency.
- The shared route spec is named
  `26-dispatcher-monitor-performance.spec.ts` because it
  covers both dispatcher surfaces; this bolt owns the
  monitor half, Bolt 008-014 owns the performance half.
