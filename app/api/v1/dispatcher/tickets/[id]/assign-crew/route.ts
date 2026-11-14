/**
 * POST /api/v1/dispatcher/tickets/[id]/assign-crew
 *
 * Bolt 007-002 (Intent 007 — Citizen Resolution Visibility):
 * the dispatcher crew picker endpoint.
 *
 * Body: `{ assignedCrewId: string | null }`.
 *
 * Auth: `requireRole(session, 'dispatcher')`. The cross-ward
 * guard is enforced server-side in `lib/dispatcher/assign-crew.ts`
 * (the load-bearing check). Out-of-scope ticket ids (different
 * city / ward / department) return 404 (NOT 403) so a dispatcher
 * cannot probe ticket existence outside their scope.
 *
 * Side-effects on a successful write:
 *   1. `Ticket.assignedCrewId` updated to the requested value
 *      (or `null` to clear).
 *   2. One `AuditEntry` written with action `ticket.assign_crew`
 *      or `ticket.unassign_crew`, carrying
 *      `{ assignedCrewId: prev | next }` in before / after.
 *
 * Same-value no-op (the current `assignedCrewId` already matches
 * the request) returns the unchanged ticket and writes no
 * audit row — matches the same-ward / same-category /
 * same-internalNote no-op pattern in the existing PATCH route.
 *
 * Returns the refreshed ticket via the dispatcher branch of
 * `serializeTicketForRole` (the same shape as the existing
 * GET on `/api/v1/dispatcher/tickets/[id]`).
 *
 * Backend-agnostic: works on Prisma or the in-memory dev store.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getActiveSession } from '@/lib/db-switch';
import { ApiError, requireRole } from '@/lib/auth/guards';
import { assignCrew } from '@/lib/dispatcher/assign-crew';
import { ConcurrentWriteError } from '@/lib/platform/concurrency';
import { serializeTicketForRole } from '@/lib/serializers/ticket';
import { buildActorRoleMap } from '@/lib/identity/actor-role-map';

const AssignInput = z.object({
  // `null` to clear. Empty string rejected so a typo doesn't
  // accidentally clear the assignment.
  assignedCrewId: z.string().min(1).nullable(),
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
  const parsed = AssignInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await assignCrew(id, parsed.data, session!);
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
      // Another dispatcher assigned this ticket between our read and
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
