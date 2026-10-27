---
id: 008-016-admin-adoption-dashboard
unit: 006-adoption-dashboard
intent: 005-admin-city-setup
type: simple-construction-bolt
status: complete
stories:
  - ADM-009-adoption-dashboard
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
requires_bolts:
  - 008-015-admin-user-management
enables_bolts: []
requires_units:
  - 005-user-management
blocks: false
complexity:
  avg_complexity: 3
  avg_uncertainty: 3
  max_dependencies: 2
  testing_scope: 4
  estimated_files: 9
---

# Bolt 008-016 — Admin Adoption Dashboard

## Purpose

Land the 4.7 Post-launch Adoption Dashboard
from WO-004 §4.7 — a previously deferred v1.1
admin surface — as Unit 006 of Intent 005.

The bolt ships:

1. **ADM-009** — an admin-only page at
   `/admin/cities/[id]/adoption` showing the
   four hero stats with their window deltas,
   the five-stage adoption funnel, the
   three-line daily activity chart, the ward
   heatmap, the three engagement signals, the
   health flags and the optional "Compare with
   Dhaka" overlay — with a date-range control
   and a CSV export.
2. Two API route handlers: the dashboard
   payload (GET) and the CSV export (GET).
3. One new service module — `lib/admin/adoption.ts`,
   the pure domain logic behind every number
   on the page.
4. 46 new bilingual `admin.adoption.*` i18n
   keys.

## Stories

### From Unit 006 (adoption dashboard)
| Story ID | Title | FR |
|----|-------|----|
| ADM-009-adoption-dashboard | Post-launch adoption dashboard: hero stats, funnel, daily activity, ward heatmap, engagement signals, health flags, CSV export | WO-004 §4.7 |

## Files Modified

- `app/admin/cities/[id]/adoption/page.tsx` —
  new page. The header, the date-range
  control, the comparison toggle, the export
  actions, and the seven sections.
- `app/api/v1/admin/cities/[id]/adoption/route.ts`
  — new API. GET (the dashboard payload).
- `app/api/v1/admin/cities/[id]/adoption/export/route.ts`
  — new API. GET (the CSV export).
- `lib/admin/adoption.ts` — new. The pure
  domain logic.
- `lib/i18n/keys.ts` — 54 new
  `admin.adoption.*` keys, bilingual `{ bn, en }`.
- `app/admin/cities/page.tsx` — the city
  overview table's per-city link row.
- `tests/unit/admin-adoption.test.ts` — new
  Vitest suite.
- `tests/27-admin-users-adoption.spec.ts` —
  the shared Playwright spec (carried from Bolt
  008-015; this bolt adds the adoption
  assertions).

## Implementation Notes

### Every chart is inline SVG

The project has no charting library and none
may be added, so every chart is hand-built
SVG: the funnel is a stack of horizontal bars,
the daily activity chart is three `<path>` line
series with gridlines, and the heatmap is a
grid of `<rect>` cells with a colour ramp.

**Each chart has a table sibling built from the
SAME data array**, so the information is
reachable by a screen reader and by the CSV
export. The Playwright spec asserts the table
sibling exists for the funnel, the daily chart
and the heatmap.

### The PDF export is not server-rendered

Inline SVG cannot be rasterised server-side
without a rendering dependency the project
does not have, so the PDF export uses the
browser's print stylesheet plus `window.print()`
— the admin picks "Save as PDF" in the print
dialog. The CSV export IS server-rendered.

### The export and the chart share one builder

`buildAdoptionCsvRows` in `lib/admin/adoption.ts`
builds the export rows from the same
`AdoptionDashboardResult` the page renders, so
the export and the on-screen chart can never
drift.

### Schema proxies

Three of the numbers on the page are proxies,
because the platform layer does not (yet)
record the underlying events:

| Metric | The data it is computed from | Why it is a proxy |
|---|---|---|
| "Registered citizens" | the `citizen`-role `User` rows created inside the range | there is no registration-event table, so the stat reads "citizens who registered during this period", not "total citizens" |
| Funnel stage 1 "Visit" | the DISTINCT ticket reporters in range | there is no page-view / analytics-event table |
| Funnel stage 5 "Provided feedback" | the tickets in range whose `Ticket.feedback` slot is non-empty | a ticket that reached a terminal status but carries no feedback text is not counted |

