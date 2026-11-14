/**
 * 1.10b Report — Summary (S-004.5 redesign, dedup-prompt variant)
 *
 * Reached only when the previous step's POST /api/tickets
 * returned `dedup_match: true`. Renders the citizen's draft + a
 * "Looks similar to an existing report" banner with two CTAs:
 *   - Link to this report (navigate to the existing ticket)
 *   - Submit as new report (re-POST with the dedup-decline flag)
 *
 * The redesign turns the dedup confirmation into a 2-column
 * summary surface. Left column (1 col on mobile): a mini-map
 * (240×240) with the pin, plus a 240×240 thumbnail of the
 * first photo (or a placeholder if no photos). Right column
 * (stacked on mobile): a summary card listing category, ward,
 * note, photo count — each as a row with a small "Edit" text
 * button that returns to the matching step.
 *
 * Below the card: a "Confirm" checkbox + "Submit report" primary
 * button. The submit shows a spinner + "জমা হচ্ছে…" loading state
 * with `aria-busy="true"`. On failure: inline error card with
 * "Try again".
 *
 * Server shell; client picks up the dedup context from
 * sessionStorage.
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ReportStepPrimary } from '@/components/ui/ReportStepPrimary';
import { ReportStepAside } from '@/components/ui/ReportStepAside';
import { Button, StatusPill, type StatusKey } from '@/components/ui';
import { ICONS } from '@/lib/ui/icon-map';
import { clearDraft, loadDraft, saveDraft } from '@/lib/report-draft';
import { formatTimestamp } from '@/lib/format/datetime';
import { thumbnailBackground } from '@/lib/format/photo-url';
import { photoErrorKeyForCode } from '@/lib/photo/error-code';
import { t, type Language } from '@/lib/i18n/keys';
import { useLanguage } from '@/components/useLanguage';
import { ReportFlowSkeleton } from '@/components/ui/Skeleton';


interface DedupContext {
  existingTicketId: string;
  distanceMeters: number;
  existingStatus: 'submitted' | 'routed' | 'in_progress' | 'resolved' | 'closed' | 'cancelled';
}

/**
 * Narrow the API's status string to the `StatusPill` key union.
 *
 * The dedup context's `existingStatus` is typed, but the ticket
 * detail response is read from an untyped `response.json()`, so
 * `existing.status` is a plain `string`. A blind `as StatusKey`
 * would let an unexpected value reach `STATUS_VISUAL[status]`,
 * where it would render `undefined` for the label and crash on
 * `visual.icon.icon`. The whitelist below falls back to
 * `submitted` — the only status a brand-new ticket can have —
 * so the pill always renders a real icon + word + colour.
 */
const STATUS_KEYS: readonly StatusKey[] = [
  'submitted',
  'routed',
  'in_progress',
  'resolved',
  'closed',
  'cancelled',
  'paused',
];

function toStatusKey(status: string): StatusKey {
  return (STATUS_KEYS as readonly string[]).includes(status)
    ? (status as StatusKey)
    : 'submitted';
}

