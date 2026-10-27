/**
 * GET /api/v1/activity/public — public (and city-scoped) city activity feed.
 *
 * v1.1 launch-polish hotfix: the public landing at `/` (app/page.tsx)
 * shows a read-only city activity feed for visitors who haven't
 * registered. This endpoint is the data source. After Bolt 008-012,
 * the /feed page (1.13) also uses this endpoint, so it works for
 * every signed-in role (citizen / dispatcher / crew / admin) — the
 * previous version depended on the citizen-only /api/report/bootstrap
 * which 403'd for staff and surfaced the misleading "Could not load
 * feed" error.
 *
 * No auth required — the response is PII-stripped via
 * `serializeTicketForPublic` (see lib/serializers/ticket.ts). Every
 * internal field is removed: no reporterId, no internalNote, no
 * assignedCrewId, no trail, no locationLabel.
 *
 * Defaults: 20 most recent tickets, scoped to:
 *   - the explicit `?cityId=...` if the caller passed one
 *   - else the active session's city (Bolt 008-012) if a session
 *     cookie is present — this is what makes /feed work for an admin
 *     in Chattogram vs Dhaka North without a query string
 *   - else the platform's primary seeded city (v1 = Dhaka North)
 *
 * Polling: the public landing refreshes every 30 s, /feed every 15 s.
 * No user-specific state; no rate limit per user — per-IP only via
 * the in-process token bucket (lib/platform/rate-limit.ts) on the
 * existing `POLL_RATE_LIMIT_PER_SECOND` env var (default 1/s).
 *
 * Response shape:
 *   { tickets: PublicSerializedTicket[], categories: CategoryStub[] }
 *
 * The `categories` array is the city's category list (id, slug, name,
 * nameBn). The /feed page used to call /api/report/bootstrap just to
 * fetch the category list; surfacing it here lets the page make a
 * single round-trip. Categories are not PII — they're public city
 * configuration.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, getTicketWithTrail, getActiveSession } from '@/lib/db-switch';
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

  // Bolt 008-012: resolve the default city in three tiers:
  //   1. explicit `?cityId=...` from the caller
  //   2. the active session's cityId (so /feed works for an admin or
  //      dispatcher in any city without a query string)
  //   3. the platform's primary seeded city (v1 = Dhaka North)
  //
  // We do NOT throw on bad/missing session cookies — getActiveSession
  // returns null for unauthenticated callers, which is the right
  // behaviour for the public landing page.
  let resolvedCityId = cityId ?? null;
  if (!resolvedCityId) {
    try {
      // Bolt 008-012: read the session cookie directly (we're a public
      // endpoint, so we can't rely on the auth middleware having run).
      // `getActiveSession` does the cookie → session-id → store lookup
      // in one call and returns the union shape (userId, role, cityId,
      // wardId, name). For an anonymous visitor the call returns null
      // and we fall through to the alphabetical-first default.
      const session = await getActiveSession();
      if (session?.cityId) {
        resolvedCityId = session.cityId;
      }
    } catch {
      // getActiveSession can throw if the session-id format is
      // malformed. That's not a /feed-breaking failure — fall through
      // to the public default.
    }
  }
  if (!resolvedCityId) {
    // Anonymous / unauthenticated caller — default to the platform's
    // first seeded city (v1 = Dhaka North). Looking up by createdAt
    // ASC is a stable proxy; the City model carries the seed order.
    const firstCity = await db.city.findFirst({
      orderBy: { createdAt: 'asc' },
    });
    resolvedCityId = firstCity?.id ?? null;
  }
  if (!resolvedCityId) {
    // No cities seeded yet — return an empty feed rather than 500.
    return NextResponse.json({ tickets: [], categories: [] });
  }

  // Bolt 008-012: surface the city's categories in the same response
  // so the /feed page can do the categoryId → name lookup without a
  // second round-trip to the citizen-only /api/report/bootstrap.
  // Category rows are public city configuration (not PII) and small
  // (≈5 rows for v1), so this is a cheap addition. The dev store's
  // `category.findMany` already sorts alphabetically by name; the
  // Prisma path inherits the same default. The shared db-switch type
  // does not expose `orderBy` for categories yet, so we sort in JS
  // here for parity across dev + prod.
  const categoryRows = await db.category.findMany({
    where: { cityId: resolvedCityId },
  });
  const categories = [...categoryRows]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      nameBn: c.nameBn,
    }));

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

  return NextResponse.json({ tickets: out, categories });
}
