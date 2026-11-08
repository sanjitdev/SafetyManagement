/**
 * POST /api/v1/dispatcher/dedup-flags/[id]/confirm
 *
 * DISP-006 (Intent 003, Unit 004): the dispatcher confirms
 * that a citizen's "this is a different issue" denial was
 * wrong — the new ticket IS a duplicate of the existing one.
 *
 * Effects (all atomic per the route's handler):
 *   - Ticket (the citizen's new one): status → 'closed',
 *     closeReason → 'duplicate', duplicateOfId → <original>.
 *   - DedupFlag: status → 'confirmed', resolvedById →
 *     <dispatcher>, resolvedAt → <now>.
 *   - AuditEntry: action 'dedup_confirmed', before + after
 *     JSON captures the ticket's status + closeReason delta.
 *
 * Out-of-scope flag id → 404 (NOT 403) so the dispatcher
 * cannot probe flag existence outside their scope.
 *
 * Backend-agnostic: works on Prisma or the in-memory dev store.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, getActiveSession, getTicketWithTrail } from '@/lib/db-switch';
import { ApiError, requireRole, requireSameCity, requireScope } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/platform/audit';
import { serializeTicketForRole } from '@/lib/serializers/ticket';

/**
 * Resolve a dispatcher-scoped read for the given flag id.
 * Returns the flag or null if it is out-of-scope (different
 * city / ward / department, missing entirely, or not pending).
 * Out-of-scope is indistinguishable from missing so the API
 * can return 404 either way.
 */
async function loadPendingFlagInScope(
  session: NonNullable<Awaited<ReturnType<typeof getActiveSession>>>,
  id: string,
) {
  const flag = await db.dedupFlag.findUnique({ where: { id } });
  if (!flag) return null;
  if (flag.status !== 'pending') return null;
  try {
    requireSameCity(session, flag.cityId);
  } catch {
    return null;
  }
  try {
    requireScope(session, flag.wardId, flag.departmentId);
  } catch {
    return null;
  }
  return flag;
}

export async function POST(
  _req: NextRequest,
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
  const flag = await loadPendingFlagInScope(session!, id);
  if (!flag) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Apply the dedup-confirm to the citizen's ticket. The
  // ticket is the one referenced by `flag.ticketId`. The
  // original (the one it's a duplicate of) is `flag.originalTicketId`.
  const beforeTicket = await getTicketWithTrail(flag.ticketId);
  if (!beforeTicket) {
    return NextResponse.json({ error: 'flagged_ticket_missing' }, { status: 500 });
  }
  const original = await db.ticket.findUnique({ where: { id: flag.originalTicketId } });
  if (!original) {
    return NextResponse.json({ error: 'original_ticket_missing' }, { status: 500 });
  }

  await db.ticket.update({
    where: { id: flag.ticketId },
    data: {
      status: 'closed',
      closeReason: 'duplicate',
      duplicateOfId: original.id,
    },
  });

  // Bump the optimistic-lock counter so a concurrent transition
  // that read this ticket before the dedup-confirm loses its
  // compare-and-swap rather than clobbering the close.
  await db.ticket.bumpVersion({ where: { id: flag.ticketId } });

  await db.dedupFlag.update({
    where: { id: flag.id },
    data: {
      status: 'confirmed',
      resolvedById: session!.userId,
      resolvedAt: new Date().toISOString(),
    },
  });

  await writeAudit({
    entityType: 'ticket',
    entityId: flag.ticketId,
    action: 'dedup_confirmed',
    actorId: session!.userId,
    beforeValue: {
      status: beforeTicket.status,
      closeReason: beforeTicket.closeReason,
      duplicateOfId: beforeTicket.duplicateOfId,
    },
    afterValue: {
      status: 'closed',
      closeReason: 'duplicate',
      duplicateOfId: original.id,
    },
  });
  await writeAudit({
    entityType: 'dedupFlag',
    entityId: flag.id,
    action: 'dedup_confirmed',
    actorId: session!.userId,
    beforeValue: { status: 'pending' },
    afterValue: { status: 'confirmed' },
  });

  const refreshed = await getTicketWithTrail(flag.ticketId);
  if (!refreshed) {
    return NextResponse.json(
      { error: 'post_confirm_fetch_failed' },
      { status: 500 },
    );
  }
  return NextResponse.json({
    status: 'confirmed',
    flagId: flag.id,
    ticket: serializeTicketForRole(
      refreshed,
      refreshed.trail,
      session!.role,
      'bn',
    ),
  });
}
