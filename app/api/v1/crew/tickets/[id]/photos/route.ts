/**
 * POST /api/v1/crew/tickets/[id]/photos
 *
 * CREW-003 (Intent 004, Unit 003): the "Capture after
 * photo" flow. The crew member pastes a URL (the v1
 * surface; v1.1 wires the real camera / file picker)
 * and the route creates a new `TicketPhoto` row with
 * `uploadedByRole: 'crew'`.
 *
 * The route writes three side-effects per upload:
 *
 *   1. A `TicketPhoto` row with `uploadedByRole: 'crew'`
 *      (Bolt 007-001 — the new "after photo" source of
 *      truth; the legacy `Ticket.photoUrls[]` array is gone).
 *   2. A `TicketTrailEntry` with
 *      `note: 'after_photo:<url>'`. The
 *      `after_photo:` prefix is a stable marker the
 *      audit pipeline can grep on; the citizen
 *      serializer rewrites these to a localized
 *      "After photo added" string in the trail view
 *      (Bolt 007-001 — the citizen branch never surfaces
 *      the raw URL).
 *   3. An `AuditEntry` with action
 *      `ticket.after_photo_added`, recording the new
 *      `photoId` + `uploadedByRole`.
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

  // Load the joined ticket (category → department) so the
  // scope check can compare on the same `departmentId` the
  // route is authorised against. `db.ticket.findUnique` does
  // not include the category join; `getTicketWithTrail` does.
  // Bolt 007-001: this fix is what makes the after-photo
  // route usable for crews whose session.departmentId is set.
  const withTrail = await getTicketWithTrail(id);
  if (!withTrail) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Out-of-scope ticket → 404 (NOT 403).
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
  if (ticket.assignedCrewId !== session!.userId) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Bolt 007-001: create the new `TicketPhoto` row with
  // `uploadedByRole: 'crew'`. The `db.ticketPhoto.create` helper
  // works on both Prisma + dev store; the dev store's
  // `ticketPhotos` Map is keyed by ticketId and the new row is
  // sorted into the list by `uploadedAt` ASC.
  const createdPhoto = await db.ticketPhoto.create({
    data: {
      ticketId: ticket.id,
      url: parsed.data.url,
      uploadedByRole: 'crew',
    },
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
    afterValue: {
      photoId: createdPhoto.id,
      url: parsed.data.url,
      uploadedByRole: 'crew',
    },
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
