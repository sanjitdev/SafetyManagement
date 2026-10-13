---
standard: ddd-02-technical-design
phase: construction
status: complete
created: 2026-10-11T18:00:00Z
updated: 2026-10-11T18:00:00Z
bolt_id: 002-003a-see-and-pick
---

# Bolt 002-003a — Technical Design

The 3 pre-submit steps of the report flow:
**1.7 location**, **1.8 photo**, **1.9 category**.
Plus the polygon-geofence upgrade (Gap G1) and
the photo-cap invariants. The design **anchors to
the existing source** (`app/report/location/page.tsx`,
`app/report/photo/page.tsx`,
`app/report/category/page.tsx`,
`app/api/report/bootstrap/route.ts`) — the
child's implement phase is paperwork + the
G1 upgrade + per-step visual baselines.

## Architecture pattern

The 3 pre-submit steps are `'use client'`
components that read the bootstrap endpoint on
mount and persist a `ReportDraft` in
`sessionStorage` between steps. The flow is
linear and forward-only; the citizen can press
"Back" in the browser to revisit a prior step
without losing the draft.

```text
┌──────────────────────────────────────────────┐
│  Presentation  (3 'use client' pages)        │
│   - 1.7 location:  MapView + draggable pin   │
│   - 1.8 photo:     FileReader → data URLs    │
│   - 1.9 category:  bootstrap → category list │
│   - All 3: read /api/report/bootstrap on     │
│     mount; read+write ReportDraft in         │
│     sessionStorage on every transition.      │
└────────────────────┬─────────────────────────┘
                     │ fetch (credentials: 'include')
                     ▼
┌──────────────────────────────────────────────┐
│  API  (app/api/report/bootstrap/route.ts)    │
│   - Zod-validated response shape             │
│   - getActiveSession → 401 if anonymous      │
│   - Returns CityBootstrap                    │
│   - (v1.1) Returns ward polygon GeoJSON      │
└────────────────────┬─────────────────────────┘
                     │ uses
                     ▼
┌──────────────────────────────────────────────┐
│  Service  (lib/report-draft.ts)              │
│   - emptyDraft(cityId, wardId) → ReportDraft │
│   - loadDraft() / saveDraft(draft) / clear   │
│   - 3a does NOT touch lib/platform/* (3b's)  │
└────────────────────┬─────────────────────────┘
                     │ uses
                     ▼
┌──────────────────────────────────────────────┐
│  Platform  (lib/db-switch.ts → db.*)         │
│   - db.city.findUnique, db.ward.findUnique   │
│   - db.category.findMany                     │
└──────────────────────────────────────────────┘
```

3a does **not** touch the submit / dedup /
confirmation steps; those are 3b's scope.

## Layer structure (per route)

### `GET /api/report/bootstrap`

(Already in 017-bootstrap-endpoint, owned by 3b
in the parent bolt's story list; 3a only consumes
the contract.)

```text
1. getActiveSession() → 401 if anonymous
2. session.role !== 'citizen' → 403 citizen_only
3. db.city.findUnique({ id: session.cityId })
4. db.ward.findUnique({ id: session.wardId }) OR
   db.ward.findFirst({ cityId, orderBy: number asc })
5. db.category.findMany({ cityId })
6. Respond 200 { city, ward, categories }
```

The 3a scope **does not** extend the response
shape. The polygon-geofence upgrade (G1) is a
client-side change: the location page reads
`ward.polygonGeoJson` from a new optional field
on the response (added by 3b in a backwards-
compatible way), or falls back to the
`DHAKA_NORTH_BBOX` constant when the field is
absent.

### `1.7 location/page.tsx` — flow

```text
1. mount → fetch /api/report/bootstrap
2. if draft present → restore (lat, lng)
3. else → emptyDraft(city.id, ward.id) → save
4. user drags pin → setLat / setLng (local state)
5. user taps Continue:
   a. if pin is OUTSIDE the polygon (or fallback
      bbox) → render the "out-of-bounds" card
      (the R-1 design gap).
   b. else → saveDraft({...draft, lat, lng,
      locationLabel, locationLabelBn, step: 'photo'})
      → router.push('/report/photo')
```

