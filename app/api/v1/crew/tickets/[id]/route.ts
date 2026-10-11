/**
 * GET /api/v1/crew/tickets/[id]
 *
 * CREW-003 (Intent 004, Unit 003): the crew's
 * per-ticket read. Returns the full ticket record
 * (incl. internalNote, assignedCrewId, real actorId
 * on trail entries) + the status trail.
 *
 * Out-of-scope ticket id → 404 (NOT 403) so the
 * crew member cannot probe ticket existence outside
 * their scope. A ticket not assigned to the current
 * crew member is also out-of-scope (the list already
 * filters to `assignedCrewId = session.userId`).
 *
 * Auth: requireRole(session, 'crew') + requireScope(...).
 * The cross-scope denial is enforced by the per-ticket
 * wardId check; tickets outside the crew's scope
 * return 404.
 *
 * Backend-agnostic: works on Prisma or the in-memory
 * dev store.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, getActiveSession, getTicketWithTrail } from '@/lib/db-switch';
import { ApiError, requireRole, requireSameCity, requireScope } from '@/lib/auth/guards';
import { serializeTicketForRole } from '@/lib/serializers/ticket';

async function loadInScope(
  session: NonNullable<Awaited<ReturnType<typeof getActiveSession>>>,
  id: string,
) {
  const withTrail = getTicketWithTrail(id);
  if (!withTrail) return null;
  try {
    requireSameCity(session, withTrail.cityId);
  } catch {
    return null;
  }
  try {
    requireScope(session, withTrail.wardId, withTrail.departmentId);
  } catch {
    return null;
  }
  // The crew's list is filtered to
  // `assignedCrewId = session.userId`; a ticket not
  // assigned to the current crew member is
  // out-of-scope (mirrors the dispatcher's contract
  // for cross-ward tickets).
  if (withTrail.assignedCrewId !== session.userId) return null;
  return withTrail;
}

export async function GET(
  _req: NextRequest,
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
  const inScope = await loadInScope(session!, id);
  if (!inScope) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({
    ticket: serializeTicketForRole(
      inScope,
      inScope.trail,
      session!.role,
      'bn',
    ),
  });
}