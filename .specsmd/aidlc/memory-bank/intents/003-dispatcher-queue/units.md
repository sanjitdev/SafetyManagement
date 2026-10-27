---
intent: 003-dispatcher-queue
phase: construction
status: in-progress
updated: 2026-10-27T00:00:00Z
---

# Dispatcher Queue - Unit Decomposition

## Units Overview

This intent is **in-progress** (2026-10-27).
Unit briefs and story specs are in place for
all 7 units. Unit 005 (map view) was
promoted from v1.1 deferred to v1 ready and
shipped in Bolt 003-005. Units 006 (live
monitor) and 007 (performance reporting)
were also deferred to v1.1 and shipped in
Bolt 008-013 and Bolt 008-014. Units 001-007
delivery notes are below.

### Unit 001: auth-and-scope

**Status**: `ready`
**Brief**:
`001-auth-and-scope/unit-brief.md`
**Stories**:
- `001-auth-and-scope/DISP-001-auth-scope.md`

**Estimated Complexity**: M (paperwork +
small test suite; no new code).

### Unit 002: triage-queue

**Status**: `ready`
**Brief**: `002-triage-queue/unit-brief.md`
**Stories**:
- `002-triage-queue/DISP-002-triage-queue.md`

**Estimated Complexity**: L (new API +
new page + Playwright spec + visual
baseline).

### Unit 003: ticket-detail-and-transitions

**Status**: `done`
**Brief**:
`003-ticket-detail-and-transitions/unit-brief.md`
**Stories**:
- `003-ticket-detail-and-transitions/DISP-003-ticket-detail.md` — `done`
- `003-ticket-detail-and-transitions/DISP-004-reassign.md` — `done`
- `003-ticket-detail-and-transitions/DISP-005-internal-notes.md` — `done`

**Estimated Complexity**: L (3 new APIs
sharing one page + Playwright spec +
3 visual baselines).

**Delivered in Bolt 003-003** (2026-10-12):
2 new API routes (`GET + PATCH /api/v1/dispatcher/tickets/[id]`,
`POST /api/v1/dispatcher/tickets/[id]/transition`),
1 new page (`app/dispatcher/tickets/[id]/page.tsx`),
1 new Playwright spec (`tests/11-dispatcher-detail-light.spec.ts`
with 8 API checks + 3 visual baselines),
24 new i18n keys. See
`../../bolts/003-003-ticket-detail-and-transitions/ddd-01-bolt-record.md`.

### Unit 004: dedup-decline-review

**Status**: `done`
**Brief**:
`004-dedup-decline-review/unit-brief.md`
**Stories**:
- `004-dedup-decline-review/DISP-006-dedup-decline-review.md` — `done`

**Estimated Complexity**: L (3 new APIs +
new page + new Prisma model `DedupFlag`
+ modification of the Unit 002 queue
query + Playwright spec + visual baseline).

**Delivered in Bolt 003-004** (2026-10-12):
new `DedupFlag` Prisma model + enum + two new
fields on `Ticket`, dev store mirror, citizen-
side `POST /api/tickets` writes the flag on
dedup decline, Unit 002 queue excludes pending-
flagged tickets + surfaces `pendingDedupCount`,
3 new API routes
(`GET /api/v1/dispatcher/dedup-flags`,
`POST .../confirm`, `POST .../dismiss`),
1 new page (`app/dispatcher/dedup/page.tsx`),
1 new Playwright spec
(`tests/12-dispatcher-dedup-light.spec.ts` with
6 API checks + 1 visual baseline),
1 new Vitest unit test
(`tests/unit/dedup-flag.test.ts` with 7
checks),
13 new i18n keys. See
`../../bolts/003-004-dedup-decline-review/ddd-01-bolt-record.md`.

### Unit 005: map-view

**Status**: `done`
**Brief**: `005-map-view/unit-brief.md`
**Stories**:
- `005-map-view/DISP-007-dispatcher-map.md` — `done`

**Estimated Complexity**: M (1 API +
1 page + 1 client-only component;
reuses the inherited OSM raster basemap
+ Dhaka District polygon overlay).

