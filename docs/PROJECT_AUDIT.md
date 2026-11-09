# CityFix — Project Audit

**Audit date:** 2026-11-08
**Codebase:** `main` @ `be9f2b0`
**Repository:** `SafetyManagement` (project name is CityFix)
**Auditor scope:** the whole repository — source, tests, CI, configuration, documentation and deployment artefacts

---

## 1. What this document is

A complete picture of CityFix as it stands: what was built, how it is put together, what works, what does not, and what cannot be assessed from the source alone.

It is the entry point to the other nine deliverables. Where this document summarises a finding, the linked document carries the evidence.

| Deliverable | Covers |
|---|---|
| **PROJECT_AUDIT.md** (this one) | The whole project — scope, structure, history, health |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Layers, data model, request lifecycle, ADRs |
| [API_DOCUMENTATION.md](API_DOCUMENTATION.md) | All 77 operations across 61 route handlers |
| [SECURITY_AUDIT.md](SECURITY_AUDIT.md) | 17 findings, severity-ranked, with evidence |
| [CONCURRENCY_AND_ACCOUNTABILITY_AUDIT.md](CONCURRENCY_AND_ACCOUNTABILITY_AUDIT.md) | Ticket-state integrity and operational metrics |
| [TESTING_REPORT.md](TESTING_REPORT.md) | Suites, coverage, gaps |
| [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) | Hosting, env vars, runbooks |
| [KNOWN_ISSUES.md](KNOWN_ISSUES.md) | 31 flags |
| [PRODUCTION_READINESS_CHECKLIST.md](PRODUCTION_READINESS_CHECKLIST.md) | The go/no-go |
| [CHANGELOG.md](CHANGELOG.md) | The release history |

**The verdict is in [PRODUCTION_READINESS_CHECKLIST.md](PRODUCTION_READINESS_CHECKLIST.md): 44% complete, 76 passed / 67 failed / 28 not verified / 1 not applicable — and not deployable.**

---

## 2. Project identity

| | |
|---|---|
| **Name** | CityFix |
| **One line** | A Bangla-first platform for citizens to report city issues and track them to resolution |
| **Repo folder** | `SafetyManagement` (the name is historical; the project is CityFix) |
| **Product brief** | `docs/idea.md`, `design-artifacts/A-Product-Brief/` |
| **Active space** | `default` |
| **Conversation language** | English for project surfaces; Bangla-first for product surfaces |
| **Licence** | Unlicensed (private) |

### The product thesis

**Civic observability.** Visibility is what makes a city's silence unmaintainable — an issue nobody sees stays unresolved indefinitely. The platform's job is to make issues visible to the people who can fix them, and to make the citizen's experience of that process legible enough to restore trust.

The trust signals are the mechanism:

| Signal | Implementation |
|---|---|
| **Status trail** | `TicketTrailEntry` — every transition, atomically with the status change |
| **Dedup, not rejection** | A near-duplicate raises a flag and asks the citizen; it never silently drops the report |
| **"Feel heard" feedback** | `lib/citizen/feedback.ts` — the citizen rates the response |
| **Push notifications** | Web Push (VAPID) — stubbed in v1, the wire call is v1.1 |

### Personas

| Persona | Role | Surface |
|---|---|---|
| **Rahim** | `citizen` | Report an issue, follow it, rate the response |
| **Habib** | `dispatcher` | Triage the queue, assign crews, adjudicate duplicates |
| **Rashid** | `crew` | Work assigned tickets, upload after-photos |
| **Aamir** | `admin` | Configure the city; every write requires a WebAuthn assertion |

The design optimisation target is the Rahim archetype (Persona 02); the broader Dhaka-tech-comfortable cohort is the post-pilot acceptance population, not the v1 surface.

---

## 3. History

**135 commits** since `71d6aa8 Initial Commit`.

