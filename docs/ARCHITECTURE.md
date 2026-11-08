# CityFix — Architecture

**Documented:** 2026-11-08
**Codebase:** `main` @ `be9f2b0`
**Stack source of truth:** `design-artifacts/E-Development/000-tech-audit.md` (2026-10-04)

---

## 1. What CityFix is

A Bangla-first platform for citizens to report city issues (potholes, water leaks, illegal dumping, broken streetlights) and track them to resolution. Four roles:

| Role | Persona | Surface |
|---|---|---|
| `citizen` | Rahim | Report an issue, follow it, rate the response |
| `dispatcher` | Habib | Triage the queue, assign crews, adjudicate duplicates |
| `crew` | Rashid | Work assigned tickets, upload after-photos |
| `admin` | — | Configure the city; **every write requires a WebAuthn assertion** |

The product thesis is **civic observability**: visibility is what makes a city's silence unmaintainable, and trust signals (status trail, push notifications, "feel heard" feedback) are how that visibility translates into restored trust.

---

## 2. The stack

| Layer | Choice | Version | Why |
|---|---|---|---|
| Framework | Next.js (App Router) | 14.2 | Server components + route handlers in one runtime |
| Language | TypeScript `strict` | 5.6 | `isolatedModules: true` — no const-enum access |
| Styling | Tailwind + `tokens.css` | 3.4 | The token file is the design-system source of truth |
| ORM | Prisma | 5.22 | Typed client, parameterised queries by construction |
| Database | PostgreSQL | 16 | Relational integrity for the ticket lifecycle |
| Password hashing | `@node-rs/argon2` | 2.0 | Argon2id, prebuilt native binary (no build step) |
| WebAuthn | `@simplewebauthn/{server,browser}` | 10 | FIDO2 attestation + assertion |
| OTP | `otpauth` + Twilio SDK | 9 / 4.23 | TOTP-style codes over SMS |
| Maps | MapLibre GL JS | 4.7 | Open-source, no token needed for OSM raster tiles |
| Charts | Recharts | 3.10 | Dispatcher performance boards |
| Push | Web Push API (VAPID) | — | Stubbed in v1; the wire call lands in v1.1 |
| Blob storage | `@aws-sdk/client-s3` | 3.1158 | R2/MinIO/S3 compatible; local filesystem provider for dev |
| Unit testing | Vitest | 2.1 | Fast, jsdom for component tests |
| E2E / visual | Playwright | 1.63 | Route specs + mockup pixel baselines |

**Runtime floor:** Node 20 (`engines.node: >=20.0.0`). **CI runs Node 22** — see §9.

---

## 3. Layering

```
app/**/page.tsx          React Server Components — presentation
components/**            Shared UI (62 .tsx files)
app/api/**/route.ts      HTTP boundary — parse, delegate, serialise  (61 files, 8,374 LOC)
lib/**                   Service layer — all business logic            (22,107 LOC)
prisma/schema.prisma     16 models
```

The rule the codebase actually follows, stated in `aidlc/spaces/default/memory/team.md`:

- **Route handlers are thin adapters.** Parse the request (Zod), call a `lib/` service function, serialise the result. Measured on 2026-10-27: the `app/api` route files hold 0% unit coverage and no business logic; `lib/**` holds 90.89% lines / 80.85% branches / 94.11% functions.
- **No raw SQL or direct Prisma in route handlers.** No `$queryRaw` / `$executeRaw` exists anywhere in the repo. Prisma access is confined to `lib/db-switch.ts`, `lib/admin/users-db.ts` and `lib/platform/push.ts`.
- **All async service functions return `Result<T, E>`** and never throw across the boundary.
- **Zod at every external API boundary.**
- **All user-facing copy goes through `lib/i18n/keys.ts`** via `t(key, vars)`.

### `lib/` module map

