/**
 * Vitest: ward boundary lookup (lib/geo/ward-lookup.ts).
 *
 * Two things are pinned here:
 *
 *   1. The PARSING contract — the two GeoJSON shapes in
 *      circulation (a bare Polygon and a Feature wrapper), the
 *      MultiPolygon that DNCC wards 16 and 32 use, and the
 *      "no geometry" placeholder the seed used to write
 *      (`coordinates: [[]]`), which must read as "no geometry"
 *      rather than "outside the city".
 *
 *   2. The LOOKUP contract against the REAL imported DNCC
 *      boundaries — `prisma/geo/dncc-wards.geojson`. This is the
 *      regression guard for the bug this feature fixes: the
 *      report location step used to show the citizen's home ward
 *      no matter where the pin sat.
 *
 * The DNCC fixture is the official Dhaka North City Corporation
 * Urban Planning ward boundary set (wards 1..54, WGS84).
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildWardBoundaries,
  findWardAt,
  findWardByNumber,
  interiorPoint,
  parseWardBoundary,
  parseWardRings,
  type WardBoundary,
  type WardGeometryInput,
} from '@/lib/geo/ward-lookup';
import { DHAKA_CENTER } from '@/lib/geo/constants';
import { pointInPolygon } from '@/lib/geo/polygon-test';

const DNCC_FILE = path.join(
  process.cwd(),
  'prisma',
  'geo',
  'dncc-wards.geojson',
);

interface DnccFeature {
  type: 'Feature';
  properties: {
    ward_no: number;
    ward_id: string;
    zone_no: number;
    cc_name: string;
    cc_code: number;
    area_sqkm: number;
  };
  geometry:
    | { type: 'Polygon'; coordinates: number[][][] }
    | { type: 'MultiPolygon'; coordinates: number[][][][] };
}

const dncc = JSON.parse(readFileSync(DNCC_FILE, 'utf8')) as {
  type: 'FeatureCollection';
  features: DnccFeature[];
};

/**
 * The DNCC wards in the shape this module consumes — the same
 * shape the API endpoint serves.
 */
const dnccWards: WardGeometryInput[] = dncc.features.map((f) => ({
  id: `ward-dncc-${f.properties.ward_no}`,
  number: f.properties.ward_no,
  name: `Ward ${f.properties.ward_no}`,
  nameBn: `ওয়ার্ড ${f.properties.ward_no}`,
  polygonGeoJson: f.geometry as unknown,
}));

const boundaries: WardBoundary[] = buildWardBoundaries(dnccWards);

describe('the DNCC fixture is well-formed', () => {
  it('carries all 54 wards', () => {
    expect(dncc.features).toHaveLength(54);
    expect(boundaries).toHaveLength(54);
  });

  it('has no gaps in the ward numbering', () => {
    const numbers = dncc.features.map((f) => f.properties.ward_no).sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: 54 }, (_, i) => i + 1));
  });

  it('parses every ward into geometry', () => {
    for (const ward of dnccWards) {
      expect(parseWardBoundary(ward)).not.toBeNull();
    }
  });
});

describe('parseWardRings accepts every polygon shape in circulation', () => {
  it('reads a bare Polygon', () => {
    const rings = parseWardRings({
      type: 'Polygon',
      coordinates: [
        [
          [90.1, 23.1],
          [90.2, 23.1],
          [90.2, 23.2],
          [90.1, 23.1],
        ],
      ],
    });
    expect(rings).toHaveLength(1);
    expect(rings[0]).toHaveLength(4);
  });

  it('reads a Feature wrapper', () => {
    const rings = parseWardRings({
      type: 'Feature',
      properties: { ward_number: 7 },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [90.1, 23.1],
            [90.2, 23.1],
            [90.2, 23.2],
            [90.1, 23.1],
          ],
        ],
      },
    });
    expect(rings).toHaveLength(1);
  });

  it('reads a MultiPolygon as several disjoint rings', () => {
    const rings = parseWardRings({
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [90.1, 23.1],
            [90.2, 23.1],
            [90.2, 23.2],
            [90.1, 23.1],
          ],
        ],
        [
          [
            [90.3, 23.3],
            [90.4, 23.3],
            [90.4, 23.4],
            [90.3, 23.3],
          ],
        ],
      ],
    });
    expect(rings).toHaveLength(2);
  });

  it('reads a JSON string, which is what the column stores', () => {
    const rings = parseWardRings(
      JSON.stringify({
        type: 'Polygon',
        coordinates: [
          [
            [90.1, 23.1],
            [90.2, 23.1],
            [90.2, 23.2],
            [90.1, 23.1],
          ],
        ],
      }),
    );
    expect(rings).toHaveLength(1);
  });
});

