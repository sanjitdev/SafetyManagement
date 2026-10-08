/**
 * 1.10b Report — Summary (dedup prompt per Q6-D in rough-mockups.md)
 *
 * Reached only when the previous step's POST /api/tickets returned
 * `dedup_match: true`. Renders the citizen's draft + a "Looks similar
 * to an existing report" banner with two CTAs:
 *   - Link to this report (navigate to the existing ticket)
 *   - Submit as new report (re-POST with the dedup-decline flag)
 *
 * Server shell; client picks up the dedup context from sessionStorage.
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clearDraft, loadDraft, saveDraft } from '@/lib/report-draft';
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
    setSubmitting(true);
    const draft = loadDraft();
    if (!draft || !draft.categoryId) {
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
          dedupDeclineTicketId: ctx.existingTicketId, // v1.1 audit log field
        }),
      });
      const body = await res.json();
      if (body.dedup_match) {
        // The dedup engine still matched — try a different note, or
        // surface a polite error. v1 keeps the experience gentle.
        setSubmitting(false);
        return;
      }
      if (!res.ok) {
        setSubmitting(false);
        return;
      }
      // Submit as new succeeded. Mark the dedup-decline in the audit log
      // by writing a follow-up note: we surface the "your decline was
      // noted" toast on the confirmation page.
      sessionStorage.setItem('cityfix.reportDeclineNoted.v1', '1');
      clearDraft();
      sessionStorage.removeItem('cityfix.reportDedup.v1');
      router.push(`/report/${body.ticket.id}/submitted`);
    } catch {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        maxWidth: 720,
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
          background: 'var(--color-primary-soft, #e6f2ee)',
          color: 'var(--color-primary)',
          borderRadius: 'var(--radius-pill)',
          fontSize: 'var(--text-caption)',
          fontWeight: 'var(--weight-semibold)',
          alignSelf: 'flex-start',
        }}
      >
        {t('report.summary.step', null, LANG)}
      </div>
      <h1 lang="bn" style={{ margin: 0, fontSize: 'var(--text-h2)', lineHeight: 1.2 }}>
        {t('report.summary.h1', null, LANG)}
      </h1>
      <p
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
            background: 'var(--color-warning-soft, #fdf2cf)',
            border: '1px solid var(--color-warning, #b58410)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            gap: 'var(--space-3)',
            alignItems: 'center',
          }}
        >
          {existing.photoUrls[0] && (
            <div
              style={{
                width: 80,
                height: 80,
                background: `url(${existing.photoUrls[0]}) center/cover no-repeat`,
                borderRadius: 'var(--radius-md)',
                flexShrink: 0,
                border: '1px solid var(--color-border)',
              }}
              aria-hidden
            />
          )}
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 'var(--text-caption)',
                color: 'var(--color-ink-secondary)',
                marginBottom: 'var(--space-1)',
              }}
            >
              {t('report.summary.existing_label', null, LANG)} ·{' '}
              <span
                style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  background: 'var(--color-surface-raised)',
                  borderRadius: 'var(--radius-pill)',
                  color: 'var(--color-ink)',
                  fontWeight: 'var(--weight-semibold)',
                }}
              >
                {t(`status.${existing.status}` as 'status.submitted', null, LANG)}
              </span>
            </div>
            <div
              style={{
                fontSize: 'var(--text-body)',
                color: 'var(--color-ink)',
                marginBottom: 'var(--space-1)',
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
              {new Date(existing.createdAt).toLocaleString()} · {Math.round(ctx.distanceMeters)}m {t('report.summary.away_suffix', null, LANG)}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <button
          type="button"
          onClick={handleLink}
          style={{
            flex: 1,
            padding: 'var(--space-3) var(--space-4)',
            background: 'var(--color-primary)',
            color: 'var(--color-on-primary)',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--text-body-lg)',
            fontWeight: 'var(--weight-semibold)',
            cursor: 'pointer',
          }}
        >
          {t('report.summary.link_cta', null, LANG)}
        </button>
        <button
          type="button"
          onClick={handleSubmitAsNew}
          disabled={submitting}
          style={{
            flex: 1,
            padding: 'var(--space-3) var(--space-4)',
            background: 'transparent',
            color: 'var(--color-ink)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--text-body-lg)',
            fontWeight: 'var(--weight-semibold)',
            cursor: submitting ? 'wait' : 'pointer',
          }}
        >
          {submitting
            ? t('report.summary.submitting', null, LANG)
            : t('report.summary.submit_new_cta', null, LANG)}
        </button>
      </div>
    </div>
  );
}
