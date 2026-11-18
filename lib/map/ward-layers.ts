/**
 * Ward boundary layers for MapLibre (lib/map/ward-layers.ts).
 *
 * The ward mosaic — one filled, outlined polygon per ward, plus a
 * numbered disc at a point verified to lie inside its ward — was
 * originally written inline in `components/MapView.tsx`, where it
 * served only the citizen's report-location step.
 *
 * The staff surfaces need the same mosaic: a dispatcher looking at a
 * map of pins needs to see WHICH WARD each pin belongs to, otherwise
 * "reassign to Ward 19" is an act of faith. Rather than copy ~180
 * lines of layer definitions into each staff map — where every copy
 * would be a place for the silent rendering failures documented in
 * `feedback_maplibre_client_only_patterns` to creep in — the layer
 * definitions live here and every map builds the identical layers.
 *
 * WHY A SEPARATE MODULE
 * ---------------------
 * MapLibre layer ids are GLOBAL PER MAP INSTANCE, and the ward layer
 * ids below are used by the report map, the dispatcher map and the
 * activity map. Sharing the constants means:
 *
 *   1. The `getLayoutProperty('ward-labels-label', ...)` probe in
 *      `tests/08-report-location-map-light.spec.ts` keeps working
 *      unchanged, and
 *   2. A future map can add the ward mosaic with one call rather
 *      than re-deriving the paint properties.
 *
 * THE SILENT-FAILURE TRAPS (all learned the hard way)
 * ----------------------------------------------------
 *   1. NO GLYPHS ENDPOINT → no `text-field` renders. The caller
 *      MUST declare `glyphs: GLYPHS_URL` in the map style.
 *   2. `text-offset` IS IN EMS, not pixels. `circle-translate` IS
 *      in pixels. Mixing them up throws the text off-screen and the
 *      layer renders NOTHING — no error.
 *   3. `['concat', '#', ['to-string', ['get', 'wardNumber']]]`
 *      renders NO GLYPHS. The ward label is precomputed as a string
 *      property (`wardLabel: '#14'`) and read with `['get',
 *      'wardLabel']`.
 *   4. MapLibre paints layers in INSERTION ORDER. The halo must be
 *      added before the boundary line, and the labels last.
 *   5. A `maplibregl.Marker` is a DOM element that paints OVER the
 *      whole WebGL canvas, so the active ward's label — which sits
 *      at the pin's own coordinate — is hidden unless it is offset
 *      clear of the pin.
 */

import type {
  GeoJSONSource,
  FilterSpecification,
  Map as MaplibreMap,
} from 'maplibre-gl';
import {
  interiorPoint,
  type WardBoundary,
} from '@/lib/geo/ward-lookup';
import { SYMBOL_FONT } from '@/lib/map/osm-raster';
import { MAP_PRIMARY_COLOR } from '@/lib/ui/map-colors';

export const WARD_SOURCE_ID = 'ward-boundaries';
export const WARD_FILL_LAYER_ID = 'ward-boundaries-fill';
export const WARD_LINE_LAYER_ID = 'ward-boundaries-line';
export const WARD_HALO_LAYER_ID = 'ward-boundaries-halo';
export const WARD_ACTIVE_FILL_LAYER_ID = 'ward-boundaries-active-fill';
export const WARD_ACTIVE_LINE_LAYER_ID = 'ward-boundaries-active-line';
export const WARD_LABEL_SOURCE_ID = 'ward-labels';
export const WARD_LABEL_LAYER_ID = 'ward-labels-label';
export const WARD_LABEL_DISC_LAYER_ID = 'ward-labels-label-disc';
export const WARD_ACTIVE_LABEL_LAYER_ID = 'ward-labels-active-label';
export const WARD_ACTIVE_LABEL_DISC_LAYER_ID = 'ward-labels-active-label-disc';

/**
 * How far UPWARD, in pixels, the active ward's label is drawn
 * from its anchor point.
 *
 * The active ward's label point IS the pin's position, and the
 * pin is a DOM marker that paints over the whole WebGL canvas.
 * Without this offset the active ward's number is invisible —
 * hidden under the pin it labels. 34px clears the pin's 28px
 * box plus its 3px white border.
 */
