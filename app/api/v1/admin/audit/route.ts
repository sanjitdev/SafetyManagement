/**
 * GET /api/v1/admin/audit — admin audit dashboard read surface.
 *
 * Bolt 005-004 (Intent 005, Unit 004). Read-only;
 * gated by `requireRole('admin')` only (no `requireWebAuthn`).
 * Cursor pagination keyed on the ISO timestamp of the
 * last row on the previous page.
 *
 * Query params:
 * - `actorId` (string, exact match)
 * - `action` (comma-separated, any-of)
 * - `entityType` (comma-separated, any-of; values from
 *    the closed union: ticket | city | category |
 *    department | ward | user)
 * - `from` (ISO; default = now - 7d)
 * - `to`   (ISO; default = now)
 * - `cursor` (ISO; the createdAt of the last row on
 *    the previous page)
 * - `limit` (1..100, default 50)
 *
 * Response: `{ entries: AuditEntryView[], nextCursor: string | null }`
 *   `AuditEntryView` is documented in `lib/admin/audit-query.ts`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getActiveSession } from '@/lib/db-switch';
import { ApiError, requireRole } from '@/lib/auth/guards';
import { listAuditEntries } from '@/lib/admin/audit-query';

const QuerySchema = z.object({
  actorId: z.string().min(1).max(80).optional(),
  action: z.string().min(1).max(120).optional(),
  entityType: z.string().min(1).max(80).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  cursor: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const EntityTypeSchema = z.enum([
  'ticket',
  'city',
  'category',
  'department',
  'ward',
  'user',
]);

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

    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse(
      Object.fromEntries(url.searchParams.entries()),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_input', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const q = parsed.data;

    if (q.entityType) {
      const list = q.entityType.split(',').map((s) => s.trim()).filter(Boolean);
      for (const t of list) {
        if (!EntityTypeSchema.safeParse(t).success) {
          return NextResponse.json(
            { error: 'invalid_input', detail: `unknown entityType ${t}` },
            { status: 400 },
          );
        }
      }
    }

    const result = await listAuditEntries({
      actorId: q.actorId,
      action: q.action
        ?.split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      entityType: q.entityType
        ?.split(',')
        .map((s) => s.trim())
        .filter(Boolean) as never,
      from: q.from,
      to: q.to,
      cursor: q.cursor,
      limit: q.limit,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    return NextResponse.json({ error: 'unhandled' }, { status: 500 });
  }
}
