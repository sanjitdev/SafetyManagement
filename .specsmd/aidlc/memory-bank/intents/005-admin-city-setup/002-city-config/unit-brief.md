---
unit: 002-city-config
intent: 005-admin-city-setup
phase: construction
status: done
created: 2026-10-12T05:30:00Z
updated: 2026-10-12T18:15:00Z
---

# Unit 002 — City Config (CRUD + Dhaka Template) (Intent 005)

## Scope

The four configuration surfaces from
WO-004 §4.3 through §4.6 (cities overview,
basic info, departments & categories, wards
& boundaries) plus the "Apply Dhaka template"
pre-population flow. 4 new API surfaces
(CRUD over `City`, `Category`, `Department`,
`Ward`) + 4 new pages under `/admin/*` + a
Leaflet.draw map editor for the ward
polygon. Every change writes an
`AuditEntry` via `writeAudit(...)`.

This is the XL unit — the four surfaces
share so much CRUD scaffolding (Zod
schemas, page header, audit log, i18n
keys) that splitting wards / categories
/ departments into three units would
triple the per-Bolt paperwork cost with
no architectural gain. The unit
decomposes into 4 stories that ship in
lockstep within the bolt.

## Stories owned

| Slug | Title | Status |
|------|-------|--------|
| ADM-002 | wards | ready |
| ADM-003 | categories | ready |
| ADM-004 | departments | ready |
| ADM-005 | dedup-radius | ready |

## Bolt candidate

`005-002-city-config` (one
`ddd-construction-bolt`).

## Reuse references

- `lib/platform/audit.ts:32` `writeAudit(...)`
  — every config change calls
  `writeAudit({ actorId: session.userId,
  entityType: 'City' | 'Ward' | ..., action:
  'create' | 'update' | 'delete', beforeValue,
  afterValue })`.
- `prisma/schema.prisma`:
  - `model City { ..., dedupRadiusMeters
    Int @default(50) }` — ADM-005 edits
    this field.
  - `model Ward { ..., polygonGeoJson
    String? }` — ADM-002 stores the
    GeoJSON as a text column (no PostGIS
    in v1 per WO-000 tech-audit).
  - `model Category { ..., narrowCategory
    PhotoCap Int? }` — ADM-003 edits
    `isNarrow` + `narrowCategoryPhotoCap`
    (the narrow-category photo cap is
    the UX Review #6 decision; both
    fields live on `Category`).
  - `model Department { ..., contactInfo
    String? }` — ADM-004 edits this.
- `lib/auth/guards.ts:48` `requireRole(...)`
  + `requireWebAuthn(...)` (from Unit 001)
  — every write in this unit is gated by
  both. Read access (the cities-overview
  page) is gated by `requireRole('admin')`
  only.
- `lib/dev-store.ts → seed()` — additive
  changes to seed 3 cities (Dhaka-North,
  Dhaka-South, Chattogram) with the
  Dhaka template applied; 1 city
  (Chattogram) starts empty so the
  "Apply Dhaka template" button has a
  non-trivial visual baseline.
- `components/DispatcherMap.tsx` and
  `components/MapView.tsx` — share the
  `lib/geo/dhaka-district.ts` constant
  for the Dhaka overlay (the admin's
  ward editor draws the new polygon
  next to the Dhaka district outline
  for context).

## API surface (delta)

- **New**: `app/api/v1/admin/cities/route.ts`
  — GET (list cities the admin
  administers), POST (create a new
  city, with optional
  `applyDhakaTemplate: true`).
- **New**: `app/api/v1/admin/cities/[id]/route.ts`
  — GET (read), PATCH (update name +
  default language + timezone + contact
  email + `dedupRadiusMeters`), DELETE
  (soft-delete via a `City.deletedAt`
  field; a hard delete is v1.1).
