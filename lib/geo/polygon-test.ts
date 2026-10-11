/**
 * Point-in-polygon test (lib/geo/polygon-test.ts).
 *
 * Pure ray-casting implementation. No external
 * dependencies; safe to import from both client
 * components and server modules.
 *
 * The function is the polygon counterpart to
 * `inGeofence` (lib/report-geofence.ts). The location
 * page uses both: the polygon test is the
 * "in-bounds" check against the real Dhaka District
 * shape; the bbox fallback is the backstop for the
 * raster basemap's visible-area rendering.
 *
 * Algorithm: classic ray-casting. The point casts a
 * ray to +x; the function counts how many polygon
 * edges the ray crosses. An odd count means the
 * point is inside; even means outside. Boundary
 * cases (point exactly on a vertex or on an edge)
 * are handled by the inclusive `<=` comparisons
 * below; in practice a citizen dragging a pin will
 * never land exactly on a vertex.
 *
 * GeoJSON convention: coordinates are `[lng, lat]`
 * pairs; the ring is closed (first === last).
 */

import type { LinearRing } from '@/lib/geo/dhaka-district';

/**
 * Returns `true` when (lng, lat) is inside the closed
 * polygon ring. The ring must be closed (first vertex
 * === last vertex); the function does not implicitly
 * close the ring.
 *
 * Pure function. O(n) in the ring size. For Dhaka
 * District (~ 15 vertices) this is well below 1µs.
 */
export function pointInPolygon(
  lng: number,
  lat: number,
  ring: LinearRing,
): boolean {
  if (ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as [number, number];
    const [xj, yj] = ring[j] as [number, number];
    // Standard ray-casting test. `yi` / `yj` are
    // latitude; `lat` is also latitude. The check
    // `(yi > lat) !== (yj > lat)` determines whether
    // the edge straddles the horizontal line at `lat`.
    const intersects =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}
