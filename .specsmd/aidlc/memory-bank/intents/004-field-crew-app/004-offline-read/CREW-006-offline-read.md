---
story: CREW-006-offline-read
unit: 004-offline-read
intent: 004-field-crew-app
phase: construction
status: done
created: 2026-10-12T01:30:00Z
updated: 2026-10-12T04:00:00Z
---

# Story: CREW-006 — Offline-Read (cache for flaky networks)

## Given / When / Then

### Acceptance 1 — Cache updated on successful fetch

**Given** the crew member opens `/crew`
**And** the network is healthy
**When** the page fetches
`GET /api/v1/crew/tickets` and the
response is `200`
**Then** the response is written to
`localStorage['cityfix.crew.cache.v1.assignments']`
with `cachedAt` set to the current
ISO timestamp.

### Acceptance 2 — Cache displayed on network failure

**Given** the crew member opens `/crew`
**And** the network is down (the fetch
fails or returns 5xx)
**And** the cache has a fresh entry
(`cachedAt` < 1h ago)
**When** the page renders
**Then** the page renders the cached
snapshot AND shows a "Cached, may be
stale" banner with the relative time
("Cached 5m ago"). No error is shown.

### Acceptance 3 — Stale cache ignored

**Given** the cache has an entry with
`cachedAt` > 1h ago
**When** the page mounts
**Then** the stale cache is ignored
(the page falls through to the network).
If the network also fails, the page
shows an error and an empty list
(no cache fallback).

### Acceptance 4 — Corrupted JSON recovered

**Given** `localStorage['cityfix.crew.cache.v1.assignments']`
contains invalid JSON (e.g. a string
left over from a previous build)
**When** the page mounts
**Then** the cache read returns `null`
(no crash). The page falls through to
the network. The corrupted entry is
NOT auto-deleted (a v1.1 bolt may add
cleanup; v1 is read-only-safe).

### Acceptance 5 — Cache updated on successful write

**Given** the crew member submits a
"Mark in progress" transition on
ticket `tkt_abc`
**And** the API returns `200` with the
refreshed ticket
**When** the page receives the response
**Then** the page writes the refreshed
ticket to
`localStorage['cityfix.crew.cache.v1.ticket.tkt_abc']`
with `cachedAt` set to the current
timestamp. The next read of the detail
page (even on a flaky network) shows
the fresh state.

### Acceptance 6 — Cache NOT updated on write failure

**Given** the crew member submits a
"Mark resolved" transition
**And** the API returns `400` (e.g. the
resolution note was empty after the
user cleared the textarea while the
request was in flight)
**When** the page receives the error
**Then** the cache is NOT updated (the
cached state is unchanged). The page
shows the error. The crew member can
retry.

### Acceptance 7 — Per-ticket cache mirrors the list cache

**Given** the list cache has a snapshot
of 3 tickets
**When** the list fetch succeeds
**Then** the page also writes each of
the 3 tickets to its per-ticket cache
key
(`cityfix.crew.cache.v1.ticket.<id>`).
The detail page can read the per-ticket
cache even if the list cache is empty
(e.g. the user deep-linked to a ticket
from a notification).

### Acceptance 8 — Schema version mismatch

**Given** `localStorage['cityfix.crew.cache.v2.assignments']`
exists (a future schema version)
**When** the v1 cache module reads
**Then** the `v2` key is ignored
(prefix mismatch). The v1 module
reads only `v1.*` keys. The page
falls through to the network.

## Technical Notes

- The cache module is pure JS. It is
  safe to import in Node (the module
  checks `typeof localStorage !==
  'undefined'` before touching it).
- The TTL is `CACHE_TTL_MS = 60 * 60 *
  1000` (1 hour). A v1.1 bolt may
  tune this.
- The cache is keyed by user (so two
  crew members on the same shared
  device don't see each other's data).
  The key prefix includes the user id
  from the session:
  `cityfix.crew.cache.v1.<userId>.assignments`.
  v1's dev mode has one crew persona
  (Rashid), so the key is
  `cityfix.crew.cache.v1.user_crew_rashid.assignments`
  in practice.
- The cache is read synchronously on
  the first render, so the page is
  immediately interactive. The network
  request fires in parallel; the cache
  is the "first paint" source.
- The "Cached, may be stale" banner
  uses an i18n key
  (`crew.cache.banner`). The relative
  time format is the same as the
  dispatcher's "Last refreshed Xs
  ago" indicator.

## Out of Scope

- **Write queue** (IndexedDB + service
  worker). v1 fails writes loudly on
  flaky networks. A v1.1 bolt may
  add a write queue.
- **Service worker**. v1 is just
  `localStorage`. A v1.1 bolt may add
  a service worker for true offline
  app shell.
- **TTL extension** beyond 1 hour.
  v1 considers cached data > 1h old
  too risky to display.
- **Cross-device sync**. The cache
  is per-device.
- **Conflict resolution**. v1 displays
  the cached snapshot only on
  network failure; the network
  response always wins when it lands.

## Dependencies

- Intent 002 (Unit 002 / 003) — the
  list and detail pages are the
  consumers.
- Intent 001 (Unit 001) —
  `SerializedTicket` (the type the
  cache stores).

## Cross-references

- `lib/crew/cache.ts` (new) — pure JS
  module.
- `app/crew/page.tsx` (delta) — cache
  read on mount + cache write on
  successful fetch.
- `app/crew/tickets/[id]/page.tsx`
  (delta) — same pattern.
- `lib/i18n/keys.ts` — new
  `crew.cache.banner` key (Bangla +
  English).
- `tests/unit/crew-cache.test.ts`
  (new) — Vitest unit test for the
  cache module.
