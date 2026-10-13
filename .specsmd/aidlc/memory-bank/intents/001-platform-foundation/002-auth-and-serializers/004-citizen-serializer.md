---
id: 004-citizen-serializer
unit: 002-auth-and-serializers
intent: 001-platform-foundation
status: done
priority: must
created: 2026-10-04T00:00:00Z
updated: 2026-10-04T00:00:00Z
assigned_bolt: null
implemented: true
---

# Story: 004-citizen-serializer

## User Story

**As a** citizen
**I want** to see only the fields that are mine —
status, the assigned crew's organization name, the
status trail — without the internal actor names or
internal notes
**So that** I cannot accidentally view another
citizen's PII or the operator's private notes.

**As a** dispatcher / crew member
**I want** to see the full ticket record including
`assignedCrewId`, `internalNote`, and raw actor names
**So that** I can do my job.

## Acceptance Criteria

- [x] **Given** `serializeTicketForRole('citizen',
  ticket)`, **When** called, **Then** the output
  strips `assignedCrewId`, `internalNote`, and raw
  actor names.
- [x] **Given** a citizen view, **When** the actor
  field is rendered, **Then** it is mapped to "City
  corporation" / "সিটি কর্পোরেশন" (i18n).
- [x] **Given** `serializeTicketForRole('dispatcher',
  ticket)`, **When** called, **Then** the output is
  the full ticket record.
- [x] **Given** `serializeTicketForRole('crew',
  ticket)`, **When** called, **Then** the output is
  the full ticket record.
- [x] **Given** `serializeTicketForRole('admin',
  ticket)`, **When** called, **Then** the output is
  the full ticket record.
- [x] **Given** the serializer, **When** it runs,
  **Then** it returns a typed object (not `unknown`).

## Technical Notes

- The serializer is the **contract** for what a citizen
  sees. See `decision-index.md` ADR-005 and the
  `api-conventions.md` standard.
- Citizen-facing endpoints MUST go through the
  serializer; raw `db.ticket.*` shapes MUST NEVER be
  returned to the citizen.

## Dependencies

### Requires
- 002-user-otp-session (the role on the session)
- 003-per-role-guards (the guard returns the session
  with role)

### Enables
- 011-first-five-endpoints (every endpoint that
  returns a ticket)
- Every ticket read in WO-001+ (citizen, dispatcher,
  crew)

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Citizen tries to read another citizen's ticket | Guard rejects first; serializer never sees it |
| Crew member in city A tries to read a ticket in city B | Guard rejects first |
| `internalNote` is null | Serializer omits the field (not emits null) |
| Actor is the system (no `actorId`) | Serializer emits "System" / "সিস্টেম" |

## Out of Scope

- Field-level encryption (deferred to v1.1).
- Audit log redaction (the audit log keeps raw actor
  names — it's internal-only).

## Status

Done. Shipped in WO-000 (2026-10-04). All four roles
covered by unit tests.