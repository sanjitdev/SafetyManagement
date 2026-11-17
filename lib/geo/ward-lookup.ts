/**
 * Ward boundary lookup (lib/geo/ward-lookup.ts).
 *
 * Resolves a coordinate to the ward that contains it, and parses
 * the stored `Ward.polygonGeoJson` into the shape the map and the
 * report flow need.
 *
 * ## Why this module exists
 *
 * The report location step used to show the CITIZEN'S home ward,
 * regardless of where the pin actually sat: the ward came from
 * `GET /api/report/bootstrap` (the session's ward) and never changed
 * when the pin moved. A citizen could drop a pin in Ward 20 and the
 * ticket was still filed under their home ward — which, because the
 * ward is an AUTHORISATION boundary (`lib/auth/guards.ts`
 * `requireScope`), made the report invisible to the ward's own
 * dispatcher and crew.
 *
 * This module is the pure half of the fix: it answers "which ward
 * contains this point?" from the stored geometry.
 *
 * ## Polygon shapes in circulation
 *
 * Two shapes reach this module, and both must parse:
 *
 *   1. A bare Polygon — `{ type: 'Polygon', coordinates: [ring] }`.
 *      This is what `lib/admin/ward-polygon.ts` `validatePolygon()`
 *      writes when an admin publishes a boundary.
 *   2. A Feature wrapper — `{ type: 'Feature', properties, geometry }`.
 *      This is what `prisma/seed.ts` used to write.
 *
 * A `MultiPolygon` (wards 16 and 32 of the DNCC import) carries
 * several disjoint rings and is accepted too: the parts are
 * DISJOINT, not holes, so each is tested independently.
 *
 * ## "No geometry" vs "outside the city"
 *
 * The distinction matters, and they are not the same thing:
 *
 *   - A ward whose stored geometry is missing or empty (the
 *     `coordinates: [[]]` placeholder the seed used to write, or
 *     a `null` column) has NO GEOMETRY. It is skipped entirely —
 *     it never matches, and it never blocks the others.
 *   - A point that matches no ward that HAS geometry is genuinely
 *     outside every ward (e.g. inside Dhaka Cantonment, which is
 *     an enclave within the ward mosaic).
 *
 * `parseWardBoundary` returns `null` for the first case, and
 * `findWardAt` returns `null` for the second. The caller
 * distinguishes them by checking whether ANY ward has geometry.
 *
 * ## Coordinate order
 *
 * GeoJSON canonical: `[lng, lat]`. `pointInPolygon` (lib/geo/
 * polygon-test.ts) takes `(lng, lat)` in that order too. The
 * public functions here take `(lat, lng)` — the order the app
 * uses everywhere else — and convert at the boundary.
 *
 * Pure module: no node: imports, safe to import from both client
 * components and server modules (same contract as
 * `lib/geo/polygon-test.ts`).
 */

import type { GeofenceBbox } from '@/lib/report-geofence';
import type { LinearRing } from '@/lib/geo/dhaka-district';
import { pointInPolygon } from '@/lib/geo/polygon-test';

/**
 * A ward boundary, parsed and ready to test against.
 *
 * `rings` holds one or more closed rings. A simple ward has
 * exactly one; a ward whose boundary is split into disjoint parts
 * (DNCC wards 16 and 32) has more.
 */
export interface WardBoundary {
  /** The ward's database id. */
  id: string;
  /** The ward number within its city (1..N). */
  number: number;
  /** English display name. */
  name: string;
  /** Bangla display name, when the city has one. */
  nameBn: string | null;
  /** One or more closed rings, in `[lng, lat]` order. */
  rings: LinearRing[];
  /** Bounding box of every ring — the cheap pre-filter. */
  bbox: GeofenceBbox;
  /**
   * A representative interior point, used to place a pin inside
   * this ward when the app needs a default position.
   *
   * This is the area centroid of the largest ring. It is a
   * PLACEMENT hint, not a guarantee of interiority — a concave
   * ward can still put its centroid outside its own outline, so
   * callers that need certainty must use `interiorPoint()`.
   */
  centroid: { lat: number; lng: number };
}

/** The minimum vertices a ring needs before it can enclose a point. */
const MIN_RING_VERTICES = 3;

/**
 * A ward row as it comes out of the database, or as it arrives
 * over the wire from the ward-geometry endpoint.
 */
export interface WardGeometryInput {
  id: string;
  number: number;
  name: string;
  nameBn: string | null;
  /** The raw GeoJSON text, or an already-parsed object. */
  polygonGeoJson: string | null | unknown;
}

/**
 * Read a bbox out of one ring.
 *
 * The ring is expected to be closed, but this tolerates an open
 * one — the bbox is only a pre-filter, so an off-by-one on the
 * closing vertex cannot affect correctness.
 */
