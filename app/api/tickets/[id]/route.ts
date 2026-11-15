/**
 * GET /api/tickets/:id — fetch a single ticket.
 *
 * PLAT-REQ-001: serializer hides internal fields from citizens.
 * PLAT-REQ-008: rate-limited 1/sec per (actor, ticket).
 *
 * THIS IS THE SHARED SURFACE'S ENDPOINT.
 * -----------------------------------------
 * `/reports/:id` is under the shared `/reports` prefix, so every
 * role may open it (`lib/role-home.ts` — "every role may read").
 * The page it serves is the same one the shared `/reports` LIST
 * reads, and that list hands a staff member every report filed in
 * the session's city.
 *
 * So the read scope here has to MATCH the list it is opened from:
 *
 *   - citizen → their own reports only
 *   - admin   → every report in their city
 *   - dispatcher / crew → every report in their city
 *
 * A dispatcher used to be narrowed to (ward + department) here while
 * the shared list showed them the whole city. That is the
 * scope-filter divergence: the list showed a ticket the detail
 * route refused, and the refusal rendered the CITIZEN-ownership
 * copy ("You can only view reports you created.") on a staff
 * viewer — a message about the wrong rule entirely.
 *
 * The ward + department boundary is NOT dropped. It is enforced on
 * the surface where it belongs:
 *
 *   - GET  /api/v1/dispatcher/tickets/:id  — the dispatcher's own
 *     work surface. Ward + department scoped; out-of-scope → 404.
 *   - GET  /api/v1/crew/tickets/:id        — the crew's own work
 *     surface. Same rule.
 *   - GET  /api/v1/dispatcher/queue       — the triage list, filtered
 *     to the session's ward + department.
 *
 * Those are the surfaces that WRITE and that WORK a ticket. This
 * one is a read of the shared civic record, and it stays inside the
 * city boundary (`requireSameCity` below) — a ticket in another city
 * is still refused.
 *
 * Backend-agnostic: works on Prisma or the in-memory dev store.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, getActiveSession, getTicketWithTrail } from '@/lib/db-switch';
import { requireSameCity } from '@/lib/auth/guards';
import { rateLimit } from '@/lib/platform/rate-limit';
import { serializeTicketForRole } from '@/lib/serializers/ticket';
import { buildActorRoleMap } from '@/lib/identity/actor-role-map';
import { readFeedbackRating } from '@/lib/citizen/feedback';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }

  const { id } = await ctx.params;

  // PLAT-REQ-008: rate limit per (actor, ticket)
  const limit = rateLimit(`${session.userId}:${id}`);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', retry_after_ms: limit.retryAfterMs },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) },
      },
    );
  }

  const ticket = await db.ticket.findUnique({ where: { id } });
  if (!ticket) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  try {
    requireSameCity(session, ticket.cityId);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }

  // Load the joined ticket (category → department). The category
  // join is what carries `departmentId`, and the trail with it.
  //
  // The city guard above already ran against `ticket.cityId`, so the
  // remaining question is only whether THIS viewer may read THIS
  // ticket — and for the shared surface that is a city-scoped read
  // for every staff role. See the route's header comment: the ward +
  // department boundary lives on `/api/v1/dispatcher/tickets/:id`
  // and `/api/v1/crew/tickets/:id`, the surfaces that work a ticket.
  const withTrail = await getTicketWithTrail(id);
  if (!withTrail) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Citizens can only see their own tickets.
  if (session.role === 'citizen' && ticket.reporterId !== session.userId) {
    return NextResponse.json({ error: 'not_owner' }, { status: 403 });
  }

  // Resolve the actor roles so the staff branch of the trail says
  // who acted in which role. The citizen branch anonymises the
  // actors anyway, so the map costs the citizen nothing.
  const actorRoles = await buildActorRoleMap(
    withTrail.trail.map((e) => e.actorId),
  );

  return NextResponse.json({
    ticket: serializeTicketForRole(
      withTrail,
      withTrail.trail,
      session.role,
      'bn',
      actorRoles,
    ),
    last_poll_cursor: withTrail.updatedAt,
    // WO-002 — the citizen's own feedback rating, surfaced at the
    // TOP LEVEL (not on the shared `ticket` object) so the
    // serializer's documented contract stays untouched. The
    // citizen detail page uses it to render "you already rated
    // this" instead of an empty prompt. `null` when the citizen
    // has not rated the resolution yet.
    ...(session.role === 'citizen'
      ? { feedback_rating: readFeedbackRating(withTrail.feedback) }
      : {}),
  });
}