export default function SummaryPage() {
  // The shared hook owns the language. This page used to
  // hard-code Bangla at module scope, so it ignored the user's
  // language choice entirely.
  const { lang } = useLanguage();
  const LANG = lang;
  const router = useRouter();
  const [ctx, setCtx] = useState<DedupContext | null>(null);
  const [existing, setExisting] = useState<{
    id: string;
    status: string;
    createdAt: string;
    note: string | null;
    categoryId: string;
    photoUrls: string[];
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const raw = sessionStorage.getItem('cityfix.reportDedup.v1');
    if (!raw) {
      // No dedup context — the user should not be here. Send them back.
      router.replace('/report/location');
      return;
    }
    (async () => {
      try {
        const parsed = JSON.parse(raw) as DedupContext;
        setCtx(parsed);
        const authRes = await fetch('/api/report/bootstrap', { credentials: 'include' });
        if (!authRes.ok) {
          setAuthed(false);
          return;
        }
        setAuthed(true);
        const detail = await fetch(`/api/tickets/${parsed.existingTicketId}`, {
          credentials: 'include',
        });
        if (detail.ok) {
          const body = await detail.json();
          setExisting({
            id: body.ticket.id,
            status: body.ticket.status,
            createdAt: body.ticket.createdAt,
            note: body.ticket.note,
            categoryId: body.ticket.categoryId,
            photoUrls: body.ticket.photoUrls,
          });
        }
      } catch {
        setError(t('report.summary.error_retry', null, LANG));
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  if (authed === false) return null;
  if (loading || !ctx) return <ReportFlowSkeleton lang={LANG} testId="report-summary-loading" />;

  function handleLink() {
    if (!ctx) return;
    sessionStorage.removeItem('cityfix.reportDedup.v1');
    clearDraft();
    router.push(`/reports/${ctx.existingTicketId}`);
  }

  async function handleSubmitAsNew() {
    if (!ctx) return;
    setError(null);
    setSubmitting(true);
    const draft = loadDraft();
    if (!draft || !draft.categoryId) {
      setError(t('report.note.missing_draft', null, LANG));
      setSubmitting(false);
      return;
    }
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cityId: draft.cityId,
          wardId: draft.wardId,
          categoryId: draft.categoryId,
          locationLat: draft.locationLat,
          locationLng: draft.locationLng,
          locationLabel: draft.locationLabel,
          locationLabelBn: draft.locationLabelBn,
          note: draft.note || undefined,
          photoUrls: draft.photoUrls,
          // WO-000 platform layer — the raw bytes for the photos.
          // Present only when a blob provider is configured.
          photoBlobs: draft.photoBlobs ?? [],
          dedupDeclineTicketId: ctx.existingTicketId, // v1.1 audit log field
        }),
      });
      const body = await res.json();
      if (body.dedup_match) {
        setError(t('report.summary.duplicate_again', null, LANG));
        setSubmitting(false);
        return;
      }
      if (!res.ok) {
        // A photo that is still too large gets its own actionable
        // copy — the citizen must know to go back and pick a
        // smaller photo, not just "try again".
        const specificKey = photoErrorKeyForCode(body?.error);
        setError(
          specificKey
            ? t(specificKey, null, LANG)
            : t('report.summary.error_retry', null, LANG),
        );
        setSubmitting(false);
        return;
      }
      sessionStorage.setItem('cityfix.reportDeclineNoted.v1', '1');
      clearDraft();
      sessionStorage.removeItem('cityfix.reportDedup.v1');
      router.push(`/report/${body.ticket.id}/submitted`);
    } catch {
      setError(t('report.summary.error_retry', null, LANG));
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) var(--report-side-panel)',
        /*
         * Size against the CONTENT REGION, not the viewport.
         *
         * `calc(100vh - var(--header-height-desktop))` subtracted only
         * the global header and ignored the step-indicator strip, so
         * the page was 124px taller than the space it had and
         * `.role-app-content` scrolled — the scrollbar the citizen saw
         * on every report step.
         */
        height: 'var(--report-content-height)',
        minHeight: 0,
        // Reserve the FIXED action bar's footprint so the last
        // element in the column is never hidden behind it. Same
        // formula as the other four step pages and mockup 14's
        // `.page`: the bar's content height (`--sticky-cta-height`)
        // plus its own padding on both sides and its 1px top border,
        // plus a full `--space-8` of clearance.
        paddingBottom:
          'calc(var(--sticky-cta-height) + var(--space-3) * 2 + 1px + var(--space-8))',
      }}
      className="report-two-region"
      data-report-step-page
    >
      <div
        style={{
          padding: 'var(--space-6) var(--space-5)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-5)',
          // The page fills the region exactly, so this column scrolls
          // ITSELF if the summary list grows. Without this the column
          // pushes the page past the region and the whole page
          // scrolls.
          minHeight: 0,
          overflowY: 'auto',
          overscrollBehavior: 'contain',
        }}
      >
        <p
          lang={LANG}
          style={{
            margin: 0,
            color: 'var(--color-ink-secondary)',
            fontSize: 'var(--text-body-lg)',
          }}
        >
          {t('report.summary.existing_found', { distance: Math.round(ctx.distanceMeters) }, LANG)}
        </p>

        {existing && (
          <div
            style={{
              padding: 'var(--space-4)',
              background: 'var(--color-warning-soft)',
              border: '1px solid var(--color-warning)',
              borderRadius: 'var(--radius-md)',
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
              gap: 'var(--space-4)',
              alignItems: 'center',
            }}
            className="report-summary-grid"
          >
            {existing.photoUrls[0] && (
              <div
                style={{
                  width: '100%',
                  aspectRatio: '1 / 1',
                  maxWidth: 240,
                  background:
                    thumbnailBackground(existing.photoUrls[0]) ??
                    'var(--color-surface-raised)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  margin: '0 auto',
                }}
                aria-hidden
              />
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <div
                style={{
                  fontSize: 'var(--text-caption)',
                  color: 'var(--color-ink-secondary)',
                  display: 'flex',
                  gap: 'var(--space-2)',
                  alignItems: 'center',
                }}
              >
                <strong style={{ color: 'var(--color-ink)' }}>
                  {t('report.summary.existing_label', null, LANG)}
                </strong>
                <StatusPill
                  status={toStatusKey(existing.status)}
                  lang={LANG}
                  size="sm"
                  data-testid="report-summary-existing-status"
                />
              </div>
              <div
                lang={LANG}
                style={{
                  fontSize: 'var(--text-body)',
                  color: 'var(--color-ink)',
                }}
              >
                {existing.note ?? <em>{t('report.summary.no_note', null, LANG)}</em>}
              </div>
              <div
                style={{
                  fontSize: 'var(--text-caption)',
                  color: 'var(--color-ink-secondary)',
                }}
              >
                {formatTimestamp(existing.createdAt, LANG)} · {Math.round(ctx.distanceMeters)}m {t('report.summary.away_suffix', null, LANG)}
              </div>
            </div>
          </div>
        )}

        {/* Confirm + submit */}
        <section
          style={{
            padding: 'var(--space-5)',
            background: 'var(--color-surface-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-xs)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
          }}
        >
          <label
            style={{
              display: 'flex',
              gap: 'var(--space-3)',
              alignItems: 'flex-start',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              style={{
                width: 'var(--space-5)',
                height: 'var(--space-5)',
                marginTop: 'var(--space-1)',
                accentColor: 'var(--color-accent)',
                flexShrink: 0,
              }}
            />
            <span
              lang={LANG}
              style={{
                fontSize: 'var(--text-body)',
                color: 'var(--color-ink)',
                lineHeight: 'var(--leading-normal)',
              }}
            >
              {t('report.summary.confirm_label', null, LANG)}
            </span>
          </label>

          {error && (
            <div
              role="alert"
              style={{
                padding: 'var(--space-3) var(--space-4)',
                background: 'var(--color-danger-soft)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-danger)',
                color: 'var(--color-ink)',
                fontSize: 'var(--text-body-sm)',
              }}
            >
              {error}
            </div>
          )}

          <div
            style={{
              display: 'flex',
              gap: 'var(--space-3)',
              alignItems: 'center',
              paddingTop: 'var(--space-4)',
              borderTop: '1px solid var(--color-border)',
            }}
            data-testid="report-summary-actions"
          >
            <Button
              variant="secondary"
              onClick={handleLink}
              style={{
                flex: 1,
                minHeight: 'var(--touch-cta)',
                fontSize: 'var(--text-body-lg)',
                background: 'var(--color-surface-raised)',
              }}
              data-testid="report-summary-link"
            >
              {t('report.summary.link_cta', null, LANG)}
            </Button>
          </div>
        </section>
      </div>

      {/*
        The shared step aside. The summary step used to hand-roll its
        own pill and its own H1, which meant it rendered `ধাপ ৫/৫ —
        পর্যালোচনা` where the other four steps render `ধাপ 5 / 5`:
        Bangla numerals instead of ASCII, no spaces around the slash,
        an em-dash, a step name the other four do not carry, and no
        `data-testid` for the spec to hook. One primitive, one format.

        No `error` prop: the card's own `role="alert"` is the single
        announcement, exactly as on steps 1–4. Passing it here too
        made a screen reader say the message twice.
      */}
      <ReportStepAside
        currentStep={5}
        totalSteps={5}
        lang={LANG}
        sticky
        title={t('report.summary.h1', null, LANG)}
        help={t('report.summary.existing_found', { distance: Math.round(ctx.distanceMeters) }, LANG)}
      />

      {/* The FIXED bottom action bar (mockup 14's `.actionbar`).
          The summary step's submit control lives here rather than in
          the card, so the citizen always has it in thumb reach and
          the card's last row is never hidden behind it. The card
          keeps only the "link to the existing report" option, which
          is a decision ABOUT the existing report, not the flow's
          continue control. */}
      <div
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 'var(--z-sticky)',
          background: 'var(--color-surface-card)',
          borderTop: '1px solid var(--color-border)',
        }}
        data-testid="report-step-action-bar"
      >
        <div
          style={{
            maxWidth: 920,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            padding: 'var(--space-3) var(--space-5)',
            minHeight: 'var(--sticky-cta-height)',
          }}
        >
          <div style={{ flex: 1, display: 'flex' }}>
            <ReportStepPrimary
              onClick={handleSubmitAsNew}
              disabled={!confirmed || submitting}
              aria-busy={submitting}
              leading={
                submitting ? (
                  <span aria-hidden style={{ display: 'inline-flex' }}>
                    <ICONS.loading.icon size={16} weight={ICONS.loading.weight} />
                  </span>
                ) : null
              }
              data-testid="report-summary-submit-new"
            >
              {submitting
                ? t('report.note.submitting', null, LANG)
                : t('report.summary.submit_new_cta', null, LANG)}
            </ReportStepPrimary>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 1024px) {
          .report-two-region { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 640px) {
          .report-summary-grid { grid-template-columns: 1fr !important; }
        }
        @keyframes summary-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) {
          @keyframes summary-spin { from { transform: rotate(0deg); } to { transform: rotate(0deg); } }
        }
      `}</style>
    </div>
  );
}
