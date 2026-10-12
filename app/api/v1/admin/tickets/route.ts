/**
 * GET /api/v1/admin/tickets — admin Reports list (the table behind
 * the new /admin/tickets page).
 *
 * Bolt admin-tickets (Intent 005, Unit 005). Read-only,
 * gated by `requireRole('admin')` only (no `requireWebAuthn`).
 * Cursor pagination keyed on the ISO timestamp of the last row on
 * the previous page; mirrors the audit dashboard at
 * `app/api/v1/admin/audit/route.ts`.
 *
 * Query params (Zod-validated):
 *   - status?:     'submitted' | 'routed' | 'in_progress' | 'resolved' | 'closed' | 'cancelled'  (single-select)
 *   - cityId?:     string  (defaults to session.cityId; a different value → 403 cross_city_access_denied)
 *   - categoryId?: string
 *   - wardId?:     string
 *   - q?:          string  (exact-match ticket id; the cuid pattern)
 *   - from?:       ISO     (default = now - 7d)
 *   - to?:         ISO     (default = now)
 *   - cursor?:     ISO     (the createdAt of the last row on the previous page)
 *   - limit?:      1..100 (default 50)
 *
 * Response: `{ tickets: SerializedTicket[], nextCursor: string | null }`
 *
 * Cross-city: admins are bound to one city via `User.cityId`. The
 * `cityId` query is optional; if it differs from the session, the
 * route returns 403 `cross_city_access_denied` (same pattern as the
 * dispatcher's queue at `app/api/v1/dispatcher/queue/route.ts:59-61`).
 * A future per-city session-switcher would relax this.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, getActiveSession } from '@/lib/db-switch';
import { ApiError, requireRole, requireSameCity } from '@/lib/auth/guards';
import {
  listTicketsForAdmin,
  TICKET_STATUS_VALUES,
} from '@/lib/admin/tickets-query';

const StatusEnum = z.enum(TICKET_STATUS_VALUES as never);

const QuerySchema = z.object({
  status: StatusEnum.optional(),
  cityId: z.string().min(1).max(80).optional(),
  categoryId: z.string().min(1).max(80).optional(),
  wardId: z.string().min(1).max(80).optional(),
  q: z.string().min(1).max(80).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  cursor: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const session = await getActiveSession();
    if (!session) {
      return NextResponse.json(
        { error: 'unauthenticated' },
        { status: 401 },
      );
    }
    requireRole(session, 'admin');

    const sp = req.nextUrl.searchParams;
    const parsed = QuerySchema.safeParse({
      status: sp.get('status') ?? undefined,
      cityId: sp.get('cityId') ?? undefined,
      categoryId: sp.get('categoryId') ?? undefined,
      wardId: sp.get('wardId') ?? undefined,
      q: sp.get('q') ?? undefined,
      from: sp.get('from') ?? undefined,
      to: sp.get('to') ?? undefined,
      cursor: sp.get('cursor') ?? undefined,
      limit: sp.get('limit') ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_input', issues: parsed.error.issues },
        { status: 400 },
      );
    }

    // Admins are bound to a single city in v1; honour the optional
    // ?cityId= filter but reject any value that doesn't match the
    // session cityId. A different value returns 403, mirroring the
    // dispatcher's queue at app/api/v1/dispatcher/queue/route.ts:59-61.
    const effectiveCityId = parsed.data.cityId ?? session.cityId;
    if (effectiveCityId !== session.cityId) {
      try {
        requireSameCity(session, effectiveCityId);
      } catch (e) {
        if (e instanceof ApiError) {
          return NextResponse.json(
            { error: e.code },
            { status: e.status },
          );
        }
        throw e;
      }
    }

    // If the admin filters by wardId or categoryId, confirm the
    // values exist for this city. A bogus ward/category returns 400
    // so the UI can flag the bad filter rather than silently
    // returning an empty page.
    if (parsed.data.wardId) {
      const w = await db.ward.findUnique({
        where: { id: parsed.data.wardId },
      });
      if (!w || w.cityId !== effectiveCityId) {
        return NextResponse.json(
          { error: 'invalid_ward' },
          { status: 400 },
        );
      }
    }
    if (parsed.data.categoryId) {
      const c = await db.category.findUnique({
        where: { id: parsed.data.categoryId },
      });
      if (!c || c.cityId !== effectiveCityId) {
        return NextResponse.json(
          { error: 'invalid_category' },
          { status: 400 },
        );
      }
    }

    const result = await listTicketsForAdmin({
      ...parsed.data,
      cityId: effectiveCityId,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    return NextResponse.json({ error: 'unhandled' }, { status: 500 });
  }
}