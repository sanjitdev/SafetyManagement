/**
 * POST /api/v1/dispatcher/dedup-flags/[id]/dismiss
 *
 * DISP-006 (Intent 003, Unit 004): the dispatcher agrees with
 * the citizen — the two reports are NOT duplicates. The
 * flag is cleared; the citizen's ticket moves to
 * `submitted` and joins the normal triage queue.
 *
 * Effects (all atomic per the route's handler):
 *   - Ticket (the citizen's new one): status → 'submitted'
 *     (no change if it was already submitted; the flag was
 *     a "pending" overlay on top of `submitted`).
 *   - DedupFlag: status → 'dismissed', resolvedById →
 *     <dispatcher>, resolvedAt → <now>.
 *   - AuditEntry: action 'dedup_dismissed', before + after
 *     JSON captures the flag's status delta.
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

  const beforeTicket = await getTicketWithTrail(flag.ticketId);
  if (!beforeTicket) {
    return NextResponse.json({ error: 'flagged_ticket_missing' }, { status: 500 });
  }

  // Dismiss: ticket is already `submitted` (a dedup-decline is
  // logged at submit time). The flag overlay is the only
  // thing that hides it from the triage queue. Clearing the
  // flag is sufficient — the ticket is then visible to
  // the dispatcher's normal triage filter. We still call
  // `update` so `updatedAt` reflects the dismissal action.
  await db.ticket.update({
    where: { id: flag.ticketId },
    data: { status: 'submitted' },
  });

  // Bump the optimistic-lock counter so a concurrent transition
  // that read this ticket before the dedup-dismiss loses its
  // compare-and-swap rather than clobbering the reset.
  await db.ticket.bumpVersion({ where: { id: flag.ticketId } });

  await db.dedupFlag.update({
    where: { id: flag.id },
    data: {
      status: 'dismissed',
      resolvedById: session!.userId,
      resolvedAt: new Date().toISOString(),
    },
  });

  await writeAudit({
    entityType: 'dedupFlag',
    entityId: flag.id,
    action: 'dedup_dismissed',
    actorId: session!.userId,
    beforeValue: { status: 'pending' },
    afterValue: { status: 'dismissed' },
  });
  await writeAudit({
    entityType: 'ticket',
    entityId: flag.ticketId,
    action: 'dedup_dismissed',
    actorId: session!.userId,
    beforeValue: { hiddenFromTriageQueue: true },
    afterValue: { hiddenFromTriageQueue: false },
  });

  const refreshed = await getTicketWithTrail(flag.ticketId);
  if (!refreshed) {
    return NextResponse.json(
      { error: 'post_dismiss_fetch_failed' },
      { status: 500 },
    );
  }
  return NextResponse.json({
    status: 'dismissed',
    flagId: flag.id,
    ticket: serializeTicketForRole(
      refreshed,
      refreshed.trail,
      session!.role,
      'bn',
    ),
  });
}
