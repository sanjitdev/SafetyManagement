---
stage: test
bolt: 008-016-admin-adoption-dashboard
created: 2026-10-27T00:00:00Z
---

## Test Report: 006-adoption-dashboard — Bolt 008-016

### Summary

- **Tests**: 1 new unit suite and 1 shared
  Playwright spec, all green.
  `tests/unit/admin-adoption.test.ts` (the pure
  domain logic) and
  `tests/27-admin-users-adoption.spec.ts` (the
  shared route + API Playwright spec, which also
  carries Bolt 008-015's assertions and this
  bolt's adoption assertions).
- **Coverage**: 90.89% lines / 80.85% branches
  / 94.11% functions across the suite — above
  the 80% floor.
- **Visual baseline**: NONE. The new page
  ships without a pixel baseline, by decision
  (see "Visual regression" below).

### Verification results

| Gate | Result |
|---|---|
| `npm run build` | Compiled successfully, 58/58 static pages generated |
| `npx tsc --noEmit` | clean, 0 errors |
| `npm run lint` | 0 errors, 53 warnings |
| `npm run test:unit` | 825 passed across 58 test files |
| `npm run test:unit:coverage` | 90.89% lines / 80.85% branches / 94.11% functions (80% floor) |
| `npm run test:mockups` | 15 passed, no baseline regenerated |

### Test Files

- [x] `tests/unit/admin-adoption.test.ts` — the
  domain logic:
  - **Date helpers** — `toIso`, `toDateKey`,
    `inRange` (both bounds inclusive), `shiftDays`
    and `dateRangeKeys` (the 7-day / 30-day /
    since-launch / custom shapes and the
    **180-day cap** on the returned series).
  - **Statistics helpers** — `median` (odd and
    even counts), `percentDelta` (growth, decline,
    and the zero-baseline case that yields
    `null`), and `averageResolveDuration`.
  - **Hero stats** — the four stats and their
    values, the delta against the preceding
    window, the **inverted** delta for the resolve
    duration, and the `null` delta (no change)
    when the baseline is zero.
  - **Funnel** — the five stages, the count per
    stage, the share of the first stage, and the
    proxy semantics for stage 1 ("Visit" = the
    distinct reporters) and stage 5 ("Provided
    feedback" = the tickets carrying feedback).
  - **Daily series** — one entry per date key,
    the three series (reports submitted, reports
    resolved, citizens registered), and the
    zero-filled days.
  - **Ward activity** — one entry per ward, the
    per-ward counts, and the zero-activity wards.
  - **Engagement signals** — staff activity (the
    7-day `lastSeenAt` window), citizen retention
    (a SECOND report within 30 days of the first)
    and crew response time (the median
    `routed` → `in_progress` gap).
  - **Health flags** — `stale_dispatchers` (7+
    days without sign-in), `unassigned_backlog`
    (7+ days unassigned), and `silent_ward_[n]`
    (14+ days with no reports), each with its
    link target.
  - **CSV rows** — the header row, the row
    ordering, the values and the per-row content.
- [x] `tests/27-admin-users-adoption.spec.ts` —
  the shared Playwright spec. This bolt's
  assertions:
  - **API** — GET adoption 200 with the
    dashboard payload; GET adoption 401
    unauthenticated; GET adoption 403
    `forbidden_role` for a citizen; GET adoption
    400 `invalid_range` for an inverted range; GET
    adoption 404 `city_not_found` for an unknown
    city; GET adoption/export 200 with the
    `text/csv` content type and the attachment
    header; GET adoption/export 401
    unauthenticated.
  - **Route** — the adoption page renders the
    header, the date-range control, the comparison
    toggle, the export actions, the four hero
    cards, the funnel, the daily activity chart,
    the ward heatmap, the engagement signals and
    the health flags — and the **table sibling**
    exists for the funnel, the daily chart and the
    heatmap.

### Acceptance Criteria Validation

- ✅ **The four hero stats with their window
  deltas**: pinned by the unit suite's
  `buildHeroStats` cases (the values, the delta,
  the inverted duration delta and the `null`
  zero-baseline delta) and by the route case (the
  four hero cards are visible).
- ✅ **The five-stage adoption funnel**: pinned by
  the unit suite's `buildFunnel` cases and by the
  route case (the funnel and its table sibling are
  visible).
- ✅ **The three-line daily activity chart**:
  pinned by the unit suite's `buildDailySeries`
  cases and by the route case (the chart and its
  table sibling are visible).
- ✅ **The ward heatmap**: pinned by the unit
  suite's `buildWardActivity` cases and by the
  route case (the heatmap and its table sibling
  are visible).
- ✅ **The three engagement signals**: pinned by
  the unit suite's `buildEngagementSignals` cases
  (staff activity, citizen retention and crew
  response time).
- ✅ **The health flags**: pinned by the unit
  suite's `buildHealthFlags` cases (each flag and
  its link target) and by the route case (the
  flags are visible).
- ✅ **The "Compare with Dhaka" overlay**: pinned
  by the GET adoption 200 case (the comparison
  payload) and the route case (the toggle is
  visible).
- ✅ **The date-range control**: pinned by the
  unit suite's `dateRangeKeys` cases (all four
  shapes plus the 180-day cap) and by the route
  case (the control is visible).
