---
unit: 004-offline-read
intent: 004-field-crew-app
phase: construction
status: ready
created: 2026-10-12T01:30:00Z
updated: 2026-10-12T01:30:00Z
---

# Unit Brief: Offline-Read (read-only cache for flaky networks)

## Purpose

A crew member on the road often has flaky
network — between dead zones in a city, the
connection drops for a few seconds at a
time. The crew app must remain *readable* in
that window: the list of assignments + the
last-known state of each ticket should still
be visible so the crew member can decide
which ticket to drive to next, and which
ones they've already resolved.

This is **read-only**. Writes (transitions,
photos) fail loudly on a flaky network —
there is NO silent write queue in v1. The
crew member sees an error and can retry when
the network recovers. (A v1.1 bolt may add
an IndexedDB + service-worker write queue;
the v1 surface is honest about its limits.)

## Scope

### In Scope

- `lib/crew/cache.ts` — a small
  pure-JS module that wraps
  `localStorage` with typed reads /
  writes for the crew's "today's
  assignments" snapshot and the
  per-ticket last-known state.
- The list page (Unit 002) reads the
  cached snapshot on mount BEFORE the
  network request lands, so the page
  is immediately interactive. If the
  network request succeeds, the page
  re-renders with the fresh data; if
  it fails, the page stays on the
  cached snapshot and shows a
  "Cached, may be stale" banner.
- The detail page (Unit 003) reads
  the cached per-ticket snapshot on
  mount with the same fallback
  pattern. Writes (transitions,
  photos) still go to the network;
  on failure, the page shows the
  error and the user can retry.
- A `localStorage` schema:
  - `cityfix.crew.cache.v1.assignments` —
    JSON-encoded `SerializedTicket[]` for
    the current user. TTL: 1 hour.
  - `cityfix.crew.cache.v1.ticket.<id>` —
    JSON-encoded `SerializedTicket` for
    one ticket. TTL: 1 hour.
- A "Cache invalidation on write" rule:
  after a successful transition or photo
  append, the cache for the affected
  ticket is updated *optimistically*
  with the response, so the next read
  is fresh even if the network drops
  immediately after.
- ~5 new i18n keys under `crew.cache.*`
  (banner copy, etc).
- A `tests/unit/crew-cache.test.ts`
  Vitest unit test (10+ checks) for
  the cache module: read / write /
  TTL / invalidation / schema version
  mismatch / corrupted JSON recovery.

### Out of Scope

- **Write queue** (IndexedDB + service
  worker). v1 fails writes loudly on
  flaky networks. A v1.1 bolt may
  add a write queue with sync conflict
  resolution.
- **Service worker**. v1 is just
  `localStorage`. A v1.1 bolt may add
  a service worker for true offline
  app shell.
- **TTL extension** beyond 1 hour. v1
  considers cached data > 1h old too
  risky to display (the ticket may
  have been resolved / re-assigned).
  A v1.1 bolt may tune the TTL.
- **Cross-device sync**. The cache is
  per-device; if a crew member switches
  phones, the new device has no cache
  and must fetch fresh.
