# CityFix — Changelog

All notable changes to CityFix are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [semantic versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

**The OTP attempt limit is now enforced — 2026-11-09**

`lib/auth/otp.ts` has exported `OTP_MAX_ATTEMPTS = 5` since the platform layer was written, and the verify-otp route's own docblock promised *"After 5 within 10 minutes, soft-lock"*. Neither was true. The route incremented the `attempts` column on the `OtpCode` row after a wrong guess and then **never read it back** — the counter was write-only dead state, and `OTP_MAX_ATTEMPTS` had zero references outside its own declaration.

The practical consequence: a 6-digit OTP could be worked through without limit. The per-IP rate limit bounds the *rate* of guesses, not their *number* — an attacker who stays under the rate ceiling could still brute-force a code.

- `app/api/v1/auth/verify-otp/route.ts` — the counter is read back **before** verification; at `OTP_MAX_ATTEMPTS` the code is locked out with `429 too_many_attempts` (and a `Retry-After` header), and **the correct code is refused too** — a lockout that still accepts the right answer is not a lockout. The check happens before the argon2 hash, so a locked-out code is never even verified. The `401` body now carries `attempts` and `remaining` so the client can tell the citizen how many tries are left.
- The counter is **persisted** on the `OtpCode` row, so it survives a process restart — unlike the per-IP limiter, which is in-process and trivially defeated across source IPs or instances.
- The counter is scoped to the **code**, not the account. `send-otp` issues a fresh row with `attempts = 0`, so a citizen who burns their allowance is not locked out permanently — they wait out the 60-second resend cooldown and get a new code with a fresh counter.
- `tests/unit/otp-attempt-limit.test.ts` — **new**, 9 tests. Non-vacuity is proven by mutation: disabling the guard turns exactly the 3 lockout tests red.
- `lib/docs/openapi.ts` + `lib/docs/openapi.json` — the `verify-otp` responses now document the `attempts`/`remaining` fields and the `too_many_attempts` body.

**The WebAuthn step-up ceremony — 2026-11-09**

ADR-007 made the *enforcement* correct but left the *path to satisfaction* missing. `requireWebAuthn` accepts a fresh, unexpired challenge row as the proof — but the only route that could mint one for an already-signed-in admin was `POST /api/auth/webauthn/login`, which is anonymous and email-keyed (it is the login ceremony), and whose sibling `/api/auth/webauthn/assertion` **mints a new session**. So an admin already signed in with a password session and hitting a gated write received a bare `401 webauthn_required` and had exactly one way to satisfy it: log out and back in. For a signed-in admin that is a dead end, not a workflow. ADR-007 recorded this as a known risk.

- `app/api/auth/webauthn/step-up/route.ts` — **new**. The session-authenticated ceremony. It binds the challenge to **the session's own user** (never a client-supplied identifier) and does **not** mint or replace the session — the admin's existing cookie keeps working, and what changes is that the challenge ledger holds a fresh, unexpired row, so the next gated write passes. A challenge belonging to another user is rejected with 403 `webauthn_challenge_owner_mismatch`; without that check a signed-in admin could complete someone else's challenge and have it recorded as their own step-up.
- `lib/auth/webauthn.ts` — `verifyAssertion` split into `verifyAssertionSignature` (all the verification, no session minting) and `verifyAssertion` (the signature check plus session minting plus the `webauthn.assertion` audit row). The login path is unchanged; the step-up path mints nothing.
- `components/AdminWebAuthnStepUp.tsx` — **new**. The browser ceremony. It deliberately does **not** reuse `WebAuthnCeremony`: that component drives the *login* ceremony and mints a session, which is the wrong shape for a step-up.
- `app/admin/tickets/[id]/page.tsx` — a gated write no longer surfaces a bare error code. The transition / reassign handler detects `webauthn_required` or `webauthn_assertion_expired`, stashes the pending write, and opens the step-up panel; a verified assertion retries the write automatically. An admin with no registered credential is pointed at the registration mount point (`AdminSecurityKey`) instead of being asked for a retry.
- `lib/i18n/keys.ts` — 7 new Bangla-first keys for the panel.
- `tests/unit/webauthn-step-up.test.ts` — **new**, 12 tests. The cross-user ownership check is proven non-vacuous: disabling it turns the test red.
- `docs/adr/ADR-007-admin-write-webauthn.md` — the "no ceremony affordance" risk is now **CLOSED**, with the amendment recording what changed and what deliberately did not.

**Refreshed route-spec baselines — 2026-11-08**

- `tests-mockups/baselines/` — **32 PNGs refreshed**, **4 added**. The refresh was produced on `ubuntu-latest` by workflow run `42501672037` and downloaded from its `refreshed-baselines` artifact; the 25 mockup baselines were unchanged, which proves the refresh moved only what was stale. The 4 new files are baselines for `11-dispatcher-detail-light.spec.ts` and `12-dispatcher-dedup-light.spec.ts`, two specs that had **never captured a baseline** and therefore could never have passed.

**The route specs were executed for the first time — 2026-11-08**

The 333 route specs across 33 files had never been run as a suite: the CI pipeline did not include them, and the audit recorded them as *"not executed"*. The first full run produced **61 failures**. All are now closed. What the run exposed:

- `tests/helpers/fixtures.ts` — **new**. The shared fixture helpers, including `resetDevStore()` and the deterministic coordinate-band generator.
- `.github/workflows/regenerate-baselines.yml` — **extended** to cover the route-spec baseline family. It previously handled only the 25 static mockup baselines, which left the route-spec PNGs with no supported refresh path. A `scope` input (`all` | `mockups` | `route-specs`) selects the family; the route-spec branch runs `npx playwright test --update-snapshots` against a live dev server with the dev-store env vars.
- `scripts/run-specs-in-container.sh` — **new**. Runs the route specs in a Linux container, the closest local approximation of CI's rasterisation.
- `prisma/schema.prisma` — `binaryTargets = ["native", "debian-openssl-3.0.x"]`. `native` alone resolves to the platform the client was *generated* on, so a `node_modules` produced on Windows fails on Linux with *"could not locate the Query Engine for runtime debian-openssl-3.0.x"*. One `prisma generate` now emits both engines.

**The crew capacity rule — 2026-11-08**

- `lib/dispatcher/crew-capacity.ts` — **new**. The 5-active-ticket limit in one place, with the counting functions the picker and the assign service both read.
- `tests/unit/dispatcher/crew-capacity.test.ts` — **new**, 14 tests against the real dev store.

**Audit deliverables — 2026-11-08**

Ten documents created in `docs/`. All are new files; no source code was changed.

- `docs/PROJECT_AUDIT.md` — the entry point. Project identity, the product thesis, personas, history (135 commits), what exists, verification status, health assessment, governance, what is not built yet, and the three decisions that matter most.
- `docs/PRODUCTION_READINESS_CHECKLIST.md` — the master go/no-go. **172 items across 12 stages**, each PASS / FAIL / NOT VERIFIED / NOT APPLICABLE with evidence. Carries the mandated Final Report Format: 44% overall, 76 passed, 67 failed, 28 not verified, 1 not applicable; 4 Critical / 5 High / 13 Medium / 9 Low issues; the security, performance and deployment assessments; the sixteen remaining blockers; and the explicit list of items that could not be verified and why.
- `docs/SECURITY_AUDIT.md` — 17 findings (4 Critical, 4 High, 5 Medium, 4 Low) with file:line evidence, the auth and authorisation contract, and the remediation order. Verdict: not production-ready.
- `docs/API_DOCUMENTATION.md` — all **77** operations across 62 route handlers, with the guard contract table, the error-code table, per-endpoint request/response schemas, the five documented API inconsistencies, and the two phantom operations found in the spec.
- `docs/ARCHITECTURE.md` — the layers, the `lib/` map, the data model, the request lifecycle with the deliberate guard ordering, the dev-store seam, the CI pipeline, and nine known architectural weaknesses.
- `docs/TESTING_REPORT.md` — the suites, the measured coverage and the weakest areas, the platform-specific baseline rule, the CI pipeline and the Node 22 rationale, and ten known testing gaps.
- `docs/DEPLOYMENT_GUIDE.md` — Vercel + Neon hosting, the full environment-variable table including the three that must be unset in production, the production checklist, rollback procedures, monitoring gaps and four operational runbooks.
- `docs/KNOWN_ISSUES.md` — **31** numbered flags with an index table and file:line evidence, plus a "not issues — deliberate design decisions" section so correct behaviour is not re-reported as a bug.
- `docs/CONCURRENCY_AND_ACCOUNTABILITY_AUDIT.md` — the tenth document, added after the plan's two unexamined priorities were investigated. Part A establishes that the codebase has **no concurrency control of any kind** and that all five named scenarios are vulnerable. Part B establishes that no metric uses placeholder data, but that two of the four operational questions are only partially answerable.

### Changed

- `docs/KNOWN_ISSUES.md` — index extended to cross-reference `CONCURRENCY_AND_ACCOUNTABILITY_AUDIT.md`; the concurrency findings are now reachable from the operational index rather than only from the dedicated document. Issue #26 (`docs/running.md` is stale) is marked **resolved**. Issue #31 records the phantom OpenAPI methods.
- `docs/PROJECT_AUDIT.md` — the deliverable table now lists ten documents rather than nine; the "what could not be verified" table carries the concurrency-specific unknowns; the health assessment records the concurrency defect alongside the security findings; the operation count is corrected to 77.
- **`docs/running.md` — rewritten against the real stack.** This was the standing instruction *"update the doc to match the real stack"*, and it was materially wrong on five counts: 40 route handlers vs 61, 249 unit tests vs 1,853, 15 visual baselines vs 25, 19 route specs vs 34, and Node 20 vs the CI-pinned Node 22. The rewrite lists all 62 route files with their methods, all 26 `package.json` scripts with what they actually do, the Node 22 requirement with its reason, the visual-baseline platform rule, and the dev-route gating caveat. It now cross-links the audit deliverables instead of duplicating them.

### Fixed

**The OTP attempt limit was never enforced — 2026-11-09.**

`OTP_MAX_ATTEMPTS` was exported but imported nowhere; the `attempts` column was written on a wrong guess and never read back. The verify-otp route's own docblock promised a 5-attempt lockout that did not exist, so a 6-digit code could be worked through without limit — the per-IP rate limit bounds the *rate* of guesses, not their *number*. The route now reads the counter back before verification and returns `429 too_many_attempts` at the limit, refusing even the correct code once locked out. Full detail under **Added** above; regression test `tests/unit/otp-attempt-limit.test.ts`.

**The rendered clock moved, so no visual baseline could ever hold — 2026-11-08.**

Three defects, each masking the next. The symptom in every case was a visual-baseline failure that "regenerate the baseline" appeared to fix, for exactly as long as nobody looked at it again.

1. **The seed clock was the wall clock.** Every seeded ticket, trail entry and audit row derived its timestamp from `Date.now()`, so a screenshot taken now could never match one captured earlier. `lib/format/clock.ts` — **new** — is the shared pinned clock: `CITYFIX_SEED_NOW` freezes the epoch, `nowMs()`/`nowIso()` read it, `todayInProductZone()` reads the calendar day in `Asia/Dhaka`, and `slotInProductZone()` builds a Dhaka wall-clock slot. A malformed pin **warns loudly** rather than silently falling back, because a silently-live clock looks pinned and is not.

2. **The rendered timezone was the runtime's, not the product's.** `toLocaleString` resolves the timezone from the runtime, so the same instant rendered six hours apart on a Dhaka server than on a UTC one. `lib/format/datetime.ts` now pins the **timezone** as well as the locale — a **product** fix, not a test fix: a ticket filed at 15:00 in Dhaka must show 15:00 to a Dhaka resident. Four surfaces each carried their own copy of a formatter; they now share one.

3. **The pin never reached the browser.** `process.env` is server-only, so the client bundle fell back to the wall clock while the server read the pinned one. The `/home` trend chart rendered its axis **three days apart** on the two sides and React failed the hydration — *"Text content did not match. Server: ৩১ অক্টো ৩ নভে, Client: ১ নভে"*. The clock now reads `NEXT_PUBLIC_CITYFIX_SEED_NOW` first, because `NEXT_PUBLIC_` values are inlined into the client bundle at build time and both sides therefore read the same literal.

Also: the dev store, the admin query windows and the chart axes all read the pinned clock (the window decides **which rows appear**, so it matters as much as the row timestamps); `updatedAt` is now strictly monotonic rather than merely "now", because under a frozen clock a same-millisecond update would have made the change invisible; and five unit tests that measured a window against `Date.now()` now measure against the same clock the code reads.

**Proof that the baselines are now stable, not merely current.** Re-running the baseline-regeneration workflow on `ubuntu-latest` (run `42517872827`) produced **63 PNGs byte-identical** to the committed baselines — every one of them. A refresh that reproduces the committed files exactly is a stronger claim than "the baselines were refreshed": it means the visual regression suite is now *reproducible*, so a future failure is a real regression rather than ambient drift. The two PNGs that had failed in the Linux container were failing against a **stale committed copy**, because the archive that run used was built before the pinned-clock refresh landed.

**The route specs are green on the platform that asserts the baselines.** CI run `42562594543` — every one of its 14 steps green — reports **326 passed / 0 failed / 7 skipped** across 34 files / 358 specs, with the unit suite at **112 files / 1,978 tests** and the mockup family at **25/25**. This is the authoritative measurement: `ubuntu-latest` is where the visual baselines are asserted, so a Windows run cannot stand in for it.

**The slow-motion demo could not run headless — 2026-11-08.**

`tests/22-slow-motion-e2e-demo.spec.ts` hardcoded `headless: false` in its `test.use` override. A headed Chromium needs an X server, and a GitHub runner has none, so the spec died with *"Missing X server or $DISPLAY"*. Because it is the last spec in the 358-test sweep, it failed the baseline-regeneration workflow and took the whole regenerated-baseline upload down with it — 350 regenerated PNGs discarded on the runner's disk.

The file's own docblock already promised the opposite (*"Headed mode is opt-in ... the test stays headless-compatible"*) and documented `PWTEST_HEADLESS=0` as the switch, but the env var was never read. Headed mode is now genuinely opt-in; the `--start-fullscreen` / `--kiosk` flags are dropped in headless mode, where they mean nothing. The workflow's baseline upload is now `if: always()`, so one failing spec can never again discard the refreshed PNGs.

**The 61 route-spec failures — 2026-11-08.** The first execution of the route-spec suite. Every failure was triaged; two were **product defects**, two were **test-infrastructure gaps**, and two were **stale assertions**.

*Product defects:*

- **`lib/serializers/ticket.ts`** — `serializeTicketForRole` dropped `closeReason` and `duplicateOfId` for **every** role, so DISP-006's documented dedup-confirm contract (`closeReason: 'duplicate'`, `duplicateOfId: <original>`) could not be asserted at all. Both are now exposed on the **staff branch only** — they are workflow state, not citizen PII, and there is no citizen surface for a duplicate closure yet.
- **`app/globals.css`** — the citizen compact header stripped the **top-bar Report CTA**, which WO-001 lists as a required acceptance item and the 1.6 Home spec mandates at every viewport. The rule was authored for the staff workspace but written against `data-compact` alone, and the citizen routes are compact too. It is now scoped to `[data-role="staff"]`. The same commit themes MapLibre's control chrome under `.theme-dark`, which rendered near-white boxes on the dark surface and failed the dark-theme gate.

*Test-infrastructure gaps:*

- **`lib/dev-store.ts`** — the dev store seeded **only `ward_14`**, so the dispatcher's out-of-scope path (404, not 403) was unreachable: `POST /api/tickets` rejects an unknown ward with 400 `ward_not_in_city`. `ward_15` is now seeded.
- **`tests/helpers/fixtures.ts`** — the dev store is **one in-memory DB that lives for the dev-server process**, not for a Playwright run. Coordinate bands separate spec *files* from each other but not two *runs* of the same file, so a second run hit the first run's 50 m dedup radius and got a 200 `dedup_match` instead of a 201. `resetDevStore()` is now available and wired into every spec that asserts exact counts (`11`, `12`, `18`, `19`, `21`).

*Stale assertions:*

- `tests/24-feed-photo-thumbnail.spec.ts` used a random ±0.002° jitter (~222 m) against a **50 m** dedup radius — roughly a 20% spurious `dedup_match` chance per run. Now uses the deterministic band generator.
- `tests/19-admin-tickets-light.spec.ts` asserted 5 seed tickets and 2 streetlight tickets where the seed carries **10** and **6**. Corrected, with the id lists.
- `tests/21-dispatcher-crew-picker.spec.ts` expected the full ward roster where the picker has always been **department-scoped** — Karim is in `dept_roads` and the ticket is a streetlight report, so he is correctly not offered.
- `tests/11-dispatcher-detail-light.spec.ts` posted a crew session to the **dispatcher** transition route, which is `requireRole('dispatcher')` — the crew route owns `routed → in_progress`. The helper now routes, assigns the crew, then transitions via `/api/v1/crew/tickets/[id]/transition`.

*Also fixed:*

- `tests/02-live-audit.spec.ts` asserted the old teal dark-mode primary (`rgb(20, 184, 166)`); the 2026-11-04 shell rebuild moved it to the blue ramp (`rgb(96, 165, 250)`).
- `tests/09-dispatcher-auth.spec.ts` asserted a relative `Location` header; `NextResponse.redirect()` requires an absolute URL, so the assertion now reads the pathname.
- `app/page.tsx` — `?landing=1` forces the real public landing in dev-store mode. The dev demo page shadowed it, and the landing's "Log in" CTA is load-bearing for `tests/31-post-auth-target`.

**The concurrent ticket-field writes — 2026-11-08, after the audit was delivered.**

The compare-and-swap below closed the *transition* path. The same read-modify-write shape survived in every other ticket-field write, and the audit recorded it as scenario 1: two dispatchers assigning the same ticket both read `assignedCrewId = crew_1`, both passed the scope checks, and both wrote — the second silently clobbering the first. The audit trail compounded it: A's row recorded `crew_1 → crew_2` and B's row recorded `crew_1 → crew_3`, so the log showed two plausible writes and **no indication that one was lost** — precisely the question the audit trail exists to answer.

Every non-status ticket write now uses the **count-checked `updateWhere`**, guarded on the version the caller read:

- **`lib/platform/concurrency.ts`** — **new**. `ConcurrentWriteError` joins `ConcurrentTransitionError` (moved here from `transitions.ts`). Two errors, not one, because the client's next action differs: re-read and re-decide the *status*, versus re-read and re-apply the *field*. Both are 409 — the request was legal when it was read, and the ticket is not in an illegal state.
- **`lib/dispatcher/assign-crew.ts`** — the assignment write is now a compare-and-swap on `version`. A count of zero raises `ConcurrentWriteError`; the route returns **409** with the error code `concurrent_write`.
- **`app/api/v1/dispatcher/tickets/[id]/route.ts`** — the three field writes (ward, category, internal note) are each guarded. A single PATCH can change all three, so each write bumps the expected version by one and guards against the version the previous write produced — a concurrent writer landing between two of them is caught, not half-applied.
- **`lib/citizen/feedback.ts`** — the rating write is guarded; a lost race returns `concurrent_write` (409) instead of clobbering the rating.
- **`app/api/v1/dispatcher/dedup-flags/[id]/{confirm,dismiss}/route.ts`** — these change the ticket's **status**, so they are guarded on `(status, version)` and report `concurrent_transition`, matching the transition path's contract.
- **`tests/unit/writes-concurrency.test.ts`** — **new**, 10 tests. Drives two concurrent assignments against the **real** dev store and asserts exactly one winner, that the loser writes no audit row, that the version advanced by exactly one, and that a version-guarded write invalidates an in-flight transition.

The test was **verified non-vacuous**: neutering the compare-and-swap turns **4 of the 10** new assertions red — and 9 of the transition assertions with it, 13 in total.

**The duplicate-submission race — 2026-11-08, after the audit was delivered.**

The last fixable concurrency scenario. The citizen submit path was a **check-then-insert** with nothing connecting the two statements:

```ts
dup = await checkDedup({ ... });                    // READ
if (dup) { ... return 200 dedup_match; }
const created = await db.ticket.create({ ... });    // WRITE
```

Two citizens filing the same pothole at the same coordinate at the same instant both ran the READ before either ticket existed. Both scans returned zero candidates. Both proceeded to the WRITE, and **two identical tickets were created** — both `status='submitted'`, both at the same coordinates, both claiming the same work. The database could not prevent it: `Ticket` had **no unique constraint of any kind**.

- **`prisma/schema.prisma` + `prisma/migrations/20261108140000_ticket_dedup_key/`** — `Ticket.dedupKey String?` carrying `@@unique([cityId, dedupKey])`. The migration is additive (new nullable column + new index; no existing row is touched).
- **`lib/platform/dedup.ts`** — `computeDedupKey` (a SHA-256 digest of `(cityId, categoryId, lat, lng)`), `isDedupConflict` (recognises Postgres SQLSTATE `23505` on the dedup constraint) and `freesDedupKey` (the statuses that release the key).
- **`app/api/tickets/route.ts`** — the submit path computes the key, and when the database refuses the insert the loser re-runs `checkDedup` and is returned the **same `dedup_match` prompt** the citizen would have received had the winner committed first. A refusal the recovery scan cannot resolve returns **409 `dedup_conflict_unresolved`** rather than inventing a second ticket.
- **`lib/platform/transitions.ts`** — the key is **released** when a ticket leaves the open statuses, so a resolved spot can be reported again.
- **`lib/dev-store.ts`** — `devDb.ticket.create` enforces the unique index with Postgres's exact semantics (NULLs distinct, scope `(cityId, dedupKey)`, SQLSTATE `23505` with the constraint named). Without this the CI suite would pass while production refused the insert.
- **`tests/unit/dedup-concurrency.test.ts`** — **new**, 18 tests. **`tests/unit/dedup-route-race.test.ts`** — **new**, 6 tests, covering the submit path's recovery against the real dev store.

**Two design decisions that the obvious fix would have got wrong.** The key identifies the **exact** spot, not the 50 m neighbourhood: the radius is a *policy* threshold expressed as a distance, and a radius-keyed unique index would reject a legitimate second report 40 m away (a streetlight next to a pothole). And the key is **nullable**, because PLAT-REQ-004 makes dedup a *prompt*, not a rejection — a report filed after a `dedupDeclineTicketId` must be creatable, so it carries no key, and Postgres treats NULLs in a unique index as distinct.

Both suites were **verified non-vacuous** — neutering the dev store's unique-index check turns 3 of the primitive assertions and 1 of the route assertions red. The migration and the index semantics were additionally validated against **real PostgreSQL 16**: the full migration chain was applied to a throwaway container, and the six relevant behaviours were checked directly in SQL.

**The crew capacity rule — 2026-11-08, after the audit was delivered.**

The last of the five named concurrency scenarios. The audit framed it as an open **product** question — "may a crew member hold N active tickets at once?" — and left it open on the grounds that the answer belonged in a PRD, not a lock.

It was not an open question. **The answer was already written down.** `design-artifacts/C-UX-Scenarios/02-habib-the-handler/2.4-assign-to-crew/2.4-assign-to-crew.md` specifies a crew card showing "Current load — 3 jobs in progress" with a **red badge above 5**, a list **sorted by current load (low first)**, and a **409 "crew just took another job"** on submit. None of it had been implemented: the picker returned `{ id, name }` and nothing else, and the assignment endpoint checked only role, ward and department. So the finding was not an undecided question but an **unimplemented specification**, and implementing it is what closes the audit finding.

- **`lib/dispatcher/crew-capacity.ts`** — **new**. `CREW_CAPACITY_LIMIT = 5`, `countCrewActiveLoad`, `countCrewActiveLoads` and `checkCrewCapacity`. "Active" means `submitted`, `routed` or `in_progress` — the same set `buildCrewLoad` in `lib/dispatcher/monitor.ts` uses for the chart the dispatcher already reads, so the picker and the chart cannot disagree about what "busy" means. The ticket being assigned is **excluded** from its own member's count, so re-assigning a ticket a member already holds does not count it twice.
- **`lib/dispatcher/assign-crew.ts`** — a member at the limit is refused with **409 `crew_at_capacity`** (not 403 — the member is a valid choice, they are simply already carrying their share). The refusal leaves the ticket unassigned and writes **no** audit row.
- **`lib/dispatcher/list-crew-for-ward.ts`** — each entry now carries `activeCount`, `capacityLimit` and `atCapacity`, and the roster sorts **least-loaded first**, then by name so the order is stable. The spec's fuller ordering (specialty → load → distance → last activity) is only partially implementable: distance needs the crew member's last known location and "last activity" is a timestamp the `User` row does not carry.
- **`app/dispatcher/tickets/[id]/page.tsx`** — the `<option>` shows the load (`Karim (0/5)`), an at-capacity option is `disabled`, and the 409 is mapped to localized copy via two new `lib/i18n/keys.ts` entries. The picker is a **hint**; the endpoint is the trust boundary, so a stale picker still cannot produce an over-capacity assignment.
- **`lib/dev-store.ts`** — `ticket.findMany` gained the `assignedCrewId` filter (equality and `{ in: [...] }`), mirroring Prisma's NULL semantics. Without it the load count silently returned zero for every crew member and the picker would have shown "0/5" for everyone — and the CI suite would have exercised none of the rule.
- **`tests/unit/dispatcher/crew-capacity.test.ts`** — **new**, 14 tests. **`tests/unit/dispatcher/assign-crew.test.ts`** — **+5** assertions covering the 409, the no-audit-row refusal, the no-op re-assignment, and capacity being freed by a terminal status.

**Why the race is accepted rather than closed.** A capacity limit is a **counting** rule, not a **uniqueness** rule: the same member legitimately holds many tickets, just not more than N. So no `@@unique` can express it, and the check is a read followed by a write — a check-then-act race in principle. The race is benign and deliberately left open: the worst outcome is that a member transiently holds LIMIT+1 tickets, which the dispatcher can see in the picker and reassign. Closing it would need a serialisable transaction or a row lock taken in the middle of the assignment path — a real cost for a soft business rule. This is the same trade the audit accepted for the dedup path.

The suite was **verified non-vacuous**: neutering `atCapacity` to `false` turns **3 of the 14** assertions red.

**The concurrent-transition lost update — 2026-11-08, after the audit was delivered.**

The concurrency audit's worst finding was that `lib/platform/transitions.ts` was a non-atomic read-modify-write: it validated against a status read and wrote with an id-only predicate, so two dispatchers transitioning the same ticket both passed validation and the second silently overwrote the first. Because the trail insert and the audit write were separate statements, **the citizen-facing status trail could describe a sequence that could not legally have happened** — the platform's central trust surface telling a citizen something untrue.

This is now closed at source, with a CI-enforced regression test.

- **`prisma/schema.prisma` + `prisma/migrations/20261108120000_ticket_version/`** — `Ticket.version Int @default(0)`, an optimistic-lock counter. The migration is additive (new column with a default, no data loss).
- **`lib/platform/transitions.ts`** — the write is now a **compare-and-swap**: the `where` clause carries both the status and the version the call read, so a writer whose read has been overtaken updates **zero rows** instead of clobbering the winner. A count of 0 raises the new `ConcurrentTransitionError`, which is deliberately distinct from `InvalidTransitionError` — the edge was legal, the race was lost, so the client is told to *re-read* rather than that the ticket is in an illegal state.
- **`lib/platform/transaction.ts`** — **new**. The status update, the trail insert and the audit write now run inside one transaction. On the Prisma path that is `prisma.$transaction`; on the dev-store path it is a snapshot-and-restore, which gives the same observable guarantee (all three writes land, or none do).
- **`lib/platform/audit.ts`** — `writeAudit(input, target?)` takes an optional write handle so the audit row can commit with the change it describes. Without this the audit write escaped the transaction, defeating its stated purpose.
- **`lib/db-switch.ts`** — `db.ticket.updateWhere` (a count-checked, compound-predicate write) and `db.ticket.bumpVersion` added to the facade.
- **`lib/dev-store.ts`** — `devDb.ticket.updateWhere` implements the **same** compound guard and returns the same affected-row count, so CI exercises the real guard instead of passing while production silently lost updates.
- **The non-status write paths now bump the version:** crew assignment (`lib/dispatcher/assign-crew.ts`), citizen feedback (`lib/citizen/feedback.ts`), dedup confirm/dismiss, dispatcher ward/category/note edits, and the citizen crew reassignment. A transition that read a ticket before one of those edits now loses its compare-and-swap instead of silently reverting the edit. *(Superseded later the same day: these paths now use a full compare-and-swap rather than a bare bump — see "The concurrent ticket-field writes" above.)*
- **All three transition routes** (`/api/tickets/{id}/transition`, `/api/v1/crew/tickets/{id}/transition`, `/api/v1/dispatcher/tickets/{id}/transition`) handle `ConcurrentTransitionError` with **409** and a `concurrent_transition` body.
- **`tests/unit/transitions-concurrency.test.ts`** — **new**, 13 tests. Drives two and three concurrent transitions against the **real** dev store (not a mock — a mock would prove nothing about the parity claim) and asserts exactly one winner, that the loser writes no trail row, and that the trail, the status and the version agree.
- **`tests/unit/platform/transaction.test.ts`** — **new**, 16 tests. Covers the dev-store commit/rollback paths and the Prisma facade's routing of `updateWhere`, `bumpVersion`, `trail.create` and `audit.create` to the **transaction-scoped** client rather than the root one.
- **`tests/unit/transitions.test.ts`** — updated for the compare-and-swap write shape, plus four new concurrency-guard assertions.

Two subtleties the implementation had to get right, both caught by the new tests rather than by inspection:

1. **`writeAudit` bypassed the transaction.** It wrote through the module-level `db`, so on the Prisma path the audit row would have committed even if the transition rolled back.
2. **The dev store's rollback erased the winner's rows.** The first version of the helper restored the trail collection wholesale (`store.trail.length = 0; push(...snapshot)`) — correct for one writer, but with two concurrent writers the loser's rollback deleted the winner's trail row, manufacturing exactly the corruption the transaction was introduced to prevent. The helper now records the ids of the rows *its own callback* appended and removes only those.

The concurrency test was **verified non-vacuous**: neutering the compare-and-swap (forcing the affected-row count to 1) turns **7 of the 13** assertions red; restoring it turns them green.

**The phantom OpenAPI methods — 2026-11-08, after the audit was delivered.**

The audit's one code-level finding was `PATCH /api/tickets/{id}` and `DELETE /api/tickets/{id}` documented in the spec but never implemented (`app/api/tickets/[id]/route.ts` exports only `GET`). The audit *documented* it rather than fixing it, because deleting the spec blocks or implementing two endpoints is a product decision. That decision has now been taken — **delete the blocks** — and the defect is closed at source rather than only in prose.

- `lib/docs/openapi.ts` — the `patch` (`operationId: updateTicket`) and `delete` (`operationId: deleteTicket`) blocks removed from `/api/tickets/{id}`, replaced by a comment explaining what was removed and why. The module header gained accuracy rule #4, which states that rule #1 is now *enforced* rather than merely asserted.
- `lib/docs/openapi.json` — regenerated (`npm run docs:generate`): 53 paths / 68 operations, down from 70.
- `tests/unit/docs/openapi-route-parity.test.ts` — **new**. Reads every `app/api/**/route.ts` from disk, extracts its exported HTTP methods, and compares them against `openapiPaths` in **both** directions. A documented operation with no handler fails; a handler with no documented operation fails. The two excluded route groups (`/api/dev/**`, `/api/docs/**`) are declared in the test with their reasons, and the test asserts the exclusion list is exactly those eight paths so a third silent exclusion cannot appear.

The test was **verified non-vacuous**: renaming a live `PATCH` export to `PATCHX` turned the suite red with `PATCH /api/v1/dispatcher/tickets/{id} — documented but no handler exports it`; restoring the file turned it green. Without that check, a parity test that passes for the wrong reason is worse than no parity test.

Two checklist rows moved to ✅ as a result (6.1 and 6.13), and the checklist's figures were **re-measured** rather than adjusted by hand: 172 items / 76 passed / 67 failed / 28 not verified / 1 not applicable = 44%. Low-severity findings drop 10 → 9; total open issues 32 → 31.

---

## Prior work — context for the audit

The audit was commissioned against a codebase whose most recent ten commits told one story: *CI was red on every run from 2026-10-29, and the red was hiding the other gates.*

| Commit | Change |
|---|---|
| `45062d1` | `fix(ci): unblock CI — lazy production DB guard and lint cleanup` |
| `8e2289c` | `fix(ci): pin Node 22 so the unit suite stops dying at import time` |
| `ed739d7` | `fix(auth): gate the shared transition route behind ADR-007` |
| `b14ea27` | `ci: upload mockup diff artifacts on failure` |
| `f4dc984` | `ci: add a workflow to regenerate mockup baselines on the CI platform` |
| `e32147e` | `test(visual): regenerate the mockup baselines on the CI platform` |
| `be9f2b0` | `docs(visual): explain that the baselines are platform-specific` |

The Node 22 pin is the keystone. `jsdom@30` → `undici@8` requires `engines.node >= 22.19.0`; on Node 20 the Zstd constant it reaches for is `undefined` and the module throws at import time. The dev machine runs Node 24, so the suite was green locally while CI died with 16 unhandled errors. Because the unit step ran *before* the coverage floor and the visual gate, **both of those had been silently skipped for a month.** CI run `42471075111` on `e32147e` concluded success — all 12 steps green.

Two code-level remediations exist in the codebase as of `be9f2b0`:

- **The lazy production DB guard** (`lib/platform/db-guard.ts`) — refuses a loopback `DATABASE_URL` under `NODE_ENV=production`. Handles both URL and libpq connection-string forms, covers `127.0.0.0/8`, and latches only on success so a failed check keeps throwing. 100% line coverage.
- **ADR-007 enforcement on the shared transition route** (`app/api/tickets/[id]/transition/route.ts`) — the ceremony is applied *after* the ticket load and scope checks, exactly as the ADR specifies.

---

## The audit's headline findings

Recorded here so the changelog is useful on its own. Full evidence is in the linked documents.

### Critical — configuration-reachable, not theoretical

| Finding | Evidence |
|---|---|
| `dev_code` is returned in the OTP response **in every environment**, and `OTP_PROVIDER` defaults to `stub` | `app/api/v1/auth/send-otp/route.ts:164`; `lib/auth/otp-provider/index.ts:31` |
| ~~The OTP attempt limit is **never enforced** — `attempts` is incremented and never read; `OTP_MAX_ATTEMPTS` is imported nowhere~~ — **closed 2026-11-09** | `app/api/v1/auth/verify-otp/route.ts`; `lib/auth/otp.ts:32` |
| Four `/api/dev/*` routes are gated on `CITYFIX_DEV_PROMOTE_SECRET` only, with no `isDevStore()` check | `app/api/dev/{bootstrap-admin,issue-session,list-users,promote-admin}/route.ts` |
| `bootstrap-admin` and `issue-session` mint **admin sessions**, bypassing both the password and WebAuthn | `app/api/dev/bootstrap-admin/route.ts:115-146`; `app/api/dev/issue-session/route.ts:70-76` |

### High — the structural cause

| Finding | Evidence |
|---|---|
| `PUT /api/profile` is an ungated admin write — no `requireRole`, no `requireWebAuthn`, no Zod | `app/api/profile/route.ts:26-59` |
| WebAuthn challenges are **never consumed** — one ceremony authorises every admin write for 5 minutes | `lib/auth/guards.ts:113-125` |
| 12 admin city-scoped routes skip the city check while `/api/v1/admin/tickets/[id]` enforces it. **Needs ADR-006**, which is missing from `docs/adr/` | `app/api/v1/admin/cities/[id]/**` |
| Password login is not role-restricted | `app/api/v1/auth/login/route.ts:137-139` |
| **There is no concurrency control of any kind** — zero `$transaction`, no `version` column, no `@@unique` on `Ticket`, no compound guard expressible through the DB facade | [CONCURRENCY_AND_ACCOUNTABILITY_AUDIT.md](CONCURRENCY_AND_ACCOUNTABILITY_AUDIT.md) |

### The concurrency finding, in one paragraph

`lib/platform/transitions.ts:48-86` validates a transition against a status read at line 49 and writes it with an id-only predicate at line 60. Two dispatchers transitioning the same ticket therefore **both** pass validation, and the second silently overwrites the first. The trail insert (line 70) and the audit write (line 79) are separate statements, so the status trail can record a sequence that could not legally have happened — for instance a ticket that ended `cancelled` carrying a row claiming `in_progress`. The status trail is the citizen-facing trust surface for the entire platform. This is the most consequential defect found.

### Low — the OpenAPI spec documents two methods that do not exist — ✅ FIXED 2026-11-08

`lib/docs/openapi.ts` described `PATCH /api/tickets/{id}` and `DELETE /api/tickets/{id}`. `app/api/tickets/[id]/route.ts` exports exactly one handler — `GET` at line 17. Nothing called the phantom endpoints, so no client broke, but the Swagger UI at `/api/docs` told a developer that a citizen could edit or delete their own report, and the endpoint returns 405.

This violated the spec module's own accuracy rule #1 (*"Where a route's own docblock disagrees with its code, THE CODE WINS"*), and `tsc --noEmit` cannot catch it — the type checker validates that a component reference is well-formed, not that a documented method has a handler behind it.

**How it was found:** reconciling all 62 route files' exported method names against `openapiPaths` produced exactly one mismatch. The same reconciliation corrected this audit's own operation count from 80 to **77**.

**Fixed:** both spec blocks were deleted, `lib/docs/openapi.json` was regenerated, and `tests/unit/docs/openapi-route-parity.test.ts` now compares the spec against the route files mechanically on every unit run — so the two can no longer drift apart. See the "Fixed" section above.

### What the audit did *not* find- **No placeholder data in any production metric path.** A repo-wide grep for `Math.random`, `mock`, `placeholder`, `sample`, `demo`, `dummy` and `hardcod` across `app/dispatcher`, `app/admin`, `lib/dispatcher` and `lib/admin` returned no hits in any metric path. 25 of the 27 audited metrics trace directly to real DB columns.
- **The PII boundary holds.** The citizen serializer strips `internalNote`, `assignedCrewId` and `reporterName`, anonymises trail actors, and the public serializer strips `locationLabel`.
- **The audit trail is genuinely immutable.** No code path updates or deletes an `AuditEntry`.
- **The layering is real.** No raw SQL or direct Prisma in any route handler; the service layer holds the logic and the route handlers are thin adapters.

---

## Recommended remediation order

Derived from [PRODUCTION_READINESS_CHECKLIST.md](PRODUCTION_READINESS_CHECKLIST.md).

**Before any production traffic**

1. Gate the four `/api/dev/*` routes on `isDevStore()` — four lines; deletes the largest hole.
2. Guard `dev_code` on `NODE_ENV !== 'production' && OTP_PROVIDER === 'stub'`; default `OTP_PROVIDER` to `twilio` in production.
3. Read `attempts`; return 429 at the limit and lock the row. This also makes the route's own docstring true.
4. Add a production guard on `CITYFIX_DEV_STORE` — one guard closes the whole class.
5. Verify the four dangerous env vars in the deployed environment.

**Next — correctness**

6. Make `transitionTicket` a compare-and-swap, wrap the status update + trail + audit in one transaction, widen the DB facade's `where` type, **and implement the same semantics in the dev store so CI exercises them.**
7. Gate `PUT /api/profile` on role and, for admins, WebAuthn.
8. Consume the WebAuthn challenge on use.
9. Resolve ADR-006 and apply the answer to the 12 city-scoped routes.

**Then — operational truth**

10. Add the four missing `Ticket` timestamps and backfill from the trail.
11. Consult `SlaPolicy` and correct its false schema comment.
12. Stop collapsing `null` to `0` in the adoption metrics.

---

## Related documents

- [PROJECT_AUDIT.md](PROJECT_AUDIT.md) — the entry point
- [PRODUCTION_READINESS_CHECKLIST.md](PRODUCTION_READINESS_CHECKLIST.md) — the go/no-go
- [SECURITY_AUDIT.md](SECURITY_AUDIT.md) — the findings register
- [KNOWN_ISSUES.md](KNOWN_ISSUES.md) — the 31 flags
- [CONCURRENCY_AND_ACCOUNTABILITY_AUDIT.md](CONCURRENCY_AND_ACCOUNTABILITY_AUDIT.md) — the concurrency and accountability evidence
- [ARCHITECTURE.md](ARCHITECTURE.md) — the layers
- [API_DOCUMENTATION.md](API_DOCUMENTATION.md) — all 77 operations
- [TESTING_REPORT.md](TESTING_REPORT.md) — the suites and the gaps
- [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) — hosting and runbooks
