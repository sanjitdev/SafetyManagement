/**
 * 1.11 Report — Submitted Confirmation (S-004.6 redesign)
 *
 * Centered 720px card. Renders a large 96dp green checkmark
 * (CheckCircle2-style inline SVG), the report ID in mono font
 * with a copy-to-clipboard button, a 3-step "What happens next"
 * list, and the two CTA pair (View report, Back to home).
 *
 * The success checkmark animation is gated on a sessionStorage
 * flag set only on the first visit, so reloads of the same URL
 * do not re-animate (FR-9 acceptance).
 *
 * If the citizen just declined a dedup match, surfaces a polite
 * toast reading the flag from sessionStorage
 * ('cityfix.reportDeclineNoted.v1').
 *
 * Server component shell; client component for the toast +
 * animation gate.
 */

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { t, type Language } from '@/lib/i18n/keys';
import { ReportFlowSkeleton } from '@/components/ui/Skeleton';

const LANG: Language = 'bn';

type TrailStep = {
  key: 'submitted' | 'routed' | 'in_progress' | 'resolved';
  titleKey: string;
  timeKey: string;
};

const STATUS_TRAIL: TrailStep[] = [
  { key: 'submitted', titleKey: 'trail_preview.submitted.title', timeKey: 'trail_preview.submitted.time' },
  { key: 'routed', titleKey: 'trail_preview.routed.title', timeKey: 'trail_preview.routed.time' },
  { key: 'in_progress', titleKey: 'trail_preview.in_progress.title', timeKey: 'trail_preview.in_progress.time' },
  { key: 'resolved', titleKey: 'trail_preview.resolved.title', timeKey: 'trail_preview.resolved.time' },
];

const ANIMATION_FLAG = 'cityfix.reportSubmittedAnimated.v1';