function ringBbox(ring: LinearRing): GeofenceBbox {
  let southLat = Number.POSITIVE_INFINITY;
  let northLat = Number.NEGATIVE_INFINITY;
  let westLng = Number.POSITIVE_INFINITY;
  let eastLng = Number.NEGATIVE_INFINITY;
  for (const [lng, lat] of ring) {
    if (lat < southLat) southLat = lat;
    if (lat > northLat) northLat = lat;
    if (lng < westLng) westLng = lng;
    if (lng > eastLng) eastLng = lng;
  }
  return { southLat, northLat, westLng, eastLng };
}

/**
 * Merge two bboxes into their union.
 */
function mergeBbox(a: GeofenceBbox, b: GeofenceBbox): GeofenceBbox {
  return {
    southLat: Math.min(a.southLat, b.southLat),
    northLat: Math.max(a.northLat, b.northLat),
    westLng: Math.min(a.westLng, b.westLng),
    eastLng: Math.max(a.eastLng, b.eastLng),
  };
}

/**
 * The AREA centroid of a closed ring, with the vertex mean as a
 * fallback for a degenerate (zero-area) ring.
 *
 * The vertex mean is not good enough on its own: four of the 54
 * DNCC wards (5, 16, 32, 49) are concave or split into disjoint
 * parts, and their vertex mean lands OUTSIDE the ward — which
 * would place a default pin in a neighbouring ward.
 *
 * The area centroid is the standard polygon centroid (the mean of
 * the triangle fan from the origin), which tracks the polygon's
 * mass and lands inside the ward for a convex-ish shape. It is
 * still only a HINT — see `WardBoundary.centroid` — so callers
 * that need certainty must verify the point with `findWardAt`.
 */
function ringCentroid(ring: LinearRing): { lat: number; lng: number } {
  let twiceArea = 0;
  let lngAccum = 0;
  let latAccum = 0;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as [number, number];
    const [xj, yj] = ring[j] as [number, number];
    const cross = xj * yi - xi * yj;
    twiceArea += cross;
    lngAccum += (xj + xi) * cross;
    latAccum += (yj + yi) * cross;
  }

  if (Math.abs(twiceArea) > 1e-12) {
    return {
      lng: lngAccum / (3 * twiceArea),
      lat: latAccum / (3 * twiceArea),
    };
  }

  // Degenerate ring (zero area) — fall back to the vertex mean.
  let sumLng = 0;
  let sumLat = 0;
  for (const [lng, lat] of ring) {
    sumLng += lng;
    sumLat += lat;
  }
  const n = ring.length || 1;
  return { lat: sumLat / n, lng: sumLng / n };
}

/**
 * Type guard for a `[lng, lat]` pair.
 */
function isLngLatPair(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

/**
 * Extract the coordinate rings from a GeoJSON geometry object.
 *
 * Handles `Polygon` (one ring) and `MultiPolygon` (several
 * polygons, each with one ring). Returns an empty array when the
 * geometry is unusable — including the `coordinates: [[]]`
 * placeholder the seed used to write, which is a ring with no
 * vertices at all.
 *
 * Holes are NOT supported: a Polygon with more than one ring is
 * treated as an error (the app's `validatePolygon` likewise
 * accepts exactly one ring per polygon, so nothing valid in the
 * database can carry a hole).
 */
function extractRings(geometry: unknown): LinearRing[] {
  if (!geometry || typeof geometry !== 'object') return [];
  const obj = geometry as Record<string, unknown>;
  const type = obj.type;
  const coordinates = obj.coordinates;
  if (!Array.isArray(coordinates)) return [];

  if (type === 'Polygon') {
    // `coordinates` is [ring].
    const ring = coordinates[0];
    if (!Array.isArray(ring) || !isLngLatPair(ring[0])) return [];
    if (ring.length < MIN_RING_VERTICES) return [];
    return [ring as LinearRing];
  }

  if (type === 'MultiPolygon') {
    // `coordinates` is [polygon, ...] and each polygon is [ring].
    const rings: LinearRing[] = [];
    for (const polygon of coordinates) {
      if (!Array.isArray(polygon)) continue;
      const ring = polygon[0];
      if (!Array.isArray(ring) || !isLngLatPair(ring[0])) continue;
      if (ring.length < MIN_RING_VERTICES) continue;
      rings.push(ring as LinearRing);
    }
    return rings;
  }

  return [];
}

/**
 * Parse a stored `polygonGeoJson` value into its rings.
 *
 * Accepts the JSON TEXT (the column's real type) or an
 * already-parsed object (the shape the API layer hands around).
 * Accepts both the bare-Polygon and the Feature-wrapper shapes.
 *
 * Returns an EMPTY ARRAY when there is no usable geometry — that
 * is the "no geometry" case, distinct from "outside the city".
 */
export function parseWardRings(raw: string | null | unknown): LinearRing[] {
  if (raw === null || raw === undefined) return [];

  let value: unknown = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      value = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }

  if (!value || typeof value !== 'object') return [];
  const obj = value as Record<string, unknown>;

  // Feature wrapper: { type: 'Feature', geometry: { ... } }.
  if (obj.type === 'Feature' || obj.geometry !== undefined) {
    return extractRings(obj.geometry);
  }

  // Bare geometry: { type: 'Polygon' | 'MultiPolygon', coordinates }.
  return extractRings(obj);
}

