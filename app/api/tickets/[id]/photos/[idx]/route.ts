/**
 * DELETE /api/tickets/:id/photos/:idx — remove a single photo from the
 * citizen's own report.
 *
 * Per photo-retention policy (project.md "Corrections"): indefinite retention
 * with citizen-initiated delete. Only the ticket's reporter may delete a
 * photo, and only while the ticket is not yet `resolved` — once the city
 * has confirmed resolution, the photos stay as the audit trail.
 *
 * Backend-agnostic: works on Prisma or the in-memory dev store. v1
 * persists photos as data URLs in `photoUrls[]`; v1.1 swaps to S3 keys
 * and adds a MinIO delete call.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, getActiveSession, getTicketWithTrail } from '@/lib/db-switch';
import { requireRole } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/platform/audit';
import { serializeTicketForRole } from '@/lib/serializers/ticket';

const Params = z.object({
  id: z.string().min(1),
  idx: z.string().regex(/^\d+$/),
});

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; idx: string }> },
) {
  const session = await getActiveSession();
  try {
    requireRole(session, 'citizen');
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }

  const raw = await ctx.params;
  const parsed = Params.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  const { id, idx } = parsed.data;
  const photoIdx = Number(idx);

  const ticket = await db.ticket.findUnique({ where: { id } });
  if (!ticket) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (ticket.reporterId !== session!.userId) {
    return NextResponse.json({ error: 'not_owner' }, { status: 403 });
  }
  if (ticket.status === 'resolved' || ticket.status === 'closed') {
    return NextResponse.json(
      { error: 'photo_locked_after_resolution' },
      { status: 409 },
    );
  }
  if (photoIdx >= ticket.photoUrls.length) {
    return NextResponse.json({ error: 'photo_index_out_of_range' }, { status: 404 });
  }

  const nextPhotos = ticket.photoUrls.filter((_, i) => i !== photoIdx);
  await db.ticket.update({
    where: { id },
    data: { photoUrls: nextPhotos },
  });

  await writeAudit({
    entityType: 'ticket',
    entityId: id,
    action: 'ticket.photo_delete',
    actorId: session!.userId,
    beforeValue: { photoCount: ticket.photoUrls.length },
    afterValue: { photoCount: nextPhotos.length, deletedIdx: photoIdx },
  });

  const refreshed = getTicketWithTrail(id);
  if (!refreshed) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  // Run through the platform serializer so internal fields stay internal
  // and the citizen only sees what the serializer allows (team.md Mandated).
  const serialized = serializeTicketForRole(refreshed, refreshed.trail, 'citizen', 'bn');
  return NextResponse.json({ ticket: serialized });
}