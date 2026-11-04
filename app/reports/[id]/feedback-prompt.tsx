/**
 * Citizen feedback prompt (app/reports/[id]/feedback-prompt.tsx).
 *
 * A small `'use client'` child of the citizen report-detail page.
 *
 * ── Why a separate file ───────────────────────────────────────
 *
 * `app/reports/[id]/page.tsx` is already a client component, but
 * the feedback prompt is a self-contained island: it owns the
 * submit / error / already-sent state machine and talks to
 * `POST /api/tickets/:id/feedback`. Extracting it keeps the
 * detail page readable AND gives the module a clean place to
 * document the wire contract.
 *
 * (It is deliberately NOT imported into any server component
 * that pulls in `next/headers` transitively — the prompt only
 * depends on `lib/i18n/keys.ts`, which is browser-safe.)
 *
 * ── The wire contract ─────────────────────────────────────────
 *
 *   POST /api/tickets/:id/feedback
 *     body: { rating: 'positive' | 'negative' | 'neutral', comment?: string }
 *     201 → { ticket_id, rating, changed: true }   (first rating / re-rating)
 *     200 → { ticket_id, rating, changed: false }  (same rating re-submitted)
 *     4xx → { error: '<stable code>' }
 *
 * The optimistic UI sets the "thanks" state immediately, then
 * reconciles with the server: a failure reverts to the prompt
 * and shows the error copy.
 *
 * ── Copy ──────────────────────────────────────────────────────
 *
 * Every user-facing string goes through `t(...)` from
 * `lib/i18n/keys.ts` (team.md Forbidden: no hard-coded copy).
 */

'use client';

import { useState } from 'react';
import { t, type Language } from '@/lib/i18n/keys';
// The rating vocabulary lives in a dependency-free module so this
// `'use client'` island never pulls `next/headers` (via the
// service's `lib/db-switch` import) into the client bundle.
import type { FeedbackRating } from '@/lib/citizen/feedback-rating';

const LANG: Language = 'bn';

/** The three rating buttons, in the order they render. */
const RATING_ORDER: FeedbackRating[] = ['positive', 'negative', 'neutral'];

/** The i18n key for a rating button's label. */
const RATING_LABEL_KEY: Record<FeedbackRating, string> = {
  positive: 'detail.feedback.rating.positive',
  negative: 'detail.feedback.rating.negative',
  neutral: 'detail.feedback.rating.neutral',
};

export interface FeedbackPromptProps {
  /** The ticket the citizen is rating. */
  ticketId: string;
  /**
   * The rating the citizen already gave, if any. `null` means the
   * prompt is still open. Pre-filling it means a citizen who
   * reloads the page sees their recorded rating rather than an
   * empty prompt.
   */
  initialRating?: FeedbackRating | null;
  /** Called when the citizen taps "Tell us more" (the dispute path). */
  onDispute?: () => void;
}

export default function FeedbackPrompt({
  ticketId,
  initialRating = null,
  onDispute,
}: FeedbackPromptProps) {
  // `null` = not yet rated. A rating = submitted (optimistically
  // or confirmed by the server).
  const [rating, setRating] = useState<FeedbackRating | null>(initialRating);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(next: FeedbackRating) {
    if (pending) return;
    setPending(true);
    setError(null);
    // Optimistic: show the "thanks" state straight away. The
    // server response reconciles it — on failure we revert.
    const previous = rating;
    setRating(next);
    try {
      const res = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}/feedback`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rating: next }),
      });
      if (!res.ok) {
        setRating(previous);
        setError(t('detail.feedback.failed', null, LANG));
        return;
      }
      // 201 (changed) and 200 (idempotent re-submit of the same
      // rating) are both a success — keep the optimistic state.
    } catch {
      setRating(previous);
      setError(t('detail.feedback.failed', null, LANG));
    } finally {
      setPending(false);
    }
  }

  const submitted = rating !== null;

  return (
    <div>
      {submitted ? (
        <>
          <div
            lang="bn"
            style={{
              fontSize: 'var(--text-body-sm)',
              color: 'var(--color-primary)',
              fontWeight: 'var(--weight-semibold)',
            }}
          >
            {t('detail.feedback.thanks', null, LANG)}
          </div>
          <div
            style={{
              marginTop: 'var(--space-2)',
              fontSize: 'var(--text-micro, 11px)',
              color: 'var(--color-ink-tertiary)',
            }}
          >
            {t('detail.feedback.resubmit', null, LANG)}
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
            {RATING_ORDER.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => submit(r)}
                disabled={pending}
                aria-pressed={rating === r}
                style={{
                  height: 36,
                  padding: '0 var(--space-3)',
                  borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${
                    rating === r
                      ? 'var(--color-primary)'
                      : 'var(--color-border-strong, #aaa)'
                  }`,
                  background: 'var(--color-surface-card)',
                  color: rating === r ? 'var(--color-primary)' : 'var(--color-ink)',
                  fontWeight: 'var(--weight-medium)',
                  fontSize: 'var(--text-caption)',
                  cursor: pending ? 'wait' : 'pointer',
                }}
              >
                {t(RATING_LABEL_KEY[r] as 'detail.feedback.rating.positive', null, LANG)}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div
            style={{
              fontSize: 'var(--text-micro, 11px)',
              fontWeight: 'var(--weight-semibold)',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: 'var(--color-ink-tertiary)',
              marginBottom: 'var(--space-2)',
            }}
          >
            {t('detail.feedback.rating.label', null, LANG)}
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            {RATING_ORDER.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => submit(r)}
                disabled={pending}
                style={{
                  height: 40,
                  padding: '0 var(--space-4)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-primary)',
                  background: 'var(--color-surface-card)',
                  color: 'var(--color-primary)',
                  fontWeight: 'var(--weight-semibold)',
                  cursor: pending ? 'wait' : 'pointer',
                }}
              >
                {t(RATING_LABEL_KEY[r] as 'detail.feedback.rating.positive', null, LANG)}
              </button>
            ))}
            {onDispute && (
              <button
                type="button"
                onClick={onDispute}
                disabled={pending}
                style={{
                  height: 40,
                  padding: '0 var(--space-4)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border-strong, #aaa)',
                  background: 'var(--color-surface-card)',
                  color: 'var(--color-ink)',
                  fontWeight: 'var(--weight-medium)',
                  cursor: pending ? 'wait' : 'pointer',
                }}
              >
                {t('detail.feedback.dispute', null, LANG)}
              </button>
            )}
          </div>
        </>
      )}
      {error && (
        <div
          role="alert"
          style={{
            marginTop: 'var(--space-3)',
            fontSize: 'var(--text-caption)',
            color: 'var(--color-warning, #b58410)',
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
