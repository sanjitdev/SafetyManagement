/**
 * Dispatcher map shell (components/DispatcherMap.tsx).
 *
 * DISP-007 (Intent 003, Unit 005): the dispatcher's read-only
 * map view. A MapLibre GL JS canvas centered on the dispatcher's
 * city, rendering every in-scope ticket as a circle pin colored
 * by status. Clicking a pin fires `onPinClick(pin)` — the parent
 * page is responsible for opening the side panel (the map stays
 * presentation-only).
 *
 * The map is structurally similar to `components/MapView.tsx`:
 *   - OSM raster basemap (the same free public tile CDN — no
 *     token, no auth, OSM-attributed via MapLibre's
 *     AttributionControl).
 *   - Dhaka District polygon overlay (the same
 *     `DHAKA_DISTRICT_FEATURE_COLLECTION` source).
 * The component does NOT share state with `MapView` because the
 * citizen-side map's prop surface is contractually bound to a
 * single draggable marker. A v1.1 bolt can extract a shared
 * `lib/map/osm-raster.ts` to deduplicate the OSM constants.
 *
 * Pin source: a GeoJSON source with `cluster: true` when the
 * pin set has > 50 entries (the unit-brief's threshold). Below
 * 50, clustering is off so single pins are immediately visible.
 *
 * Pin styling: a `circle` layer with a data-driven
 * `circle-color` keyed on the `status` property. The legend
 * (rendered by the page) reads the same color map.
 *
 * The component is `'use client'`; the parent page guarantees
 * it is only mounted on the client (the page renders a loading
 * state during SSR).
 */

'use client';

import { useEffect, useRef } from 'react';
import maplibregl, {
  type LngLatLike,
  type Map as MaplibreMap,
  type MapMouseEvent,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { DHAKA_DISTRICT_FEATURE_COLLECTION } from '@/lib/geo/dhaka-district';

export type MapStatus = 'submitted' | 'routed' | 'in_progress';

export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  status: MapStatus;
  categoryId: string;
  wardId: string;
  createdAt: string;
}

interface DispatcherMapProps {
  pins: MapPin[];
  center: { lat: number; lng: number };
  onPinClick: (pin: MapPin) => void;
  selectedPinId?: string | null;
}

const DHAKA_DISTRICT_SOURCE_ID = 'dhaka-district';
const DHAKA_DISTRICT_FILL_LAYER_ID = 'dhaka-district-fill';
const DHAKA_DISTRICT_LINE_LAYER_ID = 'dhaka-district-line';

const PINS_SOURCE_ID = 'dispatcher-pins';
const PINS_LAYER_ID = 'dispatcher-pins-layer';
const PINS_CLUSTER_LAYER_ID = 'dispatcher-pins-cluster';
const PINS_CLUSTER_COUNT_LAYER_ID = 'dispatcher-pins-cluster-count';
const PINS_SELECTED_LAYER_ID = 'dispatcher-pins-selected';

/**
 * OpenStreetMap raster basemap. The free public tile CDN at
 * `tile.openstreetmap.org`. No API key, no auth, no token. The
 * OSM Tile Usage Policy forbids heavy production use; a
 * production deployment at scale should swap to a paid provider
 * (Mapbox / MapTiler / Stadia) or self-host.
 *
 * Attribution is rendered via the MapLibre
 * `AttributionControl`; OSM requires the credit to be visible.
 */
const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/**
 * Cluster threshold (per the unit-brief's bolt-suggestion note).
 * The v1 set is small (1-10 pins), so clustering is dormant in
 * practice. The threshold is wired anyway so the v1.1 / v2
 * scale path doesn't need a refactor.
 */
const CLUSTER_THRESHOLD = 50;

/**
 * Color map: status → pin color. Mirrors the page's legend so
 * the visual is consistent.
 */
const PIN_COLORS: Record<MapStatus, string> = {
  submitted: '#b58410', // warning (matches dispatcher queue pill)
  routed: '#0E5A4A', // primary
  in_progress: '#1c7ed6', // blue (slightly distinct from routed)
};

/**
 * Build the GeoJSON FeatureCollection for the pin source. Each
 * feature carries the pin's `status` and `id` as properties so
 * the layer's `circle-color` paint expression can be data-driven.
 */
function pinsToFeatureCollection(pins: MapPin[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: pins.map((p) => ({
      type: 'Feature',
      id: p.id,
      properties: {
        id: p.id,
        status: p.status,
        categoryId: p.categoryId,
        wardId: p.wardId,
        createdAt: p.createdAt,
      },
      geometry: {
        type: 'Point',
        coordinates: [p.lng, p.lat],
      },
    })),
  };
}