| Phase | What happened |
|---|---|
| **Woods of Signal — design & spec** | Product brief, UX scenarios, tech audit, the design system, 12 mockups |
| **Intent 005 — platform layer** | Prisma schema, auth (password/OTP/session/WebAuthn), serializers, rate limit, audit, dedup, transitions, push, 5 API routes |
| **Intent 009 — the four personas** | The citizen report flow, the dispatcher console, the crew field app, the admin surface |
| **Intent 010 — the UI redesign** | A token system rebuilt for AA contrast, dark by default, 62 components, the MetricStrip hierarchy |
| **Hardening — 2026-10-29 → 2026-11-08** | The CI repair: Node 22, the lazy DB guard, ADR-007 enforcement on the shared transition route, the visual-baseline platform fix |

### The most recent work

The last ten commits are a single story: **CI was red on every run from 2026-10-29, and the red was hiding the other gates.**

```
45062d1  fix(ci): unblock CI — lazy production DB guard and lint cleanup
8e2289c  fix(ci): pin Node 22 so the unit suite stops dying at import time
ed739d7  fix(auth): gate the shared transition route behind ADR-007
b14ea27  ci: upload mockup diff artifacts on failure
f4dc984  ci: add a workflow to regenerate mockup baselines on the CI platform
e32147e  test(visual): regenerate the mockup baselines on the CI platform
be9f2b0  docs(visual): explain that the baselines are platform-specific
```

The Node 22 pin is the keystone. `jsdom@30` → `undici@8` requires `engines.node >= 22.19.0`; on Node 20 the Zstd constant it reaches for is `undefined` and the module throws at import time. The dev machine runs Node 24, so the suite was green locally while CI died with 16 unhandled errors. Because the unit step ran *before* the coverage floor and the visual gate, **both of those had been silently skipped for a month.**

CI run `42471075111` on `e32147e` concluded **success** — all 12 steps green, including the visual regression and the build.

### The visual-baseline fix, in detail

Worth recording because the failure looked like a design regression and was not.

Two causes were stacked:

1. **Stale baselines.** Commit `1f8c386` (the MetricStrip redesign) edited 7 mockups — swapping concentric-circle map pins for teardrop paths, rewording Bangla copy, adding `min-width: 0` to fix a grid overflow — but refreshed only 2 of the 25 PNGs. The other 23 were stale.
2. **Platform rasterisation.** The baselines were captured on a Windows dev machine; CI asserts on `ubuntu-latest`. Chromium rasterises the Noto Sans Bengali webfont differently, and `11-public-landing` at 1024×768 renders 40 px shorter on Linux (1526 px vs 1566 px).

The decisive evidence: regenerating on `ubuntu-latest` changed **exactly** the 10 failing baselines and left the other 15 byte-identical. The drift was never spread across the set.

The durable fix is a workflow — `regenerate-baselines.yml` — plus a rule now written into `tests-mockups/README.md`: **the baselines must be produced on the platform that asserts on them.** There is no baseline that satisfies both Windows and Linux.

---

## 4. What exists

### 4.1 Scale

| Metric | Value |
|---|---|
| Commits | 135 |
| Route handlers | 61 files, **77 operations** |
| `lib/` modules | 72 `.ts` + 1 `.tsx`, **23,521 LOC** |
| `app/api/` route handlers | **8,374 LOC** |
| `app/**/page.tsx` | 37 pages, **24,617 LOC** |
| Components | 62 `.tsx` files |
| Prisma models | 16 |
| Migrations | 5 |
| i18n keys | 957 |
| Unit test files | 111 (**1,960 tests**) |
| Playwright route specs | 34 files / **358 specs** |
| Mockup baselines | 25 (12 mockups) |
| Design artefacts | `design-artifacts/` — 6 trees, committed alongside the code |
| ADRs | 2 (`ADR-007`, `ADR-016`) |

**Every count in this table was measured on 2026-11-08** by parsing the working tree — not estimated. Where an earlier draft of this audit carried a different figure (74 `lib` files, 40 pages, 25,259 LOC of pages), the measured value is the one shown.

