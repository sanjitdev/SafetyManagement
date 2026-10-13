---
unit: 002-auth-and-serializers
intent: 001-platform-foundation
phase: inception
status: complete
created: 2026-10-04T00:00:00Z
updated: 2026-10-11T18:00:00Z
---

# Unit Brief: Auth and Serializers

## Purpose

Stand up the four-role auth model
(citizen / dispatcher / crew / admin), the per-role +
per-scope guards, and the role-aware citizen serializer
that hides internal fields. This unit is the **second
unit in the project**; the platform cross-cutting
helpers and the first endpoints (Unit 003) gate on this
because every endpoint reads through the auth + serializer
pipeline.

## Scope

### In Scope

- `lib/auth/password.ts` (argon2id, OWASP 2024).
- `lib/auth/otp.ts` (request, verify, 5 attempts, 5-min
  TTL, hashed).
- `lib/auth/session.ts` (HMAC-SHA256 signed HTTP-only
  cookie, 14-day TTL).
- `lib/auth/guards.ts` (`requireRole`,
  `requireSameCity`, `requireScope`, `requireSameWard`,
  `requireSameDepartment`).
- `lib/serializers/ticket.ts`
  (`serializeTicketForRole`).
- Unit tests for each module.

### Out of Scope

- The data layer (Unit 001).
- The cross-cutting platform helpers and endpoints
  (Unit 003).
- WebAuthn route handlers (deferred to WO-005).
- Real OTP SMS provider (deferred to WO-004).

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| PLAT-REQ-002 | User + auth (User, OtpCode, Session) | Must |
| PLAT-REQ-003 | Password hashing (argon2id) | Must |
| PLAT-REQ-004 | Per-role guards | Must |
| PLAT-REQ-005 | Citizen serializer | Must |

## Domain Concepts

### Key Entities

| Entity | Description | Attributes |
|--------|-------------|------------|
| User | The four-role identity | `id`, `cityId`, `phone`, `email?`, `role`, `passwordHash?` |
| OtpCode | SMS-OTP (hashed) | `id`, `userId`, `scope`, `codeHash`, `expiresAt`, `attempts` |
| Session | HTTP-only signed session | `id`, `userId`, `expiresAt`, `cityId`, `wardId?`, `departmentId?` |

### Key Operations

| Operation | Description | Inputs | Outputs |
|-----------|-------------|--------|---------|
| `hashPassword(plain)` | Hash a password (argon2id) | `string` | `string` |
| `verifyPassword(plain, hash)` | Verify a password | `string`, `string` | `boolean` |
| `requestOtp(phone, scope)` | Issue a 6-digit OTP | `string`, `string` | `{ ok, retryAfterMs? }` |
| `verifyOtp(phone, code, scope)` | Verify a 6-digit OTP | `string`, `string`, `string` | `{ ok, userId? }` |
| `getActiveSession()` | Read the cookie + return `Session` | none | `Session \| null` |
| `requireRole(role)` | Server-side guard | `Role` | `Result<Session, ApiError>` |
| `requireSameCity(session)` | Cross-city denial | `Session` | `Result<Session, ApiError>` |
| `serializeTicketForRole(role, ticket)` | Role-aware ticket shape | `Role`, `Ticket` | `SerializedTicket` |

## Story Summary

| Metric | Count |
|--------|-------|
| Total Stories | 3 |
| Must Have | 3 |
| Should Have | 0 |
| Could Have | 0 |

### Stories

| Story ID | Title | Priority | Status |
|----------|-------|----------|--------|
| 002-user-otp-session | User + OtpCode + Session + password | Must | Done |
| 003-per-role-guards | Per-role + per-scope guards | Must | Done |
| 004-citizen-serializer | Role-aware citizen serializer | Must | Done |

## Dependencies

### Depends On

| Unit | Reason |
|------|--------|
| 001-data-and-dev-store | Needs the `User` / `OtpCode` / `Session` models + facade |

### Depended By

| Unit | Reason |
|------|--------|
| 003-platform-and-endpoints | Every endpoint reads through auth + serializer |

### External Dependencies

| System | Purpose | Risk |
|--------|---------|------|
| argon2 | Password hashing | Low (pinned) |
| otpauth | TOTP helper (unused for SMS-OTP) | Low |
| Node `crypto` | HMAC-SHA256 for session cookie | None (built-in) |

## Technical Context

### Suggested Technology

- argon2id with OWASP 2024 parameters
  (`memoryCost 19 MiB`, `timeCost 2`, `parallelism 1`).
- 6-digit SMS-OTP with 5-minute TTL, 5 attempts.
- HTTP-only signed cookie, 14-day TTL, HMAC-SHA256
  with `SESSION_SECRET` env var.

### Integration Points

| Integration | Type | Protocol |
|-------------|------|----------|
| `lib/auth/*` ↔ `lib/db-switch.ts` | DB | facade |
| `lib/auth/guards.ts` ↔ route handlers | guard | `Result<Session, ApiError>` |
| `lib/serializers/ticket.ts` ↔ route handlers | serializer | typed object |

### Data Storage

| Data | Type | Volume | Retention |
|------|------|--------|-----------|
| `User` | SQL | medium | permanent (subject to citizen-initiated delete) |
| `OtpCode` | SQL | high churn | expiresAt, attempts ≤ 5 |
| `Session` | SQL | high churn | 14-day TTL |

## Constraints

- v1 ships the WebAuthn schema + challenge table; the
  four `/api/auth/webauthn/*` route handlers are
  deferred to WO-005.
- `requireRole` returns `Result<Session, ApiError>` —
  it **never throws across the service boundary**
  (`team.md` Mandated).
- The citizen serializer hides `assignedCrewId`,
  `internalNote`, raw actor names; maps actor → "City
  corporation" / "সিটি কর্পোরেশন".

## Success Criteria

### Functional

- [x] `hashPassword` + `verifyPassword` round-trip.
- [x] `requestOtp` issues a 6-digit code with 5-min
  TTL.
- [x] `verifyOtp` rejects after 5 attempts.
- [x] `getActiveSession` returns the session or null.
- [x] `requireRole` / `requireSameCity` /
  `requireScope` cover allow + deny paths.
- [x] `serializeTicketForRole` strips internal fields
  in citizen view; full record in dispatcher / crew.

### Non-Functional

- [x] `npx tsc --noEmit` is clean.
- [x] Line coverage on `lib/` ≥ 80%.

### Quality

- [x] 14/14 unit tests passing.

## Bolt Suggestions

This unit predates the specsmd bolt convention. A modern
equivalent would be a single `ddd-construction-bolt`
because the four roles + serializer are tightly coupled
to the auth path.

## Notes

The session cookie is the **only** auth channel for v1
(v1.1 adds CSRF token for non-idempotent operations).
