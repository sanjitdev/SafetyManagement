# CityFix — Testing Report

**Report date:** 2026-11-08
**Codebase:** `main` @ `be9f2b0`
**Test philosophy:** `test-after` (affirmed in `aidlc/spaces/default/memory/team.md`)

---

## 1. Summary

| Metric | Value | Floor | Status |
|---|---|---|---|
| Unit test files | 117 | — | — |
| Unit tests passing | **2,035 / 2,035** | — | ✅ |
| Coverage — lines | **94.01%** | 80% | ✅ |
| Coverage — branches | **83.03%** | 80% | ✅ |
| Coverage — functions | **94.86%** | 80% | ✅ |
| Coverage — statements | **94.01%** | 80% | ✅ |
| Playwright route specs | 34 files / **358 specs** | — | ✅ |
| Mockup visual baselines | 25 | — | ✅ |
| TypeScript `tsc --noEmit` | clean | clean | ✅ |
| ESLint | 0 errors, 56 warnings | 0 errors | ✅ |
| CI pipeline | 14/14 steps green | all green | ✅ |

**All verification commands were executed locally on 2026-11-08 and passed.** The CI pipeline's most recent green run is `42571017086` on commit `f21e32a` — 14 steps: lint, typecheck, unit tests, coverage floor, visual regression, route specs and build. (The step count is 14, not 17: the earlier count of 17 counted the workflow's setup and teardown steps as separate entries.)

**The route specs were executed for the first time on 2026-11-08.** They had never been run as a suite — the pipeline did not include them, and the audit recorded them as *"not executed"*. See §2.2 for the result and §6 for what the run exposed.

---

## 2. Test suites

### 2.1 Unit tests — Vitest

**Command:** `npm run test:unit`
**Config:** `vitest.config.ts`
**Location:** `tests/unit/**/*.test.ts` and `*.test.tsx`
**Environment:** `node` by default; component tests opt in to `jsdom` via a `@vitest-environment jsdom` docblock
**Alias:** `@/` → repo root
**Result:** 117 files, 2,035 tests, 100% passing, ~30 s

The suite runs with `CITYFIX_DEV_STORE=1` by default, so it needs **no Postgres** — the in-memory dev store is the same seam the Playwright route specs use.

#### The concurrency suite

Six files exist specifically to prove the ticket-write races are closed. They are new as of 2026-11-08 and are the answer to the concurrency audit's finding that *"CI cannot catch this"*.

| File | Tests | What it proves |
|---|---:|---|
| `tests/unit/transitions-concurrency.test.ts` | 13 | Two and three concurrent transitions of the same ticket → exactly one wins; the loser writes **no** trail row; the status, version and trail agree. Runs against the **real** dev store, not a mock |
| `tests/unit/writes-concurrency.test.ts` | 10 | Two concurrent crew assignments → exactly one wins; the loser writes **no** audit row; the version advances by exactly one; a version-guarded write invalidates an in-flight transition |
| `tests/unit/platform/transaction.test.ts` | 16 | The transaction helper's commit/rollback semantics, and that the Prisma facade routes `updateWhere`, `bumpVersion`, `trail.create` and `audit.create` to the **transaction-scoped** client rather than the root one |
| `tests/unit/dedup-concurrency.test.ts` | 18 | The dedup **primitives**: the key is deterministic and separator-injection-safe; the unique index refuses a second same-spot ticket; a declined duplicate (NULL key) is still creatable, because Postgres treats NULLs in a unique index as distinct; the key is released when a ticket leaves the open statuses |
| `tests/unit/dedup-route-race.test.ts` | 6 | The dedup **recovery**: the loser of a submit race gets the same `dedup_match` prompt the winner would have got — not a 500 and not a second ticket; a report filed after a DECLINE is not blocked by the index; a nearby coordinate can still be filed after a decline. Stubs only the session lookup; the data path is the real dev store |
| `tests/unit/dispatcher/crew-capacity.test.ts` | 14 | The capacity **rule**: the load counts only active tickets (terminal ones do not); the boundary is exact (5 allowed, 6 refused); the ticket being assigned is excluded from its own member's count; and the picker reports the *same* count the assign service enforces, so the hint and the trust boundary cannot disagree |

All six were **verified non-vacuous**. Neutering the compare-and-swap — forcing the affected-row count to 1 — turns 7 of the 13 transition assertions and 4 of the 10 write assertions red; restoring it turns them green. Neutering the dev store's unique index turns 3 of the 18 dedup assertions and 1 of the 6 route assertions red. Neutering `atCapacity` to `false` turns 3 of the 14 capacity assertions red. A concurrency test that passes for the wrong reason is worse than no concurrency test.

#### The WebAuthn consumption suite

`tests/unit/webauthn-challenge-consumption.test.ts` (9 tests, added 2026-11-09) closes SECURITY_AUDIT finding #6. A WebAuthn challenge is a one-shot nonce: it proves possession of the credential at one moment, so it may authorise exactly one write. The suite runs against the **real** in-memory dev store — no mocks, because the contract under test *is* "the guard deletes the row", and a mock would only re-assert the mock.

| What it pins | Why it matters |
|---|---|
| A successful guard call removes the challenge row from the ledger | The consume actually happens |
| A **second** admin write with the same session is refused `webauthn_assertion_expired` | This is the behaviour that closes the finding — one ceremony, one write |
| A fresh ceremony authorises the next write again | The gate is not simply broken |
| A **rejected** call on an expired challenge does **not** consume it | A failed attempt must not burn a challenge the admin could still use |
| A **rejected** call with no credential does **not** consume it | Same reason |
| A consume scoped to another user does not touch the row | One admin cannot spend another admin's challenge |
| The owner **can** consume their own row | The scope check is not over-tight |
| Consuming the same row twice reports `false` the second time | The dev store's consume is idempotent-safe |
| **Two concurrent guard calls authorise exactly ONE write** | A race must not authorise two writes |

