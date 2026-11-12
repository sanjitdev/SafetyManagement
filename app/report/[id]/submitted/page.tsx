/**
 * 1.11 Report — Submitted Confirmation.
 *
 * Intent 009 / Unit 004 — citizen surface re-composition.
 *
 * WHAT CHANGED (presentation only)
 * --------------------------------
 *   - The report identifier shown to the citizen is now the PUBLIC
 *     CODE (`#TIX-XXXX`), derived from the internal id by
 *     `formatTicketId`. Before this change the page rendered the RAW
 *     internal id (`#{ticketId}`) and the copy button copied that raw
 *     id — which broke the rule that no internal id ever reaches a
 *     citizen surface.
 *   - The status preview is the `Timeline` primitive: an ordered list
 *     where every step carries an ICON, so the journey is readable
 *     without colour. The four steps are the locked status order.
 *   - Every control is a design-system primitive. The hand-rolled
 *     `<button>`s (copy, view report, back home) are now `Button`,
 *     and the hand-rolled SVGs are now the shared icon registry.
 *
 * WHAT DID NOT CHANGE
 * -------------------
 * The API surface, the transports and the session probe are
 * byte-identical. The page still reads the id from the route
 * params, still probes `/api/report/bootstrap` for a citizen
 * session, and still clears the same two sessionStorage flags.
 *
 * THE CLIPBOARD NOW COPIES THE PUBLIC CODE
 * -----------------------------------------
 * A citizen who copies the number and reads it to the city
 * corporation must read a number the corporation can look up. The
 * raw internal id is not that number. So the clipboard carries the
 * same `#TIX-XXXX` the page shows — the two are always the same
 * string, and the citizen cannot end up with one in the UI and a
 * different one on the clipboard.
 */

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { t, type Language } from '@/lib/i18n/keys';
import { formatTicketId } from '@/lib/format/ticket-id';
import { useLanguage } from '@/components/useLanguage';
import { ReportFlowSkeleton } from '@/components/ui/Skeleton';
import { Button, Timeline, type TimelineItem } from '@/components/ui';
import { ICONS } from '@/lib/ui/icon-map';


type TrailStep = 'submitted' | 'routed' | 'in_progress' | 'resolved';

/**
 * The LOCKED four-step journey, in order.
 *
 * The same order the detail page's trail uses and the same order the
 * report flow's step indicator uses.
 */
const STATUS_TRAIL: TrailStep[] = ['submitted', 'routed', 'in_progress', 'resolved'];

/**
 * The icon that gives each step its SHAPE.
 *
 * A trail that distinguishes its steps by hue alone is unreadable to
 * a colour-blind user, so the icon is mandatory — the `Timeline`
 * primitive requires it.
 */
const TRAIL_STEP_ICON: Record<TrailStep, (typeof ICONS)[keyof typeof ICONS]> = {
  submitted: ICONS.statusSubmitted,
  routed: ICONS.statusRouted,
  in_progress: ICONS.statusInProgress,
  resolved: ICONS.statusResolved,
};

const ANIMATION_FLAG = 'cityfix.reportSubmittedAnimated.v1';

