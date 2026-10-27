/**
 * Citizen feedback rating vocabulary (lib/citizen/feedback-rating.ts).
 *
 * A tiny, dependency-free module that owns the THREE things both
 * the server-side service and the client-side UI must agree on:
 *
 *   1. The canonical rating values.
 *   2. The type that carries them.
 *   3. How to read a rating back out of a persisted feedback
 *      document.
 *
 * ── Why it is separate from `lib/citizen/feedback.ts` ─────────
 *
 * `lib/citizen/feedback.ts` is the WRITE path: it reaches the DB
 * through `lib/db-switch.ts`, which pulls in `next/headers` (via
 * `lib/auth/session.ts`). A `'use client'` component must never
 * import that chain — Next.js refuses to bundle `next/headers` into
 * a client component.
 *
 * The citizen detail page's feedback prompt needs the rating TYPE
 * and the label mapping. Those live here, in a module with no
 * server-only imports, so the client island stays browser-safe.
 *
 * The service re-exports everything here, so server-side callers
 * can keep importing from `@/lib/citizen/feedback` alone.
 */

export const FEEDBACK_RATINGS = ['positive', 'negative', 'neutral'] as const;

export type FeedbackRating = (typeof FEEDBACK_RATINGS)[number];

/** True when `value` is one of the three canonical ratings. */
export function isFeedbackRating(value: unknown): value is FeedbackRating {
  return (
    typeof value === 'string' &&
    (FEEDBACK_RATINGS as readonly string[]).includes(value)
  );
}

/**
 * The `rating` field of a persisted feedback document.
 *
 * This is the SINGLE source of truth for what a stored feedback
 * string means. Both the writer
 * (`lib/citizen/feedback.ts` → `serializeFeedback`) and the
 * dispatcher aggregate (`aggregateCrewFeedback`) call it, so the
 * two can never drift.
 *
 * Returns `null` for a missing / blank / unparseable value, and
 * for a document whose `rating` is not one of the three canonical
 * values. Callers treat `null` as "no usable signal".
 */
export function readFeedbackRating(
  stored: string | null | undefined,
): FeedbackRating | null {
  if (!stored) return null;
  const trimmed = stored.trim();
  if (trimmed === '') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // Legacy / hand-written value that is not a JSON document.
    // There is no sentiment to recover — treat it as no signal.
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const rating = (parsed as { rating?: unknown }).rating;
  return isFeedbackRating(rating) ? rating : null;
}
