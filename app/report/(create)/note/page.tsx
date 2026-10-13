/**
 * 1.10 Report — Note & Submit (S-004.4 redesign)
 *
 * Optional free-text note (max 280 chars per the v1 spec). The
 * redesign adds a visible <label> above the textarea, a helper
 * line ("Optional — up to 280 characters"), and a live character
 * counter with `aria-live="polite"` so screen readers announce
 * the count as the citizen types.
 *
 * On Submit, the client POSTs to /api/tickets. If the API
 * returns `dedup_match: true`, the client navigates to
 * /report/summary with the dedup context in sessionStorage so
 * the summary can render the "Looks similar" prompt. Otherwise
 * the client navigates straight to /report/:id/submitted.
 *
 * The textarea auto-grows up to 5 lines before it scrolls
 * internally — implemented by setting a min/max height and
 * letting the browser's native resize semantics do the work.
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ReportStepAside } from '@/components/ui/ReportStepAside';
import { ReportStepPrimary } from '@/components/ui/ReportStepPrimary';
import { ReportStepBack } from '@/components/ui/ReportStepBack';
import { clearDraft, loadDraft, saveDraft } from '@/lib/report-draft';
import { t, type Language } from '@/lib/i18n/keys';

const NOTE_MAX = 280;
const LANG: Language = 'bn';

interface NoteValidation {
  ok: boolean;
  tooLong: boolean;
  remaining: number;
}

export function validateNote(text: string, max: number = NOTE_MAX): NoteValidation {
  const trimmed = text ?? '';
  return {
    ok: trimmed.length <= max,
    tooLong: trimmed.length > max,
    remaining: Math.max(0, max - trimmed.length),
  };
}

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

  const validation = validateNote(note);
  const isOver = validation.tooLong;

  function handleSubmit() {
    setError(null);
    if (isOver) {
      setError(t('report.note.too_long', { max: NOTE_MAX }, LANG));
      return;
    }
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
        gridTemplateColumns: 'minmax(0, 1fr) var(--report-side-panel)',
        minHeight: 'calc(100vh - var(--header-height-desktop))',
      }}
      className="report-two-region"
    >
      <div
        style={{
          padding: 'var(--space-6) var(--space-5)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
        }}
      >
        <label
          htmlFor="report-note-textarea"
          lang="bn"
          style={{
            fontSize: 'var(--text-display-md)',
            margin: 0,
            color: 'var(--color-ink)',
            fontWeight: 'var(--weight-semibold)',
            lineHeight: 'var(--leading-tight)',
            letterSpacing: 'var(--tracking-tight)',
          }}
        >
          {t('report.note.label', null, LANG)}
        </label>
        <p
          lang="bn"
          id="report-note-helper"
          style={{
            color: 'var(--color-ink-secondary)',
            margin: 0,
            fontSize: 'var(--text-body)',
          }}
        >
          {t('report.note.helper', { max: NOTE_MAX }, LANG)}
        </p>
        <textarea
          id="report-note-textarea"
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX + 1))}
          aria-describedby="report-note-helper report-note-counter"
          aria-invalid={isOver}
          placeholder={t('report.note.placeholder', null, LANG)}
          rows={4}
          maxLength={NOTE_MAX + 1}
          style={{
            width: '100%',
            minHeight: 120,
            maxHeight: 200,
            padding: 'var(--space-3)',
            borderRadius: 'var(--radius-md)',
            border: `1px solid ${isOver ? 'var(--color-destructive)' : 'var(--color-border)'}`,
            background: 'var(--color-surface-card)',
            color: 'var(--color-ink)',
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-body)',
            lineHeight: 'var(--leading-normal)',
            resize: 'vertical',
            outline: 'none',
            boxShadow: 'var(--shadow-xs)',
          }}
        />
        <div
          id="report-note-counter"
          aria-live="polite"
          style={{
            fontSize: 'var(--text-caption)',
            color: isOver ? 'var(--color-destructive)' : 'var(--color-ink-secondary)',
            textAlign: 'right',
            fontVariantNumeric: 'tabular-nums',
            fontWeight: isOver ? 'var(--weight-semibold)' : 'var(--weight-regular)',
          }}
        >
          {t('report.note.counter', { count: note.length, max: NOTE_MAX }, LANG)}
        </div>

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
              boxShadow: 'var(--shadow-xs)',
            }}
          >
            {error}
          </div>
        )}
      </div>

      <ReportStepAside
        currentStep={4}
        totalSteps={5}
        lang={LANG}
        help={t('report.note.help_after_submit', null, LANG)}
        primary={
          <ReportStepPrimary
            onClick={handleSubmit}
            disabled={submitting || isOver}
            aria-busy={submitting}
            leading={
              submitting ? (
                <span aria-hidden style={{ display: 'inline-flex' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden style={{ animation: 'report-spin 0.9s linear infinite' }}>
                    <path d="M21 12a9 9 0 1 1-6.2-8.55" />
                  </svg>
                </span>
              ) : null
            }
            data-testid="report-note-submit"
          >
            {submitting
              ? t('report.note.submitting', null, LANG)
              : t('report.note.submit', null, LANG)}
          </ReportStepPrimary>
        }
        back={
          <ReportStepBack href="/report/photo">
            {t('report.note.back', null, LANG)}
          </ReportStepBack>
        }
      />
      <style>{`
        @media (max-width: 1024px) {
          .report-two-region { grid-template-columns: 1fr !important; }
        }
        @keyframes report-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) {
          @keyframes report-spin { from { transform: rotate(0deg); } to { transform: rotate(0deg); } }
        }
      `}</style>
    </div>
  );
}
