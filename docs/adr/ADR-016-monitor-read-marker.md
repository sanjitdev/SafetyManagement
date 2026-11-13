---
adr: ADR-016
slug: monitor-read-marker
created: 2026-10-27T00:00:00Z
status: proposed
supersedes: null
superseded_by: null
relates_to:
  - 008-013-dispatcher-live-monitor
---

# ADR-016: Persisted per-user monitor read marker (deferred to v1.1)

## Context

Bolt 008-013 (the dispatcher's live monitor, `/dispatcher/monitor`)
ships a per-row `unread` flag. The flag answers one question for
the dispatcher: **which of the tickets I am watching have new
activity since I last looked?** It drives the unread dot on the
row (`app/dispatcher/monitor/page.tsx:624`, `751`) and the
"N unread" counter in the header
(`app/dispatcher/monitor/page.tsx:242-245`).

The service derives the flag in `buildMonitorRows`
(`lib/dispatcher/monitor.ts:206-252`). The derivation reads an
**optional** per-ticket read marker:

```ts
// lib/dispatcher/monitor.ts:218-223
const marker = lastReadAt[t.id];
const unread = latest
  ? marker
    ? latest.timestamp > marker
    : true
  : false;
```

`lastReadAt` arrives via `options.lastReadAt`
(`lib/dispatcher/monitor.ts:208`). The contract is written
correctly: a ticket with a marker is unread only when its latest
trail entry is newer than the marker; a ticket with **no** marker
is unread whenever it has at least one trail entry.

**The gap.** The DB-facing read never supplies a marker.
`listMonitorTickets` calls `buildMonitorRows(watched)` with a
single argument (`lib/dispatcher/monitor.ts:470`), so
`options` is `undefined`, so `lastReadAt` is `{}`
(`lib/dispatcher/monitor.ts:210`), so **every watched ticket that
has a trail entry renders `unread: true` on every poll** — for
every dispatcher, forever, until the row is acknowledged in that
one browser tab.

The acknowledge path does not close the gap either.
`acknowledgeMonitorUpdate` (`lib/dispatcher/monitor.ts:509-535`)
writes an **audit row only** — `action:
'ticket.monitor_acknowledge'` via `writeAudit(...)`
(`lib/dispatcher/monitor.ts:525-532`). There is no persisted
per-user read marker. The `Prisma` schema has no read-marker
table: `prisma/schema.prisma` declares `City`, `Ward`,
`Department`, `Crew`, `SlaPolicy`, `Category`, `User`, `OtpCode`,
`WebAuthnChallenge`, `Session`, `PushSubscription`, `Ticket`,
`TicketTrailEntry`, `TicketPhoto`, `AuditEntry`, `DedupFlag` — no
marker model.

The acknowledgement therefore lives **in client state**.
`app/dispatcher/monitor/page.tsx:139` holds it in a
`useState<Set<string>>`; `onAcknowledge`
(`app/dispatcher/monitor/page.tsx:247-263`) adds to the set
optimistically and POSTs to the ack route. The unread counter
subtracts the local set (`app/dispatcher/monitor/page.tsx:243`).

That client-held state is a **session-scoped** answer to a
**device-scoped** question. It survives within one mounted tab
and is lost on:

- **Reload** — a dispatcher who refreshes the page (or whose tab
  is restored after a crash or a laptop lid close) loses the
  entire acknowledgement set. Every previously-acknowledged row
  reverts to `unread: true`.
- **Multi-device** — a dispatcher who reads updates on the
  dispatcher's wall-mounted monitor, then opens the same account
  on a tablet at the ward desk, sees the same rows as unread.
  The acknowledgement never leaves the first browser.
- **Multi-ward shifts** — a dispatcher who watches two wards
  (the session binds one `wardId`, but `listMonitorTickets`
  falls back to all city tickets when `session.wardId` is null,
  `lib/dispatcher/monitor.ts:400-402`) cannot express "I have
  read ward A but not ward B". A single scalar or a single set
  has no per-ward or per-ticket granularity.

The practical symptom is a **useless unread signal**: the dot
and the counter are always on, so the dispatcher learns nothing
from them and is trained to ignore both. The "N new updates"
counter, which the page derives client-side by comparing
timestamps against the previous poll
(`app/dispatcher/monitor/page.tsx:181-189`), is unaffected — it
is a delta between two polls in the same tab — and is the only
part of the surface that still carries information.

This is a **deferral**, not a bug in the shipped code. Bolt
008-013 recorded the choice explicitly: "The acknowledgement
itself is client-held in v1 — the audit row records the intent;
the Prisma schema has no per-user read-marker table"
(`.specsmd/aidlc/memory-bank/bolts/008-013-dispatcher-live-monitor/bolt.md`,
"Acknowledge" section), and listed "A persisted per-user read
marker" under "Out of Scope".

### Constraints

- **Migration ownership.** The pending migration
  `prisma/migrations/20261027140000_platform_gaps/migration.sql`
  is **authored but NOT applied** — the configured Neon instance
  was unreachable (`P1001: Can't reach database server`) when it
  was written (migration header, lines 38-43). A second
  migration would be needed, and it would land on top of an
  un-applied one.
- **Backend-agnostic facade.** `lib/db-switch.ts` is an explicit
  allowlist, not a passthrough — each model gets explicit
  `findUnique` / `findMany` / `create` / `update` shims that
  branch on `isDevStore()` (e.g. `lib/db-switch.ts:578-607` for
  `dedupFlag`). A new model needs a facade entry **and** a
  `lib/dev-store.ts` implementation, or the unit tests cannot
  exercise it against the in-memory store the whole suite runs on.
- **`AuditWriteInput.entityType` is a closed union** —
  `'ticket' | 'city' | 'category' | 'department' | 'ward' | 'user'
  | 'dedupFlag'` (`lib/platform/audit.ts:15`). A new entity type
  would widen that union **and** the parallel `DevAuditEntry`
  union (`lib/dev-store.ts:159`).
- **Error handling.** `team.md` Forbidden says the service layer
  must not throw; the established `ApiError` class from
  `lib/auth/guards.ts` is the sanctioned alternative. Note the
  existing monitor service throws `ApiError`
  (`lib/dispatcher/monitor.ts:515`, `518`, `521`) and the route
  catches it — the same pattern is documented as an explicit
  exception in `lib/dispatcher/assign-crew.ts:38-42` ("The
  `Result<T, E>` shape mentioned in `team.md` is unwritten at
  this layer; the route catches and serialises"). Any new code
  should not widen that gap.
- **Scope rules.** The four-role model is fixed for v1
  (`project.md` Forbidden). A read marker is dispatcher-scoped
  today but must not introduce a fifth role or change role
  semantics. `project.md` also forbids editing `aidlc-state.md`
  directly and requires the platform serializer
  (`lib/serializers/ticket.ts`) for citizen-facing ticket
  exposure — the read marker is dispatcher-facing, so the
  serializer boundary is not crossed, but the *row* shape
  (`MonitorRow`) is a separate, monitor-local contract.
- **Testing posture.** Test-after, 80% line-coverage floor
  (`team.md`, `org.md`; ADR-008). `npx tsc --noEmit` must be
  clean; `npm run test:unit` must be re-run after editing `lib/`.
  Playwright visual baselines are gating, but the monitor page
  carries **no** baseline (its surface is live-polling and
  date-dependent) — a route spec, not a mockup baseline, is the
  right coverage shape here.

## Decision

**Adopt a new `MonitorReadMarker` Prisma model with a composite
unique on `(userId, ticketId)` and a `lastReadAt` timestamp, and
defer the implementation to a v1.1 Bolt.**

The decision recorded here is the **shape and the deferral**, not
the implementation. The v1 pilot ships the client-held
acknowledgement exactly as Bolt 008-013 built it; this ADR
freezes the target design so the v1.1 Bolt does not re-derive
the analysis.

The recommendation is Option 1 (a dedicated model) over the
three alternatives, on three grounds:

1. **It is the only option with the right granularity.** A
   dispatcher watches a set of tickets. "Have I read this
   ticket?" is inherently a per-(user, ticket) question. A
   watermark and the audit log both collapse it.
2. **It is the only option with the right write shape.** The
   acknowledge action is a **per-ticket** write
   (`{ ticketId }` in the request body,
   `app/api/v1/dispatcher/monitor/ack/route.ts:34-36`). A
   composite-unique upsert on `(userId, ticketId)` maps
   one-to-one onto that action. A watermark cannot represent
   "acknowledged ticket A but not ticket B".
3. **It does not make the audit log do two jobs.** The audit log
   is append-only by design — "Append-only — no UPDATE/DELETE
   allowed at the API layer" (`prisma/schema.prisma:440`) — and
   is the city-side accountability record. Deriving a mutable
   "read" state from an append-only log inverts its semantics
   and couples the monitor's read latency to the audit table's
   growth.

### Proposed implementation shape

**Schema sketch** (not applied — for the v1.1 Bolt):

```prisma
// prisma/schema.prisma — v1.1 addition
model MonitorReadMarker {
  id         String   @id @default(cuid())
  userId     String
  ticketId   String
  /// ISO timestamp of the most recent activity the user has read.
  lastReadAt DateTime @default(now())
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  ticket Ticket @relation(fields: [ticketId], references: [id], onDelete: Cascade)

  // One marker per (user, ticket) — the upsert key.
  @@unique([userId, ticketId])
  @@index([userId])
  @@index([ticketId])
}
```

The composite unique is the whole point: it makes the write an
idempotent upsert and makes the read a single indexed
`findMany` filtered on `userId`.

**Service layer** (`lib/dispatcher/monitor.ts` — extend, do not
replace). Named exports, per `team.md`; no default exports.

```ts
// lib/dispatcher/monitor.ts

/** Read the caller's per-ticket read markers as a ticketId → ISO map. */
export async function listMonitorReadMarkers(
  userId: string,
  ticketIds: string[],
): Promise<Record<string, string>>;

/** Upsert the caller's read marker for one ticket. */
export async function upsertMonitorReadMarker(
  userId: string,
  ticketId: string,
  lastReadAt: string,
): Promise<Result<{ ticketId: string; lastReadAt: string }, MonitorError>>;
```

`listMonitorTickets` then calls
`buildMonitorRows(watched, { lastReadAt })`
(`lib/dispatcher/monitor.ts:470`) with the marker map. The
`buildMonitorRows` derivation itself **does not change** — it is
already correct, and it is already exported and unit-tested with
fixture arrays, which is the cheap way to pin the semantics.

Per `team.md`, the new async functions return `Result<T, E>` and
do not throw; the established `ApiError` path is available for
the caller's own guard failures (404 / 403), which the service
already raises today (`lib/dispatcher/monitor.ts:515-521`).

**API surface.**

- **The GET route gains no new parameter.**
  `GET /api/v1/dispatcher/monitor` keeps its current Zod-validated
  query schema (`filter`, `limit`, `cityId` —
  `app/api/v1/dispatcher/monitor/route.ts:39-53`). The marker is
  **derived server-side from the session's `userId`**, so it is
  not a client-supplied value and cannot be spoofed. Adding a
  `?lastReadAt=` parameter would be a security regression: it
  would let a client claim to have read any ticket by passing a
  far-future timestamp.
- **The ack route starts writing the marker.** The existing POST
  (`app/api/v1/dispatcher/monitor/ack/route.ts:38-75`) keeps its
  Zod body schema (`{ ticketId }`) and its audit write; the
  service additionally upserts the marker. The response shape
  `{ ticketId, acknowledgedAt }`
  (`lib/dispatcher/monitor.ts:534`) is unchanged — `acknowledgedAt`
  becomes the marker's `lastReadAt`.

**Read path.** `listMonitorTickets` currently fetches the ticket
list, then fetches each ticket's trail in a `Promise.all`
(`lib/dispatcher/monitor.ts:420-468`). The marker read is a
**second** query, not a join — one indexed `findMany` on
`MonitorReadMarker` where `userId = session.userId` and
`ticketId IN (...)`, issued once per poll. It is deliberately not
folded into the per-ticket trail fetch, because the trail fetch
is an N+1 over the watched set and the marker fetch is a single
query over the same set.

**Migration.** A second migration, generated offline with
Prisma's own diff engine — the established pattern in this repo
(`prisma/migrations/20261027140000_platform_gaps/migration.sql:30-36`):

```
npx prisma migrate diff \
  --from-schema-datamodel .tmp-diff/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma --script
```

The `old` schema is the current `prisma/schema.prisma` at the
time of authoring (the pending `platform_gaps` migration's
"old" was `git show HEAD:prisma/schema.prisma`). The migration
must also add the two back-relations (`monitorReadMarkers` on
`User` and `Ticket`), the `MonitorReadMarker` table, the
`@@unique([userId, ticketId])` constraint, and the two indexes.

**Dev store + facade.** A new `lib/dev-store.ts` map
(`monitorReadMarkers`) plus a `db.monitorReadMarker` facade entry
in `lib/db-switch.ts` (mirroring the `dedupFlag` shape at
`lib/db-switch.ts:578-607`), so the unit suite can exercise the
new path against the in-memory store.

## Migration safety

Per the AIDLC operation-phase rules (retired 2026-11-13 with the AIDLC
lane; in git history)
(Infrastructure Safety, Deployment Procedures), the v1.1 Bolt
that implements this must not land the migration blind.

- **The pending migration must be applied first.**
  `20261027140000_platform_gaps` is authored but not applied
  (Neon unreachable, `P1001`). Applying the new marker migration
  before it would leave the migration history in a state where
  `prisma migrate deploy` cannot reconcile cleanly. Sequence:
  `npx prisma migrate deploy` (applies `platform_gaps`), then
  apply the marker migration.
- **The new migration is additive only** — a new table, two new
  indexes, two new foreign keys. No column is dropped or
  retyped, so a rollback is a drop of the new table only; no
  existing data is touched. The `onDelete: Cascade` on both
  relations means deleting a user or a ticket cleans up its
  markers, so no orphan rows survive a user deletion.
- **Rollback steps.** (1) Revert the code — the v1 code path is
  unchanged and still works, because the client-held
  acknowledgement is retained as the fallback. (2) Drop the
  table: `DROP TABLE "MonitorReadMarker";`. (3) Mark the
  migration as rolled back in the deployment record. Because
  `operation.md` requires a rollback for every change, the
  fallback path must be kept, not deleted, until v1.1 is
  verified in production.
- **Smoke test / health check.** After deploy: (a) `GET
  /api/v1/dispatcher/monitor` returns 200 with the correct
  `unread` flags; (b) `POST /api/v1/dispatcher/monitor/ack`
  returns 200 and writes both the audit row **and** the marker
  row; (c) a **reload** of the monitor page shows the
  acknowledged row as read — this is the exact regression the
  marker exists to fix, so it is the smoke test that matters;
  (d) a second dispatcher account on the same ticket sees it as
  unread (per-user isolation).
- **Security implications** (per `operation.md`): the marker
  stores `userId` and `ticketId` and a timestamp — no PII
  beyond identifiers already in the system, and no ticket
  content. The marker must be read **only** for the session's
  own `userId`, and the ack route's existing 404-on-out-of-scope
  rule (`lib/dispatcher/monitor.ts:517-522`) must be applied to
  the marker write too, so a dispatcher cannot write a marker for
  a ticket outside their ward. Markers are **not** exposed to
  citizens and are not written to the citizen-facing serializer
  (`lib/serializers/ticket.ts`).

## Consequences

### Positive

- The unread dot and the "N unread" counter become a real
  signal: they mean "activity since you last looked", and they
  survive a reload.
- The v1.1 Bolt inherits a frozen design: the schema, the
  service signatures, the route contract, the migration
  command, and the test plan are all decided here, so the
  implementer does not re-derive the analysis.
- The client-held fallback can be **removed** in v1.1 rather
  than merely supplemented — the server becomes the single
  source of truth for the unread flag, and the page stops
  keeping a parallel `Set` that can drift from the server.
- The `buildMonitorRows` derivation stays pure and unchanged, so
  its existing unit tests keep passing and pin the semantics
  without a database.

### Negative

- A second query per poll. The marker read is one indexed
  `findMany` per 5-second poll per dispatcher
  (`POLL_INTERVAL_MS = 5_000`,
  `app/dispatcher/monitor/page.tsx:39`).
- A new table that grows with (users × watched tickets). It is
  bounded by the number of dispatcher–ticket pairs, and
  `onDelete: Cascade` removes rows when a user or ticket goes
  away, but it is not free.
- The `db-switch.ts` facade and `lib/dev-store.ts` both grow a
  new model surface, and `AuditWriteInput.entityType` /
  `DevAuditEntry.entityType` may need widening if the marker is
  audited as its own entity type.
- The read marker must be applied to **every** read of a
  dispatcher's watched set, not just the monitor page, or the
  unread flag will be inconsistent across surfaces.
- v1 keeps a known-broken signal in the field for the duration of
  the deferral.

### Risks

- **Risk**: the unread signal stays visibly broken for the whole
  v1 pilot, and dispatchers learn to ignore the unread dot.
  **Mitigation**: the "N new updates" counter (client-side
  delta between polls) is unaffected and still carries
  information; the deferral is explicit, recorded in this ADR,
  in Bolt 008-013's "Out of Scope", and in the design log.
- **Risk**: the read cost of a second query per poll is
  underestimated. **Mitigation**: the query is a single
  indexed `findMany` on a composite-unique-backed index, not an
  N+1; the poll is already ward-scoped and the row set is
  capped by `limit` (default 50, max 200 —
  `lib/dispatcher/monitor.ts:160-161`).
- **Risk**: the marker table grows faster than expected if
  markers are written for every watched ticket rather than only
  for acknowledged ones. **Mitigation**: write a marker **only**
  on acknowledge, and cap the marker set per user to the
  dispatcher's watched set. A marker row is upserted, not
  appended, so it does not grow per poll.
- **Risk**: the pending `platform_gaps` migration is applied
  late and the marker migration lands on an unexpected schema
  state. **Mitigation**: apply `platform_gaps` first, then
  regenerate the marker migration with `migrate diff` against
  the then-current schema rather than reusing a diff authored
  today.

## Alternatives Considered

### Alternative 1: A dedicated `MonitorReadMarker` model — **RECOMMENDED**

- **Description**: a new Prisma model keyed on
  `@@unique([userId, ticketId])` with a `lastReadAt`
  timestamp, read by the monitor service and written by the
  acknowledge service.
- **Pros**: per-(user, ticket) granularity, which is the
  granularity the question actually has; the write is an
  idempotent upsert that maps one-to-one onto the existing
  `{ ticketId }` acknowledge action; the read is a single
  indexed query; the unread flag becomes a **derived** value
  rather than a stored one, so it can never drift from the
  trail; the audit log keeps its single job (accountability);
  the four-role model and the citizen-facing serializer are
  untouched.
- **Cons**: a new table and a new migration; a new facade and
  dev-store surface; one extra query per poll; the marker set
  grows with dispatcher–ticket pairs.

### Alternative 2: A per-user scalar watermark (e.g. `User.monitorReadAt`)

- **Description**: one timestamp on the `User` row; a ticket is
  unread when its latest trail entry is newer than the user's
  watermark.
- **Pros**: the simplest possible change — one column, no new
  table, no new relation, no facade surface; the read is a
  column the service already loads; the write is a single
  `update` on the user row.
- **Cons**: **wrong granularity**. One watermark cannot express
  "I have read ticket A but not ticket B", which is exactly
  what per-ticket acknowledging means. A dispatcher who
  acknowledges one row would silently mark every other watched
  ticket as read — the unread count would collapse to zero on
  the first click, destroying the signal the surface exists to
  provide. It also cannot express per-ward read state for a
  dispatcher covering several wards, and it would make
  acknowledging ticket A *retroactively* hide a newer activity
  on ticket B that arrived before the acknowledgement.
  Rejected on correctness, not on cost.

### Alternative 3: Derive unreadness from the existing audit log

- **Description**: treat the `ticket.monitor_acknowledge` audit
  rows as the read marker; a ticket is unread when its latest
  trail entry is newer than the user's most recent acknowledge
  row for that ticket.
- **Pros**: **no schema change at all** — the audit rows are
  already written (`lib/dispatcher/monitor.ts:525-532`), and
  `AuditEntry` already indexes `(entityType, entityId)` and
  `(actorId, timestamp)` (`prisma/schema.prisma:441-442`), so
  the query is index-supported.
- **Cons**: it makes the append-only audit log do a second,
  conflicting job. The log is the city-side accountability
  record and is explicitly "Append-only — no UPDATE/DELETE
  allowed at the API layer" (`prisma/schema.prisma:440`);
  deriving a mutable read state from it inverts its semantics.
  The read cost scales with the size of the audit table rather
  than with the size of the dispatcher's watched set, and
  `AuditEntry` is the fastest-growing table in the system
  (every transition, every config change, every acknowledge).
  It also couples the monitor's read latency to the audit
  table's growth, and it makes a retention/pruning policy for
  the audit log a correctness dependency of the monitor — a
  purge of old audit rows would silently resurrect old
  acknowledgements as unread. Rejected on semantics and cost
  trajectory.

### Alternative 4: Keep the acknowledgement client-held (status quo)

- **Description**: leave the acknowledgement in the page's
  `useState<Set<string>>` (`app/dispatcher/monitor/page.tsx:139`)
  and the audit row as the only server-side trace.
- **Pros**: no migration, no schema change, no read cost, no
  new facade surface, and it is what v1 already ships. The
  audit row is not wasted — it records the acknowledgement
  intent for the city-side record, and it is the seed data a
  future marker table could be backfilled from.
- **Cons**: the cost of the status quo is the point of this
  ADR. The unread flag is **always true** for every watched
  ticket with a trail entry (`lib/dispatcher/monitor.ts:218-223`
  reached with an empty `lastReadAt` from
  `lib/dispatcher/monitor.ts:470`), so the dot and the counter
  carry no information. The acknowledgement is lost on reload,
  on a second device, and across a shift handover. A dispatcher
  covering several wards cannot express partial read state.
  Keeping it also keeps a **second, parallel** source of truth
  for read state (the client `Set` and the server audit log),
  which is how the two drift apart. This option is what v1
  ships **as a deliberate, time-boxed deferral** — it is not
  recommended as the end state.

## Test plan

The v1.1 Bolt is `feature`-scope, so it inherits the 80% line
coverage floor (`team.md`, `org.md`, ADR-008) and the test-after
ordering: implement the layer, then write and run that layer's
tests.

**Unit tests** — `tests/unit/dispatcher/monitor.test.ts`
(extends the existing suite):

- `buildMonitorRows` with a `lastReadAt` map — the derivation
  is already implemented and pure, so this is the cheapest
  coverage and it must pin: a marker **older** than the latest
  trail entry → `unread: true`; a marker **newer** than the
  latest trail entry → `unread: false`; **no** marker → `unread:
  true` when a trail entry exists; **no** trail entry → `unread:
  false` regardless of the marker. These are the four branches
  at `lib/dispatcher/monitor.ts:218-223`.
- `upsertMonitorReadMarker` — first call creates; second call
  for the same `(userId, ticketId)` **updates** rather than
  duplicating; the marker is scoped to the calling user (a
  second user gets their own row).
- `listMonitorReadMarkers` — returns only the caller's
  markers; returns an empty map for a user with no markers
  (the current v1 behaviour, so the v1 fallback is pinned).
- `acknowledgeMonitorUpdate` — writes **both** the audit row and
  the marker; the marker is not written when the ticket is
  out-of-scope (404 path, `lib/dispatcher/monitor.ts:515-521`).
- The `Result<T, E>` error shape: a failure returns
  `{ ok: false, error }` and does **not** throw (`team.md`
  Forbidden).
- The facade wiring: `db.monitorReadMarker` resolves against the
  in-memory dev store, so the service tests need no database.

**Route tests** — the `app/api/**/route.ts` handlers are
excluded from the coverage floor (they are thin HTTP adapters;
the scope judgement is recorded in `vitest.config.ts`), so the
routes are covered end-to-end by the Playwright route spec.

**Playwright** — extend
`tests/26-dispatcher-monitor-performance.spec.ts` (the spec
that already owns the monitor half):

- **Acknowledge → reload → still read.** The regression this
  whole ADR exists to fix: acknowledge a row, reload the page,
  assert the row's unread dot is gone and the "N unread" count
  dropped. This is the single most important assertion.
- **Per-user isolation.** Acknowledge a row as dispatcher A;
  sign in as dispatcher B on the same ticket; assert the row is
  unread for B.
- **Audit row still written.** The existing happy-path test
  (`tests/26-dispatcher-monitor-performance.spec.ts:247`) must
  keep passing — the marker write is **in addition to** the
  audit write, not instead of it.
- **No new visual baseline.** The monitor page carries no
  Playwright baseline (live-polling, date-dependent), so this
  work adds a route-spec assertion, not a mockup baseline. If
  the page's *visual* treatment of the unread dot changes,
  that is a separate mockup-baseline change under
  `tests-mockups/baselines/01-mockups.spec.ts/`.

**Verification gates** (per `team.md` Mandated):

- `npx tsc --noEmit` — clean, 0 errors.
- `npm run test:unit` — re-run after editing anything under
  `lib/`.
- `npm run test:unit:coverage` — 80% floor holds over `lib/**`.
- `npm run test:mockups` — 15/15 baselines pass, none
  regenerated.

## References

- `lib/dispatcher/monitor.ts` — `buildMonitorRows`
  (`:206-252`); the unread derivation (`:218-223`); the
  `lastReadAt` option (`:208`, `:210`); the
  `listMonitorTickets` → `buildMonitorRows(watched)` call with
  no marker (`:470`); the ward fallback when `session.wardId`
  is null (`:400-402`); the per-ticket trail `Promise.all`
  (`:420-468`); `acknowledgeMonitorUpdate` (`:509-535`); the
  audit write (`:525-532`); the 404/403 scope guards
  (`:515-521`); the limit clamp (`:160-161`).
- `app/dispatcher/monitor/page.tsx` — `POLL_INTERVAL_MS = 5_000`
  (`:39`); the client-held `acknowledged` set (`:139`); the
  client-side "N new updates" delta (`:181-189`); the unread
  counter (`:242-245`); `onAcknowledge` (`:247-263`); the row's
  unread dot (`:624`, `:751`).
- `app/api/v1/dispatcher/monitor/route.ts` — the Zod query
  schema (`:39-53`); the role + city guards (`:55-69`); the
  service call (`:86-92`).
- `app/api/v1/dispatcher/monitor/ack/route.ts` — the Zod body
  schema (`:34-36`); the role guard (`:39-47`); the service call
  (`:63-65`).
- `prisma/schema.prisma` — the model list (no read-marker
  model); `User` (`:180-233`); `AuditEntry` and its append-only
  note plus indexes (`:474-489`); `Role` enum (`:173-178`).
- `prisma/migrations/20261027140000_platform_gaps/migration.sql`
  — the un-applied pending migration; the `P1001` note
  (`:38-43`); the `migrate diff` generation command (`:30-36`);
  the "additive only" statement (`:3-4`, `:46-47`).
- `lib/db-switch.ts` — the explicit facade allowlist (`:24`);
  the `dedupFlag` shim pattern (`:578-607`).
- `lib/dev-store.ts` — the `DevAuditEntry.entityType` union
  (`:159`); the `dedupFlags` map (`:251`).
- `lib/platform/audit.ts` — `AuditWriteInput` and its closed
  `entityType` union (`:14-21`); `writeAudit` (`:23-34`).
- `lib/dispatcher/assign-crew.ts` — the documented
  `Result<T, E>` gap at this layer (`:38-42`).
- `lib/serializers/ticket.ts` — the citizen-facing ticket
  serializer (the boundary the monitor's row shape does not
  cross).
- `tests/unit/dispatcher/monitor.test.ts` — the existing service
  suite.
- `tests/26-dispatcher-monitor-performance.spec.ts` — the
  existing route spec; the acknowledge happy-path test
  (`:247`).
- `.specsmd/aidlc/memory-bank/bolts/008-013-dispatcher-live-monitor/bolt.md`
  — the "Acknowledge" section (the client-held deferral) and
  "Out of Scope" (the persisted read marker).
- `.specsmd/aidlc/memory-bank/standards/decision-index.md` — the
  ADR register; ADR-008 (test-after + 80% floor), ADR-009 (the
  prior deferral ADR, same shape).
- `.specsmd/aidlc/memory-bank/standards/tech-stack.md` — the
  pinned stack.
- `.specsmd/aidlc/memory-bank/standards/rules/org.md` — testing posture, the
  80% coverage floor, deployment guardrails.
- `.specsmd/aidlc/memory-bank/standards/rules/team.md` — service-layer
  `Result<T, E>`, Zod at every API boundary, named exports under
  `lib/`, `writeAudit(...)` for state changes, the
  `tsc --noEmit` and `test:unit` mandates.
- `.specsmd/aidlc/memory-bank/standards/rules/project.md` — Tech Stack; the
  Forbidden section (four-role model fixed, migration
  ownership); the Mandated verification commands.
- AIDLC `phases/operation.md` (retired 2026-11-13; in git
  history) — the
  infrastructure-safety, deployment-procedure, and
  rollback/smoke-test guardrails this migration must satisfy.
- AIDLC `phases/construction.md` (retired 2026-11-13; in git
  history) — the
  code-completeness and error-handling guardrails the v1.1
  implementation must satisfy.
- `_progress/00-design-log.md` — the batch-build entry of
  2026-10-27 that shipped Bolt 008-013 and the un-applied
  `platform_gaps` migration.
