---
stage: implement
bolt: 008-014-dispatcher-performance-reporting
created: 2026-10-27T00:00:00Z
---

## Implementation Walkthrough: 007-performance-reporting — Bolt 008-014

### Summary

Stood up the dispatcher's ward performance snapshot: a
read API that returns the ward's throughput over a date
range — three hero stats with deltas, three chart
series, a crew performance table and a long-tail list —
and a page that renders it as a print-friendly report
with a date-range picker, a sortable crew table and
PDF / CSV export. The service is split into exported
pure builders (which the Vitest suite drives with
fixture arrays, no database) and one DB-facing read
(exercised against the real in-memory dev store).

### Structure Overview

- **Service** — `lib/dispatcher/performance.ts` holds
  the range resolver, the hero-stat builder, the three
  chart builders, the crew table builder, the long-tail
  builder, the snapshot assembler and the DB-facing
  read.
- **Read API** —
  `app/api/v1/dispatcher/performance/route.ts` (GET) is
  the trust boundary: `requireRole(session,
  'dispatcher')`, `requireSameCity`, and a `?cityId=`
  that must match the session.
- **Page** — `app/dispatcher/performance/page.tsx`
  renders the sticky header, the hero cards, the three
  charts, the crew table, the long-tail list and the
  export controls, plus the `@media print` stylesheet.

### Completed Work

- [x] `lib/dispatcher/performance.ts` — new service.
  Exports `PERFORMANCE_DEFAULT_DAYS` (7),
  `PERFORMANCE_MAX_DAYS` (90),
  `PERFORMANCE_LONG_TAIL_LIMIT` (10),
  `PERFORMANCE_OPEN_STATUSES`,
  `PERFORMANCE_STATUS_ORDER`, `FEEDBACK_MIN_SAMPLES`
  (5), the snapshot types, and the functions
  `toBanglaDigits`, `resolvePerfRange`, `perfDayKey`,
  `inPerfRange`, `buildHeroStats`,
  `buildSubmittedVsResolved`, `buildCategoryBreakdown`,
  `buildStatusBreakdown`, `buildCrewTable`,
  `buildLongTail`, `buildPerformanceSnapshot` and
  `getPerformanceSnapshot`.
- [x] `app/api/v1/dispatcher/performance/route.ts` — new
  GET route. Zod-validates `from`, `to` (both parseable
  ISO date-times), `days` (1–90, default 7) and
  `cityId`; returns the full snapshot envelope.
- [x] `app/dispatcher/performance/page.tsx` — new page.
  Renders the sticky header with the range picker, the
  three hero cards, the three chart sections, the
  sortable crew table, the long-tail list, the export
  controls, and the print stylesheet.
- [x] `lib/i18n/keys.ts` — new `dispatcher.performance.*`
  keys, both `bn` and `en`.
- [x] `tests/unit/dispatcher/performance.test.ts` — new
  Vitest suite.
