/**
 * GET /api/v1/admin/tickets/:id — admin Reports detail (the page
 * behind /admin/tickets/[id]).
 *
 * Bolt admin-tickets (Intent 005, Unit 005). Read-only,
 * gated by `requireRole('admin')`. Enforces `requireSameCity`
 * (admin scope is per-city in v1).
 *
 * Re-uses `getTicketWithTrail` from `lib/db-switch.ts` so the
 * shape is backend-agnostic. Returns the admin branch of
 * `serializeTicketForRole` so the full record is visible
 * (`internalNote`, `assignedCrewId`, real `actorId` on trail).
 *
 * Response: `{ ticket: SerializedTicket }`.
 *
 * Why not call the existing `GET /api/tickets/:id`? Three reasons:
 *   1. That route is citizen/dispatcher-shaped; the admin surface
 *      should be symmetric with the rest of `/api/v1/admin/*`.
 *   2. That route returns a `last_poll_cursor` field that the
 *      admin detail page doesn't need (admin is reload-to-refresh).
 *   3. That route's role-shape might drift in v1.1; this admin
 *      route is the contract for the admin tree.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getActiveSession, getTicketWithTrail } from '@/lib/db-switch';
import { ApiError, requireRole, requireSameCity } from '@/lib/auth/guards';
import { getTicketForAdmin } from '@/lib/admin/tickets-query';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getActiveSession();
    if (!session) {
      return NextResponse.json(
        { error: 'unauthenticated' },
        { status: 401 },
      );
    }
    requireRole(session, 'admin');

    const { id } = await ctx.params;
    const ticket = await getTicketWithTrail(id);
    if (!ticket) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    try {
      requireSameCity(session, ticket.cityId);
    } catch (e) {
      if (e instanceof ApiError) {
        return NextResponse.json(
          { error: e.code },
          { status: e.status },
        );
      }
      throw e;
    }

    const serialized = await getTicketForAdmin(id);
    if (!serialized) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    return NextResponse.json({ ticket: serialized }, { status: 200 });
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    return NextResponse.json({ error: 'unhandled' }, { status: 500 });
  }
}