/**
 * 1.9 Report — Category Pick (S-004.3 redesign, v2)
 *
 * Step 2 of 5: comes AFTER location, BEFORE photo. The citizen
 * decides what's wrong first, so the photo cap can narrow to the
 * category's needs (e.g. `cat_streetlight` keeps 3 photos, but
 * `cat_water_log` may need only 1) before the photo step opens.
 *
 * UI:
 *   - Big eyebrow: "ধাপ ২ / ৫" pill (handled by the layout's
 *     StepIndicator)
 *   - H1: "সমস্যাটি কী?" (what is the problem?)
 *   - One-paragraph helper under the H1
 *   - Search input (debounced 200ms) with a magnifier icon
 *   - Card grid: 2 cols on desktop, 1 col on mobile
 *   - Each card: large icon (32dp, colored) + bold Bangla name
 *     + small English secondary + chevron on the right when
 *     unselected, checkmark on the right when selected.
 *
 * Selected state uses the primary accent color for the icon
 * container, an accent left-border, a soft primary background,
 * and a checkmark badge in the top-right.
 *
 * Server-rendered shell with a client-side picker.
 */

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ReportStepAside } from '@/components/ui/ReportStepAside';
import { ReportStepPrimary } from '@/components/ui/ReportStepPrimary';
import { ReportStepBack } from '@/components/ui/ReportStepBack';
import { loadDraft, saveDraft } from '@/lib/report-draft';
import { t, type Language } from '@/lib/i18n/keys';
import { useLanguage } from '@/components/useLanguage';
import { ReportFlowSkeleton } from '@/components/ui/Skeleton';


interface Category {
  id: string;
  slug: string;
  name: string;
  nameBn: string | null;
  narrowCategoryPhotoCap: number | null;
}

// Normalize for case-insensitive comparison. Bangla has no case
// so `toLowerCase` is a no-op there; English falls through.
function normalize(s: string): string {
  return s.trim().toLowerCase();
}

// Filter the category list by a free-text query. Matches both
// Bangla (nameBn) and English (name) labels. Used by the search
// input (debounced 200ms in the component).
export function filterCategories(
  list: ReadonlyArray<Category>,
  query: string,
): Category[] {
  const q = normalize(query);
  if (!q) return list.slice();
  return list.filter(
    (c) => normalize(c.name).includes(q) || (c.nameBn ? normalize(c.nameBn).includes(q) : false),
  );
}

// Lightweight inline SVG icon set keyed by category slug. We
// don't ship an icon library: the bootstrap endpoint doesn't
// return an icon, so the client maps the slug to a glyph that
// matches the category. New categories fall through to a generic
// "tag" icon.
type IconKey = 'streetlight' | 'pothole' | 'drainage' | 'garbage' | 'water' | 'tree' | 'other';

function iconKeyFor(slug: string): IconKey {
  const s = slug.toLowerCase();
  if (s.includes('street') || s.includes('light') || s.includes('lamp')) return 'streetlight';
  if (s.includes('pothole') || s.includes('road') || s.includes('damage')) return 'pothole';
  if (s.includes('drain') || s.includes('sewer')) return 'drainage';
  if (s.includes('garbage') || s.includes('waste') || s.includes('trash')) return 'garbage';
  if (s.includes('water') || s.includes('log') || s.includes('flood')) return 'water';
  if (s.includes('tree') || s.includes('plant') || s.includes('garden')) return 'tree';
  return 'other';
}

