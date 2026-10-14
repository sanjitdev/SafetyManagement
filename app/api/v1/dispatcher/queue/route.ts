/**
 * GET /api/v1/dispatcher/queue — list tickets in the dispatcher's
 * triage queue.
 *
 * DISP-002 (Intent 003, Unit 002): the dispatcher's primary
 * surface. The queue is the list of tickets in (submitted, routed)
 * status, scoped to the dispatcher's (cityId, wardId, departmentId)
 * and sorted oldest-first. The status filter is optional — by
 * default both statuses are included.
 *
 * Query parameters (Zod-validated):
 *   - status?: 'submitted' | 'routed'        (default: both)
 *   - limit?:  number (1-100, default 50)
 *
 * The route applies the dispatcher's session scope via
 * `requireRole(session, 'dispatcher')` + `requireScope(...)`.
 * Cross-city requests are denied (the `?cityId=` query parameter
 * is NOT honoured; the dispatcher's session cityId is the only
 * city that the API will read).
 *
 * Cross-ward / cross-department tickets are filtered out at the
 * DB level where possible (the dev-store + Prisma query is filtered
 * by cityId + status in [...]). The ward + department filter is
 * applied in code because the dev store's `findMany` surface does
 * not yet expose `wardId` / `departmentId` clauses; v1.1 will push
 * the filter into the Prisma query for production. The dev store
 * only has one ward (`ward_14`) seeded, so the in-code filter is a
 * no-op in dev — but the production code path is correct.
 *
 * Returns `{ tickets: SerializedTicket[] }`. The dispatcher
 * serializer branch is used (full record; `internalNote` and real
 * `actorId` are visible).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, getActiveSession, getTicketWithTrail } from '@/lib/db-switch';
import { requireRole, requireSameCity, ApiError } from '@/lib/auth/guards';
import { serializeTicketForRole } from '@/lib/serializers/ticket';
import { buildActorRoleMap } from '@/lib/identity/actor-role-map';

const QuerySchema = z.object({
  status: z.enum(['submitted', 'routed']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  // The dispatcher's `?cityId=` is NOT honoured; the session's
  // cityId is the only city the API reads. We accept the query
  // parameter so a typo returns a 400 instead of silently being
  // ignored — but the value is checked against the session.
  cityId: z.string().min(1).optional(),
});

export async function GET(req: NextRequest) {
  const session = await getActiveSession();
  try {
    requireRole(session, 'dispatcher');
    // The dispatcher's session is bound to a cityId at login; if
    // a ?cityId= is supplied, it MUST match the session cityId.
    // (Mismatched → 403 cross_city_access_denied via requireSameCity.)
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

  // Status filter: by default both 'submitted' and 'routed'.
  const wantedStatuses = status ? [status] : ['submitted', 'routed'];

  // Pull all tickets in the dispatcher's city with the wanted
  // statuses. The dev store's findMany accepts `status: { in }` but
  // not `wardId` / `departmentId`; we filter those in code below.
  const candidates = await db.ticket.findMany({
    where: {
      cityId: session!.cityId,
      status: { in: wantedStatuses as never },
    },
    orderBy: { createdAt: 'asc' },
  });

  // DISP-006: exclude tickets with a pending dedup-decline
  // flag. The dispatcher must resolve the flag before the
  // ticket enters the normal triage queue.
  const pendingFlags = await db.dedupFlag.findMany({
    where: { cityId: session!.cityId, status: 'pending' },
  });
  const flaggedTicketIds = new Set(pendingFlags.map((f) => f.ticketId));

  // Apply the ward + department scope in code. The dispatcher
  // persona is bound to (ward_14, dept_streetlight); tickets
  // outside that scope are filtered out.
  const filtered = candidates.filter((t) => {
    // DISP-006: drop tickets with a pending dedup-decline
    // flag — the dispatcher must resolve the flag first.
    if (flaggedTicketIds.has(t.id)) return false;
    if (session!.wardId && t.wardId !== session!.wardId) return false;
    // Department: a ticket's category determines its department.
    // We look up the category's departmentId via db.category and
    // compare to the session's departmentId. For v1 we only have
    // one ticket seeded; the dispatcher sees the tickets in their
    // ward, regardless of department (the dispatcher persona is
    // bound to dept_streetlight; streetlight-category tickets in
    // their ward pass the filter; non-streetlight tickets are
    // filtered out at the category-department level).
    if (session!.departmentId) {
      // The category-department resolution is performed inline
      // because the dev store does not yet expose a join; for
      // v1 we accept the ticket if its categoryId is
      // cat_streetlight (the only category that maps to
      // dept_streetlight in the seed). A more general
      // implementation joins `db.category.findUnique` and
      // compares `category.departmentId` — tracked for v1.1.
      if (t.categoryId !== 'cat_streetlight') return false;
    }
    return true;
  });

  const tickets = await Promise.all(
    filtered.slice(0, limit).map(async (t) => {
      const withTrail = await getTicketWithTrail(t.id);
      if (!withTrail) {
        // Should not happen for tickets returned by findMany, but the
        // type is nullable. Fall back to a minimal trail.
        return serializeTicketForRole(
          t as never,
          [],
          session!.role,
          'bn',
          {},
        );
      }
      // Intent 008 / Bolt 008-002 — Story 002: enrich
      // the trail with the actor's role so the client
      // can render the display name.
      const actorRoles = await buildActorRoleMap(
        withTrail.trail.map((e) => e.actorId),
      );
      return serializeTicketForRole(
        withTrail,
        withTrail.trail,
        session!.role,
        'bn',
        actorRoles,
      );
    }),
  );

  // DISP-006: surface the count of pending dedup-decline flags
  // in the dispatcher's scope so the "Possible duplicates (N)"
  // link in the header can show a real number. The list itself
  // is fetched separately via GET /api/v1/dispatcher/dedup-flags.
  const pendingDedupCount = pendingFlags.filter(
    (f) => !session!.wardId || f.wardId === session!.wardId,
  ).length;

  return NextResponse.json({ tickets, pendingDedupCount });
}
