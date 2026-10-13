---
unit: 001-auth-and-profile
intent: 002-citizen-report-flow
phase: inception
status: ready
created: 2026-10-04T00:00:00Z
updated: 2026-10-11T18:00:00Z
---

# Unit Brief: Auth and Profile

## Purpose

Stand up the citizen's first-touch funnel: splash,
welcome, language toggle, register, verify-OTP, login.
This is the unit that gets a Rahim-archetype Dhaka
resident from "I just opened the app" to "I have a
session and I'm heading to home."

## Scope

### In Scope

- `app/splash/page.tsx` (1.1)
- `app/welcome/page.tsx` (1.2) with **Register** +
  **Sign in** + language toggle.
- `app/register/page.tsx` (1.3) with phone + NID +
  name + password.
- `app/verify-otp/page.tsx` (1.4) with 6-digit OTP
  input.
- `app/login/page.tsx` (1.5) with phone + password.
- The bilingual toggle persisted to `localStorage`.
- The `Set-Cookie` on successful auth.

### Out of Scope

- The home page (Unit 002).
- The report flow (Unit 003).
- The dispatcher / crew / admin surfaces (Intents
  003 / 004 / 005).
- WebAuthn for admins (deferred to WO-005).

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| CITIZEN-REQ-001 | Splash + welcome + language toggle (1.1-1.2) | Must |
| CITIZEN-REQ-002 | Citizen registration (1.3-1.4) | Must |
| CITIZEN-REQ-003 | Login (1.5) | Must |

## Domain Concepts

### Key Entities

| Entity | Description | Attributes |
|--------|-------------|------------|
| User | The four-role identity (inherited from Intent 001) | `id`, `cityId`, `phone`, `email?`, `role`, `passwordHash?` |
| OtpCode | SMS-OTP (inherited from Intent 001) | `id`, `userId`, `scope`, `codeHash`, `expiresAt`, `attempts` |
| Session | HTTP-only signed session (inherited) | `id`, `userId`, `expiresAt`, `cityId`, `wardId?`, `departmentId?` |

### Key Operations

| Operation | Description | Inputs | Outputs |
|-----------|-------------|--------|---------|
| `register({ phone, nid, name, password })` | Create user, issue OTP | object | `{ ok, userId?, retryAfterMs? }` |
| `verifyOtp({ phone, code, scope })` | Verify OTP, issue session | object | `{ ok, sessionId? }` + Set-Cookie |
| `login({ phone, password })` | Verify password, issue session | object | `{ ok, sessionId? }` + Set-Cookie |

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
| 001-splash-welcome | Splash + welcome + language toggle | Must | in-progress |
| 002-registration-otp | Register + verify-OTP | Must | in-progress |
| 003-login | Login (1.5) | Must | in-progress |

## Dependencies

### Depends On

| Unit | Reason |
|------|--------|
| Intent 001 (Unit 002) | Auth + session + serializer |
| Intent 002 (Unit 005) | Bilingual toggle on splash/welcome |

### Depended By

| Unit | Reason |
|------|--------|
| 002-home-and-activity | Auth-gated home |
| 003-submit-report-flow | Auth-gated report flow |
| 004-my-reports | Auth-gated my-reports |

### External Dependencies

| System | Purpose | Risk |
|--------|---------|------|
| Real OTP SMS provider | v1: stubbed; v1.1: real provider | Low (stub works) |

## Technical Context

### Suggested Technology

- React 18 + Next.js 14 App Router
  (per `standards/tech-stack.md`).
- `t(key, vars, lang)` from `lib/i18n/keys.ts`.
- Per `standards/api-conventions.md` for the auth
  endpoints.

### Integration Points

| Integration | Type | Protocol |
|-------------|------|----------|
| `app/register/page.tsx` → `/api/auth/otp/request` | HTTP | POST |
| `app/verify-otp/page.tsx` → `/api/auth/otp/verify` | HTTP | POST |
| `app/login/page.tsx` → `/api/auth/login` (or `verifyOtp` path) | HTTP | POST |

### Data Storage

| Data | Type | Volume | Retention |
|------|------|--------|-----------|
| `User` | SQL | medium | per `data-stack.md` |
| `OtpCode` | SQL | high churn | 5-min TTL |
| `Session` | SQL | high churn | 14-day TTL |

## Constraints

- v1: SMS-OTP is stubbed (provider chosen in WO-004).
- All copy via `t(...)`; hardcoded strings are
  forbidden.
- Bilingual toggle on splash + welcome; per-city
  default → `DEFAULT_LANGUAGE = 'bn'`.

## Success Criteria

### Functional

- [x] Splash + welcome render.
- [x] Register + verify-OTP + login all return
  200 + Set-Cookie on success.
- [x] Wrong password / wrong OTP is rejected.
- [x] Rate limit enforced (5 attempts).
- [x] Bilingual toggle persists.

### Non-Functional

- [x] `npx tsc --noEmit` is clean.
- [x] Visual regression baselines captured for
  splash, welcome, register, verify-otp, login.
- [x] Playwright tolerance 0.005.

### Quality

- [x] 14/14 unit tests passing on `lib/`.
- [x] Visual baselines for the 5 pages committed.

## Bolt Suggestions

A single `ddd-construction-bolt` for this unit would
take the three stories because they share the auth
funnel shape.

## Notes

The 1.4 verify-OTP page also doubles as the password
recovery OTP entry — both flows share the same
`OtpCode` model with different `scope` values
(`'register'`, `'login'`, `'reset'`).
