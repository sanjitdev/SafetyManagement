---
unit: 006-adoption-dashboard
intent: 005-admin-city-setup
phase: construction
status: done
created: 2026-10-27T00:00:00Z
updated: 2026-10-27T00:00:00Z
---

# Unit 006 — Admin Adoption Dashboard (Intent 005)

## Scope

The 4.7 Post-launch Adoption Dashboard from
WO-004 §4.7: the internal Aamir surface for
"is this city actually being used, and is it
working?" — the post-launch answer for the
city operator.

`/admin/cities/[id]/adoption` is a
read-only snapshot (no polling) of seven
sections:

1. The four hero cards (registered
   citizens, reports received, resolution
   rate, average time to resolve), each with
   a percentage delta against the
   immediately-preceding window of the same
   length.
2. The five-stage adoption funnel (visit,
   registered, submitted, second report,
   provided feedback) with the conversion
   rate from the previous stage.
3. The three-line daily activity chart
   (reports submitted, reports resolved,
   citizens registered).
4. The ward heatmap — a per-ward report
   density grid with a 0..1 colour intensity.
5. The three engagement signals (staff
   activity, citizen retention, crew response
   time).
6. The health flags (stale dispatchers,
   unassigned backlog, silent wards).
7. The optional "Compare with Dhaka"
   overlay.

A date-range control (last 7 days / last
30 days / since launch / custom) and a CSV
export. The PDF export goes through the
browser's print pipeline (`window.print()`),
because the charts are inline SVG and cannot
be rasterised server-side without a
rendering dependency the project does not
have.

The unit was deferred to v1.1 when
Intent 005 was first decomposed (the 4.6 /
4.7 surfaces were named in the WO-004
acceptance criteria but had no unit). It
ships now, in Bolt 008-016, as Unit 006 of
this intent.

## Stories owned

| Slug | Title | Status |
|------|-------|--------|
| ADM-009 | adoption-dashboard | done |

## Bolt candidate

`008-016-admin-adoption-dashboard` (one
`simple-construction-bolt`).

## Reuse references

- `lib/auth/guards.ts` — `requireRole`; the
  dashboard is a read-only surface, so
  `requireWebAuthn` is NOT applied (WebAuthn
  is a write-side property).
- `lib/db-switch.ts` — the `db.city` /
  `db.ticket` / `db.ward` accessors.
- `lib/admin/users-db.ts` (Bolt 008-015) —
  the ticket / trail / session / citizen /
  staff readers. The adoption dashboard
  reuses them rather than duplicating the
  query logic.
- `lib/i18n/keys.ts` — the `admin.adoption.*`
  namespace (54 keys, `{ bn, en }`).
- `app/admin/cities/page.tsx` — the city
  overview table's per-city link row.

## API surface (delta)

- **New**: `app/api/v1/admin/cities/[id]/adoption/route.ts`
  - **GET** — the dashboard payload. Query:
    `from` (ISO, inclusive lower bound),
    `to` (ISO, inclusive upper bound),
    `compare` (`1` to include the Dhaka
    overlay). A bare `YYYY-MM-DD` boundary
    is normalised to the start of that day
    (lower bound) or the end of that day
    (upper bound). The default window is
    "since launch" (the city's creation date
    to now). Returns
    `{ cityId, from, to, hero, funnel, daily, wards, engagement, healthFlags, comparison }`.
    Gated by `requireRole('admin')`.
- **New**: `app/api/v1/admin/cities/[id]/adoption/export/route.ts`
  - **GET** — the CSV export. Returns
    `text/csv` with the header
    `date,reports_submitted,reports_resolved,citizens_registered`
    and one row per day of the daily series.
    The rows are built by
    `buildAdoptionCsvRows` in
    `lib/admin/adoption.ts`, so the export and
    the on-screen chart can never drift.
    Gated by `requireRole('admin')`.

### Error codes

`unauthenticated` (401), `forbidden_role`
(403), `invalid_input` (400, Zod issues
attached), `city_not_found` (404),
`invalid_range` (400 — `from` after `to`),
`unhandled` (500).

## Pages (delta)

- **New**: `app/admin/cities/[id]/adoption/page.tsx`
  — client-only. Auth + role gate on
  `/api/auth/status`
  (`status.session?.role !== 'admin'` →
  redirect). Header: the title, the
  "Compare with Dhaka" toggle, the Export
  PDF / Export CSV buttons and a back link.
  Body: the date-range control (a select +
  the two custom date inputs), the four
  hero cards, the funnel, the daily chart,
  the ward heatmap, the three engagement
  signals, the health flags and (when the
  comparison is on) the Dhaka overlay.
- **Link**: `app/admin/cities/page.tsx` —
  the city overview table's per-city link
  row gains a link to
  `/admin/cities/[id]/adoption`.

## Charts (delta)

**Every chart is inline SVG.** The project
has no charting library and none may be
added, so each chart is hand-built SVG: the
funnel is a stack of horizontal bars, the
daily activity chart is three `<path>` line
series with gridlines, and the heatmap is a
grid of `<rect>` cells with a colour ramp.

**Each chart has a table sibling built from
the SAME data array**, so the information is
reachable by a screen reader and by the CSV
export. The Playwright spec asserts the
table sibling exists for the funnel, the
daily chart and the heatmap.

## Services (delta)

