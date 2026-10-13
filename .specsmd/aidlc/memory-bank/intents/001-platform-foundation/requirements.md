---
intent: 001-platform-foundation
phase: inception
status: complete
created: 2026-10-04T00:00:00Z
updated: 2026-10-11T18:00:00Z
---

# Requirements: Platform Foundation (WO-000)

## Intent Overview

Build the **WO-000 platform layer**: the foundational
cross-cutting capabilities that every later work order (WO-001,
WO-002, WO-003, WO-004, WO-005) depends on. This is the
modular monolith's shared services tree — Prisma schema,
auth, session, serializers, dedup, transitions, audit, rate
limit, push — and the **first five** HTTP endpoints the
later surfaces consume. WO-000 was the first AIDLC intent in
this space and is now **complete** as of 2026-10-04; the
specsmd artifacts here capture it as history.

This intent is the **walking skeleton** for CityFix. It
demonstrates the deployment pipeline is alive (the
Construction Verification Command
`npx tsc --noEmit && npm run test:unit && npm run test:mockups && curl -fs http://localhost:3000/`
must return green) and proves every layer of the architecture
in a minimal form (data → API → UI smoke). All persona WOs
(WO-001+) gate on this being signed off.

## Business Goals

| Goal | Success Metric | Priority |
|------|----------------|----------|
| Stand up the data model | 12 Prisma models + 2 enums compile + dev store seeds Dhaka-North | Must |
| Stand up auth | Phone+OTP path + password + sessions + per-role guards all unit-tested | Must |
| Stand up citizen serializer | Internal fields stripped from citizen view, role-aware shape | Must |
| Stand up the audit trail | Every state change writes an `AuditEntry` | Must |
| Stand up dedup as a prompt | 50m Haversine pre-filter, returns `dedup_match: true` to the client | Must |
| Stand up rate limit | In-process token bucket, per-key, 5/sec default | Must |
| Stand up the first 5 endpoints | `/api/tickets`, `/api/tickets/:id`, `/api/auth/otp/request`, `/api/auth/otp/verify`, `/api/v1/activity` | Must |
| Walking skeleton | Construction Verification Command returns green; `localhost:3000/` serves the home page | Must |

## Functional Requirements

### PLAT-REQ-001 — Per-city config (City, Ward, Department, Category)

- **Description**: Four `City`-scoped config models
  exist; the dev store seeds one city (Dhaka-North) with
  wards, departments, and categories.
- **Acceptance Criteria**:
  - Schema: `City`, `Ward`, `Department`, `Category`
    compile in Prisma.
  - Dev store: `seed()` creates Dhaka-North with ≥1 ward,
    ≥2 departments (Roads, Sanitation), ≥3 categories
    (Pothole, Drainage, Streetlight).
  - Cross-city isolation: `requireSameCity(session)`
    rejects cross-city reads/writes.
- **Priority**: Must
- **Related Stories**: 001-city-config-models

### PLAT-REQ-002 — User + auth (User, OtpCode, Session)

- **Description**: The four-role `User` model; OTP codes
  are argon2id-hashed; sessions are HMAC-SHA256-signed
  HTTP-only cookies with a 14-day TTL.
- **Acceptance Criteria**:
  - `User.role ∈ {citizen, dispatcher, crew, admin}`
    enum compiles.
  - `OtpCode` is hashed (never stored plaintext).
  - 5 attempts per phone, 5-minute TTL.
  - Session cookie: HTTP-only, signed, 14-day TTL.
- **Priority**: Must
- **Related Stories**: 002-user-otp-session

### PLAT-REQ-003 — Password hashing (argon2id)

- **Description**: Passwords hashed with OWASP 2024
  argon2id parameters.
- **Acceptance Criteria**:
  - `lib/auth/password.ts` exports `hashPassword` and
    `verifyPassword`.
  - OWASP 2024 parameters (memoryCost 19 MiB,
    timeCost 2, parallelism 1).
  - Unit test covers hashing + verification round-trip
    + wrong-password rejection.
- **Priority**: Must
- **Related Stories**: 002-user-otp-session

### PLAT-REQ-004 — Per-role guards (requireRole, requireSameCity, requireScope)

- **Description**: Server-side guards for cross-city and
  cross-role enforcement.
- **Acceptance Criteria**:
  - `lib/auth/guards.ts` exports `requireRole`,
    `requireSameCity`, `requireScope`, `requireSameWard`,
    `requireSameDepartment`, `requireRole(id, target)`.
  - Each guard returns `Result<Session, ApiError>` —
    never throws.
  - Unit tests cover allow + deny paths for each
    guard.
