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
 *
 * Backend-agnostic: queries the in-memory dev store when CITYFIX_DEV_STORE
 * is set, otherwise Prisma.
 */

import { db } from '@/lib/db-switch';
import type { TicketStatus } from '@prisma/client';

const OPEN_STATUSES: TicketStatus[] = ['submitted', 'routed', 'in_progress'];
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
  existingTicketId: string;
  existingTicketStatus: TicketStatus;
  distanceMeters: number;
  existingLocationLat: number;
  existingLocationLng: number;
  existingCreatedAt: string;
}

export async function checkDedup(input: DedupCheckInput): Promise<DedupMatch | null> {
  const city = await db.city.findUnique({ where: { id: input.cityId } });
  const radius = city?.dedupRadiusMeters ?? 50; // PLAT-REQ-004: 50m default

  // Bounding-box pre-filter on (locationLat, locationLng) so the index
  // can narrow. 1 degree of latitude ≈ 111 km; we convert radius → degrees.
  const latDelta = radius / 111_000;
  const lngDelta = radius / (111_000 * Math.cos((input.locationLat * Math.PI) / 180));

  const candidates = await db.ticket.findMany({
    where: {
      cityId: input.cityId,
      categoryId: input.categoryId,
      status: { in: OPEN_STATUSES },
      locationLat: {
        gte: input.locationLat - latDelta,
        lte: input.locationLat + latDelta,
      },
      locationLng: {
        gte: input.locationLng - lngDelta,
        lte: input.locationLng + lngDelta,
      },
    },
    take: 20,
  });

  let best: DedupMatch | null = null;
  for (const t of candidates) {
    const d = haversineMeters(
      { lat: input.locationLat, lng: input.locationLng },
      { lat: t.locationLat, lng: t.locationLng },
    );
    if (d <= radius && (!best || d < best.distanceMeters)) {
      best = {
        existingTicketId: t.id,
        existingTicketStatus: t.status,
        distanceMeters: d,
        existingLocationLat: t.locationLat,
        existingLocationLng: t.locationLng,
        existingCreatedAt:
          typeof t.createdAt === 'string'
            ? t.createdAt
            : (t.createdAt as Date).toISOString(),
      };
    }
  }
  return best;
}