**Delivered in Bolt 003-005** (2026-10-12):
new `GET /api/v1/dispatcher/map/tickets`
API (status + bbox + cross-city guards,
in-scope filter matching the queue route's
ward + department shape), new page
`app/dispatcher/map/page.tsx` (auth-gated
3-region layout, status filter, 30s polling,
side panel on pin click), new
client-only `components/DispatcherMap.tsx`
(MapLibre GL JS + OSM raster + circle
layer colored by status + cluster source
for > 50 pins + selected-pin ring), new
Playwright spec
`tests/13-dispatcher-map-light.spec.ts`
(6 API checks + 1 visual baseline at
1440x900 light theme English labels),
14 new i18n keys under `dispatcher.map.*`,
header pills added in `/dispatcher` and
`/dispatcher/dedup` linking to the new
map page. The unit-brief + story paperwork
was promoted from v1.1 deferred to v1
ready at the start of the bolt per the
design log's bolt-progress note. See
`../../bolts/003-005-dispatcher-map-view/ddd-01-bolt-record.md`.

### Unit 006: live-monitor

**Status**: `done`
**Brief**:
`006-live-monitor/unit-brief.md`
**Stories**:
- `006-live-monitor/DISP-008-live-monitor.md` — `done`

**Estimated Complexity**: M (2 new APIs + new page
+ new service + new unit test + 1 shared Playwright
spec; 3 inline-SVG charts with accessible table
siblings, no charting library).

**Delivered in Bolt 008-013** (2026-10-27):
new `GET /api/v1/dispatcher/monitor` API (Zod-validated
`filter` / `limit` / `cityId`, cross-city guard, ward
scope applied in code), new
`POST /api/v1/dispatcher/monitor/ack` API (Zod-validated
body, writes the `ticket.monitor_acknowledge` audit row,
out-of-scope ticket returns 404 not 403), new page
`app/dispatcher/monitor/page.tsx` (56px header with 3
`aria-pressed` filter chips, 5s polling via
`POLL_INTERVAL_MS = 5_000`, "Live updates paused"
banner on a failed poll, aggregate "N new updates"
counter derived client-side, inline row expansion
revealing the last 3 trail steps with `aria-expanded`,
per-row acknowledge button, 280px desktop chart
strip), new service `lib/dispatcher/monitor.ts` (pure
row + flow + response-sparkline + crew-load builders
exported for the unit suite, plus the DB-facing
`listMonitorTickets` and `acknowledgeMonitorUpdate`),
3 inline-SVG charts each with a visually-hidden
`<table>` sibling (caption + `<th scope="col">`), new
Vitest suite `tests/unit/dispatcher/monitor.test.ts`
(33 cases), and the monitor half of the new shared
Playwright spec
`tests/26-dispatcher-monitor-performance.spec.ts`.
New i18n keys under `dispatcher.monitor.*` in both `bn`
and `en`. The unit-brief + story paperwork was promoted
from v1.1 deferred to v1 at the start of the bolt. See
`../../bolts/008-013-dispatcher-live-monitor/bolt.md`.

### Unit 007: performance-reporting

**Status**: `done`
**Brief**:
`007-performance-reporting/unit-brief.md`
**Stories**:
- `007-performance-reporting/DISP-009-performance-reporting.md` — `done`

**Estimated Complexity**: M (1 new API + new page
+ new service + new unit test + 1 shared Playwright
spec; 3 inline-SVG charts with accessible table
siblings, CSV + PDF export, no charting or PDF
library).

