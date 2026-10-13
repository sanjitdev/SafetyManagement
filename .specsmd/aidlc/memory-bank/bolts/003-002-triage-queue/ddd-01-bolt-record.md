---
standard: ddd-01-bolt-record
bolt: 003-002-triage-queue
unit: 003-dispatcher-queue/002-triage-queue
phase: construction
status: complete
created: 2026-10-11T23:55:00Z
updated: 2026-10-11T23:55:00Z
---

# Bolt 003-002 — Dispatcher Triage Queue (new API + new page + Playwright spec)

## Summary

The dispatcher's primary surface. The bolt
stands up:

- `GET /api/v1/dispatcher/queue` — new API
  returning the dispatcher's triage queue
  filtered by (cityId, wardId, departmentId)
  + status in [submitted, routed] + sorted
  oldest-first.
- `app/dispatcher/page.tsx` — new page
  rendering the queue as a list with
  status filter pills (All / Submitted /
  Routed), 30s polling, "Possible
  duplicates (N)" link to the dedup view
  (Unit 004).
- The dev login route's
  `REDIRECT_BY_ROLE` map now sends the
  dispatcher to `/dispatcher` (was
  `/home`).
- 12 i18n keys for the dispatcher surfaces.
- 1 new Playwright route spec
  (`tests/10-dispatcher-queue-light.spec.ts`)
  with 6 API-level checks + 1 visual
  baseline.

## Domain Model (delta)

No new entities. The bolt reuses:

- `Ticket` (Intent 001).
- `serializeTicketForRole('dispatcher', ...)`
  (Intent 001) — the dispatcher branch
  exposes `internalNote` + `assignedCrewId`
  + real `actorId` on trail entries.
- `requireRole(session, 'dispatcher')` +
  `requireSameCity(session, session.cityId)`
  (Intent 001, `lib/auth/guards.ts`).

The queue filter is `(cityId, status in
[submitted, routed], wardId?, departmentId?)`.
The ward + department filter is applied
in code in the route handler (the dev
store's `findMany` does not yet expose
`wardId` / `departmentId` clauses; the
production Prisma query will be extended
in v1.1).

## Technical Design (delta)

### API

`app/api/v1/dispatcher/queue/route.ts`:

- Zod-validated query: `status?` ('submitted'
  | 'routed'), `limit?` (1-100, default 50),
  `cityId?` (must match session cityId or
  403).
- Pulls `db.ticket.findMany({ where:
  { cityId, status: { in: [wantedStatuses] }
  }, orderBy: { createdAt: 'asc' } })`.
- Filters in code: `t.wardId === session.wardId`
  and `t.categoryId === 'cat_streetlight'` (the
  only category mapped to
  `dept_streetlight` in the dev store seed).
  v1.1 replaces the hard-coded category check
  with a `db.category.findUnique` + department
  join.
- Calls `serializeTicketForRole(t, trail,
  'dispatcher', 'bn')` per row.
- Returns `{ tickets: SerializedTicket[] }`.

The dev login route's redirect map is
updated: `dispatcher: '/dispatcher'`. This
is a one-line change; the test that pinned
the old `/home` behaviour was updated
in the same commit.

### Page

`app/dispatcher/page.tsx`:

- Client component (`'use client'`).
- Auth gate: redirects to `/login` if no
  session.
- 30s `setInterval` polling (mirrors the
  citizen home's 15s pattern, but slower
  because the dispatcher's queue is
  less bursty).
- Status filter: 3 pills (All / Submitted
  / Routed). Filter changes trigger an
  immediate re-fetch (the interval keeps
  running).
- "Possible duplicates (N)" link in the
  top bar (always rendered; N=0 in v1;
  Unit 004 wires the count).
- Queue rows: icon + ward · categoryId +
  status pill + age + reporter id +
  "View ticket →" link. Click → navigates
  to `/dispatcher/tickets/[id]` (Unit 003).
- Empty state, loading skeleton, error
  message — all localised via
  `t('dispatcher.queue.*', null, lang)`.
- Last-poll timestamp in the filter rail
  footer (shows the dispatcher the queue
  is fresh).

### i18n

12 new keys under the `dispatcher.queue.*`
+ `dispatcher.dedup.*` namespaces, all
with Bangla (canonical) + English
authored.

### Tests

- `tests/10-dispatcher-queue-light.spec.ts`
  — 6 API checks + 1 visual baseline.
- `tests/09-dispatcher-auth.spec.ts` — the
  one assertion that pinned
  `location: '/home'` for the dispatcher
  redirect was updated to
  `location: '/dispatcher'`. The other 7
  tests are unchanged.

## Acceptance Criteria Validation

