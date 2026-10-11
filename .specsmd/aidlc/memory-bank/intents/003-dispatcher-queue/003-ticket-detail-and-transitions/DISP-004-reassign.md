---
story: DISP-004-reassign
unit: 003-ticket-detail-and-transitions
intent: 003-dispatcher-queue
phase: construction
status: done
created: 2026-10-11T23:55:00Z
updated: 2026-10-12T00:30:00Z
---

# Story: DISP-004 — Re-assign to ward / department

## Given / When / Then

### Acceptance 1 — Reassign ward

**Given** a dispatcher session bound to
`(city_dhaka_north, ward_14, dept_streetlight)`
viewing a ticket in `ward_14 / dept_streetlight`
**When** the dispatcher changes the ward
dropdown to `ward_15` and clicks Save
**Then** the ticket's `wardId` updates
to `ward_15`; an `AuditEntry` is written
with
`action: 'reassign'`,
`beforeValue: { wardId: 'ward_14' }`,
`afterValue: { wardId: 'ward_15' }`; the
detail page re-renders with the new
ward displayed.

### Acceptance 2 — Reassign department

**Given** a ticket in
`ward_14 / dept_streetlight`
**When** the dispatcher changes the
department (category) dropdown to a
category whose `departmentId` is
`dept_water` and saves
**Then** the ticket's `categoryId`
updates; an `AuditEntry` is written
with
`action: 'reassign'`,
`beforeValue: { categoryId: <old> }`,
`afterValue: { categoryId: <new> }`. The
ward and department dropdowns on the
page re-render with the new selection.

### Acceptance 3 — Cross-city reassign denied

**Given** a dispatcher session bound to
`city_dhaka_north`
**When** the dispatcher tries to
reassign to a ward whose `cityId` is
`city_chittagong`
**Then** the API returns 403
(`cross_city_access_denied`); the UI
shows a toast or inline error. The
ward dropdown is filtered to the
dispatcher's `cityId` only.

### Acceptance 4 — Same-ward / same-category no-op

**Given** a ticket in
`ward_14 / dept_streetlight`
**When** the dispatcher clicks Save
without changing either dropdown
**Then** the API returns 200 with no
changes; no `AuditEntry` is written (no
state change).

### Acceptance 5 — Audit trail visibility

**Given** any reassignment has occurred
on a ticket
**When** the dispatcher views the
detail page
**Then** the page renders the
`audit.reassign` entries (under the
trail or in a separate "Reassignment
history" section) showing the old and
new values with timestamps and the
`actorId` of the dispatcher who did the
reassignment.

## Technical Notes

- The reassign endpoint is
  `PATCH /api/v1/dispatcher/tickets/[id]`
  with body
  `{ wardId?, categoryId?, internalNote? }`.
  All three are optional; only those
  present are applied.
- The dropdowns are populated from
  `db.ward.findMany({ where: { cityId } })`
  and
  `db.category.findMany({ where: { cityId, departmentId? } })`.
  Ward list is filtered to the
  dispatcher's `cityId` only.
- Cross-ward reassignment
  (`ward_14` → `ward_15`) is allowed for
  dispatchers assigned to a department
  that spans multiple wards (the
  dispatcher persona in the dev store
  is bound to `ward_14 / dept_streetlight`
  — cross-ward reassign would move the
  ticket OUT of the dispatcher's
  scope, so it is allowed at the API
  level but the dispatcher would no
  longer see the ticket in their queue).
- Every reassignment writes an
  `AuditEntry` via
  `writeAudit(...)` from
  `lib/platform/audit.ts` (per
  team.md Mandated).
- The page is a client component
  (dropdowns + save button + state).
- The same-ward / same-category case is
  the no-op; the API checks for actual
  diff before writing audit.

## Out of Scope

- Ticket detail rendering itself
  (DISP-003).
- Internal notes field (DISP-005).
- Reassignment to a different city
  (always denied in v1).
- Reassignment reason / note field
  (deferred to v1.1 if needed; the
  audit trail captures
  `actorId` + timestamp).

## Dependencies

- Intent 001 (Unit 001) — `User` /
  `Ticket` models.
- Intent 001 (Unit 002) — `requireRole` /
  `requireScope` guards.
- Intent 003 (Unit 001) — same guards.
- DISP-003 — the page this reassign UI
  lives on.

## Cross-references

- `app/api/v1/dispatcher/tickets/[id]/route.ts` —
  new API (PATCH).
- `app/dispatcher/tickets/[id]/page.tsx` —
  new page (reassign UI section).
- `lib/platform/audit.ts` —
  `writeAudit(...)` (inherited).
- `tests/unit/reassign.test.ts` —
  unit test for the reassign handler.
- `tests/11-dispatcher-detail-light.spec.ts` —
  Playwright route spec covers reassign
  acceptance.
