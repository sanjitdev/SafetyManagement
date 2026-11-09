---
unit: 001-auth-and-scope
intent: 004-field-crew-app
phase: construction
status: complete
created: 2026-10-12T01:30:00Z
updated: 2026-10-12T01:30:00Z
---

# Unit Brief: Auth and Scope (crew)

## Purpose

Confirm that the crew's auth + scope model is
fully wired before any new crew endpoint
ships. The platform layer (Intent 001) already
implements:

- `User.role` enum (`citizen / dispatcher / crew /
  admin`).
- `Session.wardId?` + `Session.departmentId?`
  bound at login time.
- `requireRole(session, ...allowed)` and
  `requireScope(session, wardId, departmentId)`
  guards in `lib/auth/guards.ts` — the same
  guards the dispatcher uses; the cross-scope
  denial is shared.
- A crew dev persona (`Rashid, ward_14
  streetlight`) in the dev store, accessible
  via `POST /api/dev/login?role=crew`.

This unit's job is paperwork + an end-to-end
test that exercises the cross-scope denial code
path in the dev store. No new source code is
expected: the guards are already in place. The
bolt is small on purpose — it exists so the
construction loop has a "smoke" first bolt
that exercises the new persona without taking
on the full Unit 002 surface.

## Scope

### In Scope

- A unit test that mints a crew session and
  asserts `requireScope` rejects a
  cross-ward / cross-department read.
- A Playwright route spec that drives the
  `POST /api/dev/login?role=crew` flow
  end-to-end and asserts the session cookie
  resolves to a crew-scoped session.
- A per-route role guard on every new
  crew endpoint shipped by this intent (the
  implementation is in Unit 002 / 003; the
  contract that every new endpoint MUST
  enforce `requireRole(session, 'crew')` is
  documented here).

### Out of Scope

- The real auth flow (phone + NID + OTP).
  The crew signs in via the same auth funnel
  the citizen and dispatcher use. WebAuthn is
  NOT required for crew (per the project
  spec).
- `requireScope` itself — already implemented.
- The crew-specific serializer — the existing
  `serializeTicketForRole` in
  `lib/serializers/ticket.ts` already exposes
  the full record (including `internalNote`)
  for non-citizen roles, and the crew is
  non-citizen.
- The crew's "today's assignments" page
  (Unit 002).
- The dev login redirect map update — that
  ships in Bolt 004-002 when `/crew` exists.

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| CREW-REQ-001 | Auth + scope (crew session is bound to cityId, wardId?, departmentId?) | Must |

## Domain Concepts

### Key Entities

| Entity | Description | Attributes |
|--------|-------------|------------|
| `User` | (inherited) | `id`, `role` (crew), `cityId`, `wardId`, `departmentId?` |
| `Session` | (inherited) | `userId`, `cityId`, `wardId?`, `departmentId?`, `expiresAt` |
| `AuditEntry` | (inherited) | `entityType`, `entityId`, `action`, `actorId`, `beforeValue`, `afterValue`, `timestamp` |

### Key Operations

| Operation | Description | Inputs | Outputs |
|-----------|-------------|--------|---------|
| `requireRole(session, 'crew')` | Throws if session role is not crew | session | SessionContext |
| `requireScope(session, wardId, deptId)` | Throws if (wardId, deptId) is outside session scope | session, wardId, deptId | void |
| `devMintSession('crew')` | Mints a crew session in dev mode | role | `{ cookieValue, expiresAt, userId }` |

## Story Summary

| Metric | Count |
|--------|-------|
| Total Stories | 1 |
| Must Have | 1 |
| Should Have | 0 |
| Could Have | 0 |

### Stories

| Story ID | Title | Priority | Status |
|----------|-------|----------|--------|
| CREW-001-auth-scope | Crew auth + scope (cross-scope denial) | Must | in-progress |

## Dependencies

### Depends On

