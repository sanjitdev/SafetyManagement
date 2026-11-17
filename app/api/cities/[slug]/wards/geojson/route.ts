/**
 * GET /api/cities/[slug]/wards/geojson — the city's ward boundaries.
 *
 * Serves the ward polygons the report location step draws on the
 * map and resolves the citizen's pin against.
 *
 * ## Why a separate endpoint
 *
 * The ward boundaries are ~58k vertices — a large payload. They do
 * NOT belong in `GET /api/report/bootstrap`, which every step of
 * the report flow fetches and which the location step needs only
 * for the city, the categories and the citizen's own ward.
 *
 * They are also not CITizen-only. A dispatcher map, an admin ward
 * editor and the public landing map all want the same geometry.
 * Putting it behind a citizen-only endpoint would repeat the
 * "citizen-only endpoint coupling" bug this repo has already hit
 * three times (a staff surface calling a citizen-only route and
 * getting a 403).
 *
 * So this is a PUBLIC, city-scoped, cacheable route — the same
 * posture as `GET /api/v1/activity/public`.
 *
 * ## Response shape
 *
 * The rings are PRE-EXTRACTED into plain `[lng, lat]` arrays, so
 * the client needs no GeoJSON parsing and can hand them straight to
 * MapLibre. The bare GeoJSON geometry is not served, because two
 * shapes are in circulation in the database (a bare Polygon and a
 * Feature wrapper) and normalising here keeps the client simple.
 *
 *   {
 *     city: { id, slug, name, nameBn },
 *     wards: [
 *       {
 *         id, number, name, nameBn,
 *         rings: [[ [lng, lat], ... ]],   // 1 ring, or 2 for a split ward
 *         bbox: { southLat, northLat, westLng, eastLng },
 *         centroid: { lat, lng },
 *       }
 *     ]
 *   }
 *
 * Wards with NO geometry are omitted — the client cannot draw
 * them, and an empty entry would only produce a degenerate layer.
 *
 * The `centroid` is a placement hint (the area centroid of the
 * largest ring); it is not guaranteed to be inside the ward. The
 * client resolves a pin with `lib/geo/ward-lookup.ts`
 * `findWardAt`, which is exact.
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db-switch';
import {
  buildWardBoundaries,
  interiorPoint,
  type WardGeometryInput,
} from '@/lib/geo/ward-lookup';

export async function GET(
  _req: Request,
  { params }: { params: { slug: string } },
) {
  const city = await db.city.findUniqueBySlug({ where: { slug: params.slug } });
  if (!city) {
    return NextResponse.json({ error: 'city_not_found' }, { status: 404 });
  }

  const rows = await db.ward.findMany({ where: { cityId: city.id } });
  const inputs: WardGeometryInput[] = rows.map((w) => ({
    id: w.id,
    number: w.number,
    name: w.name,
    nameBn: w.nameBn,
    polygonGeoJson: w.polygonGeoJson,
  }));

  // `buildWardBoundaries` drops the wards with no geometry.
  const boundaries = buildWardBoundaries(inputs);
  // The Prisma path returns rows in DB order; sort so the payload
  // is stable regardless of backend.
  boundaries.sort((a, b) => a.number - b.number);

  const wards = boundaries.map((boundary) => {
    // Prefer a GUARANTEED-interior point over the raw centroid —
    // the four concave/split DNCC wards have a centroid outside
    // their own outline.
    const point = interiorPoint(boundary) ?? boundary.centroid;
    return {
      id: boundary.id,
      number: boundary.number,
      name: boundary.name,
      nameBn: boundary.nameBn,
      rings: boundary.rings,
      bbox: boundary.bbox,
      centroid: point,
    };
  });

  return NextResponse.json(
    {
      city: {
        id: city.id,
        slug: city.slug,
        name: city.name,
        nameBn: city.nameBn,
      },
      wards,
    },
    {
      headers: {
        // The geometry is static configuration, not user data.
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      },
    },
  );
}
