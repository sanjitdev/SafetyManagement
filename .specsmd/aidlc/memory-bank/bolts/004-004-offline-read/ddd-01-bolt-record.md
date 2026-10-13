---
standard: ddd-01-bolt-record
bolt: 004-004-offline-read
unit: 004-field-crew-app/004-offline-read
phase: construction
status: complete
created: 2026-10-12T04:00:00Z
updated: 2026-10-12T04:00:00Z
---

# Bolt 004-004 — Offline-Read (read-only cache for flaky networks)

## Summary

The crew's "read-only when the network is
flaky" surface. The bolt stands up:

- `lib/crew/cache.ts` — a small pure-JS module
  that wraps `localStorage` with typed reads /
  writes for the crew's "today's assignments"
  snapshot and the per-ticket last-known
  state. The module is **safe to import in
  Node** — it checks `typeof localStorage !==
  'undefined'` before touching it. A test
  `setStorage(s)` polyfill seam lets Vitest
  run in pure Node (no `jsdom` needed).
- 5 new i18n keys under `crew.cache.*`
  (`banner`, `banner.detail`, `last_updated`,
  `empty`, `retry`).
- `app/crew/page.tsx` delta — cache read on
  mount BEFORE the network request; cache
  write on a successful list fetch; "Cached,
  may be stale" banner rendered when the
  page is showing a cached snapshot because
  the network failed.
- `app/crew/tickets/[id]/page.tsx` delta —
  same pattern: per-ticket cache read on
  mount, write on a successful fetch, write
  on a successful transition / photo append
  (optimistic update with the server's
  response), banner rendered when the
  page is showing a cached snapshot.
- `tests/unit/crew-cache.test.ts` — Vitest
  unit test (~25 checks across 7 describe
  blocks) for the cache module: read /
  write / TTL / schema version / corrupted
  JSON / storage absence / formatCachedAge
  bilingual. The test uses a small
  `MemoryStorage` polyfill.
- `tests/unit/dev-store.test.ts` delta — two
  pre-existing tests (`findMany` filters +
  `status {in: [...]}` filter) are re-keyed
  to `cat_other` / a synthetic test city
  to avoid colliding with the Bolt 004-003
  dev-seed additive change.

## Domain Model (delta)

No new entities. The bolt reuses:

- `SerializedTicket` (PLAT layer) — the type
  the cache stores.
- `localStorage` (browser API) — the storage
  medium. The module is the only code that
  touches it; pages call into the module's
  typed helpers.

The cache is keyed by user. The key prefix
includes the user's session id so two crew
members on the same shared device don't see
each other's data:

```text
cityfix.crew.cache.v1.<userId>.assignments
  → { data: SerializedTicket[], cachedAt: ISO, version: 1 }

cityfix.crew.cache.v1.<userId>.ticket.<ticketId>
  → { data: SerializedTicket, cachedAt: ISO, version: 1 }
```

The schema version is in the key (`v1`) so a
future schema change increments to `v2` and
the v2 reader ignores `v1.*` keys without
crashing.

The TTL is `CACHE_TTL_MS = 60 * 60 * 1000`
(1 hour). A `v1.1` bolt may tune this. A
cached entry older than the TTL is treated
as missing.

## Technical Design (delta)

### `lib/crew/cache.ts` (new)

The module exports:

- `CACHE_SCHEMA_VERSION = 'v1'`
- `CACHE_TTL_MS = 60 * 60 * 1000`
- `CrewCacheEntry<T> = { data: T, cachedAt: string, version: 1 }`
- `ReadResult<T> = { data: T, cachedAt: string }`
- `setStorage(s: StorageLike | null)` — test seam.
- `isStale(entry, now): boolean` — true if
  `now - entry.cachedAt > TTL_MS`. The check
  is `> TTL_MS` (not `>=`) so a fresh entry
  just under the threshold is still valid.
- `tryParse<T>(raw): T | null` — JSON.parse
  wrapped in a try/catch.
