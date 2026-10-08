/**
 * 1.11 Report — Submitted Confirmation
 *
 * Centered 640px card. Renders the ticket ID, status trail
 * (4 steps with the current step highlighted), and the two CTA pair
 * (View report, Back to home). Matches mockup 03-report-submitted.html.
 *
 * If the citizen just declined a dedup match, surfaces a polite toast
 * reading the flag from sessionStorage('cityfix.reportDeclineNoted.v1').
 *
 * Server component shell; client component for the decline-noted toast.
 */

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { t, type Language } from '@/lib/i18n/keys';

const LANG: Language = 'bn';

type TrailStep = { key: 'submitted' | 'routed' | 'in_progress' | 'resolved'; titleKey: string; timeKey: string };

const STATUS_TRAIL: TrailStep[] = [
  { key: 'submitted', titleKey: 'trail_preview.submitted.title', timeKey: 'trail_preview.submitted.time' },
  { key: 'routed', titleKey: 'trail_preview.routed.title', timeKey: 'trail_preview.routed.time' },
  { key: 'in_progress', titleKey: 'trail_preview.in_progress.title', timeKey: 'trail_preview.in_progress.time' },
  { key: 'resolved', titleKey: 'trail_preview.resolved.title', timeKey: 'trail_preview.resolved.time' },
];

