/**
 * POST /api/v1/crew/tickets/[id]/photos
 *
 * CREW-003 (Intent 004, Unit 003): the "Capture after
 * photo" flow. The crew member pastes a URL (the v1
 * surface; v1.1 wires the real camera / file picker)
 * and the route appends it to `Ticket.photoUrls`.
 *
 * The route writes two side-effects per upload:
 *
 *   1. A `TicketTrailEntry` with
 *      `note: 'after_photo:<url>'`. The
 *      `after_photo:` prefix is a stable marker the
 *      audit pipeline can grep on; the citizen
 *      serializer may render these as "After photo
 *      added" entries (v1.1 polish; the v1 trail
 *      shape is unchanged).
 *   2. An `AuditEntry` with action
 *      `ticket.after_photo_added`, before/after the
 *      `photoUrls` array.
 *
 * Out-of-scope ticket id → 404 (NOT 403).
 *
 * Backend-agnostic: works on Prisma or the in-memory
 * dev store.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, getActiveSession, getTicketWithTrail } from '@/lib/db-switch';
import { ApiError, requireRole, requireSameCity, requireScope } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/platform/audit';
import { serializeTicketForRole } from '@/lib/serializers/ticket';

const PhotoInput = z.object({
  url: z.string().url().max(2000),
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
  const parsed = PhotoInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const ticket = await db.ticket.findUnique({
    where: { id },
  });
  if (!ticket) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Out-of-scope ticket → 404 (NOT 403).
  try {
    requireSameCity(session!, ticket.cityId);
  } catch {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  try {
    requireScope(session!, ticket.wardId, null);
  } catch {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (ticket.assignedCrewId !== session!.userId) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const before = ticket.photoUrls.slice();
  const after = [...ticket.photoUrls, parsed.data.url];
  await db.ticket.update({
    where: { id: ticket.id },
    data: { photoUrls: after },
  });
  await db.trail.create({
    data: {
      ticketId: ticket.id,
      toStatus: ticket.status,
      actorId: session!.userId,
      note: `after_photo:${parsed.data.url}`,
    },
  });
  await writeAudit({
    entityType: 'ticket',
    entityId: ticket.id,
    action: 'ticket.after_photo_added',
    actorId: session!.userId,
    beforeValue: { photoUrls: before },
    afterValue: { photoUrls: after },
  });

  const refreshed = await getTicketWithTrail(ticket.id);
  if (!refreshed) {
    return NextResponse.json(
      { error: 'post_photo_fetch_failed' },
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