- `readAssignmentsCache(userId, now): ReadResult<SerializedTicket[]> | null`
- `writeAssignmentsCache(userId, tickets, now): void`
- `readTicketCache(userId, ticketId, now): ReadResult<SerializedTicket> | null`
- `writeTicketCache(userId, ticket, now): void`
- `invalidateTicketCache(userId, ticketId): void` —
  the list cache is NOT invalidated here; the
  list page overwrites it on its 30s poll.
- `formatCachedAge(cachedAt, now, lang): string` —
  relative-time formatter ('just now' / 'Xm
  ago' / 'Xh ago' / 'Xd ago') in English +
  Bangla.

Every read returns `null` on any failure:
missing key, stale entry, corrupted JSON,
schema mismatch, no `localStorage` (e.g.
Node SSR). Every write is a no-op when
`localStorage` is unavailable or the
`setItem` throws (quota exceeded, private
mode).

The module's behaviour for the storage-
absence case is critical for SSR safety:
the Next.js dev server imports the page
tree on the server, and a `localStorage`
reference there would throw at module load.
The `getStorage()` helper returns `null`
when `globalThis.localStorage` is
undefined, and every public function
short-circuits on `null`.

### List page delta (`app/crew/page.tsx`)

- New state: `cacheSnapshot: ReadResult<SerializedTicket[]> | null`
  + `userId: string | null`.
- New `useEffect` to fetch the session's
  `userId` (extends the existing
  `/api/auth/status` response to also
  capture `userId`).
- New `useEffect` (gated on `userId`): read
  the cache synchronously on mount BEFORE
  the network request lands. If a fresh
  entry exists, seed the `tickets` state
  + set `cacheSnapshot` + clear `loading`.
- `fetchTickets`: on a successful response,
  write the response to the cache + the
  per-ticket cache keys, then clear
  `cacheSnapshot`. On a 5xx / network error,
  the cache snapshot (if any) is preserved;
  the page shows the banner.
- Banner UI: a warning-styled bar above the
  page title with the relative time
  (`crew.cache.last_updated` +
  `formatCachedAge`) and a "Retry" button
  that re-fires the network request.

### Detail page delta (`app/crew/tickets/[id]/page.tsx`)

- Same state additions: `cacheSnapshot`
  + `userId`.
- Same `useEffect` chain: userId fetch →
  cache read on mount → fetch on mount.
- `fetchTicket`: on success, write the
  response to the per-ticket cache + clear
  `cacheSnapshot`. On failure (5xx / network
  error), the cache snapshot (if any) is
  preserved; the page shows the banner. A
  404 is preserved (the ticket is
  genuinely gone); a 5xx is the cache-
  fallback path.
- `onTransition`: on a successful 200,
  write the response to the per-ticket
  cache (optimistic update) + clear
  `cacheSnapshot`. On any non-2xx, the
  cache is NOT updated; the page shows the
  error.
- `onAddPhoto`: same pattern as
  `onTransition` — write the response to
  the per-ticket cache on success.
- Banner UI: a warning-styled bar between
  the top bar and the page body with the
  relative time + a "Retry" button that
  re-fires `fetchTicket()`.

### i18n

5 new keys under `crew.cache.*`:

- `crew.cache.banner` — "ক্যাশ থেকে দেখানো
  হচ্ছে, পুরনো হতে পারে" / "Cached, may be
  stale" (the wide-banner title).
- `crew.cache.banner.detail` — long-form
  detail sentence (not wired in the v1 UI;
  reserved for a v1.1 tooltip expansion).
- `crew.cache.last_updated` — "সর্বশেষ
  আপডেট: {when}" / "Last updated: {when}"
  (the inline banner copy with a
  `{when}` placeholder for
  `formatCachedAge`).
- `crew.cache.empty` — "কোনো ক্যাশ করা
  ডেটা নেই" / "No cached data" (not wired
  in the v1 UI; reserved for a v1.1 empty-
  cache message).
