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
import { photoErrorKeyForCode } from '@/lib/photo/error-code';
import { t, type Language } from '@/lib/i18n/keys';
import { ICONS } from '@/lib/ui/icon-map';
import { useLanguage } from '@/components/useLanguage';
import { ReportFlowSkeleton } from '@/components/ui/Skeleton';

const NOTE_MAX = 280;

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
  // The shared hook owns the language. This page used to
  // hard-code Bangla at module scope, so it ignored the user's
  // language choice entirely.
  const { lang } = useLanguage();
  const LANG = lang;
  const router = useRouter();
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/report/bootstrap', { credentials: 'include' });
        if (!res.ok) {
          setAuthed(false);
          return;
        }
        setAuthed(true);
        const draft = loadDraft();
        if (draft?.note) setNote(draft.note);
      } catch {
        setAuthed(false);
      } finally {
        setLoading(false);
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

  if (loading) return <ReportFlowSkeleton lang={LANG} testId="report-note-loading" />;

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
            // WO-000 platform layer — the raw bytes for the photos.
            // Present only when a blob provider is configured; the
            // API route stores them and records the metadata.
            // `photoUrls` is still sent so the render path (and the
            // visual baselines) are unchanged.
            photoBlobs: draft.photoBlobs ?? [],
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
          // The RAW machine code must NEVER reach the citizen. Known
          // codes map to their own copy; everything else falls back
          // to the generic localised message.
          const specificKey = photoErrorKeyForCode(body?.error);
          setError(
            specificKey
              ? t(specificKey, null, LANG)
              : `${t('report.note.submit_failed', null, LANG)} (${res.status})`,
          );
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
        // element in the column is never hidden behind it.
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
          gap: 'var(--space-3)',
          // The page fills the region exactly, so this column scrolls
          // ITSELF if the note helper grows. Without this the column
          // pushes the page past the region and the whole page
          // scrolls.
          minHeight: 0,
          overflowY: 'auto',
          overscrollBehavior: 'contain',
        }}
      >
        {/* The step heading. The `<label>` stays wrapped inside the
            `<h1>` so the textarea keeps its accessible name while
            the step still exposes a real heading. */}
        <h1
          lang={LANG}
          style={{
            fontSize: 'var(--text-display-md)',
            margin: 0,
            color: 'var(--color-ink)',
            fontWeight: 'var(--weight-semibold)',
            lineHeight: 'var(--leading-tight)',
            letterSpacing: 'var(--tracking-tight)',
          }}
        >
          <label htmlFor="report-note-textarea">
            {t('report.note.label', null, LANG)}
          </label>
        </h1>
        <p
          lang={LANG}
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
            // The textarea scale runs 96px → 192px: the floor is
            // `--space-9` and the ceiling is twice that, which has
            // no token of its own (the `--space-*` ramp stops at 9).
            minHeight: 'var(--space-9)',
            maxHeight: 'calc(var(--space-9) * 2)',
            padding: 'var(--space-3)',
            borderRadius: 'var(--radius-md)',
            border: `1px solid ${isOver ? 'var(--color-danger)' : 'var(--color-border)'}`,
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
            color: isOver ? 'var(--color-danger)' : 'var(--color-ink-secondary)',
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
              background: 'var(--color-danger-soft)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-danger)',
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
        sticky
        help={t('report.note.help_after_submit', null, LANG)}
        primary={
          <ReportStepPrimary
            onClick={handleSubmit}
            disabled={submitting || isOver}
            aria-busy={submitting}
            leading={
              submitting ? (
                <span aria-hidden style={{ display: 'inline-flex' }}>
                  <ICONS.loading.icon
                    size={16}
                    weight={ICONS.loading.weight}
                    style={{ animation: 'report-spin 0.9s linear infinite' }}
                  />
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
          <ReportStepBack href="/report/category">
            {t('report.step.back', null, LANG)}
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
