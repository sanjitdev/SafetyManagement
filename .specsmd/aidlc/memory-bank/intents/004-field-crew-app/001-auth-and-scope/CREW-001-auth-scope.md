---
story: CREW-001-auth-scope
unit: 001-auth-and-scope
intent: 004-field-crew-app
phase: construction
status: done
created: 2026-10-12T01:30:00Z
updated: 2026-10-12T01:45:00Z
---

# Story: CREW-001 — Auth and Scope (crew)

## Given / When / Then

### Acceptance 1 — Cross-ward denial

**Given** a crew session bound to
`(city_dhaka_north, ward_14, dept_streetlight)`
**When** the crew member issues a request that
scopes to `(city_dhaka_north, ward_15, ...)`
**Then** the API returns `403` with
`{ error: 'cross_ward_access_denied' }` and no
data is returned.

### Acceptance 2 — Cross-department denial

**Given** a crew session bound to
`(city_dhaka_north, ward_14, dept_streetlight)`
**When** the crew member issues a request that
scopes to `(city_dhaka_north, ward_14,
dept_water)`
**Then** the API returns `403` with
`{ error: 'cross_department_access_denied' }`.

### Acceptance 3 — In-scope read

**Given** a crew session bound to
`(city_dhaka_north, ward_14, dept_streetlight)`
**When** the crew member reads a ticket in
ward_14 / dept_streetlight
**Then** the API returns the ticket (full
record, including `internalNote` and real
`actorId` on the trail).

### Acceptance 4 — Cross-role denial (crew ↔ dispatcher)

**Given** a crew session
**When** the crew member issues a request to
a dispatcher-scoped endpoint
**Then** the API returns `403` with
`{ error: 'forbidden_role' }`.

And the inverse: **Given** a dispatcher
session **When** the dispatcher issues a
request to a crew-scoped endpoint **Then**
the API returns `403` with
`{ error: 'forbidden_role' }`. (The roles
are non-overlapping.)

### Acceptance 5 — Anonymous denial

**Given** no session
**When** any crew-scoped endpoint is hit
**Then** the API returns `401` with
`{ error: 'not_authenticated' }`.

### Acceptance 6 — Out-of-scope ticket id → 404 (not 403)

**Given** a crew session
**When** the crew member issues a request
for a ticket id outside their scope
**Then** the API returns `404` with
`{ error: 'not_found' }` (NOT 403) so the
crew member cannot probe ticket existence
outside their scope. (This acceptance
mirrors the dispatcher's contract from
Intent 003 and is repeated here so a future
refactor that diverges the two roles
surfaces a failing test.)

## Technical Notes

- The crew dev persona is `Rashid` —
  `DEV_CREW_ID` in `lib/dev-store.ts`.
- `requireRole` + `requireScope` are in
  `lib/auth/guards.ts`.
- The `ApiError` class in the same file is
  caught at the route boundary and translated
  to a JSON response by the standard error
  envelope (see `api-conventions.md`).
- The cross-scope → 404 pattern (Acceptance
  6) is implemented by wrapping
  `requireSameCity` + `requireScope` in a
  try/catch and returning `null` from a
  per-route `loadInScope()` helper. The
  route handler then returns 404 for both
  "missing" and "out-of-scope" cases.

## Out of Scope

- The real auth flow (phone + NID + OTP).
  The crew signs in via the shared auth
  funnel (Intent 002).
- The crew-scope binding at account
  creation time. That is an Intent 005
  (Admin City Setup) deliverable.
- The "today's assignments" page (Unit
  002) — the auth contract is enforced on
  every new endpoint, but the list page
  itself is Unit 002.

## Dependencies

- Intent 001 (Unit 002) — `requireRole` /
  `requireScope` guards.
- Intent 001 (Unit 001) — `User` / `Session`
  models.
- Intent 002 (Unit 001) — shared auth
  funnel.
- Intent 003 (Unit 001) — the dispatcher's
  auth-scope bolt is the pattern this
  story mirrors.

## Cross-references

- `lib/auth/guards.ts` — the guards.
- `lib/auth/session.ts` — `SessionContext`.
- `lib/dev-session.ts` — `devMintSession`.
- `tests/unit/crew-scope.test.ts` —
  the unit test (Bolt 004-001 deliverable).
- `tests/13-crew-auth.spec.ts` — the
  end-to-end Playwright route spec.
