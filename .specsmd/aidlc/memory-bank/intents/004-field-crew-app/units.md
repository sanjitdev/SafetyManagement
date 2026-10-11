---
intent: 004-field-crew-app
phase: construction
status: in-progress
updated: 2026-10-12T04:00:00Z
---

# Field Crew App - Unit Decomposition

## Units Overview

This intent is **in-progress** (2026-10-12).
Unit briefs and story specs are in place for
all 4 units. The unit dependency graph is linear:
auth → list → resolve → offline-read.

### Unit 001: auth-and-scope

**Status**: `done`
**Brief**:
`001-auth-and-scope/unit-brief.md`
**Stories**:
- `001-auth-and-scope/CREW-001-auth-scope.md` (done)

**Estimated Complexity**: M (paperwork +
small test suite; the platform layer already
implements `User.role = 'crew'` + the
`requireScope(...)` guard).

**Delivery note** (2026-10-12, Bolt
004-001): paperwork + Vitest
`tests/unit/crew-scope.test.ts` (17
checks across 4 describe blocks) +
Playwright `tests/13-crew-auth.spec.ts`
(9 checks; 3 pass today, 6
self-skip until Bolt 004-002 lands
`/api/v1/crew/tickets`). No new `lib/`
code; the platform layer's guards and
the dev login route cover the contract.
Acceptance 6 (out-of-scope → 404) is
wired in Bolt 004-002's route via the
`loadInScope()` helper. Bolt record:
`bolts/004-001-crew-auth-and-scope/ddd-01-bolt-record.md`.

### Unit 002: todays-assignments

**Status**: `done`
**Brief**: `002-todays-assignments/unit-brief.md`
**Stories**:
- `002-todays-assignments/CREW-002-todays-assignments.md` (done)

**Estimated Complexity**: M (1 new API + 1
new page + Playwright spec + 1 visual baseline).

**Delivery note** (2026-10-12, Bolt
004-002): new `GET /api/v1/crew/tickets`
+ new `app/crew/page.tsx` (mobile-first
390x844; 30s polling; Geolocation
opt-in for distance column) + dev
login redirect delta (`crew → /crew`,
was `/home`) + 13 new i18n keys +
Playwright `tests/14-crew-assignments-light.spec.ts`
(7 API checks + 2 visual baselines at
390x844 light theme) +
`tests/13-crew-auth.spec.ts` redirect
pin updated in lockstep. Bolt record:
`bolts/004-002-todays-assignments/ddd-01-bolt-record.md`.

### Unit 003: ticket-detail-and-resolve

**Status**: `done`
**Brief**:
`003-ticket-detail-and-resolve/unit-brief.md`
**Stories**:
- `003-ticket-detail-and-resolve/CREW-003-resolve.md` (done)
- `003-ticket-detail-and-resolve/CREW-004-resolution-note.md` (done)
- `003-ticket-detail-and-resolve/CREW-005-navigate.md` (done)

**Estimated Complexity**: L (1 new API for
the crew transition + 1 new API for the after
photo + 1 new page + Playwright spec + visual
baselines + 3 stories that share the surface).

**Delivery note** (2026-10-12, Bolt
004-003): new `GET /api/v1/crew/tickets/[id]`
+ new `POST .../transition` (with
`ALLOWED_CREW_TRANSITIONS = ['in_progress',
'resolved']` + Zod `superRefine` for
`resolution_note_required`) + new `POST
.../photos` (with `after_photo:<url>` trail
prefix + `ticket.after_photo_added` audit
row) + new `app/crew/tickets/[id]/page.tsx`
(mobile-first 390x844; full record + status
trail + photo gallery + after-photo input +
Navigate CTA + transition buttons + resolution
note textarea) + new pure module
`app/crew/tickets/[id]/navigate-href.ts`
(`detectPlatform` + `buildNavigateHref` for
iOS / Android / web URL schemes) + 28 new
i18n keys + Playwright
`tests/15-crew-ticket-light.spec.ts` (11 API
checks + 2 visual baselines at 390x844 light
theme: `crew-ticket-routed-390x844.png` +
`crew-ticket-in-progress-390x844.png`) +
additive dev-seed change (`ticket_seed_routed_1`
+ generalised trail-entry generation).
Bolt record:
`bolts/004-003-ticket-detail-and-resolve/ddd-01-bolt-record.md`.

### Unit 004: offline-read

**Status**: `done`
**Brief**: `004-offline-read/unit-brief.md`
**Stories**:
- `004-offline-read/CREW-006-offline-read.md`
  (done)

**Estimated Complexity**: M (localStorage
cache + read-only fallback; no service worker
in v1).

**Delivery note** (2026-10-12, Bolt
004-004): new pure-JS module
`lib/crew/cache.ts` (typed read / write /
`isStale` / `tryParse` / `formatCachedAge`
helpers + a `setStorage` test seam) +
Vitest `tests/unit/crew-cache.test.ts`
(~25 checks across 7 describe blocks; uses
an in-memory `MemoryStorage` polyfill — no
`vitest-environment-jsdom` needed) +
5 new i18n keys under `crew.cache.*` +
small edits to `app/crew/page.tsx` and
`app/crew/tickets/[id]/page.tsx` to read
the cache on mount + write on a successful
response + show a "Cached, may be stale"
banner when the page is showing a cached
snapshot. The cache write on a successful
list fetch ALSO writes each row to its
per-ticket cache key, so a deep-link from
a notification sees the fresh state. The
cache update on a successful transition /
photo append is the optimistic-write
pattern; the network's response always
wins. +re-keying delta to
`tests/unit/dev-store.test.ts` to avoid
the Bolt 004-003 dev-seed additive change
colliding with two pre-existing tests.
Bolt record:
`bolts/004-004-offline-read/ddd-01-bolt-record.md`.

