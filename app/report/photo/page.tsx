/**
 * 1.8 Report — Photo Capture
 *
 * Per UX Review revision #6: multi-photo capture with a default cap of 3,
 * narrow-category cap of 2, mandatory minimum of 1. For the dev demo we
 * read files via the FileReader API into base64 data URLs (no S3/MinIO
 * yet — that lands with the production photo pipeline).
 *
 * Server component shell; client component for the file input.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { loadDraft, saveDraft } from '@/lib/report-draft';
import { t, type Language } from '@/lib/i18n/keys';

const LANG: Language = 'bn';

const DEFAULT_PHOTO_CAP = 3;

export default function PhotoPage() {
  const router = useRouter();
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [cap, setCap] = useState<number>(DEFAULT_PHOTO_CAP);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/report/bootstrap', { credentials: 'include' });
      if (!res.ok) {
        setAuthed(false);
        return;
      }
      setAuthed(true);
      const draft = loadDraft();
      if (draft?.photoUrls) {
        setPhotoUrls(draft.photoUrls);
      }
      // The cap is normally pulled from the category, but at this step
      // we don't yet know the category. The default of 3 holds; once
      // /report/category is reached, the cap will be applied there.
      setCap(DEFAULT_PHOTO_CAP);
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
    Promise.all(
      incoming.map(
        (file) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
          }),
      ),
    ).then((urls) => {
      const next = [...photoUrls, ...urls].slice(0, cap);
      setPhotoUrls(next);
      const draft = loadDraft();
      if (draft) {
        saveDraft({ ...draft, photoUrls: next, step: 'photo' });
      }
    });
  }

  function removePhoto(idx: number) {
    const next = photoUrls.filter((_, i) => i !== idx);
    setPhotoUrls(next);
    const draft = loadDraft();
    if (draft) {
      saveDraft({ ...draft, photoUrls: next, step: 'photo' });
    }
  }

  function handleContinue() {
    if (photoUrls.length < 1) return;
    const draft = loadDraft();
    if (!draft) return;
    saveDraft({ ...draft, photoUrls, step: 'category' });
    router.push('/report/category');
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

      <div
        style={{
          padding: 'var(--space-6) var(--space-5)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
        }}
      >
        <h1 lang="bn" style={{ margin: 0, fontSize: 'var(--text-h3)' }}>
          {t('report.photo.h1', null, LANG)}
        </h1>
        <p style={{ color: 'var(--color-ink-secondary)', margin: 0 }}>
          {t('report.photo.help', { cap }, LANG)}
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 'var(--space-3)',
          }}
        >
          {photoUrls.map((url, idx) => (
            <div
              key={idx}
              style={{
                position: 'relative',
                aspectRatio: '1 / 1',
                background: `url(${url}) center/cover no-repeat`,
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                overflow: 'hidden',
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
                  background: 'rgba(0,0,0,0.6)',
                  color: '#fff',
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                ×
              </button>
            </div>
          ))}
          {photoUrls.length < cap && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                aspectRatio: '1 / 1',
                background: 'var(--color-surface-raised)',
                border: '2px dashed var(--color-border)',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                color: 'var(--color-ink-secondary)',
                fontSize: 'var(--text-body-lg)',
              }}
            >
              +
            </button>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => addFiles(e.target.files)}
        />

        {photoUrls.length === 0 && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={{
              alignSelf: 'flex-start',
              padding: 'var(--space-3) var(--space-4)',
              background: 'var(--color-primary)',
              color: 'var(--color-on-primary)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-body)',
              fontWeight: 'var(--weight-semibold)',
              cursor: 'pointer',
            }}
          >
            {t('report.photo.take_photo', null, LANG)}
          </button>
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
          {t('report.step_label', { current: 2, total: 5 }, LANG)}
        </div>
        <p
          style={{
            color: 'var(--color-ink-secondary)',
            fontSize: 'var(--text-body)',
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          {t('report.photo.privacy', null, LANG)}
        </p>

        <div
          style={{
            display: 'flex',
            gap: 'var(--space-2)',
            marginTop: 'auto',
          }}
        >
          <button
            type="button"
            onClick={handleContinue}
            disabled={photoUrls.length < 1}
            style={{
              flex: 1,
              padding: 'var(--space-3) var(--space-5)',
              background:
                photoUrls.length < 1
                  ? 'var(--color-border)'
                  : 'var(--color-primary)',
              color: 'var(--color-on-primary)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-body-lg)',
              fontWeight: 'var(--weight-semibold)',
              cursor: photoUrls.length < 1 ? 'not-allowed' : 'pointer',
            }}
          >
            {t('report.photo.continue', null, LANG)}
          </button>
          <a
            href="/report/location"
            style={{
              padding: 'var(--space-3) var(--space-4)',
              color: 'var(--color-ink-secondary)',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              fontSize: 'var(--text-body)',
            }}
          >
            {t('report.photo.back', null, LANG)}
          </a>
        </div>
      </aside>
    </div>
  );
}
