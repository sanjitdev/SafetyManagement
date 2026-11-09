---
unit: 007-performance-reporting
intent: 003-dispatcher-queue
phase: construction
status: complete
created: 2026-10-27T00:00:00Z
updated: 2026-10-27T00:00:00Z
---

# Unit Brief: Performance Reporting

## Status

Delivered in Bolt 008-014 (2026-10-27). The ward
performance snapshot stands up as the seventh dispatcher
surface, alongside the triage queue (Unit 002), the
per-ticket detail (Unit 003), the dedup-decline review
(Unit 004), the map view (Unit 005) and the live
monitor (Unit 006).

This surface was deferred to v1.1 alongside the map
view and the live monitor. It shipped as a calm,
factual, print-friendly report: a hero-stat snapshot of
the ward's throughput, three charts, a sortable crew
table, a long-tail list of the oldest still-open
tickets, and PDF / CSV export.

## Why deferred

- The v1 dispatcher surfaces (queue, detail, dedup)
  are all action surfaces. A reporting surface answers
  "how is the ward doing", which is a review
  question, not a dispatch question.
- The metrics it needs — resolution rate, avg
  time-to-resolve, crew throughput — were not
  computed anywhere else, so the unit was a genuine
  addition rather than a re-skin of the queue.
- The spec's export affordances (PDF / CSV) imply a
  projector-and-screenshot use case, which is a
  reporting-room habit, not a dispatch-floor habit.

## Purpose

Stand up the ward performance snapshot —
`/dispatcher/performance` — a print-friendly report of
how the dispatcher's ward is performing over a
date range, which the dispatcher can pull up on a
projector, screenshot, or export.

Layout (per UX spec 2.7, "Ward Performance Snapshot"):

- 960px page cap.
- Sticky 64px header: back arrow (left), "Ward N ·
  Performance snapshot" (centre), date-range picker
  (right).
- Three hero stat cards (total reports + delta,
  resolution rate + delta, avg time-to-resolve +
  delta).
- Three charts: submitted-vs-resolved line, category
  breakdown horizontal bar, status donut.
- Sortable crew performance table.
- Long-tail list of the 10 oldest still-open tickets.
- Export PDF (primary) + CSV (secondary) controls.
- A print stylesheet that hides the back arrow, date
  picker and export controls.

Real-time: this page is a SNAPSHOT — it does NOT
poll. It refreshes when the date range changes or when
the dispatcher reloads.

## Scope

### In Scope

- New API:
  `GET /api/v1/dispatcher/performance` — the ward
  snapshot. Returns
  `{ hero, submittedVsResolved, categoryBreakdown,
  statusBreakdown, crewTable, longTail, range, ward }`.
- New page:
  `app/dispatcher/performance/page.tsx` — the header,
  the three hero cards, the three charts, the sortable
  crew table, the long-tail list and the export
  controls.
- New service:
  `lib/dispatcher/performance.ts` — the range
  resolver, the hero-stat builder, the three chart
  builders, the crew table builder, the long-tail
  builder, and the DB-facing read.
- Date-range selection: `today` / `last7` (default) /
  `last30` / `custom`, resolved client-side into
  `from` / `to` query parameters.
- Three inline-SVG charts, each with an accessible
  `<table>` sibling (caption + `<th scope="col">`)
  rendering the same data. No charting library is
  added.
- Sortable crew table with `aria-sort` on the active
  column; null values always sort last.
- CSV export via `Blob` + a `csvEscape` helper.
- PDF export via `window.print()` with an
  `@media print` stylesheet.
- Cross-ward / cross-city denial on the API.

### Out of Scope

- Polling. A reporting surface is a snapshot; it
  refreshes on a range change or a reload.
- Citizen-facing feedback. The crew table's feedback
  ratio reads a supplied feedback aggregate; the
  v1 schema has no citizen-feedback table, so the
  shipped ratio is fed by the caller and is null
  (rendered as "not enough data") below
  `FEEDBACK_MIN_SAMPLES` (5).
- Comparing two wards side by side.
- Scheduling or emailing the report.
- PDF generation server-side (the browser's print
  dialog is the v1 path).
- The live monitor's 5-second polling — Unit 006.

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
| DISP-009-performance-reporting | Dispatcher performance reporting (v1.1) | Should | done |

## Dependencies

### Depends On

| Unit | Reason |
|------|--------|
| Intent 001 (Unit 003) | `db.ticket.findMany` |
| Intent 003 (Unit 001) | `requireRole` + `requireSameCity` |
| Intent 003 (Unit 002) | the ward-scoped read pattern |
| Intent 001 (Unit 001) | `categoryLabel` for the category chart |

## Bolt Suggestions

A single `ddd-construction-bolt` — one service, one
API route, one page, one unit test file and one
shared Playwright spec.

## Notes

The shipped service splits into pure builders
(`buildHeroStats`, `buildSubmittedVsResolved`,
`buildCategoryBreakdown`, `buildStatusBreakdown`,
`buildCrewTable`, `buildLongTail`,
`buildPerformanceSnapshot`) and a DB-facing read
(`getPerformanceSnapshot`). The pure builders are
exported so the Vitest suite can pin the arithmetic
with fixture arrays and no database.

Date-range handling follows the pattern in
`lib/admin/tickets-query.ts`: the range is applied in
JS, because the dev store's `findMany` does
string-equality on every `where` key, so a
`{gte, lte}` clause never matches there. The
"previous period" the hero deltas compare against is
the equally-long window immediately before the
current one.

The ward label carried in the response is the bare
ward NUMBER ("14" / "১৪"), not the ward's full name
("Ward 14 — Mirpur"), because the header template
already supplies the "Ward {ward}" prefix — a full
name would render as "Ward Ward 14 — Mirpur".

The v1 schema has no `specialty` column on the crew
user, so the crew table's specialty column carries the
crew member's `departmentId` as the closest available
proxy, and renders the localized "unknown" copy when
that is null.

A negative delta on "avg time to resolve" is GOOD
(faster), so the hero card inverts the color direction
for the duration kind.

`FEEDBACK_MIN_SAMPLES` (5) is the spec's "not enough
data" rule: below that many feedback samples the
positive-feedback ratio is suppressed (null) rather
than rendered as a misleading 0% or 100%.

The date-range picker is `today` / `last7` /
`last30` / `custom`. The service also accepts a
`days` query parameter (1–90, default 7) for
callers that prefer a day count to an explicit range.