| Module | Responsibility |
|---|---|
| `lib/db.ts` | The Prisma client singleton |
| `lib/db-switch.ts` | **The facade.** Picks Prisma or the in-memory dev store per request; exposes one `db.*` surface to everything above it |
| `lib/dev-store.ts` | In-memory implementation of the `db` surface, seeded personas |
| `lib/auth/` | Sessions, guards, passwords, OTP + providers, WebAuthn, login lockout |
| `lib/platform/` | Audit, dedup, transitions, push, rate limiting, the production DB guard |
| `lib/serializers/` | Role-aware ticket and trail shaping — the PII boundary |
| `lib/storage/` | Blob providers (local + S3), key safety, MIME/size validation |
| `lib/admin/` | City setup, taxonomy, users, adoption metrics, ticket queries |
| `lib/dispatcher/` · `lib/crew/` · `lib/citizen/` | Role-scoped service logic |
| `lib/i18n/keys.ts` | The typed key registry — the only path to user-facing copy |
| `lib/geo/` · `lib/map/` | Dhaka District geometry, OSM raster tile config |
| `lib/format/` · `lib/photo/` | Ticket ids, dates, photo URLs, client-side downscale |
| `lib/ui/` | Contrast checking, icon map, map colour themes |
| `lib/docs/openapi.ts` | The OpenAPI 3.0.3 contract, as typed code |

---

## 4. The data model

16 models. The centre of gravity is `Ticket`.

```
City ──┬── Ward ──┐
       ├── Department
       ├── Category
       ├── SlaPolicy
       ├── Crew
       └── User ──┬── Session
                 ├── OtpCode
                 ├── WebAuthnChallenge
                 ├── PushSubscription
                 └── Ticket ──┬── TicketTrailEntry
                              ├── TicketPhoto
                              └── AuditEntry (via actorId)
```

| Model | Purpose |
|---|---|
| `City` | The tenant. Holds `dedupRadiusMeters`, geofence config, city config JSON |
| `Ward` | Administrative unit with an optional GeoJSON boundary polygon |
| `Department` | Owning body (e.g. "Dhaka WASA", "Dhaka North City Corporation") |
| `Category` | Issue taxonomy, with a `narrow` flag that caps photo count at 2 |
| `Crew` | A field team; belongs to a ward and department |
| `SlaPolicy` | Response-time targets per category/priority |
| `User` | One of four roles. `wardId` is `null` for admins (city-wide authority) |
| `OtpCode` | Hashed OTP, with `expiresAt`, `attempts`, `consumedAt` |
| `WebAuthnChallenge` | The challenge ledger, mirrored to `User.webAuthnChallenge` |
| `Session` | Server-side session rows — cookies are opaque pointers |
| `PushSubscription` | VAPID endpoint + keys per user |
| `Ticket` | The report. Status, category, ward, department, lat/lng, photos, dedup |
| `TicketTrailEntry` | Append-only status history — the "status trail" trust signal |
| `TicketPhoto` | Before/after photos with a caption |
| `AuditEntry` | Append-only forensic trail (see §6) |
| `DedupFlag` | A near-duplicate awaiting dispatcher adjudication |

### Migrations

| Migration | Date | Contents |
|---|---|---|
| `20261012102438_init` | 2026-10-12 | The initial schema |
| `20261013000000_add_ticket_photo` | 2026-10-13 | The `TicketPhoto` model |
| `20261027140000_platform_gaps` | 2026-10-27 | Platform-layer gap fixes |

---

## 5. The request lifecycle

```
Browser
  │  cityfix_session cookie (HMAC-signed, httpOnly)
  ▼
Route handler (app/api/**/route.ts)
  │  1. Zod parse body/query          → 400 on failure
  │  2. getActiveSession()             → 401 if absent/expired
  │  3. requireRole / requireSameCity  → 403 on failure
  │  4. requireScope (ward/dept)       → 403 on failure
  │  5. requireWebAuthn (admin writes) → 401 on failure
  ▼
Service layer (lib/**)
  │  business logic, Result<T, E>, never throws across the boundary
  ▼
db-switch facade (lib/db-switch.ts)
  ├──► Prisma → PostgreSQL 16
  └──► In-memory dev store   (CITYFIX_DEV_STORE=1)
  ▼
Serializer (lib/serializers/ticket.ts)
  │  strips internalNote, assignedCrewId, reporterName for citizens
  │  anonymises trail actors to "সিটি কর্পোরрешন"
  ▼
JSON response
```

