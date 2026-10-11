/**
 * Ward polygon validator (lib/admin/ward-polygon.ts).
 *
 * Bolt 005-002 (Intent 005, Unit 002):
 * the server-side guard for
 * `Ward.polygonGeoJson`. Per ADR-010,
 * the polygon is stored as GeoJSON
 * text in v1 (no PostGIS). The
 * validator checks:
 *
 *   1. Shape: `{ type: 'Polygon',
 *      coordinates: [[[lng, lat], ...]] }`
 *      — exactly one ring.
 *   2. Closed ring: the first and last
 *      coordinates are identical
 *      (GeoJSON convention).
 *   3. 3+ vertices: a polygon must
 *      have at least 3 unique
 *      vertices.
 *   4. Coordinates in range: lng ∈
 *      [-180, 180], lat ∈ [-90, 90].
 *
 * Pure function; no I/O. The Vitest
 * suite (`tests/unit/ward-polygon.test.ts`)
 * pins the contract.
 */

export interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: Array<Array<[number, number]>>;
}

export type PolygonValidationResult =
  | { valid: true; polygon: GeoJSONPolygon }
  | {
      valid: false;
      error:
        | 'invalid_polygon'
        | 'polygon_not_closed'
        | 'polygon_too_few_vertices'
        | 'coordinates_out_of_range';
    };

export function validatePolygon(raw: unknown): PolygonValidationResult {
  if (!raw || typeof raw !== 'object') {
    return { valid: false, error: 'invalid_polygon' };
  }
  const obj = raw as Record<string, unknown>;
  if (obj.type !== 'Polygon') {
    return { valid: false, error: 'invalid_polygon' };
  }
  if (!Array.isArray(obj.coordinates)) {
    return { valid: false, error: 'invalid_polygon' };
  }
  const coords = obj.coordinates as unknown;
  if (!Array.isArray(coords) || coords.length !== 1) {
    // GeoJSON Polygons have exactly one
    // outer ring (holes go in subsequent
    // rings; v1 doesn't support holes).
    return { valid: false, error: 'invalid_polygon' };
  }
  const ring = (coords as Array<unknown>)[0];
  if (!Array.isArray(ring)) {
    return { valid: false, error: 'invalid_polygon' };
  }
  const ringArr = ring as Array<unknown>;

  // 3+ vertices (a closed ring of N
  // unique vertices is stored as N+1
  // entries — the last duplicates the
  // first; we accept either form, but
  // require at least 3 entries either
  // way).
  if (ringArr.length < 3) {
    return { valid: false, error: 'polygon_too_few_vertices' };
  }

  // Each entry is a [lng, lat] pair.
  for (const entry of ringArr) {
    if (!Array.isArray(entry) || entry.length < 2) {
      return { valid: false, error: 'invalid_polygon' };
    }
    const lng = entry[0];
    const lat = entry[1];
    if (typeof lng !== 'number' || typeof lat !== 'number') {
      return { valid: false, error: 'invalid_polygon' };
    }
    if (
      !Number.isFinite(lng) ||
      !Number.isFinite(lat) ||
      lng < -180 ||
      lng > 180 ||
      lat < -90 ||
      lat > 90
    ) {
      return { valid: false, error: 'coordinates_out_of_range' };
    }
  }

  // Closed ring: first == last entry.
  const first = ringArr[0] as [number, number];
  const last = ringArr[ringArr.length - 1] as [number, number];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    return { valid: false, error: 'polygon_not_closed' };
  }

  // 3+ unique vertices: a closed
  // triangle is 4 entries (3 unique
  // + the closing duplicate). If the
  // count is 3 (all identical), reject.
  if (ringArr.length < 4) {
    return { valid: false, error: 'polygon_too_few_vertices' };
  }

  return {
    valid: true,
    polygon: {
      type: 'Polygon',
      coordinates: [ringArr.map((e) => {
        const pair = e as [number, number];
        return [pair[0], pair[1]] as [number, number];
      })],
    },
  };
}
