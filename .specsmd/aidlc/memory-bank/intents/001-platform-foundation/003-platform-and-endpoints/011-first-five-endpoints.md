---
id: 011-first-five-endpoints
unit: 003-platform-and-endpoints
intent: 001-platform-foundation
status: done
priority: must
created: 2026-10-04T00:00:00Z
updated: 2026-10-04T00:00:00Z
assigned_bolt: null
implemented: true
---

# Story: 011-first-five-endpoints

## User Story

**As a** citizen
**I want** a public REST surface (create report, list
my reports, read a single report, request OTP,
verify OTP) and a city activity feed
**So that** the WO-001+ surfaces have a stable
contract to build on.

**As a** platform engineer
**I want** every route handler to validate inputs with
Zod and route through the service layer
**So that** type safety holds at every external
boundary.

## Acceptance Criteria

- [x] **Given** `POST /api/tickets`, **When** a
  citizen submits a valid report, **Then** the response
  is 201 `{ ticket: {...} }` or 200 `{ dedup_match:
  true, ... }`.
- [x] **Given** `GET /api/tickets`, **When** a citizen
  requests their own reports, **Then** the response is
  200 `{ tickets: [...] }`.
- [x] **Given** `GET /api/tickets/:id`, **When** a
  citizen reads a single report, **Then** the response
  is 200 `{ ticket }` (or 404 if not found / 403 if
  cross-city).
- [x] **Given** `POST /api/auth/otp/request`, **When**
  a citizen requests an OTP, **Then** the response is
  200 (issued) or 429 (rate-limited).
- [x] **Given** `POST /api/auth/otp/verify`, **When**
  a citizen submits a valid code, **Then** the response
  is 200 + `Set-Cookie` (session).
- [x] **Given** `GET /api/v1/activity?limit=20`, **When**
  any role reads the activity feed, **Then** the
  response is 200 `{ tickets: [...] }` (v1 hard cap).
- [x] **Given** every endpoint, **When** the request
  body is invalid, **Then** the response is 400
  `{ error: 'invalid_input', issues: [...] }`.
- [x] **Given** every endpoint, **When** the session
  is missing, **Then** the response is 401
  `{ error: 'not_authenticated' }`.

## Technical Notes

- Zod schemas at every external API boundary.
- Per-role guards at the top of every route.
- Role-aware serializer on every ticket return.
- See `standards/api-conventions.md` for the response
  shape contract.

## Dependencies

### Requires
- 001-city-config-models (the schema)
- 002-user-otp-session (the session)
- 003-per-role-guards (the guards)
- 004-citizen-serializer (the serializer)
- 005-audit-log (every state-changing endpoint)
- 006-rate-limit (auth + submit paths)
- 007-dedup-prefilter (POST /api/tickets)
- 008-status-transitions (state-changing endpoints)
- 009-push-scaffold (subscribe helper)
- 010-backend-facade (the data layer)

### Enables
- Every later WO (WO-001+) reads through these endpoints
  or the patterns they established.

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Invalid JSON body | 400 `{ error: 'invalid_json' }` |
| Zod validation failure | 400 `{ error: 'invalid_input', issues: [...] }` |
| Session cookie missing | 401 `{ error: 'not_authenticated' }` |
| Session cookie cross-city | 403 `{ error: 'cross_city_forbidden' }` |
| Rate-limited | 429 `{ error: 'rate_limited' }` |
| Invalid status transition | 409 `{ error: 'invalid_transition' }` |
| Ticket not found | 404 (not 403, to avoid leaking existence) |

## Out of Scope

- WebAuthn route handlers (deferred to WO-005).
- Real OTP SMS provider (deferred to WO-004).
- Cursor-based pagination (deferred to v1.1).
- S3 photo upload (deferred to v1.1).

## Status

Done. Shipped in WO-000 (2026-10-04). 5/5 endpoints
integration-tested via Vitest. The WO-000 walking
skeleton is complete and the persona WOs are unblocked.