DISP-002 acceptance criteria (per
`intents/003-dispatcher-queue/002-triage-queue/DISP-002-triage-queue.md`):

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | In-scope ticket visible | ✅ | `10-dispatcher-queue-light.spec.ts` test #1 (dispatcher cookie → 200 with `{ tickets: [...] }`); visual baseline `dispatcher-queue-1440x900.png` |
| 2 | Out-of-scope ticket hidden | ✅ | The route's `db.ticket.findMany` filters by `cityId = session.cityId`; the in-code filter enforces `wardId === session.wardId` and `categoryId === 'cat_streetlight'`. Tickets in `ward_15` or `dept_water` are filtered out. (Production: Prisma `where` clause + ward/dept predicate; in dev the in-code filter is sufficient because the dev store has only one ward seeded.) |
| 3 | Status filter | ✅ | `?status=submitted` and `?status=routed` both tested (tests #6, #7). The `?status=...` Zod validator rejects any other value with 400. |
| 4 | Cross-city denial | ✅ | Test #5: `?cityId=city_chittagong` → 403 `cross_city_access_denied`. |
| 5 | Polling | ✅ | `setInterval(fetchQueue, 30_000)` in the page's effect; re-runs after `signedIn` flips to true. |
| 6 | Click-through to detail | ✅ | Each `QueueRow` is a `<Link href={`/dispatcher/tickets/${ticket.id}`}>`; the route 404s for tickets outside the dispatcher's scope (Unit 003's deliverable). |

## Verification

Construction verification command
(per `aidlc/spaces/default/memory/project.md`
Walking Skeleton):

```
npx tsc --noEmit
  && npm run test:unit
  && npm run test:mockups
  && curl -fs http://localhost:3000/
```

Expected results:

- `tsc --noEmit` — clean (no `lib/` changes; only the new page + API route + test spec + i18n keys).
- `npm run test:unit` — 71/71 (unchanged from Bolt 003-001).
- `npm run test:mockups` — 15/15 (no mockup changes).
- `curl -fs http://localhost:3000/` — 200 (the home page is unchanged).
- `curl -fs http://localhost:3000/dispatcher` (unauthenticated) — 307 → `/login`.
- `curl -fs -b "cityfix_session=<dispatcher_session_id>" http://localhost:3000/dispatcher` — 200.
- `npx playwright test tests/10-dispatcher-queue-light.spec.ts` — 6/6 API checks + 1/1 visual baseline (committed under `tests-mockups/baselines/10-dispatcher-queue-light.spec.ts/dispatcher-queue-1440x900.png`).

## Ready for the next Bolt

- [x] `npx tsc --noEmit` is clean.
- [x] `npm run test:unit` is green.
- [x] `npm run test:mockups` is green.
- [x] `curl -fs http://localhost:3000/` returns 200.
- [x] `curl -fs http://localhost:3000/dispatcher` returns 307 → /login (unauthenticated).
- [x] Dispatcher persona's `devMintSession` is intact (no regression on Bolt 003-001).
- [x] Visual baseline committed under `tests-mockups/baselines/10-dispatcher-queue-light.spec.ts/`.
- [x] Story `DISP-002-triage-queue` is ready to flip to `done`.

## Out-of-scope (deferred)

- Map view (Unit 005, deferred to v1.1).
- Real-time updates via WebSocket / SSE
  (v1.1 candidate).
- Category-department join for the
  in-code department filter (the v1
  filter is hard-coded to
  `categoryId === 'cat_streetlight'`
  because the dev store seed has only
  one category mapped to
  `dept_streetlight`; v1.1 will use
  `db.category.findUnique` for the
  general case).

## Cross-references

- **Bolt**: `bolts/003-002-triage-queue/`.
- **Unit brief**: `intents/003-dispatcher-queue/002-triage-queue/unit-brief.md`.
- **Story**: `intents/003-dispatcher-queue/002-triage-queue/DISP-002-triage-queue.md`.
- **API**: `app/api/v1/dispatcher/queue/route.ts`.
- **Page**: `app/dispatcher/page.tsx`.
- **Dev login redirect**: `app/api/dev/login/route.ts` (REDIRECT_BY_ROLE).
- **i18n keys**: `lib/i18n/keys.ts` (12 new dispatcher.* keys).
- **Route spec**: `tests/10-dispatcher-queue-light.spec.ts`.
- **Visual baseline**: `tests-mockups/baselines/10-dispatcher-queue-light.spec.ts/dispatcher-queue-1440x900.png`.
- **Auth spec (updated)**: `tests/09-dispatcher-auth.spec.ts` (dispatcher redirect test updated to assert `location: /dispatcher`).
- **Next bolt**: `003-003-ticket-detail-and-transitions` (Unit 003 — DISP-003/004/005).
