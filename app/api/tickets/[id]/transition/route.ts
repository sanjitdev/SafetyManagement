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
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { ApiError, requireRole, requireSameCity, requireScope } from '@/lib/auth/guards';
import {
  transitionTicket,
  InvalidTransitionError,
} from '@/lib/platform/transitions';
import { sendTicketPush } from '@/lib/platform/push';
import { serializeTicketForRole, ticketInclude } from '@/lib/serializers/ticket';

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
  const session = await getSession();
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

  // Role-scoped allowed transitions
  const roleAllowed = ALLOWED_BY_ROLE[session!.role] ?? [];
  if (!roleAllowed.includes(parsed.data.toStatus)) {
    return NextResponse.json(
      { error: 'role_cannot_perform_transition' },
      { status: 403 },
    );
  }

  // Fetch the ticket for scope + city checks.
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: {
      id: true,
      cityId: true,
      wardId: true,
      categoryId: true,
      status: true,
      assignedCrewId: true,
    },
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

  // Atomic transition + trail + audit. Also handles the optional
  // `assignedCrewId` update (when a dispatcher first routes a ticket).
  try {
    await prisma.$transaction(async (tx) => {
      if (
        parsed.data.assignedCrewId &&
        (parsed.data.toStatus === 'routed' ||
          parsed.data.toStatus === 'in_progress')
      ) {
        await tx.ticket.update({
          where: { id: ticket.id },
          data: { assignedCrewId: parsed.data.assignedCrewId },
        });
      }
      await transitionTicket(
        {
          ticketId: ticket.id,
          toStatus: parsed.data.toStatus,
          actorId: session!.userId,
          note: parsed.data.note,
        },
        tx,
      );
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
    return NextResponse.json(
      { error: 'transition_failed', detail: (e as Error).message },
      { status: 500 },
    );
  }

  // Push fan-out — best-effort; failures don't fail the request.
  await sendTicketPush({
    ticketId: ticket.id,
    toStatus: parsed.data.toStatus,
  }).catch(() => undefined);

  const refreshed = await prisma.ticket.findUnique({
    where: { id: ticket.id },
    include: ticketInclude,
  });
  if (!refreshed) {
    return NextResponse.json({ error: 'post_transition_fetch_failed' }, { status: 500 });
  }
  return NextResponse.json({
    ticket: serializeTicketForRole(refreshed, session!.role, 'bn'),
  });
}