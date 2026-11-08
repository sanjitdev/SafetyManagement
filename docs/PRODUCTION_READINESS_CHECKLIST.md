# CityFix — Production Readiness Checklist

**Audit date:** 2026-11-08
**Codebase:** `main` @ `be9f2b0` (audit snapshot); rows 6.1 and 6.13 re-verified at `096bcc5`+; the concurrency rows re-verified at `da9f542`+
**Verdict:** ❌ **NOT READY FOR PRODUCTION** — 4 Critical and 4 High blockers. The ticket-state integrity defect that could make the citizen-facing status trail contradict reality is **closed**; the remaining blockers are configuration-reachable auth defects and operations that have never been exercised against real infrastructure.

**Status legend**

| Status | Meaning |
|---|---|
| ✅ **PASS** | Verified against source or executed; evidence recorded |
| ❌ **FAIL** | Verified as broken, missing, or unsafe; evidence recorded |
| ⚠️ **NOT VERIFIED** | Could not be confirmed in this environment — reason given |
| ➖ **NOT APPLICABLE** | Does not apply to this deployment |

Every PASS cites the file or command that proves it. Every FAIL cites the file and line. Every NOT VERIFIED states exactly what is missing.

---

## Final Report

### Completion

| Metric | Value |
|---|---|
| **Overall completion** | **56%** (97 of 173 items PASS) |
| Total checklist items | **173** |
| ✅ Passed | **97** |
| ❌ Failed | **45** |
| ⚠️ Not verified | **30** |
| ➖ Not applicable | **1** |

The 56% is a completeness score against the production-readiness surface, **not** a quality score. The code that exists is largely well built — the layering, the PII boundary, the audit immutability and the i18n discipline all hold. The failures cluster in three places: **configuration-reachable auth defects**, **operations that have never been exercised against real infrastructure**, and **the concurrency scenarios that no longer exist** — all five named ones are now closed. The route specs were also executed for the first time on 2026-11-08 and now pass, apart from stale visual baselines.

