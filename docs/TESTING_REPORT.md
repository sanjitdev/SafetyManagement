# CityFix — Testing Report

**Report date:** 2026-11-08
**Codebase:** `main` @ `be9f2b0`
**Test philosophy:** `test-after` (affirmed in `aidlc/spaces/default/memory/team.md`)

---

## 1. Summary

| Metric | Value | Floor | Status |
|---|---|---|---|
| Unit test files | 109 | — | — |
| Unit tests passing | **1,939 / 1,939** | — | ✅ |
| Coverage — lines | **92.59%** | 80% | ✅ |
| Coverage — branches | **83.08%** | 80% | ✅ |
| Coverage — functions | **93.66%** | 80% | ✅ |
| Coverage — statements | **92.59%** | 80% | ✅ |
| Playwright route specs | 34 | — | — |
| Mockup visual baselines | 25 | — | ✅ |
| TypeScript `tsc --noEmit` | clean | clean | ✅ |
| ESLint | 0 errors, 55 warnings | 0 errors | ✅ |
| CI pipeline | 12/12 steps green | all green | ✅ |

**All verification commands were executed locally on 2026-11-08 and passed.** The CI pipeline's most recent green run is `42480698041` on commit `da9f542`.

---

## 2. Test suites

### 2.1 Unit tests — Vitest

**Command:** `npm run test:unit`
**Config:** `vitest.config.ts`
**Location:** `tests/unit/**/*.test.ts` and `*.test.tsx`
**Environment:** `node` by default; component tests opt in to `jsdom` via a `@vitest-environment jsdom` docblock
**Alias:** `@/` → repo root
**Result:** 109 files, 1,939 tests, 100% passing, ~28 s

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

### 2.2 Route specs — Playwright

**Command:** `npm test`
**Config:** `playwright.config.ts`
**Location:** `tests/*.spec.ts` (34 files)
**Web server:** `npm run dev:feat` on `http://localhost:3000`, with `CITYFIX_DEV_STORE=1` and `DEV_SKIP_WEBAUTHN=1`

The route specs walk the four personas through the real app: `02-live-audit`, `03-authenticated-flow`, `04-e2e-human-tester`, `09-dispatcher-auth`, `13-crew-auth`, `16-admin-webauthn`, `28-role-walkthrough`, `30-role-redirect`, `31-post-auth-target`.

`testMatch: '*.spec.ts'` scopes the sweep to the top-level route specs. Without it, Playwright would try to run the Vitest files one directory deeper and fail with *"Vitest cannot be imported in a CommonJS module using require()"* — this is a live trap, not a hypothetical.

### 2.3 Visual regression — Playwright mockup baselines

**Command:** `npm run test:mockups`
**Location:** `tests-mockups/baselines/01-mockups.spec.ts/` (25 committed PNGs)
**Tolerance:** `maxDiffPixelRatio: 0.01`
**Source:** `design-artifacts/D-Design-System/01-Visual-Design/mockups/` (12 static HTML mockups)

