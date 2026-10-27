---
id: 008-014-dispatcher-performance-reporting
unit: 007-performance-reporting
intent: 003-dispatcher-queue
type: simple-construction-bolt
status: complete
stories:
  - DISP-009-performance-reporting
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
  estimated_files: 6
---

# Bolt 008-014 — Dispatcher Performance Reporting

## Purpose

Land the dispatcher's ward performance snapshot (Intent
003 Unit 007, story DISP-009) in one bolt:

1. A new read API,
   `GET /api/v1/dispatcher/performance`, that returns
   the ward's throughput snapshot over a date range:
   three hero stats with deltas vs the previous period,
   three chart series, a crew performance table, and a
   long-tail list of the oldest still-open tickets.
2. A new page, `app/dispatcher/performance/page.tsx`,
   that renders the snapshot as a calm, print-friendly
   report with a date-range picker, three inline-SVG
   charts — each with an accessible `<table>` sibling —
   a sortable crew table, and PDF / CSV export controls.

This surface was deferred to v1.1 alongside the map
view (Unit 005) and the live monitor (Unit 006). It
deliberately does NOT poll: it is a reporting surface,
so it refreshes when the date range changes or when the
dispatcher reloads. No charting library is added and no
PDF library is added: the charts are hand-rolled inline
SVG, and the PDF export is the browser's print dialog
with an `@media print` stylesheet.

## Stories

### From Unit 007 (performance reporting)
| Story ID | Title | FR |
|----|-------|----|
| DISP-009-performance-reporting | Dispatcher performance reporting (v1.1) | DISP-REQ-007-adjacent (v1.1 dispatcher surfaces) |

## Files Created

- `app/api/v1/dispatcher/performance/route.ts` — new GET
  route: the ward snapshot.
- `app/dispatcher/performance/page.tsx` — new page: the
  header, the hero cards, the charts, the crew table,
  the long-tail list, the export controls.
- `lib/dispatcher/performance.ts` — new service: the
  range resolver, the hero-stat builder, the three chart
  builders, the crew table builder, the long-tail
  builder, the DB-facing read.
- `tests/unit/dispatcher/performance.test.ts` — new Vitest
  suite for the service.
- `tests/26-dispatcher-monitor-performance.spec.ts` —
  the shared Playwright route spec. Bolt 008-013 owns
  the monitor half of this file; this bolt owns the
  performance half.

## Files Modified

- `lib/i18n/keys.ts` — new `dispatcher.performance.*`
  keys, both `bn` and `en`.

## Implementation Notes

### Service split

`lib/dispatcher/performance.ts` splits into a set of
exported pure builders and one DB-facing read:

| Function | Kind | Purpose |
|----------|------|---------|
| `resolvePerfRange` | pure | `from` / `to` / `days` → an ISO range |
| `toBanglaDigits` | pure | ASCII digits → Bangla digits (০১২৩৪৫৬৭৮৯) |
| `buildHeroStats` | pure | the three hero stats + their deltas |
| `buildSubmittedVsResolved` | pure | one point per day in the range |
| `buildCategoryBreakdown` | pure | one row per category, count desc |
| `buildStatusBreakdown` | pure | every canonical status, count |
| `buildCrewTable` | pure | per-crew throughput + feedback ratio |
| `buildLongTail` | pure | the oldest still-open tickets, capped |
| `buildPerformanceSnapshot` | pure | the whole envelope assembled |
| `getPerformanceSnapshot` | DB-facing | the ward-scoped read |

The pure builders are exported so the Vitest suite can
pin the arithmetic with fixture arrays and no database.

### Date-range handling

The range is applied in JS, not in the query: the dev
store's `findMany` does string-equality on every `where`
key, so a `{gte, lte}` clause never matches there. This
follows the pattern already established in
`lib/admin/tickets-query.ts`.

The "previous period" the hero deltas compare against is
the equally-long window immediately before the current
one — computed from the resolved range's own length, so
a custom range gets a matching comparison window.

The route accepts `from`, `to` and `days` (1–90,
default 7). The page always sends an explicit `from` /
`to` pair, resolved client-side from the selected preset
(`today` / `last7` / `last30` / `custom`).

### Hero stats

| Stat | Value | Delta |
|------|-------|-------|
| Total reports | the count of tickets created in the range | count − previous period's count |
| Resolution rate | `%` of tickets in the range that are `resolved` or `closed` | percentage-point difference vs the previous period |
| Avg time-to-resolve | the mean creation → resolution time | raw millisecond difference vs the previous period |

A negative avg-time delta is GOOD (faster), so the hero
card inverts the colour direction for the duration kind.
A zero delta renders the localized "no delta" copy
rather than an arrow.

### Crew table

Per crew member: jobs completed (tickets in the range
that are `resolved` or `closed` and assigned to that
crew), avg time-to-resolve over those jobs (null when
the crew has no timed job), and the positive/negative
feedback ratio.