function CategoryIcon({ k }: { k: IconKey }) {
  const common = {
    width: 28,
    height: 28,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (k) {
    case 'streetlight':
      return (
        <svg {...common}>
          <path d="M12 2v3" />
          <path d="M9 5h6l-1 4h-4z" />
          <line x1="12" y1="9" x2="12" y2="22" />
          <line x1="9" y1="22" x2="15" y2="22" />
        </svg>
      );
    case 'pothole':
      return (
        <svg {...common}>
          <path d="M3 18h18" />
          <path d="M5 18c0-3 2-5 4-5s2 2 4 2 2-2 4-2 2 2 2 5" />
        </svg>
      );
    case 'drainage':
      return (
        <svg {...common}>
          <path d="M3 6h18" />
          <path d="M5 6c1 4 3 6 7 6s6-2 7-6" />
          <path d="M8 18l4-3 4 3" />
        </svg>
      );
    case 'garbage':
      return (
        <svg {...common}>
          <path d="M4 7h16" />
          <path d="M9 7V4h6v3" />
          <path d="M6 7l1 13h10l1-13" />
          <line x1="10" y1="11" x2="10" y2="17" />
          <line x1="14" y1="11" x2="14" y2="17" />
        </svg>
      );
    case 'water':
      return (
        <svg {...common}>
          <path d="M12 3c-4 5-7 8-7 12a7 7 0 0 0 14 0c0-4-3-7-7-12z" />
        </svg>
      );
    case 'tree':
      return (
        <svg {...common}>
          <path d="M12 3l5 7h-3l4 6h-4v5h-4v-5H6l4-6H7z" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M3 12l9-9 9 9-9 9z" />
          <circle cx="9" cy="9" r="1" fill="currentColor" />
        </svg>
      );
  }
}

export default function CategoryPage() {
  // The shared hook owns the language. This page used to
  // hard-code Bangla at module scope, so it ignored the user's
  // language choice entirely.
  const { lang } = useLanguage();
  const LANG = lang;
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [rawQuery, setRawQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebounced(rawQuery), 200);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [rawQuery]);

  useEffect(() => {
    (async () => {
      try {
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
      } catch {
        setAuthed(false);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const visibleCategories = useMemo(
    () => filterCategories(categories, debounced),
    [categories, debounced],
  );

  if (authed === false) {
    return (
      <div style={{ padding: 'var(--space-7) var(--space-5)' }}>
        <p>{t('auth.signin_required_short', null, LANG)}</p>
        <a href="/">{t('auth.back_home', null, LANG)}</a>
      </div>
    );
  }

  if (loading) return <ReportFlowSkeleton lang={LANG} />;

  function handleContinue() {
    if (!selected) return;
    const draft = loadDraft();
    if (!draft) return;
    saveDraft({ ...draft, categoryId: selected, step: 'photo' });
    router.push('/report/photo');
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
      {/*
        The CSS is injected raw. React escapes quote characters in a
        `<style>` child's text content, so the server emitted
        `&quot;` / `&#x27;` where the client rendered `"` / `'`
        — a hydration mismatch that forced a full client re-render.
        `dangerouslySetInnerHTML` keeps the CSS byte-identical on
        both sides. The content is a static literal, not user input.
      */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @media (max-width: 1024px) {
          .report-two-region { grid-template-columns: 1fr !important; }
        }
        .report-category-card:hover:not([aria-checked="true"]) {
          border-color: var(--color-primary) !important;
          transform: translateY(-1px);
          box-shadow: var(--shadow-md) !important;
        }
        .report-category-card:focus-visible {
          outline: 2px solid var(--color-primary);
          outline-offset: 2px;
        }
        .report-category-card {
          transition: background var(--duration-fast) var(--ease-out),
                      border-color var(--duration-fast) var(--ease-out),
                      box-shadow var(--duration-fast) var(--ease-out),
                      transform var(--duration-fast) var(--ease-out);
        }
      `,
        }}
      />

      <div
        style={{
          padding: 'var(--space-7) var(--space-6)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-5)',
          minHeight: 0,
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <h1
            lang={LANG}
            style={{
              margin: 0,
              fontSize: 'var(--text-display-lg)',
              fontWeight: 'var(--weight-bold)',
              lineHeight: 'var(--leading-tight)',
              letterSpacing: 'var(--tracking-tight)',
              color: 'var(--color-ink)',
            }}
          >
            {t('report.category.h1', null, LANG)}
          </h1>
          <p
            lang={LANG}
            style={{
              color: 'var(--color-ink-secondary)',
              margin: 0,
              fontSize: 'var(--text-body-lg)',
              lineHeight: 'var(--leading-normal)',
            }}
          >
            {t('report.category.help', null, LANG)}
          </p>
        </div>

        {/* Search filter */}
        <label
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            width: '100%',
          }}
        >
          <span
            aria-hidden
            style={{
              position: 'absolute',
              left: 'var(--space-4)',
              color: 'var(--color-ink-tertiary)',
              display: 'inline-flex',
              alignItems: 'center',
              pointerEvents: 'none',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <input
            type="search"
            value={rawQuery}
            onChange={(e) => setRawQuery(e.target.value)}
            placeholder={t('report.category.search_placeholder', null, LANG)}
            aria-label={t('report.category.search_placeholder', null, LANG)}
            lang={LANG}
            style={{
              width: '100%',
              padding: 'var(--space-4) var(--space-5) var(--space-4) calc(var(--space-4) + 20px + var(--space-3))',
              background: 'var(--color-surface-card)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              fontSize: 'var(--text-body-lg)',
              color: 'var(--color-ink)',
              fontFamily: 'var(--font-body)',
              minHeight: '56px',
              boxShadow: 'var(--shadow-xs)',
              outline: 'none',
              transition: 'border-color var(--duration-fast) var(--ease-out), box-shadow var(--duration-fast) var(--ease-out)',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-primary)';
              e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-primary-soft)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border)';
              e.currentTarget.style.boxShadow = 'var(--shadow-xs)';
            }}
          />
        </label>

        {/* Category card grid */}
        {visibleCategories.length === 0 ? (
          <p
            lang={LANG}
            style={{
              margin: 0,
              padding: 'var(--space-6) var(--space-5)',
              background: 'var(--color-surface-raised)',
              border: '1px dashed var(--color-border-strong)',
              borderRadius: 'var(--radius-lg)',
              fontSize: 'var(--text-body)',
              color: 'var(--color-ink-secondary)',
              textAlign: 'center',
            }}
            role="status"
          >
            {t('report.category.no_match', null, LANG)}
          </p>
        ) : (
          <ul
            role="radiogroup"
            aria-label={t('report.category.h1', null, LANG)}
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)',
            }}
          >
            {visibleCategories.map((c) => {
              const isSelected = selected === c.id;
              const iconKey = iconKeyFor(c.slug);
              return (
                <li key={c.id} style={{ display: 'block' }}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setSelected(c.id)}
                    className="report-category-card"
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: 'var(--space-4) var(--space-5)',
                      minHeight: '84px',
                      background: isSelected
                        ? 'var(--color-primary-soft)'
                        : 'var(--color-surface-card)',
                      border: isSelected
                        ? '2px solid var(--color-primary)'
                        : '1px solid var(--color-border)',
                      borderLeft: isSelected
                        ? '4px solid var(--color-primary)'
                        : '4px solid transparent',
                      borderRadius: 'var(--radius-lg)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-4)',
                      boxShadow: isSelected ? 'var(--shadow-md)' : 'var(--shadow-xs)',
                      position: 'relative',
                      color: 'var(--color-ink)',
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        flexShrink: 0,
                        width: 52,
                        height: 52,
                        borderRadius: 'var(--radius-md)',
                        background: isSelected
                          ? 'var(--color-primary)'
                          : 'var(--color-primary-soft)',
                        color: isSelected ? 'var(--color-on-primary)' : 'var(--color-primary)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'background var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out)',
                      }}
                    >
                      <CategoryIcon k={iconKey} />
                    </span>
                    <span
                      style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px',
                        minWidth: 0,
                      }}
                    >
                      <span
                        lang={LANG}
                        style={{
                          fontSize: 'var(--text-body-lg)',
                          fontWeight: 'var(--weight-semibold)',
                          color: 'var(--color-ink)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          lineHeight: 1.3,
                        }}
                      >
                        {c.nameBn ?? c.name}
                      </span>
                      {c.nameBn && c.name && c.name !== c.nameBn && (
                        <span
                          style={{
                            fontSize: 'var(--text-caption)',
                            color: 'var(--color-ink-tertiary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {c.name}
                        </span>
                      )}
                    </span>
                    {isSelected ? (
                      <span
                        aria-hidden
                        style={{
                          flexShrink: 0,
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: 'var(--color-primary)',
                          color: 'var(--color-on-primary)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </span>
                    ) : (
                      <span
                        aria-hidden
                        style={{
                          flexShrink: 0,
                          color: 'var(--color-ink-tertiary)',
                          display: 'inline-flex',
                          alignItems: 'center',
                        }}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ReportStepAside
        currentStep={2}
        totalSteps={5}
        lang={LANG}
        help={t('report.category.routing_note', null, LANG)}
        primary={
          <ReportStepPrimary
            onClick={handleContinue}
            disabled={!selected}
            aria-disabled={!selected}
            data-testid="report-category-continue"
          >
            {t('report.category.continue', null, LANG)}
          </ReportStepPrimary>
        }
        back={
          <ReportStepBack href="/report/location">
            {t('report.category.back', null, LANG)}
          </ReportStepBack>
        }
      />
    </div>
  );
}
