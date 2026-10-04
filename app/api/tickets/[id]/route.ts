/**
 * GET /api/tickets/:id — fetch a single ticket.
 *
 * PLAT-REQ-001: serializer hides internal fields from citizens.
 * PLAT-REQ-008: rate-limited 1/sec per (actor, ticket).
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { requireSameCity, requireScope } from '@/lib/auth/guards';
import { rateLimit } from '@/lib/platform/rate-limit';
import { serializeTicketForRole, ticketInclude } from '@/lib/serializers/ticket';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
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

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: ticketInclude,
  });
  if (!ticket) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  try {
    requireSameCity(session, ticket.cityId);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }

  // Dispatcher / crew scope enforcement.
  if (session.role === 'dispatcher' || session.role === 'crew') {
    try {
      requireScope(session, ticket.wardId, null);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 403 });
    }
  }

  // Citizens can only see their own tickets.
  if (session.role === 'citizen' && ticket.reporterId !== session.userId) {
    return NextResponse.json({ error: 'not_owner' }, { status: 403 });
  }

  return NextResponse.json({
    ticket: serializeTicketForRole(ticket, session.role, 'bn'),
    last_poll_cursor: ticket.updatedAt.toISOString(),
  });
}