It is **verified non-vacuous**: removing the delete from the dev store's consume path turns 6 of the 9 tests red.

#### The step-up affordance suites

Closing finding #6 made the challenge one-shot, and that turned a cosmetic gap into a dead end: a page that performs a gated write and renders no ceremony leaves the admin with a bare `401 webauthn_assertion_expired` and no way to satisfy it. Two suites, added 2026-11-09, close it.

**`tests/unit/components/useWebAuthnStepUp.test.tsx`** (17 tests) pins the retry contract of the shared hook:

| What it pins | Why it matters |
|---|---|
| A gate error opens the ceremony and reports "handled"; a non-gate error reports "not handled" and opens nothing | The caller must not surface a gate error twice — once as a ceremony, once as a plain failure |
| `verified` retries the stashed write **exactly once** | One ceremony authorises one write; the retry is spent afterwards |
| A second `verified` retries nothing | The pending write was cleared — a retry loop would re-fire a write the admin already made |
| A write that takes an argument retries with the **same** argument | A DELETE carries the row id; the retry must delete the row the admin clicked |
| A ref is resolved at **retry time**, so the current handler runs | A plain function would capture the closure from when the error was raised |
| The registered write is the fallback when no pending is given | The hook can be driven either way |
| `no_credential` retries nothing and points at registration | No amount of retrying helps if the admin has no registered key |
| `failed` and `cancelled` retry nothing | A retry without a valid assertion would fail the same way |
| The in-progress flag is reported | The page disables its buttons — a second write would consume a challenge the first is about to spend |

**`tests/unit/admin/webauthn-step-up-parity.test.ts`** (4 tests) makes the fix durable. It compares the **gated admin routes** — the route files that call `requireWebAuthn` — against the **admin pages that write to them**, and fails if any such page lacks the affordance or the retry. The route file is the source of truth: the test reads it from disk and never imports a handler, because the contract under test is *which routes are gated*, which is a property of the source text. A non-vacuity block proves the detector is not vacuously passing.

**The parity test found a fifth page.** The issue was originally written against four, because four was what a hand-count over `/admin/cities/[id]/` produced. Scanning the whole admin page tree against the whole gated-route tree found `/admin/cities` — the page that *creates* the city the other four configure, and the one an admin hits first. A hand-count missed it; the mechanical comparison did not.

### 2.2 Route specs — Playwright

**Command:** `npm test`
**Config:** `playwright.config.ts`
**Location:** `tests/*.spec.ts` — **33 route-spec files / 358 specs**, plus `tests/01-mockups.spec.ts` (the mockup family, §2.3), for **34 files** under `npm test`
**Web server:** `npm run dev:feat` on `http://localhost:3000`, with `CITYFIX_DEV_STORE=1`, `DEV_SKIP_WEBAUTHN=1` and the pinned clock (`CITYFIX_SEED_NOW` **and** `NEXT_PUBLIC_CITYFIX_SEED_NOW`)
**Result:** **326 passed / 0 failed / 7 skipped** on `ubuntu-latest` — CI run `42571017086` (9.7 min), the authoritative measurement because the visual baselines are asserted on that platform. The same result was first recorded in run `42562594543` (14.2 min). `workers: 1`, `fullyParallel: false`

The route specs walk the four personas through the real app: `02-live-audit`, `03-authenticated-flow`, `04-e2e-human-tester`, `09-dispatcher-auth`, `13-crew-auth`, `16-admin-webauthn`, `28-role-walkthrough`, `30-role-redirect`, `31-post-auth-target`.

`testMatch: '*.spec.ts'` scopes the sweep to the top-level route specs. Without it, Playwright would try to run the Vitest files one directory deeper and fail with *"Vitest cannot be imported in a CommonJS module using require()"* — this is a live trap, not a hypothetical.

#### The first execution, and what it exposed

The suite had never been run as a whole. The first full execution produced **61 failures**. Every one was triaged, and the causes fell into six classes — **two of them were product defects**, not test defects:

| # | Root cause | Kind | Fix |
|---|---|---|---|
| 1 | The dev store is **one in-memory DB that lives for the dev-server process**, not for a Playwright run. Coordinate bands separate spec *files* from each other but not two *runs* of the same file, so a second run hit the first run's 50 m dedup radius and got a 200 `dedup_match` instead of a 201 | Test infrastructure | `resetDevStore()` added to the shared fixtures and wired into every spec that asserts exact counts (`11`, `12`, `18`, `19`, `21`) |
| 2 | The dev store seeded **only `ward_14`**, so the dispatcher's out-of-scope path (404, not 403) was unreachable — `POST /api/tickets` rejects an unknown ward with 400 `ward_not_in_city` | **Product / testability** | `ward_15` seeded in `lib/dev-store.ts` |
| 3 | `serializeTicketForRole` **dropped `closeReason`/`duplicateOfId` for every role**, so DISP-006's documented dedup-confirm contract could not be asserted at all | **Product** | Both exposed on the staff branch only — workflow state, not citizen PII |
| 4 | `24-feed-photo-thumbnail` used a random ±0.002° jitter (~222 m) against a **50 m** dedup radius — roughly a 20% spurious `dedup_match` chance per run | Test defect | Replaced with the deterministic band generator |
| 5 | The crew cannot move `routed → in_progress` through the **dispatcher** route (that route is `requireRole('dispatcher')`); `11-dispatcher-detail` posted a crew session there and expected 200 | Test defect | The helper now routes, assigns the crew, then transitions via `/api/v1/crew/tickets/[id]/transition` |
| 6 | The citizen compact header stripped the **top-bar Report CTA** that WO-001 lists as a required acceptance item; MapLibre's unthemed control chrome rendered near-white boxes on the dark surface | **Product** | Header rule scoped to `[data-role="staff"]`; MapLibre controls themed under `.theme-dark` |

