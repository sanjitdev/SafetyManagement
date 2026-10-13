---
standard: ddd-03-adr-analysis
bolt: 005-002-city-config
unit: 005-admin-city-setup/002-city-config
phase: construction
status: complete
created: 2026-10-12T08:00:00Z
updated: 2026-10-12T08:00:00Z
---

# Bolt 005-002 — ADR Analysis

The architectural decisions made
for Bolt 005-002 (`city-config`).
The five new ADRs (ADR-008 through
ADR-012) extend the established
`standards/decision-index.md`
register. Each decision is recorded
with context, the chosen approach,
the alternatives rejected, and the
consequences.

The bolt inherits six prior ADRs
without modification:

- ADR-001 — dev store in-memory +
  Prisma facade (Intent 001).
- ADR-002 — typed `i18n` key registry
  (Intent 001).
- ADR-003 — audit log append-only
  (Intent 001).
- ADR-004 — four-role auth model
  (Inception).
- ADR-005 — dev store seeded with
  realistic data (Intent 001).
- ADR-006 — admin bypasses the cross-
  city `requireScope` check (Intent
  001).
- ADR-007 — WebAuthn mandatory for
  admin writes (Intent 005, Unit 001).

## ADR-008 — Map editor: Leaflet + Leaflet.draw

**Status**: accepted
**Date**: 2026-10-12

### Context

The admin's ward-boundary editor
(`/admin/cities/[id]/wards`) needs a
client-side map canvas that supports
drawing arbitrary polygons. The
existing maps (`MapView` for the
citizen, `DispatcherMap` for the
dispatcher) use MapLibre GL JS with
OSM raster tiles. The map editor's
UX requirements are different:
the admin needs to draw + edit
polygons interactively, not just
view them.

### Decision

Use **Leaflet + Leaflet.draw** for
the ward editor. Reuse the same OSM
raster tile source + the same Dhaka
District overlay. Keep the
`MapView` (citizen) + `DispatcherMap`
(dispatcher) on MapLibre GL JS.

### Alternatives rejected

