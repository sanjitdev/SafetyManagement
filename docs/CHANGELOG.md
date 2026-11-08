# CityFix — Changelog

All notable changes to CityFix are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [semantic versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

**Audit deliverables — 2026-11-08**

Ten documents created in `docs/`. All are new files; no source code was changed.

- `docs/PROJECT_AUDIT.md` — the entry point. Project identity, the product thesis, personas, history (135 commits), what exists, verification status, health assessment, governance, what is not built yet, and the three decisions that matter most.
- `docs/PRODUCTION_READINESS_CHECKLIST.md` — the master go/no-go. **172 items across 12 stages**, each PASS / FAIL / NOT VERIFIED / NOT APPLICABLE with evidence. Carries the mandated Final Report Format: 43% overall, 74 passed, 68 failed, 29 not verified, 1 not applicable; 4 Critical / 5 High / 13 Medium / 10 Low issues; the security, performance and deployment assessments; the sixteen remaining blockers; and the explicit list of items that could not be verified and why.
- `docs/SECURITY_AUDIT.md` — 17 findings (4 Critical, 4 High, 5 Medium, 4 Low) with file:line evidence, the auth and authorisation contract, and the remediation order. Verdict: not production-ready.
- `docs/API_DOCUMENTATION.md` — all **77** operations across 61 route handlers, with the guard contract table, the error-code table, per-endpoint request/response schemas, the five documented API inconsistencies, and the two phantom operations found in the spec.
- `docs/ARCHITECTURE.md` — the layers, the 74-module `lib/` map, the data model, the request lifecycle with the deliberate guard ordering, the dev-store seam, the CI pipeline, and nine known architectural weaknesses.
- `docs/TESTING_REPORT.md` — the suites, the measured coverage and the weakest areas, the platform-specific baseline rule, the CI pipeline and the Node 22 rationale, and ten known testing gaps.
- `docs/DEPLOYMENT_GUIDE.md` — Vercel + Neon hosting, the full environment-variable table including the three that must be unset in production, the production checklist, rollback procedures, monitoring gaps and four operational runbooks.
- `docs/KNOWN_ISSUES.md` — **31** numbered flags with an index table and file:line evidence, plus a "not issues — deliberate design decisions" section so correct behaviour is not re-reported as a bug.
- `docs/CONCURRENCY_AND_ACCOUNTABILITY_AUDIT.md` — the tenth document, added after the plan's two unexamined priorities were investigated. Part A establishes that the codebase has **no concurrency control of any kind** and that all five named scenarios are vulnerable. Part B establishes that no metric uses placeholder data, but that two of the four operational questions are only partially answerable.

### Changed

- `docs/KNOWN_ISSUES.md` — index extended to cross-reference `CONCURRENCY_AND_ACCOUNTABILITY_AUDIT.md`; the concurrency findings are now reachable from the operational index rather than only from the dedicated document. Issue #26 (`docs/running.md` is stale) is marked **resolved**. Issue #31 records the phantom OpenAPI methods.
- `docs/PROJECT_AUDIT.md` — the deliverable table now lists ten documents rather than nine; the "what could not be verified" table carries the concurrency-specific unknowns; the health assessment records the concurrency defect alongside the security findings; the operation count is corrected to 77.
- **`docs/running.md` — rewritten against the real stack.** This was the standing instruction *"update the doc to match the real stack"*, and it was materially wrong on five counts: 40 route handlers vs 61, 249 unit tests vs 1,851, 15 visual baselines vs 25, 19 route specs vs 34, and Node 20 vs the CI-pinned Node 22. The rewrite lists all 61 route files with their methods, all 26 `package.json` scripts with what they actually do, the Node 22 requirement with its reason, the visual-baseline platform rule, and the dev-route gating caveat. It now cross-links the audit deliverables instead of duplicating them.

### Fixed

Nothing in the source code. **No application code was modified by this audit** — the output is analysis, not remediation. The one code-level defect found (the phantom OpenAPI methods) is *documented*, not fixed, because fixing it means either deleting the spec blocks or implementing two endpoints, and that is a product decision rather than an audit action.

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
| The OTP attempt limit is **never enforced** — `attempts` is incremented and never read; `OTP_MAX_ATTEMPTS` is imported nowhere | `app/api/v1/auth/verify-otp/route.ts:111`; `lib/auth/otp.ts:32` |
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

### Low — the OpenAPI spec documents two methods that do not exist

`lib/docs/openapi.ts:1366-1413` describes `PATCH /api/tickets/{id}` and `DELETE /api/tickets/{id}`. `app/api/tickets/[id]/route.ts` exports exactly one handler — `GET` at line 17. Nothing calls the phantom endpoints, so no client breaks, but the Swagger UI at `/api/docs` tells a developer that a citizen can edit or delete their own report, and the endpoint returns 405.

This violates the spec module's own accuracy rule #1 (*"Where a route's own docblock disagrees with its code, THE CODE WINS"*), and `tsc --noEmit` cannot catch it — the type checker validates that a component reference is well-formed, not that a documented method has a handler behind it.

**How it was found:** reconciling all 61 route files' exported method names against `openapiPaths` produced exactly one mismatch. The same reconciliation corrected this audit's own operation count from 80 to **77**.

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