## Status

Active build (2026-10-12). Intent 003
(Dispatcher Queue) is `complete`; this intent
is `in-progress`. The unit decomposition is the
4 units from the `draft` phase, revised at
entry to active build and now fully specced.

**Bolt progress** (2026-10-12):

- `004-001-crew-auth-and-scope` — done
  (paperwork + Vitest 17 checks +
  Playwright 9 checks; no new `lib/`).
- `004-002-todays-assignments` — done
  (1 new API + 1 new page + 2 visual
  baselines + 13 i18n keys + dev login
  redirect delta).
- `004-003-ticket-detail-and-resolve` — done
  (1 GET API + 2 POST APIs + 1 new page + 1
  pure module + 28 i18n keys + 2 visual
  baselines + additive dev-seed change).
- `004-004-offline-read` — done
  (1 new pure-JS cache module + Vitest
  ~25 checks + 5 i18n keys + small
  page deltas; no new Playwright spec;
  cache behaviour is verified via
  Vitest).

The unit decomposition is the 4 units from the
`draft` phase, revised at entry to active
build and now fully specced:

- **Unit 001 — auth-and-scope**: the platform
  layer (Intent 001) already implements
  `User.role = 'crew'` and the
  `requireScope(session, wardId, departmentId)`
  guard. The dispatcher dev persona pattern
  (Bolt 003-001) was paperwork + tests; this
  unit is the same shape for the crew persona.
  No new source code in `lib/`; the only
  new code is the dev login redirect map
  pointing `?role=crew` to `/crew` (Bolt
  004-002's page).
- **Unit 002 — todays-assignments**: new API
  `GET /api/v1/crew/tickets` returning
  tickets where `assignedCrewId = session.userId`
  AND `status ∈ {routed, in_progress}`,
  sorted by routing time. New page
  `app/crew/page.tsx` with 30s polling.
  Each row shows status, category, age, and
  distance from the device's current location
  (if the browser Geolocation API grants
  permission; otherwise the distance field is
  hidden — a graceful fallback).
- **Unit 003 — ticket-detail-and-resolve**: new
  page `app/crew/tickets/[id]/page.tsx` with
  the full record + the "Mark in progress" /
  "Mark resolved" / "Capture after photo"
  buttons + the resolution note textarea +
  the "Navigate" CTA (a link to the device
  maps app via URL scheme). The existing
  `POST /api/v1/dispatcher/tickets/[id]/transition`
  is generalised to a new
  `POST /api/v1/crew/tickets/[id]/transition`
  with `ALLOWED_CREW_TRANSITIONS =
  ['in_progress', 'resolved']`; the engine
  validates the edge. A new
  `POST /api/v1/crew/tickets/[id]/photos`
  appends a URL to `Ticket.photoUrls`
  (the "after" photo). Both routes enforce
  the crew's `(cityId, wardId, departmentId)`
  scope via `requireScope(...)` and reject
  out-of-scope with 404.
- **Unit 004 — offline-read**: a `localStorage`
  cache for the day's assignments + the
  last-known state of each ticket. On
  network failure, the list + detail page
  renders the cached snapshot with a
  "Cached, may be stale" banner. Writes
  fail loudly (no silent queue) — a v1.1
  bolt may add an IndexedDB + service worker
  write queue.

The unit dependency graph:

```text
[Intent 001 platform] ─┐
                       ├─> [Unit 001 auth-and-scope] ──┐
[Intent 003 dispatcher]─┘                                │
                                                          v
                  [Unit 002 todays-assignments] ──> [Unit 003 ticket-detail-and-resolve]
                                                          │
                                                          v
                  [Unit 004 offline-read]
```

The 004-003 unit generalises the dispatcher
transition route (Bolt 003-003) rather than
re-implementing it. The 004-004 unit is a
*thin* read-only layer on top of 004-002 +
004-003; the visual + storage code is small.

## Stories owned

| Slug | Title | Unit | Status target |
|------|-------|------|---------------|
| CREW-001 | auth-scope | 001 | `done` |
| CREW-002 | todays-assignments | 002 | `done` |
| CREW-003 | resolve | 003 | `done` |
| CREW-004 | resolution-note | 003 | `done` |
| CREW-005 | navigate | 003 | `done` |
| CREW-006 | offline-read | 004 | `done` |

## Bolt plan

4 Bolt candidates, one per unit. The bolt
sequence:

1. **Bolt 004-001** (Unit 001):
   paperwork + unit test + Playwright
   `13-crew-auth.spec.ts`. No new source
   code in `lib/` — the platform layer
   already ships. The bolt may touch only
   `tests/`.
2. **Bolt 004-002** (Unit 002): new
   `app/api/v1/crew/tickets/route.ts` +
   new `app/crew/page.tsx` +
   `tests/14-crew-assignments-light.spec.ts`
   + 1 visual baseline. Tweaks
   `app/api/dev/login/route.ts` to redirect
   `crew` to `/crew`.
3. **Bolt 004-003** (Unit 003): new
   `app/api/v1/crew/tickets/[id]/transition/route.ts`
   (POST) + new
   `app/api/v1/crew/tickets/[id]/photos/route.ts`
   (POST) + new
   `app/crew/tickets/[id]/page.tsx` +
   `tests/15-crew-ticket-light.spec.ts` +
   2 visual baselines (routed / in_progress
   at 390x844 light theme — the crew's
   target viewport).
4. **Bolt 004-004** (Unit 004): new
   `lib/crew/cache.ts` +
   `tests/unit/crew-cache.test.ts` +
   per-page cache readers. No new
   Playwright spec; the cache behaviour is
   verified via Vitest (the cache is
   pure-JS).

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