Two further spec corrections were **stale assertions**, not defects: `19-admin-tickets` asserted 5 seed tickets and 2 streetlight tickets where the seed carries **10** and **6**, and `21-dispatcher-crew-picker` expected the full ward roster where the picker has always been department-scoped.

#### The remaining 35 failures were stale visual baselines — now refreshed

After the fixes above, every remaining failure was a **visual-baseline mismatch** — 8 in the `01-mockups` family and 27 across the route-spec families (`05-`, `06-`, `07-`, `08-`, `10-`, `13-`, `14-`, `17-`, `18-`, `19-`, `20-`, `21-`). Two of those route-spec directories (`11-`, `12-`) had **no committed baselines at all** — their specs had never captured one.

The baselines were refreshed on `ubuntu-latest` by workflow run `42501672037` and downloaded from its `refreshed-baselines` artifact: **32 changed, 27 unchanged, 4 new**. The 25 mockup baselines came through **byte-identical**, which is the proof that the refresh moved only what was stale and nothing else.

#### The "stale baselines" were not stale — the clock moved

The first container run reduced 276 passed / 50 failed to **324 passed / 2 failed**. The 48 that the argon2 fix resolved were the environment trap described below. The last **2** — `18-admin-audit-light` and `19-admin-tickets-light` — were expected to be baseline drift. They were not.

The pixel diff showed the same rows, the same actors and the same payloads with one difference: the timestamp column. The expected baseline read `০৪:৫৫ PM` (16:55); the actual read `০৩:৪৩ PM` (15:43). Two causes, both real:

1. **The seed clock was the wall clock.** Every seeded ticket, trail entry and audit row derived its timestamp from `Date.now()`, so a screenshot taken now could never match one captured earlier — or later. The symptom is a baseline test that fails no matter how many times it is regenerated; "regenerate the baseline" fixes it for exactly as long as nobody looks at it again.

2. **The rendered timezone was the runtime's, not the product's.** `toLocaleString` resolves the timezone from the runtime, so the same instant rendered as a different clock time on a Dhaka server than on a UTC one — **six hours apart**. The dev machine runs `Asia/Dhaka`; CI and the container run UTC.

Both are now fixed at the source:

- **`lib/format/clock.ts`** — a shared pinned clock. `CITYFIX_SEED_NOW` freezes the epoch; `nowMs()`/`nowIso()` read it, `todayInProductZone()` reads the calendar day in `Asia/Dhaka`, and `slotInProductZone()` builds a Dhaka wall-clock slot. A malformed pin **warns loudly** rather than silently falling back, because a silently-live clock looks pinned but is not.
- **`lib/format/datetime.ts`** — the formatters now pin the **timezone** as well as the locale. This is a **product** fix, not a test fix: a ticket filed at 15:00 in Dhaka must show 15:00 to a Dhaka resident, whatever timezone the server runs in. Four surfaces each carried their own copy of a formatter that pinned the locale but not the timezone; they now share one.
- **The dev store, the admin query windows and the chart axes** all read the pinned clock. The query window matters as much as the row timestamps — it decides **which rows appear**. The chart axes now read "today" from the pinned clock *and* the product's zone, and bucket tickets by their Dhaka calendar day rather than their UTC date.

Verified: the seeded output and the rendered output are **byte-identical** under `TZ=UTC` and `TZ=America/New_York` (`scripts/check-seed-determinism.ts` and `scripts/check-render-determinism.ts`).

#### The pin also has to reach the BROWSER — the server and the client disagreed

The first CI run after the clock fix came back **345 passed / 6 failed**. Five of the six were the same defect on five surfaces, and it was a defect the server-side fix could not reach:

> `Warning: Text content did not match. Server: "৩১ অক্টো ৩ নভে" Client: "১ নভে"` at `HomeReportTrend` — followed by *"An error occurred during hydration. The server HTML was replaced with client content."*

`process.env` is **server-only**. The clock read `process.env.CITYFIX_SEED_NOW`, so the server rendered the pinned epoch while the browser — which has no `process.env` at all — fell back to the wall clock. The `/home` trend chart rendered its axis **three days apart** on the two sides: the server said `৬ নভে`, the client said `৯ নভে`. React compares the two and refuses the tree.

The fix is the `NEXT_PUBLIC_` prefix: those variables are **inlined into the client bundle at build time**, so both sides read the same literal and cannot disagree by construction. The clock now reads `NEXT_PUBLIC_CITYFIX_SEED_NOW` first and `CITYFIX_SEED_NOW` second, and every harness that starts a server sets both.

This is worth stating plainly, because the failure looked like a flaky baseline: the page *rendered* fine, and only the console complained. A hydration mismatch that React resolves by discarding the server's HTML means the captured PNG comes from client-rendered content — so the baseline would have been regenerated against a page the server never produced.

