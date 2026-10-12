/**
 * POST /api/tickets/:id/transition — advance a ticket's status.
 *
 * PLAT-REQ-005: atomic status update + trail entry + audit entry.
 * PLAT-REQ-006: best-effort push fan-out.
 *
 * Role rules:
 *   - dispatcher: submitted → routed (and any → cancelled)
 *   - crew:       routed → in_progress, in_progress → resolved (and any → cancelled)
 *   - admin:      any transition (but admin writes still require WebAuthn in v1.1)
 *   - citizen:    not allowed (use a separate "cancel my own" endpoint, deferred)
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

const ALLOWED_BY_ROLE: Record<string, string[]> = {
  dispatcher: ['routed', 'cancelled'],
  crew: ['in_progress', 'resolved', 'cancelled'],
  admin: ['routed', 'in_progress', 'resolved', 'cancelled'],
  citizen: [],
};

const TransitionInput = z.object({
  toStatus: z.enum(['routed', 'in_progress', 'resolved', 'cancelled']),
  note: z.string().max(1000).optional(),
  assignedCrewId: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getActiveSession();
  try {
    requireRole(session, 'dispatcher', 'crew', 'admin');
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
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

  const roleAllowed = ALLOWED_BY_ROLE[session!.role] ?? [];
  if (!roleAllowed.includes(parsed.data.toStatus)) {
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

  try {
    requireSameCity(session!, ticket.cityId);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
  if (session!.role !== 'admin') {
    try {
      requireScope(session!, ticket.wardId, null);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 403 });
    }
  }

  try {
    if (
      parsed.data.assignedCrewId &&
      (parsed.data.toStatus === 'routed' ||
        parsed.data.toStatus === 'in_progress')
    ) {
      await db.ticket.update({
        where: { id: ticket.id },
        data: { assignedCrewId: parsed.data.assignedCrewId },
      });
    }
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
          error: 'invalid_transition',
          from_status: e.fromStatus,
          to_status: e.toStatus,
        },
        { status: 409 },
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

  const refreshed = await getTicketWithTrail(ticket.id);
  if (!refreshed) {
    return NextResponse.json({ error: 'post_transition_fetch_failed' }, { status: 500 });
  }
  return NextResponse.json({
    ticket: serializeTicketForRole(refreshed, refreshed.trail, session!.role, 'bn'),
  });
}