`FEEDBACK_MIN_SAMPLES` is 5 — the spec's "not enough
data" rule. Below that many feedback samples the ratio
is suppressed (null) and the cell renders the localized
"not enough data" copy rather than a misleading 0% or
100%. At or above the threshold the ratio renders, and a
ratio below 50% also renders a "low feedback" badge.

The v1 schema has no `specialty` column on the crew
user, so the specialty column carries the crew member's
`departmentId` as the closest available proxy, and
renders the localized "unknown" copy when that is null.

Null sort values always sort last, in either direction.

### Ward label

The response carries the bare ward NUMBER ("14" / "১৪"),
not the ward's full name ("Ward 14 — Mirpur"), because
the header template already supplies the "Ward {ward}"
prefix — a full name would render as "Ward Ward 14 —
Mirpur". The Bangla header uses the Bangla-digit form
via `toBanglaDigits`.

### Charts

Three inline-SVG charts, each with a visually-hidden
`<table>` sibling built from the same data array:

| Chart | Shape | Data |
|-------|-------|------|
| Submitted vs resolved | two-line chart with gridlines | one point per day in the range, zero-filled so the axis is continuous |
| Category breakdown | horizontal bars | one row per category, count desc |
| Status donut | ring segments + a centred total + a legend list | every canonical status, including the zero-count ones, so the legend is stable |

Each SVG carries `role="img"` and an `aria-label`; each
table sibling carries a `<caption>` and
`<th scope="col">` headers.

### Export

- **CSV** — built from the snapshot as a
  `section,key,value` ledger (the hero values, the
  category breakdown, the status breakdown, the crew
  table, the long-tail list), escaped by the `csvEscape`
  helper (quotes, commas and newlines), then handed to a
  `Blob` and downloaded as
  `cityfix-ward-performance.csv`.
- **PDF** — `window.print()`. The page's `@media print`
  stylesheet hides the back arrow, the date-range picker
  and the export controls, and flattens the chart and
  table sections (`break-inside: avoid`) so they do not
  split across pages.

### i18n keys

The new keys live under `dispatcher.performance.*` and
ship in both `bn` and `en`, per `team.md` Mandated:
`title`, `ward_title`, `back`, the five `range.*` labels,
the six `hero.*` strings, the six chart titles and
captions, the five chart column headers, the ten
`crew.*` strings, the eight `long_tail.*` strings, the
four `export.*` strings, `empty`, `error`,
`signin_required`, `loading`, and the three
`duration.*` formats.

The `duration.*` keys are shared with the live monitor
(Bolt 008-013), which formats durations identically.

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
- The performance half of the shared Playwright route
  spec is green.

## Out of Scope

- Polling. A reporting surface is a snapshot; it
  refreshes on a range change or a reload.
- Citizen-facing feedback capture. The crew table's
  feedback ratio reads a supplied feedback aggregate;
  the v1 schema has no citizen-feedback table.
- Comparing two wards side by side.
- Scheduling or emailing the report.
- Server-side PDF generation (the browser's print
  dialog is the v1 path).
- A charting library — the charts are inline SVG with
  accessible table siblings.
- A dashboard entry point linking to the report.

## Risk Posture

| Risk | Mitigation |
|------|-----------|
| The range filter is applied in code, not in the query | The dev store's `findMany` does string-equality on every `where` key, so a range clause never matches there; the code-level filter is the only shape that works on both backends. |
| A 90-day range blows up the DOM | `buildSubmittedVsResolved` caps the number of day buckets, so a wide range cannot produce an unbounded series. |
| The feedback ratio reads as 0% when there is no data | `FEEDBACK_MIN_SAMPLES` (5) suppresses the ratio below the threshold; the cell renders the localized "not enough data" copy instead. |
| The header reads "Ward Ward 14" | The response carries the bare ward number; the header template supplies the "Ward" word. The Playwright case asserts the heading does NOT contain "Ward Ward". |
| A delta's direction is misread | The duration kind inverts the colour direction (a negative avg-time delta is favourable); the count and percent kinds do not. |
| CSV cells with commas or quotes break the file | Every free-text cell goes through the `csvEscape` helper, which quotes the value and doubles any inner quote. |
| The printed report carries the UI chrome | The `@media print` stylesheet hides the back arrow, the date picker and the export controls, and prevents the sections from breaking across pages. |
| The report silently excludes another ward | The read is ward-scoped to the session's ward, and the route rejects a `?cityId=` that does not match the session with 403 `cross_city_access_denied`. |
| A new i18n key ships without a Bangla translation | Every new key ships in both `bn` and `en`; the registry's typed i18n check runs before merge. |
| The time-dependent page would gate the merge on a stale visual baseline | The Playwright spec carries no visual-regression baseline — the surface is date-dependent, so baselines are left to the mockup suite. |