- **MapLibre GL JS + `mapbox-gl-draw`**.
  MapLibre has `mapbox-gl-draw` as a
  community port; it works but the
  ergonomic mismatch with the v1.7
  citizen map is non-trivial
  (MapLibre's draw layer is built
  around GeoJSON sources; the ward
  editor is a simpler "click
  vertices, close" UX).
- **Mapbox GL Draw directly**.
  Mapbox's draw library is the
  upstream; the v1.7 design pins
  MapLibre for the citizen map (per
  the design log). Adding Mapbox
  here is a v1.1 cost.
- **No map editor — text fields for
  lat/lng**. Rejected: the v1
  requirement (WO-004 §4.5) is a
  visual draw, not a coordinate
  form. Aamir cannot plausibly draw
  a ward polygon by typing 200+
  lat/lng pairs.

### Consequences

- One new client-side dependency:
  `leaflet` + `leaflet-draw` (both
  MIT-licensed; ~50kb total gzipped).
  These are added to `package.json`'s
  `dependencies` (not `devDependencies`)
  because the page is shipped to
  production.
- The Leaflet CSS + the Leaflet.draw
  CSS are imported in
  `components/WardEditor.tsx`'s
  stylesheet tag.
- The ward editor's UX is a
  third-party component (Leaflet.draw);
  we cannot pixel-pin the button
  shapes. The visual baseline
  captures the editor in the
  "before-draw" state (no polygon in
  progress), which is stable across
  Leaflet.draw versions.

## ADR-009 — City DELETE: hard delete with cascade (v1)

**Status**: accepted
**Date**: 2026-10-12

### Context

`DELETE /api/v1/admin/cities/[id]`
needs a delete strategy. v1 has two
options: hard delete (with Prisma's
cascade) or soft delete (a
`City.deletedAt` column; reads
filter by `deletedAt IS NULL`).

The unit-brief's Out of Scope section
explicitly defers soft delete to
v1.1: "A hard delete is v1.1."

### Decision

Use **hard delete** for v1. The
Prisma `onDelete: Cascade` chain
removes all dependent rows in one
transaction (wards / categories /
departments / users / tickets /
sessions / etc.).

### Alternatives rejected

- **Soft delete with `City.deletedAt`**.
  Stronger audit trail + recoverability
  for accidental deletes. Cost: every
  read query needs a `deletedAt IS
  NULL` filter; every serializer
  needs to know to expose or hide
  the field; the visual baseline of
  the cities overview needs a
  "trash" view.
- **Two-phase delete (mark + 30-day
  grace period)**. Even more complex
  than soft delete. Filed for v1.1.

### Consequences

- The v1 cities overview page does
  not need a "trash" / "recycle bin"
  view. Aamir cannot accidentally
  soft-delete a city.
- A future v1.1 may migrate by
  adding the `City.deletedAt` column
  + a backfill (set to `NULL` for
  all existing rows) + the read-side
  filter. The hard-delete path stays
  in place; soft-delete is an
  opt-in.
- The audit log records the city
  delete with `entityType='city',
  action='delete'`. The pre-delete
  snapshot of the city is the
  `beforeValue`. (The dependent rows
  — wards / categories / etc — are
  NOT in the audit; the v1.1 soft
  delete will replace this with a
  full snapshot.)

## ADR-010 — Ward polygon: GeoJSON text (no PostGIS)

**Status**: accepted (re-confirm of
Intent 001 decision)
**Date**: 2026-10-12

### Context

`Ward.polygonGeoJson` is stored as
`String?` in `prisma/schema.prisma`
per Intent 001. The v1 ward editor
needs to validate the polygon +
persist it. v1 does not need
spatial queries (the dispatcher's
"tickets in this ward" filter is
done via `Ticket.wardId`, not a
spatial intersect).

### Decision

Keep `Ward.polygonGeoJson` as
**GeoJSON text** for v1. Add a
`validatePolygon` server-side
guard (`lib/admin/ward-polygon.ts`)
that checks: closed ring (first ==
last coordinate), 3+ vertices, lng ∈
[-180, 180], lat ∈ [-90, 90].

### Alternatives rejected

- **PostGIS `geometry` column**.
  Strong: enables spatial queries
  ("which ward contains this
  point?"), proper GeoJSON
  validation at the DB layer,
  future-proof for v2 routing.
  Weak: requires the `postgis`
  extension + a custom Prisma
  type + a migration. WO-000's
  tech-audit deferred this for v1;
  the v1.1 architecture review
  flagged the migration as a
  non-trivial cost.
- **Store as individual lat/lng
  columns**. Strong: easy to query.
  Weak: doesn't match the GeoJSON
  shape the rest of the platform
  uses (the citizen map, the
  dispatcher map, the iOS / Android
  client libraries all speak
  GeoJSON). Rejected for consistency.

### Consequences

- The v1 dedup pre-filter
  (`lib/platform/dedup.ts →
  findCandidateTickets`) does NOT
  use the polygon; the dedup is a
  lat/lng haversine + the
  `City.dedupRadiusMeters` override.
  The polygon is a display / future-
  routing artifact in v1.
- The `validatePolygon` guard is
  the source of truth for polygon
  integrity in v1. A v1.1 migration
  to PostGIS can reuse this same
  guard; the migration is a column
  type change + a backfill.

## ADR-011 — Apply Dhaka template: append (not replace)

**Status**: accepted
**Date**: 2026-10-12

### Context

The "Apply Dhaka template" button on
`/admin/cities/[id]/setup` pre-
populates a new city (or an empty
existing city) with the Dhaka
template's departments / categories
/ wards. The two options: append
to the city's existing rows, or
replace them.

### Decision

**Append.** The "Apply Dhaka
template" is a one-way merge: it
adds the template's rows to the
city's existing configuration.
Existing rows are preserved.

The confirmation modal makes the
append semantics explicit: "This
will add the Dhaka template to your
existing configuration. Existing
rows are preserved."

### Alternatives rejected

- **Replace**. Aamir starts the
  city from the Dhaka template
  exactly. Cost: if the city
  already has custom categories
  (e.g. a category unique to a
  narrow city), the replace path
  silently destroys them. v1's
  target customer is Aamir setting
  up a NEW city (Chattogram) — the
  existing-rows problem doesn't
  apply to the v1 use case.
- **Diff + choose**.
  Aamir's-UI-driven merge ("which
  template rows do you want to
  keep?"). Cost: a multi-step
  wizard; out of scope for v1.

### Consequences

- A future v1.1 may add a
  `replaceExisting: true` flag on
  the `applyDhakaTemplate` body.
  The v1 contract is append-only.
- The slug uniqueness constraint
  (`@@unique([cityId, slug])` on
  `Department` + `Category`)
  prevents a name collision: if
  the city already has a `Roads`
  department, the "Apply Dhaka
  template" fails the
  `department.create` call with a
  Prisma unique-constraint
  violation, and the API returns
  409 `template_already_applied`.
- The audit log records the
  template version used
  (`afterValue.snapshotVersion =
  DHAKA_TEMPLATE_VERSION`), so
  Aamir can see which version of
  the template was applied to a
  given city.

## ADR-012 — "Preview before publish" for ward polygons

**Status**: accepted
**Date**: 2026-10-12

### Context

WO-004's "Do Not Change" list
explicitly mandates that the
polygon Aamir sees on the wards
page is the exact polygon every
dispatcher + citizen map reads. The
"preview before publish" pattern is
the mechanism: Aamir's unsaved
polygon is rendered in a distinct
color (orange) so it's clear what
is the "draft" and what is the
"published".

### Decision

Render the unsaved polygon in
**orange** (#E2A03A); render the
published polygons in **green**
(#2E8540 — the same color the
dispatcher + citizen maps use).
The "Save" button is disabled until
the polygon is closed.

### Alternatives rejected

- **Auto-save on draw complete**.
  Strong: no explicit "Save" step.
  Weak: the dispatcher / citizen
  maps would see a half-drawn
  polygon in the middle of
  Aamir's edit session. v1's
  preview-before-publish rule
  forbids this.
- **Two-mode toggle (Draw / Edit)**.
  Strong: explicit. Weak: Aamir
  has to remember which mode
  they're in. The single-mode
  with an explicit "Save" button
  is simpler.

### Consequences

- The visual baseline for the
  wards page is captured in the
  "before-draw" state (no polygon
  in progress, just the existing
  published wards in green). The
  "in-progress" state is exercised
  in the Playwright spec but is
  not a visual baseline (it would
  be flaky across Leaflet.draw
  versions).
- The page has a single
  "discard" / "cancel" button to
  drop an in-progress polygon.
  The cancel is local (no API
  call).
- A future v1.1 may add a
  polygon-edit mode (move vertex
  on an existing ward). The v1
  scope is create + delete only;
  the v1 page has an "Edit"
  button per existing ward that
  opens a "are you sure?" modal
  + redirects to the create flow
  with the existing polygon pre-
  filled.

## Cross-references

- **Domain Model**:
  `ddd-01-domain-model.md` in this
  folder.
- **Technical Design**:
  `ddd-02-technical-design.md` in
  this folder.
- **Prior ADRs**:
  `standards/decision-index.md`
  (ADR-001 through ADR-007).
- **Story specs**:
  - `intents/005-admin-city-setup/002-city-config/ADM-002-wards.md`
  - `intents/005-admin-city-setup/002-city-config/ADM-003-categories.md`
  - `intents/005-admin-city-setup/002-city-config/ADM-004-departments.md`
  - `intents/005-admin-city-setup/002-city-config/ADM-005-dedup-radius.md`
- **Unit brief**:
  `intents/005-admin-city-setup/002-city-config/unit-brief.md`.

## Stage 3 contract

This artifact is documentation-only.
No source files were read or written
during Stage 3. The five ADRs
(ADR-008 through ADR-012) are
recorded in
`standards/decision-index.md` as
part of Stage 5's paperwork
(handoff); the Analysis stage is
the analysis, the index is the
record.
