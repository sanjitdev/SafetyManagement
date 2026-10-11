---
story: ADM-003-categories
unit: 002-city-config
intent: 005-admin-city-setup
phase: construction
status: done
created: 2026-10-12T05:30:00Z
updated: 2026-10-12T18:15:00Z
---

# Story: ADM-003 — Category Management

> WO-004 §4.4 (Departments & Categories
> — categories half). CRUD over
> `Category`: name, bound to a
> `Department`, narrow-category flag
> (UX Review #6 photo cap), and
> optional narrow-category photo cap.

## Given / When / Then

### Acceptance 1 — Create category

**Given** an admin on
`/admin/cities/[id]/taxonomy`
**When** the admin clicks "New
category", enters
`{ name: 'Pothole', departmentId:
'dept_roads', isNarrow: false }`,
and saves
**Then** the category is persisted and
an `AuditEntry` is written with
`entityType: 'Category', action:
'create'`.

### Acceptance 2 — Narrow-category cap

**Given** a category with
`isNarrow: true`
**When** the admin edits the category
and sets `narrowCategoryPhotoCap: 2`
**Then** the cap is persisted and the
citizen's submit-report flow enforces
the cap (already wired in Intent 002
Unit 003 via
`lib/report-photo-cap.ts`).

### Acceptance 3 — Edit category

**Given** an existing category
**When** the admin changes the name
or the department binding
**Then** the new values are persisted
and an `AuditEntry` is written with
the before / after values.

### Acceptance 4 — Delete category

**Given** an existing category
**When** the admin deletes the
category
**Then** the row is hard-deleted and
an `AuditEntry` is written with
`action: 'delete'`. If tickets ARE
bound to the category, the delete is
rejected with 409
`category_has_tickets`.

### Acceptance 5 — Cross-city denial (read)

**Given** an admin in
`city_dhaka_north`
**When** the admin reads
`/api/v1/admin/cities/city_chittagong/categories`
**Then** the response is 200 (admins
bypass the cross-city deny path on
read; they can configure any city).
The write path is the same.

## Technical Notes

- A category is bound to exactly one
  `Department`. The category-to-
  department mapping is global within
  a city (per WO-004 acceptance
  criteria for §4.4); per-ward routing
  rules are v1.1.
- `isNarrow` (default `false`) is the
  flag that gates the photo cap. When
  `isNarrow: true`, the
  `narrowCategoryPhotoCap` (default
  `2`) is the cap; when `false`, the
  cap is the global default of 3
  (UX Review #6 decision).
- The category list on the page is
  sorted by `name ASC` for stable
  ordering.
- The dev store's `seed()` includes
  the Dhaka-North template's
  categories (`streetlight`,
  `pothole`, `water_leak`,
  `garbage`, `drainage`,
  `footpath`, `signage`,
  `other`); the unit's dev seed is
  additive.

## Cross-references

- `app/api/v1/admin/cities/[id]/categories/route.ts` —
  new API.
- `app/api/v1/admin/cities/[id]/categories/[catId]/route.ts` —
  new API (edit / delete).
- `app/admin/cities/[id]/taxonomy/page.tsx` —
  new page (taxonomy covers both
  departments and categories).
- `lib/admin/dhaka-template.ts` —
  `DHAKA_TEMPLATE.categories` (the
  pre-population snapshot).
- `tests/unit/dhaka-template.test.ts` —
  Vitest unit test.
- `tests/17-admin-cities-light.spec.ts` —
  Playwright spec (category CRUD +
  visual baseline at 1440x900).
- `lib/report-photo-cap.ts` —
  consumer of `narrowCategoryPhotoCap`
  (inherited from Intent 002).
