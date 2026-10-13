---
id: 001-city-config-models
unit: 001-data-and-dev-store
intent: 001-platform-foundation
status: done
priority: must
created: 2026-10-04T00:00:00Z
updated: 2026-10-04T00:00:00Z
assigned_bolt: null
implemented: true
---

# Story: 001-city-config-models

## User Story

**As a** platform engineer
**I want** four `City`-scoped config models
(`City`, `Ward`, `Department`, `Category`) defined in
the Prisma schema and seeded into the in-memory dev
store
**So that** every later surface (citizen, dispatcher,
crew, admin) has at least one city to operate against
without needing a managed Postgres at v1.

## Acceptance Criteria

- [x] **Given** the Prisma schema, **When** I run
  `prisma generate`, **Then** all four models compile
  without errors.
- [x] **Given** the dev store's `seed()` function,
  **When** it runs on first access, **Then** it creates
  Dhaka-North with ≥1 ward, ≥2 departments (Roads,
  Sanitation), and ≥3 categories (Pothole, Drainage,
  Streetlight).
- [x] **Given** a session on city A, **When** the
  service layer reads a record scoped to city B,
  **Then** `requireSameCity(session)` rejects the
  operation with `ApiError({ error: 'cross_city_forbidden' })`.
- [x] **Given** the schema rules in `standards/data-stack.md`,
  **When** I review the FK semantics, **Then** City →
  Ward / Department / Category are `Cascade`; Category
  → department is `SetNull`.

## Technical Notes

- Schema rules in `standards/data-stack.md` are
  authoritative (Cascade vs Restrict vs SetNull, unique
  constraints, indexes).
- `City.slug` is `@unique`; `Ward[cityId, number]`,
  `Department[cityId, slug]`, `Category[cityId, slug]`
  are unique per city.

## Dependencies

### Requires
- None (first story in the project)

### Enables
- 002-user-otp-session
- 003-per-role-guards
- 004-citizen-serializer
- 005-audit-log
- 006-rate-limit
- 007-dedup-prefilter
- 008-status-transitions
- 009-push-scaffold
- 010-backend-facade
- 011-first-five-endpoints

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Two cities with the same `slug` | Rejected by `@unique` |
| Two wards in the same city with the same `number` | Rejected by composite unique |
| Deleting a city | Cascade deletes wards / departments / categories |
| Deleting a department that has categories | `SetNull` — categories are orphaned |

## Out of Scope

- The `User` / `OtpCode` / `Session` / `PushSubscription`
  models (covered by 002 and 009).
- The `Ticket` / `TicketTrailEntry` / `AuditEntry`
  models (covered by 007, 008, 005).
- The backend-agnostic facade (covered by
  010-backend-facade).
- PostGIS / S3 / Redis (deferred to v1.1).

## Status

Done. Shipped in WO-000 (2026-10-04).