export const ACTIVE_LABEL_OFFSET_Y = -34;

/**
 * The active label's `text-size`.
 *
 * `text-offset` is measured in EM, not pixels: a value of `-34`
 * with a `text-size` of 15 throws the text 510px off-screen,
 * which is how the label went from "hidden behind the pin" to
 * "not rendered at all" without any visible error. The offset is
 * therefore divided by the text size to convert the pixel
 * distance into ems.
 */
export const ACTIVE_LABEL_TEXT_SIZE = 15;

/**
 * Build the ward POLYGONS — one feature per ward.
 *
 * Each ward becomes ONE feature whose geometry is a
 * `MultiPolygon` when the ward has more than one ring
 * (wards 16 and 32 in the DNCC data are split into two
 * disjoint parts) and a `Polygon` otherwise. A single
 * feature per ward keeps the `wardId` property — and
 * therefore the active-ward `filter` — unambiguous.
 *
 * `wardId` is carried as a string property so the
 * MapLibre expression `['get', 'wardId']` can compare
 * against it directly.
 */
export function buildWardFeatureCollection(
  boundaries: readonly WardBoundary[],
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const boundary of boundaries) {
    if (boundary.rings.length === 0) continue;
    const polygons: GeoJSON.Position[][] = boundary.rings.map((ring) => [
      ...ring,
      ring[0],
    ]);
    const geometry: GeoJSON.Geometry =
      polygons.length === 1
        ? { type: 'Polygon', coordinates: polygons }
        : { type: 'MultiPolygon', coordinates: polygons.map((p) => [p]) };
    features.push({
      type: 'Feature',
      properties: {
        wardId: boundary.id,
        wardNumber: boundary.number,
        wardName: boundary.name,
      },
      geometry,
    });
  }
  return { type: 'FeatureCollection', features };
}

/**
 * Build the ward-number LABEL points — one point per ward,
 * placed at a location verified to be inside that ward.
 *
 * `interiorPoint` (lib/geo/ward-lookup.ts) tries the ward's
 * area centroid first and falls back to a ring vertex, so the
 * returned point is guaranteed to lie within the ward's own
 * outline. That guarantee is the whole reason this is a
 * separate point source rather than a `text-field` on the
 * polygon layer: MapLibre's own polygon-label placement uses
 * the polygon's centroid, which for a concave ward can sit
 * outside it, and a label floating in the wrong ward is
 * worse than no label.
 *
 * A ward with no usable interior point is skipped — the label
 * is a nicety, and a missing label must never break the map.
 */
export function buildWardLabelCollection(
  boundaries: readonly WardBoundary[],
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const boundary of boundaries) {
    const point = interiorPoint(boundary);
    if (!point) continue;
    features.push({
      type: 'Feature',
      properties: {
        wardId: boundary.id,
        wardNumber: boundary.number,
        // The rendered text, precomputed as a STRING.
        //
        // The `text-field` used to be
        //   ['concat', '#', ['to-string', ['get', 'wardNumber']]]
        // which produced NO visible text at all: the disc rendered
        // but the number inside it did not. A plain
        // `['get', 'wardLabel']` — the pattern the activity map's
        // numbered pins already use successfully — renders.
        wardLabel: `#${boundary.number}`,
      },
      geometry: { type: 'Point', coordinates: [point.lng, point.lat] },
    });
  }
  return { type: 'FeatureCollection', features };
}

/**
 * Add the ward mosaic to a map.
 *
 * The caller must have already:
 *   - declared `glyphs: GLYPHS_URL` in the map style, and
 *   - waited for the map's `load` event.
 *
 * The layers are added BELOW anything the caller adds afterwards,
 * so a caller's own pins and districts still paint on top. The
 * `wardBoundaries` may be EMPTY — the layers are then simply
 * empty, and `updateWardLayers` will fill them in when the
 * geojson fetch resolves.
 *
 * @param activeWardId the ward to highlight; `null` highlights none.
 */
