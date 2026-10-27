---
story: ADM-009-adoption-dashboard
unit: 006-adoption-dashboard
intent: 005-admin-city-setup
phase: construction
status: done
created: 2026-10-27T00:00:00Z
updated: 2026-10-27T00:00:00Z
---

# Story: ADM-009 — Admin Adoption Dashboard

> The 4.7 Post-launch Adoption Dashboard from
> WO-004 §4.7: the internal Aamir surface for
> "is this city actually being used, and is
> it working?" — the post-launch answer for
> the city operator. A previously deferred
> v1.1 surface, shipped in Bolt 008-016 as
> Unit 006 of Intent 005.

## Given / When / Then

### Acceptance 1 — The dashboard snapshot

**Given** an admin on
`/admin/cities/[id]/adoption`
**When** the page loads
**Then** the API
`GET /api/v1/admin/cities/[id]/adoption`
returns a single snapshot containing the four
hero stats, the five funnel stages, the
daily series, the ward activity, the three
engagement signals, the health flags and the
comparison overlay. The page renders every
section from that one payload; it does not
poll.

### Acceptance 2 — Hero stats and deltas

**Given** the dashboard payload
**When** the hero cards render
**Then** four cards are shown — registered
citizens, reports received, resolution rate
and average time to resolve — each with a
percentage delta against the immediately-
preceding window of the same length. A
shorter average resolve time reads as an
IMPROVEMENT (the duration delta is
inverted). Where there is no meaningful
baseline, the delta reads "no change"
rather than a spurious percentage.

### Acceptance 3 — The adoption funnel

**Given** the dashboard payload
**When** the funnel renders
**Then** five stages are shown — visit,
registered, submitted, second report,
provided feedback — each with its count and
the conversion rate from the previous stage.
The conversion is null (not zero) when the
previous stage is empty, so an empty funnel
is not reported as a 0% conversion.

### Acceptance 4 — Daily activity chart

**Given** a date range
**When** the daily chart renders
**Then** the chart plots three series —
reports submitted, reports resolved and
citizens registered — one point per day in
the range, including a zero row for a day
with no activity, so the x-axis is stable.

### Acceptance 5 — Ward heatmap

**Given** the dashboard payload
**When** the ward heatmap renders
**Then** one cell per ward is shown, shaded
by that ward's report count relative to the
busiest ward (a 0..1 intensity), and the
ward's report count is reported in the table
sibling.

### Acceptance 6 — Engagement signals

**Given** the dashboard payload
**When** the engagement signals render
**Then** three signals are shown — staff
activity (the percentage of staff who have
been seen in the last 7 days), citizen
retention (the percentage of citizens who
filed a second report within 30 days of
their first) and crew response time (the
median gap between the `routed` and
`in_progress` trail entries, over the
tickets that have both).

### Acceptance 7 — Health flags

**Given** a city with operational problems
**When** the health flags render
**Then** a flag is raised for each of:
a dispatcher who has not signed in for 7+
days, tickets unassigned for 7+ days, and a
ward with no reports for 14+ days. Each flag
links to the surface the admin should act
on. A healthy city renders the "no flags"
state.

### Acceptance 8 — Date range

**Given** an admin on the dashboard
**When** the admin selects "Last 7 days",
"Last 30 days", "Since launch" or a custom
`from` / `to` pair
**Then** the API is re-queried with the
matching `from` / `to` bounds and the
dashboard reflects that window. A bare
`YYYY-MM-DD` boundary covers the whole day.
An inverted range (`from` after `to`) is
rejected with 400 `invalid_range`.

### Acceptance 9 — CSV export

**Given** an admin on the dashboard
**When** the admin clicks "Export CSV"
**Then**
`GET /api/v1/admin/cities/[id]/adoption/export`
returns a `text/csv` attachment with the
header `date,reports_submitted,reports_resolved,citizens_registered`
and one row per day of the daily series for
the selected range. The rows are built from
the same function that builds the on-screen
chart, so the two can never drift.

### Acceptance 10 — PDF export

**Given** an admin on the dashboard
**When** the admin clicks "Export PDF"
**Then** the browser's print pipeline runs
(`window.print()`) against a print
stylesheet that hides the interactive chrome
and keeps each section unbroken. The admin
chooses "Save as PDF" in the print dialog.

### Acceptance 11 — Compare with Dhaka

