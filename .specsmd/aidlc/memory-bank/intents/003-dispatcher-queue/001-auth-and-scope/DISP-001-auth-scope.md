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
dept_waste)`
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

### Acceptance 6 — No-department ticket is in scope

**Given** a dispatcher session bound to
`(city_dhaka_north, ward_14, dept_streetlight)`
**When** the dispatcher issues a request for a
ticket in `ward_14` whose **category has no
department** (e.g. "Other")
**Then** the API returns the ticket (200).

A category with no department produces a ticket
that is *not* department-scoped, so it is visible
to every dispatcher in the ward. The request is
refused only when **both** the ticket and the
session are department-scoped and the two
departments differ.

### Acceptance 7 — A real cross-department ticket is still refused

**Given** a dispatcher session bound to
`(city_dhaka_north, ward_14, dept_streetlight)`
**When** the dispatcher issues a request for a
ticket in `ward_14` whose category maps to a real
department other than `dept_streetlight`
(e.g. "Garbage" → `dept_waste`)
**Then** the API returns `403` with
`{ error: 'cross_department_access_denied' }`.

Acceptance 6 must not weaken this case.

### Acceptance 8 — The ward check still fires first

**Given** a dispatcher session bound to
`(city_dhaka_north, ward_14, dept_streetlight)`
**When** the dispatcher issues a request for a
ticket in `ward_15` whose category has no
department
**Then** the API returns `403` with
`{ error: 'cross_ward_access_denied' }`.

The no-department exemption never widens the ward
boundary.

## Technical Notes

- The dispatcher dev persona is `Habib` —
  `DEV_DISPATCHER_ID` in `lib/dev-store.ts`.
- `requireRole` + `requireScope` are in
  `lib/auth/guards.ts`.
- The `ApiError` class in the same file is
  caught at the route boundary and translated
  to a JSON response by the standard error
  envelope (see `api-conventions.md`).
- **The scope rule.** A ticket's department comes
  from its **category** (`Category.departmentId`),
  never from the ticket row. A category with no
  department yields `departmentId: null`, which
  means *not department-scoped*. The department
  check denies only when both sides are
  department-scoped and they differ; the ward
  check is unconditional and always fires first.
- Six list filters already applied this rule and
  the guard did not: the dispatcher queue
  (`app/api/v1/dispatcher/queue/route.ts`), the
  crew list (`app/api/v1/crew/tickets/route.ts`),
  the dispatcher map
  (`app/api/v1/dispatcher/map/tickets/route.ts`),
  `lib/dispatcher/assign-crew.ts`,
  `lib/dispatcher/list-crew-for-ward.ts`, and the
  dedup-flag list
  (`app/api/v1/dispatcher/dedup-flags/route.ts`).
  The guard and the dedup-flag list were the two
  strict-equality outliers, which is why the
  queue showed a ticket the detail endpoint
  refused.
- The rule is symmetric for the SESSION side
  too: an admin-provisioned dispatcher carries
  `departmentId: null` by design (the product
  model is *"dispatcher: ≥ 1 ward, no crew, no
  department"*), so such a session is not
  department-scoped either and is not restricted by
  the department dimension at all.

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
- `tests/unit/crew-scope.test.ts` — the mirrored
  crew scope suite.
- `tests/unit/dedup-flag-scope.test.ts` — the
  dedup-flag list filter suite.
- `tests/09-dispatcher-auth.spec.ts` — the
  end-to-end Playwright route spec.
