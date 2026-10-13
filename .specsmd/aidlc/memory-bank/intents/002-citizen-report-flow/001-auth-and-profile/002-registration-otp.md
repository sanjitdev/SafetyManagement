---
id: 002-registration-otp
unit: 001-auth-and-profile
intent: 002-citizen-report-flow
status: in-progress
priority: must
created: 2026-10-04T00:00:00Z
updated: 2026-10-11T18:00:00Z
assigned_bolt: null
implemented: true
---

# Story: 002-registration-otp

## User Story

**As a** new citizen
**I want** to register with phone + NID + name +
password and then verify my phone with a 6-digit OTP
**So that** I can start submitting reports with a
trusted session.

## Acceptance Criteria

- [x] **Given** the register page (1.3), **When** I
  submit valid inputs, **Then** a `POST /api/auth/register`
  creates the user and issues an OTP.
- [x] **Given** the verify-OTP page (1.4), **When** I
  enter the 6-digit code, **Then** `POST /api/auth/otp/verify`
  issues a session cookie and redirects to `/home`.
- [x] **Given** a wrong code, **When** I submit, **Then**
  I see a translated error and stay on the page.
- [x] **Given** 5 wrong attempts, **When** I submit the
  6th, **Then** the endpoint returns
  `ApiError({ error: 'rate_limited' })` and the page
  shows the translated "too many attempts" copy.
- [x] **Given** an expired OTP (>5 min), **When** I
  submit, **Then** the endpoint returns
  `ApiError({ error: 'otp_expired' })`.
- [x] **Given** every input, **When** I submit, **Then**
  Zod validation rejects invalid inputs with translated
  error keys.

## Technical Notes

- v1: SMS-OTP is stubbed (provider chosen in WO-004).
- Password: argon2id, OWASP 2024 params.
- NID is a national ID number; v1 stores it as a
  string. Validation: 13-17 digits.

## Dependencies

### Requires
- Intent 001 (auth + session + OTP)
- 001-splash-welcome (welcome → Register)

### Enables
- 003-login (returning user flow)
- Every authenticated route in WO-001+

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Phone already registered | Endpoint returns `ApiError({ error: 'phone_already_registered' })` |
| NID format invalid | Zod rejects with `invalid_input` |
| Password < 8 chars | Zod rejects |
| OTP resent before 5 min | Provider's debounce |
| User already verified | Endpoint returns success (idempotent) |
| Session cookie issued but user cancels | Cookie expires in 14d (user can sign out) |

## Out of Scope

- Real OTP SMS provider (deferred to WO-004).
- Email verification (v1 doesn't collect email).
- Social login (deferred to v1.1).

## Status

Working code on the happy path. The 1.3 register and
1.4 verify-OTP pages render. Visual baselines committed.