# CityFix — Concurrency & Operational Accountability Audit

**Audit date:** 2026-11-08
**Codebase:** `main` @ `be9f2b0`
**Scope:** two areas the production-readiness plan singled out as the highest-value technical risk and the highest-value product gap

---

## Part A — Concurrency

**Headline: there is no concurrency control of any kind in this codebase.**

| Control | Present? | Evidence |
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

### A.1 Scenario verdicts

| # | Scenario | Verdict |
|---|---|---|
| 1 | Two dispatchers assign different crews to the same ticket | **VULNERABLE** |
| 2 | Two dispatchers transition the same ticket to different statuses | **VULNERABLE — worst case** |
| 3 | Two crew members update the same job | **VULNERABLE** |
| 4 | Two citizens submit the same report simultaneously | **VULNERABLE** |
| 5 | A crew member is assigned while already holding active tickets | **VULNERABLE (no constraint)** |

---

### A.2 Scenario 2 — concurrent transitions (the worst case)

**Evidence:** `lib/platform/transitions.ts:48-86`

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

### A.3 Scenario 1 — concurrent crew assignment

**Evidence:** `lib/dispatcher/assign-crew.ts:71` (read) → `:152-155` (write)

```ts
const ticket = await getTicketWithTrail(ticketId);              // :71
...
await db.ticket.update({
  where: { id: ticket.id },                                    // :152  id-only predicate
  data: { assignedCrewId: next },
});
```

Dispatcher A and dispatcher B both read `assignedCrewId = crew_1`, both pass the ward and department scope checks, and both write. B's assignment wins silently.

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

---

### A.5 Scenario 3 — concurrent crew updates

Two sub-cases, with different severity:

**Both upload an after-photo — LOW.** `app/api/v1/crew/tickets/[id]/photos/route.ts:220-229` calls `db.ticketPhoto.create`. `TicketPhoto` (`prisma/schema.prisma:398-422`) has no `@@unique` and no slot column, so the DB cannot prevent duplicate positions. But photos are **appended, not overwritten** — both rows survive. The real damage is ordering: `uploadedAt` is `@default(now())`, and two photos in the same Postgres timestamp window get an arbitrary order. The photo set is not lost.

**Both mark the ticket resolved — HIGH.** This is scenario 2's defect reached through the crew route. Two crew members on the same ticket both pass the `assignedCrewId === session.userId` check (`:146`) and both transition to `resolved`; the second overwrites the first's `resolvedAt`, and both write a trail row claiming `resolved`.

**There is also a TOCTOU on the assignment check itself.** `route.ts:146` reads `ticket.assignedCrewId` from a snapshot loaded at `:119`. If a dispatcher reassigns the ticket between `:119` and `:151`, the crew member still completes the transition on a ticket that is no longer theirs.

---

### A.6 Scenario 5 — no crew capacity constraint

**Evidence:** `lib/dispatcher/assign-crew.ts` — validates role (`:114`), ward (`:117`), department (`:142-148`). **Never checks whether the crew member already holds other active tickets.**

`prisma/schema.prisma:368` has `@@index([assignedCrewId])` — an index for lookup, **not** a uniqueness constraint. A dispatcher can assign the same crew member to N tickets; the crew list (`app/api/v1/crew/tickets/route.ts:167`) filters in code, so the crew simply sees all N.

If double-booking is a business rule, it exists nowhere in the codebase. If it is not, the absence should be recorded as a decision rather than left ambiguous.

---

### A.7 The dev store hides all of this — and CI runs on the dev store

This is the most important methodological finding.

`lib/dev-store.ts:1616-1629` — `ticket.update` does a read (`getStore().tickets.get`) then a `set`. Node's single-threaded event loop makes each *individual* operation atomic, and there is no `await` between them, so within one `update()` call the pair is effectively atomic. The dev store **hides the read-write gap by accident of the event loop, not by design.**

Two further divergences:

- `lib/dev-store.ts:1617` — `ticket.update` accepts `where: { id }` only, so it **cannot express a compound guard either**. A fix applied only to the Prisma path would not be exercised by CI.
- `lib/dev-store.ts:1641-1653` — `ticketPhoto.create` does `list.push(row)` then `list.sort()` then `set`. The push mutates the array **in place before the sort**, so the sort reorders an array already referenced by the Map. Two interleaved creates can leave the list unsorted relative to `uploadedAt`.

