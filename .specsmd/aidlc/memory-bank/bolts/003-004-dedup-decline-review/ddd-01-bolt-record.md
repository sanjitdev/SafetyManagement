---
standard: ddd-01-bolt-record
bolt: 003-004-dedup-decline-review
unit: 003-dispatcher-queue/004-dedup-decline-review
phase: construction
status: complete
created: 2026-10-12T01:00:00Z
updated: 2026-10-12T01:00:00Z
---

# Bolt 003-004 — Dedup-Decline Review (new table + 3 APIs + new page + Playwright spec)

## Summary

The dispatcher's manual dedup-decline review surface.
The bolt stands up:

- **Schema**: new `DedupFlag` model + `DedupFlagStatus`
  enum (`pending`/`confirmed`/`dismissed`) on Prisma
  + the dev store. Two denormalised relations on
  `Ticket` (`duplicateOfId`, `closeReason`) so the
  citizen-side dedup-decline path can mark a closed
  ticket as a duplicate of an earlier one.
- **Citizen write path**: `POST /api/tickets` with
  `dedupDeclineTicketId` set now writes a `DedupFlag`
  row in addition to the `ticket.dedup_declined`
  audit event. The flag's `cityId` / `wardId` /
  `departmentId` are denormalised from the new
  ticket + the original ticket's category so the
  dispatcher scope filter works without a join.
- **`GET /api/v1/dispatcher/dedup-flags`** — returns
  the dispatcher's pending flags, oldest first, with
  both the citizen's new ticket and the existing
  ticket it was near serialised side-by-side. Zod-
  validated `limit` query (1-100, default 50).
- **`POST /api/v1/dispatcher/dedup-flags/[id]/confirm`**
  — confirms the two reports are duplicates. Sets the
  citizen's ticket to `status='closed'`,
  `closeReason='duplicate'`, `duplicateOfId=<original>`,
  resolves the flag, writes two audit rows.
- **`POST /api/v1/dispatcher/dedup-flags/[id]/dismiss`**
  — agrees with the citizen (NOT a duplicate). The
  ticket stays in `submitted`; the flag is resolved;
  the audit trail captures the flag-status delta + a
  `hiddenFromTriageQueue` boolean flip on the ticket
  so the city-side review surface can see the
  dismissal cleared the overlay.
