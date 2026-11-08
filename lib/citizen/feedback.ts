/**
 * Citizen feedback service (lib/citizen/feedback.ts).
 *
 * PLAT-REQ-006 / "feel heard": the citizen rates the city's
 * resolution of their own report. This module is the ONLY
 * writer of `Ticket.feedback`.
 *
 * ── Why this module exists ─────────────────────────────────────
 *
 * The `Ticket.feedback` column has been READ in two shipped
 * surfaces since WO-000:
 *
 *   - `lib/admin/adoption.ts` — the "Provided feedback" funnel
 *     stage counts tickets whose `feedback` is non-empty.
 *   - `lib/admin/users-db.ts` — the same column is projected
 *     onto the adoption ticket rows.
 *
 * and in one shipped surface since the dispatcher batch:
 *
 *   - `lib/dispatcher/performance.ts` — the crew table's
 *     `positiveFeedback` / `negativeFeedback` / `feedbackRatio`.
 *
 * but NOTHING ever WROTE it: the citizen detail page
 * (`app/reports/[id]/page.tsx`) only flipped a local React state
 * flag. The column was dead, so every one of those reads
 * reported a constant zero / "not enough data".
 *
 * This module closes that loop.
 *
 * ── The persisted shape ─────────────────────────────────────────
 *
 * `Ticket.feedback` is a `String?` column (see
 * `prisma/schema.prisma`). We persist a compact JSON document:
 *
 *   {"rating":"positive","comment":"the crew was quick"}
 *
 * The shape is chosen so that all three readers agree without
 * any of them changing:
 *
 *   1. The admin funnel read is
 *      `currentTickets.filter((t) => (t.feedback ?? '').trim() !== '').length`
 *      — ANY non-empty string counts as "provided feedback", so
 *      a JSON document satisfies it unchanged.
 *   2. The dispatcher crew table needs a POSITIVE / NEGATIVE
 *      signal per crew, so the aggregate reads the `rating` field
 *      out of the JSON document (see `readFeedbackRating` below).
 *      The same helper is used here so the write side and the
 *      read side can never disagree about what a rating means.
 *   3. The citizen UI sends `{ rating, comment? }`; the button
 *      labels map 1:1 onto the three rating values.
 *
 * A plain string was rejected because the crew table needs a
 * POSITIVE / NEGATIVE signal and a free-text column cannot carry
 * one without fragile string matching. A JSON column was
 * rejected because it would require a Prisma schema change
 * (out of scope) and would break the dev-store seam.
 *
 * ── Error convention ───────────────────────────────────────────
 *
 * Per `team.md`: "NEVER throw exceptions across service-layer
 * boundaries — return Result types or use the established
 * `ApiError` class from `lib/auth/guards.ts`."
 *
 * This module returns a `Result<T, E>` and NEVER throws. The
 * error type is a discriminated union of stable machine-readable
 * codes — NOT user-facing copy. The route localises them.
 *
 * Backend-agnostic: works on Prisma or the in-memory dev store
 * through the `db` facade.
 */

import { db } from '@/lib/db-switch';
import { writeAudit } from '@/lib/platform/audit';
import type { SessionContext } from '@/lib/auth/session';
import {
  FEEDBACK_RATINGS,
  isFeedbackRating,
  readFeedbackRating,
  type FeedbackRating,
} from './feedback-rating';

// The rating vocabulary lives in `lib/citizen/feedback-rating.ts`
// (a dependency-free module) so the `'use client'` feedback prompt
// can import the type without dragging `next/headers` into the
// client bundle. Re-exported here so server-side callers have one
// import site.
export {
  FEEDBACK_RATINGS,
  isFeedbackRating,
  readFeedbackRating,
  type FeedbackRating,
};

// =====================================================================
// Types
// =====================================================================

/**
 * The three sentiment values a citizen can pick.
 *
 * `neutral` is a real signal: it means the citizen was neither
 * pleased nor unhappy. It is deliberately NOT counted as either
 * positive or negative in the crew table, so a crew that gets a
 * lot of neutral feedback does not get a misleadingly inflated
 * ratio.
 */

