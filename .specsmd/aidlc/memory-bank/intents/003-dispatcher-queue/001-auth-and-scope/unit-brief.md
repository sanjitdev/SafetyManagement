---
unit: 001-auth-and-scope
intent: 003-dispatcher-queue
phase: inception
status: ready
created: 2026-10-11T23:55:00Z
updated: 2026-10-11T23:55:00Z
---

# Unit Brief: Auth and Scope

## Purpose

Confirm that the dispatcher's auth + scope model is
fully wired before any new dispatcher endpoint
ships. The platform layer (Intent 001) already
implements:

- `User.role` enum (`citizen / dispatcher / crew /
  admin`).
- `Session.wardId?` + `Session.departmentId?`
  bound at login time.
- `requireRole(session, ...allowed)` and
  `requireScope(session, wardId, departmentId)`
  guards in `lib/auth/guards.ts`.
- A dispatcher dev persona (`Habib, ward_14
  streetlight`) in the dev store, accessible via
  `POST /api/dev/login?role=dispatcher`.

This unit's job is paperwork + an end-to-end test
that exercises the cross-scope denial code path
in the dev store. No new source code is
expected: the guards are already in place.

## Scope

### In Scope

- A unit test that mints a dispatcher session
  and asserts `requireScope` rejects a
  cross-ward / cross-department read.
- A Playwright route spec that drives the
  `POST /api/dev/login?role=dispatcher` flow
  end-to-end and asserts the redirect lands on
  `/dispatcher` (a route this unit does not
  author — that's Bolt 003-002; this unit only
  confirms the dev login route accepts the
  `dispatcher` role and the session cookie
  resolves to a dispatcher-scoped session).
- The per-route role guard on every new
  dispatcher endpoint shipped by this intent.

### Out of Scope

- The real auth flow (phone + NID + OTP +
  WebAuthn). The dispatcher uses the same auth
  funnel as the citizen (Intent 002) but is
  bound to a ward / department at login time
  by the admin (Intent 005).
- `requireScope` itself — already implemented.
- The dispatcher serializer — the existing
  `serializeTicketForRole` in
  `lib/serializers/ticket.ts` already exposes
  the full record (including `internalNote`)
  for non-citizen roles.

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| DISP-REQ-001 | Auth + scope (dispatcher session is bound to cityId, wardId?, departmentId?) | Must |

## Domain Concepts

### Key Entities

| Entity | Description | Attributes |
|--------|-------------|------------|
| `User` | (inherited) | `id`, `role` (dispatcher), `cityId`, `wardId`, `departmentId?` |
| `Session` | (inherited) | `userId`, `cityId`, `wardId?`, `departmentId?`, `expiresAt` |
| `AuditEntry` | (inherited) | `entityType`, `entityId`, `action`, `actorId`, `beforeValue`, `afterValue`, `timestamp` |

### Key Operations

| Operation | Description | Inputs | Outputs |
|-----------|-------------|--------|---------|
| `requireRole(session, 'dispatcher')` | Throws if session role is not dispatcher | session | SessionContext |
| `requireScope(session, wardId, deptId)` | Throws if (wardId, deptId) is outside session scope | session, wardId, deptId | void |
| `devMintSession('dispatcher')` | Mints a dispatcher session in dev mode | role | `{ cookieValue, expiresAt, userId }` |

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
| DISP-001-auth-scope | Dispatcher auth + scope (cross-scope denial) | Must | in-progress |

## Dependencies

### Depends On

| Unit | Reason |
|------|--------|
| Intent 001 (Unit 002) | `requireRole` / `requireScope` guards |
| Intent 001 (Unit 001) | `User` / `Session` models |
| Intent 002 (Unit 001) | Shared auth funnel (the dispatcher signs in via the same surface) |

### Depended By

| Unit | Reason |
|------|--------|
| 002-triage-queue | Every triage endpoint calls `requireRole(session, 'dispatcher')` + `requireScope(...)` |
| 003-ticket-detail-and-transitions | Same |

### External Dependencies

| System | Purpose | Risk |
|--------|---------|------|
| `lib/auth/guards.ts` | Role + scope guards | None (already in place) |
| `lib/auth/session.ts` | SessionContext type | None (already in place) |
| `lib/dev-session.ts` | `devMintSession('dispatcher')` | None (already in place) |

## Technical Context

### Suggested Technology

- Vitest unit test in `tests/unit/dispatcher-scope.test.ts`.
- Playwright route spec in
  `tests/09-dispatcher-auth.spec.ts` for the
  end-to-end dev login flow.

### Integration Points

| Integration | Type | Protocol |
|-------------|------|----------|
| `requireRole` / `requireScope` | in-process | function call |

### Data Storage

None new. The dispatcher's scope lives on
`User` + `Session` (both Intent 001 models).

## Constraints

- The cross-scope denial code path MUST be
  exercised in the dev-store test (the dev
  store's dispatcher persona is bound to
  ward_14 / dept_streetlight; a request to
  read a ticket in ward_15 / dept_water must
  return 403).
- The `requireScope` guard is in place; no
  new code is expected for this unit.

## Success Criteria

### Functional

- [ ] `requireScope(dispatcher_session,
      'ward_15', 'dept_streetlight')` throws
      `ApiError(403, 'cross_ward_access_denied')`.
- [ ] `requireScope(dispatcher_session,
      'ward_14', 'dept_water')` throws
      `ApiError(403,
      'cross_department_access_denied')`.
- [ ] `requireScope(dispatcher_session,
      'ward_14', 'dept_streetlight')` returns
      silently.
- [ ] `requireRole(dispatcher_session, 'citizen')`
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

The dispatcher's `(cityId, wardId, departmentId)`
binding is the same shape the citizen session
uses (the citizen binds to `(cityId, wardId)`
with `departmentId = null`). The cross-scope
denial is a single guard, not a per-route
check; the v1 design records this in
`lib/auth/guards.ts → requireScope` docstring.
