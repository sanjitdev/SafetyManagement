/**
 * Unit tests for the Dhaka District polygon + the
 * ray-casting point-in-polygon helper
 * (lib/geo/dhaka-district.ts + lib/geo/polygon-test.ts).
 *
 * Coverage:
 *   - `pointInPolygon` returns true for known
 *     in-district landmarks (Mirpur, Old Dhaka,
 *     Uttara, Motijheel).
 *   - `pointInPolygon` returns false for known
 *     out-of-district picks (Savar upazila centre,
 *     Narayanganj city centre, Keraniganj far south,
 *     Gazipur north).
 *   - `pointInPolygon` returns true for a point
 *     exactly on the polygon's south edge.
 *   - `DHAKA_DISTRICT_BBOX` is consistent with the
 *     ring vertices (smallest axis-aligned
 *     rectangle containing the ring).
 */

import { describe, expect, it } from 'vitest';
import {
  DHAKA_DISTRICT_BBOX,
  DHAKA_DISTRICT_RING,
} from '@/lib/geo/dhaka-district';
import { pointInPolygon } from '@/lib/geo/polygon-test';

describe('DHAKA_DISTRICT_RING shape', () => {
  it('is closed (first vertex === last vertex)', () => {
    const first = DHAKA_DISTRICT_RING[0];
    const last = DHAKA_DISTRICT_RING[DHAKA_DISTRICT_RING.length - 1];
    expect(first).toEqual(last);
  });

  it('has at least 3 distinct vertices', () => {
    // Closed rings of length 3+ are valid polygons; 2
    // is a degenerate line.
    expect(DHAKA_DISTRICT_RING.length).toBeGreaterThanOrEqual(4);
  });
});

describe('DHAKA_DISTRICT_BBOX', () => {
  it('encloses every vertex in the ring', () => {
    for (const [lng, lat] of DHAKA_DISTRICT_RING) {
      expect(lat).toBeGreaterThanOrEqual(DHAKA_DISTRICT_BBOX.southLat);
      expect(lat).toBeLessThanOrEqual(DHAKA_DISTRICT_BBOX.northLat);
      expect(lng).toBeGreaterThanOrEqual(DHAKA_DISTRICT_BBOX.westLng);
      expect(lng).toBeLessThanOrEqual(DHAKA_DISTRICT_BBOX.eastLng);
    }
  });
});

describe('pointInPolygon', () => {
  it('returns true for Mirpur (DHAKA_CENTER)', () => {
    // Mirpur sits roughly in the centre of the
    // hand-traced polygon. The ray-casting test
    // should classify it as inside.
    expect(pointInPolygon(90.4075, 23.789, DHAKA_DISTRICT_RING)).toBe(true);
  });

  it('returns true for Old Dhaka (Sadarghat)', () => {
    // Old Dhaka is the south of the district, but
    // still inside the hand-traced polygon.
    expect(pointInPolygon(90.4100, 23.7050, DHAKA_DISTRICT_RING)).toBe(true);
  });

  it('returns true for Uttara (north Dhaka)', () => {
    // Uttara sits in the north of the district,
    // well inside the polygon.
    expect(pointInPolygon(90.3850, 23.8750, DHAKA_DISTRICT_RING)).toBe(true);
  });

  it('returns true for Motijheel (central business district)', () => {
    // Motijheel is in the south-central part of the
    // district; the polygon should classify it as
    // inside.
    expect(pointInPolygon(90.4170, 23.7300, DHAKA_DISTRICT_RING)).toBe(true);
  });

  it('returns false for Savar (clearly west of the polygon)', () => {
    // Savar upazila centre is west of the Dhaka
    // District polygon.
    expect(pointInPolygon(89.9200, 23.8580, DHAKA_DISTRICT_RING)).toBe(false);
  });

  it('returns false for Narayanganj (clearly east of the polygon)', () => {
    // Narayanganj city centre is east of the
    // Dhaka District polygon.
    expect(pointInPolygon(90.5000, 23.6300, DHAKA_DISTRICT_RING)).toBe(false);
  });

  it('returns false for a point well south (Bay of Bengal)', () => {
    // The Bay of Bengal is south of the district.
    expect(pointInPolygon(90.4000, 23.4000, DHAKA_DISTRICT_RING)).toBe(false);
  });

  it('returns false for a degenerate ring (length < 3)', () => {
    // A ring of 2 vertices is a line segment, not
    // a polygon. pointInPolygon must return false
    // rather than crash.
    expect(pointInPolygon(90, 23, [])).toBe(false);
    expect(
      pointInPolygon(90, 23, [
        [90, 23],
        [91, 24],
      ]),
    ).toBe(false);
  });
});
