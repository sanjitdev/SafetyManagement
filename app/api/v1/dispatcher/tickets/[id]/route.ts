/**
 * GET / PATCH /api/v1/dispatcher/tickets/[id]
 *
 * DISP-003 + DISP-004 + DISP-005 (Intent 003, Unit 003):
 * the dispatcher's per-ticket surface.
 *
 * - GET: returns the full ticket record (incl. internalNote,
 *   assignedCrewId, real actorId on trail entries) + the status
 *   trail. Out-of-scope ticket id → 404 (NOT 403) to avoid
 *   leaking ticket existence.
 * - PATCH: reassigns (wardId, categoryId) and / or sets the
 *   internalNote. Each field change writes one AuditEntry
 *   (action: 'reassign' or 'internal_note'). Same-ward /
 *   same-category / same-internalNote → no audit row written.
 *
 * Auth: requireRole(session, 'dispatcher') + requireScope(...).
 * The cross-scope denial is enforced by the per-ticket wardId
 * check; tickets outside the dispatcher's scope return 404.
 *
 * Backend-agnostic: works on Prisma or the in-memory dev store.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, getActiveSession, getTicketWithTrail } from '@/lib/db-switch';
import { ApiError, requireRole, requireSameCity, requireScope } from '@/lib/auth/guards';
import { serializeTicketForRole } from '@/lib/serializers/ticket';
import { writeAudit } from '@/lib/platform/audit';
import { buildActorRoleMap } from '@/lib/identity/actor-role-map';

const PatchInput = z.object({
  wardId: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional(),
  internalNote: z.string().max(4000).optional(),
});

/**
 * Resolve a dispatcher-scoped read for the given ticket id.
 * Returns the ticket-with-trail or null if the ticket is
 * out-of-scope (different city / ward / department, or
 * missing entirely). Out-of-scope is indistinguishable from
 * missing so the API can return 404 either way.
 */
async function loadInScope(
  session: NonNullable<Awaited<ReturnType<typeof getActiveSession>>>,
  id: string,
) {
  const withTrail = await getTicketWithTrail(id);
  if (!withTrail) return null;
  // City guard (admins bypass — but this is a dispatcher
  // endpoint, so the requireRole in the caller rejects admins).
  try {
    requireSameCity(session, withTrail.cityId);
  } catch {
    return null;
  }
  // Ward + dept scope guard.
  try {
    requireScope(session, withTrail.wardId, withTrail.departmentId);
  } catch {
    return null;
  }
  return withTrail;
}

export async function GET(
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
  const inScope = await loadInScope(session!, id);
  if (!inScope) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  // Intent 008 / Bolt 008-002 — Story 002: build a
  // (actorId → role) map so the trail can render the actor's
  // display name (Rahim / Habib / Rashid) instead of the raw
  // user id. Only one round-trip per distinct actor.
  const actorRoles = await buildActorRoleMap(
    inScope.trail.map((e) => e.actorId),
  );
  return NextResponse.json({
    ticket: serializeTicketForRole(
      inScope,
      inScope.trail,
      session!.role,
      'bn',
      actorRoles,
    ),
  });
}

export async function PATCH(
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
  const inScope = await loadInScope(session!, id);
  if (!inScope) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = PatchInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { wardId, categoryId, internalNote } = parsed.data;

  // Apply the reassign + internalNote updates. Each change is
  // detected individually (same → no audit row written). City is
  // NOT user-settable; cross-city reassign is denied by the Zod
  // validator (the wardId + categoryId must already exist in
  // the dispatcher's city; a deep cross-city check would need a
  // city lookup; v1 documents the constraint via the
  // dropdown-fed UI).

  const beforeValue: Record<string, unknown> = {};
  const afterValue: Record<string, unknown> = {};
  let changed = false;

  // Ward reassign
  if (typeof wardId === 'string' && wardId !== inScope.wardId) {
    // Out-of-scope wardId check: if the dispatcher tries to
    // move the ticket to a ward in another city, the route
    // rejects before the DB write.
    const targetWard = await db.ward.findUnique({
      where: { id: wardId },
    });
    if (!targetWard) {
      return NextResponse.json(
        { error: 'invalid_ward' },
        { status: 400 },
      );
    }
    if (targetWard.cityId !== session!.cityId) {
      // Cross-city reassign denied. Same 403 we use elsewhere.
      return NextResponse.json(
        { error: 'cross_city_access_denied' },
        { status: 403 },
      );
    }
    beforeValue.wardId = inScope.wardId;
    afterValue.wardId = wardId;
    await db.ticket.update({
      where: { id },
      data: { wardId },
    });
    changed = true;
  }

  // Category reassign
  if (typeof categoryId === 'string' && categoryId !== inScope.categoryId) {
    const targetCat = await db.category.findUnique({
      where: { id: categoryId },
    });
    if (!targetCat) {
      return NextResponse.json(
        { error: 'invalid_category' },
        { status: 400 },
      );
    }
    if (targetCat.cityId !== session!.cityId) {
      return NextResponse.json(
        { error: 'cross_city_access_denied' },
        { status: 403 },
      );
    }
    beforeValue.categoryId = inScope.categoryId;
    afterValue.categoryId = categoryId;
    await db.ticket.update({
      where: { id },
      data: { categoryId },
    });
    changed = true;
  }

  // Internal note (clearing via '' is allowed and recorded)
  if (
    typeof internalNote === 'string' &&
    internalNote !== (inScope.internalNote ?? '')
  ) {
    beforeValue.internalNote = inScope.internalNote;
    afterValue.internalNote = internalNote;
    await db.ticket.update({
      where: { id },
      data: { internalNote },
    });
    changed = true;
  }

  if (changed) {
    // One audit entry per distinct action. If both ward and
    // internalNote changed in one save, the assignment loop
    // records them separately (two AuditEntry rows).
    const hasReassign =
      'wardId' in beforeValue || 'categoryId' in beforeValue;
    const hasNote = 'internalNote' in beforeValue;
    if (hasReassign) {
      await writeAudit({
        entityType: 'ticket',
        entityId: id,
        action: 'reassign',
        actorId: session!.userId,
        beforeValue: pickKeys(beforeValue, ['wardId', 'categoryId']),
        afterValue: pickKeys(afterValue, ['wardId', 'categoryId']),
      });
    }
    if (hasNote) {
      await writeAudit({
        entityType: 'ticket',
        entityId: id,
        action: 'internal_note',
        actorId: session!.userId,
        beforeValue: pickKeys(beforeValue, ['internalNote']),
        afterValue: pickKeys(afterValue, ['internalNote']),
      });
    }
  }

  const refreshed = await getTicketWithTrail(id);
  if (!refreshed) {
    return NextResponse.json(
      { error: 'post_patch_fetch_failed' },
      { status: 500 },
    );
  }
  const refreshedActorRoles = await buildActorRoleMap(
    refreshed.trail.map((e) => e.actorId),
  );
  return NextResponse.json({
    ticket: serializeTicketForRole(
      refreshed,
      refreshed.trail,
      session!.role,
      'bn',
      refreshedActorRoles,
    ),
  });
}

/** Pick a subset of keys from an object. */
function pickKeys(
  obj: Record<string, unknown>,
  keys: ReadonlyArray<string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in obj) out[k] = obj[k];
  return out;
}
