/**
 * MapLibre GL JS backed map (components/MapView.tsx).
 *
 * The v1 production path for the report location step
 * (1.7). Replaces the SVG placeholder with a real
 * raster basemap (OpenStreetMap public tiles — free,
 * no token), the Dhaka District polygon overlay
 * (lib/geo/dhaka-district.ts), and a draggable
 * MapLibre marker.
 *
 * The component consumes the same prop surface as
 * the SVG placeholder (lat, lng, center, width,
 * height, draggable, onPinMove, showDedupRing,
 * showBoundary) so the location page wiring is
 * unaffected.
 *
 * Tile source:
 *   - OpenStreetMap raster basemap
 *     (https://tile.openstreetmap.org/{z}/{x}/{y}.png).
 *   - No API key, no token, no auth. The OSM Tile
 *     Usage Policy forbids heavy production use;
 *     a production deployment at scale should
 *     swap to a paid provider (Mapbox / MapTiler
 *     / Stadia) or self-host.
 *   - Attribution is rendered via the MapLibre
 *     built-in `AttributionControl` so the credit
 *     is always visible.
 *
 * The 50m dedup ring is rendered as a GeoJSON
 * `Polygon` source + a `fill` + `line` layer (not
 * as a MapLibre `circle` layer) so the ring
 * deforms correctly with the map's projection at
 * higher zoom levels.
 *
 * The Dhaka District polygon is rendered as a
 * GeoJSON `Polygon` source with two layers: a
 * translucent `fill` (so the basemap shows through)
 * and a `line` outline. The polygon's data lives
 * in `lib/geo/dhaka-district.ts`; the
 * `pointInPolygon` helper (`lib/geo/polygon-test.ts`)
 * is the in-bounds check used by the location page.
 *
 * The pin is a `maplibregl.Marker` (DOM element) so
 * it can be dragged via the marker drag handler;
 * the map's own `click` handler moves the pin to
 * the click point.
 */

'use client';

import { useEffect, useRef } from 'react';
import maplibregl, {
  type LngLatLike,
  type Map as MaplibreMap,
  type Marker as MaplibreMarker,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { DHAKA_DISTRICT_FEATURE_COLLECTION } from '@/lib/geo/dhaka-district';
import type { WardBoundary } from '@/lib/geo/ward-lookup';
import { OSM_ATTRIBUTION, OSM_TILE_URL } from '@/lib/map/osm-raster';
import { MAP_PRIMARY_COLOR } from '@/lib/ui/map-colors';

interface MapViewProps {
  lat: number;
  lng: number;
  // approximate centre for the initial view
  center: { lat: number; lng: number };
  // Optional container width in pixels. When omitted
  // (or 0) the container fills its parent (100% width).
  // The location page uses the fill-parent mode so
  // the map covers the full grid track; tests that
  // want a fixed-size map can still pass an explicit
  // width / height.
  width?: number;
  height?: number;
  // when true, the pin is draggable
  draggable?: boolean;
  onPinMove?: (lat: number, lng: number) => void;
  // when true, the 50m dedup ring is shown around the pin
  showDedupRing?: boolean;
  // when true, the Dhaka District polygon is shaded to
  // indicate the supported area. The polygon is always
  // outlined; this flag toggles the fill.
  showBoundary?: boolean;
  /**
   * The city's ward boundaries, drawn as distinct sections.
   *
   * When supplied, the map draws one filled, outlined polygon per
   * ward so the citizen can see which section they are in. The
   * ward containing the pin is highlighted via `activeWardId`.
   *
   * The boundaries are drawn UNDER the district outline but OVER
   * the raster basemap, and the district's own fill is suppressed
   * while they are shown — two translucent fills stacked would
   * wash the basemap out and make the sections harder to read.
   */
  wardBoundaries?: WardBoundary[];
  /**
   * The id of the ward to highlight — normally the ward that
   * contains the pin. `null` highlights nothing.
   */
  activeWardId?: string | null;
}

const DHAKA_DISTRICT_SOURCE_ID = 'dhaka-district';
const DHAKA_DISTRICT_FILL_LAYER_ID = 'dhaka-district-fill';
const DHAKA_DISTRICT_LINE_LAYER_ID = 'dhaka-district-line';
const DEDUP_RING_SOURCE_ID = 'dedup-ring';
const DEDUP_RING_FILL_LAYER_ID = 'dedup-ring-fill';
const DEDUP_RING_LINE_LAYER_ID = 'dedup-ring-line';
const WARD_SOURCE_ID = 'ward-boundaries';
const WARD_FILL_LAYER_ID = 'ward-boundaries-fill';
const WARD_LINE_LAYER_ID = 'ward-boundaries-line';
const WARD_ACTIVE_FILL_LAYER_ID = 'ward-boundaries-active-fill';
const WARD_ACTIVE_LINE_LAYER_ID = 'ward-boundaries-active-line';

/**
 * OpenStreetMap raster basemap. The free public tile
 * CDN at `tile.openstreetmap.org`. No API key, no
 * auth, no token. The OSM Tile Usage Policy forbids
 * heavy production use; this is the v1 dev-demo +
 * low-traffic production source. A production
 * deployment at scale should swap to a paid provider
 * (Mapbox / MapTiler / Stadia) or self-host.
 *
 * Attribution is rendered via the MapLibre
 * `AttributionControl`; OSM requires the credit
 * to be visible.
 *
 * The constants themselves live in `lib/map/osm-raster.ts`.
 */

/**
 * Build a 50m-radius circle polygon around (lng, lat).
 * Returns a closed GeoJSON Polygon. The 50m is in
 * metres; we project to a local-tangent-plane so the
 * circle is visually round at the latitude of Dhaka.
 */
function makeCirclePolygon(
  centerLng: number,
  centerLat: number,
  radiusMeters: number,
  steps = 64,
): GeoJSON.Feature<GeoJSON.Polygon> {
  const coords: [number, number][] = [];
  const earthR = 6_378_137; // metres
  const latRad = (centerLat * Math.PI) / 180;
  // 1° of latitude ≈ 111_320 m; 1° of longitude at
  // this latitude ≈ 111_320 * cos(latRad) m.
  const dLat = (radiusMeters / 111_320) * (180 / Math.PI);
  const dLng =
    (radiusMeters / (111_320 * Math.cos(latRad))) * (180 / Math.PI);
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    coords.push([centerLng + dLng * Math.cos(angle), centerLat + dLat * Math.sin(angle)]);
  }
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [coords] },
  };
}