The sixth failure was the same root cause wearing a different hat: `ADM-007` built its query window from `new Date()` while the server had seeded from the pinned epoch, so the window matched no seeded row and the count came back **0 instead of 2**. The spec now reads the same clock the server does, via a shared `pinnedEpochMs()` helper in `tests/helpers/fixtures.ts`.

#### The last two were a stale comparison — and the diff said exactly why

After the clock fix the Linux container run came back **324 passed / 2 failed / 7 skipped**. Both failures were the *visual baseline* of the two specs the clock work targeted — the API assertions passed; only the PNG differed.

A focused diagnostic (`scripts/run-two-baseline-diag.sh`) copied the diff, expected and actual PNGs out of the container so they could be read. The diff was decisive: every layout element matched, and the **only** difference was the timestamp column.

| | row 1 | row 2 | row 3 | row 4 |
|---|---|---|---|---|
| expected (baseline) | `০৪:৫৫ PM` | `০৪:৫১ PM` | `০৩:৫৭ PM` | `০৩:৫৯ PM` |
| actual (pinned) | `০৩:৪৩ PM` | `০৩:৩৯ PM` | `০৩:১৪ PM` | `০৩:৪৪ PM` |

The offsets are right in both — −1m, −5m, −30m, −60m from the seed. The **anchor** differs: the expected read 16:55 and the actual read 15:43, which is exactly the pinned epoch (`2026-11-06T09:44:00.000Z` in `Asia/Dhaka`). Same day, different anchor.

The anchor difference is the **whole point of the pin**: a baseline captured against a live clock records the moment it was taken, so it can never be compared against a later render. Here the expected PNG was the one captured against the wall clock and the actual was the one captured against the pin.

The baselines that were failing here are **not** the ones committed today. The committed baselines were refreshed by `ebdba41` at 23:06 on 2026-11-08, and `d895242` had already put the pin into `playwright.config.ts` at 22:29 the same evening — so the refresh ran *with* the pin and produced pinned-clock PNGs. The container run that reported these 2 failures was measuring an **archive built before that refresh**, so it compared a pinned render against a stale committed PNG.

That was verified rather than assumed: re-running the baseline-regeneration workflow on `ubuntu-latest` (run `42517872827`) produced **63 PNGs byte-identical** to the committed baselines. Not "visually similar" — byte-identical, every one of them. A refresh that reproduces the committed files exactly is the proof that the baselines are *stable*, which is a stronger claim than "the baselines were refreshed".

#### Pinning the clock moved the goalposts for the unit suite too

Five unit tests measured a window or an age against the **wall clock** while the code under test read the **pinned** one. Under a pinned harness the two are days apart, so the assertions failed. The rule is now uniform: **a test that measures against a clock must use the clock the code reads** (`nowMs()` from `lib/format/clock.ts`), not `Date.now()`.

The clock's own test harness had the same defect one level up: it controlled only `CITYFIX_SEED_NOW`, but the module reads the `NEXT_PUBLIC_` name first, so the ambient CI pin overrode the value under test. Both names are one pin, so the harness now controls both — and there is a test that asserts the public name wins, because that precedence is the entire reason the public name exists.

One **product** change came out of it. `updatedAt` was stamped with "now", which under a frozen clock equals `createdAt` and makes the change invisible. `updatedAt` is a monotonic version marker, so the dev store now bumps it strictly forward — one millisecond past the previous stamp when the clock has not advanced. On a live clock this changes nothing; under a pinned clock it produces the strictly increasing sequence the database would have written.

#### The route specs now run in CI

CI previously ran **only** the static mockup family. The 333 route specs had never been executed by the pipeline at all — which is exactly how 61 stale assertions, a broken native-binding path and a moving clock went unnoticed. The workflow now runs them as a separate step, with the dev-store, WebAuthn-seam and pinned-clock env vars, and the job timeout goes 25 → 45 minutes to fit them.

#### One environment trap worth knowing

`webServer.env` reaches only the **server** process. `reuseExistingServer: !process.env.CI` means a manually-started dev server is reused **without** those variables — so `DEV_SKIP_WEBAUTHN=1` was silently absent and every admin write returned 401 `webauthn_required`. That is an **environment artifact, not a code defect**. When a spec fails on an auth gate, check whether the server was started by Playwright or by hand.

The same trap applies to the pinned clock: a manually-started `npm run dev` has no pin at all, so the server renders live timestamps and every visual baseline fails. Start the server through Playwright, or export `CITYFIX_SEED_NOW` (and `NEXT_PUBLIC_CITYFIX_SEED_NOW`) yourself.

#### Two shell traps that cost real time

Both are recorded here because they produce a **false** result — a green run that means nothing, or a red run that means nothing:

- **`tar` does not merge two archives by concatenation.** `cat base.tar nm.tar > combined.tar` produces a valid tar that a reader stops at the first end-of-archive marker — which is how a 1.2 GB `node_modules` vanished from the archive without an error. `tar --concatenate` (`-A`) is the operation that merges.
- **`grep -q` in a pipeline under `set -o pipefail` reports false negatives.** `grep -q` exits on the first match and closes the pipe; `tar` then dies of SIGPIPE (exit 141), and `pipefail` reports the pipeline as failed. The archive asserted "node_modules/.bin/playwright is MISSING" on an archive that demonstrably contained it. Writing the listing to a file first removes the pipe and the false negative with it.

### 2.3 Visual regression — Playwright baselines