- **New**: `lib/admin/adoption.ts` — the pure
  domain logic. The helpers (`toIso`,
  `toDateKey`, `inRange`, `shiftDays`,
  `dateRangeKeys`, `median`, `percentDelta`),
  the hero cards (`buildHeroStats`), the
  funnel (`buildFunnel`), the daily series
  (`buildDailySeries`), the ward heatmap
  (`buildWardActivity`), the engagement
  signals (`buildEngagementSignals`), the
  health flags (`buildHealthFlags`), the
  average resolve duration
  (`averageResolveDuration`), the full
  assembly (`buildAdoptionDashboard`) and the
  export rows (`buildAdoptionCsvRows`).

## i18n keys (delta)

New keys under `admin.adoption.*` (46 keys,
each `{ bn, en }`): `title`, `back`,
`range.{label,7d,30d,sinceLaunch,custom}`,
`hero.{registeredCitizens,reportsReceived,resolutionRate,avgTimeToResolve}`,
`hero.delta.{up,down,flat,none}`,
`funnel.{title,visit,registered,submitted,secondReport,feedback,conversion,stageCount,tableCaption}`,
`daily.{title,submitted,resolved,registered,tableCaption}`,
`heatmap.{title,tableCaption,legend.none,legend.high,reports}`,
`engagement.{title,staffActivity,citizenRetention,crewResponseTime,staffActivity.detail,citizenRetention.detail,crewResponseTime.detail}`,
`health.{title,none,stale_dispatchers,unassigned_backlog,silent_ward}`,
`cta.{exportPdf,exportCsv,preparingPdf}`,
`compare.{toggle,dhaka,legend}`, `empty`,
`error`.

## Tests (delta)

- **Vitest**: `tests/unit/admin-adoption.test.ts`
  (new) — the pure domain logic: the
  timestamp / range helpers, the date-key
  series (stable, capped at 180 days), the
  median, the percent delta, the hero cards
  (including the inverted duration delta),
  the funnel conversions, the daily series
  (including the zero row for a quiet day),
  the ward intensity, the three engagement
  signals, the health flags, the average
  resolve duration, the full dashboard
  assembly (including the Dhaka overlay) and
  the CSV export rows.
- **Vitest**: `tests/unit/admin/adoption.test.ts`
  — **does not exist.** The adoption
  domain logic has a single unit suite
  (`tests/unit/admin-adoption.test.ts`); the
  `tests/unit/admin/` directory holds
  `users-db.test.ts` (Unit 005) and
  `audit-query-list.test.ts` (Unit 004).
- **Playwright**: `tests/27-admin-users-adoption.spec.ts`
  (new, shared with Unit 005) — the API
  checks (dashboard 200 with every section,
  401, 403, export 200 with the `text/csv`
  body and the header row) and the route
  rendering (every section + the table
  siblings).

**No visual baseline.** The page's content
depends on the seeded dev store, which the
other admin specs mutate, so a pixel
baseline would be flaky across the suite's
execution order. The team rule "never merge
with failing visual regression tests" is
honoured by NOT introducing a baseline that
could fail.

## Platform dependency

The unit reads `Ticket.feedback`, which
lands in the Prisma migration
`prisma/migrations/20261027140000_platform_gaps/migration.sql`.

**That migration has NOT been applied to any
database.** The configured Neon instance was
unreachable (`P1001: Can't reach database
server`) when the migration was authored, so
`prisma migrate dev` could not run. Apply
with `npx prisma migrate deploy`.

Until it is applied, the feedback funnel
stage reads `Ticket.feedback` defensively:
`lib/admin/users-db.ts` reads it off the row
when the column is present and leaves it
`null` when it is not, so the stage reports
zero rather than failing.

The unit does NOT consult the `SlaPolicy`
model. The "average time to resolve" hero
card is computed from the ticket rows
themselves (`resolvedAt - createdAt` over the
resolved tickets in range).

## Verification

- `npx tsc --noEmit` clean.
- `npm run test:unit` green.
- `npm run test:mockups` green.
- `curl -fs http://localhost:3000/` 200.
- `npx playwright test tests/27-admin-users-adoption.spec.ts` green.
- `npm run build` compiles successfully.
- `npm run test:unit:coverage` above the 80% floor.

## Out of scope (deferred)

- A true cumulative "registered citizens"
  count. There is no registration-event
  table, so the stat is the number of
  `citizen`-role `User` rows created inside
  the window — it reads "citizens who
  registered during this period", not "total
  citizens". A `RegistrationEvent` table (or
  a `registeredAt` column on `User`) is the
  v1.1 fix.
- A real "visit" count. There is no
  page-view / analytics-event table, so the
  funnel's first stage is the number of
  DISTINCT ticket reporters in range. An
  `AnalyticsEvent` table is the v1.1 fix.
- A server-rendered PDF. The charts are
  inline SVG and the project has no
  rasteriser, so the PDF export is the
  browser's print stylesheet plus
  `window.print()` — the admin picks "Save
  as PDF" in the print dialog.
- Real-time updates (WebSocket / SSE). The
  page is a snapshot; the admin re-ranges to
  refresh. A v1.1 bolt may add a stream.
- A comparison against an arbitrary second
  city. The overlay is fixed to the Dhaka
  city (`slug === 'dhaka-north'`).
