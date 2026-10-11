---
standard: ddd-01-domain-model
bolt: 005-002-city-config
unit: 005-admin-city-setup/002-city-config
phase: construction
status: complete
created: 2026-10-12T08:00:00Z
updated: 2026-10-12T08:00:00Z
---

# Bolt 005-002 — Domain Model (delta)

The static domain model produced for
Bolt 005-002 (`city-config`). Per the
bolt type's Stage 1 contract, this
artifact is documentation-only — no
source code was read or written during
Stage 1. The model is the contract the
Implementation stage (Stage 4) will
code against. The Prisma schema ships
in Intent 001 (Platform Foundation)
and is unchanged by this bolt.

## Ubiquitous language

The bolt extends the v1 glossary with
the per-city config domain. Every term
below appears in either the route
handler names, the i18n key prefixes,
or the `lib/admin/dhaka-template.ts`
export shape — never the other way
around.

| Term | Definition |
|------|------------|
| **City** | A single municipality the platform serves. Has a slug, a display name, an optional Bangla name, a `defaultLanguage` (Bangla or English), and a `dedupRadiusMeters` (the per-city override for Feature #3). v1 hard-deletes cities on `DELETE` (cascade to wards / categories / departments / users). v1.1 may promote to soft-delete via a `City.deletedAt` field. |
| **Department** | A logical group within a city corporation (e.g. `Roads`, `Sanitation`). Bound 0..N to `Category`. A department is deletable only when zero categories reference it (orphan check). |
| **Category** | A citizen-facing issue type (e.g. `Pothole`, `Streetlight`). Bound to exactly one `Department` (or none, for the catch-all `Other`). The `narrowCategoryPhotoCap` (nullable; defaults to 3) is the per-category photo cap from UX Review #6. |
| **Ward** | A geographic subdivision of a city. Has a `number` (1..N per city) and an optional `polygonGeoJson` (GeoJSON `Polygon`). Wards are deletable only when zero tickets reference them. |
| **Dhaka template** | A snapshot of the canonical Dhaka-North configuration: 8 departments, 8 categories, a ward-template (the `{n}`-substituted polygon shape). The template is a pure-data constant in `lib/admin/dhaka-template.ts`; both the dev store and the production Prisma seed import the same shape. |
| **Apply Dhaka template** | The one-way pre-population flow. When Aamir clicks the button on `/admin/cities/[id]/setup`, every Dhaka-template row is committed to the target city in one transaction; one `AuditEntry` per pre-populated entity records the snapshot version. |
| **Dedup radius** | The per-city override of Feature #3's `City.dedupRadiusMeters` (default 50m, min 1, max 500). Lives on the same `/admin/cities/[id]/taxonomy` page as the categories + departments; a slider at the top. |
| **Preview-before-publish** | The rule that the polygon Aamir sees on the wards page is the exact polygon every dispatcher + citizen map reads. The unsaved polygon is rendered in orange; the published polygons are rendered in green. The "Save" button is disabled until the polygon is closed. |
| **Cross-city access** | The admin's override of the `requireScope` guard. The `requireScope` guard's `admin` branch returns `true` for any city, so an admin can read + write any city's config. |
| **Orphan check** | The server-side validation that blocks a `DELETE` on a `Department` if any `Category` still references the `departmentId`. The response is 409 `department_has_categories`; the page surfaces the orphan categories. |

## Domain entities

The Prisma schema (in `prisma/schema.prisma`) ships in Intent 001 and is unchanged by this bolt. The five tables the bolt reads + writes are:

### `City`

```
model City {
  id          String   @id @default(cuid())
  slug        String   @unique
  name        String
  nameBn      String?
  defaultLanguage String  @default("bn")
  dedupRadiusMeters Int  @default(50)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  wards       Ward[]
  categories  Category[]
  departments Department[]
  users       User[]
  tickets     Ticket[]
}
```

Read by the cities-overview page; written by
`POST /api/v1/admin/cities`,
`PATCH /api/v1/admin/cities/[id]`, and
`DELETE /api/v1/admin/cities/[id]`. The
`dedupRadiusMeters` field is the
ADM-005 lever.

### `Ward`

```
model Ward {
  id        String   @id @default(cuid())
  cityId    String
  number    Int
  name      String
  nameBn    String?
  polygonGeoJson String?   // GeoJSON Polygon as text
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  city       City       @relation(...)
  tickets    Ticket[]

  @@unique([cityId, number])
  @@index([cityId])
}
```

Read by the wards page; written by
`POST /api/v1/admin/cities/[id]/wards`,
`PATCH /api/v1/admin/cities/[id]/wards/[wardId]`,
and
`DELETE /api/v1/admin/cities/[id]/wards/[wardId]`.
The `polygonGeoJson` is the ADM-002 lever;
`v1` stores it as text (no PostGIS).
A ward is deletable only when zero
tickets reference it (server-side orphan
check → 409 `ward_has_tickets`).

### `Department`

```
model Department {
  id        String   @id @default(cuid())
  cityId    String
  slug      String
  name      String
  nameBn    String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  city      City      @relation(...)
  categories Category[]

  @@unique([cityId, slug])
  @@index([cityId])
}
```

Read by the taxonomy page; written by
`POST /api/v1/admin/cities/[id]/departments`,
`PATCH /api/v1/admin/cities/[id]/departments/[deptId]`,
and
`DELETE /api/v1/admin/cities/[id]/departments/[deptId]`.
A department is deletable only when
zero categories reference it
(server-side orphan check → 409
`department_has_categories`).

### `Category`

```
model Category {
  id           String   @id @default(cuid())
  cityId       String
  departmentId String?
  slug         String
  name         String
  nameBn       String?
  narrowCategoryPhotoCap Int?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  city       City        @relation(...)
  department Department?  @relation(...)
  tickets    Ticket[]

  @@unique([cityId, slug])
  @@index([cityId])
}
```

Read by the taxonomy page; written by
`POST /api/v1/admin/cities/[id]/categories`,
`PATCH /api/v1/admin/cities/[id]/categories/[catId]`,
and
`DELETE /api/v1/admin/cities/[id]/categories/[catId]`.
The `narrowCategoryPhotoCap` (nullable;
defaults to 3) is the ADM-003 lever
(UX Review #6 photo cap).
A category is deletable only when
zero tickets reference it
(server-side orphan check → 409
`category_has_tickets`).

### `AuditEntry`

```
model AuditEntry {
  id          String   @id @default(cuid())
  entityType  String
  entityId    String
  action      String
  actorId     String
  beforeValue Json?
  afterValue  Json?
  timestamp   DateTime @default(now())

  actor       User      @relation(...)
}
```

Append-only. Every state-changing
operation in this bolt writes one
`AuditEntry` via `writeAudit(...)`
from `lib/platform/audit.ts`. The
`entityType` is one of `'city'`,
`'category'`, `'department'`, or
`'ward'`. The `action` is one of
`'create'`, `'update'`, or `'delete'`.
The `applyDhakaTemplate` flow writes
one row per pre-populated entity
(8 departments + 8 categories + N
wards).

## Value objects

The bolt adds three value-object
shapes. These are JSON-typed on the
API boundary and Zod-validated.

### `CityInput`

```ts
{
  name: string;        // 2..60 chars
  slug: string;        // [a-z0-9-]+
  nameBn?: string;
  defaultLanguage: 'bn' | 'en';
  contactEmail?: string;
  timezone?: string;   // IANA tz; default 'Asia/Dhaka'
  applyDhakaTemplate?: boolean;  // POST only
}
```

### `WardInput`

```ts
{
  number: number;      // 1..N per city (unique)
  name: string;        // 2..60 chars
  nameBn?: string;
  polygonGeoJson: {
    type: 'Polygon';
    coordinates: [[[lng, lat], ...]];
  };
}
```

The polygon is validated server-side:
must be a closed ring (first == last
coordinate), 3+ vertices, lng ∈
[-180, 180], lat ∈ [-90, 90].

### `DepartmentInput` / `CategoryInput`

```ts
// DepartmentInput
{
  slug: string;
  name: string;        // 2..60 chars
  nameBn?: string;
  contactInfo?: string;
}

// CategoryInput
{
  slug: string;
  name: string;
  nameBn?: string;
  departmentId?: string;     // must reference an existing dept
  narrowCategoryPhotoCap?: number;  // 1..10; null → 3
}
```

## Domain operations

| Operation | API surface | Guard chain | Audit shape |
|-----------|-------------|-------------|-------------|
| List cities | `GET /api/v1/admin/cities` | `requireRole('admin')` | — |
| Create city | `POST /api/v1/admin/cities` | `requireRole('admin')` + `requireWebAuthn` | `entityType='city', action='create'` |
| Read city | `GET /api/v1/admin/cities/[id]` | `requireRole('admin')` | — |
| Update city | `PATCH /api/v1/admin/cities/[id]` | `requireRole('admin')` + `requireWebAuthn` | `entityType='city', action='update', beforeValue, afterValue` |
| Delete city | `DELETE /api/v1/admin/cities/[id]` | `requireRole('admin')` + `requireWebAuthn` | `entityType='city', action='delete'` |
| List categories | `GET /api/v1/admin/cities/[id]/categories` | `requireRole('admin')` | — |
| Create category | `POST .../categories` | `requireRole('admin')` + `requireWebAuthn` | `entityType='category', action='create'` |
| Update category | `PATCH .../categories/[catId]` | `requireRole('admin')` + `requireWebAuthn` | `entityType='category', action='update', beforeValue, afterValue` |
| Delete category | `DELETE .../categories/[catId]` | `requireRole('admin')` + `requireWebAuthn` | `entityType='category', action='delete'` |
| List departments | `GET .../departments` | `requireRole('admin')` | — |
| Create department | `POST .../departments` | `requireRole('admin')` + `requireWebAuthn` | `entityType='department', action='create'` |
| Update department | `PATCH .../departments/[deptId]` | `requireRole('admin')` + `requireWebAuthn` | `entityType='department', action='update', beforeValue, afterValue` |
| Delete department | `DELETE .../departments/[deptId]` | `requireRole('admin')` + `requireWebAuthn` | `entityType='department', action='delete'` |
| List wards | `GET .../wards` | `requireRole('admin')` | — |
| Create ward | `POST .../wards` | `requireRole('admin')` + `requireWebAuthn` | `entityType='ward', action='create'` |
| Update ward | `PATCH .../wards/[wardId]` | `requireRole('admin')` + `requireWebAuthn` | `entityType='ward', action='update', beforeValue, afterValue` |
| Delete ward | `DELETE .../wards/[wardId]` | `requireRole('admin')` + `requireWebAuthn` | `entityType='ward', action='delete'` |
| Apply Dhaka template | `POST /api/v1/admin/cities/[id]` (with `applyDhakaTemplate: true`) | `requireRole('admin')` + `requireWebAuthn` | one `entityType='department'/'category'/'ward', action='create'` row per pre-populated entity |

## State machine

The four resources (City, Department,
Category, Ward) each have the same
trivial state shape: a single
"exists" state, with `createdAt` /
`updatedAt` timestamps. There is no
state transition beyond CRUD; the
`DELETE` is a hard delete in v1.

The exception is the
`applyDhakaTemplate` flow: the
target city's `Category[]` /
`Department[]` / `Ward[]` is
appended-to (NOT replaced). The
"merge" semantics are explicit in the
confirmation modal: "This will add
the Dhaka template to your existing
configuration. Existing rows are
preserved."

## Invariants

- A `Category` may reference any
  `Department` within the same city
  (or no department).
- A `Ward.number` is unique per city.
- A `Department.slug` is unique per
  city.
- A `Category.slug` is unique per
  city.
- A `Department` may not be deleted
  while any `Category` references it
  → 409 `department_has_categories`.
- A `Category` may not be deleted
  while any `Ticket` references it →
  409 `category_has_tickets`.
- A `Ward` may not be deleted while
  any `Ticket` references it → 409
  `ward_has_tickets`.
- A `City.dedupRadiusMeters` is
  bounded to [1, 500].
- The `polygonGeoJson` is a closed
  ring with 3+ vertices; lng/lat are
  in their valid ranges.

## Cross-references

- **Story specs**:
  - `intents/005-admin-city-setup/002-city-config/ADM-002-wards.md`
  - `intents/005-admin-city-setup/002-city-config/ADM-003-categories.md`
  - `intents/005-admin-city-setup/002-city-config/ADM-004-departments.md`
  - `intents/005-admin-city-setup/002-city-config/ADM-005-dedup-radius.md`
- **Unit brief**:
  `intents/005-admin-city-setup/002-city-config/unit-brief.md`.
- **Schema**:
  `prisma/schema.prisma` (Intent 001).
- **Audit module**:
  `lib/platform/audit.ts` (Intent 001).
- **WebAuthn guard**:
  `lib/auth/guards.ts` (Bolt 005-001).
- **Map primitives**:
  `lib/geo/dhaka-district.ts` (Bolt 003-005).

## Stage 1 contract

This artifact is documentation-only.
No source files were read or written
during Stage 1. The Implementation
stage (Stage 4) will code against
this model; the Test stage (Stage 5)
will pin the acceptance criteria.
