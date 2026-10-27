---
stage: plan
bolt: 008-014-dispatcher-performance-reporting
created: 2026-10-27T00:00:00Z
---

## Implementation Plan: 007-performance-reporting — Bolt 008-014

### Objective

Land the dispatcher's ward performance snapshot (Intent
003 Unit 007, story DISP-009): a read API that returns
the ward's throughput snapshot over a date range, and a
page that renders it as a calm, factual, print-friendly
report with three hero stats, three charts, a sortable
crew table, a long-tail list, and PDF / CSV export.

The surface was deferred to v1.1 alongside the map view
(Unit 005) and the live monitor (Unit 006). It ships
now because the v1 dispatcher surfaces are all action
surfaces — the "how is the ward doing" question has no
home, and the ward's own metrics are computed nowhere
else.

### Deliverables

- A service that assembles the snapshot from a ticket
  set and a crew roster: three hero stats with deltas
  vs the previous period, three chart series, a crew
  table, and a long-tail list.
- A read API that returns the snapshot for the
  dispatcher's ward over the requested range.
- A page that renders the report with a date-range
  picker, three hero cards, three inline-SVG charts
  (each with an accessible `<table>` sibling), a
  sortable crew table, the long-tail list, and the two
  export controls.
- CSV export built from the snapshot; PDF export via the
  browser's print dialog with an `@media print`
  stylesheet.
- Localized copy for every new string, in both `bn` and
  `en`.
- A unit suite covering the pure builders and the
  DB-facing read, plus the performance half of the
  shared Playwright route spec.

### Dependencies

- `lib/db-switch.ts` — the `db` facade, so the service
  works on Prisma or the in-memory dev store.
- `lib/auth/guards.ts` — `requireRole`,
  `requireSameCity` and the `ApiError` class.
- `lib/identity/display-name.ts` — `categoryLabel` for
  the category breakdown chart.
- `lib/i18n/keys.ts` — the `dispatcher.performance.*`
  registry entries.
- `lib/admin/tickets-query.ts` — the date-range
  handling pattern (the range is applied in JS, because
  the dev store's `findMany` does string-equality on
  every `where` key).

### Technical Approach

The service is split in two. The **pure builders**
(`buildHeroStats`, `buildSubmittedVsResolved`,
`buildCategoryBreakdown`, `buildStatusBreakdown`,
`buildCrewTable`, `buildLongTail`,
`buildPerformanceSnapshot`) take a ticket set and return
the report's sections; they are exported so the Vitest
suite can pin the arithmetic with fixture arrays and no
database. The **DB-facing read** (`getPerformanceSnapshot`)
goes through the `db` facade and is exercised against the
real in-memory dev store.

The report is a **snapshot**, not a live feed: the page
re-fetches when the date range changes or when the
dispatcher reloads, and never on a timer. This is the
deliberate contrast with the live monitor (Unit 006), which
polls every 5 seconds.

The "previous period" the hero deltas compare against is
the equally-long window immediately before the current
one, derived from the resolved range's own length so a
custom range gets a matching comparison window.

The charts are hand-rolled inline SVG — no charting
library is added. Each chart renders a visually-hidden
`<table>` sibling from the same data array, with a
`<caption>` and `<th scope="col">` headers, so the
numbers reach screen readers and the clipboard.

Export is deliberately library-free too: CSV is built as
a string ledger and handed to a `Blob`; PDF is
`window.print()` plus an `@media print` stylesheet that
hides the interactive chrome.

### Acceptance Criteria

- [x] The header names the ward as "Ward 14 ·
      Performance snapshot" and never reads "Ward Ward
      14".
- [x] The page does not re-request the API on a timer;
      it refetches on a range change or a reload.
- [x] The range picker (Today / Last 7 days / Last 30
      days / custom) drives the numbers, and the API
      echoes the range it covered.
- [x] Each hero card shows the current value and its
      delta vs the previous period; a zero delta renders
      the "no delta" copy.
- [x] Each of the three charts renders an accessible
      `<table>` sibling with a caption and scoped column
      headers.
- [x] The crew table sorts on a header click, the active
      column carries `aria-sort`, and null values always
      sort last.
- [x] A crew member with fewer than 5 feedback samples
      renders the "not enough data" copy instead of a
      ratio; a ratio below 50% also renders the "low
      feedback" badge.
- [x] The long-tail list shows at most 10 open tickets,
      oldest first, with the id linked to the ticket
      detail.
- [x] The CSV export downloads
      `cityfix-ward-performance.csv` with the hero
      values, the category and status breakdowns, the crew
      table and the long tail, with free-text cells
      escaped.
- [x] The PDF export opens the print dialog, and the
      print stylesheet hides the back arrow, the date
      picker and the export controls.
- [x] Another city's `?cityId=` returns 403
      `cross_city_access_denied`, and a malformed range
      returns 400 `invalid_query`.
- [x] Every new user-facing string is localized in both
      `bn` and `en`.
- [x] `npx tsc --noEmit` is clean and the unit suite
      stays green.
