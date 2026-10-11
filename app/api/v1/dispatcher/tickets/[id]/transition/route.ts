/**
 * POST /api/v1/dispatcher/tickets/[id]/transition
 *
 * DISP-003 (Intent 003, Unit 003): dispatcher-driven status
 * transition.
 *
 * The dispatcher persona is allowed to transition tickets to
 * `routed` (from `submitted`) and `cancelled` (from any
 * non-terminal status). The transition engine
 * (`lib/platform/transitions.ts`) validates the edge.
 *
 * Out-of-scope ticket id → 404 (NOT 403) so the dispatcher
 * cannot probe ticket existence outside their scope.
 *
 * Backend-agnostic: works on Prisma or the in-memory dev store.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, getActiveSession, getTicketWithTrail } from '@/lib/db-switch';
import { ApiError, requireRole, requireSameCity, requireScope } from '@/lib/auth/guards';
import {
  transitionTicket,
  InvalidTransitionError,
} from '@/lib/platform/transitions';
import { sendTicketPush } from '@/lib/platform/push';
import { serializeTicketForRole } from '@/lib/serializers/ticket';

const ALLOWED_DISPATCHER_TRANSITIONS = ['routed', 'cancelled'];

const TransitionInput = z.object({
  toStatus: z.enum(['routed', 'in_progress', 'resolved', 'cancelled']),
  note: z.string().max(1000).optional(),
});

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getActiveSession();
  try {
    requireRole(session, 'dispatcher');
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = TransitionInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  if (!ALLOWED_DISPATCHER_TRANSITIONS.includes(parsed.data.toStatus)) {
    return NextResponse.json(
      { error: 'role_cannot_perform_transition' },
      { status: 403 },
    );
  }

  const ticket = await db.ticket.findUnique({
    where: { id },
  });
  if (!ticket) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Out-of-scope ticket → 404 (NOT 403).
  try {
    requireSameCity(session!, ticket.cityId);
  } catch {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  try {
    requireScope(session!, ticket.wardId, null);
  } catch {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  try {
    await transitionTicket({
      ticketId: ticket.id,
      toStatus: parsed.data.toStatus,
      actorId: session!.userId,
      note: parsed.data.note,
    });
  } catch (e) {
    if (e instanceof InvalidTransitionError) {
      return NextResponse.json(
        {
          error: 'illegal_transition',
          from_status: e.fromStatus,
          to_status: e.toStatus,
        },
        { status: 422 },
      );
    }
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    return NextResponse.json(
      { error: 'transition_failed', detail: (e as Error).message },
      { status: 500 },
    );
  }

  await sendTicketPush({
    ticketId: ticket.id,
    toStatus: parsed.data.toStatus,
  }).catch(() => undefined);

  const refreshed = getTicketWithTrail(ticket.id);
  if (!refreshed) {
    return NextResponse.json(
      { error: 'post_transition_fetch_failed' },
      { status: 500 },
    );
  }
  return NextResponse.json({
    ticket: serializeTicketForRole(
      refreshed,
      refreshed.trail,
      session!.role,
      'bn',
    ),
  });
}
