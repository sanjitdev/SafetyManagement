---
standard: ddd-02-technical-design
bolt: 005-002-city-config
unit: 005-admin-city-setup/002-city-config
phase: construction
status: complete
created: 2026-10-12T08:00:00Z
updated: 2026-10-12T08:00:00Z
---

# Bolt 005-002 — Technical Design

The implementation plan for Bolt
005-002 (`city-config`). The Domain
Model (Stage 1) is the contract; this
artifact is the file-by-file
implementation plan the Stage 4
Implementation stage will execute.

## File map (delta)

### New (lib/)

- `lib/admin/dhaka-template.ts` — the
  `DHAKA_TEMPLATE` constant + the
  `applyDhakaTemplate(cityId, actorId)`
  function. Pure data + pure functions;
  no I/O. The dev store + the
  production Prisma seed both import
  this module.
- `lib/admin/ward-polygon.ts` — the
  `validatePolygon(polygon)` server-side
  guard. Returns either `{ valid: true }`
  or `{ valid: false, error: '...' }`.

### New (app/api/v1/admin/)

- `app/api/v1/admin/cities/route.ts` —
  GET (list) + POST (create with
  `applyDhakaTemplate`).
- `app/api/v1/admin/cities/[id]/route.ts` —
  GET (read) + PATCH (update) +
  DELETE (hard delete).
- `app/api/v1/admin/cities/[id]/categories/route.ts` —
  GET (list) + POST (create).
- `app/api/v1/admin/cities/[id]/categories/[catId]/route.ts` —
  PATCH + DELETE.
- `app/api/v1/admin/cities/[id]/departments/route.ts` —
  GET + POST.
- `app/api/v1/admin/cities/[id]/departments/[deptId]/route.ts` —
  PATCH + DELETE.
- `app/api/v1/admin/cities/[id]/wards/route.ts` —
  GET + POST.
- `app/api/v1/admin/cities/[id]/wards/[wardId]/route.ts` —
  PATCH + DELETE.

### New (app/admin/)

- `app/admin/cities/page.tsx` —
  cities overview. List of all cities
  + status (live / setup-in-progress /
  paused) + per-city counts.
- `app/admin/cities/[id]/setup/page.tsx` —
  basic info form + "Apply Dhaka
  template" button + confirmation
  modal.
- `app/admin/cities/[id]/taxonomy/page.tsx` —
  departments + categories tables +
  dedup-radius slider.
- `app/admin/cities/[id]/wards/page.tsx` —
  Leaflet.draw map editor for ward
  polygons.
- `app/admin/layout.tsx` — the shared
  admin shell: top bar with brand +
  language toggle + theme toggle +
  logout; left rail with cities /
  setup / taxonomy / wards links;
  WebAuthn status indicator.

### New (components/)

- `components/WardEditor.tsx` — the
  client-only Leaflet + Leaflet.draw
  ward-boundary editor. Receives
  `existingWards` + `onSave(polygon)`.
- `components/DhakaDistrictOverlay.tsx` —
  the read-only Leaflet `GeoJSON`
  layer that draws the same Dhaka
  District polygon the dispatcher +
  citizen maps use. Provides visual
  context for Aamir when drawing new
  wards.
- `components/DedupRadiusSlider.tsx` —
  the native HTML `<input type="range">`
  + "Save" button. Bilingual number
  formatting via the inherited
  `formatBn` helper.
- `components/ConfirmModal.tsx` — the
  shared confirmation modal used by
  the "Apply Dhaka template" + the
  "Delete department" + the "Delete
  ward" flows. Bilingual.

### New (tests/)

- `tests/unit/dhaka-template.test.ts` —
  ~10 checks: the template constant
  has the expected shape; the template
  applies deterministically; the
  template's category list is sorted
  for stable IDs.
- `tests/unit/ward-polygon.test.ts` —
  ~6 checks: the validator accepts a
  valid closed polygon; rejects
  unclosed / < 3 vertices / out-of-
  range lng or lat.
