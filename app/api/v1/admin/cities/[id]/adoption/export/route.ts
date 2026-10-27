/**
 * GET /api/v1/admin/cities/[id]/adoption/export?from=&to=
 *   — the 4.7 adoption dashboard's CSV export.
 *
 * Bolt 005-003 (Intent 005, Unit 003).
 *
 * Returns `text/csv` with the daily activity series. The rows are
 * built by `buildAdoptionCsvRows` in `lib/admin/adoption.ts` so the
 * export and the on-screen chart can never drift.
 *
 * The PDF export is NOT server-rendered: the charts are inline SVG,
 * which cannot be rasterised on the server without a rendering
 * dependency. The page therefore uses the browser print stylesheet
 * plus `window.print()` — the user picks "Save as PDF" in the
 * print dialog.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getActiveSession } from '@/lib/db-switch';
import { ApiError, requireRole } from '@/lib/auth/guards';
import {
  buildAdoptionCsvRows,
  buildAdoptionDashboard,
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
});

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
    });
    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: 'invalid_input', issues: parsedQuery.error.issues },
        { status: 400 },
      );
    }

    const toIso = parsedQuery.data.to
      ? normaliseBoundary(parsedQuery.data.to, false)
      : new Date().toISOString();
    const fromIso = parsedQuery.data.from
      ? normaliseBoundary(parsedQuery.data.from, true)
      : new Date(0).toISOString();
    if (Date.parse(fromIso) > Date.parse(toIso)) {
      return NextResponse.json({ error: 'invalid_range' }, { status: 400 });
    }

    const [tickets, citizens, staff, sessions, wards] = await Promise.all([
      listCityTickets(params.id),
      listCityCitizens(params.id),
      listCityStaff(params.id),
      listCitySessions(params.id),
      listCityWards(params.id),
    ]);
    const trail = await listTicketTrail(tickets.map((t) => t.id));

    const dashboard = buildAdoptionDashboard({
      cityId: params.id,
      citySlug: params.id,
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
      comparisonCity: null,
      comparisonTickets: [],
      comparisonCitizens: [],
    });

    const { header, rows } = buildAdoptionCsvRows(dashboard);
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\r\n');

    return new NextResponse(csv.endsWith('\n') ? csv : `${csv}\r\n`, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="adoption-${params.id}.csv"`,
      },
    });
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    return NextResponse.json({ error: 'unhandled' }, { status: 500 });
  }
}

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
