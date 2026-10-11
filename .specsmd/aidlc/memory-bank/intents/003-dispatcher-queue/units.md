---
intent: 003-dispatcher-queue
phase: construction
status: in-progress
updated: 2026-10-12T01:30:00Z
---

# Dispatcher Queue - Unit Decomposition

## Units Overview

This intent is **in-progress** (2026-10-11).
Unit briefs and story specs are in place for
all 5 units. The deferred Unit 005 (map view)
has paperwork only; no construction work in
this intent.

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

### Unit 005: map-view (deferred to v1.1)

**Status**: `deferred`
**Brief**: `005-map-view/unit-brief.md`
**Stories**:
- `005-map-view/DISP-007-dispatcher-map.md`

**Estimated Complexity**: M (1 API +
1 page; reuses inherited `MapView`).

## Status

Active build (2026-10-12). Intent 002
(Citizen Report Flow) is `complete`; this
intent is `in-progress`. The unit
decomposition is the 5 units from the
`draft` phase, revised at entry to active
build and now fully specced.

**Bolt progress** (2026-10-12):

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
- `003-005-map-view` — deferred to v1.1.

The unit decomposition is the 5 units from the
`draft` phase, revised at entry to active
build and now fully specced:

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
- **Unit 005 — map-view (deferred to v1.1)**:
  the unit-brief and story spec are filed
  for the v1.1 hand-off. No construction
  work in this intent. The story is `Should`
  priority; the bolt plan records the
  deferral.

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
002-004; it depends only on Unit 001. It is
deferred to v1.1 anyway.

## Stories owned

| Slug | Title | Unit | Status target |
|------|-------|------|---------------|
| DISP-001 | auth-scope | 001 | `done` |
| DISP-002 | triage-queue | 002 | `done` |
| DISP-003 | ticket-detail | 003 | `done` |
| DISP-004 | reassign | 003 | `done` |
| DISP-005 | internal-notes | 003 | `done` |
| DISP-006 | dedup-decline-review | 004 | `done` |
| DISP-007 | dispatcher-map | 005 | **`pending`** (v1.1) |

## Bolt plan

5 Bolt candidates, one per unit. The bolt
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
5. **Bolt 003-005** (Unit 005): deferred.
   No construction work in this intent.

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