| Unit | Reason |
|------|--------|
| Intent 001 (Unit 002) | `requireRole` / `requireScope` guards |
| Intent 001 (Unit 001) | `User` / `Session` models |
| Intent 002 (Unit 001) | Shared auth funnel (the crew signs in via the same surface) |
| Intent 003 (Unit 001) | The dispatcher's auth-scope bolt is the pattern this unit mirrors |

### Depended By

| Unit | Reason |
|------|--------|
| 002-todays-assignments | Every crew endpoint calls `requireRole(session, 'crew')` + `requireScope(...)` |
| 003-ticket-detail-and-resolve | Same |
| 004-offline-read | The cache reader is gated by the same session check |

### External Dependencies

| System | Purpose | Risk |
|--------|---------|------|
| `lib/auth/guards.ts` | Role + scope guards | None (already in place) |
| `lib/auth/session.ts` | SessionContext type | None (already in place) |
| `lib/dev-session.ts` | `devMintSession('crew')` | None (already in place) |

## Technical Context

### Suggested Technology

- Vitest unit test in `tests/unit/crew-scope.test.ts`.
  The test is a thin copy of
  `tests/unit/dispatcher-scope.test.ts` with
  `role: 'crew'` in place of `role:
  'dispatcher'`. The cross-scope denial code
  path is shared between crew and dispatcher
  (see `lib/auth/guards.ts`); the test pins
  the crew-specific call sites.
- Playwright route spec in
  `tests/13-crew-auth.spec.ts` for the
  end-to-end dev login flow.

### Integration Points

| Integration | Type | Protocol |
|-------------|------|----------|
| `requireRole` / `requireScope` | in-process | function call |

### Data Storage

None new. The crew's scope lives on
`User` + `Session` (both Intent 001 models).

## Constraints

- The cross-scope denial code path MUST be
  exercised in the dev-store test (the dev
  store's crew persona is bound to
  ward_14 / dept_streetlight; a request to
  read a ticket in ward_15 / dept_water must
  return 403).
- The `requireScope` guard is in place; no
  new code is expected for this unit.
- Every new crew endpoint in Units 002 +
  003 MUST call `requireRole(session,
  'crew')` BEFORE any DB read. The order
  is enforced by linting in v1.1 (the
  `lint-rules.md` candidate); for now the
  convention is documented here.

## Success Criteria

### Functional

- [ ] `requireScope(crew_session, 'ward_15',
      'dept_streetlight')` throws
      `ApiError(403, 'cross_ward_access_denied')`.
- [ ] `requireScope(crew_session, 'ward_14',
      'dept_water')` throws
      `ApiError(403,
      'cross_department_access_denied')`.
- [ ] `requireScope(crew_session, 'ward_14',
      'dept_streetlight')` returns silently.
- [ ] `requireRole(crew_session, 'dispatcher')`
      throws `ApiError(403, 'forbidden_role')`.
- [ ] `requireRole(dispatcher_session, 'crew')`
      throws `ApiError(403, 'forbidden_role')`.

### Non-Functional

- [ ] `npx tsc --noEmit` is clean.
- [ ] `npm run test:unit` is green.
- [ ] No new visual baseline (paperwork + tests).

### Quality

- [ ] Unit tests committed.
- [ ] Playwright route spec committed.

## Bolt Suggestions

A single `ddd-construction-bolt` for this unit
because the work is paperwork + a small test
suite.

## Notes

The crew's `(cityId, wardId, departmentId)`
binding is the same shape the dispatcher
session uses (the dispatcher binds to
`(cityId, wardId, departmentId)`; the crew
binds to the same triple). The cross-scope
denial is a single guard, not a per-route
check; the v1 design records this in
`lib/auth/guards.ts → requireScope` docstring.

The CREW-001 story is a behavioural twin of
DISP-001 (Intent 003, Unit 001) with `role =
'crew'` substituted. The test surface is
nearly identical; the only new ground covered
is the cross-role denial (crew ↔ dispatcher).
