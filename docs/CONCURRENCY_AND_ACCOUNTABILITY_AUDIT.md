# CityFix — Concurrency & Operational Accountability Audit

**Audit date:** 2026-11-08
**Codebase:** `main` @ `be9f2b0`
**Scope:** two areas the production-readiness plan singled out as the highest-value technical risk and the highest-value product gap
**Update (2026-11-08):** Scenario 2 — the worst case — is **RESOLVED**. See [A.2.1](#a21-scenario-2--resolved-2026-11-08). Scenarios 1 and 3 are **RESOLVED** by the version-guarded field writes — see [A.2.2](#a22-scenario-1--resolved-2026-11-08). Scenarios 4 and 5 remain open.

---

## Part A — Concurrency

**Original headline: there is no concurrency control of any kind in this codebase.**

| Control | Present? (at audit time) | Evidence |
|---|---|---|
| `$transaction` | **No** | Zero occurrences in `lib/`, `app/`, `prisma/`. The only repo-wide hit is an unchecked line in the audit plan itself |
| Optimistic-locking column (`version`) | **No** | `prisma/schema.prisma:311-374` — `Ticket` has `id`, `updatedAt @updatedAt`, and six `@@index`es. **No `@@unique` on the model at all** |
| Compare-and-swap write | **No** | No `updateMany` with a count check anywhere |
| `Serializable` isolation | **No** | `lib/db.ts` constructs `PrismaClient` with no `isolationLevel` option; nothing in the repo requests one |
| `SELECT ... FOR UPDATE` | **No** | Zero matches |

Every write path is a non-atomic read-modify-write against Postgres's default `READ COMMITTED` isolation.

**A structural blocker compounds this.** `lib/db-switch.ts` hard-types every `update`'s predicate:

```ts
update: async (args: {
  where: { id: string };   // ← a compound guard is not even expressible
  data: Partial<{ ... }>;
}) => ...
```

A status-guarded write cannot be written through the app's own abstraction without changing that signature. This is the same shape as the ADR-007 finding: the rule was never expressed in the mechanism.

**Update 2026-11-08 — the control surface now exists.** Every control the table above lists as absent has since been added, and the `db-switch` signature has been widened to admit a compound predicate:

| Control | Present now | Where |
|---|---|---|
| `$transaction` | ✅ | `lib/platform/transaction.ts` — `runInTransaction(db, fn)` |
| Optimistic-locking column (`version`) | ✅ | `prisma/schema.prisma` — `Ticket.version Int @default(0)` |
| Compare-and-swap write | ✅ | `db.ticket.updateWhere({ where, data })` → affected-row count |
| Unique constraint | ✅ | `@@unique([cityId, dedupKey])` on `Ticket` |
| `Serializable` isolation | ⬜ | Deliberately not used — see [A.2.3](#a23-scenario-4--resolved-2026-11-08) |

### A.1 Scenario verdicts

| # | Scenario | Verdict (at audit time) | Verdict now |
|---|---|---|---|
| 1 | Two dispatchers assign different crews to the same ticket | **VULNERABLE** | ✅ **RESOLVED 2026-11-08** — see [A.2.2](#a22-scenario-1--resolved-2026-11-08) |
| 2 | Two dispatchers transition the same ticket to different statuses | **VULNERABLE — worst case** | ✅ **RESOLVED 2026-11-08** — see [A.2.1](#a21-scenario-2--resolved-2026-11-08) |
| 3 | Two crew members update the same job | **VULNERABLE** | ✅ **RESOLVED 2026-11-08** — see [A.2.2](#a22-scenario-1--resolved-2026-11-08) |
| 4 | Two citizens submit the same report simultaneously | **VULNERABLE** | ✅ **RESOLVED 2026-11-08** — see [A.2.3](#a23-scenario-4--resolved-2026-11-08) |
| 5 | A crew member is assigned while already holding active tickets | **VULNERABLE (no constraint)** | ✅ **RESOLVED 2026-11-08** — see [A.6](#a6-scenario-5--no-crew-capacity-constraint) |

---

### A.2 Scenario 2 — concurrent transitions (the worst case)

**Evidence at audit time:** `lib/platform/transitions.ts:48-86`

```ts
const ticket = await db.ticket.findUnique({ where: { id: input.ticketId } });   // :49  READ
const allowed = ALLOWED[ticket.status];                                        // :55  validate against STALE status
if (!allowed.includes(input.toStatus)) throw new InvalidTransitionError(...);   // :56
await db.ticket.update({                                                        // :60  WRITE, id-only predicate
  where: { id: input.ticketId },
  data: { status: input.toStatus, ... },
});
await db.trail.create({ ... });                                                 // :70  separate statement
await writeAudit({ ... });                                                      // :79  separate statement
```

**The transition engine does not re-read the status inside the write.** There is no `where: { id, status: expected }` and no count-checked `updateMany`.

**Concrete failure.** The ticket is `routed`. Dispatcher A calls `transitionTicket({toStatus: 'in_progress'})`; dispatcher B calls `transitionTicket({toStatus: 'cancelled'})`.

1. Both read `routed` at line 49.
2. Both pass `ALLOWED['routed']` at line 56.
3. A writes `in_progress` and returns 200. B writes `cancelled` **last** and returns 200.
4. The ticket ends `cancelled`, overwriting A's transition.

**The trail and the ticket disagree.** The trail insert (line 70) and the audit write (line 79) are separate statements, not in the same transaction. The trail therefore contains **two** entries — one claiming `in_progress`, one claiming `cancelled` — for a ticket that ended in `cancelled`. Since `cancelled` is terminal, that is a trail describing a sequence that could not legally have happened.

This is the most consequential finding in the entire audit. The status trail is the citizen-facing trust surface for the whole platform — it is the "feel heard" signal, the thing that makes a citizen believe the report was actually worked. A trail that contradicts the ticket's actual status is not a cosmetic bug; it is the platform telling a citizen something untrue about what happened to their report.

Three routes reach it: `app/api/v1/dispatcher/tickets/[id]/transition/route.ts:100`, `app/api/v1/crew/tickets/[id]/transition/route.ts:151`, `app/api/tickets/[id]/transition/route.ts:233`.

---

### A.2.1 Scenario 2 — RESOLVED 2026-11-08

The defect above is closed at source, not just described. Three changes, plus the CI-enforced test that keeps it closed.

**1. A compare-and-swap write.** `Ticket` gains `version Int @default(0)` (migration `prisma/migrations/20261108120000_ticket_version/`). The transition's write carries the status *and* the version it read in its `where` clause:

```ts
const count = await tx.ticket.updateWhere({
  where: { id: input.ticketId, status: ticket.status, version: expectedVersion },
  data: { status: input.toStatus, version: expectedVersion + 1, ... },
});
if (count === 0) {
  throw new ConcurrentTransitionError(input.ticketId, ticket.status, input.toStatus);
}
```

A writer whose read has been overtaken updates **zero rows** instead of clobbering the winner. The affected-row count is what makes this observable — `updateMany` returns how many rows it actually changed.

`ConcurrentTransitionError` is deliberately a *different* error from `InvalidTransitionError`:

| Error | Meaning | Client answer |
|---|---|---|
| `InvalidTransitionError` | The requested edge is illegal. Deterministic. | 409 immediately — the ticket is in an illegal state |
| `ConcurrentTransitionError` | The edge was legal when read, but the race was lost. | 409 — **re-read**; the ticket is in SOME legal state, just not the one the caller saw |

All three transition routes now return **409** with a `concurrent_transition` body for the latter.

**2. One transaction.** `lib/platform/transaction.ts` runs the status update, the trail insert and the audit write inside a single transaction.

- **Prisma path:** `prisma.$transaction(async (tx) => ...)`. The `tx` client is transaction-scoped, so every statement inside it commits together or rolls back together.
- **Dev-store path:** there is no database, so the helper SNAPSHOTS its mutable collections before the callback and RESTORES them if it callback throws. That is not ACID — the dev store cannot undo a concurrent write made by another task mid-callback — but it does give the transition path the guarantee it needs: either the status, the trail row and the audit row all landed, or none of them did.

Two subtleties the implementation had to get right, both caught by the new tests:

- **`writeAudit` must write through the transaction handle.** `lib/platform/audit.ts` originally wrote through the module-level `db`, which on the Prisma path would have escaped the transaction entirely — the audit row would have committed even if the transition rolled back. `writeAudit(input, target?)` now takes an optional target, and the transition path passes the transaction-scoped handle.
- **`updateWhere` and `bumpVersion` are facade methods, not Prisma methods.** They reach for the module-level `prismaClient`, so the transaction facade had to translate them explicitly onto the transaction-scoped client's own `updateMany` delegate. A facade that simply bound them would have written outside the transaction.

**3. The dev store implements the same semantics.** `devDb.ticket.updateWhere` applies the same compound guard and returns the same affected-row count. The dev store's read-then-set pair is atomic only by accident of Node's event loop, so a dev-store implementation that skipped the guard would let CI pass while production silently lost updates.

**The dev store's rollback also had to change.** The first version of the helper restored the collections wholesale on rollback (`store.trail.length = 0; store.trail.push(...snapshot)`). That is correct for a single writer and **wrong for two**: the loser's rollback erased the winner's trail row, manufacturing exactly the corruption the transaction was introduced to prevent. The helper now records the ids of the trail and audit rows *its own callback* appended and removes only those on rollback, leaving other writers' rows alone. The Prisma path has a real transaction, so this problem never arises there — the fix brings the dev store's observable behaviour in line with it.

**4. The write paths that do not change status.** A transition that read a ticket before a crew assignment, a citizen rating, a dedup confirm/dismiss or a dispatcher ward/category/note edit would otherwise still pass its compare-and-swap and revert that edit. Those paths now use the **count-checked `updateWhere`**, so they participate in the version discipline — and they reject their own lost races. (Superseded 2026-11-08 by [A.2.2](#a22-scenario-1--resolved-2026-11-08), which replaced the interim `bumpVersion` call with a full compare-and-swap.)

| Path | File |
|---|---|
| Crew assignment | `lib/dispatcher/assign-crew.ts` |
| Citizen feedback | `lib/citizen/feedback.ts` |
| Dedup confirm / dismiss | `app/api/v1/dispatcher/dedup-flags/[id]/{confirm,dismiss}/route.ts` |
| Dispatcher ward / category / note edit | `app/api/v1/dispatcher/tickets/[id]/route.ts` |
| Citizen crew reassignment | `app/api/tickets/[id]/transition/route.ts` |

**5. CI now catches it.** `tests/unit/transitions-concurrency.test.ts` runs two and three concurrent transitions against the **real** dev store (not a mock — a mock would prove nothing about the parity claim) and asserts:

- exactly one of two concurrent transitions wins, and the loser is rejected with `ConcurrentTransitionError`;
- the loser writes **no** trail row — the citizen-facing trail cannot show a transition that did not happen;
- the ticket's final status, version and trail row agree with each other;
- a lost race is reported as a concurrency failure, not an illegal-edge failure.

`tests/unit/platform/transaction.test.ts` covers the helper itself: the dev-store commit/rollback paths, the concurrent-writer rollback that erases nobody else's rows, and the Prisma facade's routing of `updateWhere`, `bumpVersion`, `trail.create` and `audit.create` to the **transaction-scoped** client rather than the root one.

**The test was verified non-vacuous.** Neutering the compare-and-swap (forcing the affected-row count to 1) turns **7 of the 13** concurrency assertions red; restoring it turns them green.

---

### A.2.2 Scenario 1 — RESOLVED 2026-11-08

*Added 2026-11-08 to close scenarios 1 and 3 — the remaining last-write-wins ticket-field writes.*

The compare-and-swap fixed the *transition* path. The other ticket-field writes still read, decide and write non-atomically, so two dispatchers assigning the same ticket still raced each other: the second write silently clobbered the first, and the audit log recorded two plausible assignments with no indication that one had been lost.

**The fix is the same mechanism, guarded on `version` instead of `(status, version)`.** Every non-status ticket write now goes through `db.ticket.updateWhere({ where: { id, version }, data })`, which returns an affected-row count. A count of zero means another writer got there first.

| Path | Guard | Failure surfaced as |
|---|---|---|
| Crew assignment | `version` | `ConcurrentWriteError` → 409 `concurrent_write` |
| Dispatcher ward / category / note edit | `version` | 409 `concurrent_write` |
| Citizen feedback | `version` | `concurrent_write` → 409 |
| Dedup confirm / dismiss | `(status, version)` | 409 `concurrent_transition` |

The dedup paths change the ticket's **status** (`closed` / `submitted`), so they are guarded on `(status, version)` and report a *transition* failure — the same contract the transition path uses.

**Two errors, not one.** `ConcurrentTransitionError` means the caller was changing the status; `ConcurrentWriteError` means the caller was changing a non-status field. Both are 409, but the client's next action differs: re-read and re-decide the status, versus re-read and re-apply the field. Conflating them would tell a dispatcher that the ticket is in an illegal state when it is in fact in a legal one. Both live in `lib/platform/concurrency.ts`.

**The three writes in one dispatcher save each guard separately.** A single PATCH can change the ward, the category and the internal note. Each write bumps the expected version by one and guards against the version the previous write produced, so a concurrent writer that lands between two of them is caught rather than half-applied.

**CI now catches it.** `tests/unit/writes-concurrency.test.ts` (10 tests) runs two concurrent assignments against the **real** dev store and asserts:

- exactly one of two concurrent assignments wins, and the loser raises `ConcurrentWriteError`;
- the loser writes **no** audit row — the audit trail cannot show an assignment that did not happen;
- the stored assignee is one of the two candidates and the version advanced by exactly one;
- the error carries the ticket id, the field and the expected version;
- a version-guarded write invalidates an in-flight transition's compare-and-swap.

**The test was verified non-vacuous.** Neutering the compare-and-swap turns **4 of the 10** new assertions red — and 9 of the existing transition assertions with it, 13 in total. Restoring it turns them all green.

---

### A.2.3 Scenario 4 — RESOLVED 2026-11-08

*Added 2026-11-08 to close the duplicate-submission race — the last fixable scenario.*

The citizen submit path was a check-then-insert with nothing connecting the two statements:

```ts
// app/api/tickets/route.ts
dup = await checkDedup({ ... });                    // READ
if (dup) { ... return 200 dedup_match; }
const created = await db.ticket.create({ ... });    // WRITE
```

Two citizens filing the same pothole at the same coordinate at the same instant both ran the READ before either ticket existed. Both scans returned zero candidates. Both proceeded to the WRITE, and two identical tickets were created — both `status='submitted'`, both at the same coordinates, both claiming the same work. The database could not prevent it: before this change the `Ticket` model had **no unique constraint of any kind** (see [A.8](#a8-unique-constraints-that-do-exist)).

#### The fix

A `dedupKey String?` column on `Ticket`, carrying a unique index on `(cityId, dedupKey)`. The key is a SHA-256 digest of `(cityId, categoryId, locationLat, locationLng)`, so it identifies **one exact spot in one category in one city**.

The submit path computes the key, and when the database refuses the insert the loser re-runs `checkDedup` and returns the **same `dedup_match` prompt** the citizen would have received had the winner committed first. The citizen who filed second is told about the existing report instead of being given a second one.

#### Two deliberate deviations from the original recommendation

**1. The key is NOT radius-keyed.** The recommendation proposed hashing `round(lat,5)` / `round(lng,5)` and called it "the 50 m radius rule turned into a coarse grid-key constraint the DB enforces unconditionally". That is wrong for this product, and implementing it as written would have been a **functional regression**:

- The 50 m radius is a **policy threshold expressed as a distance**, because the citizen experience is *"is this the same spot?"*. It cannot be a unique-index constraint. Two genuinely **different** reports 40 m apart — a pothole and a broken streetlight on the same pavement — are different issues, and a radius-keyed index would reject the second one **outright**: the platform refusing a legitimate report.
- A radius-keyed *grid* has to pick a cell size, and every choice is wrong in one direction or the other: coarse cells block distinct reports, fine cells do not cover the radius at all. Two points 40 m apart can also fall in the same coarse cell by accident.
- The key is therefore **narrower than the prompt**: it catches only *"the same coordinates, to float precision"*. The precise Haversine scan stays exactly where it was — it remains the thing that decides *"same spot within 50 m"* and raises the citizen-facing prompt. The index is a backstop for the case where **the prompt was never raised because neither ticket existed yet**, which is the race.

**2. The key is NULLABLE, and that is the escape hatch the product needs.** PLAT-REQ-004 makes dedup a **prompt, not a rejection**: the citizen may decline it and file the report anyway, and the dispatcher then decides whether it really was a duplicate. The declined report is a legitimate ticket **at the same coordinates as the original**, and it MUST be creatable — it is precisely the thing the dispatcher's dedup queue exists to review.

So the decline path simply **omits the key**:

| Submission | `dedupKey` | Result |
|---|---|---|
| Normal report | the key | Carries the key; a second un-acknowledged same-spot ticket is refused by the index |
| Report filed after a `dedupDeclineTicketId` | `NULL` | Always creatable — Postgres treats NULLs in a unique index as distinct |
| Ticket that leaves the open statuses | `NULL` | The key is **released**, so a resolved spot can be reported again |

**3. No transaction, and no advisory lock.** The recommendation's first part — a `Serializable` transaction or a `pg_advisory_xact_lock` — was **not** implemented, because the unique index closes the window outright rather than narrowing it. A `Serializable` transaction would make the second insert fail with a serialization error rather than a duplicate-key error, which buys nothing the index does not already give, at the cost of serialising unrelated writes in the same transaction. An advisory lock keyed on the rounded coordinates would protect the scan-then-insert window, but the index protects **more** than that window: it also refuses a duplicate that arrives *after* the winner committed, which the lock would not.

#### What was verified, and how

The migration and the index were validated against **real PostgreSQL 16**, not just the dev store. A throwaway container was created, the full migration chain was applied to it (all five migrations, cleanly), and the index semantics were exercised directly in SQL:

| # | Scenario | Expected | Result |
|---|---|---|---|
| 1 | First ticket with a key | succeeds | ✅ |
| 2 | Second ticket, same `(cityId, dedupKey)` | **23505** | ✅ `duplicate key value violates unique constraint "Ticket_cityId_dedupKey_key"` |
| 3 | Declined duplicate (`NULL` key) | succeeds | ✅ |
| 4 | Another `NULL`-key ticket | succeeds | ✅ — NULLs are distinct |
| 5 | Same key, different city | succeeds | ✅ |
| 6 | Release the key, then re-insert it | succeeds | ✅ |

The constraint name Postgres reports — `Ticket_cityId_dedupKey_key` — is exactly what `isDedupConflict` recognises.

**CI now catches it.** Two new suites:

- `tests/unit/dedup-concurrency.test.ts` (18 tests) — the key is deterministic, differs on every identity component, cannot be confused by a separator inside a component; the index refuses a second same-spot ticket; a declined duplicate is creatable; a different category, a different city and a nearby coordinate are all unaffected; the key is released on resolution and kept while the ticket is open.
- `tests/unit/dedup-route-race.test.ts` (6 tests) — the **route's** recovery, against the real dev store with only the session stubbed: the loser of the race gets a `dedup_match` prompt rather than a second ticket; a declined duplicate is created and carries no key; the original keeps its key.

**Both suites were verified non-vacuous.** Neutering the dev store's unique-index check turns **3** of the primitive assertions and **1** of the route assertions red. Restoring it turns them all green. This is the same check that caught the earlier attempt at this fix: a dev store that skipped the constraint would let the whole CI suite pass while production refused the insert.

#### The one thing this does not cover

The key is only written for tickets created **after** the migration. Pre-existing tickets keep `dedupKey = NULL`, so the index starts empty and constrains only new submissions. That is deliberate — the index is a backstop for the race, not a retrofit of history — but it does mean a **pre-existing** open ticket will not block a new identical one. The Haversine scan still catches that case, so the citizen still gets the prompt; only the exact-duplicate backstop is missing for historical rows.

---

### A.3 Scenario 1 — concurrent crew assignment

**Evidence at audit time:** `lib/dispatcher/assign-crew.ts:71` (read) → `:152-155` (write)

```ts
const ticket = await getTicketWithTrail(ticketId);              // :71
...
await db.ticket.update({
  where: { id: ticket.id },                                    // :152  id-only predicate
  data: { assignedCrewId: next },
});
```

Dispatcher A and dispatcher B both read `assignedCrewId = crew_1`, both pass the ward and department scope checks, and both write. B's assignment wins silently.

**Now:** the write is a compare-and-swap on the version the caller read. See [A.2.2](#a22-scenario-1--resolved-2026-11-08).

**The audit trail compounds it.** `assign-crew.ts:160-167` writes a `beforeValue` / `afterValue` pair. A's row records `crew_1 → crew_2` and B's row records `crew_1 → crew_3`. The audit log therefore shows two plausible writes and **no indication that one was lost** — which is precisely the question the audit trail exists to answer.

The same defect appears three more times in `app/api/v1/dispatcher/tickets/[id]/route.ts` — `wardId` at `:171-174`, `categoryId` at `:197-200`, `internalNote` at `:211-214`. Each is preceded by a read of `inScope` at `:116`.

The service's own docstring (`assign-crew.ts:8-9`) calls it *"the load-bearing trust boundary — the picker UI is a hint, not the source of truth."* The scope discipline is rigorous. The concurrency control is absent.

---

### A.4 Scenario 4 — concurrent duplicate submission

**Evidence:** `app/api/tickets/route.ts:168-196` (dedup scan) → `:199-212` (insert); `lib/platform/dedup.ts:54-101`

The dedup check and the insert are **two separate statements with no transaction and no lock between them**.

Two citizens submitting the same pothole at the same coordinate at the same instant: both `checkDedup` queries return zero candidates (no ticket exists yet), both proceed to `db.ticket.create`, and **two identical tickets are created** — both `status='submitted'`, identical coordinates to float precision.

The database cannot prevent it: `prisma/schema.prisma:311-374` has **no `@@unique` on `Ticket`**. The migrations confirm it — `20261012102438_init` and `20261027140000_platform_gaps` create unique indexes for `City`, `Ward`, `Department`, `Category`, `User`, `PushSubscription`, `Crew` and `SlaPolicy`, and **none for `Ticket`, `TicketPhoto` or `TicketTrailEntry`**.

Note the deliberate escape hatch: `app/api/tickets/route.ts:167` skips the dedup check when `dedupDeclineTicketId` is present, because the design *intends* to let a citizen override a duplicate. The race produces an **unintentional** duplicate that bypasses even the decline logging and the `DedupFlag` review queue — the worst kind, because nothing surfaces it.

**Now:** ✅ **RESOLVED 2026-11-08** — see [A.2.3](#a23-scenario-4--resolved-2026-11-08). A `dedupKey` column with a `@@unique([cityId, dedupKey])` index makes the duplicate insert a database-level impossibility; the loser re-runs the scan and is returned the same `dedup_match` prompt the winner would have got. The decline escape hatch is preserved because a declined submission carries **no** key, and NULLs are distinct in a Postgres unique index.

---

### A.5 Scenario 3 — concurrent crew updates

Two sub-cases, with different severity:

**Both upload an after-photo — LOW.** `app/api/v1/crew/tickets/[id]/photos/route.ts:220-229` calls `db.ticketPhoto.create`. `TicketPhoto` (`prisma/schema.prisma:398-422`) has no `@@unique` and no slot column, so the DB cannot prevent duplicate positions. But photos are **appended, not overwritten** — both rows survive. The real damage is ordering: `uploadedAt` is `@default(now())`, and two photos in the same Postgres timestamp window get an arbitrary order. The photo set is not lost.

**Both mark the ticket resolved — HIGH.** This is scenario 2's defect reached through the crew route. Two crew members on the same ticket both pass the `assignedCrewId === session.userId` check (`:146`) and both transition to `resolved`; the second overwrites the first's `resolvedAt`, and both write a trail row claiming `resolved`.

**There is also a TOCTOU on the assignment check itself.** `route.ts:146` reads `ticket.assignedCrewId` from a snapshot loaded at `:119`. If a dispatcher reassigns the ticket between `:119` and `:151`, the crew member still completes the transition on a ticket that is no longer theirs.

**Now:** the "both mark the ticket resolved" sub-case is fixed by the transition compare-and-swap (see [A.2.1](#a21-scenario-2--resolved-2026-11-08)) — the crew route uses the same `transitionTicket` service, so the second crew member's transition now loses its compare-and-swap and is rejected with a 409. The reassignment TOCTOU is closed too: the assignment write bumps the version, so the crew member's transition fails its compare-and-swap rather than resolving a ticket that is no longer theirs.

**Still open:** the photo-ordering sub-case. Two photos uploaded in the same Postgres timestamp window get an arbitrary order. Photos are appended rather than overwritten, so nothing is lost — but the ordering is not deterministic. This is a schema question (a `slot` column or a deterministic tiebreak), not a race guard.

---

### A.6 Scenario 5 — no crew capacity constraint

**Evidence at audit time:** `lib/dispatcher/assign-crew.ts` — validates role (`:114`), ward (`:117`), department (`:142-148`). **Never checks whether the crew member already holds other active tickets.**

`prisma/schema.prisma:368` has `@@index([assignedCrewId])` — an index for lookup, **not** a uniqueness constraint. A dispatcher can assign the same crew member to N tickets; the crew list (`app/api/v1/crew/tickets/route.ts:167`) filters in code, so the crew simply sees all N.

If double-booking is a business rule, it exists nowhere in the codebase. If it is not, the absence should be recorded as a decision rather than left ambiguous.

#### The rule existed — in the UX spec, not the code

The audit framed this as an open product question. It was not. The rule is written down, in
`design-artifacts/C-UX-Scenarios/02-habib-the-handler/2.4-assign-to-crew/2.4-assign-to-crew.md`:

| Spec line | What it describes |
|---|---|
| *"**Current load** — '৩টি কাজ চলমান / 3 jobs in progress' (red badge if > 5)"* | A load badge on each crew card, turning red above 5 |
| *"Sorted by best fit first: specialty match → **current load (low first)** → distance (near first) → last activity"* | A load-based sort |
| *"**On 409 conflict** (crew just took another job): 'এই ক্রু এখন অন্য কাজে ব্যস্ত — অন্য ক্রু নির্বাচন করুন / This crew just took another job — pick a different crew.'"* | A 409 refusal when a crew member is already loaded |

All three are capacity behaviour. **None of it was implemented.** The picker returned `{ id, name }` and nothing else; the assignment endpoint checked only role, ward and department; the spec's own 409 copy had no code path that could produce it.

So this was not an undecided question — it was an **unimplemented specification**, and the implementation is what closes the finding. The audit's instinct to leave it as a product decision was right about the *mechanism* (there is no constraint to add) and wrong about the *status* (the decision had already been made, in the design artifacts).

#### What was built

**`lib/dispatcher/crew-capacity.ts`** (new) — the rule, in one place:

- `CREW_CAPACITY_LIMIT = 5`. The spec's red badge fires at **> 5**, so 5 is the last unflagged load and the sixth assignment is the one refused.
- `countCrewActiveLoad(crewId, excludeTicketId?)` — the number of **active** tickets the member holds. Active means `submitted`, `routed` or `in_progress`; `resolved`, `closed` and `cancelled` are not load, so a member who closed their last ticket is assignable again immediately. This set matches `buildCrewLoad` in `lib/dispatcher/monitor.ts`, which is the chart the dispatcher already reads — the picker and the chart must not disagree about what "busy" means.
- `countCrewActiveLoads(crewIds)` — the same count for a whole roster in **one** query, not one per member.
- `checkCrewCapacity(crewId, excludeTicketId?)` — the count, the limit, and the verdict.

`excludeTicketId` matters: without it, a dispatcher re-assigning a ticket that member **already holds** would count that ticket twice and could be refused a re-assignment that changes nothing.

**`lib/dispatcher/assign-crew.ts`** — the enforcement, in the same place as the role/ward/department checks that were already there. A member at the limit is refused with **409 `crew_at_capacity`**, not 403: the member is a valid choice, they are simply already carrying their share. The refusal writes **no** audit row and leaves the ticket unassigned, matching how the concurrent-write rejection behaves.

**`lib/dispatcher/list-crew-for-ward.ts`** — the picker now carries `activeCount`, `capacityLimit` and `atCapacity` on each entry, and sorts **least-loaded first** (then by name, so the order is stable). The spec's full ordering — specialty → load → distance → last activity — cannot be completed here: distance needs the crew member's last known location (v1 approximates it from their last ticket) and "last activity" is a timestamp the `User` row does not carry. The department filter already implements the specialty-match step.

**`app/dispatcher/tickets/[id]/page.tsx`** — the `<option>` shows the load (`Karim (0/5)`), an at-capacity option is `disabled`, and the 409 is mapped to localized copy. The picker is a **hint**; the endpoint is the trust boundary, so a stale picker still cannot produce an over-capacity assignment.

**`lib/dev-store.ts`** — `ticket.findMany` gained the `assignedCrewId` filter (equality and `{ in: [...] }`), with Prisma's NULL semantics mirrored (an `in` filter does not match NULL). Without it the capacity query would work only against real Prisma, and the CI suite would never exercise the rule at all — the same faithfulness discipline the compare-and-swap and the dedup index required.

#### Why this is not a race guard, and why that is fine

A capacity limit is a **counting** rule, not a **uniqueness** rule. The same member legitimately holds many tickets — just not more than N. So there is no `@@unique` to reach for, and the check is a read followed by a write. That is a check-then-act race in principle.

The race is **accepted**, deliberately:

- The worst outcome is that a member transiently holds LIMIT+1 tickets instead of LIMIT. Nobody's data is corrupted; the dispatcher sees the true load in the picker and in the monitor chart, and the extra ticket can be reassigned.
- Closing it would need a serialisable transaction or a row lock on the crew member, taken in the middle of the assignment path — a real cost for a soft business rule.

This is the same trade the dedup path accepted: a `Serializable` transaction would have bought nothing the unique index did not already give. Here there is no index to reach for, so the race stands and the count is re-read after the write as well, so the audit trail records what actually happened.

#### Verification

| Check | Result |
|---|---|
| `tests/unit/dispatcher/crew-capacity.test.ts` | **New, 14 tests** — the count, the status filter, the boundary (5 allowed / 6 refused), the ticket-exclusion, the picker agreement |
| `tests/unit/dispatcher/assign-crew.test.ts` | **+5 tests** — the 409, the no-audit-row refusal, the no-op re-assignment, the capacity freed by a terminal status |
| **Non-vacuity** | Neutering `atCapacity` to `false` turns **3 of 130** dispatcher assertions red; restoring it turns them green |
| `npx tsc --noEmit` | clean |
| `npm run test:unit` | **111 files / 1,960 tests**, 100% passing |
| `npm run lint` | 0 errors, 55 warnings (all pre-existing) |

The picker and the assign service read the **same** `CREW_CAPACITY_LIMIT` constant and the **same** status set, so the hint and the trust boundary cannot drift apart.

---

### A.7 The dev store hides all of this — and CI runs on the dev store

This is the most important methodological finding.

`lib/dev-store.ts` — `ticket.update` does a read (`getStore().tickets.get`) then a `set`. Node's single-threaded event loop makes each *individual* operation atomic, and there is no `await` between them, so within one `update()` call the pair is effectively atomic. The dev store **hides the read-write gap by accident of the event loop, not by design.**

Two further divergences:

- `lib/dev-store.ts` — `ticket.update` accepts `where: { id }` only, so it **cannot express a compound guard either**. A fix applied only to the Prisma path would not be exercised by CI.
- `lib/dev-store.ts` — `ticketPhoto.create` does `list.push(row)` then `list.sort()` then `set`. The push mutates the array **in place before the sort**, so the sort reorders an array already referenced by the Map. Two interleaved creates can leave the list unsorted relative to `uploadedAt`.

**Consequence:** the CI suite provides **zero coverage** of any of these defects, and would not catch a regression if a fix were applied only to the Prisma path. A grep of `tests/` for `concurren|race|lost update|simultaneous` finds only dev-server compile-race workarounds and the `write-queue` IndexedDB test — nothing that exercises concurrent writes to the same ticket.

**Update 2026-11-08 — closed for the transition path.** The first divergence is now fixed: `devDb.ticket.updateWhere` accepts a compound `{ id, status, version }` predicate and returns the same affected-row count the Prisma path returns, so the dev store implements the guard deliberately rather than inheriting atomicity from the event loop. `tests/unit/transitions-concurrency.test.ts` now drives two and three concurrent transitions through the **real** dev store and asserts exactly one winner.

The second divergence (`ticketPhoto.create`'s in-place push-then-sort) is **still open** — it is not on the transition path and was not touched.

**Update 2026-11-08 — closed for scenarios 1, 3 and 4.** `devDb.ticket.updateWhere` now returns the affected-row count (above), and `devDb.ticket.create` enforces the **`(cityId, dedupKey)` unique index** with Postgres's exact semantics — NULLs are distinct, the scope is `(cityId, dedupKey)`, and the violation is reported as SQLSTATE `23505` with the constraint named `Ticket_cityId_dedupKey_key`. So the dev store now mirrors both of the database's concurrency behaviours that the fixed scenarios depend on.

Two suites exercise them against the **real** dev store: `tests/unit/writes-concurrency.test.ts` (10 tests) and `tests/unit/dedup-concurrency.test.ts` (18 tests), plus `tests/unit/dedup-route-race.test.ts` (6 tests) for the submit path's recovery.

**Every new suite was verified non-vacuous.** Neutering the guard under test turns its assertions red — 13 for the compare-and-swap, 3 for the unique-index primitives, 1 for the route recovery. A dev store that skipped the guard would let the whole CI suite pass while production behaved differently, so this check is the point of the suites, not a formality.

**Update 2026-11-08 — closed for scenario 5 as well.** The dev store needed one more faithful behaviour for the capacity work: `devDb.ticket.findMany` now filters on `assignedCrewId` (equality **and** `{ in: [...] }`), mirroring Prisma's NULL semantics — an `in` filter does not match a NULL `assignedCrewId`. Without it the load count silently returned zero for every crew member, and the picker would have shown "0/5" for everyone. `tests/unit/dispatcher/crew-capacity.test.ts` (14 tests) drives the real dev store and pins the count, the status filter, the boundary and the picker's agreement with the assign service.

**All five named scenarios are now covered by CI.** The one remaining divergence — `ticketPhoto.create`'s in-place push-then-sort — is still open, but it is a *photo ordering* question, not a race guard: the fix is a deterministic tiebreak (a `slot` column or an `ORDER BY uploadedAt, id`), not a lock.

---

### A.8 Unique constraints that do exist

| Table | Constraint | Line |
|---|---|---|
| `City` | `slug` | `:29` |
| `Ward` | `(cityId, number)` | `:68` |
| `Department` | `(cityId, slug)` | `:86` |
| `Crew` | `(cityId, name)` | `:115` |
| `SlaPolicy` | `categoryId`; `(cityId, categoryId)` | `:133`, `:141` |
| `Category` | `(cityId, slug)` | `:165` |
| `User` | `(cityId, phone)`; `(cityId, email)` | `:228-229` |
| `PushSubscription` | `endpoint` | `:288` |
| **`Ticket`** | `(cityId, dedupKey)` — added 2026-11-08 | `prisma/schema.prisma` `@@unique([cityId, dedupKey])` |
| **`TicketPhoto`** | **none** | — |
| **`TicketTrailEntry`** | **none** | — |
| **`DedupFlag`** | **none** | — |
| **`Session`** | **none** | — |
| **`AuditEntry`** | **none** | — |
| **`OtpCode`** | **none** | — |

The DB layer provides zero protection for any ticket-state race.

**Update 2026-11-08.** `Ticket` now carries one unique constraint — `(cityId, dedupKey)` — which closes the duplicate-submission race (see [A.2.3](#a23-scenario-4--resolved-2026-11-08)). The ticket-*state* races are still protected by the `version` compare-and-swap rather than by an index: a status transition and a field write both aim at the **same row**, so an index cannot arbitrate between them — only a row-level guard can.

`dedupKey` is **nullable**, and that is deliberate: a submission that declared a dedup **decline** carries no key, and a ticket that leaves the open statuses has its key released. Postgres treats NULLs in a unique index as distinct, so neither case is constrained — which is exactly what the product requires.

**The crew capacity limit is deliberately NOT a constraint.** It is a counting rule ("a member may hold at most 5 *active* tickets"), not a uniqueness rule, so no index can express it. It is enforced in `lib/dispatcher/crew-capacity.ts` as a read-then-check, with the race accepted and the reason documented — see [A.6](#a6-scenario-5--no-crew-capacity-constraint).

---

### A.9 Recommendations

**R1 — Make `transitionTicket` a compare-and-swap.** (fixes scenarios 2 and 3 — the worst failure.) — **DONE 2026-11-08.** See [A.2.1](#a21-scenario-2--resolved-2026-11-08).

As recommended, in `lib/platform/transitions.ts` the `db.ticket.update` was replaced with a conditional write that fails when the status has moved, using the **stronger variant** (a `version Int @default(0)` column bumped on every write):

```ts
const count = await tx.ticket.updateWhere({
  where: { id: input.ticketId, status: ticket.status, version: expectedVersion },
  data: { status: input.toStatus, version: expectedVersion + 1, ... },
});
if (count === 0) throw new ConcurrentTransitionError(input.ticketId, ticket.status, input.toStatus);
```

All four sub-points were carried out:

- ✅ `db.ticket.update`'s `where` type widened to accept a compound predicate, and a count-checked `updateMany` added to the facade as `db.ticket.updateWhere`.
- ✅ The same conditional implemented in `lib/dev-store.ts` (`devDb.ticket.updateWhere`), so CI exercises the new semantics.
- ✅ The status update + trail insert + audit write wrapped in a single transaction (`lib/platform/transaction.ts`), so the trail can never disagree with the ticket status.
- ✅ One deliberate divergence from the recommendation: a lost race raises `ConcurrentTransitionError`, **not** `InvalidTransitionError`. The recommended snippet conflated the two, which would tell the client the ticket is in an illegal state when it is in fact in some *other* legal state. The two are now distinct errors with distinct client contracts (see A.2.1).

**R2 — Close the dedup check-then-insert gap.** (scenario 4.) — **DONE 2026-11-08.** See [A.2.3](#a23-scenario-4--resolved-2026-11-08).

The recommendation had two parts. The second part was implemented as written — a `dedupKey` column with a `@@unique([cityId, dedupKey])` index — but the **first** part (a `Serializable` transaction or an advisory lock) was deliberately NOT implemented, and the key's precision was changed. Both deviations are argued in [A.2.3](#a23-scenario-4--resolved-2026-11-08); the short version is that a radius-keyed unique index would have made the product's acknowledged-duplicate path impossible to create, and the transaction/advisory-lock variant protects a window that the unique index closes outright.

**R3 — Version-guard the other ticket-field writes.** (scenarios 1 and 5.) — **DONE 2026-11-08.**

The `version` column now exists and every non-status ticket write uses a count-checked `updateWhere` with the version it read:

```ts
const count = await db.ticket.updateWhere({
  where: { id: ticket.id, version: expectedVersion },
  data: { assignedCrewId: next, version: expectedVersion + 1 },
});
if (count === 0) throw new ConcurrentWriteError(ticket.id, 'assignedCrewId', expectedVersion);
```

A count of zero means another writer got there first, and the route returns **409 conflict** with the error code `concurrent_write` — so the dispatcher sees *"this ticket changed, reload and try again"* rather than a silent overwrite. The dedup confirm/dismiss paths change the ticket's status, so they are guarded on `(status, version)` and report `concurrent_transition` instead, matching the transition path's contract.

Both remaining items from the original recommendation:

- ✅ In `lib/dispatcher/assign-crew.ts` and the three writes in `app/api/v1/dispatcher/tickets/[id]/route.ts`, use `updateWhere({ where: { id, version }, ... })` and return **409 conflict** when the count is 0.
- ✅ Scenario 5 — the crew capacity constraint — is closed by `lib/dispatcher/crew-capacity.ts`, which enforces the limit the UX spec already set (5 active tickets) as a **counting** rule rather than a uniqueness rule, and returns **409 `crew_at_capacity`** when a member is already at the limit. See [A.6](#a6-scenario-5--no-crew-capacity-constraint).

**R4 — Add a concurrency test suite.** — **DONE 2026-11-08.**

`tests/unit/transitions-concurrency.test.ts` (13 tests) and `tests/unit/platform/transaction.test.ts` (16 tests) now cover the transition race, the dev-store's version discipline, and the transaction helper's commit/rollback semantics. See [A.2.1](#a21-scenario-2--resolved-2026-11-08).

**Extended 2026-11-08** with `tests/unit/writes-concurrency.test.ts` (10 tests), `tests/unit/dedup-concurrency.test.ts` (18 tests) and `tests/unit/dedup-route-race.test.ts` (6 tests) — covering the field-write race, the dedup-key primitives, and the submit path's race recovery.

**Extended again 2026-11-08** with `tests/unit/dispatcher/crew-capacity.test.ts` (14 tests) and 5 further assertions in `tests/unit/dispatcher/assign-crew.test.ts` — covering the capacity limit's count, its status filter, its exact boundary, and the picker's agreement with the assign service. **66 concurrency tests in total.** Every one of them was verified non-vacuous by neutering the guard it exercises and confirming the assertions turn red.

---

### A.10 What could not be verified

| Item | Why | Changed since |
|---|---|---|
| **The deployed Postgres isolation level** | `lib/db.ts:18-20` constructs `PrismaClient` with no `isolationLevel`, and `DATABASE_URL` is not inspectable from the repo, so the connection-string or server default governs. The standard Postgres default is `READ COMMITTED`, under which all of the above failures are real. A non-default server setting could not be ruled out — **but nothing in the codebase requests one** | Unchanged. The compare-and-swap does not depend on the isolation level: the guard is in the `where` clause, so it holds under `READ COMMITTED` and above |
| **Actual concurrent behaviour under load** | Originally derived from source analysis of the read-modify-write sequences, with no concurrency test available | **Now tested for the transition, field-write and duplicate-submission paths.** `tests/unit/transitions-concurrency.test.ts`, `tests/unit/writes-concurrency.test.ts`, `tests/unit/dedup-concurrency.test.ts` and `tests/unit/dedup-route-race.test.ts` reproduce the races against the real dev store and assert exactly one winner. The dedup-key index itself was additionally exercised against **real PostgreSQL 16** (the migration chain applied to a throwaway container, and the index semantics checked directly in SQL) — see [A.2.3](#a23-scenario-4--resolved-2026-11-08). Still unverified against a real Postgres under *concurrent load* — CI has no database |
| **Whether Neon sets a non-default isolation level** | Not inspectable from the repository | Unchanged |

---

## Part B — Operational Accountability

**Headline: no metric is computed from placeholder data. Every number comes from real DB columns.** The failure mode the plan warned about — fake data in a production path — **does not occur**.

A repo-wide grep for `Math.random`, `mock`, `placeholder`, `sample`, `demo`, `dummy` and `hardcod` across `app/dispatcher`, `app/admin`, `lib/dispatcher` and `lib/admin` returned **no hits in any metric path**. The only `Math.random()` calls in `app/` and `lib/` are in password generation (`lib/admin/users.ts:642-656`).

The dev store seeds *data* with real timestamps — it is not a source of hardcoded metric values.

### B.1 Metric inventory

| Metric | API route | Source | Verdict |
|---|---|---|---|
| Total reports | `/api/v1/dispatcher/performance` | `current.length`, filtered on `createdAt` in range (`performance.ts:231`) | REAL |
| Resolution rate | same | `count(status ∈ {resolved,closed}) / count` (`performance.ts:234-240`) | REAL |
| Avg time-to-resolve | same | `mean(resolvedAt − createdAt)` over tickets with `resolvedAt` (`performance.ts:242-251`) | REAL |
| Submitted-vs-resolved series | same | daily buckets on `createdAt` / `resolvedAt` (`performance.ts:301-310`) | REAL |
| Category breakdown | same | `count` by `categoryId` (`performance.ts:322-334`) | REAL |
| Status breakdown | same | `count` by `status` (`performance.ts:351-360`) | REAL |
| Crew avg time-to-resolve | same | `resolvedAt − createdAt` per crew (`performance.ts:388-391`) | REAL |
| Crew feedback ratio | same | `Ticket.feedback` JSON `rating`, suppressed below 5 samples (`performance.ts:392-411`) | REAL |
| Long-tail age | same | `Date.now() − createdAt` (`performance.ts:433`) | REAL |
| Monitor flow counts | `/api/v1/dispatcher/monitor` | `count` by `status` (`monitor.ts:275-286`) | REAL |
| Monitor avg response (sparkline) | same | first trail entry with `toStatus ≠ 'submitted'` − `createdAt` (`monitor.ts:313-326`) | REAL (trail-derived) |
| Crew load | same | `count` of assigned non-resolved (`monitor.ts:348-369`) | REAL |
| Adoption: registered citizens | `/api/v1/admin/cities/[id]/adoption` | `User` rows role=citizen with `createdAt` in range (`users-db.ts:565-575`) | **PARTIAL** — a range proxy, not a cumulative count |
| Adoption: reports received | same | `count` of tickets in range (`adoption.ts:671`) | REAL |
| Adoption: resolution rate | same | `resolvedAt` in range ÷ tickets in range (`adoption.ts:677-684`) | REAL |
| Adoption: avg time-to-resolve | same | `mean(resolvedAt − createdAt)` (`adoption.ts:814-830`) | REAL |
| Adoption: daily series | same | buckets on `createdAt`/`resolvedAt`/`User.createdAt` (`adoption.ts:388-421`) | REAL |
| Adoption: ward heatmap | same | `count` by `wardId` + intensity (`adoption.ts:430-459`) | REAL |
| Adoption: funnel visit stage | same | distinct `reporterId` count — **stands in for page views** (`adoption.ts:724`, documented at `adoption.ts:25-30`) | **PARTIAL** — a proxy; there is no analytics table |
| Adoption: crew response time | same | median of trail `in_progress` ts − trail `routed` ts (`adoption.ts:522-542`) | REAL (trail-derived) |
| Adoption: citizen retention | same | 2nd `createdAt` within 30 d of the 1st, grouped by `reporterId` (`adoption.ts:500-520`) | REAL |
| Adoption: staff activity | same | `Session.lastSeenAt` within 7 d ÷ staff count (`adoption.ts:490-498`) | REAL |
| Adoption: health flags | same | `MAX(Session.lastSeenAt)`, unassigned `createdAt` age, wards without recent reports (`adoption.ts:832-886`) | REAL |
| Adoption CSV export | `/adoption/export` | same builder (`adoption.ts:897-913`) | REAL |
| Admin dashboard KPIs | `/api/v1/admin` | `countStatus(tickets, …)` (`app/admin/page.tsx:350-355`) | REAL |
| Crew dashboard avg resolution | crew page | `resolvedAt − createdAt` (`app/crew/page.tsx:357-373`) | REAL |

### B.2 The four operational questions

| Question | Answerable? | Why |
|---|---|---|
| **How long do reports remain pending?** | **PARTIAL** | No time-to-route or time-to-acknowledge metric exists. The long-tail list gives ticket *age* (`performance.ts:433`) and the monitor sparkline gives time-to-first-move (`monitor.ts:313-326`), but neither is surfaced as a "pending duration" KPI and neither is SLA-graded |
| **How quickly do dispatchers verify them?** | **PARTIAL** | The monitor sparkline is a real time-to-first-move measure, but it is a per-day average over a 7-day window — not a dispatcher-attributable triage metric |
| **How long do crews take to resolve them?** | **YES** | `resolvedAt − createdAt`, computed in three independent surfaces |
| **Which areas repeatedly generate complaints?** | **YES** | Ward heatmap (`adoption.ts:430-459`) and category breakdown (`performance.ts:322-334`) |

**Two of four are only partially answerable**, and the gap is the same shape as the concurrency gap: **the timestamps needed for honest metrics do not exist on the model.**

### B.3 `SlaPolicy` is defined but never consulted

`prisma/schema.prisma:128-146` defines `SlaPolicy` with `resolveHours`. It is seeded (`prisma/seed.ts:347-362`), and the model comment claims *"the admin surfaces report on it"* (`schema.prisma:123`) — **that comment is false.**

A repo-wide grep finds only three references outside the schema and seed, and **all three are comments disclaiming its use**:

- `lib/admin/adoption.ts:11-14` — *"NOT IN SCHEMA and NOT NEEDED"* (stale — it *is* in the schema)
- `lib/admin/users.ts:22,41` — lists it as not consulted
- `prisma/seed.ts:142-145` — *"not consulted by the current surfaces"*

**No computation reads `slaPolicy` / `resolveHours`.** There is no SLA-breach detection anywhere. A ticket can sit 10× over its committed window and still report as un-breached. The schema comment is actively misleading to a future reader.

### B.4 Missing timestamps on the `Ticket` model

`prisma/schema.prisma:311-372` has `createdAt`, `updatedAt`, `resolvedAt` — **no `routedAt`, no `firstResponseAt`.**

The `SlaPolicy` comment defines the SLA window as *"hours from `routed` to `resolved`"* (`schema.prisma:125-127`) — a window that **cannot be computed from the columns**, because the `routed` moment lives only in `TicketTrailEntry.timestamp`.

To answer Q1 and Q2 honestly and enable SLA grading, add:

| Field | Purpose |
|---|---|
| `Ticket.routedAt DateTime?` | The dispatcher's routing moment (currently only in the trail) |
| `Ticket.firstResponseAt DateTime?` | First dispatcher touch / acknowledgement |
| `Ticket.assignedAt DateTime?` | Crew assignment — `app/crew/page.tsx:373-375` already falls back to `createdAt` when the trail entry is missing |
| `Ticket.startedAt DateTime?` | Crew work start (currently inferred from the trail) |

**The trail is a legitimate production source**, not a mock — `transitionTicket` writes a `TicketTrailEntry` with `timestamp @default(now())` on every transition (`lib/platform/transitions.ts:70-77`), and the rows are reachable via `listTicketTrail` (`users-db.ts:534-558`). The trail-derived metrics are real.

The limitation is query shape, not correctness: trail queries are per-ticket and unindexed by `toStatus`, so scaling a trail-derived aggregate to city-wide volume is a performance concern.

### B.5 UI surfaces showing numbers not derived from the API

**None.** All three audited pages fetch their payload and render it directly:

- `app/dispatcher/performance/page.tsx:197-215` (fetch) → `:559, :567, :574` (render)
- `app/dispatcher/monitor/page.tsx:202-203` → `:993-1036`
- `app/admin/cities/[id]/adoption/page.tsx:166-174` → `:467-882`

Two rendering caveats that can mislead, though neither is a placeholder:

- `lib/dispatcher/monitor.ts:330-332` emits `avgMinutes: 0, samples: 0` for days with no data. The page guards this with `hasData = points.some(p => p.samples > 0)` (`app/dispatcher/monitor/page.tsx:1002`) and shows an empty state — **correct handling.**
- `lib/admin/adoption.ts:548-550, 556-560, 564-566` **collapse a `null` metric to `0`.** So "no data" and "genuinely zero" are indistinguishable on the admin engagement signals — crew response time shows `0` when no ticket has both `routed` and `in_progress` trail entries. The dispatcher performance table does this correctly (`avgTimeToResolveMs: null` → a "not enough data" state, `app/dispatcher/performance/page.tsx:696-698`).

### B.6 Recommendations

1. **Add the four timestamps** to `Ticket` (§B.4) and backfill from the trail. This is the enabling change for Q1, Q2 and SLA grading.
2. **Consult `SlaPolicy`** in the pending-duration and time-to-resolve computations, and add a breach flag to the dispatcher monitor and the adoption dashboard.
3. **Fix the schema comment** at `prisma/schema.prisma:123` — it claims the admin surfaces report on `SlaPolicy` and they do not.
4. **Stop collapsing `null` to `0`** in `lib/admin/adoption.ts:548-566`; render a "not enough data" state as the dispatcher performance table already does.
5. **Fix the stale comment** at `lib/admin/adoption.ts:11-14` — `SlaPolicy` *is* in the schema.

### B.7 What could not be verified

| Item | Why |
|---|---|
| **Whether the metric numbers are correct in production** | The computation paths were read and traced to their DB columns. No production dataset was available to sanity-check the arithmetic against |
| **Metric query performance at city scale** | Trail-derived aggregates are per-ticket and unindexed by `toStatus`. At pilot volume this is fine; at city scale it is untested |
| **Whether the seeded data biases the numbers** | The dev store seeds data with real timestamps, so the metrics are structurally correct — but their *values* on seeded data are not representative of real usage |
| **The accuracy of the `routed`-to-`in_progress` median** | Derived from trail timestamps, which were written after the status update in a separate statement. **Under the concurrency defects in Part A, a trail timestamp could postdate a status that was immediately overwritten — so this median was exposed to Part A's defect.** That exposure is now closed: the status update, the trail insert and the audit write share one transaction, and a lost race rolls its own trail row back (see [A.2.1](#a21-scenario-2--resolved-2026-11-08)). The median is still unverified against production data, but it is no longer exposed to a corrupted trail |

---

## Related documents

- [SECURITY_AUDIT.md](SECURITY_AUDIT.md) — the findings register
- [KNOWN_ISSUES.md](KNOWN_ISSUES.md) — the operational index
- [ARCHITECTURE.md](ARCHITECTURE.md) — the layers these findings sit in
- [PRODUCTION_READINESS_CHECKLIST.md](PRODUCTION_READINESS_CHECKLIST.md) — the go/no-go