/**
 * The failure codes this module can return. Stable
 * machine-readable constants — NOT user-facing copy.
 */
export type FeedbackErrorCode =
  /** The ticket does not exist. */
  | 'not_found'
  /** The ticket belongs to a different citizen. */
  | 'not_owner'
  /** The ticket is not in a state where feedback makes sense. */
  | 'ticket_not_resolved'
  /** The ticket changed between the read and the write — retry. */
  | 'concurrent_write'
  /** The write failed for an unexpected reason. */
  | 'feedback_write_failed';

export interface FeedbackError {
  code: FeedbackErrorCode;
  /** A human-readable detail for logs. Never rendered to a user. */
  detail?: string;
}

export type Result<T, E = FeedbackError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/** The input the service accepts (already Zod-validated at the route). */
export interface SubmitFeedbackInput {
  /** One of the three canonical ratings. */
  rating: FeedbackRating;
  /** Optional free-text comment from the citizen. */
  comment?: string;
}

/** What the service returns on success. */
export interface SubmitFeedbackResult {
  ticketId: string;
  /** The rating that was persisted. */
  rating: FeedbackRating;
  /** The exact string written to `Ticket.feedback`. */
  stored: string;
  /**
   * `true` when the write changed an existing value, `false` when
   * the citizen re-submitted the SAME rating (idempotent no-op —
   * no audit row is written for a no-op).
   */
  changed: boolean;
}

// =====================================================================
// Pure helpers
// =====================================================================

/**
 * Serialise a feedback document into the string written to
 * `Ticket.feedback`.
 *
 * The key order is fixed (`rating` then `comment`) so the stored
 * value is byte-stable for a given input — that keeps the audit
 * diff and the idempotency comparison deterministic.
 */
export function serializeFeedback(input: SubmitFeedbackInput): string {
  const comment = input.comment?.trim();
  return JSON.stringify(
    comment && comment.length > 0
      ? { rating: input.rating, comment }
      : { rating: input.rating },
  );
}

/**
 * The audit action written for a feedback submission.
 * A single action covers both the first rating and a re-rating
 * (`changed: true` vs `false` is carried in `afterValue`).
 */
export const FEEDBACK_AUDIT_ACTION = 'ticket.feedback_submit';

// =====================================================================
// The write path
// =====================================================================

/**
 * Persist a citizen's feedback on their own ticket.
 *
 * The function NEVER throws — every documented failure comes back
 * as a `Result` with a stable error code.
 *
 * Rules enforced here (the route is a thin adapter over this):
 *
 *   1. The ticket must exist → `not_found`.
 *   2. The ticket must belong to the requesting citizen →
 *      `not_owner`. (Same ownership rule as the citizen's
 *      `GET /api/tickets/:id`: `ticket.reporterId !== session.userId`.)
 *   3. The ticket must be in a state where the citizen is
 *      actually rating a resolution → `ticket_not_resolved`.
 *      Only `resolved` and `closed` tickets accept feedback; the
 *      detail page only shows the prompt for `resolved`.
 *   4. Idempotency: re-submitting the SAME rating is a no-op
 *      (`changed: false`, no audit row, no write). Re-submitting a
 *      DIFFERENT rating is allowed and overwrites the previous
 *      value (a citizen who was satisfied and then re-opened the
 *      ticket may legitimately change their mind); the audit row
 *      records the before/after pair.
 *
 * The route is responsible for the role check (`citizen`) — this
 * function additionally rejects a non-citizen session so the
 * service is safe to call directly.
 */
