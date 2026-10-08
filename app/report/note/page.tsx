/**
 * 1.10 Report — Note & Submit (also writes to /report/summary)
 *
 * Optional free-text note (max 500 chars). On Submit, the client POSTs
 * to /api/tickets. If the API returns `dedup_match: true`, the client
 * navigates to /report/summary with the dedup context in sessionStorage
 * so the summary can render the "Looks similar" prompt.
 *
 * Otherwise the client navigates straight to /report/:id/submitted.
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clearDraft, loadDraft, saveDraft } from '@/lib/report-draft';
import { t, type Language } from '@/lib/i18n/keys';

const NOTE_MAX = 500;
const LANG: Language = 'bn';

export default function NotePage() {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/report/bootstrap', { credentials: 'include' });
      if (!res.ok) {
        setAuthed(false);
        return;
      }
      setAuthed(true);
      const draft = loadDraft();
      if (draft?.note) setNote(draft.note);
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

  function handleSubmit() {
    setError(null);
    setSubmitting(true);
    const draft = loadDraft();
    if (!draft || !draft.categoryId) {
      setError(t('report.note.missing_draft', null, LANG));
      setSubmitting(false);
      return;
    }
    saveDraft({ ...draft, note, step: 'summary' });
    (async () => {
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
            note: note || undefined,
            photoUrls: draft.photoUrls,
          }),
        });
        const body = await res.json();
        if (body.dedup_match) {
          // Pass the dedup context through to /report/summary.
          sessionStorage.setItem(
            'cityfix.reportDedup.v1',
            JSON.stringify({
              existingTicketId: body.existing_ticket_id,
              distanceMeters: body.distance_meters,
              existingStatus: body.existing_status,
            }),
          );
          router.push('/report/summary');
          return;
        }
        if (!res.ok) {
          setError(body.error ?? `${t('report.note.submit_failed', null, LANG)} (${res.status})`);
          setSubmitting(false);
          return;
        }
        clearDraft();
        sessionStorage.removeItem('cityfix.reportDedup.v1');
        router.push(`/report/${body.ticket.id}/submitted`);
      } catch (err) {
        setError((err as Error).message);
        setSubmitting(false);
      }
    })();
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 480px',
        minHeight: 'calc(100vh - var(--header-height-desktop))',
      }}
      className="report-two-region"
    >
      <style>{`
        @media (max-width: 1024px) {
          .report-two-region { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div style={{ padding: 'var(--space-6) var(--space-5)' }}>
        <h1 lang="bn" style={{ margin: '0 0 var(--space-2)', fontSize: 'var(--text-h3)' }}>
          {t('report.note.h1', null, LANG)}
        </h1>
        <p
          style={{
            color: 'var(--color-ink-secondary)',
            margin: '0 0 var(--space-4)',
            fontSize: 'var(--text-body)',
          }}
        >
          {t('report.note.help', { max: NOTE_MAX }, LANG)}
        </p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
          maxLength={NOTE_MAX}
          placeholder={t('report.note.placeholder', null, LANG)}
          rows={6}
          style={{
            width: '100%',
            padding: 'var(--space-3)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-body)',
            resize: 'vertical',
          }}
        />
        <div
          style={{
            marginTop: 'var(--space-2)',
            fontSize: 'var(--text-caption)',
            color: 'var(--color-ink-secondary)',
            textAlign: 'right',
          }}
        >
          {note.length} / {NOTE_MAX}
        </div>

        {error && (
          <div
            style={{
              marginTop: 'var(--space-3)',
              padding: 'var(--space-3)',
              background: 'var(--color-warning-soft, #fdf2cf)',
              border: '1px solid var(--color-warning, #b58410)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-ink)',
              fontSize: 'var(--text-caption)',
            }}
          >
            {error}
          </div>
        )}
      </div>

      <aside
        style={{
          padding: 'var(--space-6) var(--space-5)',
          background: 'var(--color-surface-raised)',
          borderLeft: '1px solid var(--color-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
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
          {t('report.step_label', { current: 4, total: 5 }, LANG)}
        </div>
        <p
          style={{
            color: 'var(--color-ink-secondary)',
            fontSize: 'var(--text-body)',
            margin: 0,
          }}
        >
          {t('report.note.help_after_submit', null, LANG)}
        </p>

        <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'auto' }}>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              flex: 1,
              padding: 'var(--space-3) var(--space-5)',
              background: submitting
                ? 'var(--color-border)'
                : 'var(--color-primary)',
              color: 'var(--color-on-primary)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-body-lg)',
              fontWeight: 'var(--weight-semibold)',
              cursor: submitting ? 'wait' : 'pointer',
            }}
          >
            {submitting
              ? t('report.note.submitting', null, LANG)
              : t('report.note.submit', null, LANG)}
          </button>
          <a
            href="/report/category"
            style={{
              padding: 'var(--space-3) var(--space-4)',
              color: 'var(--color-ink-secondary)',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              fontSize: 'var(--text-body)',
            }}
          >
            {t('report.note.back', null, LANG)}
          </a>
        </div>
      </aside>
    </div>
  );
}