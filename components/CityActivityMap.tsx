/**
 * City activity map shell (components/CityActivityMap.tsx).
 *
 * 1.6 Home / City Activity — the read-only multi-pin map
 * for the citizen. A MapLibre GL JS canvas centered on
 * the citizen's city, rendering every in-scope ticket
 * (status ∈ {submitted, routed, in_progress, resolved,
 * closed, cancelled}) as a circle pin colored by status.
 *
 * Supersedes the v1 SVG placeholder that the home page
 * used through Bolt 005-004. Per the standing project rules
 * (`.specsmd/aidlc/memory-bank/standards/rules/project.md`,
 * Corrections, learned 2026-10-11), the MapLibre +
 * OpenStreetMap basemap is the v1 contract for every
 * city-facing map surface; the SVG placeholder was the
 * pre-pilot fallback and is retired with this bolt.
 *
 * Reuses the same OSM raster basemap and Dhaka District
 * polygon pattern as `components/MapView.tsx` (1.7
 * location page) and `components/DispatcherMap.tsx`
 * (3.5 dispatcher map). The OSM constants (tile URL,
 * attribution, glyph endpoint, symbol font) now live in
 * `lib/map/osm-raster.ts` so all three maps share one
 * definition — see that module for why the glyph URL and
 * the font stack must be kept as a matched pair.
 *
 * Pin source: a GeoJSON source with `cluster: true` when
 * the pin set has > 50 entries. Below 50, clustering is
 * off so single pins are immediately visible.
 *
 * Pin styling: a `circle` layer with a data-driven
 * `circle-color` keyed on the `status` property. Colors
 * mirror the status pills in the activity feed (same
 * status → same color), so the side panel and the map
 * read as one consistent visual story.
 *
 * The component is `'use client'`; the parent page
 * guarantees it is only mounted on the client (the page
 * renders a loading state during SSR).
 */

'use client';

