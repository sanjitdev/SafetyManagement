/**
 * 1.9 Report — Category Pick
 *
 * Fetches the city's categories from /api/report/bootstrap. Bangla label
 * is primary; English label is the secondary fallback.
 *
 * Server-rendered shell with a client-side picker.
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { loadDraft, saveDraft } from '@/lib/report-draft';
import { t, type Language } from '@/lib/i18n/keys';

const LANG: Language = 'bn';

interface Category {
  id: string;
  slug: string;
  name: string;
  nameBn: string | null;
  narrowCategoryPhotoCap: number | null;
}

export default function CategoryPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/report/bootstrap', { credentials: 'include' });
      if (!res.ok) {
        setAuthed(false);
        return;
      }
      const data = await res.json();
      setCategories(data.categories);
      setAuthed(true);
      const draft = loadDraft();
      if (draft?.categoryId) setSelected(draft.categoryId);
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

  function handleContinue() {
    if (!selected) return;
    const draft = loadDraft();
    if (!draft) return;
    saveDraft({ ...draft, categoryId: selected, step: 'note' });
    router.push('/report/note');
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
        }}
      >
        <h1 lang="bn" style={{ margin: '0 0 var(--space-2)', fontSize: 'var(--text-h3)' }}>
          {t('report.category.h1', null, LANG)}
        </h1>
        <p
          style={{
            color: 'var(--color-ink-secondary)',
            margin: '0 0 var(--space-5)',
            fontSize: 'var(--text-body)',
          }}
        >
          {t('report.category.help', null, LANG)}
        </p>
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'grid',
            gap: 'var(--space-2)',
          }}
        >
          {categories.map((c) => {
            const isSelected = selected === c.id;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSelected(c.id)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: 'var(--space-3) var(--space-4)',
                    background: isSelected
                      ? 'var(--color-primary-soft, #e6f2ee)'
                      : 'var(--color-surface-raised)',
                    border: isSelected
                      ? '2px solid var(--color-primary)'
                      : '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-3)',
                    fontSize: 'var(--text-body-lg)',
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      border: '2px solid var(--color-primary)',
                      background: isSelected ? 'var(--color-primary)' : 'transparent',
                      flexShrink: 0,
                    }}
                  />
                  <span lang="bn" style={{ flex: 1 }}>
                    {c.nameBn ?? c.name}
                  </span>
                  {c.narrowCategoryPhotoCap && (
                    <span
                      style={{
                        fontSize: 'var(--text-caption)',
                        color: 'var(--color-ink-secondary)',
                      }}
                    >
                      {t('report.photo.up_to', { count: c.narrowCategoryPhotoCap }, LANG)}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
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
          {t('report.step_label', { current: 3, total: 5 }, LANG)}
        </div>
        <p
          style={{
            color: 'var(--color-ink-secondary)',
            fontSize: 'var(--text-body)',
            margin: 0,
          }}
        >
          {t('report.category.routing_note', null, LANG)}
        </p>

        <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'auto' }}>
          <button
            type="button"
            onClick={handleContinue}
            disabled={!selected}
            style={{
              flex: 1,
              padding: 'var(--space-3) var(--space-5)',
              background: !selected
                ? 'var(--color-border)'
                : 'var(--color-primary)',
              color: 'var(--color-on-primary)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-body-lg)',
              fontWeight: 'var(--weight-semibold)',
              cursor: !selected ? 'not-allowed' : 'pointer',
            }}
          >
            {t('report.category.continue', null, LANG)}
          </button>
          <a
            href="/report/photo"
            style={{
              padding: 'var(--space-3) var(--space-4)',
              color: 'var(--color-ink-secondary)',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              fontSize: 'var(--text-body)',
            }}
          >
            {t('report.category.back', null, LANG)}
          </a>
        </div>
      </aside>
    </div>
  );
}
