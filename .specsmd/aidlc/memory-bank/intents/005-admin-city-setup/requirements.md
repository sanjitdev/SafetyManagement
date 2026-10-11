---
intent: 005-admin-city-setup
phase: inception
status: draft
created: 2026-10-11T18:00:00Z
updated: 2026-10-11T18:00:00Z
---

# Requirements: Admin City Setup (WO-004)

## Intent Overview

Build the **WO-004 admin surface** — the configuration
console where a city admin manages wards, categories,
departments, the dedup radius, and (in WO-005) the
WebAuthn challenge flow. The admin surface is gated
by WebAuthn for any write.

This intent is **draft**. It captures the
inception-stage framing; the units and stories will be
decomposed when WO-003 ships and this intent is
unblocked. The four `/api/auth/webauthn/*` route
handlers ship with this intent (deferred from
Intent 001).

## Business Goals

| Goal | Success Metric | Priority |
|------|----------------|----------|
| Wards | Admin can add / edit / remove a ward in < 30s | Must |
| Categories | Admin can add / edit / remove a category in < 30s | Must |
| Departments | Admin can add / edit / remove a department in < 30s | Must |
| Dedup radius | Admin can override the 50m default per city | Must |
| WebAuthn | Admin can register + login with a hardware key | Must |
| Real OTP SMS provider | Real provider wired (replaces the v1 stub) | Must |
| Audit | Every config change writes an `AuditEntry` | Must |

## Functional Requirements

### ADM-REQ-001 — Auth (WebAuthn mandatory for writes)

- **Description**: An admin signs in via WebAuthn.
  Reads are allowed with a session cookie; writes
  require a fresh WebAuthn assertion.
- **Acceptance Criteria**:
  - `User.role = 'admin'`.
  - `requireRole('admin')` gates read.
  - `requireWebAuthn` gates write (a fresh assertion
    per write).
  - The four `/api/auth/webauthn/*` route handlers
    ship: register, login, assertion, revoke.
- **Priority**: Must

### ADM-REQ-002 — Ward management

- **Description**: Add / edit / remove a ward. The
  polygon comes from a GeoJSON upload.
- **Acceptance Criteria**:
  - `app/admin/wards/page.tsx` exists.
  - `app/admin/wards/[id]/page.tsx` (edit) exists.
  - Polygon is GeoJSON (v1.1 may add a PostGIS
    `geometry` column).
  - Every change writes an `AuditEntry`.
- **Priority**: Must

### ADM-REQ-003 — Category management

- **Description**: Add / edit / remove a category.
  Each category is bound to a department.
- **Acceptance Criteria**:
  - `app/admin/categories/page.tsx` exists.
  - `app/admin/categories/[id]/page.tsx` (edit)
    exists.
  - `isNarrow` (for the photo cap) is editable.
  - Every change writes an `AuditEntry`.
- **Priority**: Must

### ADM-REQ-004 — Department management

- **Description**: Add / edit / remove a department.
  Deleting a department may orphan categories; the
  UI warns.
- **Acceptance Criteria**:
  - `app/admin/departments/page.tsx` exists.
  - `app/admin/departments/[id]/page.tsx` (edit)
    exists.
  - Deleting a department shows the orphan warning.
  - Every change writes an `AuditEntry`.
- **Priority**: Must

### ADM-REQ-005 — Dedup radius

- **Description**: Override `City.dedupRadiusMeters`
  per city.
- **Acceptance Criteria**:
  - `app/admin/cities/[id]/page.tsx` exists.
  - The form edits the dedup radius (in meters).
  - Every change writes an `AuditEntry`.
- **Priority**: Must

### ADM-REQ-006 — Real OTP SMS provider

- **Description**: Wire the real OTP SMS provider
  (replacing the v1 stub).
- **Acceptance Criteria**:
  - The provider abstraction in `lib/auth/otp.ts` is
    preserved.
  - The real provider is selected via env var
    (`OTP_PROVIDER`).
  - The provider's secrets are in env vars, not
    hard-coded.
- **Priority**: Must

### ADM-REQ-007 — Audit dashboard

- **Description**: A read-only view of the
  `AuditEntry` rows for the city, filterable by
  actor, action, entityType, date range.
- **Acceptance Criteria**:
  - `app/admin/audit/page.tsx` exists.
  - Filter UI: actor, action, entityType, date.
  - Pagination: cursor-based.
- **Priority**: Must

## Non-Functional Requirements

| Requirement | Metric | Target |
|-------------|--------|--------|
| Ward edit | p95 latency | < 200ms |
| Audit dashboard load | p95 latency | < 500ms |
| WebAuthn assertion | p95 latency | < 1s |

## Constraints

- WebAuthn is **mandatory** for any admin write (per
  `decision-index.md` ADR-007).
- Every config change writes an `AuditEntry`.
- The OTP SMS provider interface is preserved (real
  provider selected in WO-004).

## Open Questions

| Question | Owner | Due Date | Resolution |
|----------|-------|----------|------------|
| Real OTP SMS provider | Tech lead | WO-004 | TBD per pilot city |
| Self-service admin sign-up vs invitation-only | Product owner | WO-004 PRD | TBD |
| Bulk import for wards (GeoJSON file) | Engineering | WO-004 PRD | Defer to v1.1 if not in PRD |

## Status notes

This intent is **draft**. The units and stories will
be decomposed when WO-003 ships.