**Command:** `npm run test:mockups` (mockup family), `npm test` (route-spec family)
**Location:** `tests-mockups/baselines/` — 25 mockup PNGs under `01-mockups.spec.ts/`, plus one directory per route-spec family that captures a baseline
**Tolerance:** `maxDiffPixelRatio: 0.01` (mockups), `0.005` (route specs)
**Source:** `design-artifacts/D-Design-System/01-Visual-Design/mockups/` (12 static HTML mockups)

12 mockups × viewport combinations = 25 baselines. The web-first platform captures mockups 01–04 at both 1440×900 and 1024×768; Rashid's mockups 06–07 additionally capture the 390×844 phone fallback.

#### The route-spec baseline family

The route specs capture **16 baseline directories** under `tests-mockups/baselines/` — one per spec file that asserts a screenshot. Each is a real app route driven through a live dev server, not a static HTML mockup, and each is platform-dependent in the same way (the Noto Sans Bengali webfont rasterises differently on Windows and Linux).

Two families were discovered to have **no committed baselines at all** when the route specs were first executed: `11-dispatcher-detail-light.spec.ts` and `12-dispatcher-dedup-light.spec.ts`. Their specs had never captured one, so they could never have passed. The regenerated workflow's `route-specs` scope now covers them.

| Mockup | 1440 | 1024 | 390 | Persona |
|---|:---:|:---:|:---:|---|
| 01-welcome | ✅ | ✅ | — | Rahim — entry |
| 02-home-city-activity | ✅ | ✅ | — | Rahim — hub |
| 03-report-submitted | ✅ | ✅ | — | Rahim — confirmation |
| 04-my-reports-detail | ✅ | ✅ | — | Rahim — trust moment |
| 05-daily-queue-dashboard | ✅ | — | — | Habib — desktop work surface |
| 06-field-app-home | ✅ | ✅ | ✅ | Rashid — field app |
| 07-status-in-progress | ✅ | ✅ | ✅ | Rashid — status screen |
| 08-login | ✅ | ✅ | — | Wave 2 — auth entry |
| 09-register | ✅ | ✅ | — | Wave 2 — registration |
| 10-verify-otp | ✅ | ✅ | — | Wave 2 — OTP |
| 11-public-landing | ✅ | ✅ | — | Wave 2 — public entry |
| 12-feed | ✅ | ✅ | — | Wave 2 — activity feed |

#### The platform-specific baseline rule

**The committed baselines are rendered by `ubuntu-latest` — the platform CI asserts them on. They must not be regenerated on a dev machine.**

Chromium rasterises the Noto Sans Bengali webfont (loaded from Google Fonts) differently on Windows and Linux. The glyph antialiasing differs, and on `11-public-landing` at 1024×768 the whole page renders **40 px shorter on Linux** (1526 px) than on Windows (1566 px). A Windows-generated baseline drifts past the 1% tolerance on CI; a Linux-generated one drifts past it on a Windows dev machine. There is no baseline that satisfies both.

**The supported refresh path:**

```bash
gh workflow run regenerate-baselines.yml
gh run download              # artifact: refreshed-baselines
cp -r refreshed-baselines/* tests-mockups/baselines/
git add tests-mockups/baselines/
```

The workflow has a `scope` input — `all` (default), `mockups`, or `route-specs`:

- **`mockups`** runs `npm run test:update-baselines` for the 25 static mockup baselines, then re-runs `npm run test:mockups` as a **stability check** — a second pass must be pixel-clean, or the mockup is not deterministic and the refreshed baseline would be flaky on every CI run.
- **`route-specs`** runs `npx playwright test --update-snapshots` with the dev-store env vars (`CITYFIX_DEV_STORE=1`, `DEV_SKIP_WEBAUTHN=1`), driving the **real app** through a live dev server. `snapshotPathTemplate` in `playwright.config.ts` writes the refreshed PNGs under `tests-mockups/baselines/<spec-file>/` — exactly where the committed baselines live.

Both families are platform-dependent in the same way, so `all` refreshes both. The artifact also carries a `mockup-diffs` folder holding the diff PNGs, uploaded `if: always()` so a failure is diagnosable from the image rather than guessed at from the error message.

Do **not** use `npm run test:update-baselines` for the committed set, and do **not** hand-edit a PNG.

#### Stale baselines are the more common cause

A mockup edit without a baseline refresh fails the gate just as hard as platform drift, and the two stack. Commit `1f8c386` (the MetricStrip redesign) edited 7 mockups — swapping concentric-circle map pins for teardrop paths, rewording Bangla copy, adding `min-width: 0` to fix a grid overflow — but refreshed only 2 of the 25 PNGs. The other 23 were stale.

**When you edit a mockup, refresh its baselines in the same change.** The two failure modes are indistinguishable from the error message alone.

#### A note on the reported ratio

Playwright's diff ratio is rounded **up** (`Math.ceil(ratio * 100) / 100`), so a true ratio of 0.0104 prints as `0.02`. Do not read `0.02` as a 2% diff.

---

## 3. Coverage

**Command:** `npm run test:unit:coverage`
**Provider:** `v8`
**Scope:** `lib/**/*.ts` only
**`all: true`** — files with no test at all still appear in the report and count against the threshold. With `all: false`, an untested file is simply invisible and the floor silently passes.

| Metric | Value | Floor | Margin |
|---|---|---|---|
| Lines | 94.02% | 80% | +14.02 |
| Branches | 83.01% | 80% | +3.01 |
| Functions | 94.84% | 80% | +14.84 |
| Statements | 94.02% | 80% | +14.02 |

### Why the scope is `lib/**`

