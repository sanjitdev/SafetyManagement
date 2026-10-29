/**
 * 1.8 Report — Photo Capture (S-004.2 redesign)
 *
 * Per UX Review revision #6: multi-photo capture with a default cap
 * of 3, narrow-category cap of 2, mandatory minimum of 1. For the
 * dev demo we read files via the FileReader API into base64 data
 * URLs (no S3/MinIO yet — that lands with the production photo
 * pipeline).
 *
 * The redesign introduces a primary "Add photo" action area
 * (camera icon + label, 96dp tall on mobile, full-width) and a
 * horizontal thumbnail strip with remove "X" overlays. A live
 * counter shows "{count} of {cap} added" so the citizen always
 * knows how many photos remain.
 *
 * When the cap is reached, the primary action area is disabled
 * with a `title` tooltip explaining the cap. The hidden file input
 * has a `capture="environment"` attribute so mobile devices with
 * getUserMedia support open the rear camera; desktop falls back to
 * a standard file picker.
 *
 * The "Continue" button is disabled until ≥ 1 photo is added. It
 * uses `aria-disabled` and 50% opacity for the disabled state.
 *
 * Server component shell; client component for the file input.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ReportStepAside } from '@/components/ui/ReportStepAside';
import { ReportStepPrimary } from '@/components/ui/ReportStepPrimary';
import { ReportStepBack } from '@/components/ui/ReportStepBack';
import { loadDraft, saveDraft, type ReportDraftPhotoBlob } from '@/lib/report-draft';
import { derivePhotoCap, type CategorySummaryLike } from '@/lib/report-photo-cap';
// Client-safe import — `lib/storage/blob` is server-only (it pulls in
// `next/headers` via `lib/auth/guards`), so a `'use client'` page
// must not import it directly.
import { isBlobProviderActive } from '@/lib/storage/blob-provider';
import { thumbnailBackground } from '@/lib/format/photo-url';
import { t, type Language } from '@/lib/i18n/keys';

const LANG: Language = 'bn';

export default function PhotoPage() {
  const router = useRouter();
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  /**
   * WO-000 platform layer — the raw bytes for each photo, kept
   * in lock-step with `photoUrls`. Populated only when a blob
   * provider is configured; the summary page POSTs them and the
   * API route writes them to the blob store. When the provider is
   * NOT configured this stays empty and the v1 inline data-URL
   * behaviour is unchanged (so the visual baselines stay
   * byte-identical).
   */
  const [photoBlobs, setPhotoBlobs] = useState<ReportDraftPhotoBlob[]>([]);
  const [cap, setCap] = useState<number>(3);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/report/bootstrap', { credentials: 'include' });
      if (!res.ok) {
        setAuthed(false);
        return;
      }
      const data = (await res.json()) as { categories: CategorySummaryLike[] };
      setAuthed(true);
      const draft = loadDraft();
      if (draft?.photoUrls) {
        setPhotoUrls(draft.photoUrls);
      }
      // The cap is re-derived from the draft's categoryId on every
      // mount: if the citizen bounced back from a later step (e.g.
      // the category step), the cap narrows to the narrow-category
      // photo cap (e.g. 2 for `cat_streetlight`). The default of 3
      // holds when the draft has no categoryId yet.
      setCap(derivePhotoCap(draft, data.categories));
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

  function addFiles(files: FileList | null) {
    if (!files) return;
    const remaining = cap - photoUrls.length;
    const incoming = Array.from(files).slice(0, remaining);
    // The blob path needs the raw bytes; the render path needs the
    // data URL. Both are produced from the same File.
    const wantsBytes = isBlobProviderActive();
    Promise.all(
      incoming.map(
        (file) =>
          new Promise<{ url: string; blob: ReportDraftPhotoBlob | null }>(
            (resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                const dataUrl = reader.result as string;
                if (!wantsBytes) {
                  resolve({ url: dataUrl, blob: null });
                  return;
                }
                // Strip the `data:<mime>;base64,` prefix — the API
                // route re-assembles the bytes from the bare
                // base64 payload.
                const comma = dataUrl.indexOf(',');
                const dataBase64 =
                  comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
                resolve({
                  url: dataUrl,
                  blob: {
                    dataBase64,
                    mimeType: file.type || 'image/jpeg',
                    fileName: file.name,
                  },
                });
              };
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(file);
            },
          ),
      ),
    )
      .then((results) => {
        const next = [...photoUrls, ...results.map((r) => r.url)].slice(0, cap);
        const nextBlobs = [
          ...photoBlobs,
          ...results.map((r) => r.blob).filter((b): b is ReportDraftPhotoBlob => b !== null),
        ].slice(0, cap);
        setPhotoUrls(next);
        setPhotoBlobs(nextBlobs);
        const draft = loadDraft();
        if (draft) {
          saveDraft({
            ...draft,
            photoUrls: next,
            photoBlobs: nextBlobs,
            step: 'photo',
          });
        }
      })
      .catch(() => undefined);
  }

  function removePhoto(idx: number) {
    const next = photoUrls.filter((_, i) => i !== idx);
    const nextBlobs = photoBlobs.filter((_, i) => i !== idx);
    setPhotoUrls(next);
    setPhotoBlobs(nextBlobs);
    const draft = loadDraft();
    if (draft) {
      saveDraft({
        ...draft,
        photoUrls: next,
        photoBlobs: nextBlobs,
        step: 'photo',
      });
    }
  }

  function handleContinue() {
    if (photoUrls.length < 1) return;
    const draft = loadDraft();
    if (!draft) return;
    saveDraft({ ...draft, photoUrls, photoBlobs, step: 'note' });
    router.push('/report/note');
  }

  const canAddMore = photoUrls.length < cap;
  const capReached = photoUrls.length >= cap;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) var(--report-side-panel)',
        minHeight: 'calc(100vh - var(--header-height-desktop))',
      }}
      className="report-two-region"
    >
      <style>{`
        @media (max-width: 1024px) {
          .report-two-region { grid-template-columns: 1fr !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .report-photo-tile { transition: none !important; }
        }
      `}</style>

      <div
        style={{
          padding: 'var(--space-6) var(--space-5)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
        }}
      >
        <div>
          <h1
            lang="bn"
            style={{
              margin: '0 0 var(--space-2)',
              fontSize: 'var(--text-display-md)',
              lineHeight: 'var(--leading-tight)',
              letterSpacing: 'var(--tracking-tight)',
              color: 'var(--color-ink)',
            }}
          >
            {t('report.photo.h1', null, LANG)}
          </h1>
          <p
            lang="bn"
            style={{
              color: 'var(--color-ink-secondary)',
              margin: 0,
              fontSize: 'var(--text-body)',
            }}
          >
            {t('report.photo.empty_hint', null, LANG)}
          </p>
        </div>

        {/* Counter */}
        <div
          aria-live="polite"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            alignSelf: 'flex-start',
            padding: 'var(--space-1) var(--space-3)',
            background: 'var(--color-surface-raised)',
            borderRadius: 'var(--radius-pill)',
            fontSize: 'var(--text-caption)',
            fontWeight: 'var(--weight-semibold)',
            color: 'var(--color-ink-secondary)',
          }}
        >
          <span
            aria-hidden
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: capReached
                ? 'var(--color-status-resolved, var(--color-success))'
                : 'var(--color-accent)',
            }}
          />
          {t('report.photo.counter', { count: photoUrls.length, cap }, LANG)}
        </div>

        {/* Primary action area — full-width on mobile, 96dp tall */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={!canAddMore}
          aria-disabled={!canAddMore}
          title={capReached ? t('report.photo.cap_tooltip', { cap }, LANG) : undefined}
          className="report-photo-primary"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'var(--space-3)',
            minHeight: 'var(--touch-cta)',
            width: '100%',
            padding: 'var(--space-4) var(--space-5)',
            background: canAddMore ? 'var(--color-primary)' : 'var(--color-surface-sunken)',
            color: canAddMore ? 'var(--color-on-primary)' : 'var(--color-ink-tertiary)',
            border: canAddMore ? 'none' : '1px dashed var(--color-border-strong)',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--text-body-lg)',
            fontWeight: 'var(--weight-semibold)',
            cursor: canAddMore ? 'pointer' : 'not-allowed',
            opacity: canAddMore ? 1 : 0.6,
            transition: 'opacity var(--duration-fast) var(--ease-out)',
          }}
        >
          <span aria-hidden style={{ display: 'inline-flex' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </span>
          {t('report.photo.add_primary', null, LANG)}
        </button>

        {/* Thumbnail strip — horizontal scroll on small viewports */}
        {photoUrls.length > 0 && (
          <div
            role="list"
            aria-label={t('report.photo.h1', null, LANG)}
            style={{
              display: 'flex',
              gap: 'var(--space-3)',
              overflowX: 'auto',
              paddingBottom: 'var(--space-2)',
            }}
          >
            {photoUrls.map((url, idx) => (
              <div
                key={idx}
                role="listitem"
                className="report-photo-tile"
                style={{
                  position: 'relative',
                  flex: '0 0 auto',
                  width: 120,
                  height: 120,
                  background:
                    thumbnailBackground(url) ??
                    'var(--color-surface-raised)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  overflow: 'hidden',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <button
                  type="button"
                  onClick={() => removePhoto(idx)}
                  aria-label={t('report.photo.remove_aria', null, LANG)}
                  style={{
                    position: 'absolute',
                    top: 6,
                    right: 6,
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    border: 'none',
                    background: 'rgba(0,0,0,0.65)',
                    color: '#fff',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      <ReportStepAside
        currentStep={3}
        totalSteps={5}
        lang={LANG}
        help={t('report.photo.privacy', null, LANG)}
        primary={
          <ReportStepPrimary
            onClick={handleContinue}
            disabled={photoUrls.length < 1}
            aria-disabled={photoUrls.length < 1}
            data-testid="report-photo-continue"
          >
            {t('report.photo.continue', null, LANG)}
          </ReportStepPrimary>
        }
        back={
          <ReportStepBack href="/report/category">
            {t('report.photo.back', null, LANG)}
          </ReportStepBack>
        }
      />
    </div>
  );
}