### 4.2 Feature surfaces

| Surface | Route | Pages | State |
|---|---|---|---|
| **Public** | `/`, `/feed` | 2 pages | Complete |
| **Citizen** | `/home`, `/report/*`, `/reports/*`, `/profile` | 10 pages | Complete — the 5-step report flow with photo capture and location map |
| **Dispatcher** | `/dispatcher/*` | 6 pages | Complete — queue, map, monitor, performance, dedup review |
| **Crew** | `/crew/*` | 4 pages | Complete — assignment list, ticket detail, after-photo upload |
| **Admin** | `/admin/*` | 10 pages | Complete — cities, taxonomy, wards, users, audit, adoption, tickets |
| **Auth** | `/login`, `/register`, `/verify-otp` | 3 pages | Complete — OTP + password + WebAuthn |
| **Dev** | `/dev/login` | 1 page | Dev-only |
| **Total** | | **37 pages** | |

The citizen page count is `/home` (1) + `/report/*` (6) + `/reports/*` (2) + `/profile` (1). The admin count of 10 covers the dashboard, the nine `/admin/*` sub-routes and the city-scoped adoption surfaces.

### 4.3 The platform layer

| Capability | Module | Status |
|---|---|---|
| Sessions | `lib/auth/session.ts` | Complete — HMAC-signed, server-side revocable |
| Passwords | `lib/auth/password.ts` | Complete — Argon2id, OWASP parameters |
| OTP | `lib/auth/otp.ts` + providers | **Two Critical defects** — see below |
| WebAuthn | `lib/auth/webauthn.ts` | Complete, but challenges are never consumed |
| Guards | `lib/auth/guards.ts` | Complete |
| Audit | `lib/platform/audit.ts` | Complete — append-only, immutable |
| Dedup | `lib/platform/dedup.ts` | Complete — Haversine, parameterised |
| Transitions | `lib/platform/transitions.ts` | Complete — the full legal/illegal matrix |
| Rate limit | `lib/platform/rate-limit.ts` | Complete but in-process |
| Push | `lib/platform/push.ts` | **Stubbed** — v1.1 |
| Serializers | `lib/serializers/` | Complete — the PII boundary holds |
| Blob storage | `lib/storage/blob.ts` | Complete for S3; **the local provider's URLs are dead** |
| DB guard | `lib/platform/db-guard.ts` | Complete and strong |
| i18n | `lib/i18n/keys.ts` | Complete — 957 keys, all registered |
| OpenAPI | `lib/docs/openapi.ts` | Complete — typed, so `tsc` catches drift |

### 4.4 The design system

`design-artifacts/D-Design-System/` holds the token system, the icon registry, the primitives reference and 12 mockups. All of it is committed alongside the code — the team's rule is that design artefacts are the contract Mimir builds against and the source of truth for UI/UX requirements.

The token system was rebuilt for AA contrast with dark as the default. The MetricStrip pass that produced commit `1f8c386` is the most recent design work, and its reasoning is recorded in `_progress/00-design-log.md`.

---

## 5. Verification status

### Everything that was executed on 2026-11-08

| Check | Command | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | ✅ clean |
| Lint | `npm run lint` | ✅ 0 errors, 55 warnings (all unused-vars in test files) |
| Unit tests | `npm run test:unit` | ✅ **111 files / 1,960 tests passed**, ~27 s |
| Coverage | `npm run test:unit:coverage` | ✅ **92.59% lines / 83.08% branches / 93.66% functions** (floor 80%) |
| i18n keys | `npm run check:i18n` | ✅ 957 keys, all registered |

### Verified on CI

| Check | Run | Result |
|---|---|---|
| Full pipeline | `42515694762` on `97cf0b4` | ✅ green end to end — lint, typecheck, unit, coverage, visual regression, build, route specs |
| Visual regression | Same run | ✅ 25/25 baselines |

