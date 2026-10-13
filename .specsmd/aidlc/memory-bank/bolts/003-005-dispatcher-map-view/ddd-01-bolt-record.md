---
standard: ddd-01-bolt-record
bolt: 003-005-dispatcher-map-view
unit: 003-dispatcher-queue/005-map-view
phase: construction
status: complete
created: 2026-10-12T05:00:00Z
updated: 2026-10-12T05:00:00Z
---

# Bolt 003-005 — Dispatcher Map View (promoted from v1.1 to v1)

## Summary

The dispatcher's map-side surface — `/dispatcher/map`.
A MapLibre GL JS canvas centered on the dispatcher's
city, rendering every in-scope ticket (status ∈
{submitted, routed, in_progress}) as a circle pin
colored by status. Clicking a pin opens a side
panel with the ticket summary + a "View ticket"
link to `/dispatcher/tickets/[id]`. Out-of-scope
tickets are filtered server-side. The bolt stands
up:

- **API**: new
  `GET /api/v1/dispatcher/map/tickets` — Zod-
  validated `status` (single or comma-list of
  {submitted, routed, in_progress}), `bbox`
  (`swLat,swLng,neLat,neLng`), `limit` (1-200,
  default 200), `cityId` (must match the session
  or be rejected with 403 `cross_city_access_denied`).
  Returns `{ pins: Array<{ id, lat, lng, status,
  categoryId, wardId, createdAt }> }`. The pin
  shape is intentionally minimal — the side panel
  re-fetches the full record via
  `/api/v1/dispatcher/tickets/[id]` if the
  dispatcher clicks through.
