/**
 * GET /api/v1/admin/cities/[id]/adoption?from=&to=&compare=1
 *   — the 4.7 Post-launch Adoption Dashboard payload.
 *
 * Bolt 005-003 (Intent 005, Unit 003).
 *
 * Query parameters:
 *   from   — ISO date (inclusive lower bound of the window).
 *   to     — ISO date (inclusive upper bound of the window).
 *   compare — `1` to include the Dhaka overlay.
 *
 * The response is a JSON snapshot; the page never polls.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, getActiveSession } from '@/lib/db-switch';
import { ApiError, requireRole } from '@/lib/auth/guards';
import {
  buildAdoptionDashboard,
  type AdoptionCityRow,
} from '@/lib/admin/adoption';
import {
  listCityCitizens,
  listCitySessions,
  listCityStaff,
  listCityTickets,
  listCityWards,
  listTicketTrail,
} from '@/lib/admin/users-db';

const QuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  compare: z.string().optional(),
});

/** The city slug used for the "Compare with Dhaka" overlay. */
const DHAKA_SLUG = 'dhaka-north';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getActiveSession();
    if (!session) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }
    requireRole(session, 'admin');

    const url = new URL(req.url);
    const parsedQuery = QuerySchema.safeParse({
      from: url.searchParams.get('from') ?? undefined,
      to: url.searchParams.get('to') ?? undefined,
      compare: url.searchParams.get('compare') ?? undefined,
    });
    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: 'invalid_input', issues: parsedQuery.error.issues },
        { status: 400 },
      );
    }

    const city = await db.city.findUnique({ where: { id: params.id } });
    if (!city) {
      return NextResponse.json({ error: 'city_not_found' }, { status: 404 });
    }

    // --- The window ---------------------------------------------------
    // Default: "since launch" — the city's creation date to now.
    //
    // `DevCity` now carries a `createdAt` (the seed order), so the
    // dev path has a real window start instead of falling back to
    // the epoch. The Prisma path reads the same column.
    const cityCreatedAt = toIsoOf(
      (city as { createdAt?: string | Date }).createdAt,
    );
    const toIso = parsedQuery.data.to
      ? normaliseBoundary(parsedQuery.data.to, false)
      : new Date().toISOString();
    const fromIso = parsedQuery.data.from
      ? normaliseBoundary(parsedQuery.data.from, true)
      : normaliseBoundary(cityCreatedAt ?? toIso, true);
    if (Date.parse(fromIso) > Date.parse(toIso)) {
      return NextResponse.json({ error: 'invalid_range' }, { status: 400 });
    }

    // --- The current city's data --------------------------------------
    const [tickets, citizens, staff, sessions, wards] = await Promise.all([
      // The FULL city history, not just the window: the previous
      // window's deltas and the 2nd-report retention window both
      // need rows outside the range.
      listCityTickets(params.id),
      listCityCitizens(params.id),
      listCityStaff(params.id),
      listCitySessions(params.id),
      listCityWards(params.id),
    ]);
    const trail = await listTicketTrail(tickets.map((t) => t.id));

    // --- The Dhaka comparison -----------------------------------------
    let comparisonCity: AdoptionCityRow | null = null;
    let comparisonTickets: Awaited<ReturnType<typeof listCityTickets>> = [];
    let comparisonCitizens: { id: string; createdAt: string | Date }[] = [];
    if (parsedQuery.data.compare === '1' || parsedQuery.data.compare === 'true') {
      const dhaka = await db.city.findUniqueBySlug({ where: { slug: DHAKA_SLUG } });
      if (dhaka && dhaka.id !== params.id) {
        comparisonCity = {
          id: dhaka.id,
          slug: dhaka.slug,
          name: dhaka.name,
          nameBn: dhaka.nameBn ?? null,
        };
        comparisonTickets = await listCityTickets(dhaka.id);
        comparisonCitizens = await listCityCitizens(dhaka.id);
      }
    }

    const dashboard = buildAdoptionDashboard({
      cityId: params.id,
      citySlug: city.slug,
      fromIso,
      toIso_: toIso,
      tickets,
      citizens,
      staff,
      sessions: sessions.map((s) => ({
        userId: s.userId,
        lastSeenAt: s.lastSeenAt,
        expiresAt: s.expiresAt,
      })),
      trail,
      wards,
      comparisonCity,
      comparisonTickets,
      comparisonCitizens,
    });

    return NextResponse.json(dashboard, { status: 200 });
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    return NextResponse.json({ error: 'unhandled' }, { status: 500 });
  }
}

/**
 * Normalise a date boundary to an ISO timestamp. A bare `YYYY-MM-DD`
 * becomes the start of that day for the lower bound and the END of
 * that day for the upper bound, so a "last 7 days" range covers the
 * whole final day.
 */
function normaliseBoundary(value: string, isStart: boolean): string {
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    return isStart ? `${v}T00:00:00.000Z` : `${v}T23:59:59.999Z`;
  }
  const parsed = Date.parse(v);
  if (Number.isNaN(parsed)) {
    return isStart ? new Date(0).toISOString() : new Date().toISOString();
  }
  return new Date(parsed).toISOString();
}

function toIsoOf(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}
