/**
 * Geofence bbox helper for the report location step
 * (lib/report-geofence.ts).
 *
 * Bolt 002-003a Bolt Decision 1: the polygon-based
 * geofence (Gap G1) is deferred to a v1.1 Bolt that
 * reads `ward.polygonGeoJson` from the bootstrap
 * payload. v1 ships a defensive bbox constant
 * (`DHAKA_NORTH_BBOX`) and renders the
 * "out-of-bounds" card against it.
 *
 * This helper is pure so it can be unit-tested
 * without a React runtime. The location page
 * imports `inGeofence` and `clampToGeofence`.
 */

export interface GeofenceBbox {
  southLat: number;
  northLat: number;
  westLng: number;
  eastLng: number;
}

/**
 * Defensive fallback for the v1 dev demo. Dhaka
 * North's approximate bounding box. The v1.1
 * polygon read from `ward.polygonGeoJson` will
 * replace this constant; the helper API does
 * not change.
 */
export const DHAKA_NORTH_BBOX: GeofenceBbox = {
  southLat: 23.74,
  northLat: 23.85,
  westLng: 90.34,
  eastLng: 90.48,
};

/**
 * Returns `true` when the (lat, lng) point is
 * inside the bbox. Inclusive on all four edges
 * (a point exactly on the boundary is in-bounds).
 */
export function inGeofence(
  lat: number,
  lng: number,
  bbox: GeofenceBbox,
): boolean {
  return (
    lat >= bbox.southLat &&
    lat <= bbox.northLat &&
    lng >= bbox.westLng &&
    lng <= bbox.eastLng
  );
}

/**
 * Snap a point to the nearest in-bounds point.
 * Used by the location page's "Move to nearest
 * in-boundary" CTA so the citizen can recover
 * from an out-of-bounds drag in one tap.
 */
export function clampToGeofence(
  lat: number,
  lng: number,
  bbox: GeofenceBbox,
): { lat: number; lng: number } {
  return {
    lat: Math.max(bbox.southLat, Math.min(bbox.northLat, lat)),
    lng: Math.max(bbox.westLng, Math.min(bbox.eastLng, lng)),
  };
}
