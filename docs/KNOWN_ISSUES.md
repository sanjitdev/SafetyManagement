# CityFix — Known Issues

**Documented:** 2026-11-08
**Codebase:** `main` @ `be9f2b0`

Every entry below was verified against the source on 2026-11-08, with a file and line citation. Security findings that carry a severity rating are cross-referenced to [SECURITY_AUDIT.md](SECURITY_AUDIT.md) — that document is the authoritative register for them; this one is the operational index.

---

## Index

| # | Issue | Severity | Area | Status |
|---|---|---|---|---|
| 1 | OTP plaintext returned in every environment | **Critical** | Auth | Open |
| 2 | OTP attempt limit never enforced | **Critical** | Auth | Open |
| 3 | Four `/api/dev/*` routes not dev-store-gated | **Critical** | Auth | Open |
| 4 | `bootstrap-admin` + `issue-session` mint admin sessions | **Critical** | Auth | Open |
| 5 | `PUT /api/profile` is an ungated admin write | **High** | AuthZ | Open |
| 6 | WebAuthn challenges never consumed | **High** | Auth | Open |
| 7 | Admin city-scoped routes skip the city check | **High** | AuthZ | Open — needs ADR-006 |
| 8 | Password login is not role-restricted | **High** | Auth | Open |
| 9 | Local blob photos 404 — no `/api/blob` route | Medium | Storage | Open |
| 10 | Adoption export passes `citySlug: params.id` | Medium | Admin | Open |
| 11 | `POST /api/v1/admin/cities` swallows template failure | Medium | Admin | Open |
| 12 | In-process rate limiter and lockout | Medium | Platform | Deferred to v1.1 |
| 13 | No `middleware.ts` | Medium | Platform | Open |
| 14 | CSP ships `unsafe-inline` + `unsafe-eval` | Medium | Infra | Deferred to v1.1 |
| 15 | `.env.example` incomplete | Medium | Infra | Open |
| 16 | `sessionId` echoed in `/api/auth/status` | Medium | Auth | Open |
| 17 | `requireRole` returns 401 where 403 is expected | Low | API | Open |
| 18 | `unauthenticated` vs `not_authenticated` divergence | Low | API | Open |
| 19 | `invalid_query` vs `invalid_input` divergence | Low | API | Open |
| 20 | `retry_after_ms` vs `retryAfterMs` divergence | Low | API | Open |
| 21 | Illegal-transition status/code divergence | Low | API | Open |
| 22 | OTP generated with `Math.random()` | Low | Auth | Open |
| 23 | Missing COOP/CORP/`X-DNS-Prefetch-Control` | Low | Infra | Open |
| 24 | `lib/map/osm-raster.ts` at 0% coverage | Medium | Testing | Open |
| 25 | `AuditEntry.actor` `onDelete: Restrict` vs user deletion | Medium | Data | Unverified |
| 26 | `docs/running.md` is stale | Low | Docs | ✅ Resolved during this audit |
| 27 | **No concurrency control anywhere** — 5 named scenarios vulnerable | **High** | Data integrity | Open — see [CONCURRENCY_AND_ACCOUNTABILITY_AUDIT.md](CONCURRENCY_AND_ACCOUNTABILITY_AUDIT.md) |
| 28 | `SlaPolicy` is defined, seeded and never consulted | Medium | Data | Open |
| 29 | Four `Ticket` timestamps missing — 2 of 4 operational questions only partly answerable | Medium | Data | Open |
| 30 | Adoption metrics collapse `null` to `0` — "no data" reads as "zero" | Medium | Admin | Open |
| 31 | The OpenAPI spec documents two methods that do not exist | Low | Docs | ✅ Resolved 2026-11-08 — blocks deleted, parity test added |

---

## Concurrency — Critical path for ticket integrity

**Full evidence: [CONCURRENCY_AND_ACCOUNTABILITY_AUDIT.md](CONCURRENCY_AND_ACCOUNTABILITY_AUDIT.md) Part A.**