export default function DispatcherMap({
  pins,
  center,
  onPinClick,
  selectedPinId = null,
}: DispatcherMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  // Hold the latest `pins` + `onPinClick` in refs so the click
  // handler always calls the current callback without forcing
  // the map to re-create (which would tear down the canvas).
  const pinsRef = useRef(pins);
  pinsRef.current = pins;
  const onPinClickRef = useRef(onPinClick);
  onPinClickRef.current = onPinClick;

  const clusterEnabled = pins.length > CLUSTER_THRESHOLD;

  // Initialise the map once on mount.
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
      zoom: 13,
      attributionControl: false,
    });
    mapRef.current = map;

    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      'bottom-right',
    );
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', () => {
      // Dhaka District polygon (line + fill).
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
            'fill-color': '#0E5A4A',
            'fill-opacity': 0.06,
          },
        });
        map.addLayer({
          id: DHAKA_DISTRICT_LINE_LAYER_ID,
          type: 'line',
          source: DHAKA_DISTRICT_SOURCE_ID,
          paint: {
            'line-color': '#0E5A4A',
            'line-width': 2,
            'line-dasharray': [2, 2],
          },
        });
      }

      // Pin source. Clustering is opt-in based on the threshold.
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
              'circle-color': '#0E5A4A',
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
              'text-font': ['Open Sans Regular'],
            },
            paint: {
              'text-color': '#fff',
            },
          });
        }

        // Single pins.
        map.addLayer({
          id: PINS_LAYER_ID,
          type: 'circle',
          source: PINS_SOURCE_ID,
          filter: clusterEnabled ? ['!', ['has', 'point_count']] : undefined,
          paint: {
            'circle-color': [
              'match',
              ['get', 'status'],
              'submitted',
              PIN_COLORS.submitted,
              'routed',
              PIN_COLORS.routed,
              'in_progress',
              PIN_COLORS.in_progress,
              /* default */ '#999',
            ],
            'circle-radius': 8,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#fff',
          },
        });

        // Selected-pin highlight (a ring around the selected pin).
        map.addLayer({
          id: PINS_SELECTED_LAYER_ID,
          type: 'circle',
          source: PINS_SOURCE_ID,
          filter: ['==', ['get', 'id'], ''],
          paint: {
            'circle-radius': 14,
            'circle-color': 'transparent',
            'circle-stroke-width': 3,
            'circle-stroke-color': '#E86357',
          },
        });
      }
    });

    // Pin click → side panel.
    const handleClick = (e: MapMouseEvent & { features?: GeoJSON.Feature[] }) => {
      if (!e.features || e.features.length === 0) return;
      const feature = e.features[0];
      const props = feature.properties as
        | { id: string; status: MapStatus; categoryId: string; wardId: string; createdAt: string }
        | null;
      if (!props) return;
      // Cluster clicks (when clustering is on) zoom into the
      // cluster — the spec lists "click pin → side panel", which
      // only applies to single pins.
      if (feature.properties && (feature.properties as Record<string, unknown>).point_count) {
        const clusterId = (feature.properties as Record<string, unknown>).cluster_id as number;
        const source = map.getSource(PINS_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
        if (source && typeof (source as unknown as { getClusterExpansionZoom?: (id: number) => Promise<number> }).getClusterExpansionZoom === 'function') {
          (source as unknown as {
            getClusterExpansionZoom: (id: number, cb: (err: unknown, zoom: number) => void) => void;
          }).getClusterExpansionZoom(clusterId, (err, zoom) => {
            if (err) return;
            map.easeTo({
              center: (feature.geometry as GeoJSON.Point).coordinates as [number, number],
              zoom,
            });
          });
        }
        return;
      }
      const geom = feature.geometry as GeoJSON.Point;
      const [lng, lat] = geom.coordinates;
      const match = pinsRef.current.find((p) => p.id === props.id);
      if (match) {
        onPinClickRef.current(match);
      } else {
        // Fallback if the cached pins ref is stale.
        onPinClickRef.current({
          id: props.id,
          lat,
          lng,
          status: props.status,
          categoryId: props.categoryId,
          wardId: props.wardId,
          createdAt: props.createdAt,
        });
      }
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

  // Update the pin source data + selected highlight when `pins`
  // or `selectedPinId` change.
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
      if (map.getLayer(PINS_SELECTED_LAYER_ID)) {
        map.setFilter(PINS_SELECTED_LAYER_ID, [
          '==',
          ['get', 'id'],
          selectedPinId ?? '',
        ]);
      }
    };
    if (map.isStyleLoaded()) {
      apply();
    } else {
      map.once('load', apply);
    }
  }, [pins, selectedPinId]);

  // Centre the map when the `center` prop changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setCenter([center.lng, center.lat]);
  }, [center.lat, center.lng]);

  return (
    <div
      ref={containerRef}
      data-testid="dispatcher-map"
      style={{
        width: '100%',
        height: '100%',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        background: 'var(--color-map-bg)',
      }}
      role="img"
      aria-label="Map of tickets in your area"
    />
  );
}
