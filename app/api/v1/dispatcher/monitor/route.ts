/**
 * GET /api/v1/dispatcher/monitor — the dispatcher's live ticket feed.
 *
 * Backs the "Monitor Updates" surface at `/dispatcher/monitor`
 * (UX spec 2.5). The page polls this endpoint every 5 seconds
 * (the v1 default; WebSocket is a v1.1 enhancement per the spec's
 * open-questions note).
 *
 * Query parameters (Zod-validated):
 *   - filter?: 'all' | 'my_ward' | 'my_crews'   (default: 'all')
 *   - limit?:  number (1-200, default 50)
 *   - cityId?: string (must match the session; otherwise 403
 *     cross_city_access_denied)
 *
 * The route applies the dispatcher's session scope:
 *   - requireRole(session, 'dispatcher') — 401 / 403
 *   - requireSameCity for any `?cityId=` — 403
 *   - ward scoping happens in the service (lib/dispatcher/monitor.ts)
 *
 * Response:
 *   {
 *     rows: MonitorRow[],
 *     charts: { flow, response, crewLoad },
 *     generatedAt: string
 *   }
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getActiveSession } from '@/lib/db-switch';
import { ApiError, requireRole, requireSameCity } from '@/lib/auth/guards';
import {
  clampMonitorLimit,
  listMonitorTickets,
  MONITOR_FILTERS,
  normalizeMonitorFilter,
} from '@/lib/dispatcher/monitor';

const QuerySchema = z.object({
  filter: z
    .string()
    .optional()
    .refine(
      (s) => !s || (MONITOR_FILTERS as readonly string[]).includes(s),
      { message: 'invalid_filter' },
    ),
  limit: z.coerce.number().int().min(1).max(200).default(50),
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
    filter: req.nextUrl.searchParams.get('filter') ?? undefined,
    limit: req.nextUrl.searchParams.get('limit') ?? undefined,
    cityId: req.nextUrl.searchParams.get('cityId') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_query', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const filter = normalizeMonitorFilter(parsed.data.filter);
  const limit = clampMonitorLimit(parsed.data.limit);

  try {
    const result = await listMonitorTickets({
      session: session!,
      filter,
      limit,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    return NextResponse.json(
      { error: 'monitor_read_failed' },
      { status: 500 },
    );
  }
}
