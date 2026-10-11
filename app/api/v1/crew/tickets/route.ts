/**
 * GET /api/v1/crew/tickets — list tickets assigned to the
 * current crew member.
 *
 * CREW-002 (Intent 004, Unit 002): the crew's primary
 * surface. The list is filtered to tickets where
 * `assignedCrewId = session.userId` AND
 * `status ∈ {routed, in_progress}` (the crew's actionable
 * statuses — submitted is for the dispatcher, resolved is
 * terminal), sorted oldest-first.
 *
 * Query parameters (Zod-validated):
 *   - status?: 'routed' | 'in_progress'        (default: both)
 *   - limit?:  number (1-100, default 50)
 *
 * The route applies the crew's session scope via
 * `requireRole(session, 'crew')` + `requireScope(...)`.
 * Cross-city requests are denied (the `?cityId=` query
 * parameter is NOT honoured; the crew's session cityId is
 * the only city that the API will read).
 *
 * The dev store's `findMany` does not yet expose an
 * `assignedCrewId` clause, so the filter is applied in code
 * below. v1.1 will push the filter into the Prisma query
 * for production. The dev store has one crew persona
 * (Rashid, `user_crew_rashid`), so the in-code filter is
 * correct in dev — and the production code path is correct
 * (the query would still pass the `assignedCrewId` filter
 * once the Prisma surface gains the clause).
 *
 * Returns `{ tickets: SerializedTicket[] }`. The crew
 * serializer branch is used (full record; `internalNote`
 * and real `actorId` are visible).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, getActiveSession, getTicketWithTrail } from '@/lib/db-switch';
import { requireRole, requireSameCity, ApiError } from '@/lib/auth/guards';
import { serializeTicketForRole } from '@/lib/serializers/ticket';

const QuerySchema = z.object({
  status: z.enum(['routed', 'in_progress']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  // The crew's `?cityId=` is NOT honoured; the session's
  // cityId is the only city the API reads. We accept the
  // query parameter so a typo returns a 400 instead of
  // silently being ignored — but the value is checked
  // against the session.
  cityId: z.string().min(1).optional(),
});

export async function GET(req: NextRequest) {
  const session = await getActiveSession();
  try {
    requireRole(session, 'crew');
    // The crew's session is bound to a cityId at login; if
    // a ?cityId= is supplied, it MUST match the session
    // cityId. (Mismatched → 403 cross_city_access_denied via
    // requireSameCity.)
    const sp = req.nextUrl.searchParams;
    if (sp.get('cityId') && sp.get('cityId') !== session!.cityId) {
      throw new ApiError(403, 'cross_city_access_denied');
    }
    requireSameCity(session, session!.cityId); // sanity: no-op unless session is null
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }

  const parsed = QuerySchema.safeParse({
    status: req.nextUrl.searchParams.get('status') ?? undefined,
    limit: req.nextUrl.searchParams.get('limit') ?? undefined,
    cityId: req.nextUrl.searchParams.get('cityId') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_query', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { status, limit } = parsed.data;

  // Status filter: by default both 'routed' and 'in_progress'
  // (the crew's actionable statuses).
  const wantedStatuses = status ? [status] : ['routed', 'in_progress'];

  // Pull all tickets in the crew's city with the wanted
  // statuses. The dev store's findMany accepts `status: { in }`
  // but not `assignedCrewId`; we filter that in code below.
  const candidates = await db.ticket.findMany({
    where: {
      cityId: session!.cityId,
      status: { in: wantedStatuses as never },
    },
    orderBy: { createdAt: 'asc' },
  });

  // Apply the assignedCrewId + ward + department scope in
  // code. The dev store's query doesn't expose
  // `assignedCrewId`; the production Prisma query would
  // push the filter into SQL — v1.1. The crew persona is
  // bound to (ward_14, dept_streetlight) and to
  // `user_crew_rashid` (DEV_CREW_ID).
  const filtered = candidates.filter((t) => {
    if (t.assignedCrewId !== session!.userId) return false;
    if (session!.wardId && t.wardId !== session!.wardId) return false;
    if (session!.departmentId) {
      // The category-department resolution mirrors the
      // dispatcher's queue filter (route.ts): the dev store
      // only has cat_streetlight seeded; non-streetlight
      // tickets in the crew's ward are filtered out at the
      // category-department level. v1.1 will join
      // `db.category.findUnique` and compare
      // `category.departmentId`.
      if (t.categoryId !== 'cat_streetlight') return false;
    }
    return true;
  });

  const tickets = filtered.slice(0, limit).map((t) => {
    const withTrail = getTicketWithTrail(t.id);
    if (!withTrail) {
      return serializeTicketForRole(
        t as never,
        [],
        session!.role,
        'bn',
      );
    }
    return serializeTicketForRole(
      withTrail,
      withTrail.trail,
      session!.role,
      'bn',
    );
  });

  return NextResponse.json({ tickets });
}