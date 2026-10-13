---
unit: 001-data-and-dev-store
intent: 001-platform-foundation
phase: inception
status: complete
created: 2026-10-04T00:00:00Z
updated: 2026-10-11T18:00:00Z
---

# Unit Brief: Data and Dev Store

## Purpose

Stand up the persistence layer: 12 Prisma models + 2
enums, the Prisma singleton, the backend-agnostic facade
in `lib/db-switch.ts`, and the in-memory dev store that
seeds Dhaka-North so every later unit and Bolt can run
without a managed Postgres. This unit is the **first
unit in the project**; nothing else can build until the
data layer is shaped.

## Scope

### In Scope

- The `prisma/schema.prisma` model (12 models, 2 enums,
  FK rules per the data-stack standard).
- The Prisma singleton in `lib/db.ts` (HMR-safe via
  `globalThis`).
- The backend-agnostic facade in `lib/db-switch.ts`
  that exposes the same `db.ticket.*`, `db.user.*`, etc.
  shape as the Prisma client.
- The in-memory dev store in `lib/dev-store.ts` (with
  the Dhaka-North seed).
- The dev session helper in `lib/dev-session.ts`.
- Unit tests for the seed + facade toggle.

### Out of Scope

- The auth model (Unit 002).
- The audit / dedup / transitions / rate limit / push
  helpers (Unit 003).
- The five HTTP endpoints (Unit 003).
- The real OTP SMS provider (deferred to WO-004).
- PostGIS / S3 / Redis (deferred to v1.1).

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| PLAT-REQ-001 | Per-city config (City, Ward, Department, Category) | Must |
| PLAT-REQ-011 | Backend-agnostic facade (db-switch) | Must |

## Domain Concepts

### Key Entities

| Entity | Description | Attributes |
|--------|-------------|------------|
| City | A tenant in the multi-tenant pilot | `id`, `slug`, `name`, `dedupRadiusMeters`, `locale` |
| Ward | A geographic subdivision of a city | `id`, `cityId`, `number`, `name` |
| Department | A work-stream owned by a city (Roads, Sanitation, etc.) | `id`, `cityId`, `slug`, `name` |
| Category | A reportable issue type (Pothole, Drainage, Streetlight) | `id`, `cityId`, `slug`, `name`, `departmentId?`, `isNarrow` |
| User | The four-role identity model | `id`, `cityId`, `phone`, `email?`, `role`, `passwordHash?` |
| OtpCode | SMS-OTP code (hashed) | `id`, `userId`, `scope`, `codeHash`, `expiresAt`, `attempts` |
| WebAuthnChallenge | Admin WebAuthn challenge (deferred handlers) | `id`, `userId`, `challenge`, `expiresAt` |
| Session | HTTP-only signed session | `id`, `userId`, `expiresAt`, `cityId`, `wardId?`, `departmentId?` |
| PushSubscription | Web Push subscription (no wire call yet) | `id`, `userId`, `endpoint`, `p256dh`, `auth` |
| Ticket | A citizen-submitted issue | `id`, `cityId`, `reporterId`, `wardId`, `categoryId`, `locationLat`, `locationLng`, `addressText?`, `photoUrls`, `description`, `status`, `assignedCrewId?`, `internalNote?` |
| TicketTrailEntry | A status / note event on a ticket | `id`, `ticketId`, `actorId?`, `fromStatus?`, `toStatus?`, `note?`, `timestamp` |
| AuditEntry | Append-only audit log | `id`, `entityType`, `entityId`, `actorId`, `action`, `payload`, `timestamp` |

### Key Operations

| Operation | Description | Inputs | Outputs |
|-----------|-------------|--------|---------|
| `db.city.findUnique({ where: { slug } })` | Look up a city by slug | `{ slug }` | `City \| null` |
| `db.ticket.create({ data })` | Create a new ticket | ticket payload | `Ticket` |
| `db.ticket.findMany({ where, take })` | List tickets (with filters) | `{ cityId, status?, wardId?, take }` | `Ticket[]` |
| `seed()` | Dev store: create Dhaka-North template | none | void |

## Story Summary

| Metric | Count |
|--------|-------|
| Total Stories | 2 |
| Must Have | 2 |
| Should Have | 0 |
| Could Have | 0 |

### Stories

| Story ID | Title | Priority | Status |
|----------|-------|----------|--------|
| 001-city-config-models | Per-city config schema (City, Ward, Department, Category) | Must | Done |
| 010-backend-facade | Backend-agnostic facade + dev store | Must | Done |

## Dependencies

### Depends On

| Unit | Reason |
|------|--------|
| (none) | First unit in the project |

### Depended By

| Unit | Reason |
|------|--------|
| 002-auth-and-serializers | Needs the `User` model + facade |
| 003-platform-and-endpoints | Needs every model + facade |

### External Dependencies

| System | Purpose | Risk |
|--------|---------|------|
| Prisma 5.22 | Schema + client | Low (pinned) |
| PostgreSQL 16 | Production primary (not required for v1) | Low (v1 uses dev store) |

## Technical Context

### Suggested Technology

- Prisma 5.22 (per `standards/tech-stack.md`).
- In-memory store in TypeScript (the dev store).
- Node 20 LTS.

### Integration Points

| Integration | Type | Protocol |
|-------------|------|----------|
| `lib/db-switch.ts` ↔ Prisma client | DB | Prisma |
| `lib/db-switch.ts` ↔ `lib/dev-store.ts` | DB | in-memory (env toggle) |
| `lib/dev-store.ts` → dev session | session | cookie (signed) |

### Data Storage

| Data | Type | Volume | Retention |
|------|------|--------|-----------|
| `City`, `Ward`, `Department`, `Category` | SQL | low | permanent |
| `User`, `OtpCode`, `Session`, `PushSubscription` | SQL | medium | per `data-stack.md` |
| `Ticket`, `TicketTrailEntry`, `AuditEntry` | SQL | high | per `data-stack.md` (audit append-only) |

## Constraints

- Schema rules in `standards/data-stack.md` are
  authoritative (Cascade vs Restrict vs SetNull, unique
  constraints, indexes).
- All 12 models + 2 enums ship in this unit.

## Success Criteria

### Functional

- [x] Prisma schema compiles.
- [x] `db-switch.ts` exposes the same shape as the
  Prisma client.
- [x] Dev store seeds Dhaka-North on first access.
- [x] All 14 unit tests pass (schema + facade + seed).

### Non-Functional

- [x] `npx tsc --noEmit` is clean.
- [x] Line coverage on `lib/` ≥ 80%.

### Quality

- [x] 14/14 unit tests passing.
- [x] Code reviewed (PR-merge to `prd-development`).

## Bolt Suggestions

This intent predates the specsmd bolt convention; the
implementation is in the repo. A modern equivalent would
be one `ddd-construction-bolt` per unit, or a single
bolt that takes all three units because the
walking-skeleton rule is "smallest end-to-end slice."

## Notes

This is the **walking skeleton** for the project. The
Construction Verification Command at the time of ship
returned green:

```bash
npx tsc --noEmit && \
  npm run test:unit && \
  npm run test:mockups && \
  curl -fs http://localhost:3000/
```
