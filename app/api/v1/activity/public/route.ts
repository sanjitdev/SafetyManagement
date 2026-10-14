/**
 * GET /api/v1/activity/public — anonymous public city activity feed.
 *
 * v1.1 launch-polish hotfix: the public landing at `/` (app/page.tsx)
 * shows a read-only city activity feed for visitors who haven't
 * registered. This endpoint is the data source.
 *
 * No auth required — the response is PII-stripped via
 * `serializeTicketForPublic` (see lib/serializers/ticket.ts). Every
 * internal field is removed: no reporterId, no internalNote, no
 * assignedCrewId, no trail, no locationLabel.
 *
 * Defaults: 20 most recent tickets, scoped to the platform's seeded
 * city. v1 has a single city (Dhaka North), so the cityId is read
 * from the bootstrap endpoint indirectly. For the public feed we
 * surface tickets across the active city only.
 *
 * Polling: caller (the public landing page) refreshes every 30 s.
 * No user-specific state; no rate limit per user — per-IP only via
 * the in-process token bucket (lib/platform/rate-limit.ts) on the
 * existing `POLL_RATE_LIMIT_PER_SECOND` env var (default 1/s).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, getTicketWithTrail } from '@/lib/db-switch';
import { serializeTicketForPublic } from '@/lib/serializers/ticket';

const PublicActivityInput = z.object({
  cityId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const parsed = PublicActivityInput.safeParse({
    cityId: url.searchParams.get('cityId') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { cityId, limit } = parsed.data;

  // If the caller didn't specify a city, default to the platform's
  // first seeded city (v1 = Dhaka North). Looking up by createdAt
  // ASC is a stable proxy; the City model carries the seed order.
  let resolvedCityId = cityId ?? null;
  if (!resolvedCityId) {
    const firstCity = await db.city.findFirst({
      orderBy: { createdAt: 'asc' },
    });
    resolvedCityId = firstCity?.id ?? null;
  }
  if (!resolvedCityId) {
    // No cities seeded yet — return an empty feed rather than 500.
    return NextResponse.json({ tickets: [] });
  }

  const tickets = await db.ticket.findMany({
    where: { cityId: resolvedCityId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  // Bolt 008-011: hydrate each ticket via `getTicketWithTrail` so the
  // public serializer can surface `wardName` / `wardNameBn` (the
  // card renders "Ward 14 — Mirpur" instead of the raw wardId).
  // The trail + photos + reporter fields on the joined row are
  // already dropped by `serializeTicketForPublic`, so this is safe
  // for the anonymous surface.
  const out = await Promise.all(
    tickets.map(async (t) => {
      const withTrail = await getTicketWithTrail(t.id);
      return serializeTicketForPublic((withTrail ?? t) as never);
    }),
  );

  return NextResponse.json({ tickets: out });
}
