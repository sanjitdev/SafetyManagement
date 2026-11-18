/**
 * Vitest: the ward mosaic is SHARED, not copied.
 *
 * ## Why this test exists
 *
 * The ward mosaic — one filled, outlined polygon per ward, with the
 * ward's NUMBER on a disc — was originally written inline in
 * `components/MapView.tsx`, serving only the citizen's report
 * location step. The staff maps needed it too (a dispatcher cannot
 * see which WARD a pin is in without the ward sections on screen),
 * and the obvious way to add it is to copy the ~180 lines of layer
 * definitions into `DispatcherMap.tsx` and `CityActivityMap.tsx`.
 *
 * That would be a mistake. These layers fail SILENTLY: the report
 * map's ward-number labels were invisible for a long time because
 * the `text-field` was a `concat` expression that produced no
 * glyphs, and the label offset was in pixels when MapLibre wanted
 * ems. No error, no typecheck failure, no lint error — just a
 * missing number on the map. Six copies would be six places for
 * that to happen independently.
 *
 * So the definitions live in ONE place —
 * `lib/map/ward-layers.ts` — and every map calls the same
 * `addWardLayers` / `updateWardLayers`. This test pins that: if
 * someone re-inlines a layer definition into a map component, the
 * copy fails the build.
 *
 * These are SOURCE-level assertions, in the same style as
 * `ward-aware-location-regression.test.ts`. The RENDERED behaviour is
 * covered by `tests/37-staff-ward-layers.spec.ts`, which asserts on
 * what MapLibre actually drew.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function read(...segments: string[]): string {
  return readFileSync(path.join(ROOT, ...segments), 'utf8');
}

const WARD_LAYERS = read('lib', 'map', 'ward-layers.ts');
const MAP_VIEW = read('components', 'MapView.tsx');
const DISPATCHER_MAP = read('components', 'DispatcherMap.tsx');
const CITY_ACTIVITY_MAP = read('components', 'CityActivityMap.tsx');

/** Every map component that must draw the ward mosaic. */
const MAP_COMPONENTS: Array<[name: string, source: string]> = [
  ['MapView (citizen report location)', MAP_VIEW],
  ['DispatcherMap (/dispatcher/map)', DISPATCHER_MAP],
  ['CityActivityMap (/dispatcher, /crew, /admin, /home)', CITY_ACTIVITY_MAP],
];

describe('the ward layers live in ONE shared module', () => {
  it('the module exports the layer builders', () => {
    expect(WARD_LAYERS).toMatch(/export function addWardLayers\(/);
    expect(WARD_LAYERS).toMatch(/export function updateWardLayers\(/);
    expect(WARD_LAYERS).toMatch(/export function setActiveWard\(/);
  });

  it('the module declares the glyph-safe label text field', () => {
    // `['concat', '#', ['to-string', ['get', 'wardNumber']]]` renders
    // NO GLYPHS — the disc appears and the number inside it does not.
    // The label must be a precomputed STRING property.
    expect(WARD_LAYERS).toMatch(/'text-field':\s*\['get',\s*'wardLabel'\]/);
    expect(WARD_LAYERS).toMatch(/wardLabel:\s*`#\$\{boundary\.number\}`/);
  });

  it('the module offsets the active label in EMS, not pixels', () => {
    // `text-offset` is in EM; `circle-translate` is in pixels. A
    // pixel value in `text-offset` is multiplied by the text size
    // and throws the label off-screen — so it renders NOTHING.
    expect(WARD_LAYERS).toMatch(
      /'text-offset':\s*\[0,\s*ACTIVE_LABEL_OFFSET_Y\s*\/\s*ACTIVE_LABEL_TEXT_SIZE\]/,
    );
    expect(WARD_LAYERS).toMatch(
      /'circle-translate':\s*\[0,\s*ACTIVE_LABEL_OFFSET_Y\]/,
    );
  });

  it('the module adds the halo BEFORE the boundary line', () => {
    // MapLibre paints layers in INSERTION ORDER, so the halo must
    // be added first or the boundary line hides it.
    const halo = WARD_LAYERS.indexOf('id: WARD_HALO_LAYER_ID');
    const line = WARD_LAYERS.indexOf('id: WARD_LINE_LAYER_ID');
    expect(halo).toBeGreaterThan(-1);
    expect(line).toBeGreaterThan(-1);
    expect(halo).toBeLessThan(line);
  });

  it('the module adds the labels AFTER the fills and lines', () => {
    const fill = WARD_LAYERS.indexOf('id: WARD_FILL_LAYER_ID');
    const label = WARD_LAYERS.indexOf('id: WARD_LABEL_LAYER_ID');
    expect(fill).toBeGreaterThan(-1);
    expect(label).toBeGreaterThan(-1);
    expect(label).toBeGreaterThan(fill);
  });
});

describe('every map uses the shared module rather than its own copy', () => {
  for (const [name, source] of MAP_COMPONENTS) {
    it(`${name} calls addWardLayers`, () => {
      expect(source).toMatch(/addWardLayers\(\s*map,\s*wardBoundaries/);
    });

    it(`${name} calls updateWardLayers`, () => {
      // The geojson fetch resolves AFTER the map's `load` event, so
      // the layers are created empty and filled in later. A map that
      // adds the layers but never re-pushes them shows NO wards.
      expect(source).toMatch(/updateWardLayers\(\s*map,\s*wardBoundaries\)/);
    });

    it(`${name} does not define its own ward layer ids`, () => {
      // A local `const WARD_SOURCE_ID = 'ward-boundaries'` would be a
      // second source of truth for the layer ids — and the two could
      // drift apart silently.
      expect(source).not.toMatch(/const\s+WARD_[A-Z_]+\s*=\s*'ward-/);
      expect(source).not.toMatch(/const\s+WARD_[A-Z_]+\s*=\s*'ward-labels'/);
    });

    it(`${name} does not inline its own ward fill or label layer`, () => {
      // The layer DEFINITIONS must not be copied in. Only the call.
      expect(source).not.toMatch(/id:\s*'ward-boundaries-fill'/);
      expect(source).not.toMatch(/id:\s*'ward-labels-label'/);
      expect(source).not.toMatch(/'text-field':\s*\['get',\s*'wardLabel'\]/);
    });
  }
});

describe('the ward geometry endpoint serves both staff and citizen callers', () => {
  const ROUTE = read(
    'app', 'api', 'cities', '[slug]', 'wards', 'geojson', 'route.ts',
  );

  it('accepts a city id as well as a slug', () => {
    // The citizen's flow knows the slug (from the report bootstrap);
    // the STAFF flows know only the session's `cityId`, and the
    // session payload carries no slug.
    expect(ROUTE).toMatch(/findUniqueBySlug/);
    expect(ROUTE).toMatch(/db\.city\.findUnique\(\s*\{\s*where:\s*\{\s*id:/);
  });

  it('resolves the id form before the slug form', () => {
    // A slug that happened to match an id would silently serve the
    // WRONG city, so the id lookup must be tried first.
    const idAt = ROUTE.indexOf("segment.startsWith('city_')");
    const slugAt = ROUTE.indexOf('findUniqueBySlug');
    expect(idAt).toBeGreaterThan(-1);
    expect(slugAt).toBeGreaterThan(-1);
    expect(idAt).toBeLessThan(slugAt);
  });

  it('stays a PUBLIC route — the staff maps must be able to read it', () => {
    // The repo has hit the "citizen-only endpoint coupling" bug
    // three times. This route must not grow a role gate.
    expect(ROUTE).not.toMatch(/requireSession/);
    expect(ROUTE).not.toMatch(/requireRole/);
  });
});