- **Queue integration**: `GET /api/v1/dispatcher/queue`
  now excludes tickets currently behind a pending
  dedup flag (they're not actionable yet) and exposes
  `pendingDedupCount` so the dispatcher top bar's
  "Possible duplicates (N)" badge stays live.
- **`app/dispatcher/dedup/page.tsx`** — new page
  rendering the pending list. Each row is a 2-column
  grid with the citizen's new ticket vs the
  original, the citizen's optional reason text, and
  Confirm / Dismiss buttons. The Confirm closes the
  citizen's ticket with reason `'duplicate'`; the
  Dismiss clears the flag overlay.
- **13 new i18n keys** under `dispatcher.dedup.*`.
- **2 new tests**:
  - `tests/unit/dedup-flag.test.ts` — 7 Vitest unit
    checks against the dev store's `dedupFlag`
    CRUD surface (create / findMany / update /
    findUnique / reset semantics).
  - `tests/12-dispatcher-dedup-light.spec.ts` — 6
    Playwright route-spec API checks + 1 visual
    baseline (`dispatcher-dedup-1440x900.png`,
    light theme, English labels).

## Domain Model (delta)

### Prisma schema (`prisma/schema.prisma`)

- `Ticket` gains `duplicateOfId String?` and
  `closeReason String?`. `@@index([duplicateOfId])`
  so we can list "tickets that were closed as
  duplicates of X" cheaply. Self-relation:
  `duplicateOf Ticket? @relation("TicketDuplicates",
  fields: [duplicateOfId], references: [id],
  onDelete: SetNull)` and the matching `duplicates
  Ticket[] @relation("TicketDuplicates")` reverse.
  Also two reverse relations for the dedup-flag
  foreign keys: `dedupFlagsAsFlagged` and
  `dedupFlagsAsOriginal`.
- New enum `DedupFlagStatus { pending, confirmed,
  dismissed }`.
- New model `DedupFlag`:
  - `id String @id` (cuid)
  - `cityId String` — denormalised from the
    flagged ticket's city for index-friendly scope
    filtering
  - `wardId String` — denormalised from the
    flagged ticket's ward
  - `departmentId String?` — denormalised from the
    original ticket's category's department (the
    dispatcher's dept filter)
  - `ticketId String` — the citizen's NEW ticket
    (the one that declined the dedup match)
  - `originalTicketId String` — the EXISTING
    ticket it was near
  - `citizenReason String?` — the citizen's
    optional decline reason (null in v1; the
    citizen UI captures it but the wire schema
    is private and not exposed)
  - `status DedupFlagStatus @default(pending)`
  - `flaggedAt DateTime @default(now())`
  - `resolvedById String?` — dispatcher who
    confirmed or dismissed
  - `resolvedAt DateTime?`
  - Indexes: `(cityId, status)` (queue),
    `(cityId, wardId, status)` (filter),
    `(ticketId, status)` (post-decision lookup),
    `(originalTicketId)` (audit-reads).

### Dev store (`lib/dev-store.ts`)

- New `DevDedupFlag` interface matching the Prisma
  shape (string timestamps, ISO).
- `DevTicket` gains `duplicateOfId: string | null`
  and `closeReason: 'duplicate' | null` (the enum
  is one value in v1; expand later).
- The seed sets `closeReason: 'duplicate'` on the
  pre-existing closed duplicate seed (`ticket_seed_closed_1`)
  so existing fixtures keep their semantic
  consistency.
- New `devDb.dedupFlag` CRUD: `findUnique`,
  `findMany` (cityId + status filter, optional
  `flaggedAt asc|desc` orderBy), `create` (auto
  `df_<uuid8>` id + ISO `flaggedAt` + default
  `status='pending'`), `update` (last-write-wins;
  throws on unknown id).

### `lib/db-switch.ts`

- The new `dedupFlag` namespace is exposed on the
  routed `db` object. Prisma path delegates to
  `prisma.dedupFlag`; dev path delegates to
  `devDb.dedupFlag`. Identical API surface to the
  other namespaces (`findUnique`, `findMany`,
  `create`, `update`).

### Citizen `POST /api/tickets`

- When `dedupDeclineTicketId` is set, the route
  writes a `DedupFlag` row after the audit event.
  `cityId`, `wardId` come from the NEW ticket;
  `departmentId` comes from the original ticket's
  category's department (looked up so the
  dispatcher's department filter works). The
  citizen's reason is not exposed in the wire
  schema yet (v1) so it's left null; a follow-up
  surface can capture it.

## Technical Design (delta)

### APIs

**`app/api/v1/dispatcher/dedup-flags/route.ts`** (new):

- `GET`: Zod-validated `limit` query (1-100,
  default 50). `requireRole(session, 'dispatcher')`.
  Pulls pending flags in the dispatcher's city, then
  filters by `wardId` AND `departmentId` in code
  (the dev store's `findMany` surface doesn't yet
  expose those clauses; the pattern mirrors the
  dispatcher queue's filter). Slices to `limit`.
  Each flag is mapped to `{ id, cityId, wardId,
  departmentId, citizenReason, flaggedAt, status,
  ticket (dispatcher-serialised), originalTicket
  (dispatcher-serialised) }`. Tickets that the
  serialiser can't find (rare race; e.g. ticket
  deleted) come through as `null` so the page can
  gracefully render a "ticket missing" state.

**`app/api/v1/dispatcher/dedup-flags/[id]/confirm/route.ts`** (new):

- `POST`: `requireRole(session, 'dispatcher')`.
  Loads the flag in scope via
  `loadPendingFlagInScope(session, id)` — returns
  `null` if missing, not pending, or out-of-scope.
  Out-of-scope → 404 (not 403) to avoid leaking
  flag existence. The handler then:
  1. Updates the citizen's ticket: `status='closed'`,
     `closeReason='duplicate'`, `duplicateOfId=
     original.id`.
  2. Updates the flag: `status='confirmed'`,
     `resolvedById=<dispatcher>`, `resolvedAt=<now>`.
  3. Writes two `AuditEntry` rows:
     - `dedup_confirmed` on the TICKET (before:
       pre-status / null closeReason / null
       duplicateOfId; after: 'closed' /
       'duplicate' / original.id).
     - `dedup_confirmed` on the FLAG (before:
       pending; after: confirmed).
  4. Returns `{ status: 'confirmed', flagId,
     ticket: dispatcher-serialised }`.

**`app/api/v1/dispatcher/dedup-flags/[id]/dismiss/route.ts`** (new):

- Same `loadPendingFlagInScope` helper.
  Effect on the ticket is a no-op for the data
  (the ticket was always in `submitted`; the flag
  was the only thing hiding it from triage) but the
  route still issues `ticket.update` so `updatedAt`
  reflects the dismissal action. Flag is updated to
  `dismissed` + resolved fields. Two `AuditEntry`
  rows: `dedup_dismissed` on the flag (status
  delta) + `dedup_dismissed` on the ticket
  (`hiddenFromTriageQueue` boolean delta). Returns
  `{ status: 'dismissed', flagId, ticket:
  dispatcher-serialised }`.

**`app/api/v1/dispatcher/queue/route.ts`** (delta):

- Loads pending dedup flags in the city in addition
  to tickets. Flags with `status='pending'` AND
  matching the dispatcher's ward are tallied into
  `pendingDedupCount` (the queue route already
  filters by department defensively; the dedup list
  route does the same on its own scope filter).
- The candidates list is filtered to drop tickets
  behind a pending dedup flag — those tickets are
  not actionable yet because they're awaiting the
  dispatcher's dedup decision.

### Page

**`app/dispatcher/dedup/page.tsx`** (new):

- Client component (`'use client'`).
- 64px header with a back link to `/dispatcher` +
  lang toggle + theme toggle.
- Main column: heading + subtitle + loading/error
  states, then a stack of dedup-flag rows (or an
  empty card).
- Each row is a card with:
  - Two-column grid (`.dispatcher-dedup-row-grid`
    CSS class for responsive collapse): the new
    ticket on the left, the original on the right.
    Each panel renders ticket id (monospace),
    location label, coords (4dp), and age. The
    "new" panel also shows the distance to the
    original in metres via an inline haversine
    calculation.
  - Optional citizen reason text (label "Reason"
    or Bangla equivalent).
  - Optional per-row error banner.
  - Action bar: Dismiss (ghost button) + Confirm
    (primary button). One at a time; the other
    buttons are disabled while a request is
    in-flight.
- The 401 redirect renders a sign-in prompt with
  a `/login` link rather than redirecting (which
  would feel like a flash for a dispatcher that was
  already signed in moments ago).
- Test IDs:
  - `dispatcher-dedup-page`
  - `dispatcher-dedup-empty`
  - `dispatcher-dedup-list`
  - `dispatcher-dedup-row-{id}`
  - `dispatcher-dedup-dismiss-{id}`
  - `dispatcher-dedup-confirm-{id}`
- No polling: the dispatcher reloads the page to
  see new flags. v1.1 may add WebSocket / SSE.

**`app/dispatcher/page.tsx`** (delta):

- The `pendingDedupCount` effect now polls
  `/api/v1/dispatcher/dedup-flags?limit=100` every
  30 s (same cadence as the queue itself) and
  reads `data.flags.length` as the count. When the
  count > 0, the dedup link in the top bar is
  tinted with the warning-soft colour so the
  dispatcher notices.

### i18n

13 new keys under `dispatcher.dedup.*` (all
Bangla-first with English fallback):

- `dispatcher.dedup.heading` / `subtitle` — page
  heading + helper text.
- `dispatcher.dedup.empty.title` /
  `dispatcher.dedup.empty.subtitle` — empty state.
- `dispatcher.dedup.row.distance` (with `{distance}`
  interpolation) — e.g. "12 m apart" / "12 মিটার
  দূরে".
- `dispatcher.dedup.row.reason` — section header for
  the citizen's reason text.
- `dispatcher.dedup.row.confirm` /
  `dispatcher.dedup.row.dismiss` /
  `dispatcher.dedup.row.confirming` /
  `dispatcher.dedup.row.dismissing` — action button
  labels (the last two are the in-flight variants).
- `dispatcher.dedup.row.error` — fallback error
  message.
- `dispatcher.dedup.signin_required` — 401 redirect
  copy.
- `dispatcher.dedup.loading` / `dispatcher.dedup.error`
  — list state copy.

### Tests

`tests/unit/dedup-flag.test.ts` — 7 unit checks:

1. `create` returns a row with a `df_` id,
   `flaggedAt` ISO timestamp, default `status:
   'pending'`, null resolved fields.
2. `findMany` filters by `(cityId, status)` and
   returns an empty list when status mismatches.
3. `findMany` orders by `flaggedAt` asc by default.
4. `update` mutates status + resolvedById +
   resolvedAt atomically.
5. `update` on an unknown id throws.
6. `findUnique` returns `null` for unknown ids.
7. Flags survive a `resetStore()` (the HMR-safe
   contract).

`tests/12-dispatcher-dedup-light.spec.ts` — 6 API
checks + 1 visual baseline:

1. `GET /api/v1/dispatcher/dedup-flags` with a
   dispatcher cookie → 200 with the fixture's flag
   present (status='pending', ticket+originalTicket
   populated).
2. Citizen cookie → 403 `forbidden_role`.
3. No cookie → 401 `not_authenticated`.
4. POST confirm → 200, flag status='confirmed',
   ticket status='closed' + closeReason='duplicate'.
5. POST dismiss → 200, flag status='dismissed',
   ticket status='submitted' (the overlay was the
   only thing hiding it).
6. POST confirm/dismiss on an unknown flag id →
   404 `not_found`.
7. Visual baseline: `dispatcher-dedup-1440x900.png`
   (light theme, English labels, one pending flag
   visible).

The fixture is built by:

1. Citizen POSTs ticket A (the "original").
2. Citizen POSTs ticket B near A with
   `dedupDeclineTicketId=A.id`. The dedup engine
   is skipped (the decline path is opt-in) and a
   `DedupFlag` row is written in the same handler.

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

- `tsc --noEmit` — clean. The new APIs + page +
  schema + dev store + spec + i18n keys compile
  without type errors.
- `npm run test:unit` — 78/78 (was 71/71 after
  Bolt 003-003; +7 from the new dedup-flag tests).
- `npm run test:mockups` — 15/15 (no mockup
  changes).
- `curl -fs http://localhost:3000/` — 200 (home
  page unchanged).
- `curl -fs http://localhost:3000/dispatcher/dedup`
  (unauthenticated) — 200 with the sign-in prompt
  (the page handles 401 client-side; the route
  is auth-required for the data, not the page
  render).
- `npx playwright test
  tests/12-dispatcher-dedup-light.spec.ts` — 6/6
  API checks + 1/1 visual baseline (under
  `tests-mockups/baselines/12-dispatcher-dedup-light.spec.ts/`).

## Ready for the next Bolt

- [x] `npx tsc --noEmit` is clean.
- [x] `npm run test:unit` is green (78/78).
- [x] `npm run test:mockups` is green (15/15).
- [x] `curl -fs http://localhost:3000/` returns 200.
- [x] `curl -fs http://localhost:3000/dispatcher/dedup`
      renders the page (200).
- [x] Dispatcher persona's queue badge is wired to
      `pendingDedupCount`.
- [x] One visual baseline committed under
      `tests-mockups/baselines/12-dispatcher-dedup-light.spec.ts/`.
- [x] Story `DISP-006-dedup-decline-review` is
      ready to flip to `done`.

## Out-of-scope (deferred)

- **Live updates** on the dedup page (v1.1
  candidate; v1 uses reload).
- **Bulk actions** (confirm/dismiss many flags
  at once). The v1 surface is one-at-a-time so
  each decision is intentional and audit-traceable.
- **Citizen reason capture** — the citizen's
  dedup-decline modal in v1 shows them the dedup
  match but does not yet capture a free-text
  reason. A follow-up bolt can wire the input to
  `citizenReason` on the flag.
- **Auto-dismiss after N days** (v1.1 candidate).
  Today the flag stays pending forever — a future
  bolt can add a TTL + cron-style cleanup.
- **Audit row direct inspection** (WO-005).

## Cross-references

- **Bolt**: `bolts/003-004-dedup-decline-review/`.
- **Unit brief**:
  `intents/003-dispatcher-queue/004-dedup-decline-review/unit-brief.md`.
- **Story**:
  `intents/003-dispatcher-queue/004-dedup-decline-review/DISP-006-dedup-decline-review.md`.
- **Schema**: `prisma/schema.prisma` (new
  `DedupFlag` model + enum + two new fields on
  `Ticket`).
- **Dev store**: `lib/dev-store.ts`
  (`DevDedupFlag` interface + `devDb.dedupFlag`
  CRUD).
- **DB switch**: `lib/db-switch.ts`
  (`dedupFlag` namespace).
- **Citizen write path**: `app/api/tickets/route.ts`
  (`dedupDeclineTicketId` branch writes the flag).
- **Queue integration**:
  `app/api/v1/dispatcher/queue/route.ts`
  (filters pending-flagged tickets + exposes
  `pendingDedupCount`).
- **APIs**:
  - `app/api/v1/dispatcher/dedup-flags/route.ts`
  - `app/api/v1/dispatcher/dedup-flags/[id]/confirm/route.ts`
  - `app/api/v1/dispatcher/dedup-flags/[id]/dismiss/route.ts`
- **Page**: `app/dispatcher/dedup/page.tsx`.
- **Top bar badge**: `app/dispatcher/page.tsx`
  (`pendingDedupCount` polling).
- **i18n keys**: `lib/i18n/keys.ts` (13 new
  `dispatcher.dedup.*` keys).
- **Route spec**:
  `tests/12-dispatcher-dedup-light.spec.ts`.
- **Unit test**: `tests/unit/dedup-flag.test.ts`.
- **Visual baseline**:
  `tests-mockups/baselines/12-dispatcher-dedup-light.spec.ts/dispatcher-dedup-1440x900.png`.
- **Next bolt**: `003-005-map-view` (Unit 005 —
  DEFERRED to v1.1 per unit-brief; paperwork only).