### Executed after the audit snapshot

| Check | Command | Result |
|---|---|---|
| Playwright route specs (first execution, Windows) | `npm test` | **321 passed / 35 failed / 2 skipped** across 33 files, 14.4 min |
| Playwright route specs (Linux container) | `npm test` in the Playwright container | ✅ **324 passed / 2 failed / 7 skipped**, 11.2 min |
| Playwright route specs (CI) | `npx playwright test --grep-invert 'CityFix mockup baselines'` | ✅ green end to end — workflow run `42515694762` |

The route specs had never been run as a suite before 2026-11-08 — they were not in the CI pipeline, and the audit recorded them as *"not executed"*. The first full run produced **61 failures**, all triaged. Closing them exposed **two product defects**: `serializeTicketForRole` dropped `closeReason`/`duplicateOfId` for every role, and the citizen compact header stripped the top-bar Report CTA that WO-001 lists as a required acceptance item. All functional failures are now closed; the 35 stale visual baselines were refreshed on `ubuntu-latest` by workflow run `42501672037` (32 changed, 27 unchanged, 4 new — the 4 being baselines for two specs that had never captured one).

The Linux container is the **authoritative** measurement, because the visual baselines are asserted on `ubuntu-latest` and a Windows run cannot reproduce the asserting platform's rendering. It reduced the count to **2 failures**, and it exposed a defect no Windows run could see: the **seeded clock was the wall clock**, so every screenshot embedded the moment it was taken and no visual baseline could ever hold. The clock is now pinned end to end (`lib/format/clock.ts`) — the seed, the admin query windows, the chart axes, and the **client bundle**, the last of which needed the `NEXT_PUBLIC_` prefix because `process.env` is server-only and a server/client divergence fails the React hydration. The 2 remaining failures were the container comparing a pinned render against a **stale** committed PNG: the committed baselines were refreshed in `ebdba41` at 23:06 on 2026-11-08, and `d895242` had already put the pin into `playwright.config.ts` at 22:29 the same evening — so the refresh ran *with* the pin. The container archive that reported the failures was built before that refresh. Re-running the baseline workflow on `ubuntu-latest` (run `42517872827`) produced **63 PNGs byte-identical** to the committed baselines, which proves they are *stable*, not merely current.

The route specs **now run in CI**. They previously never ran in the pipeline, which is exactly how 61 stale assertions, a broken native-binding path and a moving clock went unnoticed. See `TESTING_REPORT.md` §2.2 for the full account.

### What could not be verified