export default function SubmittedPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const ticketId = params?.id ?? '';
  const [showDeclineToast, setShowDeclineToast] = useState(false);
  const [showCopiedToast, setShowCopiedToast] = useState(false);
  const [animateCheck, setAnimateCheck] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // Light-touch: just confirm we have a citizen session before rendering.
        const res = await fetch('/api/report/bootstrap', { credentials: 'include' });
        if (!res.ok) {
          setAuthed(false);
          return;
        }
        setAuthed(true);
        // The decline-noted toast fires after a declined dedup suggestion.
        if (sessionStorage.getItem('cityfix.reportDeclineNoted.v1') === '1') {
          setShowDeclineToast(true);
          sessionStorage.removeItem('cityfix.reportDeclineNoted.v1');
          window.setTimeout(() => setShowDeclineToast(false), 6000);
        }
        if (sessionStorage.getItem(ANIMATION_FLAG) !== '1') {
          setAnimateCheck(true);
          sessionStorage.setItem(ANIMATION_FLAG, '1');
          window.setTimeout(() => setAnimateCheck(false), 1300);
        }
      } catch {
        setAuthed(false);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <ReportFlowSkeleton lang={LANG} testId="report-submitted-loading" />;

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

  async function handleCopy() {
    if (!ticketId) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(ticketId);
      } else {
        // Fallback: select + document.execCommand
        const el = document.getElementById('report-id-text') as HTMLSpanElement | null;
        if (el) {
          const range = document.createRange();
          range.selectNodeContents(el);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
          document.execCommand('copy');
          sel?.removeAllRanges();
        }
      }
      setShowCopiedToast(true);
      window.setTimeout(() => setShowCopiedToast(false), 1500);
    } catch {
      // Clipboard write was blocked — the citizen can still select
      // the ID manually because it's user-selectable text.
    }
  }

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
          maxWidth: 720,
          background: 'var(--color-surface-card)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-7) var(--space-6) var(--space-6)',
          boxShadow: 'var(--shadow-md)',
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
              color: 'var(--color-on-primary)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-caption)',
              boxShadow: 'var(--shadow-md)',
              whiteSpace: 'nowrap',
              zIndex: 1,
            }}
          >
            {t('confirmation.toast.decline_noted', null, LANG)}
          </div>
        )}

        {showCopiedToast && (
          <div
            role="status"
            aria-live="polite"
            style={{
              position: 'absolute',
              top: 'var(--space-5)',
              right: 'var(--space-5)',
              padding: 'var(--space-2) var(--space-3)',
              background: 'var(--color-ink)',
              color: 'var(--color-on-primary)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-caption)',
              boxShadow: 'var(--shadow-md)',
              zIndex: 2,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-1)',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {t('confirmation.copied', null, LANG)}
          </div>
        )}

        {/* Hero — large 96dp checkmark */}
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
          <div
            aria-hidden
            className={animateCheck ? 'report-check-anim' : undefined}
            style={{
              width: 96,
              height: 96,
              background: 'var(--color-status-resolved-soft, #F0F8F4)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto var(--space-4)',
              color: 'var(--color-status-resolved, var(--color-success))',
            }}
          >
            <svg
              width="56"
              height="56"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="8 12 11 15 16 9" />
            </svg>
          </div>
          <h1
            lang="bn"
            style={{
              margin: '0 0 var(--space-2)',
              fontSize: 'var(--text-display-md)',
              lineHeight: 'var(--leading-tight)',
              letterSpacing: 'var(--tracking-tight)',
              color: 'var(--color-ink)',
            }}
            className="report-confirm-h1"
          >
            {t('confirmation.title.accepted', null, LANG)}
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: 'var(--text-body)',
              color: 'var(--color-ink-secondary)',
              lineHeight: 'var(--leading-normal)',
            }}
          >
            {t('confirmation.subtitle.sent', null, LANG)}
            <br />
            {t('confirmation.subtitle.track', null, LANG)}
          </p>
        </div>

        {/* Ticket ID — mono, copyable */}
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
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-2) var(--space-3)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              fontSize: 'var(--text-body-sm)',
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
            <strong
              id="report-id-text"
              style={{
                color: 'var(--color-ink)',
                fontWeight: 'var(--weight-semibold)',
                userSelect: 'all',
              }}
            >
              #{ticketId || 'TIX-...'}
            </strong>
            <button
              type="button"
              onClick={handleCopy}
              disabled={!ticketId}
              aria-label={t('confirmation.copy_id', null, LANG)}
              style={{
                marginLeft: 'var(--space-2)',
                padding: 'var(--space-1) var(--space-3)',
                background: 'var(--color-surface-card)',
                color: 'var(--color-ink)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-pill)',
                fontSize: 'var(--text-caption)',
                fontWeight: 'var(--weight-semibold)',
                cursor: ticketId ? 'pointer' : 'not-allowed',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--space-1)',
                minHeight: 'var(--touch-min)',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              {t('confirmation.copy_id', null, LANG)}
            </button>
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
                className={`trail-step ${isDone ? 'done' : isCurrent ? 'current' : 'pending'}`}
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
                        ? 'var(--color-status-resolved, var(--color-success))'
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
                      ? 'var(--color-status-resolved, var(--color-success))'
                      : isCurrent
                        ? 'var(--color-primary)'
                        : 'var(--color-surface-raised)',
                    color: isDone || isCurrent ? 'var(--color-on-primary)' : 'var(--color-ink-tertiary)',
                    fontSize: 'var(--text-micro)',
                    fontWeight: 'var(--weight-semibold)',
                  }}
                  aria-hidden
                >
                  {isDone ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
                      <polyline points="20 6 9 17 4 12" />
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

        {/* What happens next — 3-step list */}
        <section
          aria-labelledby="next-steps-title"
          style={{
            padding: 'var(--space-4)',
            background: 'var(--color-surface-page)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 'var(--space-6)',
          }}
        >
          <h2
            id="next-steps-title"
            lang="bn"
            style={{
              margin: '0 0 var(--space-3)',
              fontSize: 'var(--text-body-lg)',
              color: 'var(--color-ink)',
              fontWeight: 'var(--weight-semibold)',
            }}
          >
            {t('confirmation.next_title', null, LANG)}
          </h2>
          <ol
            style={{
              margin: 0,
              padding: '0 0 0 var(--space-5)',
              listStyle: 'decimal',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
            }}
          >
            <li lang="bn" style={{ fontSize: 'var(--text-body)', color: 'var(--color-ink-secondary)' }}>
              {t('confirmation.next_step1', null, LANG)}
            </li>
            <li lang="bn" style={{ fontSize: 'var(--text-body)', color: 'var(--color-ink-secondary)' }}>
              {t('confirmation.next_step2', null, LANG)}
            </li>
            <li lang="bn" style={{ fontSize: 'var(--text-body)', color: 'var(--color-ink-secondary)' }}>
              {t('confirmation.next_step3', null, LANG)}
            </li>
          </ol>
        </section>

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
              minHeight: 'var(--touch-cta)',
              background: 'var(--color-primary)',
              color: 'var(--color-on-primary)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-body-lg)',
              fontWeight: 'var(--weight-semibold)',
              cursor: ticketId ? 'pointer' : 'not-allowed',
            }}
          >
            {t('confirmation.view_report', null, LANG)}
          </button>
          <button
            type="button"
            onClick={() => router.push('/home')}
            style={{
              minHeight: 'var(--touch-cta)',
              background: 'transparent',
              color: 'var(--color-ink)',
              border: '1px solid var(--color-border-strong)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-body-lg)',
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
      <style>{`
        @keyframes report-check-pop {
          0% { transform: scale(0.85); opacity: 0; }
          60% { transform: scale(1.05); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        .report-check-anim { animation: report-check-pop 1.2s var(--ease-out); transform-origin: center; }
        @media (prefers-reduced-motion: reduce) {
          .report-check-anim { animation: none !important; }
        }
        @media (min-width: 1025px) {
          .report-confirm-h1 { font-size: var(--text-display-lg) !important; }
        }
      `}</style>
    </div>
  );
}
