/**
 * POST /api/tickets/:id/feedback — the citizen rates the city's
 * resolution of their own report.
 *
 * PLAT-REQ-006 / "feel heard": this is the write path for
 * `Ticket.feedback`. Before this route existed the column was
 * read by the admin adoption funnel and the dispatcher crew table
 * but never written, so both surfaces reported a constant zero.
 *
 * The route is a thin HTTP adapter:
 *
 *   1. `requireRole(session, 'citizen')` — the established guard
 *      (same call the citizen ticket routes use).
 *   2. Zod-validates the body at the boundary (team.md Code Style:
 *      "Zod schemas at every external API boundary").
 *   3. Delegates ALL business logic to
 *      `lib/citizen/feedback.ts` → `submitTicketFeedback`, which
 *      returns a `Result<T, E>` and never throws.
 *   4. Maps the stable error code onto an HTTP status.
 *
 * The service owns the ownership check (`ticket.reporterId ===
 * session.userId`), the resolved-state check, the idempotency
 * rule, the write, and the audit row.
 *
 * Backend-agnostic: works on Prisma or the in-memory dev store.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getActiveSession } from '@/lib/db-switch';
import { requireRole } from '@/lib/auth/guards';
import {
  FEEDBACK_RATINGS,
  submitTicketFeedback,
  type FeedbackErrorCode,
} from '@/lib/citizen/feedback';

const Params = z.object({
  id: z.string().min(1),
});

const FeedbackBody = z.object({
  rating: z.enum(FEEDBACK_RATINGS),
  comment: z.string().max(2000).optional(),
});

/** Stable error code → HTTP status. */
const STATUS_BY_CODE: Record<FeedbackErrorCode, number> = {
  not_found: 404,
  not_owner: 403,
  ticket_not_resolved: 409,
  // The ticket changed between the read and the write. 409, not 422:
  // the request was legal when it was read; the client should re-read
  // and re-apply.
  concurrent_write: 409,
  feedback_write_failed: 500,
};

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getActiveSession();
  try {
    requireRole(session, 'citizen');
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }

  const parsedParams = Params.safeParse(await ctx.params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  const { id } = parsedParams.data;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsedBody = FeedbackBody.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: 'invalid_input', issues: parsedBody.error.issues },
      { status: 400 },
    );
  }

  const result = await submitTicketFeedback(id, parsedBody.data, session!);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.code },
      { status: STATUS_BY_CODE[result.error.code] ?? 500 },
    );
  }

  return NextResponse.json(
    {
      ticket_id: result.value.ticketId,
      rating: result.value.rating,
      changed: result.value.changed,
    },
    { status: result.value.changed ? 201 : 200 },
  );
}
