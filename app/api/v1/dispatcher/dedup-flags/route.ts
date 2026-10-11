/**
 * GET /api/v1/dispatcher/dedup-flags
 *
 * DISP-006 (Intent 003, Unit 004): the dispatcher's review queue
 * for citizen-declined dedup candidates.
 *
 * Returns the pending `DedupFlag` rows in the dispatcher's
 * scope (city + ward + department), oldest first. Each row
 * includes BOTH the citizen's new ticket and the existing
 * ticket it was near, plus the citizen's optional reason text.
 *
 * Out-of-scope flag id is impossible at this level (the route
 * returns the list filtered to the dispatcher's scope); the
 * per-flag endpoints return 404 for out-of-scope ids.
 *
 * Backend-agnostic: works on Prisma or the in-memory dev store.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, getActiveSession, getTicketWithTrail } from '@/lib/db-switch';
import { ApiError, requireRole } from '@/lib/auth/guards';
import { serializeTicketForRole } from '@/lib/serializers/ticket';

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export async function GET(req: NextRequest) {
  const session = await getActiveSession();
  try {
    requireRole(session, 'dispatcher');
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }

  const parsed = QuerySchema.safeParse({
    limit: req.nextUrl.searchParams.get('limit') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_query', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { limit } = parsed.data;

  // Pull all pending flags in the dispatcher's city, then
  // filter by ward in code (the dev store's findMany surface
  // does not yet expose a wardId clause). Department filter:
  // a flag's `departmentId` is denormalised from the
  // category-of-the-flagged-ticket. The dispatcher's session
  // `departmentId` (if set) is the same dept key.
  const candidates = await db.dedupFlag.findMany({
    where: { cityId: session!.cityId, status: 'pending' },
    orderBy: { flaggedAt: 'asc' },
  });
  const filtered = candidates
    .filter((f) => !session!.wardId || f.wardId === session!.wardId)
    .filter((f) => !session!.departmentId || f.departmentId === session!.departmentId)
    .slice(0, limit);

  const flags = filtered.map((f) => {
    const ticketWithTrail = getTicketWithTrail(f.ticketId);
    const originalWithTrail = getTicketWithTrail(f.originalTicketId);
    return {
      id: f.id,
      cityId: f.cityId,
      wardId: f.wardId,
      departmentId: f.departmentId,
      citizenReason: f.citizenReason,
      flaggedAt: f.flaggedAt,
      status: f.status,
      ticket: ticketWithTrail
        ? serializeTicketForRole(
            ticketWithTrail,
            ticketWithTrail.trail,
            session!.role,
            'bn',
          )
        : null,
      originalTicket: originalWithTrail
        ? serializeTicketForRole(
            originalWithTrail,
            originalWithTrail.trail,
            session!.role,
            'bn',
          )
        : null,
    };
  });

  return NextResponse.json({ flags });
}
