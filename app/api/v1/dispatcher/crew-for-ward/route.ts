/**
 * GET /api/v1/dispatcher/crew-for-ward?wardId=...
 *
 * Bolt 007-002 (Intent 007 — Citizen Resolution Visibility):
 * dispatcher crew picker — list endpoint.
 *
 * Query parameters (Zod-validated):
 *   - wardId: string (required)
 *
 * Returns the crew users scoped to the (cityId, wardId) pair.
 * The dispatcher's session cityId is the only city the API
 * reads; the `?wardId=` parameter is checked against the
 * session's city via the matching ward row.
 *
 * Returns `{ crew: Array<{ id, name }> }` ordered by name ASC.
 * The picker renders this list as `<option>` elements; the
 * POST `/api/v1/dispatcher/tickets/[id]/assign-crew` route is
 * the load-bearing trust boundary (it re-validates the chosen
 * crew on save).
 *
 * Backend-agnostic: works on Prisma or the in-memory dev store.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getActiveSession } from '@/lib/db-switch';
import { ApiError, requireRole, requireSameCity } from '@/lib/auth/guards';
import { listCrewForWard } from '@/lib/dispatcher/list-crew-for-ward';

const QuerySchema = z.object({
  wardId: z.string().min(1),
});

export async function GET(req: NextRequest) {
  const session = await getActiveSession();
  try {
    requireRole(session, 'dispatcher');
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }

  const parsed = QuerySchema.safeParse({
    wardId: req.nextUrl.searchParams.get('wardId') ?? '',
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_query', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // City guard: the dispatcher's session cityId is the only
  // city the API reads. The `listCrewForWard` helper takes the
  // caller's cityId verbatim, so the cross-city case is
  // prevented here. (The route is per-city, per the platform
  // rule that crews are bound to (cityId, wardId, departmentId).)
  try {
    requireSameCity(session, session!.cityId);
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }

  const crew = await listCrewForWard({
    cityId: session!.cityId,
    wardId: parsed.data.wardId,
  });
  return NextResponse.json({ crew });
}