12 mockups × viewport combinations = 25 baselines. The web-first platform captures mockups 01–04 at both 1440×900 and 1024×768; Rashid's mockups 06–07 additionally capture the 390×844 phone fallback.

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
cp refreshed-baselines/*.png tests-mockups/baselines/01-mockups.spec.ts/
git add tests-mockups/baselines/
```

Do **not** use `npm run test:update-baselines` for the committed set.

**When the local suite fails on Windows or macOS against the CI-generated baselines, that is expected.** It is the platform difference, not a regression. Trust CI. Before assuming a real regression, compare the CI "actual" PNG against the baseline PNG in the uploaded `mockup-diffs` artifact.

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
| Lines | 92.59% | 80% | +12.59 |
| Branches | 83.08% | 80% | +3.08 |
| Functions | 93.66% | 80% | +13.66 |
| Statements | 92.59% | 80% | +12.59 |

### Why the scope is `lib/**`

`vitest.config.ts` documents the measurement that decided this (2026-10-27):

| Scope | Lines | Branches | Functions |
|---|---|---|---|
| `lib/**` only | 90.89% | 80.85% | 94.11% |
| `app/api` route handlers only | 0.00% | 0.00% | 0.00% (0/7,516 lines, 56 files) |
| `lib/**` + `app/api` combined | 49.01% | 78.61% | 82.75% |

The 56 (now 61) route files are thin HTTP boundary adapters: parse, delegate, serialise. They hold no business logic, and their behaviour is already covered end-to-end by the Playwright route specs. Unit-testing them would duplicate that coverage rather than add signal, and would force the 80% floor to be met by mock-heavy HTTP-shaping tests that assert nothing about product behaviour.

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

### The Node 22 requirement

CI runs **Node 22**, not 20. `jsdom@30` pulls `undici@8`, whose `engines.node` is `>=22.19.0`. Undici's decompress interceptor calls `zlib.constants.ZSTD_d_windowLogMax`, which only exists from Node 22.15 / 23.8 (Zstd support in `node:zlib`). On Node 20 that constant is `undefined`, so the module throws `TypeError: Cannot read properties of undefined (reading 'bind')` at import time — the whole Vitest suite dies with 16 unhandled errors.

That failure was invisible locally (the dev machine runs Node 24) and CI was red on every run from 2026-10-29. It also meant the coverage floor and the visual gate were being **skipped**, because they run after the unit step.

`engines.node` in `package.json` stays `>=20.0.0` because that is the runtime floor for the deployed app. The jsdom dependency is a test-time requirement only and is stricter than the runtime floor. If the runtime floor is ever raised, raise the CI pin in the same commit.

### The baseline regeneration workflow

`.github/workflows/regenerate-baselines.yml` — `workflow_dispatch`, `ubuntu-latest`, 20-minute timeout.

```
checkout → setup-node (22) → npm ci → playwright install
  → npm run test:update-baselines
  → npm run test:mockups        ← stability check
  → upload refreshed-baselines (14-day retention)
```

The second pass **must be pixel-clean**. If it is not, the mockup is not deterministic (a live clock, an animation), and the refreshed baseline would be flaky on every CI run.

---

## 6. Known testing gaps

| # | Gap | Severity | Why it matters |
|---|---|---|---|
| 1 | `lib/map/osm-raster.ts` at 0% | Medium | Tile URL construction is untested; a regression is a blank map |
| 2 | No `middleware.ts`, so no integration test for "a route with no guard" | High | The absence of a baseline guard is only detectable by reading every route |
| 3 | `PUT /api/profile` has no WebAuthn test | High | The gap in [SECURITY_AUDIT.md finding #5](SECURITY_AUDIT.md) is invisible to the suite because the suite asserts what the code does, not what the ADR says it should |
| 4 | No test for the OTP attempt limit | Medium | The limit is dead code, so there is nothing to test — but a test *should* exist and fail |
| 5 | No cross-city admin test | Medium | Finding #7 — the two admin surfaces disagree, and no test pins either behaviour |
| 6 | No live-database test run | Medium | Every test runs on the dev store; Prisma-specific behaviour (e.g. `AuditEntry.actor` `onDelete: Restrict` vs user deletion) is never exercised. The dedup index's behaviour was checked against a real PostgreSQL 16 by hand on 2026-11-08, which is a spot check, not a CI job |
| 7 | No WebAuthn hardware test | Medium | Attestation, assertion and counter-clone detection are read, not executed |
| 8 | No load test | Low | The rate limiter's per-instance limit is established from source, not measured |
| 9 | `lib/storage/blob.ts` S3 path at 66% | Low | The S3 upload path needs an S3-compatible endpoint to test properly |
| 10 | 55 ESLint warnings | Low | All are unused-variable warnings in test files; no errors, so the gate is green |
| 11 | Concurrency tested only against the dev store | Medium | The transition path's compare-and-swap is now exercised (`tests/unit/transitions-concurrency.test.ts`), the concurrent field writes too (`tests/unit/writes-concurrency.test.ts`), the duplicate-submission race (`tests/unit/dedup-concurrency.test.ts`) and the crew-capacity rule (`tests/unit/dispatcher/crew-capacity.test.ts`) — but all against the dev store's guard, never against a real Postgres under concurrent load |
| 12 | No concurrency test for crew capacity | **Closed 2026-11-08** | Duplicate submission was in this gap and was closed first (`tests/unit/dedup-concurrency.test.ts`, `tests/unit/dedup-route-race.test.ts`); crew capacity was closed last (`tests/unit/dispatcher/crew-capacity.test.ts`, 14 tests). Both are now covered against the real dev store |
| 13 | Photo ordering within a Postgres timestamp window is arbitrary | Low | Two photos uploaded in the same timestamp window get an arbitrary order. Photos are **appended, not overwritten**, so nothing is lost — but the ordering is not deterministic. A schema question (a `slot` column or a deterministic tiebreak), not a race guard |

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

# Visual regression only
npm run test:mockups

# Refresh baselines — IN CI, never locally
gh workflow run regenerate-baselines.yml
gh run download

# HTML report
npm run test:report
```

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