- **New**: `app/api/v1/admin/cities/[id]/categories/route.ts`
  — GET (list), POST (create). Body:
  `{ name, departmentId, isNarrow,
  narrowCategoryPhotoCap? }`. Narrow
  categories (per UX Review #6) cap
  photos at 2; the field is the
  admin's lever.
- **New**: `app/api/v1/admin/cities/[id]/categories/[catId]/route.ts`
  — PATCH, DELETE.
- **New**: `app/api/v1/admin/cities/[id]/departments/route.ts`
  — GET, POST. Body: `{ name,
  contactInfo? }`. Deleting a
  department is gated by a server-side
  orphan check (returns 409
  `department_has_categories` if any
  category still references the
  departmentId).
- **New**: `app/api/v1/admin/cities/[id]/departments/[deptId]/route.ts`
  — PATCH, DELETE.
- **New**: `app/api/v1/admin/cities/[id]/wards/route.ts`
  — GET, POST. Body: `{ name, number,
  polygonGeoJson: { type: 'Polygon',
  coordinates: [[[lng, lat], ...]] } }`.
- **New**: `app/api/v1/admin/cities/[id]/wards/[wardId]/route.ts`
  — PATCH, DELETE.

Every write is gated by
`requireRole('admin')` +
`requireWebAuthn(session)` +
`writeAudit(...)`. Every read is gated
by `requireRole('admin')` (the admin
bypasses `requireScope(...)` per the
guard's admin branch).

## Pages (delta)

- **New**: `app/admin/cities/page.tsx` —
  Cities overview. Lists the cities the
  admin administers; each row: name,
  status (live / setup-in-progress /
  paused), active dispatchers count,
  active crews count, citizen reports
  per day. Filter by status. "Set up
  new city" + "View adoption" CTAs.
- **New**: `app/admin/cities/[id]/setup/page.tsx`
  — Basic info form. City name,
  default language (Bangla default),
  timezone, contact email. "Apply
  Dhaka template" button (one-way;
  surfaces a confirmation modal that
  explains the snapshot will be
  copied into the city's categories,
  departments, and ward template).
  Preview-before-commit; the commit
  calls `POST /api/v1/admin/cities/[id]`
  with `applyDhakaTemplate: true` and
  writes one `AuditEntry` per
  pre-populated entity.
- **New**: `app/admin/cities/[id]/taxonomy/page.tsx`
  — Departments & Categories. Two
  tables side-by-side (departments on
  the left, categories on the right).
  Inline create / edit; the delete
  action on a department shows the
  orphan-categories warning. Dedup
  radius slider on top of the page
  (1-500m, default 50m).
- **New**: `app/admin/cities/[id]/wards/page.tsx`
  — Wards & Boundaries. Leaflet.draw
  map editor with the OSM raster
  basemap. "New ward" button enters
  draw mode; clicking vertices
  completes the polygon; "Save"
  commits. Preview-before-publish:
  the unsaved polygon is drawn in
  orange; the published polygons are
  drawn in the same green the
  dispatcher + citizen maps use. The
  preview is the exact render of what
  the other surfaces will see (the
  Polygon goes through the same
  serializer).

## Components (delta)

- **New**: `components/WardEditor.tsx` —
  client-only. Leaflet + Leaflet.draw
  + OSM raster tiles. Receives
  `existingWards`, `onSave(polygon)`
  as props. The "Save" button is
  disabled until the polygon is
  closed.
- **New**: `components/DhakaDistrictOverlay.tsx`
  — read-only Leaflet `GeoJSON` layer
  that draws the same Dhaka District
  polygon the dispatcher + citizen
  maps use. Gives Aamir visual
  context when drawing new wards.

## Lib (delta)

- **New**: `lib/admin/dhaka-template.ts` —
  `DHAKA_TEMPLATE` constant:
  ```
  {
    categories: [
      { name: 'streetlight', department: 'streetlight', isNarrow: false, ... },
      { name: 'pothole',     department: 'roads',        isNarrow: false, ... },
      ...
    ],
    departments: [
      { name: 'streetlight', contactInfo: '...' },
      { name: 'roads', contactInfo: '...' },
      ...
    ],
    wardTemplate: { name: 'Ward {n}', polygonSrid: 4326 },
  }
  ```
  Both the dev-store seed and the
  production Prisma seed import this
  constant. The audit log records the
  snapshot used (so Aamir can see which
  Dhaka template version was applied
  to Chattogram).

## i18n keys (delta)

New keys under `admin.cities.*`,
`admin.setup.*`, `admin.taxonomy.*`,
`admin.wards.*` (≈ 30 new keys; each
key is `{ bn, en }`). Examples:
- `admin.cities.title` — "Cities" /
  "শহরসমূহ".
- `admin.cities.status.live` — "Live".
- `admin.cities.status.setup` —
  "Setup in progress".
- `admin.cities.status.paused` —
  "Paused".
- `admin.setup.applyDhakaTemplate` —
  "Apply Dhaka template" / "ঢাকা
  টেমপ্লেট প্রয়োগ করুন".
- `admin.setup.applyDhakaTemplate.confirm` —
  confirmation modal body.
- `admin.taxonomy.departments` —
  "Departments" / "বিভাগসমূহ".
- `admin.taxonomy.categories` —
  "Categories" / "বিভাগসমূহ".
- `admin.taxonomy.dedupRadius` —
  "Dedup radius (m)" / "ডিডাপ ব্যাসার্ধ (মি)".
- `admin.taxonomy.orphanWarning` —
  "Deleting this department will
  orphan {n} categories. Move them
  first.".
- `admin.wards.title` — "Wards &
  boundaries" / "ওয়ার্ড ও সীমানা".
- `admin.wards.newWard` — "New ward".
- `admin.wards.preview` —
  "Preview before publish".
- `admin.wards.save` — "Save ward".

## Tests (delta)

- **Vitest**: `tests/unit/dhaka-template.test.ts`
  (new). ~10 checks: the template
  constant has the expected shape; the
  template applies deterministically
  (no Date.now() / random in the
  function); the template's category
  list is sorted for stable IDs.
- **Vitest**: `tests/unit/admin-scope.test.ts`
  (new). ~8 checks: `requireRole('admin')`
  + `requireWebAuthn` enforces the
  contract; an admin can read any city
  (bypasses cross-city); a non-admin
  session cannot read or write.
- **Playwright**: `tests/17-admin-cities-light.spec.ts`
  (new). API checks: list / create /
  update cities; CRUD over categories,
  departments, wards; the
  `applyDhakaTemplate` flag writes
  audit rows; the
  `dedupRadiusMeters` field is
  editable; the orphan-department
  delete is rejected with 409; the
  cross-city read for a non-admin
  session is rejected. + 4 visual
  baselines at 1440x900 (cities
  overview, basic info, taxonomy,
  wards).

## Verification

- `npx tsc --noEmit` clean.
- `npm run test:unit` green.
- `npm run test:mockups` green.
- `curl -fs http://localhost:3000/`
  200.
- `npx playwright test
  tests/17-admin-cities-light.spec.ts`
  green (4 visual baselines + 10+
  API checks).

## Out of scope (deferred)

- Custom role builder (Feature #18
  deprioritized per
  `design-artifacts/B-Trigger-Map/06-feature-impact.md`).
  The role list is fixed: admin /
  dispatcher / crew / citizen.
- Public adoption dashboard (Feature
  #21 deprioritized for public; the
  internal version is the audit
  dashboard from Unit 004).
- PostGIS `geometry` column on
  `Ward`. v1 stores the GeoJSON as
  text; v1.1 may migrate to a real
  geometry column.
- Bulk import (CSV / GeoJSON file
  upload) for wards. The UI supports
  drawing one ward at a time. The
  bulk import is a v1.1 enhancement.
- Per-ward routing rules. The
  category-to-department mapping is
  global; the per-ward routing is v1.1.
