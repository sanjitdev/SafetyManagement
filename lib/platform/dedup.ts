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
 *
 * ── The dedup KEY (2026-11-08) ───────────────────────────────────
 *
 * `checkDedup` below is a PROMPT — it tells the citizen "there is
 * already a report here, did you mean that one?" and the citizen may
 * decline. It cannot be the thing that guarantees no duplicate
 * tickets exist, because a declined duplicate MUST be creatable.
 *
 * The guarantee comes from a second, coarser mechanism: the
 * `dedupKey` column and its unique index. See `computeDedupKey`
 * below for the key's construction and the constraints on it. The
 * short version:
 *
 *   - The key identifies the EXACT spot (city, category, coordinates),
 *     not the 50 m neighbourhood. The neighbourhood stays a prompt.
 *   - A submission that did not declare a dedup decline carries the
 *     key; a submission that DID declare one carries none, so the
 *     acknowledged duplicate is always creatable.
 *   - The key is cleared when the ticket leaves the open statuses, so
 *     a resolved spot can be reported again.
 */

import { createHash } from 'node:crypto';
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

// =====================================================================
// The dedup key
// =====================================================================

/**
 * The identity of "this exact spot in this category in this city".
 */
export interface DedupKeyInput {
  cityId: string;
  categoryId: string;
  locationLat: number;
  locationLng: number;
}

/**
 * Compute the dedup key for a submission.
 *
 * The key is a SHA-256 digest of the four identity components. It is
 * deterministic, so two submissions of the same spot always produce
 * the same key — which is the whole point, since the unique index on
 * `(cityId, dedupKey)` is what turns "two open tickets at the same
 * spot" into a database error instead of two rows.
 *
 * ── Why EXACT coordinates, not the 50 m radius ───────────────────
 *
 * The 50 m radius is a POLICY threshold expressed as a distance
 * because the citizen experience is "is this the same spot?". It
 * CANNOT be a unique-index constraint:
 *
 *   - Two genuinely DIFFERENT reports 40 m apart — a pothole and a
 *     broken streetlight on the same pavement — are different issues.
 *     A radius-keyed unique index would reject the second one
 *     outright, which is the platform refusing a legitimate report.
 *   - A radius-keyed grid would also have to pick a cell size, and
 *     every choice either over-blocks (coarse cells) or under-blocks
 *     (fine cells), because two points 40 m apart can fall in the
 *     same coarse cell.
 *
 * So the index is deliberately NARROWER than the prompt: it catches
 * only "the same coordinates, to float precision". The 50 m
 * Haversine scan above remains the thing that decides "same spot
 * within 50 m" and raises the citizen-facing prompt. The index is a
 * backstop for the race where both submissions claim the identical
 * coordinates — the case where the prompt was never raised because
 * neither ticket existed yet.
 *
 * ── Why the digest rather than the raw columns ───────────────────
 *
 * The index is on `(cityId, dedupKey)`, so the key has to be a single
 * scalar. A digest keeps it compact and avoids a second wide
 * composite index; the identity components are already indexed
 * separately for the bounding-box pre-filter.
 *
 * The digest is computed over a canonical string so the key cannot
 * be ambiguous: the components are joined with a separator that
 * cannot occur inside them. A city id containing the separator could
 * otherwise produce the same digest as a different (city, category)
 * pair.
 */
export function computeDedupKey(input: DedupKeyInput): string {
  // The canonical form. `\u0000` (NUL) cannot appear in a Postgres
  // text column's city or category id, so it is an unambiguous
  // separator.
  const canonical = [
    input.cityId,
    input.categoryId,
    input.locationLat.toString(),
    input.locationLng.toString(),
  ].join('\u0000');
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * A unique-constraint violation on the dedup key.
 *
 * Thrown by the submit path when the database refuses the insert
 * because another submission of the same spot won the race. The
 * caller re-runs `checkDedup` and surfaces the existing ticket
 * instead of creating a second one.
 *
 * This is a distinct error from `ConcurrentTransitionError` /
 * `ConcurrentWriteError` (in `lib/platform/concurrency.ts`): those
 * describe a LOST UPDATE — two writers aiming at the SAME row. This
 * describes two writers aiming at TWO DIFFERENT rows that the
 * database refuses to let both exist. The caller's recovery is
 * therefore different: not "reload and retry the write", but "find
 * the winner and report it to the citizen".
 */
export class DedupConflictError extends Error {
  constructor(
    public dedupKey: string,
    public cityId: string,
  ) {
    super(
      `A ticket already exists for this location (dedup key ${dedupKey.slice(0, 12)}…)`,
    );
    this.name = 'DedupConflictError';
  }
}

/**
 * Is this thrown value a Postgres unique-constraint violation?
 *
 * Prisma surfaces the underlying driver error. Postgres reports a
 * unique violation with SQLSTATE `23505` and names the violated
 * constraint in `meta`/`constraint`. The check is deliberately
 * tolerant: it looks for the SQLSTATE on the error or its `cause`
 * chain, because the exact shape differs between Prisma versions
 * and between the direct client and the transaction-scoped client.
 *
 * The `dedupKey` constraint is checked BY NAME so that a violation
 * of some OTHER unique index (there is one other today — the
 * primary key) is not mistaken for a dedup conflict.
 */
export function isDedupConflict(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const candidate = current as {
      code?: unknown;
      meta?: { target?: unknown; constraint?: unknown };
      cause?: unknown;
    };
    const code = candidate.code;
    if (code === '23505') {
      // Postgres unique violation. If the constraint is named, it
      // must be the dedup one.
      const constraint = candidate.meta?.constraint;
      const target = candidate.meta?.target;
      const named = constraint ?? target;
      if (typeof named === 'string') {
        return named.includes('dedupKey') || named.includes('dedup_key');
      }
      if (Array.isArray(named)) {
        return named.some(
          (n) => typeof n === 'string' && (n.includes('dedupKey') || n.includes('dedup_key')),
        );
      }
      // No constraint name available — treat the violation as a dedup
      // conflict. The submit path recovers by re-running the dedup
      // scan and reporting the existing ticket, which is the correct
      // outcome for ANY unique violation on this insert.
      return true;
    }
    current = candidate.cause;
  }
  return false;
}

/**
 * The statuses that FREE a dedup key.
 *
 * A ticket leaving the open statuses releases its key, so the same
 * spot can be reported again — which is the behaviour a citizen
 * expects when they see an unrepaired pothole the day after the last
 * report was closed.
 */
export function freesDedupKey(status: TicketStatus): boolean {
  return !OPEN_STATUSES.includes(status);
}