Each is documented in the `lib/admin/adoption.ts`
header with the v1.1 fix (a `RegistrationEvent`
table, an `AnalyticsEvent` table).

### The engagement signals

- **Staff activity** — the percentage of the
  city's staff who have a session whose
  `lastSeenAt` falls inside the last 7 days.
- **Citizen retention** — the percentage of
  citizens who filed a SECOND report within 30
  days of their first.
- **Crew response time** — the median gap
  between the trail entry whose `toStatus` is
  `routed` and the one whose `toStatus` is
  `in_progress`, over the tickets that have
  both.

### The health flags

- `stale_dispatchers` — dispatchers who have
  not signed in for 7+ days. Links to
  `/admin/cities/[id]/users`.
- `unassigned_backlog` — tickets unassigned for
  7+ days. Links to the admin ticket queue.
- `silent_ward_[n]` — a ward with no reports for
  14+ days. Links to the admin ticket queue.

### The hero deltas

Each hero card carries the percentage change
against the immediately-preceding window of the
same length. A SHORTER average resolve time is
an improvement, so the duration delta is
inverted. Where there is no meaningful baseline
(the previous value is zero), the delta is null
and the card reads "no change" rather than a
spurious percentage.

### The daily series is capped

`dateRangeKeys` caps the series at 180 days so
a "since launch" range on an old city cannot
produce an unbounded array.

## Platform Dependency — Migration NOT Applied

The unit reads `Ticket.feedback`, which lands
in the Prisma migration
`prisma/migrations/20261027140000_platform_gaps/migration.sql`.

**This migration has NOT been applied to any
database.** The configured Neon instance was
unreachable (`P1001: Can't reach database
server`) when the migration was authored, so
`prisma migrate dev` could not run. Apply
with:

```
npx prisma migrate deploy
```

Until it is applied, `Ticket.feedback` is read
defensively: `lib/admin/users-db.ts` reads it
off the row when the column is present and
leaves it `null` when it is not, so the
feedback funnel stage reports zero rather than
failing.

## Verification

- `npm run build` — compiled successfully,
  58/58 static pages generated.
- `npx tsc --noEmit` — clean, 0 errors.
- `npm run lint` — 0 errors, 53 warnings.
- `npm run test:unit` — 825 passed across 58
  test files.
- `npm run test:unit:coverage` — 90.89% lines
  / 80.85% branches / 94.11% functions (the
  80% floor).
- `npm run test:mockups` — 15 passed, no
  baseline regenerated.

## Out of Scope

- A true cumulative "registered citizens"
  count (a `RegistrationEvent` table or a
  `registeredAt` column on `User`).
- A real "visit" count (an `AnalyticsEvent`
  table).
- A server-rendered PDF (the charts are inline
  SVG and the project has no rasteriser).
- Real-time updates (WebSocket / SSE); the page
  is a snapshot.
- A comparison against an arbitrary second city;
  the overlay is fixed to the Dhaka city
  (`slug === 'dhaka-north'`).
- The `SlaPolicy` model is not consulted; the
  average resolve time is computed from the
  ticket rows themselves.
- A visual baseline for the new page.

## Risk Posture

| Risk | Mitigation |
|------|-----------|
| The pending migration is not applied, so `Ticket.feedback` is missing | `lib/admin/users-db.ts` reads the column defensively; the feedback stage reports zero rather than failing |
| "Registered citizens" and "visit" are proxies, not the true metric | Both are documented in the module header with the v1.1 fix, and the funnel's first stage is labelled explicitly so the admin is not misled |
| The charts are inaccessible as graphics | Every chart is an inline SVG with a `role="img"` and an `aria-label`, and each has a table sibling built from the same data |
| The PDF export produces no server-side file | The export uses the browser print pipeline, which is the only rasteriser available without adding a dependency |
| The export drifts from the on-screen chart | Both read the same `buildAdoptionCsvRows` output |
| A "since launch" range on an old city produces an unbounded array | The daily series is capped at 180 days |
| The page's content depends on a mutable dev seed, so a pixel baseline would be flaky | No visual baseline is introduced; the Playwright spec asserts route structure and API behaviour instead |
