---
story: ADM-004-departments
unit: 002-city-config
intent: 005-admin-city-setup
phase: construction
status: done
created: 2026-10-12T05:30:00Z
updated: 2026-10-12T18:15:00Z
---

# Story: ADM-004 — Department Management

> WO-004 §4.4 (Departments & Categories
> — departments half). CRUD over
> `Department`: name, contact info.
> Deleting a department that still
> has categories bound to it is
> rejected with 409 + an orphan
> warning on the page.

## Given / When / Then

### Acceptance 1 — Create department

**Given** an admin on
`/admin/cities/[id]/taxonomy`
**When** the admin clicks "New
department", enters
`{ name: 'Roads', contactInfo:
'roads@cityfix.bd' }`, and saves
**Then** the department is persisted
and an `AuditEntry` is written with
`entityType: 'Department', action:
'create'`.

### Acceptance 2 — Edit department

**Given** an existing department
**When** the admin changes the name
or contact info
**Then** the new values are persisted
and an `AuditEntry` is written with
the before / after values.

### Acceptance 3 — Delete (with categories)

**Given** a department with 3
categories still bound to it
**When** the admin attempts to delete
the department
**Then** the API returns 409
`department_has_categories` and the
page shows the orphan warning: "This
department has 3 categories. Move
them to another department before
deleting." The list of the 3
categories is shown so the admin can
act on them.

### Acceptance 4 — Delete (no categories)

**Given** a department with no
categories bound
**When** the admin deletes the
department
**Then** the row is hard-deleted and
an `AuditEntry` is written with
`action: 'delete'`.

### Acceptance 5 — Cross-city denial (read)

**Given** an admin in
`city_dhaka_north`
**When** the admin reads
`/api/v1/admin/cities/city_chittagong/departments`
**Then** the response is 200 (admins
bypass the cross-city deny path on
read).

## Technical Notes

- A department has no binding to a
  ward in v1 (per WO-004 acceptance
  criteria for §4.4 — "ward
  assignment" is mentioned in the
  WO-004 but the per-department
  ward-binding is implicit; v1
  ships the schema with
  `wardId?` and a follow-up Bolt
  may set it). The page's
  "departments" list is the global
  list within a city.
- The department list on the page
  is sorted by `name ASC` for
  stable ordering; the category
  list is filtered to the
  selected department when the
  admin clicks a department row
  (the "filter by department"
  pattern).
- The dev store's `seed()` includes
  the Dhaka-North template's
  departments (`streetlight`,
  `roads`, `water`, `sanitation`,
  `drainage`, `parks`,
  `signage`, `other`); the unit's
  dev seed is additive.

## Cross-references

- `app/api/v1/admin/cities/[id]/departments/route.ts` —
  new API.
- `app/api/v1/admin/cities/[id]/departments/[deptId]/route.ts` —
  new API (edit / delete).
- `app/admin/cities/[id]/taxonomy/page.tsx` —
  new page.
- `lib/admin/dhaka-template.ts` —
  `DHAKA_TEMPLATE.departments`.
- `tests/unit/dhaka-template.test.ts` —
  Vitest unit test.
- `tests/17-admin-cities-light.spec.ts` —
  Playwright spec (department CRUD
  + visual baseline at 1440x900).