**Guard order is deliberate.** On the shared transition route, `requireWebAuthn` fires *after* the ticket load and the scope checks — so an out-of-scope dispatcher gets `cross_ward_access_denied` rather than a confusing WebAuthn error, and a missing ticket 404s rather than demanding a ceremony that cannot change anything. This is pinned by `tests/unit/transition-webauthn.test.ts` and documented in ADR-007.

### The dev-store seam

`lib/db-switch.ts` is the single fork in the stack. `CITYFIX_DEV_STORE=1` swaps Prisma for `lib/dev-store.ts` (in-memory, seeded personas). Everything above the facade is unchanged — the same `db.ticket.findUnique`, the same serializer, the same guards.

This is why the whole unit suite and the Playwright route specs run without a database. CI sets `CITYFIX_DEV_STORE=1` for exactly this reason.

**The seam has a cost.** In dev-store mode the session cookie is the **raw session id, unsigned** (`lib/auth/session.ts:131`), the WebAuthn gate is bypassable via `DEV_SKIP_WEBAUTHN=1`, and the `/api/dev/*` routes are live. The `DEV_SKIP_WEBAUTHN` bypass is correctly double-gated on `isDevStore()` — but there is **no production guard on `CITYFIX_DEV_STORE` itself**, which is the single highest-value missing control (see [SECURITY_AUDIT.md §5.4](SECURITY_AUDIT.md#54-production-db-guard--libplatformdb-guardts)).

---

## 6. The status trail and audit trail

Two separate append-only histories, serving different purposes.

### Status trail (`TicketTrailEntry`)

The citizen-visible one. Every transition writes `{ from, to, actor, timestamp, note? }` atomically with the status change.

```
submitted ──► routed ──► in_progress ──► resolved
     │           │            │
     └───────────┴────────────┴──────► cancelled   (admin only)
```

`resolved`, `closed` and `cancelled` are terminal. The engine lives in `lib/platform/transitions.ts` and is **backend-agnostic** — it works on Prisma or the dev store.

An illegal move raises `InvalidTransitionError` → **409 `invalid_transition`** on the shared route, **422 `illegal_transition`** on the v1 dispatcher/crew routes.

### Audit trail (`AuditEntry`)

The forensic one. `writeAudit(...)` (`lib/platform/audit.ts`) records `{ entityType, entityId, action, actorId, beforeValue, afterValue, timestamp }`.

**Immutability holds** — a repo-wide search for `auditEntry.update|delete|upsert` returns no matches. There is no API path that modifies or removes an audit row, and the `actor` relation is `onDelete: Restrict`.

---

## 7. Cross-cutting mechanisms

### The dedup policy

A citizen reporting the same pothole twice is the central UX risk — it erodes trust in the whole system. `lib/platform/dedup.ts`:

1. Bounding-box pre-filter in Prisma (parameterised `where`, never string-built).
2. Haversine distance in JS against the candidates.
3. Radius = `city.dedupRadiusMeters ?? 50`.
4. `take: 20` caps the candidate scan.

A match raises a **dedup flag**, not a rejection — the citizen is asked to confirm, and the answer is audited (`ticket.dedup_detected`, `ticket.dedup_declined`). A dispatcher adjudicates later (`dedup_confirmed` / `dedup_dismissed`).

### The geofence

`lib/report-geofence.ts` rejects a report outside the city polygon at submit time. It is **orthogonal** to dedup: the geofence is a pre-submit guard; dedup is a post-pin policy.

### Photos

Two-layer defence:

| Layer | Control | Where |
|---|---|---|
| Client | Downscale to 1600 px, JPEG q80 | `lib/photo/downscale.ts` |
| Server | MIME allow-list (`jpeg`/`png`/`webp`), 5 MB cap | `lib/storage/blob.ts:134-143` |
| Server | Key safety — rejects `..`, backslashes, `\0`, leading `/`, >512 chars | `lib/storage/blob.ts:211-221` |
| Server | Path containment on local resolution | `lib/storage/blob.ts:340-349` |

### Rate limiting

Per-IP token buckets in `lib/platform/rate-limit.ts`. Default 1 req/s, capacity 1 in production. **In-process** — not multi-instance safe.

### Production guards

| Guard | Behaviour |
|---|---|
| `lib/platform/db-guard.ts` | In production, a **loopback** `DATABASE_URL` is a hard error. Handles both URL and libpq keyword forms; covers 127.0.0.0/8. Fail-closed (the latch records success only). |
| `lib/auth/webauthn.ts` | In production, `WEBAUTHN_RP_ORIGIN` must be https and `WEBAUTHN_RP_ID` must not be `localhost`. |

Both are **lazy, not module-load** — Vercel runs `next build` in a separate process that may not have env vars, and a module-load throw would fail the build before the app ever serves a request. Both validate on first use and loud-fail on the first real request.

**There is no third guard** on `CITYFIX_DEV_STORE`. Adding one would close the entire dev-seam class at once.

---

## 8. Front-end architecture

- **React Server Components** by default; client components only where interactivity demands (`'use client'`).
- **`tokens.css`** is the design-token source of truth; Tailwind consumes it. Editing either requires re-running `npm run test:mockups` — the mockup baselines are gating.
- **`lib/i18n/keys.ts`** is a typed key registry. `t(key, vars)` is the only way to surface user-facing copy. `npm run check:i18n-keys` verifies no key is orphaned.
- **Bangla-first, English-secondary.** The product surfaces are Bangla; the project surfaces (docs, code, audit) are English.
- **Web-first.** The platform moved from mobile-first to web-first on 2026-10-04. Rashid's field-crew pages retain a 390×844 phone fallback.

### The visual-regression contract

12 static mockups under `design-artifacts/D-Design-System/01-Visual-Design/mockups/` are captured as **25 committed PNG baselines** at `tests-mockups/baselines/01-mockups.spec.ts/`. The Playwright gate compares full-page screenshots against them at `maxDiffPixelRatio: 0.01`.

**The baselines must be produced on the platform that asserts on them.** Chromium rasterises the Noto Sans Bengali webfont differently on Windows and Linux, and `11-public-landing` at 1024×768 renders 40 px shorter on Linux (1526 px vs 1566 px). There is no baseline that satisfies both platforms.

The supported refresh path is `gh workflow run regenerate-baselines.yml` → `gh run download` → commit. `npm run test:update-baselines` on a dev machine reintroduces the drift. **Editing a mockup means refreshing its baselines in the same change** — a stale baseline fails the gate exactly as hard as a real regression, and the two are indistinguishable from the error message alone.

Full detail: [tests-mockups/README.md](../tests-mockups/README.md).

---

## 9. Build and CI pipeline

`.github/workflows/ci.yml` — 12 steps, `ubuntu-latest`, 25-minute timeout.

```
checkout → setup-node (22) → npm ci → prisma generate
  → lint → typecheck → unit → coverage
  → playwright install → visual regression → build
  → upload visual diff artifacts (always)
```

**Node 22, not 20.** `jsdom@30` pulls `undici@8`, whose `engines.node` is `>=22.19.0`. Undici's decompress interceptor calls `zlib.constants.ZSTD_d_windowLogMax`, which only exists from Node 22.15. On Node 20 that constant is `undefined`, so the module throws at import time and the whole Vitest suite dies. That failure was invisible locally (the dev machine runs Node 24) and meant CI was red on every run from 2026-10-29 — which also silently **skipped the coverage floor and the visual gate**, because they run after the unit step.

`engines.node` in `package.json` stays `>=20.0.0` because that is the *runtime* floor for the deployed app. The jsdom dependency is a *test-time* requirement only and is stricter. If the runtime floor is ever raised, raise the CI pin in the same commit.

**Coverage floor: 80%** lines / branches / functions / statements, scoped to `lib/**/*.ts` with `all: true` (so an untested file still counts against the threshold). Current: **92.59% lines / 82.56% branches / 93.54% functions**.

The floor is never weakened to make a run green — the correct response to a threshold failure is to add real tests for the uncovered path.

---

## 10. Key architectural decisions

| ADR | Decision | Status |
|---|---|---|
| ADR-006 | Admin cross-city model — city-scoped or platform-wide | **Unresolved** — this is the open question behind [SECURITY_AUDIT.md finding #7](SECURITY_AUDIT.md) |
| ADR-007 | Admin write paths require a WebAuthn assertion; reads exempt; dispatcher/crew writes are **not** admin writes | Adopted, implemented, tested |

**ADR-007 in force.** Every write under `/api/v1/admin/*` calls `requireRole` → `await requireWebAuthn` → `writeAudit`, in that order. The shared transition route applies the same rule to admins only, after the ticket load and scope checks. The ADR's own test suite exercises the route through its real dependency graph rather than with mocks.

ADR-007:229-234 predicted the remaining exposure: *"a future admin write route added outside `/api/v1/admin/*` skips the gate."* `PUT /api/profile` is exactly that route — found and reported in [SECURITY_AUDIT.md finding #5](SECURITY_AUDIT.md).

---

## 11. Known architectural weaknesses

| # | Weakness | Impact | Where |
|---|---|---|---|
| 1 | **No `middleware.ts`** | Every route hand-rolls its auth; a route is protected only if its author remembered. This is the structural cause of findings #5 and #7 | repo-wide |
| 2 | **No production guard on `CITYFIX_DEV_STORE`** | The dev store disables the database, unsigns the session cookie, and bypasses WebAuthn. One env var flips all three | `lib/db-switch.ts` |
| 3 | **In-process rate limiting and lockout** | Not shared across instances; resets on restart | `lib/platform/rate-limit.ts:17`, `lib/auth/login-lockout.ts:38` |
| 4 | **WebAuthn challenges are never consumed** | One ceremony authorises every admin write for 5 minutes | `lib/db-switch.ts:679-752` |
| 5 | **Two admin surfaces disagree on city scope** | `admin/tickets/{id}` calls `requireSameCity`; `admin/cities/{id}/**` does not | `app/api/v1/admin/` |
| 6 | **Coverage scoped to `lib/**` only** | Route handlers have 0% unit coverage by design. Acceptable — they are thin adapters, covered by Playwright — but it means a handler with hidden logic is invisible to the floor | `vitest.config.ts` |
| 7 | **`AuditEntry.actor` is `onDelete: Restrict`** | Deleting a user who has acted may fail. Either a bug or a safeguard needing a documented path | `prisma/schema.prisma:428-443` |
| 8 | **Web Push is stubbed** | v1 ships no push delivery; the wire call is v1.1 | `lib/platform/push.ts` |
| 9 | **The local blob provider's photos 404** | No `/api/blob` route exists, so local photo URLs are dead links. Fails closed, but the local provider is untested end-to-end | `lib/storage/blob.ts:180` |

---

## 12. Related documents

- [API_DOCUMENTATION.md](API_DOCUMENTATION.md) — all 77 operations
- [SECURITY_AUDIT.md](SECURITY_AUDIT.md) — the findings register with evidence
- [KNOWN_ISSUES.md](KNOWN_ISSUES.md) — 31 flags
- [TESTING_REPORT.md](TESTING_REPORT.md) — suites, coverage, and gaps
- [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) — hosting and environment variables