| Item | Why |
|---|---|
| **Live PostgreSQL** | No database was reachable. Every test runs on the in-memory dev store |
| **A real WebAuthn authenticator** | No hardware key or virtual authenticator was available. Attestation, assertion and counter-clone detection were read, not executed |
| **A real SMS delivery** | The Twilio provider's retry backoff and 4xx classification were read, not exercised against the live API |
| **A deployed environment** | No deployment was inspected. Whether `CITYFIX_DEV_STORE`, `DEV_SKIP_WEBAUTHN`, `OTP_PROVIDER` or `CITYFIX_DEV_PROMOTE_SECRET` are set in production is **unknown — and decisive** for three Critical findings |
| **A live rate-limit measurement** | The per-instance limitation is established from source (an in-process `Map`), not measured under load |
| **The migration state of a live database** | `prisma/schema.prisma` was read; whether migrations have been applied is unknown |
| **Actual concurrent behaviour under load** | **Now tested for the transition, field-write, duplicate-submission and crew-capacity paths** — `tests/unit/transitions-concurrency.test.ts`, `tests/unit/writes-concurrency.test.ts`, `tests/unit/dedup-concurrency.test.ts`, `tests/unit/dedup-route-race.test.ts` and `tests/unit/dispatcher/crew-capacity.test.ts` drive concurrent writers against the real dev store and assert exactly one winner. The dedup index semantics were additionally checked against **real PostgreSQL 16** by hand. Still unverified against a real Postgres under concurrent load: CI has no database |
| **The deployed Postgres isolation level** | `lib/db.ts:18-20` sets no `isolationLevel`, so the server default governs. The standard default is `READ COMMITTED`, under which every concurrency failure is real |
| **Whether the metric numbers are correct in production** | The computation paths were traced to their DB columns; no production dataset was available to sanity-check the arithmetic |
| **ADR-006** | Not present in `docs/adr/`. Its resolution decides whether a High finding is a vulnerability or a design decision |
| **The `AuditEntry` `onDelete: Restrict` behaviour** | Needs a live database — see [KNOWN_ISSUES.md #25](KNOWN_ISSUES.md#25-auditentryactor-ondelete-restrict-vs-user-deletion) |
| **A production-mode run** | The `db-guard` blocks a loopback `DATABASE_URL` under `NODE_ENV=production`, correctly. A real-mode run needs a hosted Neon `DATABASE_URL` |
| **Client-side XSS sinks** | `components/` was reviewed only where it bore on the API contract |
| **Image-content validation** | The server enforces MIME and size; no polyglot/malformed-file detection exists |

---

## 6. Health assessment

### Strengths

1. **The layering is real, not aspirational.** The service layer holds the logic (92.59% covered); the route handlers are thin adapters (0% by design, covered by Playwright instead). No raw SQL or direct Prisma in any route handler — verified by repo-wide search for `$queryRaw` / `$executeRawUnsafe`.
2. **The PII boundary holds.** The citizen serializer strips `internalNote`, `assignedCrewId` and `reporterName`, anonymises trail actors to "সিটি কর্পোরেশন", and the public serializer strips `locationLabel` — which can carry a street address. No route returns a raw Prisma row.
3. **The audit trail is genuinely immutable.** No code path updates or deletes an `AuditEntry`.
4. **ADR-007 is implemented and tested against the real dependency graph**, not with mocks — and the shared transition route applies the ceremony *after* the ticket load and scope checks, exactly as the ADR specifies.
5. **The DB guard is strong.** It handles both URL and libpq connection-string forms, covers 127.0.0.0/8, and latches only on success so a failed check keeps throwing.
6. **The i18n discipline is complete.** 957 keys, a typed registry, and a check script that fails if `app/**` references an unregistered key.
7. **The OpenAPI spec is typed code**, so `tsc --noEmit` catches a malformed component reference. It has no phantom paths.

### Weaknesses

1. **Four Critical security findings**, three of which need no credential at all. All four are configuration-reachable rather than theoretical.
2. **Concurrency control — all five named scenarios are now fixed.** *(Was: no concurrency control of any kind — zero `$transaction`, no `version` column, no `@@unique` on `Ticket`, and a DB facade that could not even express a compound guard.)* As of 2026-11-08 the worst scenario — two concurrent transitions making the citizen-facing status trail contradict the ticket — is closed at source: a compare-and-swap write on `(status, version)`, one transaction around the status update + trail insert + audit write, and a CI-enforced regression test. The concurrent ticket-field writes (crew assignment, dispatcher ward/category/note edits, citizen feedback) were closed the same day with the same count-checked `updateWhere`. Duplicate submission was closed at the end of it with a nullable `dedupKey` carrying `@@unique([cityId, dedupKey])` — the escape hatch being that a declined duplicate carries no key, and Postgres treats NULLs as distinct. Crew capacity was closed last: the audit had framed it as an open *product* question, but the answer was already written down in the UX spec (a red load badge above 5, a load-based sort, a 409 "crew just took another job"), so it was an unimplemented specification rather than an open question. See [CONCURRENCY_AND_ACCOUNTABILITY_AUDIT.md](CONCURRENCY_AND_ACCOUNTABILITY_AUDIT.md).
3. **No `middleware.ts`.** A route is protected only if its author remembered. This is the structural cause of two of the High findings — and ADR-007 predicted it.
4. **No production guard on `CITYFIX_DEV_STORE`.** One env var disables the database, unsigns the session cookie and bypasses WebAuthn. A single guard would close the whole class.
5. **The API is not internally consistent** — five documented divergences in error codes, field names and status codes. Documented rather than normalised because clients depend on the current behaviour.
6. **The i18n registry is 2,900 lines** — a single file with 957 keys. At 100% line coverage but 75% branch coverage, it is the largest untested surface in the codebase.
7. **`docs/running.md` was materially stale** — it described 40 route handlers, 249 unit tests and 15 baselines against a reality of 61, 1,886 and 25. **Rewritten during this audit**; the standing instruction *"update the doc to match the real stack"* is now discharged.
8. **Wave 2 of the UI redesign is 8 of 12 mockups unbuilt**, and page implementation is blocked on human mockup approval.
9. **The metrics are honest but incomplete.** No metric uses placeholder data — but `SlaPolicy` is defined, seeded and never consulted, and four `Ticket` timestamps are missing, so two of the four operational questions are only partially answerable.

### The systemic pattern

The strongest and weakest parts of this codebase have the same cause. The `/api/v1/admin/*` tree is disciplined because a **rule was written down** (ADR-007) and then **tested**. Everything outside that tree is weaker because it was left to convention.

ADR-007:229-234 said so itself:

> *"a future admin write route added outside `/api/v1/admin/*` skips the gate"*

`PUT /api/profile` is that route. It was found by this audit, not by the test suite — because the suite asserts what the code *does*, not what the ADR says it *should*.

**The concurrency defect was the same pattern in a different dimension.** Nothing was left to convention for authorisation — concurrency was simply never expressed anywhere, not even in a convention. The rule that a transition must be based on the status the caller *saw* is implicit in every other part of the codebase, and absent from the one place it matters.

**And the test suite could not find it.** The in-memory dev store makes the read-then-set pair effectively atomic by accident of Node's event loop, and CI runs entirely on the dev store. A defect that is invisible to every gate in the pipeline is invisible *by construction*, not by oversight.

The durable fix is structural, not more rules: a `middleware.ts` baseline, a route-level checklist that runs in CI, and concurrency semantics the dev store actually models. A rule enforced by convention is a rule that decays.

**As of 2026-11-08 that fix has been applied to all five named scenarios**, and it is worth noting what the implementation turned out to require. A conditional write alone was not enough: the audit write had to be re-pointed at the transaction handle, the dev store's rollback had to be rewritten so it stopped erasing a concurrent winner's trail row, and the compare-and-swap had to be implemented in the dev store so CI could actually exercise it. Each of those is the same lesson — **the fix has to be structural, or it decays.** The concurrent ticket-field writes were fixed the same way later the same day, the duplicate-submission race by a nullable unique key, and the crew-capacity rule by a counting function the dev store could actually count against. The pattern to copy is now written down, tested and CI-enforced rather than described.

---

## 7. Governance

### The AIDLC memory stack

Four layers, each adding specialisation:

| Layer | File | Role |
|---|---|---|
| Org | `aidlc/spaces/default/memory/org.md` | Framework defaults — trunk-based dev, testing posture, guard policy |
| Team | `aidlc/spaces/default/memory/team.md` | CityFix's affirmed practices |
| Project | `aidlc/spaces/default/memory/project.md` | The pinned stack, the decisions, the learnings |
| Phase | `aidlc/spaces/default/memory/phases/*.md` | Guardrails per phase |

### Affirmed team rules

- Trunk branch is **`prd-development`** (not `main` — the one deviation from the org default)
- **Test-after** methodology; 80% line-coverage floor
- **Playwright baselines are gating** — *"NEVER merge Bolts with failing visual regression tests"*
- Guard policy: **strict**
- Named exports over default exports under `lib/`
- All service-layer async functions return `Result<T, E>` and never throw
- Zod at every API boundary
- Prisma only via `lib/db.ts`; raw queries forbidden
- All user-facing copy through `lib/i18n/keys.ts`

### Production guards

`lib/platform/db-guard.ts` refuses a loopback `DATABASE_URL` in production. `lib/auth/webauthn.ts` refuses a non-https origin or a `localhost` RP ID in production. Both are lazy — they validate on first use, so a build without env vars still succeeds.

**There is no third guard on `CITYFIX_DEV_STORE`.**

---

## 8. What is not built yet

| Gap | Status |
|---|---|
| **Wave 2 of the UI redesign** | 8 of 12 mockups unbuilt. Blocked on human mockup approval |
| **Web Push delivery** | Stubbed. The wire call is v1.1 |
| **The `/api/blob` serving route** | Does not exist, so local photos are dead links |
| **A `middleware.ts`** | Does not exist |
| **Redis-backed rate limiting** | Deferred to v1.1 |
| **Nonce-based CSP** | Documented as a v1.1 hardening |
| **Self-hosted Noto Sans Bengali** | Would eliminate the baseline platform-drift at its source |
| **Error tracking / APM** | None configured |
| **SLA breach alerting** | `SlaPolicy` exists and the monitor computes against it, but nothing notifies |
| **Observability** | Minimal — the audit trail, Vercel logs, and the Vercel dashboard |

---

## 9. The three decisions that matter most

**1. What is the admin's city scope?** ADR-006 is not in `docs/adr/`, and the codebase answers the question two different ways. `/api/v1/admin/tickets/[id]` calls `requireSameCity`; the 12 routes under `/api/v1/admin/cities/[id]/**` do not. Until ADR-006 is written or found, one of those is wrong, and it is not knowable from the code.

**2. What is the production env?** `OTP_PROVIDER`, `CITYFIX_DEV_STORE`, `DEV_SKIP_WEBAUTHN` and `CITYFIX_DEV_PROMOTE_SECRET` decide whether three Critical findings are theoretical or live. This is a one-minute check against the hosting dashboard, and it is the first thing to do.

**3. What is the launch bar?** [PRODUCTION_READINESS_CHECKLIST.md](PRODUCTION_READINESS_CHECKLIST.md) records 173 items with a PASS / FAIL / NOT VERIFIED / NOT APPLICABLE status. On today's evidence it does not read "ready" — four Critical findings and a blocked real-mode run stand in the way. The ticket-state integrity defect that this audit identified was the other blocker, and it was closed on 2026-11-08: all five named concurrency scenarios now have a guard and a CI-enforced regression test.

**And one thing that was not a decision but an obligation — now discharged.** The concurrency defect in `lib/platform/transitions.ts:48-86` required no decision, no credentials and no rare condition — it needed two dispatchers doing their jobs at the same time, which the dashboard exists to make happen. It was also the cheapest thing on the list to fix, and the only one whose failure mode was a citizen being told something untrue about their own report. It was closed on 2026-11-08, along with the other four named scenarios.

---

## 10. Related documents

- [PRODUCTION_READINESS_CHECKLIST.md](PRODUCTION_READINESS_CHECKLIST.md) — the go/no-go, item by item
- [SECURITY_AUDIT.md](SECURITY_AUDIT.md) — the findings register
- [CONCURRENCY_AND_ACCOUNTABILITY_AUDIT.md](CONCURRENCY_AND_ACCOUNTABILITY_AUDIT.md) — ticket-state integrity and operational metrics
- [KNOWN_ISSUES.md](KNOWN_ISSUES.md) — 31 flags
- [ARCHITECTURE.md](ARCHITECTURE.md) — the layers and the data model
- [API_DOCUMENTATION.md](API_DOCUMENTATION.md) — all 77 operations
- [TESTING_REPORT.md](TESTING_REPORT.md) — the suites and the gaps
- [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) — hosting and runbooks
- [CHANGELOG.md](CHANGELOG.md) — the release history