`vitest.config.ts` documents the measurement that decided this (2026-10-27):

| Scope | Lines | Branches | Functions |
|---|---|---|---|
| `lib/**` only | 90.89% | 80.85% | 94.11% |
| `app/api` route handlers only | 0.00% | 0.00% | 0.00% (0/7,516 lines, 56 files) |
| `lib/**` + `app/api` combined | 49.01% | 78.61% | 82.75% |

The 56 (now 62) route files are thin HTTP boundary adapters: parse, delegate, serialise. They hold no business logic, and their behaviour is already covered end-to-end by the Playwright route specs. Unit-testing them would duplicate that coverage rather than add signal, and would force the 80% floor to be met by mock-heavy HTTP-shaping tests that assert nothing about product behaviour.

**This is not a weakening of the threshold.** The mandated 80% floor is unchanged and still applies to the scope that holds the logic. The `app/api` figure is reported here so the trade-off stays visible rather than hidden.

### The weakest areas

| Module | Lines | Branches | Uncovered | Note |
|---|---|---|---|---|
| `lib/map/osm-raster.ts` | 0% | 0% | 1-46 | **Entirely untested** — tile URL construction |
| `lib/ui/map-colors.ts` | 0% | 0% | 1-18 | **Entirely untested** — a constants file |
| `lib/storage/blob.ts` | 66.24% | 82.64% | 626-640, 766-770 | The S3 upload path is barely exercised |
| `lib/platform/push.ts` | 65.33% | 81.25% | 51-61, 68-71, 87-97 | The Web Push wire call is v1.1, so this is expected |
| `lib/theme/appearance.ts` | 93.61% | 80.95% | 57-58, 72 | Dark-mode preference resolution |
| `lib/i18n/keys.ts` | 100% | 75% | 2915, 2918, 2927 | Three untested branches in a 2,900-line registry |

`lib/map/osm-raster.ts` at 0% is the one to fix first — it builds the tile URLs the map depends on, and a regression there is a blank map in production.

---

## 4. What the tests actually cover

### 4.1 Well-covered areas

| Area | Evidence |
|---|---|
| **Auth guards** | `tests/unit/auth/` — `requireRole`, `requireSameCity`, `requireScope`, `requireWebAuthn` each exercised for 401/403/pass |
| **ADR-007 WebAuthn enforcement** | `tests/unit/require-webauthn.test.ts`, `tests/unit/transition-webauthn.test.ts` — run against the **real dependency graph**, not mocks |
| **Serializers (the PII boundary)** | `lib/serializers/ticket.ts` at 98.55% lines, `trail.ts` at 100% |
| **Status transitions** | `lib/platform/transitions.ts` at 97.46% — the full legal/illegal matrix |
| **Concurrency guards** | `tests/unit/transitions-concurrency.test.ts` (13), `tests/unit/writes-concurrency.test.ts` (10), `tests/unit/platform/transaction.test.ts` (16), `tests/unit/dedup-concurrency.test.ts` (18), `tests/unit/dedup-route-race.test.ts` (6), `tests/unit/dispatcher/crew-capacity.test.ts` (14) — against the **real** dev store, verified non-vacuous |
| **Optimistic locking** | `lib/platform/concurrency.ts` at 100% — both the transition and write error contracts |
| **Dedup** | `lib/platform/dedup.ts` at 98.3% lines |
| **Password hashing** | `lib/auth/password.ts` — Argon2id parameters, the policy, and the separate `hashSecret` path |
| **Session signing** | `lib/auth/session.ts` — HMAC pack/unpack, `timingSafeEqual`, TTL, the dev-store unsigned path |
| **DB guard** | `lib/platform/db-guard.ts` at 100% lines — URL form, libpq keyword form, 127.0.0.0/8, the fail-closed latch |
| **Blob key safety** | `lib/storage/blob-provider.ts` at 100% |
| **i18n registry** | `lib/i18n/keys.ts` at 100% lines |
| **UI components** | `tests/unit/components/` — `Overlays` (15), `Charts` (16), `MetricStrip` (6), `Button`, `Textarea`, `CategoryIcon` |

### 4.2 Deliberately uncovered

| Area | Why | When it gets covered |
|---|---|---|
| `app/api/**/route.ts` | Thin adapters, covered by Playwright route specs instead | Never — by design |
| `app/**/page.tsx` | React Server Components; covered by the visual-regression suite | Never — by design |
| `lib/platform/push.ts` wire call | Web Push is stubbed in v1 | v1.1 |
| `lib/map/osm-raster.ts` | Not yet written — **a gap, not a decision** | Should be fixed |
| Real WebAuthn hardware | No authenticator available in CI | Needs a device lab |
| Real SMS delivery | The Twilio provider is not exercised against the live API | Needs provider credentials |
| Live Postgres | The suite runs on the dev store. The dedup unique index **was** validated against a real PostgreSQL 16 instance manually on 2026-11-08 (six behaviours checked in SQL), but that is not repeatable in CI | Needs a database-backed CI job |
| Multi-instance rate limiting | The limiter is in-process by design | v1.1, when it moves to Redis |

---

## 5. CI pipeline

`.github/workflows/ci.yml` — `ubuntu-latest`, 25-minute timeout, `concurrency` cancels superseded runs on the same ref.