- ✅ **The CSV export**: pinned by the GET
  adoption/export 200 case (the content type, the
  attachment header and the rows) and by the unit
  suite's `buildAdoptionCsvRows` cases.
- ✅ **Cross-role denial**: pinned by the 401 and
  403 `forbidden_role` API cases, and by the
  page's `status.session?.role !== 'admin'`
  redirect.
- ✅ **Unit coverage of the domain logic**: the
  suite passes.

### Visual regression

**No baseline was added or regenerated.**
`npm run test:mockups` reports 15 passed with
no baseline regenerated. The new page's
content depends on the seeded dev store, which
the other admin specs mutate, so a pixel
baseline would be flaky across the suite's
execution order. The team rule "never merge
with failing visual regression tests" is
honoured by NOT introducing a baseline that
could fail; the route is covered by structural
assertions instead.

### Issues Found

None blocking.

Two notes recorded for follow-up:

1. **The Prisma migration
   `20261027140000_platform_gaps` is authored
   but NOT applied to any database.** The
   configured Neon instance was unreachable
   (`P1001: Can't reach database server`) when
   the migration was authored, so
   `prisma migrate dev` could not run. Apply
   with:
   ```
   npx prisma migrate deploy
   ```
   Every statement in the migration is additive
   (new columns with defaults, new tables, new
   indexes) and is safe against the
   pre-migration schema. Until it is applied,
   `lib/admin/users-db.ts` reads `Ticket.feedback`
   defensively — off the row when the column is
   present, `null` when it is not — so the
   feedback funnel stage reports zero rather than
   failing. **The production behaviour on the
   real database has not been exercised** — the
   verified runs above are the dev-store path.
2. **Three of the numbers on the page are
   proxies, not the true metric.** "Registered
   citizens" counts the citizen-role `User` rows
   created in range, the funnel's first stage
   ("Visit") counts the distinct ticket reporters,
   and the funnel's last stage ("Provided
   feedback") counts only the tickets carrying
   feedback text. The `RegistrationEvent` and
   `AnalyticsEvent` tables that would make these
   real are v1.1 work. The module header
   documents each proxy.

### Notes

- The Playwright spec is shared with Bolt
  008-015 (`tests/27-admin-users-adoption.spec.ts`)
  and covers both admin surfaces; it resets the
  dev store in `beforeEach` so each case starts
  from the demo seed.
- The bolt added no package dependency.
- `npm run lint` reports 0 errors and 53
  warnings; the warnings are pre-existing
  repo-wide and not introduced by this bolt.
