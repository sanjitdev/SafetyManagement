/**
 * POST /api/v1/crew/tickets/[id]/transition
 *
 * CREW-003 (Intent 004, Unit 003): crew-driven status
 * transition.
 *
 * The crew persona is allowed to transition tickets
 * to `in_progress` (from `routed`) and `resolved`
 * (from `in_progress`). The transition engine
 * (`lib/platform/transitions.ts`) validates the edge.
 *
 * The dispatcher owns the start of the chain
 * (`submitted → routed`) and the cancellation
 * (`any → cancelled`); the crew cannot cancel a
 * ticket — they escalate to the dispatcher.
 *
 * The `resolved` transition REQUIRES a non-empty
 * `note` (CREW-004 Acceptance 3). The Zod
 * `superRefine` enforces this at the API layer; the
 * page also disables the button when the note is
 * empty, but the API is the source of truth.
 *
 * Out-of-scope ticket id → 404 (NOT 403) so the
 * crew member cannot probe ticket existence outside
 * their scope. (The list filter already restricts
 * the visible tickets to `assignedCrewId =
 * session.userId`; the 404 is the safety net for
 * direct URL access.)
 *
 * Backend-agnostic: works on Prisma or the in-memory
 * dev store.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getActiveSession, getTicketWithTrail } from '@/lib/db-switch';
import { ApiError, requireRole, requireSameCity, requireScope } from '@/lib/auth/guards';
import {
  transitionTicket,
  InvalidTransitionError,
} from '@/lib/platform/transitions';
import { sendTicketPush } from '@/lib/platform/push';
import { serializeTicketForRole } from '@/lib/serializers/ticket';

const ALLOWED_CREW_TRANSITIONS = ['in_progress', 'resolved'] as const;

const TransitionInput = z
  .object({
    toStatus: z.enum(['in_progress', 'resolved', 'cancelled']),
    note: z.string().max(1000).optional(),
  })
  .superRefine((data, ctx) => {
    // CREW-004 Acceptance 3: the `resolved` transition
    // requires a non-empty note. The engine writes the
    // note into `TicketTrailEntry.note`; an empty note
    // for a terminal status would leave the citizen
    // wondering what was done.
    if (data.toStatus === 'resolved') {
      const note = (data.note ?? '').trim();
      if (note.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['note'],
          message: 'resolution_note_required',
        });
      }
    }
  });

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getActiveSession();
  try {
    requireRole(session, 'crew');
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
    // The `superRefine` failure for `resolved` without a
    // note surfaces as `error: invalid_input` with the
    // `resolution_note_required` issue. The page disables
    // the button when the note is empty, but a stale
    // request (the user cleared the textarea while the
    // request was in flight) still gets a clean 400.
    return NextResponse.json(
      { error: 'invalid_input', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  if (!ALLOWED_CREW_TRANSITIONS.includes(parsed.data.toStatus as never)) {
    // `cancelled` is the canonical non-crew transition;
    // the dispatcher owns it. A crew member can only
    // mark in_progress / resolved.
    return NextResponse.json(
      { error: 'role_cannot_perform_transition' },
      { status: 403 },
    );
  }

  // Load the ticket with trail so we have the category's
  // departmentId for the scope check. (Same fix as the
  // dispatcher transition route — passing `null` for the
  // departmentId is wrong because the crew's session is
  // bound to a specific department.)
  const withTrail = await getTicketWithTrail(id);
  if (!withTrail) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const ticket = withTrail;

  // Out-of-scope ticket → 404 (NOT 403). The list
  // already filters by `assignedCrewId =
  // session.userId`; this is the safety net for
  // direct URL access.
  try {
    requireSameCity(session!, ticket.cityId);
  } catch {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  try {
    requireScope(
      session!,
      ticket.wardId,
      withTrail.departmentId ?? null,
    );
  } catch {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  // The crew's list is filtered to `assignedCrewId =
  // session.userId`; a ticket not assigned to the
  // current crew member is also out-of-scope.
  if (ticket.assignedCrewId !== session!.userId) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  try {
    await transitionTicket({
      ticketId: ticket.id,
      toStatus: parsed.data.toStatus as never,
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
    toStatus: parsed.data.toStatus as never,
  }).catch(() => undefined);

  const refreshed = await getTicketWithTrail(ticket.id);
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