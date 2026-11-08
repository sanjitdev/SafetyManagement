---
standard: decision-index
phase: standards
status: complete
created: 2026-10-11T18:00:00Z
updated: 2026-10-11T18:00:00Z
total_decisions: 9
---

# Decision Index

## Overview

The single source of truth for every Architecture / Engineering Decision
Record (ADR) in CityFix. Each ADR captures the Context, Decision,
Consequences, and Alternatives Rejected. The full rationale for each
ADR lives in the linked source artifact (tech audit, design log,
team.md / project.md / org.md corrections); this index is the lookup
table.

## Decision register

### ADR-001 — TypeScript strict across the stack

- **Date**: 2026-10-04
- **Source**: `design-artifacts/E-Development/000-tech-audit.md`
- **Status**: Affirmed; gates every Bolt via `npx tsc --noEmit`.

**Context**: The citizen-facing surface is high-trust; type errors at
runtime would erode the "feel heard" signal. Plain JS would let
Prisma model drift, Zod inference, and Next.js route handler
contracts diverge silently.

**Decision**: `tsconfig.json` with `strict: true`, `isolatedModules:
true`, `noEmit: true`, `target: ES2022`, `module: ESNext`. No
const-enum (`isolatedModules` forbids it).

**Consequences**: All routes, services, serializers, and components
are typed. The build is the per-Bolt gate. `i18n` keys are typed
(`keyof typeof TRANSLATIONS`) so missing keys break the build.

**Alternatives rejected**:
- **Plain JS + JSDoc** — looser; type drift across the Prisma
  boundary, no compile-time guard for the i18n key registry.
- **JavaScript in routes, TypeScript in `lib/`** — splits the
  type-safety boundary in two; rejected.

---

### ADR-002 — Next.js 14 App Router (modular monolith)

- **Date**: 2026-10-04
- **Source**: `design-artifacts/E-Development/000-tech-audit.md`
- **Status**: Affirmed; shipped in WO-000.

**Context**: v1 must ship a full-stack surface (API + UI) for a
pilot at 50k loads/month without the operational cost of a
separate backend, message bus, or microservice mesh.

**Decision**: Single Next.js 14 App Router repo. `app/api/**/route.ts`
exposes HTTP; `app/**/page.tsx` exposes the UI; `lib/` is the
service layer; Prisma is the data layer. Page-level server
components by default; opt into `'use client'` only when state,
effects, or browser APIs are required.

**Consequences**: Single deploy unit, single TypeScript process,
no inter-service contracts to maintain. The `lib/` tree is the
service boundary — every other layer routes through it.

**Alternatives rejected**:
- **Next.js (frontend) + Express/Fastify (backend)** — two
  processes, two deploys, two type-safety boundaries, twice the
  cost at v1 scale.
- **tRPC monolith** — couples the contract to the client; a
  public citizen portal eventually needs a stable REST surface
  for non-browser clients.
- **Separate services from day 1** — premature; v1's whole
  surface is one team at one city.

---

### ADR-003 — Prisma 5.22 + PostgreSQL 16

- **Date**: 2026-10-04
- **Source**: `design-artifacts/E-Development/000-tech-audit.md`
- **Status**: Affirmed; shipped in WO-000.

**Context**: v1 needs a typed query layer, a real primary, and
clear FK semantics for an auditable ticket trail.

**Decision**: Prisma 5.22 with `@@map` / `@map` for snake_case
columns. PostgreSQL 16. `lib/db.ts` is the singleton (HMR-safe
via `globalThis`). `lib/db-switch.ts` is the backend-agnostic
facade: same code path runs against Prisma (production) or
`lib/dev-store.ts` (in-memory dev, `CITYFIX_DEV_STORE=1`).

**Consequences**: Cascade vs Restrict vs SetNull is explicit in
the schema. All 12 models + 2 enums ship in WO-000 and are
exercised by the dev store. Raw SQL is forbidden in app routes
(`team.md`).

**Alternatives rejected**:
- **Drizzle ORM** — thinner; the team's familiarity with Prisma
  + the i18n-typed `keyof` pattern favour Prisma's generated
  client.
- **MySQL** — weaker JSON + GIN/BRIN story; Postgres chosen
  for the post-v1.1 PostGIS path.