- `tests/unit/admin-scope.test.ts` —
  ~8 checks: `requireRole('admin')` +
  `requireWebAuthn` enforces the
  contract; an admin can read any
  city (bypasses cross-city); a
  non-admin session cannot read or
  write.
- `tests/17-admin-cities-light.spec.ts` —
  the Playwright spec. ~10 API checks
  + 4 visual baselines (cities
  overview, basic info, taxonomy,
  wards).

### Modified (existing files)

- `lib/db-switch.ts` — add the
  `db.city` / `db.ward` /
  `db.category` / `db.department`
  write methods (the existing switch
  only exposes reads for these).
- `lib/dev-store.ts` — add
  `devDb.city.create / update / delete`,
  `devDb.department.create / update /
  delete`, `devDb.category.create /
  update / delete`, `devDb.ward.create
  / update / delete`, plus the
  `devDb.city.findMany` + `devDb.department.findMany`
  + `devDb.ward.findMany` reads. Extend
  the `seed()` with 2 extra cities
  (`city_dhaka_south`, `city_chittagong`)
  and the full Dhaka-template's 8
  departments + 8 categories + 3 wards
  on `city_dhaka_north`.
- `lib/i18n/keys.ts` — add ~30 new
  `admin.cities.*` / `admin.setup.*` /
  `admin.taxonomy.*` / `admin.wards.*`
  keys. Each is `{ bn, en }`.
- `lib/auth/guards.ts` — no change.
  The existing `requireRole` +
  `requireWebAuthn` from Bolt 005-001
  is the contract.
- `lib/geo/dhaka-district.ts` — no
  change. The `DispatcherMap` +
  `MapView` already consume it.

### Paperwork (new)

- `.specsmd/aidlc/memory-bank/bolts/005-002-city-config/ddd-01-bolt-record.md`

### Paperwork (modified)

- `.specsmd/aidlc/memory-bank/intents/005-admin-city-setup/units.md` —
  Unit 002 status `ready` → `done`;
  bolt-progress block updated.
- `.specsmd/aidlc/memory-bank/intents/005-admin-city-setup/002-city-config/unit-brief.md` —
  the per-unit status flips to `done`.
- `.specsmd/aidlc/memory-bank/intents/005-admin-city-setup/002-city-config/ADM-002-wards.md`
  → `done`.
- `.specsmd/aidlc/memory-bank/intents/005-admin-city-setup/002-city-config/ADM-003-categories.md`
  → `done`.
- `.specsmd/aidlc/memory-bank/intents/005-admin-city-setup/002-city-config/ADM-004-departments.md`
  → `done`.
- `.specsmd/aidlc/memory-bank/intents/005-admin-city-setup/002-city-config/ADM-005-dedup-radius.md`
  → `done`.
- `.specsmd/aidlc/memory-bank/story-index.md` — ADM-002/003/004/005
  → `done`.
- `_progress/00-design-log.md` — Bolt
  005-002 entry appended.

## API contract

All routes are gated by
`requireRole('admin')` (read) or
`requireRole('admin')` +
`requireWebAuthn(session)` (write).
The session's `cityId` is NOT a scope
check on the admin role — admins can
read + write any city per ADR-006.

The route handlers follow the
established `app/api/auth/webauthn/*`
pattern from Bolt 005-001: Zod
schema at the top, helper functions
in the body, `writeAudit(...)` for
state changes, `ApiError` thrown
for the documented error codes.

### `GET /api/v1/admin/cities`

Returns `{ cities: Array<{
  id, slug, name, nameBn, defaultLanguage,
  dedupRadiusMeters, status: 'live'
  | 'setup' | 'paused', counts:
  { dispatchers, crews, ticketsPerDay }
}> }`. Sorted by `name ASC`.

