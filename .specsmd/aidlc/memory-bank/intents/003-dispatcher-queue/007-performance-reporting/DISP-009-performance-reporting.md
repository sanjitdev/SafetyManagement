---
story: DISP-009-performance-reporting
unit: 007-performance-reporting
intent: 003-dispatcher-queue
phase: construction
status: done
created: 2026-10-27T00:00:00Z
updated: 2026-10-27T00:00:00Z
---

# Story: DISP-009 — Dispatcher Performance Reporting

> Deferred to v1.1 alongside the map view (DISP-007)
> and the live monitor (DISP-008).
> Construction: Bolt 008-014 (complete, 2026-10-27).

## Given / When / Then

### Acceptance 1 — The snapshot renders

**Given** a dispatcher session bound to
`(city_dhaka_north, ward_14)`
**When** the dispatcher opens
`/dispatcher/performance`
**Then** the page renders a sticky header reading
"Ward 14 · Performance snapshot" (the bare ward
number, so the heading never reads "Ward Ward
14"), three hero stat cards (total reports, resolution
rate, avg time-to-resolve — each with a delta vs the
previous period), three charts, a crew performance
table, a long-tail list, and the two export controls.

### Acceptance 2 — It is a snapshot, not a live feed

**Given** the dispatcher is on
`/dispatcher/performance`
**When** the page is left open for more than 5
seconds
**Then** the page does NOT re-request the API on a
timer. It re-fetches only when the date range
changes or when the dispatcher reloads the page.

### Acceptance 3 — The date range drives the numbers

**Given** the dispatcher is on
`/dispatcher/performance`
**When** the dispatcher picks "Today", "Last 7
days" (the default), "Last 30 days", or supplies a
custom from/to pair
**Then** the page re-requests
`GET /api/v1/dispatcher/performance?from=…&to=…`
with the resolved range, and the hero stats, charts,
crew table and long-tail list all reflect that range.
The API echoes the range it covered back to the
caller.

### Acceptance 4 — The hero stats carry deltas

**Given** a range with a previous period of equal
length
**When** the snapshot is built
**Then** each hero card shows the current value and
its delta vs the previous period: the total report
count delta, the resolution-rate delta in
percentage points, and the avg-time-to-resolve delta.
A negative avg-time delta renders as favourable
(faster), and a zero delta renders as the localized
"no delta" copy rather than an arrow.

### Acceptance 5 — Every chart has an accessible table

**Given** the snapshot is rendered
**When** the dispatcher uses a screen reader or
copies the data
**Then** each of the three charts (submitted vs
resolved line, category breakdown bars, status
donut) is an inline SVG with `role="img"` and an
`aria-label`, and each renders a sibling `<table>`
carrying the same data with a `<caption>` and
`<th scope="col">` headers. No charting library is
loaded.

### Acceptance 6 — The crew table sorts

**Given** the snapshot carries a crew table
**When** the dispatcher presses a column header
**Then** the rows re-sort by that column, the active
column's `<th>` carries `aria-sort="ascending"` or
`"descending"` (and `"none"` for the inactive
columns), and a null value always sorts last
regardless of direction.

### Acceptance 7 — The feedback ratio is suppressed when there is not enough data

**Given** a crew member with fewer than 5 feedback
samples
**When** the crew table renders that row
**Then** the feedback cell renders the localized
"not enough data" copy instead of a ratio. A crew
member at or above the threshold renders the
positive/negative ratio, and a ratio below 50% also
renders a "low feedback" badge.

### Acceptance 8 — The long tail lists the oldest still-open tickets

**Given** the ward has open tickets
(`submitted`/`routed`/`in_progress`)
**When** the long-tail list renders
**Then** it shows at most 10 rows, oldest first, with
the ticket id (linked to
`/dispatcher/tickets/[id]`), the category, the
submitted timestamp, the age, and the assigned crew
name (or the localized "unassigned" copy).

### Acceptance 9 — CSV export

**Given** a loaded snapshot
**When** the dispatcher presses the CSV export
button
**Then** the browser downloads
`cityfix-ward-performance.csv` built from the
snapshot: the hero values, the category breakdown,
the status breakdown, the crew table, and the
long-tail list. Any cell containing a quote, comma
or newline is escaped by the `csvEscape` helper.

### Acceptance 10 — PDF export

**Given** a loaded snapshot
**When** the dispatcher presses the PDF export
button
**Then** the browser's print dialog opens, and the
`@media print` stylesheet hides the back arrow, the
date-range picker and the export controls, and
flattens the chart and table sections so they do not
break across pages.

### Acceptance 11 — Cross-city denial

**Given** a dispatcher in `city_dhaka_north`
**When** the API
`GET /api/v1/dispatcher/performance?cityId=city_chittagong`
is called
**Then** the API returns 403
(`cross_city_access_denied`).

### Acceptance 12 — Malformed range is rejected

**Given** a dispatcher session
**When** the API is called with a malformed `from` /
`to` value, or with a `days` value outside 1–90
**Then** the API returns 400 (`invalid_query`).

## Technical Notes

- The service (`lib/dispatcher/performance.ts`) splits
  into pure builders (`buildHeroStats`,
  `buildSubmittedVsResolved`, `buildCategoryBreakdown`,
  `buildStatusBreakdown`, `buildCrewTable`,
  `buildLongTail`, `buildPerformanceSnapshot`) and a
  DB-facing read (`getPerformanceSnapshot`). The pure
  builders are exported so the Vitest suite can pin
  the arithmetic with fixture arrays and no
  database.
- Date-range handling follows the pattern in
  `lib/admin/tickets-query.ts`: the range is applied
  in JS, because the dev store's `findMany` does
  string-equality on every `where` key, so a
  `{gte, lte}` clause never matches there. The
  "previous period" the deltas compare against is the
  equally-long window immediately before the current
  one.
- The ward label carried in the response is the bare
  ward NUMBER ("14" / "১৪"), not the ward's full
  name, because the header template already supplies
  the "Ward {ward}" prefix.
- The v1 schema has no `specialty` column on the
  crew user, so the crew table's specialty column
  carries the crew member's `departmentId` as the
  closest available proxy, and renders the localized
  "unknown" copy when that is null.
- `FEEDBACK_MIN_SAMPLES` (5) is the spec's "not
  enough data" rule: below it the positive-feedback
  ratio is suppressed (null) rather than rendered as
  a misleading 0% or 100%.
- CSV export uses `Blob` + `URL.createObjectURL` with a
  `csvEscape` helper; PDF export uses `window.print()`
  (the browser's print dialog) with an `@media print`
  stylesheet. No PDF library is added.
- The three charts are inline SVG. Each renders a
  visually-hidden `<table>` sibling from the same
  data array (caption + `<th scope="col">`), so
  the data is available to screen readers and for
  copy/paste.

## Cross-references

- `app/api/v1/dispatcher/performance/route.ts` —
  new API (GET).
- `app/dispatcher/performance/page.tsx` — new
  page.
- `lib/dispatcher/performance.ts` — new service.
- `tests/unit/dispatcher/performance.test.ts` —
  Vitest unit suite.
- `tests/26-dispatcher-monitor-performance.spec.ts`
  — Playwright route spec (shared with Unit 006).