export async function submitTicketFeedback(
  ticketId: string,
  input: SubmitFeedbackInput,
  session: SessionContext,
): Promise<Result<SubmitFeedbackResult, FeedbackError>> {
  if (session.role !== 'citizen') {
    return { ok: false, error: { code: 'not_owner' } };
  }

  let ticket: {
    id: string;
    reporterId: string;
    status: string;
    feedback?: string | null;
    version?: number;
  } | null;
  try {
    ticket = await db.ticket.findUnique({ where: { id: ticketId } });
  } catch (e) {
    return {
      ok: false,
      error: { code: 'feedback_write_failed', detail: (e as Error).message },
    };
  }

  if (!ticket) {
    return { ok: false, error: { code: 'not_found' } };
  }
  if (ticket.reporterId !== session.userId) {
    return { ok: false, error: { code: 'not_owner' } };
  }
  if (ticket.status !== 'resolved' && ticket.status !== 'closed') {
    return { ok: false, error: { code: 'ticket_not_resolved' } };
  }

  const stored = serializeFeedback(input);
  const previous = ticket.feedback ?? null;

  // Idempotent no-op: the citizen re-submitted the same rating.
  // No write, no audit row — the audit log stays a record of
  // actual state changes.
  if (previous !== null && readFeedbackRating(previous) === input.rating) {
    return {
      ok: true,
      value: {
        ticketId: ticket.id,
        rating: input.rating,
        stored: previous,
        changed: false,
      },
    };
  }

  try {
    // Compare-and-swap on the version this read observed.
    //
    // Feedback does not change the status, but a transition that read
    // this ticket before the rating was stored would otherwise still
    // pass its compare-and-swap — and the rating write would be
    // silently overwritten by the transition's own update. Guarding
    // the write closes that gap in both directions: a lost race
    // returns `concurrent_write` rather than corrupting the ticket.
    const expectedVersion = ticket.version ?? 0;
    const count = await db.ticket.updateWhere({
      where: { id: ticket.id, version: expectedVersion },
      data: { feedback: stored, version: expectedVersion + 1 },
    });
    if (count === 0) {
      return {
        ok: false,
        error: { code: 'concurrent_write', detail: 'ticket_changed_since_read' },
      };
    }
  } catch (e) {
    return {
      ok: false,
      error: { code: 'feedback_write_failed', detail: (e as Error).message },
    };
  }

  await writeAudit({
    entityType: 'ticket',
    entityId: ticket.id,
    action: FEEDBACK_AUDIT_ACTION,
    actorId: session.userId,
    beforeValue: { feedback: previous },
    afterValue: { feedback: stored, rating: input.rating },
  });

  return {
    ok: true,
    value: {
      ticketId: ticket.id,
      rating: input.rating,
      stored,
      changed: true,
    },
  };
}

// =====================================================================
// The aggregate
// =====================================================================

/**
 * One crew member's feedback tally.
 *
 * The shape `buildCrewTable` expects:
 * `{ crewId, positive, negative }`.
 */
export interface CrewFeedbackTally {
  crewId: string;
  positive: number;
  negative: number;
}

/** A ticket as the aggregate sees it. */
export interface FeedbackTicketRow {
  id: string;
  assignedCrewId: string | null;
  feedback?: string | null;
}

/**
 * Aggregate the persisted citizen feedback into a per-crew
 * positive / negative tally.
 *
 * Rules:
 *   - Only tickets with an ASSIGNED crew are counted — a ticket
 *     nobody worked cannot be attributed to a crew.
 *   - Only `positive` and `negative` ratings move a counter.
 *     `neutral` feedback is intentionally ignored: it is neither
 *     a positive nor a negative signal, and counting it in the
 *     denominator would dilute the ratio with a third category
 *     the crew table does not display.
 *   - Tickets with no feedback (or unparseable feedback) are
 *     ignored.
 *   - A crew with no feedback at all still gets a row with
 *     `positive: 0, negative: 0` — `buildCrewTable` treats that
 *     as "not enough data" and suppresses the ratio, which is
 *     the honest reading.
 *
 * Pure — the unit tests drive it directly.
 */
export function aggregateCrewFeedback(
  tickets: FeedbackTicketRow[],
): CrewFeedbackTally[] {
  const byCrew = new Map<string, CrewFeedbackTally>();
  for (const t of tickets) {
    if (!t.assignedCrewId) continue;
    const rating = readFeedbackRating(t.feedback);
    if (rating === null || rating === 'neutral') continue;
    const row =
      byCrew.get(t.assignedCrewId) ??
      { crewId: t.assignedCrewId, positive: 0, negative: 0 };
    if (rating === 'positive') row.positive += 1;
    else row.negative += 1;
    byCrew.set(t.assignedCrewId, row);
  }
  return [...byCrew.values()];
}