**Given** an admin on the dashboard
**When** the admin turns on the comparison
toggle
**Then** the API is re-queried with
`compare=1` and the dashboard shows the
Dhaka city's reports received, resolution
rate and registered citizens over the SAME
date range, plus a fourth line on the daily
chart. The overlay is omitted when the
current city IS the Dhaka city.

### Acceptance 12 — Chart accessibility

**Given** any chart on the dashboard
**When** the page is inspected
**Then** the chart is an inline SVG with a
`role="img"` and an `aria-label`, and it has
a table sibling built from the SAME data, so
the information is reachable without seeing
the graphic.

### Acceptance 13 — Cross-role denial

**Given** a non-admin session (citizen /
dispatcher / crew)
**When** the session calls
`GET /api/v1/admin/cities/[id]/adoption`
**Then** the response is 403
`forbidden_role`. Anonymous (no cookie) →
401. The page redirects a non-admin session
away from the surface.

### Acceptance 14 — Read-only

**Given** the dashboard surface
**When** the admin attempts to call a
non-GET method on the adoption or adoption
export endpoints
**Then** the endpoint is not a write
surface. The dashboard is a view over the
ticket, user and trail rows; it never
mutates them.

## Technical Notes

- **Every chart is inline SVG.** The project
  has no charting library and none may be
  added, so the funnel, the daily activity
  chart and the ward heatmap are hand-built
  SVG. Each has a table sibling built from
  the same data array, so the information is
  reachable by a screen reader and by the
  CSV export.
- **The PDF export is not server-rendered.**
  Inline SVG cannot be rasterised on the
  server without a rendering dependency the
  project does not have, so the export uses
  the browser print stylesheet plus
  `window.print()`.
- **"Registered citizens" is a windowed
  proxy.** There is no registration-event
  table, so the stat counts the `citizen`-role
  `User` rows created inside the range — it
  reads "citizens who registered during this
  period", not "total citizens". A
  `RegistrationEvent` table (or a
  `registeredAt` column on `User`) is the
  v1.1 fix.
- **The funnel's "visit" stage is a proxy
  too.** There is no page-view /
  analytics-event table, so the first stage
  is the number of DISTINCT ticket reporters
  in range. An `AnalyticsEvent` table is the
  v1.1 fix.
- **The "provided feedback" stage reads
  `Ticket.feedback`** — the free-text slot
  the citizen fills after a resolution. A
  ticket that reached a terminal status but
  carries no feedback text is NOT counted.
- **`SlaPolicy` is not consulted anywhere.**
  The "average time to resolve" hero card is
  computed from the ticket rows themselves
  (`resolvedAt - createdAt` over the resolved
  tickets in range).
- **The daily series is capped at 180 days**
  so a "since launch" range on an old city
  cannot produce an unbounded array.
- **The Prisma migration
  `20261027140000_platform_gaps` is authored
  but NOT applied to any database.** The
  configured Neon instance was unreachable
  (`P1001: Can't reach database server`) when
  the migration was authored, so
  `prisma migrate dev` could not run. Apply
  with `npx prisma migrate deploy`. Until it
  is applied, `Ticket.feedback` is read
  defensively and the feedback stage reports
  zero rather than failing.
- **The route is read-only, so WebAuthn is
  not required.** `requireRole('admin')` gates
  the API; `requireWebAuthn` is a write-side
  property.

## Cross-references

- `app/admin/cities/[id]/adoption/page.tsx`
  — new page.
- `app/api/v1/admin/cities/[id]/adoption/route.ts`
  — new API (GET).
- `app/api/v1/admin/cities/[id]/adoption/export/route.ts`
  — new API (GET CSV export).
- `lib/admin/adoption.ts` — the pure domain
  logic (new).
- `lib/admin/users-db.ts` — the ticket /
  trail / session / citizen / staff readers
  the route reuses (Bolt 008-015).
- `lib/i18n/keys.ts` — the `admin.adoption.*`
  namespace (46 keys, bilingual).
- `app/admin/cities/page.tsx` — the city
  overview table's per-city link to the
  dashboard.
- `tests/unit/admin-adoption.test.ts` —
  Vitest unit test (new).
- `tests/27-admin-users-adoption.spec.ts` —
  Playwright spec (new; shared with Unit 005;
  no visual baseline).
- `prisma/migrations/20261027140000_platform_gaps/migration.sql`
  — the pending, NOT-YET-APPLIED platform
  migration.
