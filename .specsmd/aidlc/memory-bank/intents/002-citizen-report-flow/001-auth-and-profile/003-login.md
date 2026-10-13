---
id: 003-login
unit: 001-auth-and-profile
intent: 002-citizen-report-flow
status: in-progress
priority: must
created: 2026-10-04T00:00:00Z
updated: 2026-10-11T18:00:00Z
assigned_bolt: null
implemented: true
---

# Story: 003-login

## User Story

**As a** returning citizen
**I want** to sign in with phone + password
**So that** I can resume where I left off and see my
reports and the city activity feed.

## Acceptance Criteria

- [x] **Given** the login page (1.5), **When** I submit
  valid inputs, **Then** a session cookie is set and I
  am redirected to `/home`.
- [x] **Given** a wrong password, **When** I submit,
  **Then** I see a translated error.
- [x] **Given** 5 wrong attempts, **When** I submit
  the 6th, **Then** the rate limit rejects.
- [x] **Given** every input, **When** I submit, **Then**
  Zod validation rejects invalid inputs.

## Technical Notes

- Phone + password is the v1 citizen login path.
- v1.1: optional SMS-OTP second factor.

## Dependencies

### Requires
- Intent 001 (auth + session)
- 001-splash-welcome (welcome → Sign in)
- 002-registration-otp (so the user exists)

### Enables
- Every authenticated route in WO-001+

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Phone not registered | `ApiError({ error: 'not_found' })` |
| Wrong password | `ApiError({ error: 'invalid_credentials' })` |
| Account in a different city | Session is bound to the user's city; cross-city ops are denied later |
| Session cookie already valid | `Set-Cookie` reissues (rotate sessionId) |

## Out of Scope

- SMS-OTP second factor (deferred to v1.1).
- "Forgot password" flow (deferred to v1.1).

## Status

Working code on the happy path. The 1.5 login page
renders. Visual baseline committed.