import { useEffect, useRef } from 'react';
import maplibregl, {
  type LngLatLike,
  type Map as MaplibreMap,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { DHAKA_DISTRICT_FEATURE_COLLECTION } from '@/lib/geo/dhaka-district';
import {
  GLYPHS_URL,
  OSM_ATTRIBUTION,
  OSM_TILE_URL,
  SYMBOL_FONT,
} from '@/lib/map/osm-raster';
import { MAP_PRIMARY_COLOR, MAP_STATUS_COLORS } from '@/lib/ui/map-colors';

export type CityActivityStatus =
  | 'submitted'
  | 'routed'
  | 'in_progress'
  | 'resolved'
  | 'closed'
  | 'cancelled';

export interface CityActivityPin {
  id: string;
  lat: number;
  lng: number;
  status: CityActivityStatus;
  /**
   * Optional short label rendered INSIDE the pin (the crew
   * dashboard's numbered pins: "1", "2", "3"). When absent the pin
   * is a plain status-coloured circle.
   */
  label?: string | null;
}

interface CityActivityMapProps {
  pins: CityActivityPin[];
  center: { lat: number; lng: number };
  pinColors?: Partial<Record<CityActivityStatus, string>>;
  /**
   * When true, pins that carry a `label` render that label as
   * white text inside the pin bubble.
   *
   * The crew dashboard's design specifies NUMBERED pins (a blue
   * bubble with a white "1"), which is how a job on the map is
   * cross-referenced to the numbered row in the "Today's Jobs"
   * list beside it. The citizen and dispatcher maps do NOT number
   * their pins — they are a city-wide read, not a task list — so
   * this stays opt-in and the default rendering is unchanged.
   */
  showPinLabels?: boolean;
  /**
   * When true, each pin renders as a TOOL glyph (a wrench) inside a
   * status-coloured circle instead of a plain dot.
   *
   * The crew dashboard's design draws the pins as wrench icons —
   * they mark WORK SITES, and the wrench says "this is a job to
   * do", not "this is a report to read". The citizen's city-activity
   * map keeps plain dots: there the pin marks a report, not a task.
   */
  showPinIcons?: boolean;
  /**
   * When true, each pin renders as the teardrop JOB PIN from the
   * crew dashboard's design — a soft-grey circle carrying a white
   * wrench, tapering to a point at the coordinates — instead of a
   * flat dot.
   *
   * The citizen's city-activity map keeps plain dots: there the pin
   * marks a REPORT. On the crew map it marks a WORK SITE, and the
   * pin shape plus the wrench says "a place to go and a job to do".
   */
  showPinMarkers?: boolean;
  /**
   * The crew's own position, when known. Rendered as a distinct
   * blue dot with a white ring, matching the "My Location" entry
   * in the map legend.
   *
   * The design puts the crew's position on the map with a route
   * line running from it to the jobs; without a position there is
   * no route to draw, so this and `route` are gated together.
   */
  userLocation?: { lat: number; lng: number } | null;
  /**
   * When true AND a `userLocation` is supplied, a blue route line
   * is drawn from the crew's position through the pins, in the
   * order the pins are listed.
   *
   * The design shows the day's round as a path: the crew is not
   * picking jobs at random, they are walking a route. The line is
   * the visual promise of that route.
   */
  showRoute?: boolean;
}

const DHAKA_DISTRICT_SOURCE_ID = 'dhaka-district';
const DHAKA_DISTRICT_FILL_LAYER_ID = 'dhaka-district-fill';
const DHAKA_DISTRICT_LINE_LAYER_ID = 'dhaka-district-line';

const PINS_SOURCE_ID = 'city-activity-pins';
const PINS_LAYER_ID = 'city-activity-pins-layer';
const PINS_LABEL_LAYER_ID = 'city-activity-pins-label';
const PINS_ICON_LAYER_ID = 'city-activity-pins-icon';
const PINS_MARKER_LAYER_ID = 'city-activity-pins-marker';
const PINS_CLUSTER_LAYER_ID = 'city-activity-pins-cluster';
const PINS_CLUSTER_COUNT_LAYER_ID = 'city-activity-pins-cluster-count';

/** The crew's own position marker. */
const LOCATION_SOURCE_ID = 'city-activity-location';
const LOCATION_LAYER_ID = 'city-activity-location-layer';

/** The day's round — a line from the crew's position through the pins. */
const ROUTE_SOURCE_ID = 'city-activity-route';
const ROUTE_LAYER_ID = 'city-activity-route-layer';

/** The registered name of the wrench image on the map. */
const PIN_TOOL_ICON_NAME = 'city-activity-pin-tool';

/**
 * The registered name of the teardrop job pin on the map.
 */
const PIN_MARKER_ICON_NAME = 'city-activity-pin-marker';

/**
 * The wrench glyph drawn inside a job pin.
 *
 * A 32×32 SVG (rendered at 2× for a crisp 64px bitmap) — the
 * same shape as the app's `WrenchIcon` in the UI, so the map pin
 * and the in-app category icons read as one set.
 */
const PIN_TOOL_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" ' +
  'fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M14.7 6.3a4 4 0 0 0 5 5l-9.6 9.6a2.1 2.1 0 0 1-3-3z"/>' +
  '<path d="M14.7 6.3l3-3a4 4 0 0 1 4.6 5.4l-2.6-.7z"/>' +
  '</svg>';

/**
 * The teardrop JOB PIN — a grey circular head carrying the white
 * wrench, tapering to a point at the job's coordinates.
 *
 * The crew dashboard's design (`ui-design/Crew Portal Dashboard.png`)
 * draws the round's stops as map pins, not as dots: a soft-grey
 * circle with a white wrench, a short tail, and a subtle drop
 * shadow. The tail is what makes it a pin — the circle alone reads
 * as a status marker, and the pin shape says "a place to go".
 *
 * The whole pin is ONE registered image rather than a `circle`
 * layer plus a `symbol` overlay, because the tail has to sit
 * UNDER the head and the head has to sit OVER the tail — a
 * layer pair cannot express that without an extra image.
 *
 * Authored on a 48×64 grid: the head is a 40px circle centred at
 * (24, 24), and the tail runs from the head's underside to the
 * anchor point at (24, 62).
 */
const PIN_MARKER_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="64" viewBox="0 0 48 64">' +
  // The tail, drawn first so the head overlaps its shoulders.
  '<path d="M14.4 36.5 L24 62 L33.6 36.5 Z" fill="#7c8794"/>' +
  // The head.
  '<circle cx="24" cy="24" r="20" fill="#8a95a3" fill-opacity="0.94"/>' +
  '<circle cx="24" cy="24" r="19" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="1.5"/>' +
  // The wrench, scaled from its 24-unit authoring grid into the
  // head, exactly as the app's `WrenchIcon` draws it.
  '<g transform="translate(24 24) scale(0.92) translate(-12 -12)" ' +
  'fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M14.7 6.3a4 4 0 0 0 5 5l-9.6 9.6a2.1 2.1 0 0 1-3-3z"/>' +
  '<path d="M14.7 6.3l3-3a4 4 0 0 1 4.6 5.4l-2.6-.7z"/>' +
  '</g>' +
  '</svg>';

/**
 * Rasterise an SVG into an `ImageBitmap` MapLibre can register.
 *
 * WHY NOT `createImageBitmap(blob)` DIRECTLY
 * ------------------------------------------
 * The obvious implementation — build a `Blob` of the SVG and hand it
 * to `createImageBitmap` — does NOT work. Chrome rejects an SVG blob
 * with `InvalidStateError: The source image could not be decoded`,
 * because `createImageBitmap` decodes BITMAPS, not vector markup.
 * The failure is silent from the map's point of view: the icon layer
 * is simply never added and the pins fall back to plain circles, with
 * nothing in the console to explain it.
 *
 * The path that DOES work is the one the browser uses to display an
 * SVG at all: load it as an `<img>` (Chrome rasterises SVG images
 * fine), draw that image onto a canvas, and read the canvas back as
 * an `ImageBitmap`. `canvas.toBlob` → `createImageBitmap` is the
 * same shape, but drawing straight to the canvas avoids a second
 * encode/decode round trip.
 *
 * Returns null when the browser cannot rasterise the SVG at all
 * (`document` unavailable, the image fails to decode, or a canvas
 * context cannot be acquired) — the caller then skips the icon layer
 * and the pin stays a coloured circle, which is a graceful
 * degradation rather than a broken map.
 */
async function loadToolIconImage(
  svg: string,
  width: number,
  height: number,
): Promise<ImageBitmap | null> {
  if (typeof createImageBitmap !== 'function') return null;
  if (typeof document === 'undefined') return null;

  const source = await new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.width = width;
    img.height = height;
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
  if (!source) return null;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, width, height);

  try {
    return await createImageBitmap(canvas);
  } catch {
    return null;
  }
}