**Delivered in Bolt 008-014** (2026-10-27):
new `GET /api/v1/dispatcher/performance` API
(Zod-validated `from` / `to` / `days` / `cityId`,
cross-city guard, ward scope applied in code, the
previous period derived from the range's own length), new
page `app/dispatcher/performance/page.tsx` (sticky 64px
header reading "Ward 14 · Performance snapshot" with
the bare ward number, date-range picker — today / last7
/ last30 / custom — 3 hero stat cards with deltas vs
the previous period, 3 charts each with a
visually-hidden `<table>` sibling, sortable crew table
with `aria-sort` and nulls-last, long-tail list of the
10 oldest still-open tickets, CSV export via `Blob` +
`csvEscape` and PDF export via `window.print()` with an
`@media print` stylesheet; the page deliberately does
NOT poll), new service `lib/dispatcher/performance.ts`
(pure `buildHeroStats` / `buildSubmittedVsResolved` /
`buildCategoryBreakdown` / `buildStatusBreakdown` /
`buildCrewTable` / `buildLongTail` builders exported
for the unit suite, plus the DB-facing
`getPerformanceSnapshot`), new Vitest suite
`tests/unit/dispatcher/performance.test.ts` (42 cases),
and the performance half of the shared Playwright spec
`tests/26-dispatcher-monitor-performance.spec.ts`. New
i18n keys under `dispatcher.performance.*` in both `bn`
and `en`. The unit-brief + story paperwork was promoted
from v1.1 deferred to v1 at the start of the bolt. See
`../../bolts/008-014-dispatcher-performance-reporting/bolt.md`.

## Status

Active build (2026-10-27). Intent 002
(Citizen Report Flow) is `complete`; this
intent is `in-progress`. The unit
decomposition started as the 5 units from
the `draft` phase, revised at entry to
active build and now fully specced at 7
units. All 7 units have delivery notes;
Unit 005, Unit 006 and Unit 007 were
promoted from v1.1 deferred to v1 and
shipped in Bolt 003-005, Bolt 008-013 and
Bolt 008-014 respectively.

**Bolt progress** (2026-10-27):

- `003-001-auth-and-scope` — ✅ complete
  (paperwork + 14 unit tests + 7 Playwright
  tests).
- `003-002-triage-queue` — ✅ complete
  (1 new API + 1 new page + 1 spec + 1
  redirect change + 12 i18n keys).
- `003-003-ticket-detail-and-transitions` —
  ✅ complete (2 new APIs + 1 new page +
  1 spec + 3 visual baselines + 24 i18n
  keys).
- `003-004-dedup-decline-review` —
  ✅ complete (1 new Prisma model +
  enum + 2 new Ticket fields + dev store
  mirror + 3 new APIs + 1 new page +
  1 spec + 1 visual baseline + 1 unit test
  + 13 i18n keys).
- `003-005-map-view` — ✅ complete
  (1 new API + 1 new page + 1 new
  client-only component + 1 spec + 1
  visual baseline + 14 i18n keys +
  header pills in `/dispatcher` and
  `/dispatcher/dedup`). Promoted from
  v1.1 deferred to v1 ready at the start
  of the bolt per the design log's
  bolt-progress note.
- `008-013-live-monitor` — ✅ complete
  (2 new APIs + 1 new page + 1 new
  service + 1 new unit test + 1 shared
  Playwright spec + `dispatcher.monitor.*`
  i18n keys; 5s polling, 3 inline-SVG charts
  with accessible table siblings, no
  charting library). Promoted from v1.1
  deferred to v1 at the start of the bolt.
- `008-014-performance-reporting` —
  ✅ complete (1 new API + 1 new page +
  1 new service + 1 new unit test + 1
  shared Playwright spec +
  `dispatcher.performance.*` i18n keys;
  snapshot surface that does not poll,
  CSV + PDF export, no charting or PDF
  library). Promoted from v1.1 deferred to
  v1 at the start of the bolt.

The unit decomposition is the 5 units from the
`draft` phase, revised at entry to active
build and now fully specced at 7 units:

- **Unit 001 — auth-and-scope**: the dispatcher
  dev login already exists in WO-000. The
  remaining work is the per-route
  `requireRole(session, 'dispatcher')` +
  `requireScope(session, wardId, departmentId)`
  guards on every new dispatcher endpoint.
  The serializer (`lib/serializers/ticket.ts`)
  already exposes the full record for the
  dispatcher role; no serializer change is
  needed.
- **Unit 002 — triage-queue**: new API
  `GET /api/v1/dispatcher/queue` + new page
  `app/dispatcher/page.tsx`. Queue is filtered
  by `(cityId, status in [submitted, routed],
  wardId?, departmentId?)` and sorted by age
  ascending (oldest first). 30s polling. The
  Unit 002 query adds a `NOT EXISTS (
  SELECT 1 FROM DedupFlag ...)` clause to
  exclude tickets with a pending dedup flag
  (this filter is wired in Unit 002; the
  `DedupFlag` table is created in Unit 004's
  Prisma migration — the SQL filter is
  defensive and does not break Unit 002 if
  the table does not yet exist).
- **Unit 003 — ticket-detail-and-transitions**:
  new API `GET /api/v1/dispatcher/tickets/[id]`
  + `POST /api/v1/dispatcher/tickets/[id]/transition`
  + `PATCH /api/v1/dispatcher/tickets/[id]`
  (reassign + internalNote; the transition
  engine is inherited). New page
  `app/dispatcher/tickets/[id]/page.tsx`
  with the full record (internal fields
  visible) + the status trail + the
  transition buttons + the reassign
  dropdowns + the internal note textarea.
  Out-of-scope ticket id returns 404 (not
  403) to avoid leaking ticket existence.
- **Unit 004 — dedup-decline-review**: new API
  `GET /api/v1/dispatcher/dedup-flags` +
  `POST /api/v1/dispatcher/dedup-flags/[id]/confirm`
  + `POST /api/v1/dispatcher/dedup-flags/[id]/dismiss`.
  New page `app/dispatcher/dedup/page.tsx`.
  New Prisma model `DedupFlag` written on
  citizen's denial (Intent 002 Unit 001
  already writes the structured event; this
  Unit creates the table and writes the row
  on denial as a backfill-or-on-write
  decision — see bolt plan). The triage
  queue (Unit 002) excludes pending flags.