> **The counts are measured, not asserted.** They were produced by parsing the status column of every item row in this document. An earlier draft of this file claimed 126 items and 58% — that was an estimate made before the checklist was written out, and it was wrong on every axis. The stage count below is 12; the item count is 173.
>
> **The item count was itself wrong until 2026-11-08.** This table claimed 172 items across 20 rounds of edits, but the document has always carried **173** rows. The parser that produced the original figures counted row 9.14 as unparseable: that row's status marker is `U+2760` (⚠ WARNING SIGN), while every other not-verified row uses `U+26A0` (⚠️ HIGH VOLTAGE SIGN). The two render identically and differ only in code point, so the count silently dropped one ⚠️ row. The current figures are 173 / 97 / 45 / 30 / 1, re-measured by code point. **A "measured" number that drops a row because of a code point is not measured.**
>
> **Six rounds of rows have changed since the audit was written, and the figures above were re-measured after each — never adjusted by hand.**
>
> 1. **2026-11-08 — the phantom OpenAPI methods.** Rows 6.1 and 6.13 moved to ✅ when the two spec blocks that documented non-existent endpoints were deleted and a mechanical parity test was added — see [KNOWN_ISSUES.md #31](KNOWN_ISSUES.md#31-the-openapi-spec-documents-two-methods-that-do-not-exist---resolved-2026-11-08). Counts moved 44% → 44% (76 passed).
> 2. **2026-11-08 — the concurrent-transition lost update.** The worst concurrency finding is closed at source: a compare-and-swap write on `(status, version)`, one transaction around the status update + trail insert + audit write, and a CI-enforced regression test. Rows 5.1, 5.2, 5.3, 5.4, 5.10, 5.11, 5.12, 5.14, 9.9 and 12.8 moved to ✅; rows 9.13 and 12.12 moved to ⚠️ (partially verified). Counts moved 44% → **51%** (76 → 87 passed, 67 → 54 failed, 28 → 30 not verified).
> 3. **2026-11-08 — the concurrent ticket-field writes.** The transition fix left every other ticket-field write as a read-modify-write. They now use the same count-checked `updateWhere`, guarded on `version`, and reject their own lost races with 409 `concurrent_write`. Rows 5.5, 5.6, 12.7 and 12.9 moved to ✅. Counts moved 51% → **53%** (87 → 91 passed, 54 → 50 failed, 30 not verified unchanged).
> 4. **2026-11-08 — the duplicate-submission race.** The last fixable concurrency scenario is closed. A nullable `dedupKey` column with `@@unique([cityId, dedupKey])` is the backstop; the submit route catches the unique violation, re-runs the scan, and returns the same `dedup_match` prompt the winner got. Rows 5.7, 5.8 and 12.10 moved to ✅. Counts moved 53% → **55%** (91 → 94 passed, 50 → 47 failed, 30 not verified unchanged). The design deliberately differs from the audit's recommendation — see [CONCURRENCY_AND_ACCOUNTABILITY_AUDIT.md §A.2.3](CONCURRENCY_AND_ACCOUNTABILITY_AUDIT.md#a23-scenario-4--resolved-2026-11-08).
> 5. **2026-11-08 — the crew capacity rule.** The last of the five named concurrency scenarios. The audit framed it as an open *product* question, but the answer was already written down in the UX spec (a red load badge above 5, a load-based sort, a 409 "crew just took another job"), so it was an unimplemented specification. `lib/dispatcher/crew-capacity.ts` now enforces the limit and the assign endpoint refuses a member at it with **409 `crew_at_capacity`**; the picker reports the same count. Rows 5.9 and 12.11 moved to ✅. Counts moved 55% → **56%** (94 → 96 passed, 47 → 45 failed, 30 not verified unchanged). **All five named concurrency scenarios are now closed.**
> 6. **2026-11-08 — the route specs were executed.** Row 9.8 moved from ⚠️ to ✅ and row 9.6 was re-measured (33 files / 333 specs). The suite had never been run as a whole; the first execution produced **61 failures**, and closing them exposed **two product defects** — a serializer that dropped `closeReason`/`duplicateOfId` for every role, and a citizen compact header that stripped the top-bar Report CTA WO-001 requires. Counts moved 55% → **56%** (96 → 97 passed, 45 failed unchanged, 31 → 30 not verified). The item total was corrected 172 → **173** on the same pass, for the code-point reason recorded above.

### Issue counts

| Severity | Count | Detail |
|---|---:|---|
| **Critical** | **4** | OTP plaintext in every environment; OTP attempt limit never enforced; four `/api/dev/*` routes not dev-store-gated; `bootstrap-admin` + `issue-session` mint admin sessions |
| **High** | **4** | `PUT /api/profile` is an ungated admin write; WebAuthn challenges never consumed; admin city-scoped routes skip the city check; password login is not role-restricted. *(The fifth High finding — concurrency control — was **closed on 2026-11-08**: all five named scenarios now have a guard and a CI-enforced regression test.)* |
| **Medium** | **13** | In-process rate limiter; no `middleware.ts`; CSP `unsafe-inline`/`unsafe-eval`; incomplete `.env.example`; `sessionId` echoed; local blob photos 404; adoption export passes the city id as a slug; city-create swallows template failure; `osm-raster.ts` at 0% coverage; `SlaPolicy` never consulted; four missing `Ticket` timestamps; `null` collapsed to `0` in adoption metrics; no `middleware`/baseline route guard |
| **Low** | **9** | Four API contract divergences; `requireRole` returns 401 where 403 is expected; OTP generated with `Math.random()`; missing COOP/CORP/DNS-prefetch headers; stale `SlaPolicy` comments; audit `action` is a free-form string; `AuditEntry.actor` `onDelete: Restrict` unverified; `lib/ui/map-colors.ts` at 0%; `AuditEntry`/`Trail` have no `@@unique` |

**Total open issues: 30.** (Was 32 at the audit date; the phantom-methods finding was closed on 2026-11-08, and the concurrency finding was closed at the end of it — issue 27 is now "all 5 scenarios resolved" and is no longer counted as open.)

The severity counts are the **findings register** — 17 in [SECURITY_AUDIT.md](SECURITY_AUDIT.md) plus 13 in [KNOWN_ISSUES.md](KNOWN_ISSUES.md) that are not security findings. They do not equal the 45 failed checklist items: a single finding can fail several checklist rows, and one failed row (10.22, the production-mode run) is a consequence of the environment rather than a distinct defect.

### Features completed during the audit

No product features were built. The audit produced **10 documents** and, at the time of writing, **0 source-code changes**. Four source-code changes have landed since:

1. **2026-11-08 — the phantom OpenAPI methods.** The two spec blocks documenting non-existent endpoints were deleted and a mechanical parity test was added, which moved rows 6.1 and 6.13 to ✅.
2. **2026-11-08 — the concurrent-transition lost update.** The audit's worst concurrency finding is closed at source: a compare-and-swap write on `(status, version)`, one transaction around the status update + trail insert + audit write, `writeAudit` re-pointed at the transaction handle, the dev store implementing the same guard, and a CI-enforced regression test. Ten checklist rows moved to ✅ and two to ⚠️.
3. **2026-11-08 — the concurrent ticket-field writes.** Every remaining ticket-field write became a count-checked `updateWhere` guarded on `version`. Four rows moved to ✅.
4. **2026-11-08 — the duplicate-submission race.** A nullable `dedupKey` column with `@@unique([cityId, dedupKey])`, a submit route that recovers from the unique violation, the dev store mirroring Postgres's NULL semantics, and 24 new tests across two suites. Three rows moved to ✅.

The two code-level remediations from the prior session (the Node 22 CI pin and the lazy production DB guard) predate this audit and are credited to the CI-repair work, not here.

| Deliverable | Status |
|---|---|
| `docs/PROJECT_AUDIT.md` | ✅ Written |
| `docs/PRODUCTION_READINESS_CHECKLIST.md` | ✅ This document |
| `docs/ARCHITECTURE.md` | ✅ Written |
| `docs/API_DOCUMENTATION.md` | ✅ Written |
| `docs/TESTING_REPORT.md` | ✅ Written |
| `docs/SECURITY_AUDIT.md` | ✅ Written |
| `docs/DEPLOYMENT_GUIDE.md` | ✅ Written |
| `docs/KNOWN_ISSUES.md` | ✅ Written |
| `docs/CHANGELOG.md` | ✅ Written |
| `docs/CONCURRENCY_AND_ACCOUNTABILITY_AUDIT.md` | ✅ Written — the 10th document, added after the plan's two unexamined priorities were investigated |

### Tests executed and results

**All executed locally on 2026-11-08.** The most recent green CI run is `42480698041` on `da9f542` (12/12 steps).

| Check | Command | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | ✅ clean |
| Lint | `npm run lint` | ✅ 0 errors, 55 warnings (all unused-vars in test files) |
| Unit tests | `npm run test:unit` | ✅ **109 files / 1,939 tests passed**, ~28 s |
| Coverage | `npm run test:unit:coverage` | ✅ **92.59% lines / 83.08% branches / 93.66% functions** (floor 80%) |
| i18n keys | `npm run check:i18n` | ✅ 957 keys, all registered |
| Visual regression | CI run `42480698041` | ✅ 25/25 baselines |
| Full pipeline | CI run `42480698041` | ✅ 12/12 steps green |

**Executed 2026-11-08 (after the audit snapshot):** Playwright route specs — `npm test`, 33 files / 333 specs, **321 passed / 35 failed / 2 skipped**, 14.4 min. All functional failures are closed; the 35 stale visual baselines were refreshed on `ubuntu-latest` by workflow run `42501672037`. The run exposed two product defects (the serializer dropping `closeReason`/`duplicateOfId`, and the citizen header stripping the required Report CTA), both fixed.

**Still not executed:** any database-backed test, any load test. The concurrency tests **are** executed — the transition, field-write, dedup and crew-capacity suites all run on the dev store and are part of the CI unit suite; what is not exercised is concurrency against a real Postgres under load.

### Security assessment

**❌ NOT ACCEPTABLE for production as configured.**

The auth stack is genuinely well built at the component level: Argon2id with OWASP parameters, HMAC-signed server-side-revocable sessions, `timingSafeEqual` comparison, a typed OpenAPI spec, an append-only audit trail that no code path updates or deletes, and a PII boundary that holds — the citizen serializer strips `internalNote`, `assignedCrewId` and `reporterName`, anonymises trail actors, and the public serializer strips `locationLabel`.

**The failures are all at the seams**, and all are configuration-reachable rather than theoretical:

- `OTP_PROVIDER` **defaults to `stub`** (`lib/auth/otp-provider/index.ts:31`), and `dev_code` is returned **unconditionally** (`app/api/v1/auth/send-otp/route.ts:164`). A deployment that sets `DATABASE_URL`, `SESSION_SECRET` and Twilio credentials but forgets `OTP_PROVIDER` gets a stub provider *and* a plaintext OTP in every response — full account takeover with no credential theft.
- `OTP_MAX_ATTEMPTS` is exported from `lib/auth/otp.ts:32` and **imported nowhere**. `attempts` is incremented at `app/api/v1/auth/verify-otp/route.ts:111` and never read. The route's own docstring promises a 5-attempt lockout that does not exist.
- Four `/api/dev/*` routes are gated on `CITYFIX_DEV_PROMOTE_SECRET` only, with no `isDevStore()` check, unlike their two correctly-gated siblings. Two of them mint **admin sessions**, bypassing both the password and WebAuthn. A single leaked static secret yields unauthenticated privilege escalation.
- `PUT /api/profile` has no `requireRole`, no `requireWebAuthn` and no Zod schema.
- WebAuthn challenges are **never consumed**. One ceremony authorises every admin write for the next five minutes, which is not what ADR-007's threat model assumes.
- `CITYFIX_DEV_STORE` has **no production guard**. One env var disables the database, unsigns the session cookie and bypasses WebAuthn.

**The structural cause:** there is no `middleware.ts`. A route is protected only if its author remembered. ADR-007:229-234 predicted this exact failure mode — it was written down, tested, and then decayed outside the tree it governed.

### Performance assessment

**⚠️ NOT ASSESSED.**

No load test was run and no production dataset was available. What can be stated from source:

- The rate limiter and the login lockout are **in-process** (`lib/platform/rate-limit.ts:17`, `lib/auth/login-lockout.ts:38`). On a multi-instance deploy an attacker distributing requests across N instances gets N× the attempt budget, and a restart resets the lockout entirely. The docstrings are honest about this.
- Trail-derived aggregates (the adoption crew-response median, the monitor sparkline) are **per-ticket and unindexed by `toStatus`**. Fine at pilot volume; untested at city scale.
- No APM, no error tracking, no log aggregation is configured. Because the service layer returns `Result<T,E>` and never throws by design, **a failing request can look like a success** from the outside.

### Production deployment readiness

**❌ NOT DEPLOYABLE.**

The code builds, the CI pipeline is green, and the Vercel project is linked. What is missing is everything between "the build works" and "the service is correct":

- The `DATABASE_URL` in the deployed environment is unknown. Whether it points at Neon or a loopback address is **not inspectable from the repository**, and it decides whether three Critical findings are theoretical or live.
- `prisma migrate deploy` has never been run against a live database. No migration state was verified. There are now **five** migrations; the fifth (`20261108140000_ticket_dedup_key`) was applied to a throwaway PostgreSQL 16 container on 2026-11-08 to check the index's behaviour, but never to a live database.
- `OTP_PROVIDER`, `CITYFIX_DEV_STORE`, `DEV_SKIP_WEBAUTHN` and `CITYFIX_DEV_PROMOTE_SECRET` are all **unknown in production**.
- The real-mode run is **blocked**: `lib/platform/db-guard.ts` correctly refuses a loopback `DATABASE_URL` under `NODE_ENV=production`, so a genuine production-mode run needs a hosted Neon URL.
- No monitoring, no alerting, no uptime check, no error tracking, no backup/restore verification.
- No `BLOB_*` variable is documented in `.env.example` — a production deployment with none set silently gets the local provider, which writes to the filesystem and serves **dead URLs**.

### Remaining blockers

**Must be closed before any production traffic.**

| # | Blocker | Severity | Evidence |
|---|---|---|---|
| 1 | Four `/api/dev/*` routes not `isDevStore()`-gated; two mint admin sessions | Critical | `app/api/dev/{bootstrap-admin,issue-session,list-users,promote-admin}/route.ts` |
| 2 | `dev_code` returned unconditionally; `OTP_PROVIDER` defaults to `stub` | Critical | `app/api/v1/auth/send-otp/route.ts:164`; `lib/auth/otp-provider/index.ts:31` |
| 3 | `OTP_MAX_ATTEMPTS` never enforced | Critical | `app/api/v1/auth/verify-otp/route.ts:111`; `lib/auth/otp.ts:32` |
| 4 | No production guard on `CITYFIX_DEV_STORE` | Critical | — |
| 5 | **Concurrency control — 1 of 5 scenarios remains vulnerable** (the transition, field-write and duplicate-submission paths are closed) | Medium | Crew capacity — a product decision, not a race |
| 6 | `PUT /api/profile` is an ungated admin write | High | `app/api/profile/route.ts:26-59` |
| 7 | WebAuthn challenges never consumed | High | `lib/auth/guards.ts:113-125` |
| 8 | Admin city-scoped routes skip the city check (needs ADR-006) | High | `app/api/v1/admin/cities/[id]/**` |
| 9 | Password login is not role-restricted | High | `app/api/v1/auth/login/route.ts:137-139` |
| 10 | The four production env vars are unverified | Critical | — |

**Blocks a *correct* launch, not merely a safe one:**

| # | Blocker | Severity | Evidence |
|---|---|---|---|
| 11 | `SlaPolicy` is defined, seeded and never consulted; its schema comment claims otherwise | Medium | `prisma/schema.prisma:123` |
| 12 | Four `Ticket` timestamps missing — two of four operational questions are only partially answerable | Medium | `prisma/schema.prisma:311-372` |
| 13 | `null` collapsed to `0` in adoption metrics — "no data" is indistinguishable from "zero" | Medium | `lib/admin/adoption.ts:548-566` |
| 14 | No `/api/blob` route — local photos are dead links | Medium | `lib/storage/blob.ts:180` |
| 15 | No `middleware.ts` — the structural cause of #6 and #8 | Medium | — |
| 16 | `lib/map/osm-raster.ts` at 0% coverage — a regression is a blank map | Medium | coverage report |

---

## Stage 1 — Foundation & project structure

| # | Item | Status | Evidence |
|---|---|---|---|
| 1.1 | Repository is a git repository with a clean, linear history | ✅ | 135 commits, squash-merged per `aidlc/spaces/default/memory/org.md` |
| 1.2 | TypeScript strict mode enabled, `tsc --noEmit` clean | ✅ | `npx tsc --noEmit` → clean |
| 1.3 | `isolatedModules: true`; no const-enum access | ✅ | `tsconfig.json`; enforced by `project.md` Forbidden |
| 1.4 | Path alias `@/` → repo root resolves | ✅ | `tsconfig.json` |
| 1.5 | ESLint configured and run in CI | ✅ | `npm run lint` → 0 errors, 55 warnings |
| 1.6 | Lint gate blocks the pipeline | ✅ | `.github/workflows/ci.yml` step 5 |
| 1.7 | Prettier / formatter configured | ➖ | No Prettier config in the repo; ESLint is the formatter of record per `org.md` |
| 1.8 | `package.json` scripts cover the full lifecycle | ✅ | `dev`, `build`, `start`, `lint`, `test:unit`, `test:unit:coverage`, `test:mockups`, `db:*`, `docs:generate`, `check:i18n` |
| 1.9 | `engines.node` declared | ✅ | `>=20.0.0` (runtime floor; CI pins 22 — see §5.3) |
| 1.10 | No secrets committed to the repository | ✅ | `.env.example` holds placeholders only |
| 1.11 | `docs/running.md` matches the current codebase | ✅ | **Rewritten during this audit** against the real stack — all 61 route files with their methods, all 26 `package.json` scripts, the Node 22 requirement, the visual-baseline platform rule. It previously claimed 40 handlers / 249 tests / 15 baselines. See [KNOWN_ISSUES.md #26](KNOWN_ISSUES.md#26-docsrunningmd-is-stale---resolved-during-this-audit) |
| 1.12 | `.env.example` documents every variable `lib/` reads | ❌ | Missing `CITYFIX_DEV_PROMOTE_SECRET`, `DEV_SKIP_WEBAUTHN` and **all** `BLOB_*` |

---

## Stage 2 — Database & data layer

| # | Item | Status | Evidence |
|---|---|---|---|
| 2.1 | Prisma schema defined and committed | ✅ | `prisma/schema.prisma` — 16 models |
| 2.2 | Migrations exist for the schema | ✅ | 5: `20261012102438_init`, `20261013000000_add_ticket_photo`, `20261027140000_platform_gaps`, `20261108120000_ticket_version`, `20261108140000_ticket_dedup_key` |
| 2.3 | Migrations have been applied to a live database | ⚠️ | No database reachable during the audit |
| 2.4 | All database access goes through `lib/db.ts` — no raw SQL | ✅ | Repo-wide search for `$queryRaw` / `$executeRawUnsafe` → no hits in app code |
| 2.5 | Referential integrity is declared | ✅ | `onDelete` specified on every relation |
| 2.6 | `Ticket` has a uniqueness constraint | ❌ | **No `@@unique` on `Ticket`** — `prisma/schema.prisma:311-374`. The DB cannot prevent duplicate tickets |
| 2.7 | `Ticket` / `TicketTrailEntry` / `TicketPhoto` have uniqueness constraints | ❌ | None of the three has `@@unique` |
| 2.8 | `AuditEntry` deletion does not block legitimate user deletion | ⚠️ | `onDelete: Restrict` (`schema.prisma:428-443`) vs `lib/admin/users-db.ts:436-460` — needs a live DB |
| 2.9 | `Ticket` carries the timestamps honest metrics need | ❌ | No `routedAt`, `firstResponseAt`, `assignedAt`, `startedAt` — `prisma/schema.prisma:311-372` |
| 2.10 | Seed data is idempotent | ✅ | `prisma/seed.ts` — Dhaka template: 1 city, 10 wards, 3 departments, 6 categories, 1 user per role |
| 2.11 | `SlaPolicy` is actually consulted by the product | ❌ | Defined and seeded, **never read**; `schema.prisma:123` claims otherwise |
| 2.12 | Production DB guard rejects a loopback `DATABASE_URL` | ✅ | `lib/platform/db-guard.ts` — 100% line coverage; handles URL and libpq forms; latches on success |

---

## Stage 3 — Authentication

| # | Item | Status | Evidence |
|---|---|---|---|
| 3.1 | Password hashing uses a modern KDF | ✅ | Argon2id, `@node-rs/argon2`, OWASP params (19 MiB / t=2 / p=1) — `lib/auth/password.ts` |
| 3.2 | Sessions are server-side and revocable | ✅ | `Session` rows; `DELETE FROM "Session"` invalidates every session immediately |
| 3.3 | Session cookies are signed | ✅ | HMAC, `timingSafeEqual`, 14-day TTL — `lib/auth/session.ts` |
| 3.4 | Session cookie is `httpOnly` + `sameSite` + `secure` in production | ✅ | `lib/auth/session.ts` |
| 3.5 | OTP delivery has a real provider | ✅ | `twilio` provider with 3-attempt backoff `[100,200,400]ms` and 4xx-as-permanent |
| 3.6 | `OTP_PROVIDER` defaults to a safe value in production | ❌ | Defaults to `'stub'` — `lib/auth/otp-provider/index.ts:31` |
| 3.7 | OTP code is never returned in a response in production | ❌ | `dev_code: code` returned unconditionally — `app/api/v1/auth/send-otp/route.ts:164` |
| 3.8 | OTP attempt limit is enforced | ❌ | `attempts` incremented, never read — `verify-otp/route.ts:111`; `OTP_MAX_ATTEMPTS` imported nowhere |
| 3.9 | Account lockout after repeated failures | ❌ | Documented in the route docstring, absent in the code |
| 3.10 | OTP code uses a CSPRNG | ❌ | `Math.random()` — `lib/auth/otp.ts` |
| 3.11 | WebAuthn registration and assertion work | ✅ | `@simplewebauthn/server` v10; RP ID/origin guards in production |
| 3.12 | WebAuthn challenges are consumed on use | ❌ | No `delete`/`update` on `webAuthnChallenge` anywhere — `lib/auth/guards.ts:113-125` |
| 3.13 | Admin writes require a fresh WebAuthn assertion | ⚠️ | ADR-007 is enforced on `/api/v1/admin/*` and the shared transition route — but **not** on `PUT /api/profile` |
| 3.14 | Password login is role-restricted | ❌ | No `role` constraint — `app/api/v1/auth/login/route.ts:137-139` |
| 3.15 | Dev-only auth bypasses are `isDevStore()`-gated | ❌ | `DEV_SKIP_WEBAUTHN` is double-gated, but four `/api/dev/*` routes are secret-gated only |
| 3.16 | `CITYFIX_DEV_STORE` cannot be set in production | ❌ | **No production guard exists** |
| 3.17 | `/api/auth/status` does not leak the session identifier | ❌ | Echoes the identifier half of the cookie — `app/api/auth/status/route.ts:57` |
| 3.18 | The dev-only sign-in route is unreachable in production | ✅ | `/api/dev/login` → 404 via `isDevStore()` — `app/api/dev/login/route.ts:54-56` |

---

## Stage 4 — Authorization

| # | Item | Status | Evidence |
|---|---|---|---|
| 4.1 | Guards exist for role, city and scope | ✅ | `requireRole`, `requireSameCity`, `requireScope` — `lib/auth/guards.ts` |
| 4.2 | `requireRole` returns the correct HTTP status | ❌ | Returns 401 where 403 is expected — `app/api/tickets/[id]/transition/route.ts:79` |
| 4.3 | Every admin route calls `requireRole(session, 'admin')` | ✅ | Verified across all 23 admin operations |
| 4.4 | Admin city-scoped routes check the caller's city | ❌ | 12 routes under `/api/v1/admin/cities/[id]/**` skip the check; `/api/v1/admin/tickets/[id]` enforces it. **Needs ADR-006** |
| 4.5 | ADR-006 exists | ⚠️ | Not present in `docs/adr/`. Its absence leaves 4.4 undecidable from the code |
| 4.6 | A baseline route guard exists | ❌ | **No `middleware.ts`** — a route is protected only if its author remembered |
| 4.7 | `PUT /api/profile` requires a role and, for admins, WebAuthn | ❌ | Neither guard present — `app/api/profile/route.ts:26-59` |
| 4.8 | The dev-privilege routes are gated on the dev store | ❌ | `bootstrap-admin`, `issue-session`, `promote-admin`, `list-users` — secret-only |
| 4.9 | `requireScope` correctly exempts admins | ✅ | ADR-007:26-33 — an admin session is city-wide authority |
| 4.10 | Dispatcher and crew writes are correctly *not* admin writes | ✅ | ADR-007 scope — the shared transition route does not demand WebAuthn from them |

---

## Stage 5 — Data integrity & concurrency

**This stage did not exist in the original plan. It was added because the plan named concurrency as "the highest-value technical risk in the codebase." Full evidence: [CONCURRENCY_AND_ACCOUNTABILITY_AUDIT.md](CONCURRENCY_AND_ACCOUNTABILITY_AUDIT.md).**

| # | Item | Status | Evidence |
|---|---|---|---|
| 5.1 | Ticket status transitions use a conditional write | ✅ | `lib/platform/transitions.ts` — `tx.ticket.updateWhere({ where: { id, status, version } })`, a count-checked compound predicate |
| 5.2 | The status update, trail insert and audit write are atomic | ✅ | `lib/platform/transaction.ts` — one transaction; `writeAudit(input, tx)` writes through the transaction handle |
| 5.3 | Concurrent transitions cannot both succeed | ✅ | The loser matches zero rows and is rejected with `ConcurrentTransitionError`; all three routes return 409 |
| 5.4 | The status trail cannot contradict the ticket's actual status | ✅ | **The most consequential finding — closed.** One trail row per successful transition; the loser's rollback removes only its own rows |
| 5.5 | Concurrent crew assignments cannot both succeed | ✅ | `lib/dispatcher/assign-crew.ts` — a compare-and-swap on `version`; the loser raises `ConcurrentWriteError` and the route returns 409 `concurrent_write` |
| 5.6 | Concurrent field edits (ward, category, internal note) cannot both succeed | ✅ | `app/api/v1/dispatcher/tickets/[id]/route.ts` — each of the three writes is a compare-and-swap on `version`; the loser returns 409 `concurrent_write` |
| 5.7 | Concurrent duplicate submissions cannot both create a ticket | ✅ | **RESOLVED 2026-11-08** — a unique index on `(cityId, dedupKey)` is the backstop. The loser's insert is refused with SQLSTATE `23505`; the route catches it, re-runs the scan, and returns the same `dedup_match` prompt the winner got. No second ticket, and the loser is not charged |
| 5.8 | The database provides a backstop against duplicate tickets | ✅ | `@@unique([cityId, dedupKey])` — migration `20261108140000_ticket_dedup_key`. The key is a SHA-256 of `(cityId, categoryId, locationLat, locationLng)` and is **nullable**, because Postgres treats NULLs in a unique index as distinct — that is what lets a declined duplicate be filed |
| 5.9 | Crew assignment is capacity-constrained | ✅ | **RESOLVED 2026-11-08** — `lib/dispatcher/crew-capacity.ts` enforces the limit the UX spec already set (5 active tickets) and `assign-crew.ts` refuses a member at the limit with **409 `crew_at_capacity`**. A counting rule, not a uniqueness rule, so no index can express it; the check-then-act race is accepted and documented. The picker reports the same count, so the hint and the trust boundary cannot disagree |
| 5.10 | The abstraction can express a compound guard | ✅ | `db.ticket.updateWhere` in `lib/db-switch.ts`; `devDb.ticket.updateWhere` in `lib/dev-store.ts` implements the same guard |
| 5.11 | Transactions are used where multi-statement atomicity is required | ✅ | `lib/platform/transaction.ts` — `prisma.$transaction` on the Prisma path, snapshot-and-restore on the dev-store path |
| 5.12 | Optimistic locking exists | ✅ | `Ticket.version Int @default(0)` — migration `20261108120000_ticket_version` |
| 5.13 | Serializable isolation is requested where needed | ❌ | `lib/db.ts` — no `isolationLevel` option; no `SELECT … FOR UPDATE` anywhere. **Not needed for the transition path**: the compare-and-swap guard lives in the `where` clause, so it holds under `READ COMMITTED`. **Also not needed for the submit path**: the unique index closes that window outright rather than narrowing it, so a `Serializable` transaction would buy nothing the index does not already give |
| 5.14 | The test suite would catch a lost update | ✅ | `tests/unit/transitions-concurrency.test.ts` (13 tests) + `tests/unit/writes-concurrency.test.ts` (10 tests) + `tests/unit/dedup-concurrency.test.ts` (18) + `tests/unit/dedup-route-race.test.ts` (6) + `tests/unit/dispatcher/crew-capacity.test.ts` (14) against the real dev store. Verified non-vacuous: neutering the compare-and-swap turns 7 of the first and 4 of the second red; neutering the dev store's unique index turns 3 of the 18 and 1 of the 6 red; neutering `atCapacity` turns 3 of the 14 red |
| 5.15 | The audit trail records concurrent-write conflicts | ❌ | A rejected transition writes **no** audit row — the loser is visible as a 409 to the client, but not in the audit log. The audit log records what happened, not what was refused |
| 5.16 | The idempotent/append-only photo path is safe under concurrency | ✅ | Photos are appended, not overwritten — both rows survive. Ordering within a timestamp window is arbitrary, but no data is lost |
| 5.17 | The audit trail is immutable | ✅ | No code path updates or deletes an `AuditEntry` |

**Stage 5 status: 14 of 17 items now pass** (was 1 of 17). The transition path — the worst case, and the one the audit called the most consequential finding in the entire audit — is closed at source and covered by a CI-enforced test, and the concurrent field writes are closed the same way. Duplicate submission (5.7) is now closed by a unique index rather than by a transaction, because the two are not equivalent here: a radius-keyed index would have made the dedup-decline path uncreatable, so the key is the **exact** spot, the 50 m Haversine scan stays the prompt, and the column is nullable so a declined duplicate is still filable. Crew capacity (5.9) was long assumed to be a product decision rather than a defect — but the answer was already written down in the UX spec (a red load badge above 5, a load-based sort, a 409 "crew just took another job"), so it was an **unimplemented specification** and is now implemented. The two items still failing are 5.13 (no `Serializable` isolation — deliberately not needed, since both remaining windows are closed by a guard in the `where` clause and by a unique index) and 5.15 (a rejected write writes no audit row — the audit log records what happened, not what was refused).

---

## Stage 6 — API surface

| # | Item | Status | Evidence |
|---|---|---|---|
| 6.1 | Every route has an OpenAPI entry | ✅ | 53 paths / 68 operations of 77 live. The 8 dev/docs route files are excluded **by design**. The spec's 2 phantom methods (`PATCH`/`DELETE` on `/api/tickets/{id}`) were **deleted on 2026-11-08** and the JSON artifact regenerated. See [KNOWN_ISSUES.md #31](KNOWN_ISSUES.md#31-the-openapi-spec-documents-two-methods-that-do-not-exist---resolved-2026-11-08) |
| 6.2 | The OpenAPI spec is type-checked | ✅ | `lib/docs/openapi.ts` is typed code — `tsc` catches a malformed component reference |
| 6.3 | Every API boundary validates input with Zod | ⚠️ | Holds across `app/api/**` except `app/api/profile/route.ts` (hand-rolled validation at `:46-51`) |
| 6.4 | Error codes are consistent across the surface | ❌ | 5 live divergences — see [KNOWN_ISSUES.md §17-21](KNOWN_ISSUES.md#api-consistency) |
| 6.5 | `requireRole` error status matches the body | ❌ | Body says `403 forbidden_role`, status is 401 |
| 6.6 | Service-layer functions return `Result<T,E>` and never throw | ✅ | Team rule, verified across `lib/` |
| 6.7 | No route returns a raw Prisma row | ✅ | Every read goes through `lib/serializers/` |
| 6.8 | The citizen serializer strips internal fields | ✅ | `internalNote`, `assignedCrewId`, `reporterName` stripped; trail actors anonymised |
| 6.9 | The public serializer strips `locationLabel` | ✅ | It can carry a street address |
| 6.10 | Rate limiting is applied to the sensitive routes | ✅ | Per-IP token bucket on the OTP and login paths |
| 6.11 | Rate limiting works across instances | ❌ | In-process `Map` — `lib/platform/rate-limit.ts:17` |
| 6.12 | Login lockout survives a restart | ❌ | In-process — `lib/auth/login-lockout.ts:38` |
| 6.13 | The OpenAPI spec matches the live route handlers | ✅ | **Now enforced mechanically.** `tests/unit/docs/openapi-route-parity.test.ts` reads every `app/api/**/route.ts` from disk, extracts its exported HTTP methods, and compares them against `openapiPaths` in both directions. Verified non-vacuous by renaming a live `PATCH` export and confirming the suite went red. See [KNOWN_ISSUES.md #31](KNOWN_ISSUES.md#31-the-openapi-spec-documents-two-methods-that-do-not-exist---resolved-2026-11-08) |

---

## Stage 7 — Frontend

| # | Item | Status | Evidence |
|---|---|---|---|
| 7.1 | All four role surfaces are implemented | ✅ | 37 pages — citizen 10, dispatcher 6, crew 4, admin 10, plus public 2, auth 3, dev 1 |
| 7.2 | The citizen report flow is complete | ✅ | 5-step flow with photo capture and location map |
| 7.3 | All user-facing copy goes through `lib/i18n/keys.ts` | ✅ | 957 keys, typed registry, `npm run check:i18n` fails on an unregistered key |
| 7.4 | The design system is committed alongside the code | ✅ | `design-artifacts/D-Design-System/` — tokens, icon registry, primitives, 12 mockups |
| 7.5 | Visual regression baselines exist and gate the pipeline | ✅ | 25 baselines; CI step 10 |
| 7.6 | The baselines are deterministic on the asserting platform | ✅ | Regenerated on `ubuntu-latest`; `regenerate-baselines.yml` workflow |
| 7.7 | The admin ticket page offers a WebAuthn ceremony affordance | ❌ | `app/admin/tickets/[id]/page.tsx` has no ceremony affordance — an admin without a registered key sees a bare error |
| 7.8 | Wave 2 of the UI redesign is built | ❌ | 8 of 12 mockups unbuilt — blocked on human mockup approval |
| 7.9 | The webfont is self-hosted | ❌ | Loaded from Google Fonts — this is the root cause of the platform-baseline drift |
| 7.10 | Client-side XSS sinks were reviewed | ⚠️ | `components/` was reviewed only where it bore on the API contract |
| 7.11 | The map renders with real tile URLs | ⚠️ | `lib/map/osm-raster.ts` is at **0% coverage** — a regression is a blank map and no gate catches it |
| 7.12 | Local blob photos render | ❌ | No `/api/blob` route exists — the URLs are dead links on every surface that renders them |

---

## Stage 8 — Operational accountability

**Also added by this audit — the plan named this as the third CityFix-specific priority.**

| # | Item | Status | Evidence |
|---|---|---|---|
| 8.1 | Metrics are computed from real ticket data, not placeholders | ✅ | Repo-wide grep for `Math.random`/`mock`/`placeholder`/`sample`/`demo`/`dummy`/`hardcod` → **no hits in any metric path** |
| 8.2 | The 27 audited metrics each trace to real DB columns | ✅ | Full inventory in [CONCURRENCY_AND_ACCOUNTABILITY_AUDIT.md §B.1](CONCURRENCY_AND_ACCOUNTABILITY_AUDIT.md#b1-metric-inventory) — 25 REAL, 2 PARTIAL |
| 8.3 | Time-to-resolve is measurable | ✅ | `resolvedAt − createdAt`, computed independently in three surfaces |
| 8.4 | Complaint hotspots by ward and category are measurable | ✅ | `lib/admin/adoption.ts:430-459`; `lib/dispatcher/performance.ts:322-334` |
| 8.5 | How long reports remain pending is measurable | ⚠️ | **PARTIAL** — no time-to-route metric; ticket age and time-to-first-move exist but are not surfaced as a pending-duration KPI |
| 8.6 | How quickly dispatchers verify reports is measurable | ⚠️ | **PARTIAL** — the monitor sparkline is a real time-to-first-move measure but not dispatcher-attributable |
| 8.7 | SLA breaches are detected and surfaced | ❌ | `SlaPolicy` is never consulted; the schema comment claiming otherwise is false |
| 8.8 | "No data" is distinguishable from "genuinely zero" | ❌ | `lib/admin/adoption.ts:548-566` collapses `null` → `0` |
| 8.9 | The dispatcher performance table handles the same case | ✅ | `avgTimeToResolveMs: null` → a "not enough data" state — `app/dispatcher/performance/page.tsx:696-698` |
| 8.10 | Empty monitor days render an empty state, not a zero | ✅ | `app/dispatcher/monitor/page.tsx:1002` |
| 8.11 | Audit pages render only API-fetched numbers | ✅ | All three audited pages fetch and render directly; no locally computed metrics |

---

## Stage 9 — Testing & CI

| # | Item | Status | Evidence |
|---|---|---|---|
| 9.1 | A unit test suite exists | ✅ | 109 files, 1,939 tests, ~28 s |
| 9.2 | The coverage floor is enforced in CI | ✅ | 80%, `all: true` so an untested file counts against the threshold |
| 9.9 | A concurrency test suite exists | ✅ | `tests/unit/transitions-concurrency.test.ts` (13) + `tests/unit/writes-concurrency.test.ts` (10) + `tests/unit/platform/transaction.test.ts` (16) + `tests/unit/dedup-concurrency.test.ts` (18) + `tests/unit/dedup-route-race.test.ts` (6) + `tests/unit/dispatcher/crew-capacity.test.ts` (14) — drive concurrent transitions, concurrent field writes, concurrent duplicate submissions and the crew-capacity rule against the real dev store and assert exactly one winner |
| 9.3 | Coverage exceeds the floor | ✅ | 92.59% lines / 83.08% branches / 93.66% functions — **re-measured** after the crew-capacity work |
| 9.4 | The CI pipeline is green | ✅ | Run `42480698041` on `da9f542` — 12/12 steps |
| 9.5 | The pipeline runs on the same Node version as documented | ✅ | Node 22 pinned — `jsdom@30` → `undici@8` needs `>=22.19.0` |
| 9.6 | Playwright route specs cover all four roles | ✅ | **33 files / 333 specs** — `02-live-audit`, `09-dispatcher-auth`, `13-crew-auth`, `16-admin-webauthn`, `28-role-walkthrough` |
| 9.7 | The route specs run in CI | ❌ | CI runs the unit suite and the mockup baselines, **not** the route specs. The blocker is the dev server's lifecycle inside CI plus the per-test coordinate isolation the dev store still lacks |
| 9.8 | The route specs pass | ✅ | **Executed 2026-11-08 — 321 passed / 35 failed / 2 skipped** across 33 files, 14.4 min. Every failure was triaged; all functional failures are closed and the 35 remaining were stale visual baselines, refreshed on `ubuntu-latest` by workflow run `42501672037` (32 changed, 27 unchanged, 4 new — the 4 being baselines for two specs that had never captured one). The first run exposed two product defects — a serializer that dropped `closeReason`/`duplicateOfId` for every role, and a citizen header that stripped the required top-bar Report CTA |
| 9.10 | A test exists for the OTP attempt limit | ❌ | The limit is dead code, so there is nothing to test — **but a test should exist and fail** |
| 9.11 | A test exists for `PUT /api/profile` WebAuthn gating | ❌ | The suite asserts what the code does, not what ADR-007 says it should — the same class of miss ADR-007:229-234 predicted |
| 9.12 | A cross-city admin test exists | ❌ | Neither admin behaviour is pinned by a test |
| 9.13 | The dev store is a faithful stand-in for Postgres | ⚠️ | **Improved for the transition, field-write, submit and crew-capacity paths** — `devDb.ticket.updateWhere` implements the same compound guard and returns the same affected-row count, `devDb.ticket.create` implements the `(cityId, dedupKey)` unique index with Postgres's exact semantics (SQLSTATE `23505`, and NULLs treated as distinct), and `devDb.ticket.findMany` filters on `assignedCrewId` with Prisma's NULL semantics so the capacity count is real. Four concurrency suites exercise them in CI. `ticketPhoto.create`'s push-then-sort is still unsafe — that one is a photo-ordering question, not a race guard |
| 9.14 | The test suite runs against a live database | ❠️ | No database-backed CI job |
| 9.15 | Load testing has been performed | ⚠️ | No load test was run or is defined |
| 9.16 | WebAuthn is exercised against real hardware | ⚠️ | No authenticator was available; attestation, assertion and counter-clone detection were read, not executed |
| 9.17 | SMS delivery is exercised against the live provider | ⚠️ | The Twilio retry backoff and 4xx classification were read, not run against the API |

---

## Stage 10 — Deployment & operations

| # | Item | Status | Evidence |
|---|---|---|---|
| 10.1 | The production build succeeds | ✅ | `npm run build` green on CI |
| 10.2 | The hosting target is configured | ✅ | Vercel project `cityfix` linked — `.vercel/project.json` |
| 10.3 | The Node version is pinned on the host to match CI | ⚠️ | `package.json` declares `>=20.0.0`; the Vercel build must be pinned to 22 manually |
| 10.4 | `DATABASE_URL` points at a managed, non-loopback host in production | ⚠️ | Not inspectable from the repository |
| 10.5 | `SESSION_SECRET` is set, unique and ≥32 chars | ⚠️ | Enforced at runtime (`lib/auth/session.ts:22-28`) but unverified in the deployed environment |
| 10.6 | `OTP_PROVIDER=twilio` in production | ⚠️ | Unverified — and the default is the unsafe `stub` |
| 10.7 | Twilio credentials are set | ⚠️ | Unverified; the provider throws if any of the three is missing |
| 10.8 | `CITYFIX_DEV_STORE` is unset in production | ⚠️ | Unverified — **and there is no guard** |
| 10.9 | `DEV_SKIP_WEBAUTHN` is unset in production | ⚠️ | Unverified |
| 10.10 | `CITYFIX_DEV_PROMOTE_SECRET` is unset in production | ⚠️ | Unverified — and the four routes it gates are not dev-gated |
| 10.11 | `BLOB_PROVIDER=s3` with credentials and `BLOB_PUBLIC_BASE_URL` | ⚠️ | Unverified — and no `BLOB_*` variable appears in `.env.example` |
| 10.12 | WebAuthn RP ID and origin are the production hostname | ⚠️ | Unverified; the code refuses `localhost`/non-https in production |
| 10.13 | Migrations are applied before new traffic is served | ⚠️ | The recommended CI-job path is documented but no such job exists |
| 10.14 | A rollback path is documented | ✅ | `DEPLOYMENT_GUIDE.md` §7 — deploy rollback, Neon point-in-time recovery, secret rotation |
| 10.15 | A health check endpoint exists | ✅ | `GET /api/auth/status` — documented as the uptime target |
| 10.16 | Error tracking / APM is configured | ❌ | None — and the `Result<T,E>` design means a failed request can look successful |
| 10.17 | Log aggregation is configured | ❌ | Vercel function logs only |
| 10.18 | Database alerting is configured | ❌ | None on Neon |
| 10.19 | SLA breach alerting is configured | ❌ | `SlaPolicy` exists; the monitor computes nothing against it; nothing notifies |
| 10.20 | OTP delivery monitoring is configured | ❌ | With Twilio, a delivery failure is currently invisible |
| 10.21 | Backup and restore has been verified | ⚠️ | Neon point-in-time recovery is documented; no restore has been performed |
| 10.22 | A production-mode run has been demonstrated | ❌ | **Blocked** — the db-guard correctly refuses a loopback `DATABASE_URL`; a real run needs a hosted Neon URL |
| 10.23 | Operational runbooks exist for the known failure modes | ✅ | Four runbooks — blank map, wrong font, SMS not delivered, admin `webauthn_required` |
| 10.24 | Self-hosted Bengali webfont | ❌ | Loaded from Google Fonts; also the root cause of the baseline platform drift |

---

## Stage 11 — Documentation

| # | Item | Status | Evidence |
|---|---|---|---|
| 11.1 | Architecture is documented | ✅ | `docs/ARCHITECTURE.md` |
| 11.2 | The API is documented | ✅ | `docs/API_DOCUMENTATION.md` — all 77 operations |
| 11.3 | Security findings are documented with evidence | ✅ | `docs/SECURITY_AUDIT.md` — 17 findings |
| 11.4 | Testing is documented | ✅ | `docs/TESTING_REPORT.md` |
| 11.5 | Deployment is documented | ✅ | `docs/DEPLOYMENT_GUIDE.md` |
| 11.6 | Known issues are indexed | ✅ | `docs/KNOWN_ISSUES.md` — 31 flags |
| 11.7 | The project is documented | ✅ | `docs/PROJECT_AUDIT.md` |
| 11.8 | Concurrency and accountability are documented | ✅ | `docs/CONCURRENCY_AND_ACCOUNTABILITY_AUDIT.md` |
| 11.9 | A change log exists | ✅ | `docs/CHANGELOG.md` |
| 11.10 | `docs/running.md` is current | ✅ | **Rewritten during this audit** — all 61 route files, all 26 scripts, the Node 22 requirement and the visual-baseline rule now match the real stack |
| 11.11 | ADRs exist for the architectural decisions in force | ⚠️ | `ADR-007` and `ADR-016` exist; **`ADR-006` is missing**, and its absence leaves the admin city-scope question undecidable |
| 11.12 | The design artefacts are committed with the code | ✅ | `design-artifacts/` — 6 trees, the contract Mimir builds against |
| 11.13 | The AIDLC state reflects reality | ❌ | `aidlc-state.md` is ~2 months stale; `Scope: mvp` vs `project.md`'s `feature` default |

---

## Stage 12 — Evidence the plan asked for explicitly

The plan's three CityFix-specific priorities, plus its request for a demonstrated lifecycle.

| # | Item | Status | Evidence |
|---|---|---|---|
| 12.1 | **Audit trail — who verified a report** | ⚠️ | `writeAudit()` records the actor and action, but a *verification* event is not a distinct action in the audit trail |
| 12.2 | **Audit trail — who assigned a crew** | ✅ | `lib/dispatcher/assign-crew.ts:160-167` writes actor, `beforeValue`, `afterValue` |
| 12.3 | **Audit trail — who changed priority** | ⚠️ | No `priority` field exists on `Ticket` — the question has no referent |
| 12.4 | **Audit trail — when was it resolved** | ✅ | `Ticket.resolvedAt` plus the trail entry with `toStatus: 'resolved'` |
| 12.5 | **Audit trail — audit rows are immutable to non-admin actors** | ✅ | No code path updates or deletes an `AuditEntry`; `GET /api/v1/admin/audit` is admin-gated |
| 12.6 | **Audit trail — cancellations are traced** | ✅ | Cancellation is a status transition and writes both a trail entry and an audit row |
| 12.7 | **Concurrency — two dispatchers assign the same crew** | ✅ | **RESOLVED 2026-11-08** — compare-and-swap on `version`; the loser gets 409 `concurrent_write` and writes no audit row |
| 12.8 | **Concurrency — two dispatchers transition the same ticket** | ✅ | **RESOLVED 2026-11-08** — compare-and-swap on `(status, version)` inside one transaction; the loser gets 409 and writes no trail row |
| 12.9 | **Concurrency — two crew members update the same job** | ✅ | **RESOLVED 2026-11-08** — the crew route uses the same `transitionTicket` service, so the second crew member's transition loses its compare-and-swap. Photos remain safe (appended) |
| 12.10 | **Concurrency — two citizens submit the same report** | ✅ | **RESOLVED 2026-11-08** — the unique index on `(cityId, dedupKey)` is the backstop. The loser of the race is refused by the index, and the route recovers by re-running the scan and returning the same `dedup_match` prompt the winner got — no second ticket, no 500, and the loser is not charged |
| 12.11 | **Concurrency — a crew member assigned while already loaded** | ✅ | **RESOLVED 2026-11-08** — a 5-active-ticket capacity limit, enforced at the endpoint with a 409 `crew_at_capacity`; the picker reports the same count |
| 12.12 | **Concurrency was tested by issuing concurrent requests** | ⚠️ | **Now tested for the transition, field-write and submit paths** — `tests/unit/transitions-concurrency.test.ts`, `tests/unit/writes-concurrency.test.ts`, `tests/unit/dedup-concurrency.test.ts` and `tests/unit/dedup-route-race.test.ts` drive concurrent writers against the real dev store. Still not exercised against a real Postgres under concurrent load — CI has no database. The dedup index's behaviour **was** checked against a real PostgreSQL 16 by hand on 2026-11-08, but sequentially, not under load |
| 12.13 | **Operational accountability — metrics are from real timestamps** | ✅ | Verified — no metric uses placeholder data |
| 12.14 | **A four-account lifecycle demonstration with real DB records** | ❌ | **Not performed.** The Playwright suite covers all four roles and `/api/dev/login` provides persona sign-in, but it runs on the dev store, not a real database, and it was not executed in this audit |

---

## Items that could not be verified — and why

**This section is required, not optional.** Each item names the missing infrastructure, credential, human approval, or real-world validation.

### Missing infrastructure

| Item | What is missing |
|---|---|
| The live PostgreSQL migration state | No database was reachable. `prisma/schema.prisma` was read; whether the migrations have been applied is unknown. **Two migrations were added on 2026-11-08** — `20261108120000_ticket_version` (adding `Ticket.version`) and `20261108140000_ticket_dedup_key` (adding `Ticket.dedupKey` and its unique index) — and both are unapplied. The full chain was applied to a throwaway PostgreSQL 16 container to check the index's behaviour, but that container was destroyed and says nothing about any live database |
| `AuditEntry.actor` `onDelete: Restrict` vs user deletion | Needs a live database — see [KNOWN_ISSUES.md #25](KNOWN_ISSUES.md#25-auditentryactor-ondelete-restrict-vs-user-deletion) |
| A production-mode run | The db-guard correctly blocks a loopback `DATABASE_URL` under `NODE_ENV=production`. A real-mode run needs a hosted Neon `DATABASE_URL` |
| The deployed Postgres isolation level | `lib/db.ts:18-20` sets no `isolationLevel`, so the server default governs. The standard default is `READ COMMITTED`, under which every concurrency failure is real — but a non-default server setting could not be ruled out. **Note: the transition path's compare-and-swap does not depend on this** — the guard lives in the `where` clause, so it holds under `READ COMMITTED` and above |
| Metric query performance at city scale | Trail-derived aggregates are per-ticket and unindexed by `toStatus` |
| Backup and restore | Neon point-in-time recovery is documented; no restore was performed |

### Missing credentials or environment access

| Item | What is missing |
|---|---|
| The deployed environment's configuration | The Vercel dashboard was not reachable. Whether `CITYFIX_DEV_STORE`, `DEV_SKIP_WEBAUTHN`, `OTP_PROVIDER`, `CITYFIX_DEV_PROMOTE_SECRET` or any `BLOB_*` variable is set is **unknown — and decisive** for three Critical findings |
| A real WebAuthn authenticator | No hardware key or virtual authenticator was available. Attestation, assertion and counter-clone detection were read, not executed |
| Real SMS delivery | The Twilio provider's retry backoff and 4xx classification were read, not exercised against the live API |
| A live S3-compatible endpoint | The S3 upload path sits at 66.24% coverage and needs a real endpoint to test properly |

### Human approval required

| Item | What is missing |
|---|---|
| ADR-006 | Not in `docs/adr/`. Until it is written or found, it is not knowable from the code whether the admin city-scope divergence is a vulnerability or a design decision |
| Wave 2 mockup approval | 8 of 12 mockups are unbuilt; page implementation is blocked on human mockup approval |
| The decision on `CITYFIX_DEV_PROMOTE_SECRET` in production | Needs an explicit owner decision — the code cannot decide it |

### Real-world validation

| Item | What is missing |
|---|---|
| A live rate-limit measurement | The per-instance limitation is established from source (an in-process `Map`), not measured under load |
| Actual concurrent behaviour under load | **Now tested for the transition path** — `tests/unit/transitions-concurrency.test.ts` drives concurrent transitions against the real dev store and asserts exactly one winner. Still unverified against a real Postgres under concurrent load: CI has no database. The other four scenarios remain source-analysis only |
| Whether Neon sets a non-default isolation level | Not inspectable from the repository |
| Whether the metric numbers are correct in production | The computation paths were traced to their DB columns; no production dataset was available to sanity-check the arithmetic |
| Whether the seeded data biases the numbers | Structurally correct — the dev store seeds real timestamps — but the values on seeded data are not representative of real usage |
| The accuracy of the `routed`→`in_progress` median | The trail and the status update are now in one transaction, so the trail cannot disagree with the ticket. The median itself is still unverified against production data |
| Client-side XSS sinks | `components/` was reviewed only where it bore on the API contract |
| Image-content validation | The server enforces MIME and size; no polyglot/malformed-file detection exists |
| Playwright route specs | **Executed 2026-11-08** — 321 passed / 35 failed / 2 skipped. All functional failures closed; the 35 stale visual baselines were refreshed on `ubuntu-latest` by workflow run `42501672037`. Still not in the CI pipeline (row 9.7) |
| Load testing | No load test was run or is defined |
| A four-account lifecycle demonstration against a real database | Not performed — the substrate exists (333 route specs, `/api/dev/login`) and the specs now **run** against the dev store, but they have never run against a real database |

---

## The single most important thing

> **✅ FIXED 2026-11-08.** This section named `lib/platform/transitions.ts:48-86` as the single highest-value fix in the codebase. It has been made. The reasoning below is kept because it explains *why* the fix took the shape it did — and because the same reasoning still applies to the four remaining concurrency scenarios.

If only one thing is fixed, fix **`lib/platform/transitions.ts:48-86`**.

Everything else on this list degrades gracefully. A leaked dev secret requires an attacker who already has the secret. An unenforced OTP limit is bounded by a rate limiter that is one `Map` away from working. A missing city check needs two admins in two cities.

A concurrent transition needs **two dispatchers who are both doing their job**. There is no credential to steal, no misconfiguration to exploit, and no rare condition to hit. The dashboard exists precisely to make two dispatchers look at the same queue. The result is that the status trail — the citizen-facing trust surface, the thing the whole product thesis rests on — can describe a history that never happened.

It is also the cheapest to fix. A conditional write, a transaction, and a four-line change to widen a type signature.

**Why CI did not catch it:** the in-memory dev store makes the read-then-set pair effectively atomic by accident of Node's event loop, and CI runs entirely on the dev store. The defect is invisible to every gate in the pipeline.

That is the systemic pattern this audit found, and it is the same pattern ADR-007:229-234 predicted: **a rule enforced by convention is a rule that decays.** The fix has to be structural — a `middleware.ts` baseline, a route-level checklist that runs in CI, and concurrency semantics that the dev store actually models.

### What the fix looked like, and what it cost

The reasoning above predicted a small change. The implementation was larger, and the extra size is the interesting part:

- The conditional write and the transaction were both necessary but neither was sufficient.
- **`writeAudit` had to be re-pointed at the transaction handle.** Writing it through the module-level `db` would have committed the audit row even when the transition rolled back — the audit log would have recorded a transition that never happened, which is the same class of defect in the other direction.
- **The dev store's rollback had to be rewritten.** Restoring the trail collection wholesale was correct for one writer and wrong for two: the loser's rollback deleted the winner's trail row. The helper now tracks the ids of the rows its own callback appended and removes only those.
- **`updateWhere` and `bumpVersion` had to be translated explicitly onto the transaction-scoped client.** They are facade methods that reach for the root Prisma client, so binding them naively would have written outside the transaction.

Each of these is the same lesson the audit stated: **the fix has to be structural, or it decays.** A compare-and-swap without a transaction still lets the audit write escape; a transaction without a compare-and-swap still lets the last writer win; a compare-and-swap that CI cannot exercise still decays silently.

**The remaining four scenarios should be fixed the same way** — and the pattern to copy is now written down, tested and CI-enforced rather than described.

---

## Related documents

- [PROJECT_AUDIT.md](PROJECT_AUDIT.md) — the entry point
- [CONCURRENCY_AND_ACCOUNTABILITY_AUDIT.md](CONCURRENCY_AND_ACCOUNTABILITY_AUDIT.md) — the concurrency and accountability evidence
- [SECURITY_AUDIT.md](SECURITY_AUDIT.md) — the findings register
- [KNOWN_ISSUES.md](KNOWN_ISSUES.md) — the 31 flags
- [ARCHITECTURE.md](ARCHITECTURE.md) — the layers
- [API_DOCUMENTATION.md](API_DOCUMENTATION.md) — all 77 operations
- [TESTING_REPORT.md](TESTING_REPORT.md) — the suites and the gaps
- [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) — hosting and runbooks
- [CHANGELOG.md](CHANGELOG.md) — the changes this audit introduced