/**
 * OpenStreetMap raster basemap (same source as
 * `components/MapView.tsx` and `components/DispatcherMap.tsx`).
 * No API key, no token, no auth. The OSM Tile Usage Policy
 * forbids heavy production use; a production deployment at
 * scale should swap to a paid provider (Mapbox / MapTiler
 * / Stadia) or self-host.
 *
 * The constants themselves live in `lib/map/osm-raster.ts`.
 */

/**
 * Cluster threshold. The v1 city set is small (1-10
 * pins), so clustering is dormant in practice. The
 * threshold is wired anyway so the v1.1 / v2 scale path
 * doesn't need a refactor.
 */
const CLUSTER_THRESHOLD = 50;

/**
 * Color map: status → pin color. Mirrors the status pills
 * in the activity feed (home page StatusPill component) so
 * the side panel and the map read as one consistent visual.
 */
const PIN_COLORS: Record<CityActivityStatus, string> = {
  ...MAP_STATUS_COLORS,
};

function pinsToFeatureCollection(
  pins: CityActivityPin[],
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: pins.map((p) => ({
      type: 'Feature',
      id: p.id,
      properties: {
        id: p.id,
        status: p.status,
        // The label is carried on the feature so the symbol layer
        // can read it with `['get', 'label']`. A null label must
        // still be a PROPERTY (not an absent key) so the layer's
        // `['has', 'label']` filter behaves predictably.
        label: p.label ?? null,
      },
      geometry: {
        type: 'Point',
        coordinates: [p.lng, p.lat],
      },
    })),
  };
}