### `1.8 photo/page.tsx` — flow

```text
1. mount → fetch /api/report/bootstrap
2. if draft present → restore photoUrls
3. compute cap:
   a. if draft.categoryId is set AND
      category.narrowCategoryPhotoCap is set:
      cap = narrowCategoryPhotoCap
   b. else: cap = DEFAULT_PHOTO_CAP (3)
4. user adds files via <input type="file" accept="image/*" multiple>:
   a. FileReader.readAsDataURL → data URL
   b. cap-truncate to (cap - current.length)
5. user removes a photo → re-save
6. user taps Continue:
   a. if photos.length < 1 → block
   b. else → saveDraft({...draft, photoUrls, step: 'category'})
      → router.push('/report/category')
```

### `1.9 category/page.tsx` — flow

```text
1. mount → fetch /api/report/bootstrap
2. if draft.categoryId → restore selected
3. user picks a category → setSelected
4. user taps Continue:
   a. saveDraft({...draft, categoryId, step: 'note'})
   b. router.push('/report/note') (3b's step)
```

## Data persistence

No new models. The `ReportDraft` is client-side
only (`sessionStorage`); the city / ward /
category reads are from the existing schema.

**Indexes used**:

- `Category @@unique([cityId, slug])` — bootstrap
  lookup.
- `Ward @@unique([cityId, number])` — bootstrap
  ward lookup.

## Security

### Session

- All 3 steps are auth-gated; the bootstrap
  endpoint returns 401 if no session.
- The 401 path renders a `auth.signin_required_short`
  card with a "Back to home" link.

### Geofence (G1)

- The polygon read is from the session's
  own `cityId`; a cross-city session cannot
  inject a polygon from another city.
- The fallback bbox is a **defensive constant**
  for the dev demo; the design doc records this
  so a v1.1 Bolt wiring the polygon in
  production is behaviour-preserving.

### Photo data URLs

- v1 stores `data:image/...;base64,...` in
  `sessionStorage` and in `Ticket.photoUrls`.
  The data URL is keyed by the same draft the
  rest of the flow uses; it does not cross
  surfaces.
- A citizen on a malicious site cannot be
  tricked into uploading an arbitrary file:
  the file input's `accept="image/*"` is a
  hint, not a guard, but the data URL is
  server-validated as `z.string().url()` (the
  `data:` scheme passes `URL` parsing). v1.1
  swaps to S3 + signed uploads (deferred).

## NFRs (per-bolt targets)

| NFR | Target | Rationale |
|-----|--------|-----------|
| Step transition latency (p95) | ≤ 100 ms | `sessionStorage.setItem` + `router.push`; no network. |
| Bootstrap fetch latency (p95) | ≤ 200 ms | `db.*` reads; dev store is in-memory. |
| First paint of each step (p95) | ≤ 1500 ms | One bootstrap fetch + one draft restore; ≈ 200 ms. |
| Geofence check latency (p95) | ≤ 5 ms | In-memory polygon bbox test. |
| Visual baseline fidelity | 0.005 tolerance | Per `aidlc/spaces/default/memory/team.md` Mandated. |

## API contracts

| Endpoint | Method | Auth | Query | 2xx Response | Error codes |
|----------|--------|------|-------|--------------|-------------|
| `/api/report/bootstrap` | GET | citizen | — | `CityBootstrap` | 401, 403, 404 |

`CityBootstrap` is unchanged from 3a vs 3b's
contract. **3a does not extend the response**;
the polygon field (if any) is added by 3b in a
backwards-compatible way. The v1 baseline
captures the shape as it is today.

## Frontend contracts

### localStorage / sessionStorage

| Key | Storage | Read | Write |
|-----|---------|------|-------|
| `cityfix.reportDraft.v1` | sessionStorage | on mount, on Continue | on every state change |

The polygon / fallback is read once on mount of
the location step; subsequent navigations
re-derive the in-bounds check from the
**current** pin state.

### Effects

1. **Mount effect** (deps: `[]`):
   - Fetch `/api/report/bootstrap`.
   - If 401 / 403 → `authed = false`.
   - Else → restore or initialise the draft.
