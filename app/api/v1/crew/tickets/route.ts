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
 *   - scope?:  'open' | 'history'              (default: 'open')
 *              'open'    — the actionable assignments only (the list).
 *              'history' — every ticket ever assigned to this crew,
 *                          including resolved / closed, newest-first.
 *                          The dashboard needs this to compute
 *                          "Completed Today" and "Avg. Resolution Time",
 *                          which cannot be derived from the actionable
 *                          set (a finished ticket is not in it).
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
import { buildActorRoleMap } from '@/lib/identity/actor-role-map';

const QuerySchema = z.object({
  status: z.enum(['routed', 'in_progress']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  /**
   * `open` (default) — the crew's ACTIONABLE assignments only
   * (`routed` + `in_progress`). This is the list surface.
   *
   * `history` — every ticket ever assigned to this crew member,
   * including the terminal ones (`resolved` / `closed`). The crew
   * DASHBOARD needs these to compute "Completed Today" and
   * "Avg. Resolution Time", which are impossible to derive from the
   * actionable set alone (a resolved ticket is not in it).
   *
   * Both scopes return the SAME tickets for the crew member; the
   * difference is only which statuses are included. The `status`
   * filter is ignored under `scope=history` — the caller asked for
   * the history, not a slice of it.
   */
  scope: z.enum(['open', 'history']).optional(),
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
    scope: req.nextUrl.searchParams.get('scope') ?? undefined,
    cityId: req.nextUrl.searchParams.get('cityId') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_query', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { status, limit, scope } = parsed.data;

  // Status filter: by default both 'routed' and 'in_progress'
  // (the crew's actionable statuses).
  //
  // `scope=history` widens the set to include the terminal
  // statuses so the dashboard can count what the crew has already
  // finished and measure how long those jobs took. It deliberately
  // IGNORES the `status` filter — a caller that asked for the
  // history asked for ALL of it, not one slice.
  const historyScope = scope === 'history';
  const wantedStatuses = historyScope
    ? ['routed', 'in_progress', 'resolved', 'closed', 'cancelled']
    : status
      ? [status]
      : ['routed', 'in_progress'];

  // Pull all tickets in the crew's city with the wanted
  // statuses. The dev store's findMany accepts `status: { in }`
  // but not `assignedCrewId`; we filter that in code below.
  //
  // Order: the OPEN list is oldest-first (the crew works the
  // oldest job first — the list surface's documented contract).
  // The HISTORY is newest-first, because the dashboard renders it
  // as a reverse-chronological activity timeline.
  const candidates = await db.ticket.findMany({
    where: {
      cityId: session!.cityId,
      status: { in: wantedStatuses as never },
    },
    orderBy: { createdAt: historyScope ? 'desc' : 'asc' },
  });

  // Apply the assignedCrewId + ward + department scope in
  // code. The dev store's query doesn't expose
  // `assignedCrewId`; the production Prisma query would
  // push the filter into SQL — v1.1. The crew persona is
  // bound to (ward_14, dept_streetlight) and to
  // `user_crew_rashid` (DEV_CREW_ID).
  //
  // A ticket's department is derived from its CATEGORY
  // (`Category.departmentId`), not from a hardcoded category id.
  // The earlier `t.categoryId !== 'cat_streetlight'` shortcut only
  // ever matched the streetlight category, so a ticket assigned to
  // the crew in any other department — e.g. the seeded
  // in-progress pothole (roads) — was silently dropped and the crew
  // saw an empty list. Resolve the category's department instead.
  const categoryDepartment = new Map<string, string | null>();
  const categoryIds = [
    ...new Set(candidates.map((t) => t.categoryId)),
  ];
  for (const categoryId of categoryIds) {
    const category = await db.category.findUnique({ where: { id: categoryId } });
    categoryDepartment.set(categoryId, category?.departmentId ?? null);
  }

  const filtered = candidates.filter((t) => {
    if (t.assignedCrewId !== session!.userId) return false;
    if (session!.wardId && t.wardId !== session!.wardId) return false;
    if (session!.departmentId) {
      const ticketDepartment = categoryDepartment.get(t.categoryId) ?? null;
      // A category with no department (e.g. "Other") is not
      // department-scoped, so it stays visible to every crew.
      if (ticketDepartment && ticketDepartment !== session!.departmentId) {
        return false;
      }
    }
    return true;
  });

  const tickets = await Promise.all(
    filtered.slice(0, limit).map(async (t) => {
      const withTrail = await getTicketWithTrail(t.id);
      if (!withTrail) {
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

  return NextResponse.json({ tickets });
}