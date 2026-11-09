---
story: DISP-001-auth-scope
unit: 001-auth-and-scope
intent: 003-dispatcher-queue
phase: inception
status: done
created: 2026-10-11T23:55:00Z
updated: 2026-11-09T00:00:00Z
---

# Story: DISP-001 — Auth and Scope

## Given / When / Then

### Acceptance 1 — Cross-ward denial

**Given** a dispatcher session bound to
`(city_dhaka_north, ward_14, dept_streetlight)`
**When** the dispatcher issues a request that
scopes to `(city_dhaka_north, ward_15, ...)`
**Then** the API returns `403` with
`{ error: 'cross_ward_access_denied' }` and no
data is returned.

### Acceptance 2 — Cross-department denial

**Given** a dispatcher session bound to
`(city_dhaka_north, ward_14, dept_streetlight)`
**When** the dispatcher issues a request that
scopes to `(city_dhaka_north, ward_14,
dept_water)`
**Then** the API returns `403` with
`{ error: 'cross_department_access_denied' }`.

### Acceptance 3 — In-scope read

**Given** a dispatcher session bound to
`(city_dhaka_north, ward_14, dept_streetlight)`
**When** the dispatcher reads a ticket in
ward_14 / dept_streetlight
**Then** the API returns the ticket (full
record, including `internalNote`).

### Acceptance 4 — Cross-role denial

**Given** a citizen session
**When** the citizen issues a request to a
dispatcher-scoped endpoint
**Then** the API returns `403` with
`{ error: 'forbidden_role' }`.

### Acceptance 5 — Anonymous denial

**Given** no session
**When** any dispatcher-scoped endpoint is hit
**Then** the API returns `401` with
`{ error: 'not_authenticated' }`.

## Technical Notes

- The dispatcher dev persona is `Habib` —
  `DEV_DISPATCHER_ID` in `lib/dev-store.ts`.
- `requireRole` + `requireScope` are in
  `lib/auth/guards.ts`.
- The `ApiError` class in the same file is
  caught at the route boundary and translated
  to a JSON response by the standard error
  envelope (see `api-conventions.md`).

## Out of Scope

- The real auth flow (phone + NID + OTP +
  WebAuthn). The dispatcher uses the shared
  auth funnel (Intent 002).
- The dispatcher-scope binding at account
  creation time. That is an Intent 005
  (Admin City Setup) deliverable.

## Dependencies

- Intent 001 (Unit 002) — `requireRole` /
  `requireScope` guards.
- Intent 001 (Unit 001) — `User` / `Session`
  models.
- Intent 002 (Unit 001) — shared auth funnel.

## Cross-references

- `lib/auth/guards.ts` — the guards.
- `lib/auth/session.ts` — `SessionContext`.
- `lib/dev-session.ts` — `devMintSession`.
- `tests/unit/dispatcher-scope.test.ts` —
  the unit test (Bolt 003-001 deliverable).
- `tests/09-dispatcher-auth.spec.ts` — the
  end-to-end Playwright route spec.