- **Priority**: Must
- **Related Stories**: 003-per-role-guards

### PLAT-REQ-005 — Citizen serializer (hides internal fields)

- **Description**: A role-aware serializer exposes only
  the fields each role should see.
- **Acceptance Criteria**:
  - `lib/serializers/ticket.ts → serializeTicketForRole(role, ticket)`
    strips `assignedCrewId`, `internalNote`, raw actor
    names; maps actor → "City corporation" /
    "সিটি কর্পোরেশন".
  - Dispatcher / crew see the full record.
  - Unit tests cover all four roles.
- **Priority**: Must
- **Related Stories**: 004-citizen-serializer

### PLAT-REQ-006 — Audit log (AuditEntry, writeAudit)

- **Description**: Append-only audit log; every state
  change writes an `AuditEntry`.
- **Acceptance Criteria**:
  - `AuditEntry` model exists with `(entityType,
    entityId)` + `(actorId, timestamp)` indexes.
  - `lib/platform/audit.ts → writeAudit(...)` writes
    from service-layer functions.
  - API layer never issues UPDATE/DELETE against
    `AuditEntry` (v1 enforces in service functions; v1.1
    adds Postgres rule).
  - Unit test covers happy path + mock-states.
- **Priority**: Must
- **Related Stories**: 005-audit-log

### PLAT-REQ-007 — Rate limit (in-process token bucket)

- **Description**: Per-key rate limit on auth + ticket
  submit paths.
- **Acceptance Criteria**:
  - `lib/platform/rate-limit.ts → checkRateLimit({ key,
    limit })` returns `{ ok, retryAfterMs }`.
  - v1: in-process token bucket.
  - v1.1: Redis-backed (deferred).
  - Unit test covers allow + deny + recovery paths.
- **Priority**: Must
- **Related Stories**: 006-rate-limit

### PLAT-REQ-008 — Dedup pre-filter (50m Haversine)

- **Description**: On `POST /api/tickets`, an open ticket
  within `City.dedupRadiusMeters = 50` of the new pin
  short-circuits the response with `dedup_match: true`.
- **Acceptance Criteria**:
  - `lib/platform/dedup.ts → findCandidateTickets(...)`
    uses Haversine distance in JS (post-query in v1).
  - Returns `{ dedup_match: true, existing_ticket_id,
    distance_meters, existing_status }` with HTTP 200.
  - Dedup is a prompt, not an auto-merge.
  - Unit test covers near-miss + match + cross-city
    edge cases.
- **Priority**: Must
- **Related Stories**: 007-dedup-prefilter

### PLAT-REQ-009 — Status transitions engine

- **Description**: The status pipeline
  `submitted → routed → in_progress → resolved → closed`
  with `cancelled` as a citizen-initiated terminal state.
- **Acceptance Criteria**:
  - `lib/platform/transitions.ts → assertTransition(from,
    to)` throws `ApiError` on invalid.
  - Valid pairs: `submitted → routed`, `submitted →
    cancelled`, `routed → in_progress`, `routed →
    cancelled`, `in_progress → resolved`, `resolved →
    closed`.
  - Unit test covers each valid pair + each invalid
    pair.
- **Priority**: Must
- **Related Stories**: 008-status-transitions

### PLAT-REQ-010 — Push subscription scaffold (no wire call yet)

- **Description**: `PushSubscription` model + helpers;
  the actual `web-push.sendNotification(...)` wire call
  is stubbed.
- **Acceptance Criteria**:
  - `lib/platform/push.ts` exports the helpers.
  - `PushSubscription.endpoint` is `@unique`.
  - v1: schema + helpers; v1.1: wire call.
- **Priority**: Must
- **Related Stories**: 009-push-scaffold

### PLAT-REQ-011 — Backend-agnostic facade (db-switch)

- **Description**: The same route handlers run against
  Prisma (production) or the in-memory dev store
  (`CITYFIX_DEV_STORE=1`).
- **Acceptance Criteria**:
  - `lib/db-switch.ts` exposes the same `db.ticket.*`,
    `db.user.*`, etc. shape as the Prisma client.
  - Toggle: `process.env.CITYFIX_DEV_STORE === '1'`.
  - Dev store logs fallback paths so QA sees them.
- **Priority**: Must
- **Related Stories**: 010-backend-facade

### PLAT-REQ-012 — First five endpoints

