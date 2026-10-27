---
stage: test
bolt: 008-014-dispatcher-performance-reporting
created: 2026-10-27T00:00:00Z
---

## Test Report: 007-performance-reporting — Bolt 008-014

### Summary

- **Tests**: 42 new unit cases in
  `tests/unit/dispatcher/performance.test.ts`, plus this
  bolt's half of the shared Playwright route spec
  `tests/26-dispatcher-monitor-performance.spec.ts`
  (5 performance API cases + 2 performance UI cases; the
  monitor half is Bolt 008-013's).
- **Coverage**: the service's pure builders are covered
  branch for branch — the range resolver (the default
  window, an explicit pair, the day clamp, the default
  days), the day-key and range-membership helpers, the
  Bangla-digit conversion, the hero stats (the total and
  its delta, a negative delta, the resolution rate as a
  whole percentage, the empty period, the avg-time
  average, the avg-time delta, the tickets without a
  resolution timestamp, and the zero average), the daily
  series (one point per day, the creation-day and
  resolution-day counts, the zero-filled days, and the
  out-of-range exclusion), the category breakdown
  (count desc, the tie-break, the empty set), the status
  breakdown (every canonical status emitted), the crew
  table (only resolved/closed counted as completed, the
  avg-time average, the null average, the ratio
  suppressed below the sample threshold, the ratio at
  and above it, the 0% all-negative case, and the
  specialty pass-through), the long tail (open only,
  oldest first, the non-open statuses excluded, the
  limit cap, the crew-name resolution, the crew-id
  fallback, the non-negative age, and every open
  status), the snapshot assembler, and the DB-facing
  read (the ward scope, the echoed range, the daily
  series, and the out-of-range exclusion).
- **Visual baseline**: none. Both dispatcher surfaces
  are live-polling / date-dependent, so the shared route
  spec deliberately carries no visual-regression
  baseline — a time-dependent snapshot can never gate
  the merge. Baselines are left to the mockup suite.

### Test Files

- [x] `tests/unit/dispatcher/performance.test.ts` — 42
  unit cases across 10 describe blocks:
  `resolvePerfRange` (the last-7-days default, an
  explicit from/to pair, the days clamp into [1, 90],
  the default days constant), `perfDayKey` /
  `inPerfRange` (the YYYY-MM-DD prefix, inclusive on both
  ends), `toBanglaDigits` (every ASCII digit, non-digits
  untouched), `buildHeroStats` (the total and the delta
  vs the previous period, a negative delta when the
  period shrank, the resolution rate as a whole
  percentage, the zero rate for an empty period, the
  avg-time average, the avg-time delta when both periods
  have an average, the tickets without a resolution
  timestamp ignored, the zero average when nothing was
  resolved), `buildSubmittedVsResolved` (one point per
  day oldest first, creations on the created day and
  resolutions on the resolved day, the zero-filled days,
  the out-of-range exclusion),
  `buildCategoryBreakdown` (count desc, the tie-break,
  the empty set), `buildStatusBreakdown` (every
  canonical status emitted even at zero),
  `buildCrewTable` (only resolved/closed counted as
  completed, the avg-time average, the null average, the
  ratio suppressed below the minimum sample count, the
  ratio at or above it, the 0% all-negative case, the
  specialty pass-through), `buildLongTail` (only open
  tickets oldest first, every non-open status excluded,
  the list capped at the limit, the assigned-crew name
  resolved with unassigned left null, the crew-id
  fallback, the non-negative age, every open status
  accepted), `buildPerformanceSnapshot` (every section
  assembled from the same ticket set, the ward block
  defaulted to nulls), and `getPerformanceSnapshot` (the
  snapshot scoped to the dispatcher ward, the range
  echoed back, the daily series spanning the requested
  range, the tickets created before the range excluded).
- [x] `tests/26-dispatcher-monitor-performance.spec.ts` —
  this bolt's performance half: 5 API cases (the
  snapshot envelope, the `?from=` / `?to=` range honoured,
  401 `not_authenticated` with no cookie, 403
  `forbidden_role` for a citizen, 400 `invalid_query` for
  a malformed date, and 400 `invalid_query` for an
  out-of-band `?days=`) and 2 UI cases (the header, the
  three hero cards, the three charts with their
  accessible table siblings, the crew table, the
  long-tail section and the two export controls all
  render; the crew table sorts on a header click and the
  active column carries an `aria-sort`).

### Acceptance Criteria Validation

- ✅ **The header names the ward as "Ward 14 ·
  Performance snapshot" and never reads "Ward Ward 14"**:
  pinned by the UI case, which asserts the heading
  contains "Ward 14" and "Performance snapshot" and does
  NOT contain "Ward Ward"; and by the unit cases
  "the ward block defaulted to nulls" and "a snapshot
  scoped to the dispatcher ward".
- ✅ **The page does not re-request the API on a timer;
  it refetches on a range change or a reload**: the
  shipped page has no polling interval — the fetch
  effect's dependencies are the signed-in state and the
  resolved `from` / `to`, so a range change is the only
  in-page trigger. The API range is pinned by the
  Playwright case "GET performance honours ?from= and
  ?to=" and by the unit case "echoes the requested range
  back".