There is **no concurrency control of any kind** in this codebase: zero `$transaction` calls, no `version` column, no compare-and-swap write, no `@@unique` on `Ticket`, and no compound guard expressible through the DB facade (`lib/db-switch.ts` hard-types every `update`'s `where` as `{ id: string }`).

| Scenario | Verdict |
|---|---|
| Two dispatchers assign different crews to the same ticket | **VULNERABLE** |
| Two dispatchers transition the same ticket to different statuses | **VULNERABLE — worst case** |
| Two crew members update the same job | **VULNERABLE** |
| Two citizens submit the same report simultaneously | **VULNERABLE** |
| A crew member is assigned while already holding active tickets | **VULNERABLE (no constraint)** |

The worst case is `lib/platform/transitions.ts:48-86`: it validates against a status read at `:49` and writes with an id-only predicate at `:60`, so two concurrent transitions both pass validation and the second silently overwrites the first. The trail insert (`:70`) and audit write (`:79`) are separate statements, so **the citizen-facing status trail can describe a sequence that could not legally have happened.**

**CI cannot catch this.** `lib/dev-store.ts:1616-1629` makes the read-then-set pair effectively atomic by accident of Node's event loop, and the entire CI suite runs on the dev store.

---

## Security — Critical

### 1. OTP plaintext returned in every environment

**Evidence:** `app/api/v1/auth/send-otp/route.ts:164`; `lib/auth/otp-provider/index.ts:31`

```ts
dev_code: code,
```

The comment above it (L152-159) says *"While OTP_PROVIDER=stub, surface the code"* — but there is **no such condition**. The field is returned unconditionally. And `OTP_PROVIDER` **defaults to `'stub'`** when the env var is unset:

```ts
const name = process.env.OTP_PROVIDER ?? 'stub';
```

A deployment that sets `DATABASE_URL`, `SESSION_SECRET` and Twilio credentials but forgets `OTP_PROVIDER` gets a stub provider *and* a plaintext OTP in every response — full citizen account takeover with no credential theft.

**Fix:** guard `dev_code` on `NODE_ENV !== 'production' && OTP_PROVIDER === 'stub'`; default `OTP_PROVIDER` to `'twilio'` in production. → [SECURITY_AUDIT.md §1.3](SECURITY_AUDIT.md#13-otp-flow)

---

### 2. OTP attempt limit never enforced

**Evidence:** `app/api/v1/auth/verify-otp/route.ts:111`; `lib/auth/otp.ts:32`

```ts
data: { attempts: (otp.attempts ?? 0) + 1 },
```

`attempts` is incremented and never read. `OTP_MAX_ATTEMPTS` is exported from `lib/auth/otp.ts:32` and **imported nowhere** — the only hit repo-wide is the definition.

The route's own docstring promises behaviour that does not exist:
- L10: *"429 → too many attempts (5 within 10 minutes)"*
- L15: *"on the 5th failure we mark the account as soft-locked"*

The per-IP rate limit (1/s) is the only thing standing between an attacker and an unlimited guessing loop, and it is in-process — trivially defeated across source IPs or instances.

**Fix:** read `attempts`; return 429 at the limit and lock the row. This also makes the docstring true.

---

### 3. Four `/api/dev/*` routes are not dev-store-gated

**Evidence:** `app/api/dev/{bootstrap-admin:52,issue-session:35,list-users:37,promote-admin:43}/route.ts`

These four are gated on `CITYFIX_DEV_PROMOTE_SECRET` **only**. Two sibling routes are gated correctly:

| Route | Gate |
|---|---|
| `/api/dev/login` | `isDevStore()` → 404 (`app/api/dev/login/route.ts:54-56`) |
| `/api/dev/reset` | `isDevStore()` → 404 (`app/api/dev/reset/route.ts:12`) |
| `/api/dev/bootstrap-admin` | ❌ secret only |
| `/api/dev/issue-session` | ❌ secret only |
| `/api/dev/promote-admin` | ❌ secret only |
| `/api/dev/list-users` | ❌ secret only |

**Fix:** add `if (!isDevStore()) return 404` to all four, before the secret check. Four lines; closes the largest hole in the audit.

---

### 4. `bootstrap-admin` and `issue-session` mint full admin sessions

**Evidence:** `app/api/dev/bootstrap-admin/route.ts:115-146`; `app/api/dev/issue-session/route.ts:70-76`

- `bootstrap-admin` promotes a citizen to `role='admin'` **and mints an admin session** — bypassing both the password and WebAuthn.
- `issue-session` mints a session for **any** `userId`, including admins, bypassing the password.

Neither needs a prior session. A single leaked static secret yields **unauthenticated privilege escalation to admin**.

**Fix:** same as #3. Then delete both routes before production — they have no production use.

---

## Security — High

### 5. `PUT /api/profile` is an ungated admin write

**Evidence:** `app/api/profile/route.ts:26-59`

Verified by reading the file: there is **no `requireRole`**, **no `requireWebAuthn`**, and no Zod schema — validation is hand-rolled (L46-51 rejects empty, >80 chars, and control characters). It writes `name` / `nameBn`.

ADR-007:87-89 states *"Every admin write path requires a fresh WebAuthn assertion"* (ADR-007:143-147). The scope table (L183-189) lists only path-prefixed rows, so it never considered a route outside `/api/v1/admin/*` other than the shared transition route — exactly the class of miss ADR-007:229-234 predicted.

**Fix:** call `await requireWebAuthn(session)` when `session.role === 'admin'`; add a role/ownership guard; convert to Zod.

---

### 6. WebAuthn challenges are never consumed

**Evidence:** no `webAuthnChallenge.delete|deleteMany|update` anywhere; `lib/db-switch.ts:679-752` exposes only `create` / `findLatest` / `findById`; `lib/auth/guards.ts:113-125`

`requireWebAuthn` only checks that *a* challenge row exists and has not expired. `tests/unit/require-webauthn.test.ts:167-175` pins exactly this behaviour.

**One ceremony authorises every admin write for the next 5 minutes.** The ADR-007 threat model assumes a fresh assertion per write; the code does not enforce that.

**Fix:** consume the challenge on use.

---

### 7. Admin city-scoped routes skip the city check

**Evidence:** `app/api/v1/admin/cities/[id]/**` — every route calls `requireRole(session, 'admin')` and nothing else before acting on `params.id`. The route file documents this: `app/api/v1/admin/cities/[id]/users/route.ts:9-10` — *"Admins bypass the cross-city check (per ADR-006)."*

But the rest of the admin surface disagrees:

| Route | City check |
|---|---|
| `/api/v1/admin/tickets/[id]` | ✅ `requireSameCity(session, ticket.cityId)` (`route.ts:51`) |
| `/api/v1/admin/tickets` | ✅ `requireSameCity(session, effectiveCityId)` (`route.ts:91`) |
| `/api/v1/admin/cities/[id]/**` (12 routes) | ❌ none |

If the city-scoped reading is correct, then `GET /api/v1/admin/cities/[id]/adoption` (L50) and `.../adoption/export` (L49) let an admin in city A read city B's adoption metrics and export its CSV.

**Status: needs a decision.** ADR-006 is not in `docs/adr/`. This is recorded as a design inconsistency, not a confirmed vulnerability, until ADR-006 is read.

---

### 8. Password login is not role-restricted

**Evidence:** `app/api/v1/auth/login/route.ts:137-139`

```ts
const user = await db.user.findFirst({ where: { cityId: city.id, phone } });
```

No `role` constraint. An admin, dispatcher or crew account can authenticate with a password. Combined with #5, #6 and #7, the hardware key is a per-write gate rather than a login requirement — and the gate is bypassable.

**Fix:** restrict the password path to `role: 'citizen'`; force admin login through `/api/auth/webauthn/login`.

---

## Functional

### 9. Local blob photos 404 — no `/api/blob` route

**Evidence:** `lib/storage/blob.ts:180` defaults `localBaseUrl` to `'/api/blob'`; the local `getSignedUrl` (L399-406) returns that URL **with no signing**. **No `app/api/blob/route.ts` exists.**

The URL is stored on the ticket and rendered in `ReportCard`, `PublicLandingExperience`, the `/feed` page and the dispatcher surfaces — all as broken image links in local mode.

It fails closed (the image is simply absent), so it is a functional bug rather than a security hole. But the local provider is untested end-to-end, and a fix must add the route **with** `Content-Type` from the stored MIME, `Content-Disposition: inline`, `X-Content-Type-Options: nosniff`, and never `Content-Type: text/html`.

---

### 10. Adoption export passes `citySlug: params.id`

**Evidence:** `app/api/v1/admin/cities/[id]/adoption/export/route.ts:84`

```ts
citySlug: params.id,
```

`params.id` is the city **id**, not the slug. Compare `adoption/route.ts:120`, which correctly passes `citySlug: city.slug`.

The export's CSV filename (L109) has the same issue: `adoption-${params.id}.csv`.

**Impact:** if `buildAdoptionDashboard` uses `citySlug` to build a comparison-city label or a URL, the export shows a raw id where the on-screen dashboard shows a slug — the two outputs drift, which is the exact thing the shared `buildAdoptionCsvRows` helper was written to prevent.

**Fix:** look up the city and pass `city.slug`.

---

### 11. `POST /api/v1/admin/cities` swallows template failure

**Evidence:** `app/api/v1/admin/cities/route.ts:131-148`

```ts
try {
  templateResult = await applyDhakaTemplate(city.id, session.userId);
} catch {
  return NextResponse.json(
    { city, templateError: 'template_already_applied' },
    { status: 200 },
  );
}
```

The catch block is a bare `catch {}` — it catches **every** error, not just a unique-constraint collision, and labels all of them `template_already_applied`. A genuine failure (a DB error, a bug in `applyDhakaTemplate`) is reported as a benign collision.

**Also note:** this returns **200** while the success path returns **201**. A caller cannot distinguish "created" from "created but the template failed" by status code alone.

**Fix:** narrow the catch to the constraint violation; use a distinct error code; consider `207` or keep 201 with a `templateError` field.

---

## Platform and infrastructure

### 12. In-process rate limiter and lockout

**Evidence:** `lib/platform/rate-limit.ts:17` (`const buckets = new Map<string, Bucket>()`); `lib/auth/login-lockout.ts:38`

Both are per-instance. On a multi-instance deploy, an attacker distributing requests across N instances gets N× the attempt budget, and a restart resets the lockout entirely.

The docstrings are honest about this — `login-lockout.ts:21-26` says the counter *"is intentionally in-process for v1"*. Deferred to v1.1 (move to Postgres or Redis).

---

### 13. No `middleware.ts`

**Evidence:** no `middleware.ts` in the repo

Every route independently calls `getActiveSession()` and the guards. A route is protected only if its author remembered to protect it. This is the structural cause of issues #5 and #7 — and ADR-007:229-234 predicted it.

**Fix:** a `middleware.ts` that resolves the session once and blocks `/api/v1/admin/**`, `/api/v1/dispatcher/**` and `/api/v1/crew/**` without a session would give a baseline. The per-handler guards remain the authoritative checks.

---

### 14. CSP ships `unsafe-inline` and `unsafe-eval`

**Evidence:** `next.config.js:99`

```js
"script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com",
```

This disables the CSP's main protection against XSS. It is a common Next.js compromise (React needs inline scripts for hydration), but Next.js supports **nonces**, and the codebase already documents that as the intended path (`next.config.js:73-74` — *"the nonced style approach is a v1.1 hardening"*).

`'unsafe-eval'` is required only by the Swagger UI's unpkg bundle.

**Fix:** nonce-based `script-src` for application pages; serve `/api/docs` from a separate route with its own relaxed policy so the main app never needs `unsafe-eval`.

---

### 15. `.env.example` is incomplete

**Evidence:** `.env.example` (70 lines); `lib/storage/blob.ts:172-189`

Three classes of variable are missing entirely:

| Missing | Why it matters |
|---|---|
| `CITYFIX_DEV_PROMOTE_SECRET` | Gates four privilege-escalation endpoints. Must be documented and marked **must be unset in production** |
| `DEV_SKIP_WEBAUTHN` | The WebAuthn bypass. Same marking |
| All `BLOB_*` vars | `BLOB_PROVIDER`, `BLOB_LOCAL_DIR`, `BLOB_LOCAL_BASE_URL`, `BLOB_S3_*`, `BLOB_PUBLIC_BASE_URL`, `BLOB_SIGNED_URL_TTL`. A production deployment with no `BLOB_*` set silently gets the local provider — unsigned, unserved, and writing to the local filesystem |

**Fix:** document every variable `lib/` reads, marked required/optional, and mark the dangerous ones "must be unset in production".

---

### 16. `sessionId` echoed in `/api/auth/status`

**Evidence:** `app/api/auth/status/route.ts:57`

In production the cookie value is `<sessionId>.<sig>`, so the response leaks the identifier half. The identifier alone cannot authenticate — the signature is required — but there is no reason for a client to see it. `components/SessionProvider.tsx` is the only consumer.

---

### 23. Missing security headers

**Evidence:** `next.config.js:46-118`

`Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy` and `X-DNS-Prefetch-Control` are absent. Low risk for this app (no OAuth/popup flows), but cheap to add.

---

## API consistency

These are **live divergences, not typos**. They are documented rather than fixed because clients already depend on the current behaviour — but each should be normalised before a public API v1.

### 17. `requireRole` returns 401 where 403 is expected

**Evidence:** `app/api/tickets/[id]/transition/route.ts:79`

`status: 401` with `error: (e as Error).message`. A dispatcher calling this route gets `403 forbidden_role` in the body but a 401 status — the body and the status disagree, which breaks the contract that `ApiError.status` matches the HTTP status and makes client error-mapping unreliable.

---

### 18. `unauthenticated` vs `not_authenticated`

Everywhere except `/api/v1/admin/**` and `/api/profile`, which use `unauthenticated`.

---

### 19. `invalid_query` vs `invalid_input`

`invalid_query` on the dispatcher/crew list routes; `invalid_input` on admin routes and body routes.

---

### 20. `retry_after_ms` vs `retryAfterMs`

`retryAfterMs` on most routes; `retry_after_ms` on `GET /api/tickets/{id}`.

---

### 21. Illegal-transition status and code diverge

| Route | Status | Code |
|---|---|---|
| `/api/tickets/{id}/transition` | 409 | `invalid_transition` |
| `/api/v1/dispatcher/tickets/{id}/transition` | 422 | `illegal_transition` |
| `/api/v1/crew/tickets/{id}/transition` | 422 | `illegal_transition` |

---

## Testing and data

### 24. `lib/map/osm-raster.ts` at 0% coverage

**Evidence:** coverage report — `lib/map/osm-raster.ts | 0 | 0 | 0 | 0 | 1-46`

The module builds the tile URLs the map depends on. A regression there is a blank map in production, and the coverage floor does not catch it because the whole file is uncovered and `lib/**` is still at 92.56% overall.

Also at 0%: `lib/ui/map-colors.ts` (a constants file — lower priority).

**Fix:** add tests for the URL construction. This is the single highest-value testing gap.

---

### 25. `AuditEntry.actor` `onDelete: Restrict` vs user deletion

**Evidence:** `prisma/schema.prisma:428-443` (`onDelete: Restrict`); `lib/admin/users-db.ts:436-460` (deletes sessions then the user)

`Restrict` means a user cannot be deleted while audit rows reference them. `lib/admin/users-db.ts` deletes sessions first, then the user — which would be **blocked** if that user has audit rows, i.e. once they have ever acted.

**This could not be verified** — no live database was reachable during the audit. It is either a bug (admin user deletion fails in practice) or a deliberate safeguard that needs a documented deletion path.

**Fix:** verify against a live database. If it is a bug, either soft-delete the user or null out the audit actor.

---

## Documentation

### 26. `docs/running.md` is stale — ✅ RESOLVED during this audit

**Was:** the document described *"40 route handlers"*, *"249 unit tests across 23 files"*, *"15 visual baselines"* and *"mockups + 19 route specs"* against a reality of 61 handlers / 77 operations, 1,853 tests across 103 files, 25 baselines and 34 route specs. It recommended Node 20, and its route-handler list omitted ~21 handlers including the whole adoption surface and every `/api/v1/admin/cities/[id]/users/*` route.

**Now:** `docs/running.md` has been rewritten against the real stack. All 61 route files are listed with their methods, all 26 `package.json` scripts are documented with what they actually do, the Node 22 requirement is stated with the reason, the visual-baseline rule is stated correctly, and the script/verification tables match reality.

**Still open:** the document now cross-links the audit deliverables rather than duplicating them — `DEPLOYMENT_GUIDE.md` for production, `API_DOCUMENTATION.md` for the endpoint reference, `PRODUCTION_READINESS_CHECKLIST.md` for the go/no-go.

### 31. The OpenAPI spec documents two methods that do not exist — ✅ RESOLVED 2026-11-08

**Evidence:** `lib/docs/openapi.ts` (spec blocks) vs `app/api/tickets/[id]/route.ts:17` (the only handler)

The spec documents `PATCH /api/tickets/{id}` (`operationId: updateTicket`) and `DELETE /api/tickets/{id}` (`operationId: deleteTicket`). **Neither exists.** The route file exports exactly one handler — `GET`.

A repo-wide search for `updateTicket` and `deleteTicket` outside the spec returns no hits, and no client code calls either method.

**This violates the spec module's own accuracy rule #1** — *"Every path, method, status code and error code here was read from the corresponding route file. Where a route's own docblock disagrees with its code, THE CODE WINS."* The type checker cannot catch it: `tsc --noEmit` validates that a component reference is well-formed, not that a documented method has a handler behind it.

**Impact: documentation only.** Nothing calls the phantom endpoints, so no client breaks. But the Swagger UI at `/api/docs` tells a developer that a citizen can edit or delete their own report, and the endpoint returns 405.

**Fix:** remove the `patch` and `delete` blocks from `lib/docs/openapi.ts`, or implement the handlers. The durable fix is a **CI check** that parses the exported method names out of every `route.ts` and asserts they match the spec — the reconciliation this audit performed by hand.

**Fix applied (2026-11-08).** Both spec blocks were deleted and `lib/docs/openapi.json` was regenerated. The blocks were removed rather than left as "planned", because a spec that lists unimplemented operations is indistinguishable from a spec that lists broken ones.

**The durable guard is now in place.** `tests/unit/docs/openapi-route-parity.test.ts` reads every `app/api/**/route.ts` from disk, extracts its exported HTTP methods, and compares them against `openapiPaths` in **both** directions — a documented operation with no handler fails, and a handler with no documented operation fails. The excluded route groups (`/api/dev/**`, `/api/docs/**`) are declared in the test with their reasons, and the test asserts the exclusion list is exactly those eight paths, so a third silent exclusion cannot appear.

The test was **verified non-vacuous**: renaming a live `PATCH` export to `PATCHX` turned the suite red with `PATCH /api/v1/dispatcher/tickets/{id} — documented but no handler exports it`, and restoring the file turned it green.

If a future Bolt implements citizen report editing, it must add the handler **and** the spec block in the same commit.

---

## Not issues — deliberate design decisions

Recorded so they are not re-reported as bugs.

| Behaviour | Why it is correct |
|---|---|
| `requireScope` skips the check for admins | ADR-007:26-33 — an admin session is city-wide authority. The session binds `wardId: null` for admins |
| The shared transition route does **not** require WebAuthn from dispatchers or crew | ADR-007 — "admin writes" means role `admin`, not "staff writes" |
| The WebAuthn assertion route has no rate limit | Its own docstring accepts this; the route is gated by the signature check. Finding #6 is the real weakness |
| The WebAuthn login route returns 404 for both a missing and a non-admin user | No enumeration leak |
| The dedup scan caps at `take: 20` | A deliberate bound on the candidate scan. A *policy* limitation, not a defect |
| `AuditEntry.action` is a free-form string | `entityType` is a typed union; `action` is not. Recorded as a minor inconsistency in [SECURITY_AUDIT.md §7.2](SECURITY_AUDIT.md#72-immutability) |
| The OpenAPI spec excludes the 8 dev/docs routes | 53 paths / 68 operations vs 77 live across 61 files. The excluded routes account for the difference exactly. The spec no longer contains phantom operations — `tests/unit/docs/openapi-route-parity.test.ts` enforces that mechanically (see #31) |
| The coverage scope excludes `app/api/**` | Measured on 2026-10-27: the route files are thin adapters with no business logic, already covered by the Playwright route specs. The 80% floor still applies, to the scope that holds the logic |
| The local suite fails against CI-generated baselines on Windows | The platform difference — documented in [TESTING_REPORT.md §2.3](TESTING_REPORT.md#23-visual-regression--playwright-mockup-baselines) |
| No metric is computed from placeholder data | Verified — a repo-wide grep for `Math.random`/`mock`/`placeholder`/`sample`/`demo`/`dummy`/`hardcod` found no hits in any metric path. 25 of 27 audited metrics trace to real DB columns |
| Concurrent photo uploads both succeed | Photos are **appended**, not overwritten — both rows survive. Only the ordering within a Postgres timestamp window is arbitrary. No data is lost |
| The dev store hides concurrency races | Not a decision — a limitation. Node's event loop makes the read-then-set pair atomic *by accident*. It means CI provides zero coverage of the concurrency defects, and any fix must be implemented in the dev store too |

---

---

## Related documents

- [SECURITY_AUDIT.md](SECURITY_AUDIT.md) — the full findings register with severity and remediation order
- [CONCURRENCY_AND_ACCOUNTABILITY_AUDIT.md](CONCURRENCY_AND_ACCOUNTABILITY_AUDIT.md) — the concurrency defects and the operational-accountability findings
- [API_DOCUMENTATION.md](API_DOCUMENTATION.md) — the endpoint reference
- [ARCHITECTURE.md](ARCHITECTURE.md) — the layers these issues sit in
- [PRODUCTION_READINESS_CHECKLIST.md](PRODUCTION_READINESS_CHECKLIST.md) — the go/no-go
- [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) — the launch checklist
