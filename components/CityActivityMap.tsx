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
 * used through Bolt 005-004. Per the project memory
 * (`aidlc/spaces/default/memory/project.md →
 * Corrections`, learned 2026-10-11), the MapLibre +
 * OpenStreetMap basemap is the v1 contract for every
 * city-facing map surface; the SVG placeholder was the
 * pre-pilot fallback and is retired with this bolt.
 *
 * Reuses the same OSM raster basemap and Dhaka District
 * polygon pattern as `components/MapView.tsx` (1.7
 * location page) and `components/DispatcherMap.tsx`
 * (3.5 dispatcher map). A v1.1 bolt can extract a
 * shared `lib/map/osm-raster.ts` to deduplicate the
 * OSM constants; for now the two-line tile URL +
 * attribution are repeated for component independence.
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
}

interface CityActivityMapProps {
  pins: CityActivityPin[];
  center: { lat: number; lng: number };
  pinColors?: Partial<Record<CityActivityStatus, string>>;
}

const DHAKA_DISTRICT_SOURCE_ID = 'dhaka-district';
const DHAKA_DISTRICT_FILL_LAYER_ID = 'dhaka-district-fill';
const DHAKA_DISTRICT_LINE_LAYER_ID = 'dhaka-district-line';

const PINS_SOURCE_ID = 'city-activity-pins';
const PINS_LAYER_ID = 'city-activity-pins-layer';
const PINS_CLUSTER_LAYER_ID = 'city-activity-pins-cluster';
const PINS_CLUSTER_COUNT_LAYER_ID = 'city-activity-pins-cluster-count';

/**
 * OpenStreetMap raster basemap (same source as
 * `components/MapView.tsx` and `components/DispatcherMap.tsx`).
 * No API key, no token, no auth. The OSM Tile Usage Policy
 * forbids heavy production use; a production deployment at
 * scale should swap to a paid provider (Mapbox / MapTiler
 * / Stadia) or self-host.
 */
const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

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
  submitted: '#b58410', // warning
  routed: '#0E5A4A', // primary
  in_progress: '#1c7ed6', // blue
  resolved: '#1f7a3f', // green
  closed: '#5b6770', // grey
  cancelled: '#9b2c2c', // red
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
      },
      geometry: {
        type: 'Point',
        coordinates: [p.lng, p.lat],
      },
    })),
  };
}

export default function CityActivityMap({
  pins,
  center,
  pinColors,
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
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      'top-right',
    );

    map.on('load', () => {
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
        //
        // The `filter` key must be OMITTED entirely when clustering is
        // off — MapLibre rejects an explicit `filter: undefined`
        // ("array expected, undefined found") and aborts addLayer,
        // leaving the citizen's activity-map pins undrawn.
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
    };
    if (map.isStyleLoaded()) {
      apply();
    } else {
      map.once('load', apply);
    }
  }, [pins]);

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
        position: 'absolute',
        inset: 0,
      }}
    />
  );
}