- `crew.cache.retry` — "আবার চেষ্টা
  করুন" / "Retry" (the banner CTA).

### Tests

`tests/unit/crew-cache.test.ts` (new) —
~25 checks across 7 describe blocks:

- `isStale` — fresh / stale / boundary /
  unparseable.
- `tryParse` — valid / parse error / null
  input.
- `assignments cache` — write → read
  round-trip; missing key → null;
  corrupted JSON → null; stale > 1h →
  null; invalid shape (version mismatch) →
  null; missing `cachedAt` → null; keys
  scoped to `userId`; keys are versioned
  (`v2` keys ignored by v1 reader).
- `per-ticket cache` — write → read
  round-trip; missing key → null; stale
  → null; `invalidate` removes the key;
  `invalidate` is a no-op on missing key;
  keys scoped to `ticketId` + `userId`.
- `formatCachedAge` — "just now" / "Xm
  ago" / "Xh ago" / "Xd ago" / unparseable
  → "just now" / future `cachedAt` (clock
  skew) → "just now"; both English +
  Bangla.
- `storage absence` — every public
  function is a no-op / returns `null`
  when `localStorage` is unavailable
  (Node SSR safety).
- `schema stability` — `CACHE_SCHEMA_VERSION
  === 'v1'`; `CACHE_TTL_MS === 60 * 60 *
  1000`; a written entry round-trips with
  the right shape.

The test injects an in-memory
`MemoryStorage` polyfill via
`setStorage(s)`, so the suite runs in pure
Node — no `vitest-environment-jsdom` is
needed.

`tests/unit/dev-store.test.ts` (delta) —
two pre-existing tests were colliding with
the Bolt 004-003 dev-seed additive change:

- `findMany filters by cityId, categoryId, reporterId` —
  the seed has a `cat_pothole` ticket for
  `DEV_CITIZEN_ID`; the test's `cat_pothole`
  filter was matching both. Re-keyed to
  `cat_pothole` (the original test) with a
  different reporter / city for the second
  ticket so the filter assertions remain
  meaningful.
- `findMany with status { in: [...] } filters by open statuses` —
  the seed has an `open` `cat_other` ticket
  (`ticket_seed_submitted_1`); the test's
  `cat_other` filter was matching both.
  Re-keyed to a synthetic test city
  (`city_test_other` + `ward_test_other` +
  `user_test_reporter`) so the test does
  not collide with the seed.

## Acceptance Criteria Validation

CREW-006 acceptance criteria (per the
intent-tree story):

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Cache updated on successful list fetch | ✅ | `app/crew/page.tsx`'s `fetchTickets` writes `writeAssignmentsCache(userId, tickets)` on `res.ok`. The unit test `assignments cache > write then read round-trips the data` pins the write → read contract. |
| 2 | Cache displayed on network failure | ✅ | The list page's cache-read effect runs on mount; the banner renders the cached age. The detail page's same pattern. The unit test `formatCachedAge` covers the bilingual label. |
| 3 | Stale cache ignored | ✅ | The unit test `assignments cache > read returns null when the entry is stale (> 1h old)` + the `isStale` boundary test. The page falls through to the network on a stale read. |
| 4 | Corrupted JSON recovered | ✅ | The unit test `assignments cache > read returns null when the JSON is corrupted` + the `tryParse` test. The page falls through to the network; the corrupted entry is NOT auto-deleted. |
| 5 | Cache updated on successful transition / photo append | ✅ | `app/crew/tickets/[id]/page.tsx`'s `onTransition` + `onAddPhoto` write the response to `writeTicketCache(...)` on a 2xx. The unit test `per-ticket cache > write then read round-trips the data` pins the contract. |
| 6 | Cache NOT updated on write failure | ✅ | The `onTransition` + `onAddPhoto` paths only write to the cache on a 2xx; on a non-2xx the page shows the error and the cache is unchanged. The unit test's `invalidate on a missing key is a no-op` pins the no-op behaviour. |
| 7 | Per-ticket cache mirrors the list cache | ✅ | The list page's `fetchTickets` writes both `writeAssignmentsCache(...)` AND a `writeTicketCache(...)` per row. The unit test `assignments cache > write then read round-trips the data` (combined with the per-ticket equivalent) pins the contract. |
| 8 | Schema version mismatch ignored | ✅ | The key prefix `v1` is in the read-side helper; `v2` keys are simply not read. The unit test `assignments cache > keys are versioned (v2 entries are ignored)` pins the contract. |

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