export function addWardLayers(
  map: MaplibreMap,
  boundaries: readonly WardBoundary[],
  activeWardId: string | null = null,
): void {
  if (map.getSource(WARD_SOURCE_ID)) return;

  map.addSource(WARD_SOURCE_ID, {
    type: 'geojson',
    data: buildWardFeatureCollection(boundaries),
  });

  // The fill: a translucent wash so the basemap shows through.
  map.addLayer({
    id: WARD_FILL_LAYER_ID,
    type: 'fill',
    source: WARD_SOURCE_ID,
    paint: {
      'fill-color': MAP_PRIMARY_COLOR,
      // 0.1 was too faint to separate the sections from the
      // OSM raster. At 0.18 the ward mosaic reads as a set
      // of tinted cells while the basemap still shows
      // through — two stacked translucent washes (this fill
      // and the district's) would wash the map out, which
      // is why the district fill is suppressed below.
      'fill-opacity': 0.18,
    },
  });

  // The HALO: a white line under the boundary line.
  //
  // A 2px blue line at 0.8 opacity still disappears where it
  // crosses a dark or saturated OSM feature (a road casing,
  // a water body, a building block). Drawing a wider
  // near-white line FIRST gives the boundary a light
  // backing, so the blue always has contrast to sit on.
  // MapLibre paints layers in insertion order, so the halo
  // must be added before the boundary line.
  map.addLayer({
    id: WARD_HALO_LAYER_ID,
    type: 'line',
    source: WARD_SOURCE_ID,
    paint: {
      'line-color': '#FFFFFF',
      'line-width': 3.5,
      'line-opacity': 0.75,
    },
  });

  map.addLayer({
    id: WARD_LINE_LAYER_ID,
    type: 'line',
    source: WARD_SOURCE_ID,
    paint: {
      'line-color': MAP_PRIMARY_COLOR,
      'line-width': 1.8,
      'line-opacity': 0.9,
    },
  });

  // The ward containing the pin gets a stronger fill
  // and a solid outline so the citizen can see which
  // section their report will go to.
  const activeFilter: FilterSpecification = [
    '==',
    ['get', 'wardId'],
    activeWardId ?? '',
  ];
  map.addLayer({
    id: WARD_ACTIVE_FILL_LAYER_ID,
    type: 'fill',
    source: WARD_SOURCE_ID,
    filter: activeFilter,
    paint: {
      'fill-color': MAP_PRIMARY_COLOR,
      'fill-opacity': 0.34,
    },
  });
  map.addLayer({
    id: WARD_ACTIVE_LINE_LAYER_ID,
    type: 'line',
    source: WARD_SOURCE_ID,
    filter: activeFilter,
    paint: {
      'line-color': MAP_PRIMARY_COLOR,
      'line-width': 3,
      'line-opacity': 1,
    },
  });

  // The ward-number LABELS.
  //
  // Added LAST so the text paints over every fill and
  // line. The label is the ward's NUMBER, prefixed with
  // the "#" so it reads as an identifier rather than a
  // stray digit on the map (the same treatment the
  // ticket codes use).
  //
  // The label is drawn in white on a dark blue disc, which
  // keeps it legible over both the pale ward fill and the
  // busy OSM raster underneath. The disc is a `circle`
  // layer paired with the `symbol` layer — the same
  // pattern the activity map uses for its numbered pins.
  map.addSource(WARD_LABEL_SOURCE_ID, {
    type: 'geojson',
    data: buildWardLabelCollection(boundaries),
  });
  map.addLayer({
    id: WARD_LABEL_DISC_LAYER_ID,
    type: 'circle',
    source: WARD_LABEL_SOURCE_ID,
    paint: {
      'circle-color': MAP_PRIMARY_COLOR,
      'circle-radius': 14,
      'circle-stroke-width': 2.5,
      'circle-stroke-color': '#FFFFFF',
    },
  });
  map.addLayer({
    id: WARD_LABEL_LAYER_ID,
    type: 'symbol',
    source: WARD_LABEL_SOURCE_ID,
    layout: {
      'text-field': ['get', 'wardLabel'],
      'text-size': 13,
      'text-font': [...SYMBOL_FONT],
      // The label must NOT wrap or shrink: `text-max-width`
      // on a two- or three-character ward number squeezes the
      // glyphs until they are unreadable. The disc is
      // sized to fit the widest case ("#54") instead.
      'text-allow-overlap': true,
      'text-justify': 'center',
      'text-anchor': 'center',
    },
    paint: {
      'text-color': '#FFFFFF',
    },
  });

  // The ACTIVE ward's label, drawn larger and in the
  // accent colour so the citizen can pick their own
  // section out of the mosaic at a glance.
  //
  // WHY IT IS OFFSET UPWARD
  // ------------------------
  // The active ward is, by definition, the ward the pin
  // is in — so its label point and the pin are at the SAME
  // coordinate. The pin is a `maplibregl.Marker`, which
  // renders as a DOM element ABOVE the entire WebGL
  // canvas. A label drawn at that coordinate is therefore
  // never visible: the pin (28px) covers the disc (34px
  // across) completely. The active ward's number — the
  // one number the citizen most needs — was invisible.
  //
  // `circle-translate` moves the disc in PIXELS;
  // `text-offset` moves the text in EMS. The two are
  // converted from the same pixel distance so the disc and
  // its number stay aligned. The offset clears the pin's
  // 28px box plus its 3px border with room to spare.
  map.addLayer({
    id: WARD_ACTIVE_LABEL_DISC_LAYER_ID,
    type: 'circle',
    source: WARD_LABEL_SOURCE_ID,
    filter: activeFilter,
    paint: {
      'circle-color': '#FFFFFF',
      'circle-radius': 17,
      'circle-stroke-width': 3.5,
      'circle-stroke-color': MAP_PRIMARY_COLOR,
      'circle-translate': [0, ACTIVE_LABEL_OFFSET_Y],
    },
  });
  map.addLayer({
    id: WARD_ACTIVE_LABEL_LAYER_ID,
    type: 'symbol',
    source: WARD_LABEL_SOURCE_ID,
    filter: activeFilter,
    layout: {
      'text-field': ['get', 'wardLabel'],
      'text-size': ACTIVE_LABEL_TEXT_SIZE,
      'text-font': [...SYMBOL_FONT],
      'text-allow-overlap': true,
      'text-justify': 'center',
      'text-anchor': 'center',
      // EMs, not pixels — see ACTIVE_LABEL_TEXT_SIZE.
      'text-offset': [0, ACTIVE_LABEL_OFFSET_Y / ACTIVE_LABEL_TEXT_SIZE],
    },
    paint: {
      'text-color': MAP_PRIMARY_COLOR,
    },
  });
}

