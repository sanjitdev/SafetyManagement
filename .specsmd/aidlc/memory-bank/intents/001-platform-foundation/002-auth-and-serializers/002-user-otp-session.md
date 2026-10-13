---
id: 002-user-otp-session
unit: 002-auth-and-serializers
intent: 001-platform-foundation
status: done
priority: must
created: 2026-10-04T00:00:00Z
updated: 2026-10-04T00:00:00Z
assigned_bolt: null
implemented: true
---

# Story: 002-user-otp-session

## User Story

**As a** citizen
**I want** to sign up and sign in with phone + NID +
name + password + SMS-OTP
**So that** I can submit and follow up on reports
without a third-party identity provider.

**As a** platform engineer
**I want** sessions to be HTTP-only, signed, and
short-lived enough to bound the blast radius
**So that** a stolen cookie cannot be replayed across
cities or after a password reset.

## Acceptance Criteria

- [x] **Given** the User model, **When** I review the
  schema, **Then** `User.role ∈ {citizen, dispatcher,
  crew, admin}` is the only role enum.
- [x] **Given** an OTP code, **When** it's stored in
  `OtpCode.codeHash`, **Then** it is argon2id-hashed
  (never plaintext).
- [x] **Given** an OTP request, **When** the user has
  attempted 5 times, **Then** `verifyOtp` rejects with
  `ApiError({ error: 'rate_limited' })`.
- [x] **Given** an OTP code, **When** it has been
  more than 5 minutes since issuance, **Then**
  `verifyOtp` rejects with `ApiError({ error:
  'otp_expired' })`.
- [x] **Given** a successful `verifyOtp`, **When** the
  session is set, **Then** the cookie is HTTP-only,
  HMAC-SHA256-signed, and 14-day TTL.
- [x] **Given** the password hash, **When** I review
  the parameters, **Then** argon2id with OWASP 2024
  parameters (`memoryCost 19 MiB`, `timeCost 2`,
  `parallelism 1`).
- [x] **Given** a citizen role at request time,
  **When** `getActiveSession()` is called, **Then** it
  returns the session or null (never throws).

## Technical Notes

- Real OTP SMS provider is stubbed in v1; the provider
  is chosen in WO-004.
- `User.phone` is unique per `cityId`, not globally
  (different cities can have the same phone).
- `User[cityId, email]` is also unique.

## Dependencies

### Requires
- 001-city-config-models (the User table)
- 010-backend-facade (the `db.user.*` shape)

### Enables
- 003-per-role-guards (every guard reads the session)
- 004-citizen-serializer (the serializer reads the
  session to know the role)
- 011-first-five-endpoints (`/api/auth/otp/request`
  and `/api/auth/otp/verify` use this)
- Every authenticated route in WO-001+

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| 6th OTP attempt | Rejected with `rate_limited` |
| OTP issued > 5 min ago | Rejected with `otp_expired` |
| Wrong password 5x in a row | Same `rate_limited` policy |
| Session cookie tampered | Signature mismatch → `null` |
| Session cookie from city A used on city B | `requireSameCity` rejects |
| User deleted but cookie still valid | `getActiveSession()` returns null |

## Out of Scope

- WebAuthn for admins (deferred to WO-005).
- Real OTP SMS provider (deferred to WO-004).
- CSRF token (deferred to v1.1).

## Status

Done. Shipped in WO-000 (2026-10-04). 5/5 unit tests
passing for password + OTP + session.