- **Description**: Five route handlers wired through
  the service layer:
  - `POST /api/tickets` (citizen create + dedup)
  - `GET /api/tickets` (citizen list)
  - `GET /api/tickets/:id` (citizen read)
  - `POST /api/auth/otp/request` (OTP)
  - `POST /api/auth/otp/verify` (OTP → session)
  - `GET /api/v1/activity` (city activity feed)
- **Acceptance Criteria**:
  - All five return Zod-validated JSON.
  - All five use the service layer (never Prisma
    directly).
  - All five handle auth via `getActiveSession()`.
  - All five use the role-aware serializer where they
    return tickets.
- **Priority**: Must
- **Related Stories**: 011-first-five-endpoints

## Non-Functional Requirements

### Performance

| Requirement | Metric | Target |
|-------------|--------|--------|
| Route handler response | p95 latency (dev store) | < 50ms |
| Dedup pre-filter | p95 latency | < 30ms |
| Session verify | p95 latency | < 5ms |

### Scalability

| Requirement | Metric | Target |
|-------------|--------|--------|
| Pilot traffic | Loads/month | 50k |
| Active sessions | Concurrent | 1k |
| Tickets | Total | 100k |

### Security

| Requirement | Standard | Notes |
|-------------|----------|-------|
| Password hashing | argon2id OWASP 2024 | `lib/auth/password.ts` |
| Session cookie | HTTP-only, HMAC-SHA256 signed, 14-day TTL | `lib/auth/session.ts` |
| Per-role guards | `requireRole`, `requireSameCity`, `requireScope` | `lib/auth/guards.ts` |
| Cross-city denial | API layer denies cross-city ops | Citizen serializer hides internal fields |
| Audit log | Append-only | v1 enforces in service functions |
| CSRF | SameSite=Lax cookie (v1) | v1.1 adds CSRF token |

### Reliability

| Requirement | Metric | Target |
|-------------|--------|--------|
| Unit test coverage | Lines on `lib/` | ≥ 80% |
| Walking skeleton | Construction Verification Command | green |
| Visual regression | Playwright baselines | tolerance 0.005 |

### Compliance

| Requirement | Standard | Notes |
|-------------|----------|-------|
| Citizen PII | Indefinite retention, citizen-initiated delete | `aidlc-state.md` WO-001 feasibility |
| Audit immutability | Append-only service contract | v1: enforced in service functions |

## Constraints

### Technical Constraints (inherited from standards)

- See `memory-bank/standards/tech-stack.md`,
  `data-stack.md`, `coding-standards.md`,
  `system-architecture.md`, `api-conventions.md`.

### Intent-specific constraints

- The walking skeleton MUST be verified end-to-end via
  the recorded Construction Verification Command before
  any persona WO begins.
- The dev-store abstraction is part of v1 (not a v1.1
  deferral); the project must complete on the dev store
  before a managed Postgres is required.

### Business Constraints

- WO-000 is gating; persona WOs cannot begin until WO-000
  PRD is signed off (`aidlc/spaces/default/memory/project.md`).

## Assumptions

| Assumption | Risk if Invalid | Mitigation |
|------------|-----------------|------------|
| TypeScript strict + Prisma 5.22 covers the type-safety boundary | Drift between Prisma model and service types | `npx tsc --noEmit` per-Bolt gate |
| In-process token bucket is sufficient at pilot scale (50k loads/month) | Cross-process rate limit needed sooner | v1.1 Redis path is named |
| Dev store seed matches `prisma/seed.ts` | Seed drift between dev and prod paths | `lib/dev-store.ts → seed()` is the template `prisma/seed.ts` derives from |
| Argon2id is acceptable on Node 20 LTS | OWASP params need re-tuning | Re-tune at WO-005 hardening |

## Open Questions

| Question | Owner | Due Date | Resolution |
|----------|-------|----------|------------|
| Hosting target (Vercel vs Cloudflare vs Railway) | Tech lead | WO-001 PRD | Deferred to WO-001 PRD ratification |
| Real OTP SMS provider | Tech lead | WO-004 | Stubbed in WO-000; real provider chosen in WO-004 |
| Photo retention policy | Product owner | WO-002 | Legal/privacy; deferred to WO-002 |
| Dedup radius default | Product owner | WO-005 | `50m` is the seed; per-city override in admin UI (WO-005) |

## Status notes

This intent is **complete** as of 2026-10-04. The unit
decomposition, unit briefs, and stories below are
historical captures of the WO-000 ship; status fields on
every artifact reflect completion. Construction Bolts for
WO-000 are listed under
`memory-bank/bolts/` (none created — WO-000 predates the
specsmd bolt convention; the implementation is in the
repo).