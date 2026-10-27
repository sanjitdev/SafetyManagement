---
stage: plan
bolt: 008-016-admin-adoption-dashboard
created: 2026-10-27T00:00:00Z
---

## Implementation Plan: 006-adoption-dashboard — Bolt 008-016

### Objective

Ship the 4.7 Post-launch Adoption Dashboard
admin surface: an admin-only page at
`/admin/cities/[id]/adoption` showing a city's
adoption signal after launch — the four hero
stats, the five-stage adoption funnel, the
three-line daily activity chart, the ward
heatmap, the three engagement signals, the
health flags and the optional "Compare with
Dhaka" overlay — with a date-range control and
a CSV export.

### Deliverables

- An admin-only adoption dashboard page with
  a date-range control, a Dhaka comparison
  toggle, the export actions and the seven
  sections.
- Two API route handlers: the dashboard
  payload (GET) and the CSV export (GET).
- One service module — `lib/admin/adoption.ts`,
  the pure domain logic behind every number on
  the page.
- Bilingual copy for every new surface string.
- A Vitest suite for the domain logic, plus
  the adoption assertions on the shared
  Playwright spec.

### Dependencies

- `lib/admin/users-db.ts` — the adoption reads
  (`listCityTickets`, `listTicketTrail`,
  `listCityCitizens`, `listCityStaff`) already
  live here from Bolt 008-015, and this bolt
  reuses them rather than re-querying.
- `lib/auth/guards.ts` — `requireRole`. The
  dashboard is a read, so it does NOT require
  `requireWebAuthn`; only the admin role gate
  applies.
- `lib/i18n/keys.ts` — the new
  `admin.adoption.*` namespace.
- `app/admin/cities/page.tsx` — the city
  overview table's per-city link row.
- The Prisma migration
  `20261027140000_platform_gaps` (authored in
  the same batch; NOT YET APPLIED — see the
  risk section).

### Technical Approach

**One pure domain module.** `lib/admin/adoption.ts`
has no DB and no Next dependency, so every
number on the page is unit-testable without a
runtime. The route handler fetches the raw rows
through `lib/admin/users-db.ts` and hands them
to the builder; the page receives the finished
result and renders it.

**Inline SVG, no charting library.** The
project has no charting library and none may be
added, so each chart is hand-built SVG: the
funnel is a stack of horizontal bars, the daily
activity chart is three `<path>` line series with
gridlines, and the heatmap is a grid of `<rect>`
cells with a colour ramp. Every chart carries a
`role="img"` and an `aria-label`.

**Every chart has a table sibling.** The
funnel, the daily chart and the heatmap each
render a table built from the SAME data array as
the graphic, so the information is reachable by a
screen reader and by the CSV export. The
Playwright spec asserts the table sibling exists
for all three.

**The export and the chart share one builder.**
`buildAdoptionCsvRows` in `lib/admin/adoption.ts`
builds the export rows from the same
`AdoptionDashboardResult` the page renders, so
the export and the on-screen chart cannot drift.

**The PDF export is not server-rendered.** The
charts are inline SVG and the project has no
rasteriser, so the PDF path uses the browser's
print stylesheet plus `window.print()`; the admin
picks "Save as PDF" in the print dialog. The CSV
export IS server-rendered.

**Three metrics are documented proxies.** The
platform layer does not (yet) record registration
events, page views, or feedback on every ticket,
so "Registered citizens", the funnel's first
stage ("Visit") and the funnel's last stage
("Provided feedback") are computed from proxy
data. Each is documented in the module header
with its v1.1 fix.

**No new dependency.** The bolt uses the
already-installed `vitest` and `playwright` dev
dependencies, the platform's existing `zod` and
Prisma client. No package dependency is added.

### API contracts

- `GET /api/v1/admin/cities/[id]/adoption` →
  200 `{ city, range, stats, funnel, daily,
  wards, engagement, flags, comparison }`.
  400 (`invalid_range`), 401 / 403
  (`forbidden_role`), 404 (`city_not_found`),
  500.
- `GET /api/v1/admin/cities/[id]/adoption/export`
  → 200 `text/csv; charset=utf-8` with
  `content-disposition: attachment`. 400, 401 /
  403, 404, 500.

### Acceptance Criteria

- [x] An admin sees four hero stats, each with
      the percentage change against the
      immediately-preceding window of the same
      length.
- [x] The five-stage adoption funnel is
      rendered, with each stage's count and its
      share of the first stage.
- [x] The daily activity chart shows three
      series (reports submitted, reports
      resolved, citizens registered) over the
      selected range.
- [x] The ward heatmap shows each ward's
      activity, with the ward's number.
- [x] The three engagement signals are shown:
      staff activity, citizen retention and crew
      response time.
- [x] The health flags are listed and each
      links to the surface that resolves it.
- [x] The optional "Compare with Dhaka" overlay
      is toggled by the admin and compares
      against the `dhaka-north` city.
- [x] The date-range control selects 7 days, 30
      days, since launch, or a custom range.
- [x] The CSV export is server-rendered and its
      rows come from the same builder as the
      on-screen charts.
- [x] A non-admin session is refused by both the
      API (403 `forbidden_role`) and the page
      (redirect).
- [x] The domain logic is covered by unit tests;
      the route and the API by the shared
      Playwright spec.
