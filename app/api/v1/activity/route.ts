/**
 * GET /api/v1/activity — city activity feed (citizen-facing).
 *
 * Per UX spec 1.6-home-city-activity (1.13 city-activity-feed):
 *   - 20 most recent tickets in the citizen's city
 *   - Optional status filter
 *   - Order: createdAt DESC
 *   - Polling interval: 10–30s (caller responsibility)
 *
 * For v1 we do not paginate. The 20-item cap is hardcoded; the
 * side-panel UI scrolls inside its region. v1.1 may add cursor-based
 * pagination.
 *
 * Auth required: citizen session. Internal fields are stripped by the
 * serializer.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, getActiveSession, getTicketWithTrail } from '@/lib/db-switch';
import { serializeTicketForRole } from '@/lib/serializers/ticket';

const ActivityInput = z.object({
  status: z
    .enum(['submitted', 'routed', 'in_progress', 'resolved', 'closed', 'cancelled'])
    .optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export async function GET(req: NextRequest) {
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }
  // Authenticated any-role feed: citizens see the anonymised view,
  // dispatchers/crew/admins see the same city-scoped stream with
  // real actor ids (the serializer is role-aware, see
  // lib/serializers/ticket.ts). The query is always city-scoped via
  // session.cityId so a non-citizen role can never see another
  // city's tickets.

  const url = new URL(req.url);
  const parsed = ActivityInput.safeParse({
    status: url.searchParams.get('status') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { status, limit } = parsed.data;

  const tickets = await db.ticket.findMany({
    where: {
      cityId: session.cityId,
      ...(status ? { status: { in: [status] } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  const out = await Promise.all(
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
  return NextResponse.json({ tickets: out });
}