/**
 * Turn the ward boundaries into a GeoJSON FeatureCollection
 * for the MapLibre `geojson` source.
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
function buildWardFeatureCollection(
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

export default function MapView({
  lat,
  lng,
  center,
  width,
  height,
  draggable = true,
  onPinMove,
  showDedupRing = false,
  showBoundary = false,
  wardBoundaries = [],
  activeWardId = null,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const markerRef = useRef<MaplibreMarker | null>(null);
  // Hold the latest `onPinMove` in a ref so the map
  // event handlers always call the current callback
  // without forcing the `useEffect` to re-run (which
  // would tear down and re-create the map).
  const onPinMoveRef = useRef(onPinMove);
  onPinMoveRef.current = onPinMove;
  // The latest map centre target. The map's `load` event can fire
  // long after the centre effect ran, and by then the pin may have
  // moved again — the deferred callback must ease to where the pin
  // is NOW.
  const latestCentreRef = useRef<[number, number]>([
    center.lng,
    center.lat,
  ]);

  // Decide whether the container should fill its
  // parent (100%) or honour the explicit width /
  // height props. A non-positive number is treated
  // as "fill parent" so the default is responsive.
  const fillParent = !width || !height || width <= 0 || height <= 0;

  // Initialise the map once on mount. Re-initialises
  // only if the container ref changes; subsequent
  // prop changes are handled by the `useEffect`s
  // below.
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
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
      zoom: 12,
      attributionControl: false,
    });
    mapRef.current = map;

    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      'bottom-right',
    );
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    // Dhaka District polygon. Always added so the
    // outline is visible; the fill is toggled via
    // the layer's `paint` property.
    map.on('load', () => {
      // Ward boundaries. Added FIRST so they sit below the
      // district outline in the layer stack — the ward fill
      // is the translucent wash and the district line is the
      // crisp outer edge.
      if (!map.getSource(WARD_SOURCE_ID)) {
        map.addSource(WARD_SOURCE_ID, {
          type: 'geojson',
          data: buildWardFeatureCollection(wardBoundaries),
        });
        map.addLayer({
          id: WARD_FILL_LAYER_ID,
          type: 'fill',
          source: WARD_SOURCE_ID,
          paint: {
            'fill-color': MAP_PRIMARY_COLOR,
            'fill-opacity': 0.1,
          },
        });
        map.addLayer({
          id: WARD_LINE_LAYER_ID,
          type: 'line',
          source: WARD_SOURCE_ID,
          paint: {
            'line-color': MAP_PRIMARY_COLOR,
            'line-width': 1,
            'line-opacity': 0.7,
          },
        });
        // The ward containing the pin gets a stronger fill
        // and a solid outline so the citizen can see which
        // section their report will go to.
        map.addLayer({
          id: WARD_ACTIVE_FILL_LAYER_ID,
          type: 'fill',
          source: WARD_SOURCE_ID,
          filter: ['==', ['get', 'wardId'], ''],
          paint: {
            'fill-color': MAP_PRIMARY_COLOR,
            'fill-opacity': 0.28,
          },
        });
        map.addLayer({
          id: WARD_ACTIVE_LINE_LAYER_ID,
          type: 'line',
          source: WARD_SOURCE_ID,
          filter: ['==', ['get', 'wardId'], ''],
          paint: {
            'line-color': MAP_PRIMARY_COLOR,
            'line-width': 2.5,
          },
        });
      }

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
            'fill-opacity': showBoundary ? 0.08 : 0,
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

      // 50m dedup ring. Always added; visibility is
      // toggled via the layer's `layout.visibility`.
      if (!map.getSource(DEDUP_RING_SOURCE_ID)) {
        const ring = makeCirclePolygon(lng, lat, 50);
        map.addSource(DEDUP_RING_SOURCE_ID, {
          type: 'geojson',
          data: ring,
        });
        map.addLayer({
          id: DEDUP_RING_FILL_LAYER_ID,
          type: 'fill',
          source: DEDUP_RING_SOURCE_ID,
          paint: {
            'fill-color': '#E86357',
            'fill-opacity': 0.15,
          },
          layout: {
            visibility: showDedupRing ? 'visible' : 'none',
          },
        });
        map.addLayer({
          id: DEDUP_RING_LINE_LAYER_ID,
          type: 'line',
          source: DEDUP_RING_SOURCE_ID,
          paint: {
            'line-color': '#E86357',
            'line-width': 1.5,
            'line-dasharray': [1, 1],
          },
          layout: {
            visibility: showDedupRing ? 'visible' : 'none',
          },
        });
      }
    });

    // Marker (the draggable pin). Use MapLibre's
    // default blue dot and overlay a coloured circle
    // via a custom element so the visual matches the
    // SVG placeholder's "primary circle + white
    // centre" treatment.
    const el = document.createElement('div');
    el.setAttribute('data-testid', 'mapview-pin');
    el.style.width = '28px';
    el.style.height = '28px';
    el.style.borderRadius = '50%';
    el.style.background = 'var(--color-primary)';
    el.style.border = '3px solid #fff';
    el.style.boxShadow = '0 1px 4px rgba(0,0,0,0.3)';
    el.style.cursor = draggable ? 'grab' : 'default';
    const marker = new maplibregl.Marker({ element: el, draggable })
      .setLngLat([lng, lat])
      .addTo(map);
    markerRef.current = marker;

    if (draggable) {
      marker.on('dragend', () => {
        const ll = marker.getLngLat();
        onPinMoveRef.current?.(ll.lat, ll.lng);
      });
    }

    // Click-to-move: click anywhere on the map to
    // move the pin there. This is the v1 citizen
    // ergonomic — no need to drag if a tap on the
    // basemap is enough.
    map.on('click', (e) => {
      if (!onPinMoveRef.current) return;
      onPinMoveRef.current(e.lngLat.lat, e.lngLat.lng);
    });

    // Re-measure the map when the parent container
    // resizes. The location page's grid collapses at
    // 1024px, so without this observer the map would
    // keep its initial size after the collapse and
    // overflow the new track width.
    const ro = new ResizeObserver(() => {
      if (mapRef.current) mapRef.current.resize();
    });
    if (containerRef.current) {
      ro.observe(containerRef.current);
    }

    return () => {
      ro.disconnect();
      marker.remove();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // We intentionally only initialise the map once.
    // Subsequent prop changes are applied by the
    // effects below; the map's lifecycle is bound to
    // the component's mount/unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the marker position in sync with the
  // `lat` / `lng` props. This is the channel the
  // location page uses to update the pin from
  // external state (e.g. after a "Move to nearest
  // in-boundary" CTA).
  useEffect(() => {
    const marker = markerRef.current;
    if (!marker) return;
    const current = marker.getLngLat();
    if (current.lat !== lat || current.lng !== lng) {
      marker.setLngLat([lng, lat]);
    }
  }, [lat, lng]);

  // Centre the map when the `center` prop changes.
  //
  // The centre only moves when the target has drifted OUT of
  // the visible viewport — e.g. the pin was moved to another
  // ward, or the default pin sits in a home ward away from the
  // city's centre. Re-centring on every change would yank the
  // map out from under a citizen who is panning it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const target: [number, number] = [center.lng, center.lat];
    // The latest target, so the deferred `load` callback eases to
    // where the pin is NOW rather than where it was when the
    // effect ran.
    latestCentreRef.current = target;
    const apply = () => {
      const to = latestCentreRef.current;
      // `getBounds()` needs a sized map; before that the map has
      // no viewport, so there is nothing to keep the target inside
      // of — just centre on it.
      if (!map.getCanvas().clientWidth) {
        map.jumpTo({ center: to });
        return;
      }
      const visible = map.getBounds();
      const inView = visible.contains(
        new maplibregl.LngLat(to[0], to[1]),
      );
      if (inView) return;
      map.easeTo({ center: to, duration: 400 });
    };
    if (map.isStyleLoaded()) {
      apply();
    } else {
      // The style is still loading; retry once it is ready.
      map.once('load', apply);
    }
  }, [center.lat, center.lng]);

  // Toggle the dedup ring visibility + position.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const visibility = showDedupRing ? 'visible' : 'none';
      if (map.getLayer(DEDUP_RING_FILL_LAYER_ID)) {
        map.setLayoutProperty(
          DEDUP_RING_FILL_LAYER_ID,
          'visibility',
          visibility,
        );
      }
      if (map.getLayer(DEDUP_RING_LINE_LAYER_ID)) {
        map.setLayoutProperty(
          DEDUP_RING_LINE_LAYER_ID,
          'visibility',
          visibility,
        );
      }
      const source = map.getSource(DEDUP_RING_SOURCE_ID) as
        | maplibregl.GeoJSONSource
        | undefined;
      if (source) {
        source.setData(makeCirclePolygon(lng, lat, 50));
      }
    };
    if (map.isStyleLoaded()) {
      apply();
    } else {
      map.once('load', apply);
    }
  }, [showDedupRing, lat, lng]);

  // Toggle the Dhaka District fill opacity. The
  // line is always visible; the fill is gated by
  // `showBoundary` (true when the pin is in-bounds,
  // false when the geofence reject UX is showing).
  //
  // When the ward boundaries are drawn, the district
  // fill is suppressed — two translucent fills stacked
  // wash the basemap out and make the sections harder
  // to read.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (map.getLayer(DHAKA_DISTRICT_FILL_LAYER_ID)) {
        map.setPaintProperty(
          DHAKA_DISTRICT_FILL_LAYER_ID,
          'fill-opacity',
          showBoundary && wardBoundaries.length === 0 ? 0.08 : 0,
        );
      }
    };
    if (map.isStyleLoaded()) {
      apply();
    } else {
      map.once('load', apply);
    }
  }, [showBoundary, wardBoundaries.length]);

  // Push the ward boundaries into the map whenever they
  // change. The source is created on `load`, so the data
  // may arrive before or after the style is ready.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const source = map.getSource(WARD_SOURCE_ID) as
        | maplibregl.GeoJSONSource
        | undefined;
      if (source) {
        source.setData(buildWardFeatureCollection(wardBoundaries));
      }
    };
    if (map.isStyleLoaded()) {
      apply();
    } else {
      map.once('load', apply);
    }
  }, [wardBoundaries]);

  // Highlight the ward that contains the pin.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const filter: maplibregl.FilterSpecification = [
        '==',
        ['get', 'wardId'],
        activeWardId ?? '',
      ];
      if (map.getLayer(WARD_ACTIVE_FILL_LAYER_ID)) {
        map.setFilter(WARD_ACTIVE_FILL_LAYER_ID, filter);
      }
      if (map.getLayer(WARD_ACTIVE_LINE_LAYER_ID)) {
        map.setFilter(WARD_ACTIVE_LINE_LAYER_ID, filter);
      }
    };
    if (map.isStyleLoaded()) {
      apply();
    } else {
      map.once('load', apply);
    }
  }, [activeWardId]);

  return (
    <div
      ref={containerRef}
      data-testid="mapview"
      style={{
        // When the parent passes an explicit width /
        // height, honour them (used by tests and by
        // the SVG-placeholder-style contract). When
        // the parent doesn't, fill the parent
        // container 100% so the map covers the full
        // grid track.
        width: fillParent ? '100%' : `${width}px`,
        height: fillParent ? '100%' : `${height}px`,
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        background: 'var(--color-map-bg)',
      }}
      role="img"
      aria-label="Map showing your report location"
    />
  );
}
