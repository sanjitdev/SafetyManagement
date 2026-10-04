/**
 * POST /api/tickets — citizen creates a new report.
 *
 * PLAT-REQ-004: dedup check (prompt, not auto-merge).
 * PLAT-REQ-005: initial trail entry (status=submitted, actor=reporter).
 * PLAT-REQ-007: audit log entry.
 *
 * Returns either:
 *   - 201 with the created ticket (no dedup match)
 *   - 200 with `{dedup_match: true, existing_ticket: {...}}` (no creation)
 *
 * The citizen-facing serializer hides internal fields (PLAT-REQ-001).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { requireRole } from '@/lib/auth/guards';
import { checkDedup } from '@/lib/platform/dedup';
import { writeAudit } from '@/lib/platform/audit';
import { sendTicketPush } from '@/lib/platform/push';
import {
  serializeTicketForRole,
  ticketInclude,
} from '@/lib/serializers/ticket';

const CreateTicketInput = z.object({
  cityId: z.string().min(1),
  wardId: z.string().min(1),
  categoryId: z.string().min(1),
  locationLat: z.number().min(-90).max(90),
  locationLng: z.number().min(-180).max(180),
  locationLabel: z.string().max(500).optional(),
  locationLabelBn: z.string().max(500).optional(),
  note: z.string().max(2000).optional(),
  photoUrls: z.array(z.string().url()).max(5).default([]),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  try {
    requireRole(session, 'citizen');
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = CreateTicketInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // Per-city isolation: citizens can only file in their own city.
  if (input.cityId !== session!.cityId) {
    return NextResponse.json({ error: 'cross_city_forbidden' }, { status: 403 });
  }

  // PLAT-REQ-004 dedup check.
  const dup = await checkDedup({
    cityId: input.cityId,
    categoryId: input.categoryId,
    locationLat: input.locationLat,
    locationLng: input.locationLng,
  });
  if (dup) {
    await writeAudit({
      entityType: 'ticket',
      entityId: dup.existingTicket.id,
      action: 'ticket.dedup_detected',
      actorId: session!.userId,
      afterValue: {
        candidateLat: input.locationLat,
        candidateLng: input.locationLng,
        distanceMeters: dup.distanceMeters,
      },
    });
    return NextResponse.json(
      {
        dedup_match: true,
        existing_ticket_id: dup.existingTicket.id,
        distance_meters: dup.distanceMeters,
      },
      { status: 200 },
    );
  }

  // Create the ticket + initial trail entry atomically.
  const created = await prisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.create({
      data: {
        cityId: input.cityId,
        wardId: input.wardId,
        categoryId: input.categoryId,
        reporterId: session!.userId,
        status: 'submitted',
        locationLat: input.locationLat,
        locationLng: input.locationLng,
        locationLabel: input.locationLabel,
        locationLabelBn: input.locationLabelBn,
        note: input.note,
        photoUrls: input.photoUrls,
        trail: {
          create: {
            toStatus: 'submitted',
            actorId: session!.userId,
          },
        },
      },
      include: ticketInclude,
    });
    await tx.auditEntry.create({
      data: {
        entityType: 'ticket',
        entityId: ticket.id,
        action: 'ticket.create',
        actorId: session!.userId,
        afterValue: {
          cityId: ticket.cityId,
          wardId: ticket.wardId,
          categoryId: ticket.categoryId,
        },
      },
    });
    return ticket;
  });

  // Best-effort: subscribe the reporter for push on this ticket. The push
  // module stub-loggs the fan-out; v1.1 wires the actual wire call.
  await sendTicketPush({ ticketId: created.id, toStatus: 'submitted' }).catch(
    () => undefined,
  );

  return NextResponse.json(
    {
      ticket: serializeTicketForRole(created, session!.role, 'bn'),
    },
    { status: 201 },
  );
}