- **Unit 005 — map-view**: new API
  `GET /api/v1/dispatcher/map/tickets` +
  new page `app/dispatcher/map/page.tsx` +
  new client-only `components/DispatcherMap.tsx`
  (MapLibre + OSM raster + circle layer +
  cluster source for > 50 pins). Filter
  shape matches the Unit 002 queue route
  (city + ward + department). Pin click
  opens a side panel with ticket summary +
  "View ticket" link to
  `/dispatcher/tickets/[id]`. Status filter
  (All / Submitted / Routed / In progress)
  on the left rail; legend below. 30s
  polling. Pin clustering for > 50 pins.
- **Unit 006 — live-monitor**: new API
  `GET /api/v1/dispatcher/monitor` +
  `POST /api/v1/dispatcher/monitor/ack` +
  new page `app/dispatcher/monitor/page.tsx` +
  new service `lib/dispatcher/monitor.ts`. A
  single-column live list of the dispatcher's
  watched tickets, sorted by most-recently
  updated, with inline row expansion (last 3
  trail steps), a per-row acknowledge button and
  a 280px desktop chart strip (today's flow,
  avg response time, crew load). 5s polling;
  a failed poll shows a "Live updates paused"
  banner and the polling continues. The
  acknowledge writes the
  `ticket.monitor_acknowledge` audit row; the
  acknowledgement itself is client-held in v1.
  The charts are inline SVG, each with an
  accessible `<table>` sibling.
- **Unit 007 — performance-reporting**: new API
  `GET /api/v1/dispatcher/performance` + new
  page `app/dispatcher/performance/page.tsx` +
  new service `lib/dispatcher/performance.ts`. A
  ward performance snapshot over a date range
  (today / last7 / last30 / custom): 3 hero stats
  with deltas vs the previous period, 3 charts
  (submitted vs resolved, category breakdown,
  status donut), a sortable crew table, and a
  long-tail list of the 10 oldest still-open
  tickets. This surface does NOT poll — it
  refreshes on a range change or a reload. CSV
  export via `Blob` + `csvEscape`; PDF export via
  `window.print()` with an `@media print`
  stylesheet. The charts are inline SVG, each
  with an accessible `<table>` sibling.

The unit dependency graph:

```text
[Intent 001] ─┐
              ├─> [Unit 001 auth-and-scope] ──┐
[Intent 002] ─┘                                │
                                               v
                  [Unit 002 triage-queue] ──> [Unit 003 ticket-detail-and-transitions]
                                               │
                                               v
                  [Unit 004 dedup-decline-review]
```

Unit 005 (map view) is independent of Units
002-004; it depends only on Unit 001. It
shipped in Bolt 003-005 after being promoted
from v1.1 deferred to v1 ready per the
design log's bolt-progress note.