export default function SubmittedPage() {
  // The shared hook owns the language. This page used to
  // hard-code Bangla at module scope, so it ignored the user's
  // language choice entirely.
  const { lang } = useLanguage();
  const LANG = lang;
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

  // The PUBLIC code. Empty until the id resolves — the route param is
  // always present on this route, but the fallback keeps the render
  // safe if it is not.
  const publicCode = ticketId ? formatTicketId(ticketId) : '';

  // Current step index — for a freshly created ticket it's step 1
  // (submitted done, routed in progress). The trail previews the
  // citizen's path.
  const currentStep = 1;

  /**
   * The trail preview.
   *
   * A freshly created ticket has ONE transition (submitted). The
   * other three steps have not happened yet, so they carry the
   * "pending" line rather than a timestamp — a future step has no
   * timestamp, and inventing one would be a lie.
   */
  const trailItems: TimelineItem[] = STATUS_TRAIL.map((step, idx) => {
    const IconEntry = TRAIL_STEP_ICON[step];
    const state: TimelineItem['state'] =
      idx < currentStep ? 'done' : idx === currentStep ? 'current' : 'upcoming';
    return {
      key: step,
      title: t(`trail.${step}` as 'trail.submitted', null, LANG),
      detail:
        state === 'upcoming'
          ? t('confirmation.trail.pending', null, LANG)
          : t(`trail_preview.${step}.time` as 'trail_preview.submitted.time', null, LANG),
      state,
      icon: (
        <IconEntry.icon
          size={14}
          weight={IconEntry.weight}
          aria-hidden
          focusable="false"
        />
      ),
    };
  });

  async function handleCopy() {
    if (!publicCode) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(publicCode);
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
      // the code manually because it's user-selectable text.
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
            <ICONS.check.icon size={12} weight="bold" aria-hidden />
            {t('confirmation.code.copied', null, LANG)}
          </div>
        )}

        {/* Hero — large 96dp checkmark */}
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
          <div
            aria-hidden
            className={animateCheck ? 'report-check-anim' : undefined}
            style={{
              width: 'var(--space-9)',
              height: 'var(--space-9)',
              background: 'var(--color-status-resolved-soft)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto var(--space-4)',
              color: 'var(--color-status-resolved)',
            }}
          >
            <ICONS.statusResolved.icon size={56} weight={ICONS.statusResolved.weight} />
          </div>
          <h1
            lang={LANG}
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

        {/* The PUBLIC report code — mono, copyable. The internal id
            never reaches this surface. */}
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
            <ICONS.verified.icon
              size={14}
              weight={ICONS.verified.weight}
              aria-hidden
            />
            <span>{t('confirmation.code.label', null, LANG)}</span>
            <strong
              id="report-id-text"
              data-testid="report-confirmation-code"
              style={{
                color: 'var(--color-ink)',
                fontWeight: 'var(--weight-semibold)',
                userSelect: 'all',
              }}
            >
              {publicCode || t('confirmation.code.pending', null, LANG)}
            </strong>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCopy}
              disabled={!publicCode}
              aria-label={t('confirmation.code.copy_aria', null, LANG)}
              icon={<ICONS.note.icon size={12} weight={ICONS.note.weight} aria-hidden />}
              data-testid="report-confirmation-copy"
              style={{ marginLeft: 'var(--space-2)' }}
            >
              {t('confirmation.copy_id', null, LANG)}
            </Button>
          </div>
        </div>

        {/* The status trail — the `Timeline` primitive. Every step
            carries an icon, so the journey is readable without
            colour. */}
        <div
          style={{
            background: 'var(--color-surface-page)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-4)',
            marginBottom: 'var(--space-6)',
          }}
        >
          <Timeline
            items={trailItems}
            ariaLabel={t('confirmation.trail.label', null, LANG)}
            lang={LANG}
            data-testid="report-confirmation-trail"
          />
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
            lang={LANG}
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
            <li lang={LANG} style={{ fontSize: 'var(--text-body)', color: 'var(--color-ink-secondary)' }}>
              {t('confirmation.next_step1', null, LANG)}
            </li>
            <li lang={LANG} style={{ fontSize: 'var(--text-body)', color: 'var(--color-ink-secondary)' }}>
              {t('confirmation.next_step2', null, LANG)}
            </li>
            <li lang={LANG} style={{ fontSize: 'var(--text-body)', color: 'var(--color-ink-secondary)' }}>
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
          <Button
            variant="primary"
            size="lg"
            onClick={() => router.push(`/reports/${ticketId}`)}
            disabled={!ticketId}
            data-testid="report-confirmation-view"
            style={{ minHeight: 'var(--touch-cta)' }}
          >
            {t('confirmation.view_report', null, LANG)}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            onClick={() => router.push('/home')}
            data-testid="report-confirmation-home"
            style={{ minHeight: 'var(--touch-cta)' }}
          >
            {t('confirmation.back_home', null, LANG)}
          </Button>
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
          <ICONS.security.icon
            size={14}
            weight={ICONS.security.weight}
            style={{ color: 'var(--color-ink-tertiary)' }}
            aria-hidden
          />
          <span
            lang={LANG}
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
