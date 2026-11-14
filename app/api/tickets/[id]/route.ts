/**
 * GET /api/tickets/:id — fetch a single ticket.
 *
 * PLAT-REQ-001: serializer hides internal fields from citizens.
 * PLAT-REQ-008: rate-limited 1/sec per (actor, ticket).
 *
 * Backend-agnostic: works on Prisma or the in-memory dev store.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, getActiveSession, getTicketWithTrail } from '@/lib/db-switch';
import { requireSameCity, requireScope } from '@/lib/auth/guards';
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

  // Load the joined ticket (category → department) BEFORE the scope
  // check so the comparison uses the same `departmentId` the route
  // is authorised against. `db.ticket.findUnique` does not include
  // the category join; `getTicketWithTrail` does. The legacy call
  // shape `requireScope(session, ticket.wardId, null)` failed for
  // dispatcher / crew users with a `session.departmentId` set in the
  // same city as the ticket — the scope check would compare the
  // session's dept to `null` and reject.
  const withTrail = await getTicketWithTrail(id);
  if (!withTrail) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Dispatcher / crew scope enforcement.
  if (session.role === 'dispatcher' || session.role === 'crew') {
    try {
      requireScope(
        session,
        ticket.wardId,
        withTrail.departmentId ?? null,
      );
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 403 });
    }
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
