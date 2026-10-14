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
 *
 * Backend-agnostic: works on Prisma or the in-memory dev store.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, getActiveSession, getTicketWithTrail } from '@/lib/db-switch';
import { requireRole } from '@/lib/auth/guards';
import { checkDedup } from '@/lib/platform/dedup';
import { writeAudit } from '@/lib/platform/audit';
import { sendTicketPush } from '@/lib/platform/push';
import { serializeTicketForRole } from '@/lib/serializers/ticket';

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
  // When the citizen declines a dedup-match in /report/summary, they
  // re-POST with this set to the existing ticket id. We log it as an
  // audit event so the WO-002 dispatcher can surface possible duplicates
  // for manual review (privacy-respecting, no auto-merge).
  dedupDeclineTicketId: z.string().min(1).optional(),
});

export async function POST(req: NextRequest) {
  const session = await getActiveSession();
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

  // PLAT-REQ-004 dedup check. If the citizen has already seen a dedup
  // match in /report/summary and explicitly declined it, skip the dedup
  // engine for this attempt — the decline is logged below as its own
  // audit event so the city-side review queue can surface it.
  let dup: { existingTicketId: string; distanceMeters: number; existingTicketStatus: string } | null = null;
  if (!input.dedupDeclineTicketId) {
    dup = await checkDedup({
      cityId: input.cityId,
      categoryId: input.categoryId,
      locationLat: input.locationLat,
      locationLng: input.locationLng,
    });
  }
  if (dup) {
    await writeAudit({
      entityType: 'ticket',
      entityId: dup.existingTicketId,
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
        existing_ticket_id: dup.existingTicketId,
        distance_meters: dup.distanceMeters,
        existing_status: dup.existingTicketStatus,
      },
      { status: 200 },
    );
  }

  // Create the ticket + initial trail entry.
  const created = await db.ticket.create({
    data: {
      cityId: input.cityId,
      wardId: input.wardId,
      categoryId: input.categoryId,
      reporterId: session!.userId,
      status: 'submitted',
      locationLat: input.locationLat,
      locationLng: input.locationLng,
      locationLabel: input.locationLabel ?? null,
      locationLabelBn: input.locationLabelBn ?? null,
      note: input.note ?? null,
    },
  });

  // Bolt 007-001: photos are no longer stored as a flat array on
  // the ticket; they live in `TicketPhoto` rows with `uploadedByRole`
  // discriminator. The citizen's submission writes one `citizen` row
  // per uploaded URL.
  for (const url of input.photoUrls) {
    await db.ticketPhoto.create({
      data: {
        ticketId: created.id,
        url,
        uploadedByRole: 'citizen',
      },
    });
  }

  await db.trail.create({
    data: {
      ticketId: created.id,
      toStatus: 'submitted',
      actorId: session!.userId,
    },
  });

  await writeAudit({
    entityType: 'ticket',
    entityId: created.id,
    action: 'ticket.create',
    actorId: session!.userId,
    afterValue: {
      cityId: created.cityId,
      wardId: created.wardId,
      categoryId: created.categoryId,
    },
  });

  // If the citizen declined a dedup match and re-submitted, log a separate
  // event the city-side review queue can surface in WO-002. The declined
  // ticket id and the new one stay linked by `(cityId, categoryId, coords)`.
  // The decline ALSO creates a `DedupFlag` row (DISP-006) so the
  // dispatcher can confirm / dismiss from /dispatcher/dedup.
  if (input.dedupDeclineTicketId) {
    await writeAudit({
      entityType: 'ticket',
      entityId: created.id,
      action: 'ticket.dedup_declined',
      actorId: session!.userId,
      afterValue: {
        declinedMatchTicketId: input.dedupDeclineTicketId,
      },
    });
    // Look up the original ticket so we can denormalise its
    // ward / department for the dispatcher's scope filter.
    const original = await db.ticket.findUnique({
      where: { id: input.dedupDeclineTicketId },
    });
    if (original) {
      const originalCategory = await db.category.findUnique({
        where: { id: original.categoryId },
      });
      await db.dedupFlag.create({
        data: {
          cityId: created.cityId,
          wardId: created.wardId,
          departmentId: originalCategory?.departmentId ?? null,
          ticketId: created.id,
          originalTicketId: original.id,
          citizenReason: null,
        },
      });
    }
  }

  // Best-effort: subscribe the reporter for push on this ticket. The push
  // module stub-logs the fan-out; v1.1 wires the actual wire call.
  await sendTicketPush({ ticketId: created.id, toStatus: 'submitted' }).catch(
    () => undefined,
  );

  const withTrail = await getTicketWithTrail(created.id);
  if (!withTrail) {
    return NextResponse.json({ error: 'post_create_fetch_failed' }, { status: 500 });
  }

  return NextResponse.json(
    {
      ticket: serializeTicketForRole(
        withTrail,
        withTrail.trail,
        session!.role,
        'bn',
      ),
    },
    { status: 201 },
  );
}

export async function GET(req: NextRequest) {
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }
  if (session.role !== 'citizen') {
    return NextResponse.json({ error: 'role_not_supported' }, { status: 403 });
  }
  const tickets = await db.ticket.findMany({
    where: { cityId: session.cityId },
    reporterId: session.userId,
    orderBy: { createdAt: 'desc' },
  });
  const serialized = await Promise.all(
    tickets.map(async (t) => {
      const withTrail = await getTicketWithTrail(t.id);
      if (!withTrail) {
        return serializeTicketForRole(
          t as never,
          [],
          session.role,
          'bn',
        );
      }
      return serializeTicketForRole(
        withTrail,
        withTrail.trail,
        session.role,
        'bn',
      );
    }),
  );
  return NextResponse.json({ tickets: serialized });
}