`status` is derived: a city is
`'setup'` if it has 0 wards + 0
categories (the seed) or 0 wards +
the admin has clicked the basic-info
page once. It's `'live'` once
`ward_count >= 1 && category_count
>= 1 && department_count >= 1`. It's
`'paused'` if the city is offline
(v1: always `'live'` / `'setup'`).

`counts.dispatchers` /
`counts.crews` count
`User WHERE cityId = X AND role =
'dispatcher'/'crew'`.
`counts.ticketsPerDay` is the
7-day-rolling average.

### `POST /api/v1/admin/cities`

Body (Zod): `CityInput`. Returns
`{ id, slug, ... }` of the new city
(201).

If `applyDhakaTemplate: true`,
the route also:
1. Creates the 8 Dhaka-template
   departments in the new city.
2. Creates the 8 Dhaka-template
   categories, each bound to its
   template's department.
3. Creates 3 placeholder wards (the
   Dhaka-template's ward template,
   `Ward {n}`).
4. Writes one `AuditEntry` per
   pre-populated entity (8 + 8 + 3
   = 19 rows), each with
   `afterValue.snapshotVersion:
   DHAKA_TEMPLATE_VERSION`.

The "Apply Dhaka template" flag is
additive — the new city starts
empty + the template is appended.
A future v1.1 may add a
`replaceExisting: true` flag.

### `PATCH /api/v1/admin/cities/[id]`

Body (Zod):
`Partial<CityInput> & {
  dedupRadiusMeters?: number
}`. Returns the updated city (200).

`dedupRadiusMeters` is bounded to
[1, 500] — out-of-range is 400
`dedup_radius_out_of_range`.

### `DELETE /api/v1/admin/cities/[id]`

Hard delete. Cascade: wards /
categories / departments / users /
tickets / sessions (per the Prisma
`onDelete: Cascade` chain). Audit:
`entityType='city', action='delete'`.

### `GET/POST/PATCH/DELETE` for the nested routes

Follow the same shape as the cities
routes. The `cityId` URL parameter
must reference an existing city
(404 `city_not_found`). The
`departmentId` body field on
`CategoryInput` must reference an
existing department in the same
city (404 `department_not_found`).

The `DELETE` orphan checks:
- Department: 409
  `department_has_categories` if any
  category references it.
- Category: 409 `category_has_tickets`
  if any ticket references it.
- Ward: 409 `ward_has_tickets` if any
  ticket references it.

## UI / page contracts

### `/admin/cities` (overview)

3-region desktop surface (1440x900):
top bar (brand + admin name + lang
toggle + theme toggle + logout) +
left rail (Cities / Setup / Taxonomy
/ Wards links, all disabled until a
city is selected) + center table
(cities list).

The table columns: name, status
(live / setup / paused), dispatchers
count, crews count, citizen reports
per day, "View" link.

"Set up new city" CTA in the top
right of the table; opens a
confirmation modal that POSTs to
`/api/v1/admin/cities` with the
default values (Bangla, 50m, etc).

### `/admin/cities/[id]/setup` (basic info)

Form: name, nameBn, defaultLanguage
(bn/en), timezone, contact email.
"Apply Dhaka template" button (one-
way; surfaces the confirmation
modal). "Save" button commits the
form via PATCH.

### `/admin/cities/[id]/taxonomy`

Top: dedup-radius slider (1..500m,
default 50m) + "Save" button.

Below: 2 tables side-by-side.
Left: departments (name, slug,
contactInfo, edit / delete buttons).
Right: categories (name, department
binding, narrow-category flag +
photo cap, edit / delete buttons).

Click a department row to filter
the categories table to that
department.

Delete-department action: opens the
confirmation modal with the orphan
warning if any category still
references it. The server-side
orphan check is the source of truth
(409 response on the API → modal
shows the categories list).

### `/admin/cities/[id]/wards`

Map editor. `components/WardEditor`
mounts the Leaflet + Leaflet.draw
canvas centered on the city's
bounding box (or Dhaka's if the
city has no wards yet). The
`DhakaDistrictOverlay` renders the
district polygon for context.

