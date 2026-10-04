/**
 * Dedup engine (lib/platform/dedup.ts).
 *
 * PLAT-REQ-004: when a new report is submitted within X meters of an
 * existing open ticket of the same category, the API returns the existing
 * ticket and a `dedup_match: true` flag instead of creating a duplicate.
 *
 * Dedup is a PROMPT, not auto-merge (Feature #3 design rationale). The
 * client decides whether to link or create a new ticket.
 *
 * Implementation: haversine on (cityId, categoryId, status IN open statuses).
 * v1.1: switch to PostGIS ST_DWithin if/when polygon queries arrive.
 */

import type { Ticket } from '@prisma/client';
import { prisma } from '@/lib/db';

const OPEN_STATUSES = ['submitted', 'routed', 'in_progress'] as const;
const EARTH_RADIUS_M = 6_371_000;

function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  return EARTH_RADIUS_M * c;
}

export interface DedupCheckInput {
  cityId: string;
  categoryId: string;
  locationLat: number;
  locationLng: number;
}

export interface DedupMatch {
  existingTicket: Ticket;
  distanceMeters: number;
}

export async function checkDedup(input: DedupCheckInput): Promise<DedupMatch | null> {
  const city = await prisma.city.findUnique({
    where: { id: input.cityId },
    select: { dedupRadiusMeters: true },
  });
  const radius = city?.dedupRadiusMeters ?? 50; // PLAT-REQ-004: 50m default

  // Bounding-box pre-filter on (locationLat, locationLng) so Postgres can use
  // the compound index. 1 degree of latitude ≈ 111 km; we convert radius → degrees.
  const latDelta = radius / 111_000;
  const lngDelta = radius / (111_000 * Math.cos((input.locationLat * Math.PI) / 180));

  const candidates = await prisma.ticket.findMany({
    where: {
      cityId: input.cityId,
      categoryId: input.categoryId,
      status: { in: [...OPEN_STATUSES] },
      locationLat: {
        gte: input.locationLat - latDelta,
        lte: input.locationLat + latDelta,
      },
      locationLng: {
        gte: input.locationLng - lngDelta,
        lte: input.locationLng + lngDelta,
      },
    },
    take: 20, // bounding box may over-include; refine with haversine
  });

  let best: DedupMatch | null = null;
  for (const t of candidates) {
    const d = haversineMeters(
      { lat: input.locationLat, lng: input.locationLng },
      { lat: t.locationLat, lng: t.locationLng },
    );
    if (d <= radius && (!best || d < best.distanceMeters)) {
      best = { existingTicket: t, distanceMeters: d };
    }
  }
  return best;
}