/**
 * The day's round as a GeoJSON LineString: the crew's position
 * first, then the pins in list order.
 *
 * An empty array (no position, or no pins) yields a null
 * FeatureCollection — the map skips the route layer entirely
 * rather than drawing a stray line.
 */
function routeToFeatureCollection(
  pins: CityActivityPin[],
  userLocation: { lat: number; lng: number } | null,
): GeoJSON.FeatureCollection {
  if (!userLocation || pins.length === 0) {
    return { type: 'FeatureCollection', features: [] };
  }
  const coordinates: [number, number][] = [
    [userLocation.lng, userLocation.lat],
    ...pins.map((p) => [p.lng, p.lat] as [number, number]),
  ];
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates },
      },
    ],
  };
}

/**
 * The crew's position as a single-point FeatureCollection. Null
 * when there is no position (the marker layer is skipped).
 */
function locationToFeatureCollection(
  userLocation: { lat: number; lng: number } | null,
): GeoJSON.FeatureCollection {
  if (!userLocation) {
    return { type: 'FeatureCollection', features: [] };
  }
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Point',
          coordinates: [userLocation.lng, userLocation.lat],
        },
      },
    ],
  };
}

export default function CityActivityMap({
  pins,
  center,
  pinColors,
  showPinLabels = false,
  showPinIcons = false,
  showPinMarkers = false,
  userLocation = null,
  showRoute = false,
}: CityActivityMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  // Hold the latest `pins` in a ref so the click handler
  // always reads the current list without forcing the map
  // to re-create (which would tear down the canvas).
  const pinsRef = useRef(pins);
  pinsRef.current = pins;
  const pinColorsRef = useRef({ ...PIN_COLORS, ...pinColors });
  pinColorsRef.current = { ...PIN_COLORS, ...pinColors };
  // The label toggle is read once at map creation (the layer is
  // added or omitted at `load` time), so it is held in a ref
  // rather than a dependency of the mount effect.
  const showPinLabelsRef = useRef(showPinLabels);
  showPinLabelsRef.current = showPinLabels;
  // Same for the tool-icon pins.
  const showPinIconsRef = useRef(showPinIcons);
  showPinIconsRef.current = showPinIcons;
  // And for the teardrop job pins.
  const showPinMarkersRef = useRef(showPinMarkers);
  showPinMarkersRef.current = showPinMarkers;
  // The route line and the location marker are also read at
  // creation time (their layers are added or omitted at `load`),
  // but their DATA is refreshed by the effects below.
  const showRouteRef = useRef(showRoute);
  showRouteRef.current = showRoute;
  const userLocationRef = useRef(userLocation);
  userLocationRef.current = userLocation;

  const clusterEnabled = pins.length > CLUSTER_THRESHOLD;

  // Initialise the map once on mount.
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        // Without a `glyphs` endpoint MapLibre cannot draw any
        // `text-field` — the symbol layers below would silently
        // render nothing.
        glyphs: GLYPHS_URL,
        sources: {
          'osm-tiles': {
            type: 'raster',
            tiles: [OSM_TILE_URL],
            tileSize: 256,
            attribution: OSM_ATTRIBUTION,
          },
        },
        layers: [
          {
            id: 'osm-tiles-layer',
            type: 'raster',
            source: 'osm-tiles',
          },
        ],
      },
      center: [center.lng, center.lat] as LngLatLike,
      zoom: 13,
      attributionControl: false,
    });
    mapRef.current = map;

    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      'bottom-right',
    );
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      'top-right',
    );

    map.on('load', async () => {
      // Dhaka District polygon (line + translucent fill so
      // the basemap shows through). Same source as
      // `MapView` + `DispatcherMap`.
      if (!map.getSource(DHAKA_DISTRICT_SOURCE_ID)) {
        map.addSource(DHAKA_DISTRICT_SOURCE_ID, {
          type: 'geojson',
          data: DHAKA_DISTRICT_FEATURE_COLLECTION as GeoJSON.FeatureCollection,
        });
        map.addLayer({
          id: DHAKA_DISTRICT_FILL_LAYER_ID,
          type: 'fill',
          source: DHAKA_DISTRICT_SOURCE_ID,
          paint: {
            'fill-color': MAP_PRIMARY_COLOR,
            'fill-opacity': 0.06,
          },
        });
        map.addLayer({
          id: DHAKA_DISTRICT_LINE_LAYER_ID,
          type: 'line',
          source: DHAKA_DISTRICT_SOURCE_ID,
          paint: {
            'line-color': MAP_PRIMARY_COLOR,
            'line-width': 2,
            'line-dasharray': [2, 2],
          },
        });
      }

      /*
       * The day's round (crew dashboard only).
       *
       * The design shows the crew's position on the map with a
       * blue route line running through the jobs in the order
       * they are listed — the crew is walking a round, not
       * picking jobs at random.
       *
       * The line is drawn BEFORE the pin layers so the pins sit
       * on top of it (MapLibre paints in insertion order).
       */
      if (showRouteRef.current && userLocationRef.current) {
        map.addSource(ROUTE_SOURCE_ID, {
          type: 'geojson',
          data: routeToFeatureCollection(pinsRef.current, userLocationRef.current),
        });
        map.addLayer({
          id: ROUTE_LAYER_ID,
          type: 'line',
          source: ROUTE_SOURCE_ID,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': MAP_PRIMARY_COLOR,
            'line-width': 3,
            'line-opacity': 0.85,
          },
        });
      }

      /*
       * The crew's own position marker. A blue dot with a white
       * ring, matching the "My Location" legend entry. Drawn
       * above the route line but below the job pins.
       */
      if (userLocationRef.current) {
        map.addSource(LOCATION_SOURCE_ID, {
          type: 'geojson',
          data: locationToFeatureCollection(userLocationRef.current),
        });
        map.addLayer({
          id: LOCATION_LAYER_ID,
          type: 'circle',
          source: LOCATION_SOURCE_ID,
          paint: {
            'circle-color': MAP_PRIMARY_COLOR,
            'circle-radius': 7,
            'circle-stroke-width': 3,
            'circle-stroke-color': '#fff',
          },
        });
      }

      // Pin source. Clustering is opt-in based on the
      // threshold.
      if (!map.getSource(PINS_SOURCE_ID)) {
        map.addSource(PINS_SOURCE_ID, {
          type: 'geojson',
          data: pinsToFeatureCollection(pinsRef.current),
          cluster: clusterEnabled,
          clusterMaxZoom: 14,
          clusterRadius: 50,
        });

        // Cluster bubbles (rendered when clustering is on).
        if (clusterEnabled) {
          map.addLayer({
            id: PINS_CLUSTER_LAYER_ID,
            type: 'circle',
            source: PINS_SOURCE_ID,
            filter: ['has', 'point_count'],
            paint: {
              'circle-color': MAP_PRIMARY_COLOR,
              'circle-radius': [
                'step',
                ['get', 'point_count'],
                16, // 1-9 pins
                10, 22, // 10-99 pins
                100, 28, // 100+ pins
              ],
              'circle-stroke-width': 3,
              'circle-stroke-color': '#fff',
            },
          });
          map.addLayer({
            id: PINS_CLUSTER_COUNT_LAYER_ID,
            type: 'symbol',
            source: PINS_SOURCE_ID,
            filter: ['has', 'point_count'],
            layout: {
              'text-field': ['get', 'point_count_abbreviated'],
              'text-size': 12,
              'text-font': [...SYMBOL_FONT],
            },
            paint: {
              'text-color': '#fff',
            },
          });
        }

        // Single pins.
        //
        // The `filter` key must be OMITTED entirely when clustering is
        // off — MapLibre rejects an explicit `filter: undefined`
        // ("array expected, undefined found") and aborts addLayer,
        // leaving the citizen's activity-map pins undrawn.
        //
        // The teardrop job-pin mode replaces this layer outright:
        // the marker image already carries its own head, so drawing
        // a circle underneath it would only show as a colour ring
        // around the pin.
        if (!showPinMarkersRef.current) {
          map.addLayer({
            id: PINS_LAYER_ID,
            type: 'circle',
            source: PINS_SOURCE_ID,
            ...(clusterEnabled ? { filter: ['!', ['has', 'point_count']] } : {}),
            paint: {
              'circle-color': [
                'match',
                ['get', 'status'],
                'submitted',
                pinColorsRef.current.submitted,
                'routed',
                pinColorsRef.current.routed,
                'in_progress',
                pinColorsRef.current.in_progress,
                'resolved',
                pinColorsRef.current.resolved,
                'closed',
                pinColorsRef.current.closed,
                'cancelled',
                pinColorsRef.current.cancelled,
                /* default */ '#999',
              ],
              'circle-radius': 7,
              'circle-stroke-width': 2,
              'circle-stroke-color': '#fff',
            },
          });
        }

        /*
         * Numbered pin labels (crew dashboard only).
         *
         * A `symbol` layer renders the pin's `label` property as
         * white text INSIDE the bubble, which is how the design's
         * numbered pins read. It must be added AFTER the circle
         * layer — MapLibre draws layers in insertion order, so a
         * symbol layer added before the circle would be painted
         * over by it.
         *
         * The filter `['has', 'label']` skips pins with no label:
         * `['get', 'label']` on a missing property yields null,
         * which a text-field cannot render.
         */
        if (showPinLabelsRef.current) {
          map.addLayer({
            id: PINS_LABEL_LAYER_ID,
            type: 'symbol',
            source: PINS_SOURCE_ID,
            ...(clusterEnabled ? { filter: ['!', ['has', 'point_count']] } : {}),
            layout: {
              'text-field': ['get', 'label'],
              'text-size': 10,
              'text-font': [...SYMBOL_FONT],
              // The number sits dead centre in the bubble.
              'text-anchor': 'center',
              'text-allow-overlap': true,
            },
            paint: {
              'text-color': '#fff',
            },
          });
        }

        /*
         * Tool-icon pins (crew dashboard only).
         *
         * The design draws the job pins as a WRENCH inside a
         * status-coloured circle: the pin marks work to be done,
         * not a report to be read.
         *
         * The wrench is an SVG raster added with `map.addImage`
         * rather than a MapLibre `icon-image` from a sprite. Two
         * reasons: the app ships no sprite sheet, and a
         * `symbol` layer with `icon-image` needs the image to be
         * registered BEFORE the layer is added — whereas
         * `addImage` accepts an `ImageBitmap` we build here.
         *
         * The icon is white so it reads against every pin colour.
         */
        if (showPinIconsRef.current) {
          const icon = await loadToolIconImage(PIN_TOOL_ICON_SVG, 32, 32);
          if (icon && !map.hasImage(PIN_TOOL_ICON_NAME)) {
            map.addImage(PIN_TOOL_ICON_NAME, icon, { pixelRatio: 2 });
          }
          if (map.hasImage(PIN_TOOL_ICON_NAME)) {
            map.addLayer({
              id: PINS_ICON_LAYER_ID,
              type: 'symbol',
              source: PINS_SOURCE_ID,
              ...(clusterEnabled ? { filter: ['!', ['has', 'point_count']] } : {}),
              layout: {
                'icon-image': PIN_TOOL_ICON_NAME,
                'icon-size': 0.62,
                // The glyph sits dead centre in the bubble.
                'icon-anchor': 'center',
                'icon-allow-overlap': true,
              },
            });
          }
        }

        /*
         * Teardrop job pins (crew dashboard only).
         *
         * The design draws the round's stops as MAP PINS: a grey
         * head carrying a white wrench, tapering to a point at the
         * job's coordinates. `icon-anchor: 'bottom'` puts that
         * point exactly on the coordinate — the pin's tip marks the
         * site, not its centre.
         *
         * The image is registered with `map.addImage` rather than
         * drawn as a `circle` layer because the tail has to sit
         * UNDER the head. `addImage` accepts the `ImageBitmap` we
         * build from an inline SVG, which keeps the pin a single
         * self-contained asset with no sprite sheet.
         *
         * `icon-allow-overlap` is on because two jobs can share a
         * block — the design's pins overlap rather than cluster.
         */
        if (showPinMarkersRef.current) {
          const marker = await loadToolIconImage(PIN_MARKER_ICON_SVG, 48, 64);
          if (marker && !map.hasImage(PIN_MARKER_ICON_NAME)) {
            map.addImage(PIN_MARKER_ICON_NAME, marker, { pixelRatio: 2 });
          }
          if (map.hasImage(PIN_MARKER_ICON_NAME)) {
            map.addLayer({
              id: PINS_MARKER_LAYER_ID,
              type: 'symbol',
              source: PINS_SOURCE_ID,
              ...(clusterEnabled ? { filter: ['!', ['has', 'point_count']] } : {}),
              layout: {
                'icon-image': PIN_MARKER_ICON_NAME,
                'icon-size': 0.62,
                // The pin's TIP lands on the coordinate.
                'icon-anchor': 'bottom',
                'icon-allow-overlap': true,
              },
            });
          }
        }
      }
    });

    // Cluster click → ease into the cluster (zoom expansion).
    const handleClick = (
      e: maplibregl.MapMouseEvent & { features?: GeoJSON.Feature[] },
    ) => {
      if (!e.features || e.features.length === 0) return;
      const feature = e.features[0];
      const props = feature.properties as Record<string, unknown> | null;
      if (props && typeof props.cluster_id === 'number' && clusterEnabled) {
        const source = map.getSource(PINS_SOURCE_ID) as
          | maplibregl.GeoJSONSource
          | undefined;
        if (
          source &&
          typeof (source as unknown as {
            getClusterExpansionZoom?: (id: number) => unknown;
          }).getClusterExpansionZoom === 'function'
        ) {
          (
            source as unknown as {
              getClusterExpansionZoom: (
                id: number,
                cb: (err: unknown, zoom: number) => void,
              ) => void;
            }
          ).getClusterExpansionZoom(
            props.cluster_id as number,
            (err, zoom) => {
              if (err) return;
              map.easeTo({
                center: (feature.geometry as GeoJSON.Point).coordinates as [
                  number,
                  number,
                ],
                zoom,
              });
            },
          );
        }
        return;
      }
      // Single-pin click: the activity feed is the
      // primary surface for ticket details (the map
      // is read-only + a complement), so we just
      // ease-to + pop the cursor.
      const geom = feature.geometry as GeoJSON.Point;
      map.easeTo({
        center: geom.coordinates as [number, number],
        duration: 300,
      });
    };
    map.on('click', PINS_LAYER_ID, handleClick);
    if (clusterEnabled) {
      map.on('click', PINS_CLUSTER_LAYER_ID, handleClick);
    }

    // Pointer cursor over pins.
    const setPointer = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const unsetPointer = () => {
      map.getCanvas().style.cursor = '';
    };
    map.on('mouseenter', PINS_LAYER_ID, setPointer);
    map.on('mouseleave', PINS_LAYER_ID, unsetPointer);
    if (clusterEnabled) {
      map.on('mouseenter', PINS_CLUSTER_LAYER_ID, setPointer);
      map.on('mouseleave', PINS_CLUSTER_LAYER_ID, unsetPointer);
    }

    // Re-measure on container resize.
    const ro = new ResizeObserver(() => {
      if (mapRef.current) mapRef.current.resize();
    });
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update the pin source data when `pins` changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const source = map.getSource(PINS_SOURCE_ID) as
        | maplibregl.GeoJSONSource
        | undefined;
      if (source) {
        source.setData(pinsToFeatureCollection(pins));
      }
      // The route runs through the pins, so it has to be refreshed
      // whenever they change.
      const routeSource = map.getSource(ROUTE_SOURCE_ID) as
        | maplibregl.GeoJSONSource
        | undefined;
      if (routeSource) {
        routeSource.setData(
          routeToFeatureCollection(pins, userLocationRef.current),
        );
      }
    };
    if (map.isStyleLoaded()) {
      apply();
    } else {
      map.once('load', apply);
    }
  }, [pins]);

  // Update the crew's position marker when the position changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      /*
       * The position usually arrives AFTER the map's `load` event —
       * the browser asks for the geolocation permission, and the
       * answer comes back a tick or two later. The `load` handler
       * therefore usually finds no position and creates NEITHER the
       * location source NOR the route source, so an effect that only
       * calls `setData` on an existing source updates nothing and the
       * marker never appears.
       *
       * So the sources are CREATED here when they are missing, and
       * only updated when they already exist.
       */
      if (!userLocation) {
        // No position (yet) — clear whatever is on the map so a
        // revoked permission does not leave a stale marker behind.
        const source = map.getSource(LOCATION_SOURCE_ID) as
          | maplibregl.GeoJSONSource
          | undefined;
        source?.setData(locationToFeatureCollection(null));
        const routeSource = map.getSource(ROUTE_SOURCE_ID) as
          | maplibregl.GeoJSONSource
          | undefined;
        routeSource?.setData(routeToFeatureCollection(pinsRef.current, null));
        return;
      }

      if (!map.getSource(LOCATION_SOURCE_ID)) {
        map.addSource(LOCATION_SOURCE_ID, {
          type: 'geojson',
          data: locationToFeatureCollection(userLocation),
        });
        map.addLayer({
          id: LOCATION_LAYER_ID,
          type: 'circle',
          source: LOCATION_SOURCE_ID,
          paint: {
            'circle-color': MAP_PRIMARY_COLOR,
            'circle-radius': 7,
            'circle-stroke-width': 3,
            'circle-stroke-color': '#fff',
          },
        });
      } else {
        const source = map.getSource(LOCATION_SOURCE_ID) as
          | maplibregl.GeoJSONSource
          | undefined;
        source?.setData(locationToFeatureCollection(userLocation));
      }

      if (showRouteRef.current) {
        if (!map.getSource(ROUTE_SOURCE_ID)) {
          map.addSource(ROUTE_SOURCE_ID, {
            type: 'geojson',
            data: routeToFeatureCollection(pinsRef.current, userLocation),
          });
          map.addLayer({
            id: ROUTE_LAYER_ID,
            type: 'line',
            source: ROUTE_SOURCE_ID,
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': MAP_PRIMARY_COLOR,
              'line-width': 3,
              'line-opacity': 0.85,
            },
          });
        } else {
          const routeSource = map.getSource(ROUTE_SOURCE_ID) as
            | maplibregl.GeoJSONSource
            | undefined;
          routeSource?.setData(
            routeToFeatureCollection(pinsRef.current, userLocation),
          );
        }
      }
    };
    if (map.isStyleLoaded()) {
      apply();
    } else {
      map.once('load', apply);
    }
  }, [userLocation]);

  // Centre the map when the `center` prop changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setCenter([center.lng, center.lat]);
  }, [center.lat, center.lng]);

  return (
    <div
      ref={containerRef}
      data-testid="city-activity-map"
      style={{
        width: '100%',
        height: '100%',
        // This element IS the MapLibre container, so it must be the
        // positioning context for the canvas MapLibre renders inside
        // it. It must NOT be `position: absolute` itself: an
        // absolutely-positioned element resolves `inset` against the
        // nearest POSITIONED ancestor, and on the dispatcher dashboard
        // no ancestor is positioned — so the map escaped its 300px
        // panel and expanded to the full viewport, covering the KPIs,
        // queue, crew and trend panels.
        //
        // Filling the parent with relative positioning keeps the map
        // inside its container regardless of what the caller does,
        // while still letting callers overlay their own chrome (the
        // home page's location pill) via their own absolute children.
        position: 'relative',
      }}
    />
  );
}
