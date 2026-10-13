---
standard: data-stack
phase: standards
status: complete
created: 2026-10-11T18:00:00Z
updated: 2026-10-11T18:00:00Z
---

# Data Stack

## Overview

Database and persistence decisions for CityFix. The Prisma schema in
`prisma/schema.prisma` is the source of truth; this standard captures
the modeling rules and the rationale behind each non-obvious choice.

## Decisions

### Database

- **PostgreSQL 16** (single primary; v1.1 may add read replicas).
- **Connection** via `DATABASE_URL`; managed by Prisma.
- v1 ships the schema and a working dev-store abstraction
  (`lib/dev-store.ts` + `lib/db-switch.ts`) so the platform + UI
  code paths can be exercised without a live DB.

### Schema source of truth

- `prisma/schema.prisma` — 12 models + 2 enums.
  - Per-city config: `City`, `Ward`, `Department`, `Category`.
  - Auth: `User` (4 roles), `OtpCode`, `WebAuthnChallenge`, `Session`,
    `PushSubscription`.
  - Tickets: `Ticket`, `TicketTrailEntry`, `AuditEntry`.
- All 12 models ship in WO-000 and are exercised by the in-memory dev
  store. The dev store's seed (`lib/dev-store.ts → seed()`) creates the
  Dhaka-North template the way `prisma/seed.ts` will once DATABASE_URL
  is real.

### Schema rules

- **Cascade vs Restrict**:
  - `City` → `Ward`, `Category`, `Department`, `User` → `OtpCode`,
    `Ticket` → `TicketTrailEntry` → `Cascade` (deleting the parent
    makes the children meaningless).
  - `Ticket` → `reporter`, `ward`, `category` → `Restrict`
    (a ticket's data is auditable; deleting the reporter must not
    silently lose the ticket history).
  - `Ticket` → `assignedCrew` → `SetNull` (deleting a crew member
    should not delete their tickets).
  - `Category` → `department` → `SetNull` (department delete may
    orphan categories; admin re-assigns).
- **Uniqueness**:
  - `City.slug`, `Ward[cityId, number]`, `Department[cityId, slug]`,
    `Category[cityId, slug]`, `User[cityId, phone]`,
    `User[cityId, email]`, `PushSubscription.endpoint` are `@unique`
    where it makes domain sense. Phone is unique **per city** (not
    globally) — different cities can have the same phone.
- **Indexes**:
  - `(cityId, status)`, `(cityId, wardId)`, `(reporterId)`,
    `(assignedCrewId)`, `(updatedAt)` on `Ticket` (powers
    activity feed, dispatcher queue, and most-frequent queries).
  - `(cityId, locationLat, locationLng)` compound on `Ticket` for
    the dedup pre-filter (PLAT-REQ-004). v1 filters post-query in JS;
    v1.1 may add a BRIN index.
  - `(entityType, entityId)`, `(actorId, timestamp)` on `AuditEntry`
    for the admin audit-trail view (Feature #22).
  - `(userId, scope)`, `expiresAt` on `OtpCode` for OTP rate limit.
  - `(ticketId, timestamp)` on `TicketTrailEntry` for trail reads.

### Audit & immutability

- `AuditEntry` is **append-only**. The API layer never issues UPDATE
  or DELETE against it; this is enforced in service functions, not at
  the DB level in v1 (v1.1 may add a Postgres rule).

### Enums

- `Role { citizen | dispatcher | crew | admin }` — the four-role model.
- `TicketStatus { submitted | routed | in_progress | resolved | closed | cancelled }`.
  `closed` and `cancelled` are terminal; `resolved` is also terminal in
  the citizen view but the dispatcher can re-open (v1.1).

### ORM / Database Client

- **Prisma 5.22** (`@prisma/client`).
- **Singleton pattern** in `lib/db.ts` (HMR-safe via `globalThis`).
- **Backend-agnostic facade** in `lib/db-switch.ts`: the same API
  routes that call `db.ticket.findUnique({...})` work against either
  Prisma (production) or the in-memory dev store (`CITYFIX_DEV_STORE=1`).

### Migrations

- v1 ships `prisma db push` as the schema-sync path (no migration
  history file). `prisma migrate dev` requires a real `DATABASE_URL`
  and is the v1.1 path.

### Out of scope (deferred to v1.1)

- PostGIS `geometry` columns for the `Ticket.location` point and
  `Ward.polygon`. v1 stores them as text (`String?`).
- Row-level security for multi-tenant isolation. v1 enforces at the
  API layer.
- Photo blob storage in S3-compatible object storage. v1 stores
  base64 data URLs in `Ticket.photoUrls`.
