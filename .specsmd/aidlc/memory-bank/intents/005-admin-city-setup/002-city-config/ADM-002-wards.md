---
story: ADM-002-wards
unit: 002-city-config
intent: 005-admin-city-setup
phase: construction
status: ready
created: 2026-10-12T05:30:00Z
updated: 2026-10-12T05:30:00Z
---

# Story: ADM-002 — Ward Management

> WO-004 §4.5 (Wards & Boundaries).
> The admin draws ward polygons on a
> Leaflet.draw map; preview before
> publish; the published polygons are
> the same polygons every dispatcher
> and citizen map reads from.

## Given / When / Then

### Acceptance 1 — Create ward

**Given** an admin on
`/admin/cities/[id]/wards`
**When** the admin clicks "New ward",
clicks vertices to draw a polygon, and
clicks "Save"
**Then** the polygon is persisted to
`Ward.polygonGeoJson` (JSON-stringified
GeoJSON `Polygon`) and an `AuditEntry`
is written with
`entityType: 'Ward', action: 'create'`.

### Acceptance 2 — Edit ward

**Given** an existing ward
**When** the admin opens the ward,
moves a vertex, and saves
**Then** the new polygon is persisted
and an `AuditEntry` is written with
`beforeValue: <oldPolygon>,
afterValue: <newPolygon>`.

### Acceptance 3 — Preview before publish

**Given** an admin who has drawn a new
polygon but not yet saved
**When** the admin views the page
**Then** the unsaved polygon is drawn
in orange and the published polygons
are drawn in the same green the
dispatcher + citizen maps use; the
"Save" button is disabled until the
polygon is closed.

### Acceptance 4 — Delete ward

**Given** an existing ward with no
tickets currently bound to it
**When** the admin deletes the ward
**Then** the row is hard-deleted and an
`AuditEntry` is written with
`action: 'delete'`. If tickets ARE
bound to the ward, the delete is
rejected with 409 `ward_has_tickets`.

### Acceptance 5 — Cross-ward denial

**Given** an admin in `city_dhaka_north`
**When** the admin calls
`GET /api/v1/admin/cities/city_chittagong/wards`
**Then** the response is 200 (admins
bypass `requireScope(...)` and may
read any city). The write path is the
same — admins may create wards in
any city.

## Technical Notes

- Polygons are stored as GeoJSON
  text (`{ type: 'Polygon',
  coordinates: [[[lng, lat], ...]] }`)
  in `Ward.polygonGeoJson`. v1 does not
  add a PostGIS `geometry` column
  (deferred to v1.1 per
  `WO-004-admin-city-setup.md` Open
  Question 1).
- The map editor uses Leaflet +
  Leaflet.draw (no API key; matches
  lean-ops Goal 3 per WO-004 Open
  Question 1).
- The "preview before publish" rule is
  non-negotiable (per WO-004's
  "Do Not Change" list): the polygons
  Aamir sees on this page are the
  exact polygons every other map
  surface reads.
- The dev store's `seed()` adds
  `ward_14`, `ward_15`, `ward_16` for
  `city_dhaka_north` (the citizen +
  dispatcher + crew seeds already use
  these IDs); the unit's dev seed is
  additive and does not break the
  existing tests.

## Cross-references

- `app/api/v1/admin/cities/[id]/wards/route.ts` —
  new API.
- `app/api/v1/admin/cities/[id]/wards/[wardId]/route.ts` —
  new API (edit / delete).
- `app/admin/cities/[id]/wards/page.tsx` —
  new page.
- `components/WardEditor.tsx` —
  client-only Leaflet + Leaflet.draw
  (new).
- `lib/admin/dhaka-template.ts` —
  `DHAKA_TEMPLATE.wardTemplate` (the
  polygon-shape default).
- `tests/unit/dhaka-template.test.ts` —
  Vitest unit test.
- `tests/17-admin-cities-light.spec.ts` —
  Playwright spec (ward CRUD + visual
  baseline at 1440x900).