- [x] `tests/26-dispatcher-monitor-performance.spec.ts` —
  the performance half of the shared Playwright route
  spec (the monitor half is Bolt 008-013's).

### Key Decisions

- **Split the service into pure builders and one
  DB-facing read.** The arithmetic (the hero deltas, the
  daily series, the crew throughput, the feedback
  suppression rule) is the part that is easy to get
  subtly wrong. Exporting the builders lets the Vitest
  suite pin it with fixture arrays and no database, while
  the read is still exercised against the real in-memory
  dev store so the facade wiring is covered.
- **Apply the date range in code, not in the query.** The
  dev store's `findMany` does string-equality on every
  `where` key, so a `{gte, lte}` clause never matches
  there. This follows the pattern already established in
  `lib/admin/tickets-query.ts`.
- **Do NOT poll.** This is a reporting surface, not a
  live one. The page refetches only when the date range
  changes or when the dispatcher reloads. The deliberate
  contrast with the live monitor (Unit 006), which polls
  every 5 seconds, is what the unit brief records.
- **Derive the previous period from the range's own
  length.** The comparison window is the equally-long
  window immediately before the current one, so a custom
  3-day range is compared against the preceding 3 days
  rather than a hard-coded week.
- **Carry the bare ward number, not the ward's full
  name.** The header template already supplies the "Ward
  {ward}" prefix, so a full name ("Ward 14 — Mirpur")
  would render as "Ward Ward 14 — Mirpur". The response
  carries the bare number, with a Bangla-digit variant
  via `toBanglaDigits`.
- **Suppress the feedback ratio below 5 samples.**
  `FEEDBACK_MIN_SAMPLES` is the spec's "not enough data"
  rule: below it the ratio is null and the cell renders
  the localized copy, rather than a misleading 0% or
  100%. At or above it the ratio renders, and a ratio
  below 50% also renders the "low feedback" badge.
- **Use `departmentId` as the crew specialty proxy.** The
  v1 schema has no `specialty` column on the crew user;
  `departmentId` is the closest available proxy, and the
  cell renders the localized "unknown" copy when it is
  null.
- **Hand-roll the charts as inline SVG with table
  siblings.** No charting library is added. Each chart
  renders a visually-hidden `<table>` from the same data
  array, with a `<caption>` and `<th scope="col">`
  headers.
- **Export without a library.** CSV is a string ledger
  handed to a `Blob`; PDF is `window.print()` plus an
  `@media print` stylesheet. No PDF package is added, and
  no server-side rendering path is introduced.
- **Sort nulls last in both directions.** A crew with no
  timed job has a null average; pushing it to the bottom
  in either sort direction keeps it from crowding the
  top of the table.

### Deviations from Plan

- **The crew table's specialty column carries the
  crew's `departmentId`,** not a true specialty. The plan
  assumed a specialty field. The v1 schema has no such
  column, so the service documents the proxy in a code
  comment and the page renders the localized "unknown"
  copy when the proxy is null.
- **The feedback ratio is fed by a supplied aggregate,
  not read from a citizen-feedback table.** The v1 schema
  has no citizen-feedback table, so `buildCrewTable`
  accepts an optional `feedback` array and the shipped
  read does not populate it — the ratio is therefore null
  (rendered as "not enough data") in the current data
  set. The suppression rule and the badge path are fully
  implemented and unit-tested; only the data source is
  deferred.
- **The API accepts `days` as well as `from` / `to`.** The
  plan described only an explicit range. The service
  supports a day count (1–90, default 7) for callers
  that prefer it; the page always sends an explicit
  `from` / `to` pair resolved from its preset.
- **No `dispatcher.performance.*` key count of 7.** The
  summary that seeded this paperwork described the
  namespace as "7 keys"; the shipped namespace carries
  every string the surface renders (header and range
  labels, the six hero strings, the chart titles and
  captions, the column headers, the ten crew strings, the
  eight long-tail strings, the export labels, the
  empty / error / loading states, and the three duration
  formats) in both `bn` and `en`.

### Dependencies Added

None. The bolt adds no package dependency: the charts
are plain JSX `<svg>` elements, the CSV export uses the
platform `Blob` / `URL.createObjectURL` APIs, and the
PDF export uses `window.print()`.

### Developer Notes

- `buildSubmittedVsResolved` emits one point per day in
  the range, zero-filled so the x-axis is continuous, and
  caps the bucket count so a wide custom range cannot
  produce an unbounded series.
- `buildStatusBreakdown` emits every canonical status —
  including the zero-count ones — so the donut legend is
  stable across ranges.
- `buildCategoryBreakdown` sorts by count descending and
  breaks ties on `categoryId` for a stable order.
- `buildLongTail` filters to the open statuses, sorts by
  `createdAt` ascending and caps the list at
  `PERFORMANCE_LONG_TAIL_LIMIT` (10).
- The hero card's `deltaKind` drives both the formatting
  and the colour direction: `count` and `percent` read a
  positive delta as favourable, `duration` inverts it (a
  negative avg-time delta means "faster this period").
- The crew table's `<th>` elements carry `aria-sort` —
  `ascending` or `descending` on the active column,
  `none` on the inactive ones.
- The long-tail ticket id is a `<Link>` to
  `/dispatcher/tickets/[id]`.
- The CSV ledger uses a `section,key,value` shape with a
  header row per section, so the export is readable as
  well as parseable. Free-text cells (crew name,
  specialty, assigned crew name) go through `csvEscape`.
- The print stylesheet also sets `break-inside: avoid` on
  the chart, crew-table and long-tail sections so a
  printed report does not split a section across pages.
- The page reads the language from `localStorage`
  (`cityfix.preferred_language.v1`) and re-syncs on the
  `storage` event, on `focus`, and on a 1-second interval —
  the same language-sync shape the other dispatcher pages
  use.
- The `duration.*` keys are shared with the live monitor
  (Bolt 008-013), which formats durations identically.