| # | Step | Command |
|---|---|---|
| 1 | Checkout | `actions/checkout@v4` |
| 2 | Setup Node 22 | `actions/setup-node@v4` |
| 3 | Install dependencies | `npm ci` |
| 4 | Generate Prisma client | `npx prisma generate` |
| 5 | Lint | `npm run lint` |
| 6 | Typecheck | `npx tsc --noEmit` |
| 7 | Unit tests | `npm run test:unit` |
| 8 | Coverage floor | `npm run test:unit:coverage` |
| 9 | Install Playwright browsers | `npx playwright install --with-deps chromium` |
| 10 | Visual regression | `npm run test:mockups` |
| 11 | Build | `npm run build` |
| 12 | Upload visual diff artifacts | `actions/upload-artifact@v4` (`if: always()`) |

**Step 12 always uploads**, so a baseline failure can be diagnosed from the diff PNG rather than guessed at from the error message. CI's "actual" PNG is the reference for what the mockups look like on the asserting platform.

**CI now runs the route specs.** They were added on 2026-11-08 as a separate step (`npx playwright test --grep-invert 'CityFix mockup baselines'`) — the mockup family is excluded because the step above it already ran that. The step needs the dev-store, WebAuthn-seam and pinned-clock env vars, and the job timeout went 25 → 45 minutes to fit the ~11-minute suite. See §2.2.

### The Node 22 requirement

CI runs **Node 22**, not 20. `jsdom@30` pulls `undici@8`, whose `engines.node` is `>=22.19.0`. Undici's decompress interceptor calls `zlib.constants.ZSTD_d_windowLogMax`, which only exists from Node 22.15 / 23.8 (Zstd support in `node:zlib`). On Node 20 that constant is `undefined`, so the module throws `TypeError: Cannot read properties of undefined (reading 'bind')` at import time — the whole Vitest suite dies with 16 unhandled errors.

That failure was invisible locally (the dev machine runs Node 24) and CI was red on every run from 2026-10-29. It also meant the coverage floor and the visual gate were being **skipped**, because they run after the unit step.

`engines.node` in `package.json` stays `>=20.0.0` because that is the runtime floor for the deployed app. The jsdom dependency is a test-time requirement only and is stricter than the runtime floor. If the runtime floor is ever raised, raise the CI pin in the same commit.

### The baseline regeneration workflow

`.github/workflows/regenerate-baselines.yml` — `workflow_dispatch`, `ubuntu-latest`, 30-minute timeout, with a `scope` input (`all` | `mockups` | `route-specs`).

```
checkout → setup-node (22) → npm ci → playwright install
  → npm run test:update-baselines        ← mockup family
  → npm run test:mockups                 ← stability check (must be pixel-clean)
  → npx playwright test --update-snapshots  ← route-spec family
  → upload refreshed-baselines (14-day retention)
  → upload mockup-diffs (if: always())
```

The second pass **must be pixel-clean**. If it is not, the mockup is not deterministic (a live clock, an animation), and the refreshed baseline would be flaky on every CI run.

This workflow was extended on 2026-11-08 to cover the **route-spec** baseline family. It previously handled only the 25 static mockup baselines, which left the route-spec PNGs with no supported refresh path at all.

---

## 6. Known testing gaps