Units 006 (live monitor) and 007 (performance
reporting) are likewise independent of Units
002-005 beyond the shared dispatcher auth +
scope guard (Unit 001); they depend only on
Unit 001. They shipped in Bolts 008-013 and
008-014 after being promoted from v1.1
deferred to v1.

## Stories owned

| Slug | Title | Unit | Status target |
|------|-------|------|---------------|
| DISP-001 | auth-scope | 001 | `done` |
| DISP-002 | triage-queue | 002 | `done` |
| DISP-003 | ticket-detail | 003 | `done` |
| DISP-004 | reassign | 003 | `done` |
| DISP-005 | internal-notes | 003 | `done` |
| DISP-006 | dedup-decline-review | 004 | `done` |
| DISP-007 | dispatcher-map | 005 | `done` |
| DISP-008 | live-monitor | 006 | `done` |
| DISP-009 | performance-reporting | 007 | `done` |

## Bolt plan

7 Bolt candidates, one per unit. The bolt
sequence:

1. **Bolt 003-001** (Unit 001):
   paperwork + unit test + Playwright
   `09-dispatcher-auth.spec.ts`. No new
   source code in `lib/` — the platform
   layer already ships. The bolt may
   touch only `tests/` and the dev login
   redirect map.
2. **Bolt 003-002** (Unit 002): new
   `app/api/v1/dispatcher/queue/route.ts`
   + new `app/dispatcher/page.tsx` +
   `tests/10-dispatcher-queue-light.spec.ts`
   + visual baseline. Tweaks
   `app/api/dev/login/route.ts` redirect
   map.
3. **Bolt 003-003** (Unit 003): new
   `app/api/v1/dispatcher/tickets/[id]/route.ts`
   (GET + PATCH) + new
   `app/api/v1/dispatcher/tickets/[id]/transition/route.ts`
   (POST) + new
   `app/dispatcher/tickets/[id]/page.tsx`
   + `tests/11-dispatcher-detail-light.spec.ts`
   + 3 visual baselines.
4. **Bolt 003-004** (Unit 004): new
   `DedupFlag` Prisma model + migration +
   citizen-side denier creates the flag +
   new dedup-flags APIs + new dedup page
   + `tests/12-dispatcher-dedup-light.spec.ts`
   + visual baseline. Updates Unit 002's
   queue query (the SQL filter is already
   in place; this bolt enables it).
5. **Bolt 003-005** (Unit 005): new
   `app/api/v1/dispatcher/map/tickets/route.ts`
   + new `app/dispatcher/map/page.tsx` +
   new `components/DispatcherMap.tsx` +
   `tests/13-dispatcher-map-light.spec.ts`
   + visual baseline.
6. **Bolt 008-013** (Unit 006): new
   `app/api/v1/dispatcher/monitor/route.ts`
   + new
   `app/api/v1/dispatcher/monitor/ack/route.ts`
   + new `app/dispatcher/monitor/page.tsx` +
   new `lib/dispatcher/monitor.ts` +
   `tests/unit/dispatcher/monitor.test.ts` +
   the monitor half of the shared
   `tests/26-dispatcher-monitor-performance.spec.ts`.
   No visual baseline (the surface is
   live-polling).
7. **Bolt 008-014** (Unit 007): new
   `app/api/v1/dispatcher/performance/route.ts`
   + new `app/dispatcher/performance/page.tsx` +
   new `lib/dispatcher/performance.ts` +
   `tests/unit/dispatcher/performance.test.ts` +
   the performance half of the shared
   `tests/26-dispatcher-monitor-performance.spec.ts`.
   No visual baseline (the surface is
   date-dependent).

Each bolt is a `ddd-construction-bolt`
(no separate Construction-KB bolts; per
aidlc.md, the framework composes the
minimum viable workflow — Units 001-004
are scope `feature` and lean on Code
Generation + Build and Test + the
inherited `transitionTicket` engine).

Verification command (per
`team.md` Mandated +
`project.md` Walking Skeleton):
`npx tsc --noEmit && npm run test:unit
&& npm run test:mockups && curl -fs
http://localhost:3000/`.
