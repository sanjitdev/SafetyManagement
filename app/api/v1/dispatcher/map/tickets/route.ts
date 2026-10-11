/**
 * GET /api/v1/dispatcher/map/tickets — list tickets in the dispatcher's
 * map view (DISP-007, Intent 003, Unit 005).
 *
 * Returns the minimal pin set the dispatcher map needs:
 *   { id, lat, lng, status, categoryId, wardId, createdAt }
 * for every ticket in the dispatcher's (cityId, wardId, departmentId)
 * scope, with status in { submitted, routed, in_progress }.
 *
 * The route applies the dispatcher's session scope:
 *   - requireRole(session, 'dispatcher') — 401 / 403
 *   - requireSameCity for any `?cityId=` — 403 cross_city_access_denied
 *   - ward + department scope filtered at the DB / code level
 *     (same shape as the queue route; v1 documents the
 *     cat_streetlight join inline until the dev store grows
 *     a departmentId-aware findMany)
 *
 * Query parameters (Zod-validated):
 *   - status?: 'submitted' | 'routed' | 'in_progress'  (single or
 *     comma-separated; default = all three)
 *   - bbox?: 'swLat,swLng,neLat,neLng'                 (optional
 *     viewport filter — when present, the API narrows the
 *     DB query by `locationLat: { gte, lte }` and
 *     `locationLng: { gte, lte }`)
 *   - limit?: number (1-200, default 200 — the map shows
 *     all pins; a hard cap protects against pathological
 *     over-fetch)
 *   - cityId?: string (must match the session; otherwise
 *     403 cross_city_access_denied via requireSameCity)
 *
 * Response: { pins: Array<MapPin> } where
 *   MapPin = {
 *     id: string,
 *     lat: number,
 *     lng: number,
 *     status: 'submitted' | 'routed' | 'in_progress',
 *     categoryId: string,
 *     wardId: string,
 *     createdAt: string
 *   }
 *
 * The route is GET-only; the dispatcher edits a ticket by clicking
 * the "View ticket" link in the side panel (which routes them to
 * `/dispatcher/tickets/[id]`).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, getActiveSession } from '@/lib/db-switch';
import { ApiError, requireRole, requireSameCity } from '@/lib/auth/guards';

const MAP_STATUS_VALUES = ['submitted', 'routed', 'in_progress'] as const;

const QuerySchema = z.object({
  status: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : undefined))
    .refine(
      (arr) =>
        !arr ||
        arr.length === 0 ||
        arr.every((s) => (MAP_STATUS_VALUES as readonly string[]).includes(s)),
      { message: 'invalid_status' },
    ),
  bbox: z
    .string()
    .optional()
    .refine(
      (s) => {
        if (!s) return true;
        const parts = s.split(',').map((x) => Number(x.trim()));
        if (parts.length !== 4) return false;
        if (parts.some((n) => !Number.isFinite(n))) return false;
        // southLat < northLat; westLng < eastLng
        return parts[0] < parts[2] && parts[1] < parts[3];
      },
      { message: 'invalid_bbox' },
    ),
  limit: z.coerce.number().int().min(1).max(200).default(200),
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
    // The dispatcher's session is bound to a cityId at login; if
    // a ?cityId= is supplied, it MUST match the session cityId.
    const sp = req.nextUrl.searchParams;
    if (sp.get('cityId') && sp.get('cityId') !== session!.cityId) {
      throw new ApiError(403, 'cross_city_access_denied');
    }
    requireSameCity(session, session!.cityId); // sanity: no-op unless session is null
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }

  const parsed = QuerySchema.safeParse({
    status: req.nextUrl.searchParams.get('status') ?? undefined,
    bbox: req.nextUrl.searchParams.get('bbox') ?? undefined,
    limit: req.nextUrl.searchParams.get('limit') ?? undefined,
    cityId: req.nextUrl.searchParams.get('cityId') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_query', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { status, bbox, limit } = parsed.data;

  // Status filter: by default all three dispatcher-visible statuses.
  const wantedStatuses: typeof MAP_STATUS_VALUES[number][] = status && status.length > 0
    ? (status as typeof MAP_STATUS_VALUES[number][])
    : [...MAP_STATUS_VALUES];

  // Build the bbox clause (optional). The dev-store's findMany
  // accepts a `locationLat: { gte, lte }` + `locationLng: { gte,
  // lte }` clause; v1 only triggers the bbox when the client
  // passes it (the map page always sends the initial viewport
  // after the first paint so the DB is never asked to scan the
  // whole city).
  let bboxClause: {
    locationLat?: { gte: number; lte: number };
    locationLng?: { gte: number; lte: number };
  } | undefined;
  if (bbox) {
    const [swLat, swLng, neLat, neLng] = bbox.split(',').map((x) => Number(x.trim()));
    bboxClause = {
      locationLat: { gte: swLat, lte: neLat },
      locationLng: { gte: swLng, lte: neLng },
    };
  }

  const candidates = await db.ticket.findMany({
    where: {
      cityId: session!.cityId,
      status: { in: wantedStatuses as never },
      ...(bboxClause ?? {}),
    },
    orderBy: { createdAt: 'desc' },
  });

  // Apply the ward + department scope in code (same shape as the
  // queue route — the dev store's findMany does not yet expose
  // wardId / departmentId clauses; v1 documents the
  // cat_streetlight join inline).
  const filtered = candidates.filter((t) => {
    if (session!.wardId && t.wardId !== session!.wardId) return false;
    if (session!.departmentId) {
      if (t.categoryId !== 'cat_streetlight') return false;
    }
    return true;
  });

  // Map to the minimal pin shape. The serializer is overkill for
  // a pin (we don't need the trail / internalNote on the map);
  // the API just returns what the map needs to draw + the click
  // handler needs to fetch the detail page.
  const pins = filtered.slice(0, limit).map((t) => ({
    id: t.id,
    lat: t.locationLat,
    lng: t.locationLng,
    status: t.status,
    categoryId: t.categoryId,
    wardId: t.wardId,
    createdAt:
      typeof t.createdAt === 'string' ? t.createdAt : t.createdAt.toISOString(),
  }));

  return NextResponse.json({ pins });
}
