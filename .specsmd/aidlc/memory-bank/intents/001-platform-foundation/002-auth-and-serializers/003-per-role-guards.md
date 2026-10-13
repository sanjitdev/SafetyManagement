---
id: 003-per-role-guards
unit: 002-auth-and-serializers
intent: 001-platform-foundation
status: done
priority: must
created: 2026-10-04T00:00:00Z
updated: 2026-10-04T00:00:00Z
assigned_bolt: null
implemented: true
---

# Story: 003-per-role-guards

## User Story

**As a** platform engineer
**I want** server-side guards for cross-role,
cross-city, cross-ward, and cross-department denial
**So that** every route handler can enforce the v1
authorization model in one line and never accidentally
expose internal surfaces to citizens.

## Acceptance Criteria

- [x] **Given** `requireRole('dispatcher')`, **When**
  called on a session whose `role` is `'citizen'`,
  **Then** it returns `Result.err(ApiError({ error:
  'forbidden' }))`.
- [x] **Given** `requireSameCity(session)`, **When**
  called on a record whose `cityId` ≠ `session.cityId`,
  **Then** it returns
  `Result.err(ApiError({ error:
  'cross_city_forbidden' }))`.
- [x] **Given** `requireScope(session)`, **When**
  called on a dispatcher session bound to ward A, **Then**
  reads on ward B records return `forbidden`.
- [x] **Given** the guard contract, **When** any guard
  denies, **Then** it returns
  `Result<Session, ApiError>` — **never throws**.
- [x] **Given** `requireRole(id, target)`, **When**
  called, **Then** it loads the record by id and checks
  the session can act on it (combines role + scope
  checks).

## Technical Notes

- Guards are the **only** authorization path in v1.
  Route handlers MUST call them at the top.
- Cross-city denial is enforced at the API layer; the
  citizen serializer hides internal fields (see
  004-citizen-serializer).

## Dependencies

### Requires
- 002-user-otp-session (the session model)

### Enables
- 004-citizen-serializer (the serializer reads the
  role to decide what to expose)
- 011-first-five-endpoints (every endpoint reads
  through guards)
- Every authenticated route in WO-001+

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Session is null | Guard returns `not_authenticated` |
| Role mismatch | Guard returns `forbidden` |
| City mismatch | Guard returns `cross_city_forbidden` |
| Ward mismatch | Guard returns `forbidden` |
| Dispatcher scope bound to a department that doesn't own the ticket's category | Guard returns `forbidden` |
| `requireRole` is called twice (once on role, once on scope) | Result chains; first failure short-circuits |

## Out of Scope

- Per-route policy files (deferred to v1.1 if needed).
- Per-action WebAuthn gate (deferred to WO-005).
- Role hierarchies (v1 has flat roles).

## Status

Done. Shipped in WO-000 (2026-10-04). All allow + deny
paths covered by unit tests.