export default function SubmittedPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const ticketId = params?.id ?? '';
  const [showDeclineToast, setShowDeclineToast] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      // Light-touch: just confirm we have a citizen session before rendering.
      const res = await fetch('/api/report/bootstrap', { credentials: 'include' });
      if (!res.ok) {
        setAuthed(false);
        return;
      }
      setAuthed(true);
      // The decline-noted toast fires when the citizen just submitted a
      // duplicate-flagged ticket and chose "Submit as new report". This
      // sessionStorage flag was set by /report/summary before we got here.
      if (sessionStorage.getItem('cityfix.reportDeclineNoted.v1') === '1') {
        setShowDeclineToast(true);
        sessionStorage.removeItem('cityfix.reportDeclineNoted.v1');
        // Auto-dismiss after a few seconds so it doesn't haunt the citizen.
        window.setTimeout(() => setShowDeclineToast(false), 6000);
      }
    })();
  }, []);

  if (authed === false) {
    return (
      <div style={{ padding: 'var(--space-7) var(--space-5)' }}>
        <p>{t('auth.signin_required_short', null, LANG)}</p>
        <a href="/">{t('auth.back_home', null, LANG)}</a>
      </div>
    );
  }

  // Current step index — for a freshly created ticket it's step 1 (submitted
  // done, routed in progress). Status trail previews the citizen's path.
  const currentStep = 1;

  return (
    <div
      style={{
        minHeight: 'calc(100vh - var(--header-height-desktop))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-7) var(--space-5)',
        background: 'var(--color-surface-page)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 640,
          background: 'var(--color-surface-card, #fff)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-7) var(--space-6) var(--space-6)',
          boxShadow: 'var(--shadow-md, 0 2px 8px rgba(0,0,0,0.06))',
          position: 'relative',
        }}
      >
        {showDeclineToast && (
          <div
            role="status"
            aria-live="polite"
            style={{
              position: 'absolute',
              top: 'calc(var(--space-4) * -1)',
              left: '50%',
              transform: 'translateX(-50%) translateY(-100%)',
              padding: 'var(--space-2) var(--space-3)',
              background: 'var(--color-ink)',
              color: 'var(--color-on-primary, #fff)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-caption)',
              boxShadow: 'var(--shadow-md, 0 2px 8px rgba(0,0,0,0.15))',
              whiteSpace: 'nowrap',
              zIndex: 1,
            }}
          >
            {t('confirmation.toast.decline_noted', null, LANG)}
          </div>
        )}

        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
          <div
            style={{
              width: 72,
              height: 72,
              background: 'var(--color-status-resolved-soft, #d4edda)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto var(--space-4)',
            }}
            aria-hidden
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              style={{ color: 'var(--color-status-resolved, #1f7a3f)' }}
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <h1
            lang="bn"
            style={{
              margin: '0 0 var(--space-2)',
              fontSize: 'var(--text-h2)',
              lineHeight: 1.2,
            }}
          >
            {t('confirmation.title.accepted', null, LANG)}
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: 'var(--text-body)',
              color: 'var(--color-ink-secondary)',
              lineHeight: 1.55,
            }}
          >
            {t('confirmation.subtitle.sent', null, LANG)}
            <br />
            {t('confirmation.subtitle.track', null, LANG)}
          </p>
        </div>

        {/* Ticket ID */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginBottom: 'var(--space-5)',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              background: 'var(--color-surface-page)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              padding: 'var(--space-2) var(--space-3)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              fontSize: 'var(--text-caption)',
              color: 'var(--color-ink-secondary)',
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
            <span>{t('confirmation.ticket_id_label', null, LANG)}</span>
            <strong style={{ color: 'var(--color-ink)', fontWeight: 'var(--weight-semibold)' }}>
              #{ticketId || 'TIX-...'}
            </strong>
          </div>
        </div>

        {/* Status trail */}
        <div
          style={{
            background: 'var(--color-surface-page)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-4)',
            marginBottom: 'var(--space-6)',
          }}
        >
          {STATUS_TRAIL.map((step, idx) => {
            const isLast = idx === STATUS_TRAIL.length - 1;
            const isDone = idx < currentStep;
            const isCurrent = idx === currentStep;
            const stepClass = isDone ? 'done' : isCurrent ? 'current' : 'pending';
            return (
              <div
                key={step.key}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 'var(--space-3)',
                  position: 'relative',
                  marginTop: idx === 0 ? 0 : 'var(--space-3)',
                }}
                className={`trail-step ${stepClass}`}
              >
                {!isLast && (
                  <div
                    aria-hidden
                    style={{
                      position: 'absolute',
                      left: 11,
                      top: 24,
                      bottom: -12,
                      width: 2,
                      background: isDone
                        ? 'var(--color-status-resolved, #1f7a3f)'
                        : 'var(--color-border)',
                    }}
                  />
                )}
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: isDone
                      ? 'var(--color-status-resolved, #1f7a3f)'
                      : isCurrent
                        ? 'var(--color-primary)'
                        : 'var(--color-surface-raised)',
                    color:
                      isDone || isCurrent
                        ? 'var(--color-on-primary, #fff)'
                        : 'var(--color-ink-tertiary)',
                    fontSize: 'var(--text-micro, 11px)',
                    fontWeight: 'var(--weight-semibold)',
                  }}
                  aria-hidden
                >
                  {isDone ? (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                    >
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  ) : (
                    idx + 1
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    lang="bn"
                    style={{
                      fontWeight: 'var(--weight-semibold)',
                      fontSize: 'var(--text-body-sm)',
                    }}
                  >
                    {t(step.titleKey as 'trail_preview.submitted.title', null, LANG)}
                  </div>
                  <div
                    style={{
                      fontSize: 'var(--text-caption)',
                      color: 'var(--color-ink-tertiary)',
                      marginTop: 2,
                      opacity: isDone || isCurrent ? 1 : 0.6,
                    }}
                  >
                    {t(step.timeKey as 'trail_preview.submitted.time', null, LANG)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* CTAs */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'var(--space-3)',
          }}
        >
          <button
            type="button"
            onClick={() => router.push(`/reports/${ticketId}`)}
            disabled={!ticketId}
            style={{
              height: 48,
              background: 'var(--color-primary)',
              color: 'var(--color-on-primary)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-body)',
              fontWeight: 'var(--weight-semibold)',
              cursor: ticketId ? 'pointer' : 'not-allowed',
            }}
          >
            {t('confirmation.view_report', null, LANG)}
          </button>
          <button
            type="button"
            onClick={() => router.push('/')}
            style={{
              height: 48,
              background: 'transparent',
              color: 'var(--color-ink)',
              border: '1px solid var(--color-border-strong, #aaa)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-body)',
              fontWeight: 'var(--weight-semibold)',
              cursor: 'pointer',
            }}
          >
            {t('confirmation.back_home', null, LANG)}
          </button>
        </div>

        {/* Trust line */}
        <div
          style={{
            marginTop: 'var(--space-5)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            justifyContent: 'center',
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ color: 'var(--color-ink-tertiary)' }}
            aria-hidden
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <span
            lang="bn"
            style={{
              fontSize: 'var(--text-caption)',
              color: 'var(--color-ink-tertiary)',
            }}
          >
            {t('confirmation.trust.notify', null, LANG)}
          </span>
        </div>
      </div>
    </div>
  );
}