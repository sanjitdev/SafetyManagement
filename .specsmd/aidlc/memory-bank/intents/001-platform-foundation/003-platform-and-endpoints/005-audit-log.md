---
id: 005-audit-log
unit: 003-platform-and-endpoints
intent: 001-platform-foundation
status: done
priority: must
created: 2026-10-04T00:00:00Z
updated: 2026-10-04T00:00:00Z
assigned_bolt: null
implemented: true
---

# Story: 005-audit-log

## User Story

**As a** city admin
**I want** every state-changing operation to leave a
trace in an append-only audit log
**So that** I can answer "who did what when" for any
ticket or user change without trusting the operator's
memory.

**As a** platform engineer
**I want** the audit log to be enforced in the service
layer (not at the DB level in v1)
**So that** the same contract works against the dev
store and Prisma.

## Acceptance Criteria

- [x] **Given** the schema, **When** I review the
  `AuditEntry` model, **Then** it has
  `(entityType, entityId)` and `(actorId, timestamp)`
  indexes.
- [x] **Given** `writeAudit({ entityType, entityId,
  actorId, action, payload })`, **When** called from a
  service function, **Then** an `AuditEntry` is
  appended.
- [x] **Given** the API layer, **When** it handles
  state-changing requests, **Then** the corresponding
  service function calls `writeAudit(...)` after the
  write succeeds.
- [x] **Given** the API layer, **When** it issues
  queries, **Then** it never issues UPDATE or DELETE
  against `AuditEntry`.
- [x] **Given** a unit test, **When** I run it,
  **Then** the happy path + a "missing actor" edge
  case both pass.

## Technical Notes

- `payload` is a JSON object; v1 stores it as
  `String` (Prisma JSON is a v1.1 path).
- v1.1 may add a Postgres rule that prevents UPDATE /
  DELETE on `AuditEntry`. The v1 service-layer
  contract is the load-bearing guard.

## Dependencies

### Requires
- 001-city-config-models (the AuditEntry model)
- 010-backend-facade (the `db.auditEntry.*` shape)
- 002-user-otp-session (the actor)

### Enables
- 011-first-five-endpoints (every endpoint writes
  audit)
- Every state-changing operation in WO-001+

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| `actorId` is null (system event) | `writeAudit` accepts null; actor renders as "System" |
| `payload` exceeds column size | Reject with `ApiError({ error: 'payload_too_large' })` |
| Audit write fails (DB down) | Service function returns `Result.err`; the original write is rolled back |
| Cross-city audit read | `requireSameCity` enforces; audit never crosses cities |

## Out of Scope

- A read-side admin UI for the audit log (deferred
  to WO-005).
- A Postgres rule preventing UPDATE / DELETE
  (deferred to v1.1).

## Status

Done. Shipped in WO-000 (2026-10-04).