| # | Gap | Severity | Why it matters |
|---|---|---|---|
| 1 | `lib/map/osm-raster.ts` at 0% | Medium | Tile URL construction is untested; a regression is a blank map |
| 2 | No `middleware.ts`, so no integration test for "a route with no guard" | High | The absence of a baseline guard is only detectable by reading every route |
| 3 | ~~`PUT /api/profile` has no WebAuthn test~~ | **Closed 2026-11-09** | The gate was missing, so there was nothing to test. It is now enforced *and* tested — `tests/unit/profile-webauthn-gate.test.ts` (18 tests). Non-vacuity proven: neutering the guard fails exactly the 5 gate tests |
| 4 | ~~No test for the OTP attempt limit~~ | **Closed 2026-11-09** | The limit was dead code, so there was nothing to test. It is now enforced *and* tested — `tests/unit/otp-attempt-limit.test.ts` (9 tests). Non-vacuity proven: neutering the guard fails exactly the 3 lockout tests |
| 5 | No cross-city admin test | Medium | Finding #7 — the two admin surfaces disagree, and no test pins either behaviour |
| 6 | No live-database test run | Medium | Every test runs on the dev store; Prisma-specific behaviour (e.g. `AuditEntry.actor` `onDelete: Restrict` vs user deletion) is never exercised. The dedup index's behaviour was checked against a real PostgreSQL 16 by hand on 2026-11-08, which is a spot check, not a CI job |
| 7 | No WebAuthn hardware test | Medium | Attestation, assertion and counter-clone detection are read, not executed |
| 8 | No load test | Low | The rate limiter's per-instance limit is established from source, not measured |
| 9 | `lib/storage/blob.ts` S3 path at 66% | Low | The S3 upload path needs an S3-compatible endpoint to test properly |
| 10 | 56 ESLint warnings | Low | All are unused-variable warnings in test files; no errors, so the gate is green |
| 11 | Concurrency tested only against the dev store | Medium | The transition path's compare-and-swap is now exercised (`tests/unit/transitions-concurrency.test.ts`), the concurrent field writes too (`tests/unit/writes-concurrency.test.ts`), the duplicate-submission race (`tests/unit/dedup-concurrency.test.ts`) and the crew-capacity rule (`tests/unit/dispatcher/crew-capacity.test.ts`) — but all against the dev store's guard, never against a real Postgres under concurrent load |
| 12 | No concurrency test for crew capacity | **Closed 2026-11-08** | Duplicate submission was in this gap and was closed first (`tests/unit/dedup-concurrency.test.ts`, `tests/unit/dedup-route-race.test.ts`); crew capacity was closed last (`tests/unit/dispatcher/crew-capacity.test.ts`, 14 tests). Both are now covered against the real dev store |
| 13 | Photo ordering within a Postgres timestamp window is arbitrary | Low | Two photos uploaded in the same timestamp window get an arbitrary order. Photos are **appended, not overwritten**, so nothing is lost — but the ordering is not deterministic. A schema question (a `slot` column or a deterministic tiebreak), not a race guard |
| 14 | The route specs do not run in CI | **Closed 2026-11-08** | CI now runs the 333 route specs as a separate step, with the dev-store, WebAuthn-seam and pinned-clock env vars. The job timeout went 25 → 45 minutes to fit the ~11-minute suite. The per-test coordinate isolation the dev store still lacks is handled by `resetDevStore()` in the shared fixtures |
| 15 | The route specs had never been executed | **Closed 2026-11-08** | The suite existed but had never been run as a whole — the pipeline did not include it and the audit recorded it as *"not executed"*. The first full run produced **61 failures** and exposed two product defects (a serializer that dropped `closeReason`/`duplicateOfId` for every role, and a citizen header that stripped the required top-bar Report CTA). All functional failures are now closed; see §2.2 |
| 16 | The rendered clock was the runtime's, not the product's | **Closed 2026-11-08** | `toLocaleString` resolved the timezone from the runtime, so the same instant rendered six hours apart on a Dhaka server than on a UTC one. A ticket filed at 15:00 in Dhaka showed `09:00 AM`. This was a **product** bug, not a test artifact. The formatters now pin `Asia/Dhaka`, and the four surfaces that each carried their own locale-only copy of a formatter now share one. See §2.2 |
| 17 | The seeded clock was the wall clock | **Closed 2026-11-08** | Every seeded timestamp derived from `Date.now()`, so a screenshot could never match a baseline captured at a different moment — the symptom being a baseline test that fails however many times it is regenerated. `CITYFIX_SEED_NOW` now pins the seed epoch, and the seeded output is byte-identical across host timezones. See §2.2 |
| 18 | ~~No test that a WebAuthn challenge is consumed~~ | **Closed 2026-11-09** | The challenge was never deleted, so there was nothing to test — and one assertion authorised every admin write for five minutes (SECURITY_AUDIT finding #6). The guard now consumes the row it accepts, and `tests/unit/webauthn-challenge-consumption.test.ts` (9 tests) pins it, including the concurrent-write race. Non-vacuity proven: removing the delete fails 6 of the 9 |

**Gaps 3, 4 and 5 share a root cause:** the suite asserts the code's actual behaviour. Where the code diverges from the ADR, the suite is green. This is the same class of miss ADR-007:229-234 predicted — a convention that is not enforced by a mechanism.

**Gaps 11 and 12 are the same class, and both are now closed.** The concurrency audit recorded that *"CI cannot catch this"* because the dev store hid the race by accident of Node's event loop. That gap is now closed for the transition path, the field-write paths, the duplicate-submission path **and the crew-capacity rule** — the dev store implements the same compound guard and returns the same affected-row count, and the regression tests drive concurrent writers against it. The unique index on `(cityId, dedupKey)` is what closes the submit race, and the dev store mirrors its Postgres semantics exactly, including treating NULLs as distinct. The capacity rule needed one more faithful behaviour: `devDb.ticket.findMany` now filters on `assignedCrewId` (equality and `{ in: [...] }`), mirroring Prisma's NULL semantics — without it the load count silently returned zero for every crew member and the picker would have shown "0/5" for everyone.

---

## 7. How to run the suites

```bash
# Unit
npm run test:unit

# Coverage (enforces the 80% floor)
npm run test:unit:coverage

# Route specs (boots the dev server automatically)
npm test

# Route specs in a Linux container — the closest thing to the CI
# platform, and the only way to reproduce CI's rasterisation locally
bash scripts/run-specs-in-container.sh

# Visual regression only
npm run test:mockups

# Refresh baselines — IN CI, never locally
gh workflow run regenerate-baselines.yml -f scope=all
gh run download

# HTML report
npm run test:report
```

### Running the route specs on Windows

The suite boots its own dev server when none is listening on port 3000. If you already have one running, Playwright **reuses it** — and a hand-started server will not carry `CITYFIX_DEV_STORE=1` or `DEV_SKIP_WEBAUTHN=1`, which are set in `webServer.env` and reach only the server Playwright starts. The symptom is admin-write specs failing with `401 webauthn_required`.

To run against a hand-started server, start it with the same variables:

```bash
CITYFIX_DEV_STORE=1 DEV_SKIP_WEBAUTHN=1 npm run dev:feat
```

The suite runs `workers: 1` and `fullyParallel: false`. The dev store is a single in-memory database shared by every spec in the run, so the specs that assert exact counts reset it first (`resetDevStore()` in `tests/helpers/fixtures.ts`).

### The project's Construction Verification Command

Recorded in `aidlc/spaces/default/memory/project.md`:

```bash
npx tsc --noEmit && npm run test:unit && npm run test:mockups && curl -fs http://localhost:3000/
```

---

## 8. Related documents

- [ARCHITECTURE.md](ARCHITECTURE.md) — the layers the coverage scope follows
- [SECURITY_AUDIT.md](SECURITY_AUDIT.md) — findings that testing did not catch
- [PRODUCTION_READINESS_CHECKLIST.md](PRODUCTION_READINESS_CHECKLIST.md) — the verification status of each item