2. **Pin drag effect** (location only, deps: `[]`):
   - `MapView` is a client component; the
     `onPinChange` callback updates the local
     `lat` / `lng` state.
3. **File add effect** (photo only, deps: `[]`):
   - The `<input type="file">` change event
     reads each file via `FileReader.readAsDataURL`
     and pushes the result into `photoUrls`,
     capped at `cap`.

### Render branches

- `authed === false` → "Sign in required" card
  with a "Back to home" link.
- `authed === null` (loading) → `ReportStepSkeleton`
  (placeholder rows; light baseline captures this).
- `authed === true` → the step's primary content
  (map / file input / category list).

### Photo-cap invariants

| Step | Cap source | Value |
|------|------------|-------|
| 1.8 photo (default) | `DEFAULT_PHOTO_CAP` constant | 3 |
| 1.8 photo (narrow category) | `category.narrowCategoryPhotoCap` | 2 (cat_streetlight) |
| 1.8 photo (narrow category, citizen bounced back from note) | same as above | re-derived on mount from draft.categoryId |
| 1.9 category (display only) | not a cap surface | — |

The cap is applied at the **photo step**, not
the category step. The category step is a
display-only surface; the photo step is where
the cap is enforced. A future Bolt raising the
default to 4 only changes `DEFAULT_PHOTO_CAP`
in `app/report/photo/page.tsx`.

### Geofence (G1) value object

```ts
interface GeofenceBbox {
  southLat: number;
  northLat: number;
  westLng: number;
  eastLng: number;
}

function inGeofence(lat: number, lng: number, bbox: GeofenceBbox): boolean {
  return lat >= bbox.southLat && lat <= bbox.northLat &&
         lng >= bbox.westLng  && lng <= bbox.eastLng;
}
```

The polygon is read from the bootstrap response
when present (a new optional field
`ward.polygonGeoJson: GeoJSON.Polygon | null`,
added by 3b). The polygon is reduced to its
bounding box (`@turf/bbox` is **not** a
dependency; the reduction is 4 lines of JS).
When `ward.polygonGeoJson` is `null` or
absent, the location page falls back to the
`DHAKA_NORTH_BBOX` constant.

## Layer-by-layer checklist (for the Construction Agent)

- [ ] The geofence check is a pure function
  (`inGeofence(lat, lng, bbox)`) so it can be
  unit-tested without a map.
- [ ] The `cap` re-derivation at the photo step
  reads `draft.categoryId` first; if the draft
  has a category set, the cap narrows to
  `category.narrowCategoryPhotoCap`.
- [ ] The bootstrap response shape is **not**
  changed in 3a; the polygon field (if any) is
  added by 3b in a backwards-compatible way.
- [ ] The 3 PNGs are committed under
  `tests-mockups/baselines/07-*.spec.ts/` with
  the names
  `report-location-1440x900.png`,
  `report-photo-1440x900.png`, and
  `report-category-1440x900.png`.

## Bolt Decision (technical addenda)

In addition to the Bolt Decision recorded in
`./bolt.md`:

- **No new `lib/` module for the G1 helper**. The
  `inGeofence` function is a 4-line check that
  lives inline in `app/report/location/page.tsx`;
  a v1.1 Bolt that adds a real polygon check
  can extract the helper to
  `lib/platform/geofence.ts` when the second
  city lands.
- **The photo step's cap re-derivation is
  client-side only**. The server's
  `CreateTicketInput` schema allows up to 5
  photoUrls (`z.array(z.string().url()).max(5)`);
  the cap is enforced at the upload UX, not at
  the API. A future Bolt raising the cap does
  not need to touch the API.

## Cross-references

- **bolt.md**: `./bolt.md`.
- **ddd-01 (parent)**: `../002-003-submit-report-flow/ddd-01-domain-model.md`.
- **Sibling 3b**: `../002-003b-submit-and-confirm/`.
- **Standards**:
  - `../../standards/tech-stack.md`
  - `../../standards/coding-standards.md`
  - `../../standards/api-conventions.md`
  - `../../standards/decision-index.md`
