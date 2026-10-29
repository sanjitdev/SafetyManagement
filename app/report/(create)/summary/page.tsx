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
import { clearDraft, loadDraft, saveDraft } from '@/lib/report-draft';
import { formatTimestamp } from '@/lib/format/datetime';
import { thumbnailBackground } from '@/lib/format/photo-url';
import { t, type Language } from '@/lib/i18n/keys';

const LANG: Language = 'bn';

interface DedupContext {
  existingTicketId: string;
  distanceMeters: number;
  existingStatus: 'submitted' | 'routed' | 'in_progress' | 'resolved' | 'closed' | 'cancelled';
}

export default function SummaryPage() {
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

  useEffect(() => {
    const raw = sessionStorage.getItem('cityfix.reportDedup.v1');
    if (!raw) {
      // No dedup context — the user should not be here. Send them back.
      router.replace('/report/location');
      return;
    }
    const parsed = JSON.parse(raw) as DedupContext;
    setCtx(parsed);
    (async () => {
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
    })();
  }, [router]);

  if (authed === false || !ctx) {
    return null;
  }

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
        setError(t('report.summary.error_retry', null, LANG));
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
        maxWidth: 920,
        margin: '0 auto',
        padding: 'var(--space-7) var(--space-5)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-5)',
      }}
    >
      <div
        style={{
          display: 'inline-block',
          padding: 'var(--space-1) var(--space-3)',
          background: 'var(--color-primary-soft)',
          color: 'var(--color-primary)',
          borderRadius: 'var(--radius-pill)',
          fontSize: 'var(--text-caption)',
          fontWeight: 'var(--weight-semibold)',
          alignSelf: 'flex-start',
        }}
      >
        {t('report.summary.step', null, LANG)}
      </div>
      <h1
        lang="bn"
        style={{
          margin: 0,
          fontSize: 'var(--text-display-lg)',
          lineHeight: 'var(--leading-tight)',
          letterSpacing: 'var(--tracking-tight)',
          color: 'var(--color-ink)',
        }}
      >
        {t('report.summary.h1', null, LANG)}
      </h1>
      <p
        lang="bn"
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
              <span
                style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  background: 'var(--color-surface-card)',
                  borderRadius: 'var(--radius-pill)',
                  color: 'var(--color-ink)',
                  fontSize: 'var(--text-micro)',
                  fontWeight: 'var(--weight-semibold)',
                }}
              >
                {t(`status.${existing.status}` as 'status.submitted', null, LANG)}
              </span>
            </div>
            <div
              lang="bn"
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
              width: 20,
              height: 20,
              marginTop: 2,
              accentColor: 'var(--color-accent)',
              flexShrink: 0,
            }}
          />
          <span
            lang="bn"
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
              background: 'var(--color-surface-card)',
              borderLeft: '4px solid var(--color-destructive)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              borderLeftWidth: 4,
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
          <button
            type="button"
            onClick={handleLink}
            style={{
              flex: 1,
              padding: 'var(--space-3) var(--space-4)',
              background: 'var(--color-surface-raised)',
              color: 'var(--color-ink)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-body-lg)',
              fontWeight: 'var(--weight-semibold)',
              cursor: 'pointer',
              minHeight: 'var(--touch-cta)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'inherit',
            }}
            data-testid="report-summary-link"
          >
            {t('report.summary.link_cta', null, LANG)}
          </button>
          <ReportStepPrimary
            onClick={handleSubmitAsNew}
            disabled={!confirmed || submitting}
            aria-busy={submitting}
            leading={
              submitting ? (
                <span aria-hidden style={{ display: 'inline-flex' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden style={{ animation: 'summary-spin 0.9s linear infinite' }}>
                    <path d="M21 12a9 9 0 1 1-6.2-8.55" />
                  </svg>
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
      </section>
      <style>{`
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
