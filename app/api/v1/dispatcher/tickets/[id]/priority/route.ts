/**
 * POST /api/v1/dispatcher/tickets/[id]/priority
 *
 * The dispatcher's triage control: set the priority band on a
 * ticket.
 *
 * WHY A DEDICATED ENDPOINT, NOT A FIELD ON THE PATCH ROUTE
 * ---------------------------------------------------------
 * The dispatcher PATCH route already writes three fields — ward,
 * category, internal note — through a shared `guardedWrite` helper.
 * Priority could have been a fourth, and for the WRITE it nearly is.
 *
 * It is separate for two reasons:
 *
 *   1. It is the one field the DISPATCHER QUEUE orders by. Every
 *      read of the queue — the list, the counts, the order — depends
 *      on it. A field that only existed on the detail endpoint
 *      could not order a list.
 *   2. It is a TRIAGE DECISION, and the audit trail is where a
 *      decision belongs. `assign-crew` set that precedent: a
 *      separate service precisely so its audit row is unambiguous
 *      (`ticket.priority`, not the PATCH route's generic
 *      `reassign`).
 *
 * Body: `{ priority: 'low' | 'normal' | 'high' | 'urgent' }`.
 *
 * Auth: `requireRole(session, 'dispatcher')`. The cross-ward guard
 * lives in the service (`lib/dispatcher/set-priority.ts`); an
 * out-of-scope ticket id returns 404 (NOT 403) so a dispatcher
 * cannot probe ticket existence outside their scope.
 *
 * Side-effects on a successful write:
 *   1. `Ticket.priority` set to the requested band.
 *   2. `Ticket.prioritySetAt` stamped — this is what distinguishes
 *      "nobody has triaged this" from "a dispatcher judged this
 *      `low`", which share the same priority value.
 *   3. One `AuditEntry` written with action `ticket.priority`,
 *      carrying `{ priority: prev | next }` in before / after.
 *
 * Same-value no-op (the current priority already matches the
 * request) writes NO audit row and bumps NO version — a dispatcher
 * clicking "urgent" on an already-urgent ticket has not made a
 * decision.
 *
 * Backend-agnostic: works on Prisma or the in-memory dev store.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getActiveSession } from '@/lib/db-switch';
import { ApiError, requireRole } from '@/lib/auth/guards';
import { setPriority } from '@/lib/dispatcher/set-priority';
import { ConcurrentWriteError } from '@/lib/platform/concurrency';
import { serializeTicketForRole } from '@/lib/serializers/ticket';
import { buildActorRoleMap } from '@/lib/identity/actor-role-map';

/**
 * The four bands. Mirrors the Prisma `TicketPriority` enum and the
 * `TicketPriority` type in `lib/dispatcher/priority.ts`.
 */
const PriorityInput = z.object({
  priority: z.enum(['low', 'normal', 'high', 'urgent']),
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
  const parsed = PriorityInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await setPriority(id, parsed.data, session!);
    const actorRoles = await buildActorRoleMap(
      result.ticket.trail.map((e) => e.actorId),
    );
    return NextResponse.json({
      ticket: serializeTicketForRole(
        result.ticket,
        result.ticket.trail,
        session!.role,
        'bn',
        actorRoles,
      ),
      changed: result.changed,
    });
  } catch (e) {
    if (e instanceof ConcurrentWriteError) {
      // Another dispatcher triaged this ticket between our read and
      // our write. 409, not 422: the request was legal when it was
      // read. The client should re-read and re-apply.
      return NextResponse.json(
        {
          error: 'concurrent_write',
          ticket_id: e.ticketId,
          field: e.field,
          expected_version: e.expectedVersion,
        },
        { status: 409 },
      );
    }
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