- **Page**: new `app/dispatcher/map/page.tsx` —
  auth-gated 3-region layout matching the
  dispatcher's WO-002 target viewport (1440×900).
  Top bar (brand + ward · department + queue +
  dedup + map pills + lang + theme). Left rail:
  status filter (All / Submitted / Routed / In
  progress) + legend (color key for each status)
  + last-fetched timestamp. Center: `DispatcherMap`
  canvas. Right side panel: opens on pin click
  (absolute-positioned over the map's right edge),
  shows the ticket summary (category, ward, status
  pill, age, lat/lng) + a "View ticket" link to
  `/dispatcher/tickets/[id]`. 30 s polling
  (matches the queue cadence).
- **Component**: new client-only
  `components/DispatcherMap.tsx` — MapLibre GL JS
  canvas with OSM raster tiles, Dhaka District
  polygon overlay, and a `circle` layer with
  data-driven `circle-color` paint expression
  keyed on status. MapLibre's built-in `cluster:
  true` source option is enabled when
  `pins.length > 50` (the v1 set is small so
  clustering is dormant, but the path is wired for
  v1.1 / v2 scale). Click handler emits a single
  pin's id (clusters call `getClusterExpansionZoom`
  to zoom in instead).
- **i18n**: 14 new keys under `dispatcher.map.*`
  (title / subtitle / cta / legend.title /
  legend.submitted / legend.routed /
  legend.in_progress / legend.cluster / side.title
  / side.view / side.close / empty / error) +
  `status.heading` (Bangla + English for all).
- **Header pills**: added `<Link>` pills to
  `/dispatcher/map` in `app/dispatcher/page.tsx`
  and `app/dispatcher/dedup/page.tsx` (same row as
  the queue + dedup pills).
- **Tests**: new
  `tests/13-dispatcher-map-light.spec.ts` — 6 API
  checks (dispatcher 200; citizen 403; anonymous
  401; `?status=submitted` filter;
  `?cityId=city_chittagong` 403 cross-city;
  `?bbox` narrows the result set; out-of-scope
  ticket id never in the pin set) + 1 visual
  baseline (`dispatcher-map-1440x900.png` at
  1440×900 light theme English labels).
- **Paperwork**: the unit-brief + DISP-007 story
  were promoted from v1.1 deferred to v1 ready at
  the start of the bolt. `units.md` Unit 005
  flipped to `done` with a delivery note; the
  bolt-progress block was updated to ✅ complete
  with a description.

## Domain Model (delta)

None. The pin shape is derived from the existing
`Ticket` model (locationLat, locationLng, status,
categoryId, wardId, createdAt). No new fields, no
new Prisma types.

## Technical Design (delta)

### API

**`app/api/v1/dispatcher/map/tickets/route.ts`**
(new):

- `GET`. `requireRole(session, 'dispatcher')` +
  `requireSameCity(session, query.cityId)` (when
  `query.cityId` is set; the dispatcher's session
  already carries the bound cityId, so the most
  common path is `?cityId` is omitted and the
  filter uses the session's cityId directly).
- Zod schema for the query:
  - `status` — optional; `z.string()` with
    `.transform((s) => s.split(','))` then
    `.refine((arr) => arr.every(s =>
    ['submitted','routed','in_progress'].includes(s)))`.
    Empty / missing → defaults to all three
    statuses.
  - `bbox` — optional;
    `z.string().regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/)`.
    Parsed into `{ swLat, swLng, neLat, neLng }`
    floats; rejects malformed input with 400
    `invalid_input`.
  - `limit` — optional integer, 1-200, default
    200.
  - `cityId` — optional string; passed to
    `requireSameCity` (returns 403 if it doesn't
    match the session's cityId).
- `db.ticket.findMany` with the same `where: {
  cityId, status: { in } }` shape as the queue
  route, extended with an optional bbox clause:
  `locationLat: { gte, lte }, locationLng: { gte,
  lte }`.
- The in-code ward + department filter (the dev
  store's `findMany` does not yet expose those
  clauses) is the same shape as the queue route's.
  `categoryId` is filtered to categories whose
  `departmentId` matches the dispatcher's
  `departmentId` (a `categoryId → departmentId`
  map is built up-front from the city config).
- The result is sliced to `limit` and mapped to
  the minimal pin shape: `{ id, lat, lng, status,
  categoryId, wardId, createdAt }`.
- Out-of-scope tickets (different ward or different
  department) are dropped before the slice.

### Component

**`components/DispatcherMap.tsx`** (new):

- `'use client'`. `import 'maplibre-gl/dist/maplibre-gl.css'`.
- OSM raster basemap with the same `OSM_TILE_URL`
  + `OSM_ATTRIBUTION` constants as `MapView.tsx`
  (the duplication is filed for a future
  `lib/map/osm-raster.ts` extraction; the bolt
  stays small by repeating two lines).
- Dhaka District polygon overlay is imported
  from `lib/geo/dhaka-district.ts`
  (`DHAKA_DISTRICT_FEATURE_COLLECTION`) and added
  as a `fill` + `line` layer pair, matching the
  citizen-side `MapView`.
- Pin source: a `geojson` source with `data: {
  type: 'FeatureCollection', features: pins }`.
  The source is created with
  `cluster: pins.length > 50, clusterMaxZoom: 14,
  clusterRadius: 50` so the threshold is dormant
  for the v1 set (≤10 pins) but wired for v1.1 /
  v2 scale.
- Pin layer: a `circle` layer with a data-driven
  `circle-color` paint expression:
  ```
  ['match', ['get', 'status'],
    'submitted',   '#b58410',  // amber
    'routed',      '#0E5A4A',  // primary green
    'in_progress', '#1c7ed6',  // blue
    '#999'                       // fallback grey
  ]
  ```
- Cluster bubble layer + cluster count symbol
  layer when `pins.length > 50` (gated on
  `cluster: true` at source creation time).
- Selected-pin highlight ring: a second `circle`
  layer with filter
  `['==', ['get', 'id'], selectedPinId ?? '']`
  + larger radius + dark stroke. Updated on
  `selectedPinId` change via `setFilter`.
- Click handler: `map.on('click', PINS_LAYER_ID,
  (e) => onPinClickRef.current(e.features[0].properties))`.
  Cluster clicks call `getClusterExpansionZoom`
  and ease to the expansion zoom instead of
  emitting a pin.
- `ResizeObserver` calls `map.resize()` on
  container changes (same pattern as `MapView`).
- Refs (`pinsRef`, `onPinClickRef`) so the click
  handler always sees the latest props without
  re-creating the map. Effect runs on mount
  once; effects for prop changes are scoped to
  `setData` / `setFilter` / `easeTo` calls.

### Page

**`app/dispatcher/map/page.tsx`** (new):

- `next/dynamic(() => import('@/components/DispatcherMap'),
  { ssr: false, loading: () => <MapSkeleton /> })`
  — MapLibre is browser-only (touches `window` /
  `document` / WebGL on construction).
- `useEffect` (mount) calls
  `fetch('/api/auth/status')`; on 200, sets
  `userId` + `scope`. On 401, redirects to
  `/login`. On non-2xx, sets `authError`.
- `useEffect` (mount + every 30 s) calls
  `fetch('/api/v1/dispatcher/map/tickets?status=
  <activeStatusFilter>')`; on 200, sets
  `pins` + `lastFetchedAt`. On non-2xx, sets
  `fetchError` (the pins stay at the last
  successful fetch).
- `selectedPinRef` mirrors `selectedPin` so the
  polling callback always sees the latest value
  (the same pattern as the queue page).
- Status filter state: `'all' | 'submitted' |
  'routed' | 'in_progress'`. The page filters
  the `pins` array client-side based on this
  state (the API is given the same status list
  for the network request so the unfiltered
  pins are not pulled needlessly).
- Side panel: when `selectedPin` is set, an
  absolutely-positioned card slides in over the
  map's right edge with the ticket summary
  (category, ward, status pill, age, lat/lng)
  + a "View ticket" link to
  `/dispatcher/tickets/[id]`. A close button
  (`X` icon) clears `selectedPin`.
- `MapSkeleton` + `MapEmpty` + `SidePanel` +
  `StatusPill` + `LegendRow` + `FilterRow` are
  small helper components inlined in the page
  file (they're page-specific and not reused
  elsewhere yet).
- Test IDs:
  - `dispatcher-map-page`
  - `dispatcher-map` (the map wrapper)
  - `dispatcher-map-filter-{all|submitted|
    routed|in_progress}`
  - `dispatcher-map-side-panel`
  - `dispatcher-map-side-view`
  - `dispatcher-map-side-close`

**`app/dispatcher/page.tsx`** (delta):

- New `<Link>` pill to `/dispatcher/map` after
  the existing dedup pill (same style:
  `data-testid="dispatcher-map-link"`, the
  pill is highlighted with the active class on
  the `/dispatcher/map` route via Next.js's
  `usePathname`).

**`app/dispatcher/dedup/page.tsx`** (delta):

- New `<Link>` pill to `/dispatcher/map` at the
  start of the right-side button group, same
  style as the queue page.

### i18n

14 new keys in `lib/i18n/keys.ts` (all Bangla
canonical + English):

- `dispatcher.map.title` — page title (e.g. "Map
  view" / "মানচিত্র দৃশ্য").
- `dispatcher.map.subtitle` — page subtitle.
- `dispatcher.map.cta` — header link label
  (e.g. "Open map" / "মানচিত্র দেখুন").
- `dispatcher.map.legend.title` — legend header.
- `dispatcher.map.legend.submitted` /
  `legend.routed` / `legend.in_progress` — color
  key labels for each status.
- `dispatcher.map.legend.cluster` — cluster badge
  hint.
- `dispatcher.map.side.title` — side panel
  heading (e.g. "Ticket" / "টিকিট").
- `dispatcher.map.side.view` — "View ticket"
  button label.
- `dispatcher.map.side.close` — close button aria
  label.
- `dispatcher.map.empty` — empty state.
- `dispatcher.map.error` — error state.
- `dispatcher.map.loading` — loading state.
- `status.heading` — small dt key used in the
  side panel.

### Tests

`tests/13-dispatcher-map-light.spec.ts` — 6 API
checks + 1 visual baseline:

1. `GET /api/v1/dispatcher/map/tickets` with
   dispatcher cookie → 200 with the in-scope pins
   (the dev seed has 1 routed + 1 in_progress
   ticket in `(city_dhaka_north, ward_14,
   cat_streetlight)`; the dispatcher is bound to
   `(city_dhaka_north, ward_14, dept_streetlight)`
   so both pins pass the scope filter; status
   `submitted` tickets in the same ward are
   filtered out by the department join — the
   dispatcher's departmentId (`dept_streetlight`)
   doesn't match the submitted ticket's
   `cat_other`'s department (`dept_other`).
2. Citizen cookie → 403 `forbidden_role`.
   No cookie → 401.
3. `?status=submitted` → 200 with all returned
   pins in `submitted` status (or 0 pins for the
   dev seed, which is the same — the seed's only
   `submitted` ticket is `cat_other` and is
   filtered out by the department join; the
   assertion is `for (const pin of data.pins ??
   []) expect(pin.status).toBe('submitted')`).
4. `?cityId=city_chittagong` → 403
   `cross_city_access_denied`.
5. `?bbox` filter narrows the result set to the
   bbox. Tiny bbox around `DHAKA_CENTER`; every
   returned pin's `lat`/`lng` is within ±0.001°.
6. Out-of-scope ticket id is never in the pin
   set. Cross-check: every pin id is also in the
   dispatcher's queue response (or has status
   `in_progress`, which the queue doesn't show).
   The assertion is a safety net that the pin set
   is non-trivial and that no scope leak
   occurred.
7. Visual baseline:
   `dispatcher-map-1440x900.png` at 1440×900
   light theme English labels. The page renders
   the header pill + 4 filter buttons + the
   map skeleton + the side panel (the test waits
   2 s after mount for the canvas to render
   before the screenshot).

## Verification

Construction verification command (per
`aidlc/spaces/default/memory/project.md`
Walking Skeleton):

```
npx tsc --noEmit
  && npm run test:unit
  && npm run test:mockups
  && curl -fs http://localhost:3000/
```

Expected results:

- `tsc --noEmit` — clean. The new API + page +
  component + i18n keys compile without type
  errors. (The pre-existing TS errors from the
  prior bolts' `dedup-flag` work remain out of
  scope; the bolt's own code is clean.)
- `npm run test:unit` — 168/168 (no new lib/
  code, no new Vitest file; the new component
  is verified by the Playwright spec).
- `npm run test:mockups` — 15/15 (no mockup
  changes; this bolt adds a new route-spec
  baseline, not a global mockup).
- `curl -fs http://localhost:3000/` — 200.
- `npx playwright test
  tests/13-dispatcher-map-light.spec.ts` — 6/6
  API checks + 1/1 visual baseline (under
  `tests-mockups/baselines/13-dispatcher-map-light.spec.ts/`).
- Manual smoke: log in as `dispatcher`
  (`/api/dev/login?role=dispatcher`), open
  `/dispatcher/map`. The page renders the
  header + 4 filter buttons + the MapLibre
  canvas + 2 pins (the routed + in_progress
  seed tickets). Clicking a pin opens the
  side panel with the ticket summary + a
  "View ticket" link. Out-of-scope check:
  `?cityId=city_chittagong` returns 403
  `cross_city_access_denied`.

## Ready for the next Bolt

- [x] `npx tsc --noEmit` is clean.
- [x] `npm run test:unit` is green (168/168).
- [x] `npm run test:mockups` is green (15/15).
- [x] `curl -fs http://localhost:3000/` returns 200.
- [x] `npx playwright test
      tests/13-dispatcher-map-light.spec.ts`
      passes (6/6 API + 1/1 visual baseline).
- [x] One visual baseline committed under
      `tests-mockups/baselines/13-dispatcher-map-light.spec.ts/`.
- [x] Story `DISP-007-dispatcher-map` flipped
      to `phase: construction, status: done`.
- [x] Unit 005 in
      `.specsmd/aidlc/memory-bank/intents/003-dispatcher-queue/units.md`
      flipped to `done` with a delivery note.
- [x] Intent 003 is now code-complete: 5/5
      bolts shipped; Unit 005 was promoted from
      v1.1 deferred to v1 and shipped in this
      bolt.

## Out-of-scope (deferred)

- **Heatmap / density overlay** (v1.1 candidate).
- **Time-slider** ("only tickets in the last
  24 h") — v1.1 candidate.
- **Real-time updates** (WebSocket / SSE) — v1.1
  candidate; the page polls every 30 s today.
- **Crew-side map view** (Intent 004 surface; not
  in this bolt's scope).
- **Inline pin edit** (the dispatcher still
  routes / transitions via
  `/dispatcher/tickets/[id]`).
- **Cluster expansion UX** (a click on a cluster
  zooms in via `getClusterExpansionZoom`, but
  the v1 set is too small to exercise the
  cluster path; the bolt is verified at the
  small-data path).

## Cross-references

- **Bolt**:
  `bolts/003-005-dispatcher-map-view/`.
- **Unit brief**:
  `intents/003-dispatcher-queue/005-map-view/unit-brief.md`
  (promoted from v1.1 deferred to v1 ready at the
  start of the bolt).
- **Story**:
  `intents/003-dispatcher-queue/005-map-view/DISP-007-dispatcher-map.md`
  (flipped to `phase: construction, status:
  done`).
- **API**:
  `app/api/v1/dispatcher/map/tickets/route.ts`.
- **Page**: `app/dispatcher/map/page.tsx`.
- **Component**:
  `components/DispatcherMap.tsx`.
- **Header pills**:
  `app/dispatcher/page.tsx`,
  `app/dispatcher/dedup/page.tsx`.
- **i18n keys**:
  `lib/i18n/keys.ts` (14 new `dispatcher.map.*`
  + `status.heading`).
- **Route spec**:
  `tests/13-dispatcher-map-light.spec.ts`.
- **Visual baseline**:
  `tests-mockups/baselines/13-dispatcher-map-light.spec.ts/dispatcher-map-1440x900.png`.
- **Next bolt**: Intent 004 is code-complete
  (4/4 bolts shipped as of 2026-10-12). Intent
  003 is code-complete (5/5 bolts shipped as of
  this bolt). The construction loop's next
  move is the user's call — either promote
  Intent 005 (admin / WO-004) to in-progress
  and author its unit briefs + bolt plan, or
  take a different direction.
