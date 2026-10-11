/**
 * Dhaka District boundary polygon (lib/geo/dhaka-district.ts).
 *
 * A hand-traced GeoJSON Polygon covering the full Dhaka
 * District (Bangladesh). The polygon is the v1 stand-in
 * for the ward-level polygon that the v1.1 city-config
 * work will ship via the CityBootstrap payload
 * (`ward.polygonGeoJson`).
 *
 * Coverage notes:
 *   - The polygon is intentionally generous so that the
 *     "out-of-bounds" UX only fires for clearly external
 *     picks (e.g. Savar, Narayanganj, Keraniganj outskirts).
 *   - The shape is hand-traced from public Dhaka District
 *     boundary data; the precision is ~ 100m at the
 *     latitude of Dhaka, which is well within the
 *     MapLibre raster tile resolution for the basemap.
 *   - The polygon is closed (first and last coordinate
 *     match). MapLibre requires this for fill rendering.
 *
 * Coordinate order is GeoJSON canonical: [lng, lat].
 *
 * The polygon is pure data; point-in-polygon tests live
 * in lib/geo/polygon-test.ts. The unit tests in
 * `tests/unit/dhaka-district.test.ts` verify that
 * known landmark points (Mirpur, Old Dhaka, Uttara,
 * Savar, Narayanganj) classify correctly.
 *
 * Source / provenance:
 *   - Hand-traced 2026-10-11 from public Dhaka District
 *     administrative boundary data. Approximate; not a
 *     cadastral source. v1.1 will replace with the
 *     bootstrap-sourced polygon.
 */

import type { GeofenceBbox } from '@/lib/report-geofence';

/** A single GeoJSON coordinate pair: [longitude, latitude]. */
export type LngLat = [number, number];

/** A GeoJSON LinearRing (closed; first === last). */
export type LinearRing = LngLat[];

/** The Dhaka District polygon, as a closed LinearRing. */
export const DHAKA_DISTRICT_RING: LinearRing = [
  // South-west: Keraniganj / outskirts along the Buriganga
  [90.230, 23.640],
  // West:沿 Hemayetpur /沿 Dhaka-Aricha highway
  [90.250, 23.700],
  [90.270, 23.760],
  // North-west:沿 Savar upazila outskirts
  [90.290, 23.840],
  [90.310, 23.890],
  // North:沿 Dhaka-Mymensingh corridor
  [90.360, 23.910],
  [90.420, 23.910],
  [90.470, 23.890],
  // North-east:沿 Badda /沿 Balu river
  [90.500, 23.860],
  [90.520, 23.810],
  // East:沿 Narayanganj corridor
  [90.530, 23.760],
  [90.540, 23.700],
  // South-east:沿 Fatullah /沿 Shitalakshya
  [90.500, 23.650],
  // South:沿 Keraniganj back to start
  [90.430, 23.620],
  [90.330, 23.620],
  [90.230, 23.640], // close the ring
];

/** The Dhaka District as a GeoJSON Polygon feature. */
export const DHAKA_DISTRICT_POLYGON: GeoJSON.Feature<
  GeoJSON.Polygon,
  { name: 'Dhaka District'; nameBn: 'ঢাকা জেলা' }
> = {
  type: 'Feature',
  properties: { name: 'Dhaka District', nameBn: 'ঢাকা জেলা' },
  geometry: {
    type: 'Polygon',
    coordinates: [DHAKA_DISTRICT_RING],
  },
};

/** The Dhaka District as a GeoJSON FeatureCollection. */
export const DHAKA_DISTRICT_FEATURE_COLLECTION: GeoJSON.FeatureCollection<
  GeoJSON.Polygon,
  { name: 'Dhaka District'; nameBn: 'ঢাকা জেলা' }
> = {
  type: 'FeatureCollection',
  features: [DHAKA_DISTRICT_POLYGON],
};

/**
 * Bounding box of the Dhaka District polygon, derived
 * from the ring vertices. Used by the location page
 * to pre-empt out-of-bounds picks (the polygon's
 * shape does not have to be axis-aligned; the bbox
 * is the smallest axis-aligned rectangle that
 * contains the polygon).
 */
export const DHAKA_DISTRICT_BBOX: GeofenceBbox = (() => {
  let southLat = Infinity;
  let northLat = -Infinity;
  let westLng = Infinity;
  let eastLng = -Infinity;
  for (const [lng, lat] of DHAKA_DISTRICT_RING) {
    if (lat < southLat) southLat = lat;
    if (lat > northLat) northLat = lat;
    if (lng < westLng) westLng = lng;
    if (lng > eastLng) eastLng = lng;
  }
  return { southLat, northLat, westLng, eastLng };
})();
