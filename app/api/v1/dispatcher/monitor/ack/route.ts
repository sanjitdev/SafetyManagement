/**
 * POST /api/v1/dispatcher/monitor/ack — acknowledge a monitor update.
 *
 * The per-row "✓" button on the "Monitor Updates" surface
 * (`/dispatcher/monitor`, UX spec 2.5) calls this route to clear
 * the unread notification without opening the row.
 *
 * This is a STATE-CHANGING operation, so it writes an audit row
 * via `writeAudit(...)` from `lib/platform/audit.ts` (action
 * `ticket.monitor_acknowledge`).
 *
 * Request body (Zod-validated):
 *   - ticketId: string (min 1)
 *
 * Response:
 *   { ticketId: string, acknowledgedAt: string }
 *
 * Errors:
 *   - 401 not_authenticated   — no session
 *   - 403 forbidden_role      — session is not a dispatcher
 *   - 400 invalid_input       — body failed Zod validation
 *   - 404 not_found           — ticket missing OR outside the
 *     dispatcher's ward (out-of-scope is reported as 404, not
 *     403, so a dispatcher cannot probe ticket existence outside
 *     their scope)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getActiveSession } from '@/lib/db-switch';
import { ApiError, requireRole } from '@/lib/auth/guards';
import { acknowledgeMonitorUpdate } from '@/lib/dispatcher/monitor';

const BodySchema = z.object({
  ticketId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const session = await getActiveSession();
  try {
    requireRole(session, 'dispatcher');
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await acknowledgeMonitorUpdate(parsed.data.ticketId, session!);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    return NextResponse.json(
      { error: 'monitor_ack_failed' },
      { status: 500 },
    );
  }
}