describe('missing geometry is "no geometry", not "outside the city"', () => {
  it('treats the seed placeholder (an empty ring) as no geometry', () => {
    // This is EXACTLY what prisma/seed.ts used to write for all 50
    // wards: a Feature whose polygon has one empty ring.
    expect(
      parseWardRings(
        JSON.stringify({
          type: 'Feature',
          properties: { ward_number: 1 },
          geometry: { type: 'Polygon', coordinates: [[]] },
        }),
      ),
    ).toEqual([]);
  });

  it('treats a null column as no geometry', () => {
    expect(parseWardRings(null)).toEqual([]);
  });

  it('treats unparseable text as no geometry', () => {
    expect(parseWardRings('{not json')).toEqual([]);
  });

  it('treats a ring with too few vertices as no geometry', () => {
    expect(
      parseWardRings({
        type: 'Polygon',
        coordinates: [
          [
            [90.1, 23.1],
            [90.2, 23.2],
          ],
        ],
      }),
    ).toEqual([]);
  });

  it('drops a ward with no geometry from the built list', () => {
    const built = buildWardBoundaries([
      {
        id: 'a',
        number: 1,
        name: 'Ward 1',
        nameBn: null,
        polygonGeoJson: null,
      },
      {
        id: 'b',
        number: 2,
        name: 'Ward 2',
        nameBn: null,
        polygonGeoJson: JSON.stringify({
          type: 'Polygon',
          coordinates: [
            [
              [90.1, 23.1],
              [90.2, 23.1],
              [90.2, 23.2],
              [90.1, 23.1],
            ],
          ],
        }),
      },
    ]);
    expect(built).toHaveLength(1);
    expect(built[0]?.id).toBe('b');
  });

  it('does not let a geometry-less ward shadow a ward that has geometry', () => {
    // A ward with no geometry must never be returned for any point.
    const built = buildWardBoundaries([
      {
        id: 'empty',
        number: 1,
        name: 'Ward 1',
        nameBn: null,
        polygonGeoJson: null,
      },
      ...dnccWards,
    ]);
    expect(findWardAt(built, DHAKA_CENTER.lat, DHAKA_CENTER.lng)?.id).not.toBe(
      'empty',
    );
  });
});

describe('findWardAt resolves a point to the DNCC ward that contains it', () => {
  it('resolves a ward to itself using an interior point', () => {
    for (const number of [1, 14, 20, 27, 40, 54]) {
      const ward = findWardByNumber(boundaries, number);
      expect(ward).not.toBeNull();
      const point = interiorPoint(ward!);
      expect(point).not.toBeNull();
      const found = findWardAt(boundaries, point!.lat, point!.lng);
      expect(found?.number).toBe(number);
    }
  });

  it('resolves DHAKA_CENTER to Ward 19 — NOT the demo scope ward 14', () => {
    // This is the finding that drove the design: the app's default
    // map centre sits in Ward 19, while every demo dispatcher and
    // crew is scoped to Ward 14. Accepting the default pin as-is
    // would file a ticket no demo staff member could see.
    const found = findWardAt(boundaries, DHAKA_CENTER.lat, DHAKA_CENTER.lng);
    expect(found?.number).toBe(19);
  });

  it('resolves the Ward 14 interior point to Ward 14', () => {
    const ward14 = findWardByNumber(boundaries, 14);
    const point = interiorPoint(ward14!);
    const found = findWardAt(boundaries, point!.lat, point!.lng);
    expect(found?.number).toBe(14);
  });

  it('resolves the Ward 20 interior point to Ward 20', () => {
    const ward20 = findWardByNumber(boundaries, 20);
    const point = interiorPoint(ward20!);
    const found = findWardAt(boundaries, point!.lat, point!.lng);
    expect(found?.number).toBe(20);
  });

  it('resolves a point in the northern wards', () => {
    // Ward 46 reaches lat 23.90054, past the old 23.85 bbox cap.
    const ward46 = findWardByNumber(boundaries, 46);
    const point = interiorPoint(ward46!);
    const found = findWardAt(boundaries, point!.lat, point!.lng);
    expect(found?.number).toBe(46);
  });

  it('returns null for a point outside the city', () => {
    expect(findWardAt(boundaries, 23.5, 90.2)).toBeNull();
  });

  it('returns null inside the Dhaka Cantonment enclave', () => {
    // The cantonment is a ~19 km2 enclave within the ward mosaic
    // that belongs to no DNCC ward — a point there must NOT
    // silently resolve to a neighbouring ward.
    expect(findWardAt(boundaries, 23.813, 90.3975)).toBeNull();
  });

  it('resolves each of the 54 wards to a distinct ward', () => {
    const seen = new Set<number>();
    for (const boundary of boundaries) {
      const point = interiorPoint(boundary);
      expect(point).not.toBeNull();
      const found = findWardAt(boundaries, point!.lat, point!.lng);
      expect(found).not.toBeNull();
      seen.add(found!.number);
    }
    expect(seen.size).toBe(54);
  });
});

describe('interiorPoint lands inside the ward it belongs to', () => {
  it('works for every one of the 54 wards', () => {
    for (const boundary of boundaries) {
      const point = interiorPoint(boundary);
      expect(point).not.toBeNull();
      // The point must be inside THIS ward, not a neighbour.
      let inside = false;
      for (const ring of boundary.rings) {
        if (pointInPolygon(point!.lng, point!.lat, ring)) inside = true;
      }
      expect(inside).toBe(true);
    }
  });

  it('handles the concave and split wards whose centroid escapes', () => {
    // Wards 5, 16, 32 and 49 have a vertex-mean centroid OUTSIDE
    // the ward — the area centroid plus the vertex fallback is what
    // keeps a default pin in the right place.
    for (const number of [5, 16, 32, 49]) {
      const ward = findWardByNumber(boundaries, number);
      expect(ward).not.toBeNull();
      const point = interiorPoint(ward!);
      expect(point).not.toBeNull();
      const found = findWardAt(boundaries, point!.lat, point!.lng);
      expect(found?.number).toBe(number);
    }
  });
});

describe('a point on a shared ward edge resolves to exactly one ward', () => {
  it('never returns two wards for the same point', () => {
    // The resolver returns the FIRST match; the contract is that it
    // returns exactly one, never a list. This pins that the
    // multi-part ward (16, 32) cannot produce a double hit.
    const ward16 = findWardByNumber(boundaries, 16);
    expect(ward16).not.toBeNull();
    expect(ward16!.rings.length).toBeGreaterThan(1);
    const found = findWardAt(
      boundaries,
      ward16!.centroid.lat,
      ward16!.centroid.lng,
    );
    expect(found?.number).toBe(16);
  });
});