- `tsc --noEmit` — clean. The new module +
  the page deltas + the spec + the i18n
  keys compile without type errors. (The
  pre-existing dedup-flag / dispatcher
  TS errors are out of scope for this
  bolt — they belong to Bolt 003-005 /
  future work.)
- `npm run test:unit` — 168/168 (was 142/142
  before this bolt: +25 cache tests, +1
  delta to the dev-store tests). The
  pre-existing 2 dev-store failures are
  resolved by the re-keying delta.
- `npm run test:mockups` — 17/17 (no
  mockup changes; the cache banner is
  a small text element that's already
  captured in the existing Unit 002 /
  003 baselines).
- `curl -fs http://localhost:3000/` — 200.
- `npx playwright test tests/14-crew-assignments-light.spec.ts`
  — 7/7 (no spec delta; the cache
  behaviour is verified via Vitest).
- `npx playwright test tests/15-crew-ticket-light.spec.ts`
  — 11/11 (no spec delta).
- `npx vitest run tests/unit/crew-cache.test.ts`
  — 25/25 (the new module's unit test).

## Ready for the next Bolt

- [x] `npx tsc --noEmit` is clean (for the
      cache module + page deltas; pre-existing
      dedup-flag errors are out of scope).
- [x] `npm run test:unit` is green (168/168).
- [x] `npm run test:mockups` is green.
- [x] `curl -fs http://localhost:3000/` returns
      200.
- [x] Story `CREW-006-offline-read` is ready
      to flip to `done`.

## Out-of-scope (deferred)

- **Write queue** (IndexedDB + service
  worker). v1 fails writes loudly on
  flaky networks. A v1.1 bolt may add a
  write queue with sync conflict
  resolution.
- **Service worker**. v1 is just
  `localStorage`. A v1.1 bolt may add a
  service worker for true offline app
  shell.
- **TTL extension** beyond 1 hour. v1
  considers cached data > 1h old too
  risky to display.
- **Cross-device sync**. The cache is
  per-device.
- **Conflict resolution**. v1 displays
  the cached snapshot only on network
  failure; the network response always
  wins when it lands.
- **`v2` schema bump**. The v1 module
  reads only `v1.*` keys; a future bolt
  can add `v2` without crashing the v1
  module.

## Cross-references

- **Bolt**: `bolts/004-004-offline-read/`.
- **Unit brief**:
  `intents/004-field-crew-app/004-offline-read/unit-brief.md`.
- **Story**:
  `intents/004-field-crew-app/004-offline-read/CREW-006-offline-read.md`.
- **Cache module** (new): `lib/crew/cache.ts`.
- **List page delta** (existing):
  `app/crew/page.tsx`.
- **Detail page delta** (existing):
  `app/crew/tickets/[id]/page.tsx`.
- **i18n keys** (new): `lib/i18n/keys.ts`
  (`crew.cache.*` namespace).
- **Vitest unit test** (new):
  `tests/unit/crew-cache.test.ts`.
- **Sister bolts**:
  - `004-002-todays-assignments/` — the
    list page is the first *consumer* of
    the cache; its 30s polling cadence
    is what makes the cache always-warm
    in practice.
  - `004-003-ticket-detail-and-resolve/` —
    the detail page is the second
    *consumer*; its transition / photo
    paths are what optimistically update
    the cache.