/**
 * Push new ward data into a map that already has the ward layers.
 *
 * The geojson fetch resolves AFTER the map's `load` event, so the
 * layers are frequently created from an EMPTY boundary list. This
 * is the re-push that fills them in. Both the polygon source and
 * the label source must be updated — a polygon without its label
 * point is a mosaic with no numbers.
 *
 * A no-op when the map has no ward layers yet.
 */
export function updateWardLayers(
  map: MaplibreMap,
  boundaries: readonly WardBoundary[],
): void {
  const source = map.getSource(WARD_SOURCE_ID) as
    | GeoJSONSource
    | undefined;
  if (source) {
    source.setData(buildWardFeatureCollection(boundaries));
  }
  const labelSource = map.getSource(WARD_LABEL_SOURCE_ID) as
    | GeoJSONSource
    | undefined;
  if (labelSource) {
    labelSource.setData(buildWardLabelCollection(boundaries));
  }
}

/**
 * Highlight a different ward.
 *
 * Used when the active ward changes without the ward DATA changing
 * — the citizen drags the pin from one ward to another. The filter
 * on the active layers is rewritten; the layers themselves are
 * untouched.
 */
export function setActiveWard(
  map: MaplibreMap,
  activeWardId: string | null,
): void {
  const filter: FilterSpecification = [
    '==',
    ['get', 'wardId'],
    activeWardId ?? '',
  ];
  for (const layerId of [
    WARD_ACTIVE_FILL_LAYER_ID,
    WARD_ACTIVE_LINE_LAYER_ID,
    WARD_ACTIVE_LABEL_DISC_LAYER_ID,
    WARD_ACTIVE_LABEL_LAYER_ID,
  ]) {
    if (map.getLayer(layerId)) {
      map.setFilter(layerId, filter);
    }
  }
}