- **Conflict resolution**. v1 displays
  the cached snapshot only on
  network failure; the network response
  always wins when it lands.

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| CREW-REQ-006 | Read-only on flaky network (cache today's assignments + per-ticket state; writes fail loudly) | Should |

## Domain Concepts

### Key Entities

| Entity | Description | Attributes |
|--------|-------------|------------|
| `CrewCacheEntry` | (new) | `data: SerializedTicket[] \| SerializedTicket`, `cachedAt: ISO`, `version: 1` |
| `localStorage` | (browser API) | `cityfix.crew.cache.v1.<key>` — stringified JSON |

### Key Operations

| Operation | Description | Inputs | Outputs |
|-----------|-------------|--------|---------|
| `readAssignmentsCache()` | Read the assignments cache, or `null` if missing / stale / corrupted | (none) | `{ data, cachedAt } \| null` |
| `writeAssignmentsCache(tickets)` | Write the assignments cache | `tickets: SerializedTicket[]` | `void` |
| `readTicketCache(id)` | Read the per-ticket cache, or `null` if missing / stale / corrupted | `id: string` | `{ data, cachedAt } \| null` |
| `writeTicketCache(ticket)` | Write the per-ticket cache | `ticket: SerializedTicket` | `void` |
| `isStale(entry, now)` | True if `now - entry.cachedAt > TTL_MS` | entry, now (ms) | boolean |
| `tryParse<T>(raw)` | Parse JSON; return `null` on parse error | `raw: string` | `T \| null` |

## Story Summary

| Metric | Count |
|--------|-------|
| Total Stories | 1 |
| Must Have | 0 |
| Should Have | 1 |
| Could Have | 0 |

### Stories

| Story ID | Title | Priority | Status |
|----------|-------|----------|--------|
| CREW-006-offline-read | Read-only cache for flaky networks | Should | in-progress |

## Dependencies

### Depends On

| Unit | Reason |
|------|--------|
| 002-todays-assignments | The list page is the first *consumer* of the cache |
| 003-ticket-detail-and-resolve | The detail page is the second *consumer*; the write paths invalidate the cache |
| Intent 001 (Unit 001) | `SerializedTicket` (the type the cache stores) |

### Depended By

None. The cache is a leaf module.

## Technical Context

### Suggested Technology

- `lib/crew/cache.ts` — a pure-JS
  module. No React, no JSX. The
  module exports `readAssignmentsCache`,
  `writeAssignmentsCache`,
  `readTicketCache`, `writeTicketCache`,
  `invalidateTicketCache` (called after
  a successful write), and `CACHE_TTL_MS`.
- The list page's `useEffect` reads the
  cache first, sets `tickets` to the
  cached value (with `cachedAt` so the
  banner can render "Cached 5m ago"),
  then fires the network request. If
  the network request succeeds, the
  page writes the fresh data to the
  cache and re-renders. If the network
  request fails, the page stays on the
  cached value and shows the banner.
- The detail page follows the same
  pattern.
- After a successful transition or
  photo append, the page optimistically
  writes the response to the cache so
  the next read is fresh.
- The cache module is **safe to import
  in Node** (the module checks
  `typeof localStorage !== 'undefined'`
  before touching it). The Vitest test
  runs in Node with a `localStorage`
  polyfill (`vitest-environment-jsdom`
  is not needed; a simple in-memory
  stub suffices).

### Integration Points

| Integration | Type | Protocol |
|-------------|------|----------|
| `localStorage` | browser API | string |
| `app/crew/page.tsx` | in-process | function call |
| `app/crew/tickets/[id]/page.tsx` | in-process | function call |

### Data Storage

`localStorage` (browser-only). The schema
version is in the key (`v1`) so a future
schema change can ignore old keys without
crashing.

## Constraints

- The cache is READ-ONLY for offline
  use. Writes (transitions, photos)
  ALWAYS go to the network. If the
  network fails, the page shows the
  error and the user can retry. There
  is NO silent write queue in v1.
- The cache TTL is 1 hour. Older
  entries are ignored. A v1.1 bolt
  may tune the TTL.
- The cache schema version is `v1`.
  A future schema change increments
  to `v2` and the cache module
  ignores `v1` keys.
- The cache module is pure JS — no
  React, no JSX, no Prisma, no DB
  imports. It can be unit-tested in
  pure Vitest.

## Success Criteria

### Functional

- [ ] On a successful list fetch, the
      cache is updated.
- [ ] On a list fetch failure, the page
      renders the cached snapshot and
      shows the banner.
- [ ] On a successful transition, the
      affected ticket's cache entry is
      updated with the new state.
- [ ] On a transition failure, the
      page shows the error AND the
      cache is NOT updated (the cached
      state is unchanged).
- [ ] A cache entry > 1h old is
      treated as missing.
- [ ] Corrupted JSON in the cache
      returns `null` (the page falls
      back to the network, which
      fails, and the user sees the
      error).
- [ ] A `v2` cache entry (future
      schema) is ignored — the page
      fetches fresh.

### Non-Functional

- [ ] `npx tsc --noEmit` is clean.
- [ ] `npm run test:unit` is green.

### Quality

- [ ] Vitest unit test pinned for the
      cache module (10+ checks).
- [ ] No new visual baseline (the
      banner is a small text element;
      the visual change is captured in
      the existing Unit 002 / 003
      baselines).

## Bolt Suggestions

A single `ddd-construction-bolt` for this
unit. The bolt is one new module + a small
test suite + small edits to the list and
detail pages (the cache read on mount).

## Notes

The v1 surface intentionally does NOT
attempt to be a fully-offline-first app.
The PRD-allowed read-only cache is the
minimum viable behaviour; the write queue
is deferred. A v1.1 bolt can add an
IndexedDB + service-worker write queue
with sync conflict resolution.

The cache module's pure-JS design is
deliberate. A v1.1 bolt may introduce a
React hook (`useCachedAssignments`) that
wraps the module; for v1 the pages
inline the read / write calls in their
`useEffect`s because there are only two
consumers.
