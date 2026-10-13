---
id: 010-backend-facade
unit: 001-data-and-dev-store
intent: 001-platform-foundation
status: done
priority: must
created: 2026-10-04T00:00:00Z
updated: 2026-10-04T00:00:00Z
assigned_bolt: null
implemented: true
---

# Story: 010-backend-facade

## User Story

**As a** platform engineer
**I want** a backend-agnostic facade in `lib/db-switch.ts`
that exposes the same `db.ticket.*`, `db.user.*`, etc.
shape as the Prisma client
**So that** every later unit and Bolt can run against
either Prisma (production) or the in-memory dev store
(`CITYFIX_DEV_STORE=1`) without changing the call site.

## Acceptance Criteria

- [x] **Given** the facade, **When** a route handler
  calls `db.ticket.create({...})`, **Then** the call
  succeeds regardless of which backend is active.
- [x] **Given** `CITYFIX_DEV_STORE=1`, **When** the
  app boots, **Then** the in-memory dev store is
  active and the Dhaka-North seed runs on first
  access.
- [x] **Given** the dev store, **When** a fallback
  path is hit (e.g., a missing relation), **Then** a
  structured `console.warn` is emitted so QA sees what
  was missed (silent failures are forbidden).
- [x] **Given** `CITYFIX_DEV_STORE` is unset or `0`,
  **When** the app boots, **Then** the Prisma client
  from `lib/db.ts` is the active backend.

## Technical Notes

- The dev store's `seed()` creates the same Dhaka-North
  template `prisma/seed.ts` will once `DATABASE_URL` is
  real. The two seed paths must stay aligned.
- The facade must NOT change the shape of the call
  site; the same `{ where, data, select, include }`
  argument shapes work against both backends.

## Dependencies

### Requires
- 001-city-config-models (the schema)

### Enables
- 002-user-otp-session
- 003-per-role-guards
- 004-citizen-serializer
- 005-audit-log
- 006-rate-limit
- 007-dedup-prefilter
- 008-status-transitions
- 009-push-scaffold
- 011-first-five-endpoints
- Every unit in every later intent (the entire app
  reads through this facade)

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Switching backends mid-process | Not supported; env var is read at boot |
| Dev store missing a `findUnique` shape | Returns `null` (not throws) — log warns |
| Cross-city read in dev mode | Same `requireSameCity` denial as production |
| `CITYFIX_DEV_STORE=1` but `DATABASE_URL` is set | Dev store wins (explicit toggle) |

## Out of Scope

- The Prisma schema itself (covered by
  001-city-config-models + the model stories).
- A separate SQLite fallback (rejected per ADR-004).
- Mocking the Prisma client at the route boundary
  (rejected per ADR-004).

## Status

Done. Shipped in WO-000 (2026-10-04). The route
handlers in 011-first-five-endpoints and every
persona WO (WO-001+) read through this facade.