**Consequence:** the CI suite provides **zero coverage** of any of these defects, and would not catch a regression if a fix were applied only to the Prisma path. A grep of `tests/` for `concurren|race|lost update|simultaneous` finds only dev-server compile-race workarounds and the `write-queue` IndexedDB test — nothing that exercises concurrent writes to the same ticket.

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
| **`Ticket`** | **none** | — |
| **`TicketPhoto`** | **none** | — |
| **`TicketTrailEntry`** | **none** | — |
| **`DedupFlag`** | **none** | — |
| **`Session`** | **none** | — |
| **`AuditEntry`** | **none** | — |
| **`OtpCode`** | **none** | — |

The DB layer provides zero protection for any ticket-state race.

---

### A.9 Recommendations

**R1 — Make `transitionTicket` a compare-and-swap.** (fixes scenarios 2 and 3 — the worst failure.)

In `lib/platform/transitions.ts:48-86`, replace the `db.ticket.update` at `:60-68` with a conditional write that fails when the status has moved:

```ts
const { count } = await db.ticket.updateMany({
  where: { id: input.ticketId, status: ticket.status },
  data: { status: input.toStatus, ... },
});
if (count === 0) throw new InvalidTransitionError(ticket.status, input.toStatus);
```

This needs no migration. A stronger variant adds `version Int @default(0)` to `Ticket` and bumps it on every write. Either way:

- Widen `db.ticket.update`'s `where` type in `lib/db-switch.ts` to accept a compound predicate, and add a count-checked `updateMany` to the facade.
- **Implement the same conditional in `lib/dev-store.ts:1616`** so CI actually exercises the new semantics.
- Wrap the status update + trail insert + audit write in a single transaction, so the trail can never disagree with the ticket status.

**R2 — Close the dedup check-then-insert gap.** (scenario 4.)

Two parts. First, run `checkDedup` and `db.ticket.create` inside one transaction at `Serializable` isolation, or take a `pg_advisory_xact_lock` keyed on `(cityId, categoryId, rounded lat/lng)`. Second, add a DB-level backstop: a `dedupKey String?` column holding a hash of `(cityId, categoryId, round(lat,5), round(lng,5))` with `@@unique([cityId, dedupKey])`. That turns the 50 m radius rule into a coarse grid-key constraint the DB enforces unconditionally. The precise Haversine scan stays for finding the *best* match.

**R3 — Version-guard the other ticket-field writes.** (scenarios 1 and 5.)

Adopt the `version` column from R1 and require callers to pass the version they read. In `lib/dispatcher/assign-crew.ts:152-155` and the three writes in `app/api/v1/dispatcher/tickets/[id]/route.ts:171-214`, use `updateMany({ where: { id, version }, ... })` and return **409 conflict** when `count === 0`, so the dispatcher sees *"this ticket changed, reload and try again"* rather than a silent overwrite. Separately, either add an explicit capacity check in `assign-crew.ts` or record "no capacity limit in v1" as a decision.

**R4 — Add a concurrency test suite.** The dev store can reproduce a lost update if the test drives two interleaved `update()` calls without awaiting between the read and the write. Without this, any fix is unverifiable in CI.

---

### A.10 What could not be verified

| Item | Why |
|---|---|
| **The deployed Postgres isolation level** | `lib/db.ts:18-20` constructs `PrismaClient` with no `isolationLevel`, and `DATABASE_URL` is not inspected in the repo, so the connection-string or server default governs. The standard Postgres default is `READ COMMITTED`, under which all of the above failures are real. A non-default server setting could not be ruled out — **but nothing in the codebase requests one** |
| **Actual concurrent behaviour under load** | All findings are derived from source analysis of the read-modify-write sequences, not from a concurrency test. The dev store cannot reproduce a Postgres lost update, so no local reproduction was available |
| **Whether Neon sets a non-default isolation level** | Not inspectable from the repository |

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
| **The accuracy of the `routed`-to-`in_progress` median** | Derived from trail timestamps, which are written after the status update in a separate statement. Under the concurrency defects in Part A, a trail timestamp can postdate a status that was immediately overwritten — so this median is exposed to Part A's defect |

---

## Related documents

- [SECURITY_AUDIT.md](SECURITY_AUDIT.md) — the findings register
- [KNOWN_ISSUES.md](KNOWN_ISSUES.md) — the operational index
- [ARCHITECTURE.md](ARCHITECTURE.md) — the layers these findings sit in
- [PRODUCTION_READINESS_CHECKLIST.md](PRODUCTION_READINESS_CHECKLIST.md) — the go/no-go
