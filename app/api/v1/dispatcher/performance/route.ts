/**
 * GET /api/v1/dispatcher/performance — the ward performance snapshot.
 *
 * Backs the "Ward Performance Snapshot" surface at
 * `/dispatcher/performance` (UX spec 2.7). This is a **snapshot**:
 * the page does NOT poll; it refreshes when the date range changes
 * or when the dispatcher reloads.
 *
 * Query parameters (Zod-validated):
 *   - from?: ISO date-time string (inclusive lower bound)
 *   - to?:   ISO date-time string (inclusive upper bound)
 *   - days?: number (1-90, default 7) — used when `from` is absent
 *   - cityId?: string (must match the session; otherwise 403
 *     cross_city_access_denied)
 *
 * The route applies the dispatcher's session scope:
 *   - requireRole(session, 'dispatcher') — 401 / 403
 *   - requireSameCity for any `?cityId=` — 403
 *   - ward scoping happens in the service
 *     (lib/dispatcher/performance.ts)
 *
 * Response:
 *   {
 *     hero: { totalReports, resolutionRate, avgTimeToResolve },
 *     submittedVsResolved: [{ date, submitted, resolved }],
 *     categoryBreakdown:   [{ categoryId, count }],
 *     statusBreakdown:     [{ status, count }],
 *     crewTable:           [{ crewId, crewName, specialty, ... }],
 *     longTail:            [{ id, categoryId, createdAt, ageMs, ... }],
 *     range: { fromIso, toIso }
 *   }
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getActiveSession } from '@/lib/db-switch';
import { ApiError, requireRole, requireSameCity } from '@/lib/auth/guards';
import {
  getPerformanceSnapshot,
  PERFORMANCE_DEFAULT_DAYS,
  PERFORMANCE_MAX_DAYS,
} from '@/lib/dispatcher/performance';

const IsoDateTime = z.string().refine(
  (s) => Number.isFinite(Date.parse(s)),
  { message: 'invalid_datetime' },
);

const QuerySchema = z.object({
  from: IsoDateTime.optional(),
  to: IsoDateTime.optional(),
  days: z.coerce
    .number()
    .int()
    .min(1)
    .max(PERFORMANCE_MAX_DAYS)
    .default(PERFORMANCE_DEFAULT_DAYS),
  // The dispatcher's `?cityId=` is NOT honoured; the session's
  // cityId is the only city the API reads. We accept the query
  // parameter so a typo returns a 400 instead of silently being
  // ignored — but the value is checked against the session.
  cityId: z.string().min(1).optional(),
});

export async function GET(req: NextRequest) {
  const session = await getActiveSession();
  try {
    requireRole(session, 'dispatcher');
    const sp = req.nextUrl.searchParams;
    if (sp.get('cityId') && sp.get('cityId') !== session!.cityId) {
      throw new ApiError(403, 'cross_city_access_denied');
    }
    requireSameCity(session, session!.cityId);
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }

  const parsed = QuerySchema.safeParse({
    from: req.nextUrl.searchParams.get('from') ?? undefined,
    to: req.nextUrl.searchParams.get('to') ?? undefined,
    days: req.nextUrl.searchParams.get('days') ?? undefined,
    cityId: req.nextUrl.searchParams.get('cityId') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_query', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { from, to, days } = parsed.data;

  try {
    const snapshot = await getPerformanceSnapshot(session!, { from, to, days });
    return NextResponse.json(snapshot);
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    return NextResponse.json(
      { error: 'performance_read_failed' },
      { status: 500 },
    );
  }
}