---

### ADR-004 — In-memory dev store + backend-agnostic facade

- **Date**: 2026-10-04
- **Source**: `lib/db-switch.ts`, `lib/dev-store.ts` (WO-000)
- **Status**: Affirmed; shipped in WO-000.

**Context**: Without a managed Postgres at the WO-000 ship
moment, the platform layer + every route handler still had to
be exercised end-to-end (the WO-000 PRD's gate). Setting up
Postgres + Prisma migrations just to prove the API was
operational was high-friction for a greenfield Bolt.

**Decision**: An in-memory store (`lib/dev-store.ts`) is the dev
fallback. `lib/db-switch.ts` exposes the same `db.ticket.*`,
`db.user.*`, etc. shape as the Prisma client. The route
handlers never know which is active; only the env var
`CITYFIX_DEV_STORE=1` toggles it.

**Consequences**:
- Every Bolt that touches the data layer can be verified
  without a live DB.
- The dev store's seed (`lib/dev-store.ts → seed()`) creates
  the same Dhaka-North template `prisma/seed.ts` will once
  `DATABASE_URL` is real.
- Silent failures are forbidden (`team.md`); the dev store
  logs fallback paths so QA can see when a path was missed.

**Alternatives rejected**:
- **SQLite via Prisma** — Prisma's SQLite driver diverges from
  Postgres in subtle ways (FK enforcement, JSON columns) and
  would let the dev path drift from prod.
- **Mock the Prisma client at the route boundary** — couples
  tests to the route shape; rejected.

---

### ADR-005 — Four-role auth model (citizen / dispatcher / crew / admin)

- **Date**: 2026-09-18
- **Source**: `aidlc/spaces/default/memory/project.md` (Inception, 2026-09-18)
- **Status**: Affirmed; cannot be revisited without a UX Review + Work Order revision.

**Context**: CityFix's v1 surface is a four-sided marketplace
(citizen ↔ dispatcher ↔ field crew ↔ admin). v1 cannot
collapse two of these without losing the operational loop
(dispatcher queues work, crew resolves it, admin configures
it).

**Decision**:
- `Role { citizen | dispatcher | crew | admin }` enum in
  Prisma.
- `lib/auth/guards.ts → requireRole(role)` is the
  server-side gate.
- Dispatcher + crew sessions are bound to `(cityId, wardId?,
  departmentId?)` at login time.
- Citizens authenticate by phone + NID + name + password +
  SMS-OTP (6-digit, 5-min TTL, 5 attempts, argon2-hashed).
- Admins authenticate by WebAuthn (mandatory for writes).
  Schema + challenge table ship in WO-000; the four
  `/api/auth/webauthn/*` route handlers are deferred to
  WO-005.

**Consequences**: Per-role guards + per-city scope + per-ward
scope make the cross-city denial path explicit. The
citizen-facing serializer hides internal fields; the
internal surfaces see the full record.

**Alternatives rejected**:
- **Two-role model (citizen / staff)** — loses the
  dispatcher vs crew distinction, which the WO-002 PRD
  needs to operate.
- **Department-as-role** — confuses operational scope with
  identity; rejected.

---

### ADR-006 — Dedup is a prompt, not an auto-merge

- **Date**: 2026-10-04
- **Source**: `design-artifacts/E-Development/WO-001-citizen-report-flow.md`
- **Status**: Affirmed; cannot be revisited without a UX Review + Work Order revision.

**Context**: Auto-merging duplicates erodes the "feel heard"
signal — the citizen's report disappears. The pilot's trust
hypothesis depends on every submitted report getting its own
trail entry.

**Decision**: On a `POST /api/tickets`, the dedup pre-filter
(`lib/platform/dedup.ts → findCandidateTickets`) flags any
open ticket within `City.dedupRadiusMeters = 50` of the new
pin. The API returns `{ dedup_match: true,
existing_ticket_id, distance_meters, existing_status }`
with a 200 — the client renders the dedup prompt (1.10b)
and lets the citizen either link to the existing ticket
or submit a new one.

**Consequences**:
- Every submission produces a `TicketTrailEntry` (either on
  the new ticket or as a comment on the existing one).
- Dedup-decline is logged as a structured event AND flagged
  for city-side review; the WO-002 dispatcher can decide
  manually.
- The dedup pre-filter runs in JS (post-query, in v1); v1.1
  may add a BRIN index on `(cityId, locationLat,
  locationLng)`.

**Alternatives rejected**:
- **Auto-merge** — erodes the trust signal.
- **Hard reject** — the citizen has no recourse if the
  dedup is wrong; the prompt keeps the citizen in control.

---

### ADR-007 — WebAuthn mandatory for admin writes

- **Date**: 2026-10-04
- **Source**: `design-artifacts/E-Development/000-tech-audit.md`
- **Status**: Affirmed; schema ships in WO-000; the four route
  handlers are deferred to WO-005.
- **Full ADR**: `docs/adr/ADR-007-admin-write-webauthn.md`

**Context**: Admins configure wards, categories, departments,
and dedup-radius overrides. A password compromise against an
admin account is a high-blast-radius event.

**Decision**: Admin write paths require WebAuthn. The
`WebAuthnChallenge` model ships in WO-000; the four
`/api/auth/webauthn/*` route handlers (register, login,
assertion, revoke) are deferred to WO-005. `requireRole('admin')`
already exists; a future `requireWebAuthn` guard will gate
write paths.

**Consequences**: Admin accounts can be compromised only if
the attacker has the hardware key. The v1 admin bootstrap
flow accepts a one-time-password until WO-005 lands.

**Alternatives rejected**:
- **Admin password + SMS-OTP** — same blast radius as the
  citizen path; rejected for admins.
- **TOTP only** — better than SMS-OTP, but still phishable.

**Update (2026-11-08)** — the `requireWebAuthn` guard shipped
(Bolt 005-001) and is enforced on all 16 write handlers under
`/api/v1/admin/*`. The shared transition route
`app/api/tickets/[id]/transition/route.ts` — an admin write path
outside that tree, carrying the admin-only crew-reassign and the
admin-any-status branch — was left ungated; it is now gated for
the `admin` role. The gate is a property of the **role**, not of
the path: reads are exempt, and dispatcher/crew writes are not
admin writes. Pinned by `tests/unit/transition-webauthn.test.ts`.

---

### ADR-008 — Test-after methodology + 80% line coverage on `feature` scope

- **Date**: 2026-10-04
- **Source**: `aidlc/spaces/default/memory/team.md`,
  `aidlc/spaces/default/memory/org.md` (testing posture)
- **Status**: Affirmed; org.md default for greenfield
  projects; team.md confirms; project.md is silent (inherits).

**Context**: Greenfield project; team is fast-iterating on
the platform layer and the WO-001 surface in parallel. TDD
ceremony would slow the first-pass Bolts without proving
the architecture.

**Decision**: Test-after. 80% line coverage floor on
`feature`, `mvp`, `enterprise`, `infra`, `classic` scopes.
Visual regression is gating (Playwright baselines,
tolerance `0.005`).

**Consequences**:
- `lib/` files MUST add a Vitest test.
- `npx tsc --noEmit` MUST be clean.
- Visual baselines under `tests-mockups/baselines/01-mockups.spec.ts/`
  are gating; new mockup → new baseline.

**Alternatives rejected**:
- **TDD across the board** — slows greenfield Bolts;
  affirmed the team prefers test-after for first-pass.
- **BDD / ATDD** — too much ceremony for the v1 surface;
  can graduate later.

---

### ADR-009 — Defer per-phone login throttle to v1.1

- **Date**: 2026-10-11
- **Source**: `bolts/002-001-auth-and-profile/adr-009-login-throttle.md`
- **Status**: Accepted.
- **Bolt**: 002-001-auth-and-profile (Bolt Decision item
  G2 from the citizen report flow intent).
- **Path**: `bolts/002-001-auth-and-profile/adr-009-login-throttle.md`
- **Summary**: v1 ships the existing per-IP login rate
  limit + per-IP lockout. The per-phone `(phone,
  'login')` throttle is deferred to v1.1 alongside the
  Redis-backed rate-limit primitive; the in-process
  bucket's single-process correctness would make the
  phone-keyed limit a false sense of safety at v1
  pilot scale.
- **Read when**: Working on auth rate-limiting,
  credential-stuffing defenses, or the v1.1 platform
  hardening Bolt that ships the Redis-backed limiter.

---

### ADR-012 — OTP provider-agnostic facade (typed `OtpProvider` + factory keyed on `OTP_PROVIDER`)

- **Date**: 2026-10-12
- **Source**: `bolts/005-003-real-otp-provider/ddd-03-adr-analysis.md`
- **Status**: Accepted (Bolt 005-003).
- **Bolt**: 005-003-real-otp-provider (Intent 005, Unit 003,
  Story ADM-006).
- **Path**: `bolts/005-003-real-otp-provider/ddd-03-adr-analysis.md`
- **Summary**: A typed `OtpProvider` interface
  (`name` + `send(phone, code): Promise<OtpResult>`) +
  a factory keyed on `process.env.OTP_PROVIDER` (default
  `stub`, real = `twilio`) + a 3-attempt `[100, 200, 400]`
  ms backoff retry on 5xx + immediate-fail on 4xx. The
  public `sendOtp(phone, code, actorId)` lives in
  `lib/auth/otp.ts`; failure rows are recorded as
  `entityType: 'user'`, `action: 'otp_send_failed'`,
  `afterValue: { phone, provider, error }` to keep the
  `AuditWriteInput.entityType` union closed. The
  `OTP_PROVIDER=stub` default is the dev persona; production
  MUST set `OTP_PROVIDER=twilio` — a prod-safety guardrail
  documented in Bolt 005-004's audit dashboard.
- **Read when**: Adding a new SMS provider (bulk24, SSL
  Wireless, Meta Cloud API), debugging OTP delivery
  failures, reviewing the prod-safety guardrail, or wiring
  the v1.1 ops alarms.

---

### ADR-016 — Persisted per-user monitor read marker (deferred to v1.1)

- **Date**: 2026-10-27
- **Source**: `docs/adr/ADR-016-monitor-read-marker.md`
- **Status**: Proposed (deferred to v1.1).
- **Bolt**: 008-013-dispatcher-live-monitor (Intent 003,
  Unit 006, Story DISP-008).
- **Path**: `docs/adr/ADR-016-monitor-read-marker.md`
- **Summary**: The dispatcher's live monitor ships a per-row
  `unread` flag whose derivation is correct but whose input is
  never supplied — `buildMonitorRows` reads an optional
  `lastReadAt` map that `listMonitorTickets` never passes, so
  every watched ticket with a trail entry renders `unread: true`
  on every poll. The acknowledge action writes an audit row
  only; there is no persisted per-user read marker, and the
  Prisma schema has no read-marker table. The recommended
  v1.1 shape is a dedicated `MonitorReadMarker` model with a
  `@@unique([userId, ticketId])` composite unique and a
  `lastReadAt` timestamp, written by the existing ack route and
  read by `listMonitorTickets`. The GET route gains **no** new
  query parameter — the marker is derived server-side from the
  session's `userId`, so a client cannot spoof a read state.
  Rejected alternatives: a per-user scalar watermark (wrong
  granularity — one acknowledgement would mark every watched
  ticket read), deriving unreadness from the append-only audit
  log (makes the accountability log do a second, conflicting
  job), and the client-held status quo (kept only as a time-boxed
  v1 deferral). The v1 pilot ships the client-held
  acknowledgement exactly as Bolt 008-013 built it.
- **Read when**: Implementing the v1.1 monitor read-marker
  Bolt, adding the second Prisma migration on top of the
  pending `20261027140000_platform_gaps`, or changing the
  monitor's acknowledge semantics.

---

## Cross-references

- **Tech audit** (source for ADRs 001-004, 007):
  `design-artifacts/E-Development/000-tech-audit.md`.
- **Inception corrections** (source for ADRs 005, 006):
  `aidlc/spaces/default/memory/project.md` (Corrections).
- **Org/team policy** (source for ADR 008):
  `aidlc/spaces/default/memory/{org,team}.md` (Testing
  Posture).
- **Project design log**: `_progress/00-design-log.md` — the
  narrative of how these decisions were reached.
- **Per-intent ADRs**: each intent's
  `units/<unit>/bolt-decisions.md` (deferred) captures
  per-Bolt implementation choices that don't rise to
  project-wide policy.
