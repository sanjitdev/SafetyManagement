/**
 * POST /api/tickets/:id/transition — advance a ticket's status.
 *
 * PLAT-REQ-005: atomic status update + trail entry + audit entry.
 * PLAT-REQ-006: best-effort push fan-out.
 *
 * Role rules:
 *   - dispatcher: submitted → routed (and any → cancelled)
 *   - crew:       routed → in_progress, in_progress → resolved (and any → cancelled)
 *   - admin:      any transition — admin writes require WebAuthn (ADR-007)
 *   - citizen:    not allowed (use a separate "cancel my own" endpoint, deferred)
 *
 * ADR-007 ("admin write paths require WebAuthn"): this route is an
 * admin write path — the admin-only pure-reassign branch writes
 * `assignedCrewId` directly, and the admin branch of the transition
 * table can move a ticket through any status. Both therefore require
 * a fresh WebAuthn assertion from the admin. Dispatcher and crew
 * transitions are NOT admin writes and are not gated (their writes
 * are already bounded by `requireScope`).
 *
 * The WebAuthn check runs AFTER the cheap role/scope checks so a
 * dispatcher gets `forbidden_role`/`cross_ward_access_denied` rather
 * than a WebAuthn error, and only after the ticket is loaded so a
 * non-existent ticket still 404s rather than 401-ing on a ceremony
 * the caller cannot complete.
 *
 * Backend-agnostic: works on Prisma or the in-memory dev store.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, getActiveSession, getTicketWithTrail } from '@/lib/db-switch';
import {
  ApiError,
  requireRole,
  requireSameCity,
  requireScope,
  requireWebAuthn,
} from '@/lib/auth/guards';
import {
  transitionTicket,
  InvalidTransitionError,
  ConcurrentTransitionError,
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
  // Bolt admin-tickets: `toStatus` is now optional so admin can
  // send a pure `assignedCrewId` reassign without a status change
  // (the admin /admin/tickets detail page exposes a "Reassign crew"
  // button that POSTs `{ assignedCrewId }` only). If `toStatus` is
  // omitted, the route writes only the assignment (no engine
  // transition). If `toStatus` is present, both the assignment and
  // the engine transition run as before. The wire contract is
  // backward-compatible — every existing dispatcher/crew/admin
  // caller passes `toStatus`.
  toStatus: z
    .enum(['routed', 'in_progress', 'resolved', 'cancelled'])
    .optional(),
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

  // At least one of toStatus / assignedCrewId must be set. A pure
  // reassign is only allowed for admin (dispatcher/crew must
  // transition as well).
  if (!parsed.data.toStatus && !parsed.data.assignedCrewId) {
    return NextResponse.json(
      { error: 'invalid_input', detail: 'toStatus or assignedCrewId required' },
      { status: 400 },
    );
  }

  // Pure reassign (no toStatus): admin-only, requires a non-terminal
  // ticket so the assignment is meaningful. The dispatcher/crew
  // paths always pass toStatus, so the existing call sites are
  // unaffected.
  if (!parsed.data.toStatus) {
    if (session!.role !== 'admin') {
      return NextResponse.json(
        { error: 'role_cannot_perform_transition' },
        { status: 403 },
      );
    }
  } else {
    const roleAllowed = ALLOWED_BY_ROLE[session!.role] ?? [];
    if (!roleAllowed.includes(parsed.data.toStatus)) {
      return NextResponse.json(
        { error: 'role_cannot_perform_transition' },
        { status: 403 },
      );
    }
  }

  const ticket = await db.ticket.findUnique({
    where: { id },
  });
  if (!ticket) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // The ticket's department comes from its category (a streetlight
  // ticket belongs to the streetlight department). `db.ticket.findUnique`
  // does not join the category, so the hydrated row is used — the
  // same shape the dispatcher route's `requireScope` call uses.
  //
  // This mattered: the scope check used to pass a literal `null` for
  // `departmentId`, and `requireScope` compares the argument against
  // the session's department with `!==`. `null !== 'dept_streetlight'`
  // is true, so EVERY dispatcher and crew caller was rejected with
  // `cross_department_access_denied` — the shared route was unusable
  // for exactly the two roles it was meant to serve.
  const withTrail = await getTicketWithTrail(ticket.id);

  try {
    requireSameCity(session!, ticket.cityId);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
  if (session!.role !== 'admin') {
    try {
      requireScope(session!, ticket.wardId, withTrail?.departmentId ?? null);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 403 });
    }
  }

  // ADR-007: admin writes require a fresh WebAuthn assertion. This
  // covers BOTH admin write shapes on this route — the pure
  // `assignedCrewId` reassign and the status transition (admin can
  // move a ticket through any status in ALLOWED_BY_ROLE).
  //
  // Dispatcher and crew are not admin writes, so they skip the
  // ceremony; their writes are already bounded by `requireScope`.
  if (session!.role === 'admin') {
    try {
      await requireWebAuthn(session);
    } catch (e) {
      if (e instanceof ApiError) {
        return NextResponse.json({ error: e.code }, { status: e.status });
      }
      return NextResponse.json(
        { error: 'webauthn_failed', detail: (e as Error).message },
        { status: 401 },
      );
    }
  }

  // Reassign-only path: refuse reassigns on terminal tickets (the
  // assignment would be immediately overridden by a new ticket's
  // resolved/cancelled state, and the audit row would be misleading).
  if (!parsed.data.toStatus) {
    if (
      ticket.status === 'resolved' ||
      ticket.status === 'closed' ||
      ticket.status === 'cancelled'
    ) {
      return NextResponse.json(
        { error: 'cannot_reassign_terminal_ticket' },
        { status: 409 },
      );
    }
  }

  try {
    if (parsed.data.assignedCrewId) {
      // The original logic restricted the write to `routed` /
      // `in_progress`. We preserve that for the with-`toStatus`
      // path; for the reassign-only path, we accept any
      // non-terminal status.
      const allowAssignment =
        !parsed.data.toStatus ||
        parsed.data.toStatus === 'routed' ||
        parsed.data.toStatus === 'in_progress';
      if (allowAssignment) {
        const before = await db.ticket.findUnique({ where: { id: ticket.id } });
        await db.ticket.update({
          where: { id: ticket.id },
          data: { assignedCrewId: parsed.data.assignedCrewId },
        });
        // Bump the optimistic-lock counter so a concurrent
        // transition that read this ticket before the reassignment
        // loses its compare-and-swap rather than clobbering the
        // new assignee.
        await db.ticket.bumpVersion({ where: { id: ticket.id } });
        // Bolt admin-tickets: write an audit row for the reassign
        // (the engine's `ticket.transition` audit only fires when
        // toStatus is present; the reassign-only path would
        // otherwise leave no audit trace).
        if (!parsed.data.toStatus && before) {
          await import('@/lib/platform/audit').then((m) =>
            m.writeAudit({
              entityType: 'ticket',
              entityId: ticket.id,
              action: 'reassign.crew',
              actorId: session!.userId,
              beforeValue: { assignedCrewId: before.assignedCrewId },
              afterValue: { assignedCrewId: parsed.data.assignedCrewId },
            }),
          );
        }
      }
    }
    if (parsed.data.toStatus) {
      await transitionTicket({
        ticketId: ticket.id,
        toStatus: parsed.data.toStatus,
        actorId: session!.userId,
        note: parsed.data.note,
      });
    }
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
    if (e instanceof ConcurrentTransitionError) {
      // The requested edge was legal when it was read, but another
      // writer got there first. The client should re-read rather
      // than assume the ticket is in an illegal state.
      return NextResponse.json(
        {
          error: 'concurrent_transition',
          ticket_id: e.ticketId,
          expected_status: e.expectedStatus,
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

  if (parsed.data.toStatus) {
    await sendTicketPush({
      ticketId: ticket.id,
      toStatus: parsed.data.toStatus,
    }).catch(() => undefined);
  }

  const refreshed = await getTicketWithTrail(ticket.id);
  if (!refreshed) {
    return NextResponse.json({ error: 'post_transition_fetch_failed' }, { status: 500 });
  }
  return NextResponse.json({
    ticket: serializeTicketForRole(refreshed, refreshed.trail, session!.role, 'bn'),
  });
}
