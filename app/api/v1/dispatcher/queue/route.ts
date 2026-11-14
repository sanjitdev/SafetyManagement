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
import {
  loadSlaPoliciesByCategory,
  slaStateFor,
  slaStateForResolved,
} from '@/lib/dispatcher/sla-resolve';

const QuerySchema = z.object({
  /**
   * The status filter.
   *
   * Wave 4 / bolt 009-005 widened the enum from two members to
   * four. The original enum was `submitted | routed` — the two
   * states a ticket passes through BEFORE a crew picks it up — so
   * the dispatcher could never filter the queue by whether work was
   * already in progress. The mockup's filter rail lists all four
   * states the ticket model has, and a rail that offers a state
   * the endpoint rejects with a 400 is a rail that lies.
   *
   * Omitting the parameter still returns `submitted` + `routed` —
   * the default is unchanged, so every existing caller sees exactly
   * the same rows it saw before.
   */
  status: z.enum(['submitted', 'routed', 'in_progress', 'resolved']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  /**
   * The ward filter.
   *
   * ADDITIVE and NARROWING ONLY. A `ward` request is intersected
   * with the session's ward, so it can never widen a ward-bound
   * dispatcher's view. The session filter is applied AFTER this
   * one (see the filter block below), which is what makes the
   * boundary hold: the session's ward always wins.
   *
   * Before Wave 4 there was no `ward` parameter at all, and Zod's
   * default object parsing silently STRIPS an unknown key — so a
   * `ward=` sent to this endpoint was ignored in silence rather
   * than rejected. That silent strip is why the mockup's ward rail
   * could not be driven from this endpoint.
   */
  ward: z.string().min(1).optional(),
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
    ward: req.nextUrl.searchParams.get('ward') ?? undefined,
    cityId: req.nextUrl.searchParams.get('cityId') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_query', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { status, limit, ward: requestedWard } = parsed.data;

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
  // A ticket's department comes from its CATEGORY
  // (`Category.departmentId`), not from a hardcoded category id. The
  // earlier `t.categoryId !== 'cat_streetlight'` shortcut only ever
  // matched the streetlight category, so every other category in the
  // dispatcher's ward was silently dropped. Resolve the category's
  // department instead.
  const categoryDepartment = new Map<string, string | null>();
  const categoryIds = [
    ...new Set(candidates.map((t) => t.categoryId)),
  ];
  for (const categoryId of categoryIds) {
    const category = await db.category.findUnique({ where: { id: categoryId } });
    categoryDepartment.set(categoryId, category?.departmentId ?? null);
  }

  const filtered = candidates.filter((t) => {
    // DISP-006: drop tickets with a pending dedup-decline
    // flag — the dispatcher must resolve the flag first.
    if (flaggedTicketIds.has(t.id)) return false;
    // ── The ward filter (Wave 4) ──────────────────────────────
    //
    // BOTH conditions must hold. The requested ward narrows the
    // result, and the session's ward is the outer limit of what
    // this dispatcher may see — applied unconditionally.
    //
    // Because the session check is an equality test rather than a
    // narrowing one, a ward-bound dispatcher can never widen their
    // view by asking for a different ward. Asking for a ward they
    // do not hold yields an EMPTY queue rather than their own
    // queue: the request and the session are two conditions that
    // must both be satisfied, and a ticket can only be in one
    // ward.
    //
    // The empty result is the deliberate choice. Returning the
    // dispatcher's own ward would be friendlier, but it would
    // also mean the endpoint answers a question the caller did
    // not ask — the caller asked for ward_15 and got ward_14. An
    // empty queue is honest, and the rail never offers a ward the
    // dispatcher cannot reach in the first place.
    if (requestedWard && t.wardId !== requestedWard) return false;
    if (session!.wardId && t.wardId !== session!.wardId) return false;
    // Department: a ticket's category determines its department.
    // A category with no department (e.g. "Other") is not
    // department-scoped, so it stays visible to every dispatcher.
    if (session!.departmentId) {
      const ticketDepartment = categoryDepartment.get(t.categoryId) ?? null;
      if (ticketDepartment && ticketDepartment !== session!.departmentId) {
        return false;
      }
    }
    return true;
  });

  // ── The SLA read path (Wave 4 / bolt 009-005) ──────────────────
  //
  // The city's policies are read ONCE into a map, then every ticket
  // answers from memory. Resolving per ticket would be an N+1 on
  // the endpoint the dispatcher polls every 30 seconds.
  const slaPolicies = await loadSlaPoliciesByCategory(session!.cityId);
  const slaNow = Date.now();

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
      // The SLA clock starts at `routed` and the trail is the only
      // record of that transition, so the trail is what the SLA
      // resolver reads. A resolved ticket reports whether it met
      // the target rather than a countdown against a deadline that
      // no longer exists.
      const sla = withTrail.resolvedAt
        ? slaStateForResolved(
            withTrail.categoryId,
            withTrail.trail,
            slaPolicies,
            withTrail.resolvedAt,
          )
        : slaStateFor(
            withTrail.categoryId,
            withTrail.trail,
            slaPolicies,
            slaNow,
          );
      return serializeTicketForRole(
        { ...withTrail, ...sla.resolved },
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

  // ── The ward rail's read path (Wave 4) ─────────────────────────
  //
  // The filter rail needs to know which wards the signed-in
  // dispatcher may filter BY. There was no dispatcher-facing
  // endpoint that returned them — `GET /api/v1/admin/cities/<id>/wards`
  // exists but is ADMIN-gated, so a dispatcher cannot call it.
  //
  // The list is the wards the dispatcher can actually REACH:
  //
  //   - a ward-BOUND dispatcher sees only their own ward (one
  //     entry). Listing more would be a filter rail full of rows
  //     that select zero tickets — the mockup's original four-ward
  //     rail was exactly that mistake.
  //   - a city-WIDE dispatcher (no ward on the session) sees every
  //     ward in their city.
  //
  // It rides on this response rather than adding an endpoint,
  // because the queue already returns `pendingDedupCount` alongside
  // its tickets — there is a precedent for a meta block, and one
  // fewer request on the 30-second poll.
  const wards = await db.ward.findMany({
    where: { cityId: session!.cityId },
  });
  const reachableWards = (
    session!.wardId
      ? wards.filter((w) => w.id === session!.wardId)
      : wards
  )
    .map((w) => ({
      id: w.id,
      number: w.number,
      name: w.name,
      nameBn: w.nameBn,
    }))
    .sort((a, b) => a.number - b.number);

  return NextResponse.json({
    tickets,
    pendingDedupCount,
    /**
     * The wards the dispatcher may filter by. Read the rail's
     * contents from here — NEVER from a hard-coded ward constant.
     * The dev store seeds 2 wards and real Postgres seeds 50, so a
     * hard-coded list would show a rail the API cannot serve.
     */
    wards: reachableWards,
    /**
     * Whether the dispatcher's scope is bound to a single ward. The
     * rail says so explicitly when it is, rather than showing one
     * row that looks like a filter.
     */
    wardScoped: Boolean(session!.wardId),
  });
}