"New ward" button enters draw mode.
Clicking vertices completes the
polygon. "Save" button (disabled
until the polygon is closed) commits
via POST.

Existing wards render in green
(the same color the dispatcher +
citizen maps use). The unsaved
polygon renders in orange.

## Component contracts

### `<WardEditor>`

```ts
interface WardEditorProps {
  existingWards: Array<{
    id: string;
    number: number;
    name: string;
    polygonGeoJson: GeoJSON.Polygon;
  }>;
  onSave: (polygon: GeoJSON.Polygon) => void;
  lang: 'bn' | 'en';
}
```

Client-only (`'use client'`). The
"Save" button is disabled until the
polygon is closed. On save, calls
`onSave(polygon)`. The page wires
`onSave` to the POST API call.

### `<DhakaDistrictOverlay>`

```ts
interface DhakaDistrictOverlayProps {
  // No props — pure data layer.
}
```

Client-only. Mounts a Leaflet
`GeoJSON` layer using the same
`DHAKA_DISTRICT_FEATURE_COLLECTION`
from `lib/geo/dhaka-district.ts`.

### `<DedupRadiusSlider>`

```ts
interface DedupRadiusSliderProps {
  cityId: string;
  initialValue: number;        // 1..500
  onSaved: (newValue: number) => void;
  lang: 'bn' | 'en';
}
```

Client-only. Native `<input
type="range" min="1" max="500"
step="1">` + a "Save" button. On
click, PATCHes
`/api/v1/admin/cities/[id]` with
`{ dedupRadiusMeters }`. Out-of-
range values are validated client-
side and never reach the API.

### `<ConfirmModal>`

```ts
interface ConfirmModalProps {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;   // red CTA
  lang: 'bn' | 'en';
}
```

Client-only. Used by the "Apply
Dhaka template" + "Delete
department" + "Delete ward" +
"Delete city" flows.

## Lib contract

### `lib/admin/dhaka-template.ts`

```ts
export const DHAKA_TEMPLATE_VERSION = '2026-10-12-v1';

export interface DhakaTemplateDepartment {
  slug: string;
  name: { bn: string; en: string };
  contactInfo?: string;
}

export interface DhakaTemplateCategory {
  slug: string;
  name: { bn: string; en: string };
  departmentSlug: string;   // ref to a DhakaTemplateDepartment
  isNarrow: boolean;
  narrowCategoryPhotoCap: number | null;
}

export interface DhakaTemplate {
  version: string;
  departments: DhakaTemplateDepartment[];
  categories: DhakaTemplateCategory[];
  wardTemplate: {
    count: number;        // 3 placeholder wards
    namePattern: string;  // 'Ward {n}'
  };
}

export const DHAKA_TEMPLATE: DhakaTemplate = { ... };

export async function applyDhakaTemplate(
  cityId: string,
  actorId: string,
): Promise<{
  departmentsCreated: number;
  categoriesCreated: number;
  wardsCreated: number;
}>;
```

The function is pure orchestration:
it reads the template, calls
`db.department.create` /
`db.category.create` /
`db.ward.create` for each row, and
writes one `AuditEntry` per row. It
is backend-agnostic (uses the
`db-switch` facade).

### `lib/admin/ward-polygon.ts`

```ts
export type PolygonValidationResult =
  | { valid: true; polygon: GeoJSON.Polygon }
  | { valid: false; error: 'invalid_polygon' | 'polygon_not_closed' | 'polygon_too_few_vertices' | 'coordinates_out_of_range' };

export function validatePolygon(
  raw: unknown,
): PolygonValidationResult;
```

Pure function; no I/O. Used by the
WARD POST + PATCH routes.

## Reuse references

- `lib/auth/guards.ts:requireRole` +
  `requireWebAuthn` (Bolt 005-001) —
  the gate on every write.
- `lib/platform/audit.ts:writeAudit`
  (Intent 001) — every state change.