/**
 * Parse one ward into a `WardBoundary`.
 *
 * Returns `null` when the ward has no usable geometry. The caller
 * keeps the ward's identity separately (the database row already
 * has it), so a `null` here means "skip this ward when looking up",
 * NOT "this ward does not exist".
 */
export function parseWardBoundary(
  ward: WardGeometryInput,
): WardBoundary | null {
  const rings = parseWardRings(ward.polygonGeoJson);
  if (rings.length === 0) return null;

  let bbox = ringBbox(rings[0] as LinearRing);
  for (let i = 1; i < rings.length; i += 1) {
    bbox = mergeBbox(bbox, ringBbox(rings[i] as LinearRing));
  }

  // Place the hint point in the LARGEST ring — for a multi-part
  // ward, the sliver part is a poor default position.
  let largest = rings[0] as LinearRing;
  for (const ring of rings) {
    if (ring.length > largest.length) largest = ring;
  }

  return {
    id: ward.id,
    number: ward.number,
    name: ward.name,
    nameBn: ward.nameBn,
    rings,
    bbox,
    centroid: ringCentroid(largest),
  };
}

/**
 * Parse a list of wards into the boundaries that have geometry.
 *
 * Wards without geometry are DROPPED. The returned list preserves
 * the input order.
 */
export function buildWardBoundaries(
  wards: readonly WardGeometryInput[],
): WardBoundary[] {
  const out: WardBoundary[] = [];
  for (const ward of wards) {
    const parsed = parseWardBoundary(ward);
    if (parsed) out.push(parsed);
  }
  return out;
}

/**
 * Does the point fall inside this ward's bbox?
 *
 * The cheap pre-filter. A point outside the bbox cannot be inside
 * the polygon, so the expensive ray-cast is only worth running on
 * the handful of wards whose bbox contains the point.
 */
function bboxContains(bbox: GeofenceBbox, lat: number, lng: number): boolean {
  return (
    lat >= bbox.southLat &&
    lat <= bbox.northLat &&
    lng >= bbox.westLng &&
    lng <= bbox.eastLng
  );
}

/**
 * Find the ward containing a point.
 *
 * Returns `null` when the point is in no ward — either because it
 * is outside the city, or because it falls in a gap in the ward
 * mosaic (Dhaka Cantonment is such a gap: a 19 km² enclave that
 * belongs to no DNCC ward).
 *
 * The point argument is `(lat, lng)` — the order the app uses
 * everywhere else. GeoJSON order (`[lng, lat]`) is used
 * internally.
 */
export function findWardAt(
  boundaries: readonly WardBoundary[],
  lat: number,
  lng: number,
): WardBoundary | null {
  for (const boundary of boundaries) {
    if (!bboxContains(boundary.bbox, lat, lng)) continue;
    for (const ring of boundary.rings) {
      if (pointInPolygon(lng, lat, ring)) return boundary;
    }
  }
  return null;
}

/**
 * Find the ward with a given number.
 */
export function findWardByNumber(
  boundaries: readonly WardBoundary[],
  number: number,
): WardBoundary | null {
  for (const boundary of boundaries) {
    if (boundary.number === number) return boundary;
  }
  return null;
}

/**
 * A point guaranteed to lie INSIDE this ward.
 *
 * The report flow needs this to place the pin somewhere sensible
 * by default: the citizen's home ward, not whatever the map's
 * default centre happens to be. `DHAKA_CENTER` sits in Ward 19,
 * while the demo dispatchers and crews are all scoped to Ward 14
 * — so a default pin on the map centre would file a ticket that
 * no demo staff member could see.
 *
 * The area centroid is tried first. If it falls outside the ward
 * (which happens for the four concave/split DNCC wards 5, 16, 32
 * and 49), the ring's own vertices are tried in turn — a vertex
 * lies ON the boundary, which the ray-casting test counts as
 * inside, so one of them is guaranteed to land in the ward.
 *
 * Returns `null` only when the ward has no geometry at all.
 */
export function interiorPoint(boundary: WardBoundary): {
  lat: number;
  lng: number;
} | null {
  const rings = boundary.rings;
  if (rings.length === 0) return null;

  const centroid = boundary.centroid;
  for (const ring of rings) {
    if (pointInPolygon(centroid.lng, centroid.lat, ring)) {
      return centroid;
    }
  }

  // The centroid missed. Fall back to a ring vertex.
  for (const ring of rings) {
    for (const [lng, lat] of ring) {
      if (pointInPolygon(lng, lat, ring)) return { lat, lng };
    }
  }

  return null;
}