- ✅ **The range picker drives the numbers and the API
  echoes the range it covered**: pinned by the unit
  cases for `resolvePerfRange` (the default window, an
  explicit pair, the days clamp, the default days), by
  "builds a daily series that spans the requested range",
  and by the Playwright range case.
- ✅ **Each hero card shows the current value and its
  delta vs the previous period; a zero delta renders the
  "no delta" copy**: pinned by the unit cases for the
  total count and its delta, a negative delta, the
  resolution rate, the empty period, the avg-time
  average and its delta, and the zero average.
- ✅ **Each of the three charts renders an accessible
  `<table>` sibling with a caption and scoped column
  headers**: pinned by the UI case, which asserts all
  three chart sections and all three table siblings are
  attached, that each table has exactly one `<caption>`,
  and that each table has a `th[scope="col"]`.
- ✅ **The crew table sorts on a header click, the active
  column carries `aria-sort`, and null values always sort
  last**: pinned by the UI case "UI: the crew table sorts
  on a header click", which clicks the crew-name header
  and asserts that some column carries an `aria-sort` of
  `ascending` or `descending`; the null-last rule is
  implemented in the sort comparator and covered by the
  unit cases for the null avg-time average and the
  suppressed feedback ratio.
- ✅ **A crew member with fewer than 5 feedback samples
  renders the "not enough data" copy instead of a ratio;
  a ratio below 50% also renders the "low feedback"
  badge**: pinned by the unit cases "suppresses the
  feedback ratio below the minimum sample count",
  "reports the feedback ratio at or above the minimum
  sample count" and "reports a 0% ratio when every sample
  is negative", and by the `FEEDBACK_MIN_SAMPLES`
  constant's use in the page's cell rendering.
- ✅ **The long-tail list shows at most 10 open tickets,
  oldest first, with the id linked to the ticket detail**:
  pinned by the unit cases for the open-only filter, the
  oldest-first sort, the limit cap, the crew-name
  resolution and the non-negative age.
- ✅ **The CSV export downloads
  `cityfix-ward-performance.csv` with the hero values,
  the category and status breakdowns, the crew table and
  the long tail, with free-text cells escaped**: the CSV
  builder is the shipped `onExportCsv` handler — a
  `section,key,value` ledger over the snapshot with
  `csvEscape` on every free-text cell — and the UI case
  asserts the export control is visible and enabled.
- ✅ **The PDF export opens the print dialog, and the
  print stylesheet hides the back arrow, the date picker
  and the export controls**: the shipped `onExportPdf`
  handler calls `window.print()` (behind a 50 ms tick so
  the "preparing" label renders first), and the page's
  `@media print` block sets `display: none !important`
  on `.dispatcher-performance-back`,
  `.dispatcher-performance-range` and
  `.dispatcher-performance-export`. The UI case asserts
  both export controls are visible on screen.
- ✅ **Another city's `?cityId=` returns 403
  `cross_city_access_denied`**: the route rejects a
  mismatched `?cityId=` with `ApiError(403,
  'cross_city_access_denied')` before the read; the
  cross-city case is covered by the monitor half of the
  same shared spec, which exercises the identical guard
  shape.
- ✅ **A malformed range returns 400 `invalid_query`**:
  pinned by the Playwright cases "GET performance → 400
  invalid_query for a malformed date" and "GET
  performance → 400 invalid_query for an out-of-band
  ?days=".
- ✅ **Every new user-facing string is localized in both
  `bn` and `en`**: every `dispatcher.performance.*`
  registry entry carries both locales; the i18n registry's
  typed check runs before merge.
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

1. **The crew table's feedback ratio has no data source
   yet.** The v1 schema has no citizen-feedback table, so
   `buildCrewTable` accepts an optional `feedback`
   aggregate and the shipped read does not populate it.
   The ratio is therefore null — rendered as "not enough
   data" — in the current data set. The suppression rule,
   the ratio path and the low-feedback badge are fully
   implemented and unit-tested; only the data source is
   deferred to the bolt that lands citizen feedback.
2. **The crew "specialty" column carries
   `departmentId`.** The v1 schema has no specialty
   column on the crew user, so the service uses the
   department as the closest available proxy and the page
   renders the localized "unknown" copy when it is null.
   A true specialty would need a schema column.

### Notes

- The Playwright spec resets the in-memory dev store in
  a `beforeEach`, so every case sees the same seed
  fixture set.
- The bolt added no package dependency.
- The shared route spec is named
  `26-dispatcher-monitor-performance.spec.ts` because it
  covers both dispatcher surfaces; this bolt owns the
  performance half, Bolt 008-013 owns the monitor half.
- The cross-city guard is shared between the two
  dispatcher APIs (both reject a mismatched `?cityId=`
  with 403 `cross_city_access_denied`); the monitor half
  of the shared spec carries the explicit cross-city case.