- `lib/geo/dhaka-district.ts` (Bolt
  003-005) — the district polygon
  overlay.
- `lib/db-switch.ts` — the
  backend-agnostic facade. The new
  city / dept / category / ward write
  methods are added here.
- `lib/i18n/keys.ts` — the typed key
  registry.
- `lib/format/bn-number.ts` (if
  present; otherwise `Intl.NumberFormat('bn-BD')`)
  — Bangla number formatting for the
  slider label.

## Critical sequencing

The four new API resources are
shipped in this order:
1. `cities` (the root resource; the
   other 3 hang off it).
2. `categories` + `departments` (the
   taxonomy).
3. `wards` (the geographic resource;
   has the most client-side work).

Within each resource: GET + POST
first, then PATCH + DELETE. The
Vitest tests for each resource ship
with the route handlers. The
Playwright spec ships after all 4
resources are wired + the 4 admin
pages are functional.

## Verification

Per the team's recorded Construction
Verification Command:

```
npx tsc --noEmit
  && npm run test:unit
  && npm run test:mockups
  && curl -fs http://localhost:3000/
```

Plus the bolt-specific checks:

- `npx playwright test tests/17-admin-cities-light.spec.ts` —
  ~10 API checks + 4 visual baselines.
- Manual smoke: log in as
  `admin@cityfix.bd` (via the
  `/api/dev/login?role=admin` dev
  persona), open
  `/admin/cities`, click into
  Chattogram (the empty city), apply
  the Dhaka template, draw a new
  ward, save, and confirm the
  audit log has 19+1 rows.

Expected results:

- `tsc --noEmit` — clean for the
  bolt's own files (the 13
  pre-existing TS errors from prior
  bolts remain out of scope).
- `npm run test:unit` — green.
- `npm run test:mockups` — green
  (the bolt adds 4 new route-spec
  baselines; no global mockup HTML).
- `curl -fs http://localhost:3000/`
  — 200.
- Playwright spec — green, with
  4 visual baselines captured.

## Risk + design notes

- **Leaflet SSR safety**: `WardEditor`
  + `DhakaDistrictOverlay` mount on
  the client only (`'use client'`).
  The server-side render of the wards
  page returns the auth-gated shell
  with a loading state. The map
  never touches `window` / `document`
  on the server. (Same pattern as
  `MapView` + `DispatcherMap`.)
- **Hard delete vs soft delete**:
  the unit-brief specifies hard
  delete for v1 + soft delete for
  v1.1. The ADR analysis
  (`ddd-03-adr-analysis.md`) records
  the decision + the migration path.
- **GeoJSON text vs PostGIS**: v1
  stores the polygon as text per the
  `prisma/schema.prisma` comment.
  The `validatePolygon` function is
  the v1 contract; a v1.1 migration
  to a `geometry` column is filed
  but out of scope.
- **Visual baseline fragility**:
  Playwright baselines use the
  established Pillow `pixelmatch`
  helper; the admin's pages have
  stable deterministic content (the
  seed data + the static UI). The
  4 visual baselines are deterministic.
- **Bangla number formatting**:
  the slider's "50m" label is
  rendered in both Latin ("50 m")
  and Bangla ("৫০ মি.") — the page
  toggles via the same `ToggleLang`
  chip the dispatcher's pages use.
- **Cross-city access**: the admin
  bypasses the cross-city check on
  both read + write per the
  established `requireScope` admin
  branch. The Playwright spec
  exercises the positive case
  (`city_dhaka_north` admin writes
  to `city_chittagong`).
- **Orphan check ordering**: the
  orphan check is server-side, but
  the page also surfaces the orphan
  warning client-side. The
  server-side check is the source of
  truth; the client-side warning is
  a UX nicety.

## Stage 2 contract

This artifact is documentation-only.
No source files were read or written
during Stage 2. The Implementation
stage (Stage 4) will follow this
file map; the Test stage (Stage 5)
will pin the acceptance criteria
against the API + page contracts.
