/**
 * 1.9 Report — Category Pick (S-004.3 redesign, v2)
 *
 * Step 3 of 5 in the LOCKED flow order
 * (1 Location → 2 Photo → 3 Category → 4 Note → 5 Summary).
 * The route path is `/report/category` but the rail order is
 * declared in `app/report/(create)/layout.tsx`.
 *
 * The citizen decides what's wrong, so the photo cap can narrow to
 * the category's needs (e.g. `cat_streetlight` keeps 3 photos, but
 * a narrow category may need only 1).
 *
 * UI:
 *   - Step rail (handled by the layout's StepIndicator)
 *   - H1: "সমস্যাটি কী?" (what is the problem?)
 *   - One-paragraph helper under the H1
 *   - Search input (debounced 200ms) with a magnifier icon
 *   - Card list: each card is a `Button` with `role="radio"`
 *   - Each card: large icon + bold Bangla name + small English
 *     secondary + chevron on the right when unselected, checkmark
 *     on the right when selected.
 *
 * INTENT 009 / BOLT 009-004 (Story 010): the local inline-SVG
 * category icon set and the hand-rolled `<button role="radio">`
 * are gone. The glyph now comes from the shared registry via the
 * `CategoryIcon` primitive (`lib/ui/icon-map.ts`), so the category
 * icons on the citizen flow are the SAME glyphs the dispatcher
 * queue, the crew list and the admin console show. The control is
 * the `Button` primitive, so the focus ring, radius, disabled
 * state and typography match the rest of the product.
 *
 * Server-rendered shell with a client-side picker.
 */

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ReportStepAside } from '@/components/ui/ReportStepAside';
import { ReportStepPrimary } from '@/components/ui/ReportStepPrimary';
import { ReportStepBack } from '@/components/ui/ReportStepBack';
import { Button, CategoryIcon } from '@/components/ui';
import { ICONS } from '@/lib/ui/icon-map';
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
    saveDraft({ ...draft, categoryId: selected, step: 'note' });
    router.push('/report/note');
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
        /*
         * On a SHORT viewport the five category cards need to give
         * back the vertical padding, or the list overflows the
         * region and the column scrolls.
         *
         * The card's own tap target stays well over the 44px
         * minimum — the padding shrinks, the row does not.
         */
        @media (max-height: 860px) {
          .report-category-card { padding-top: var(--space-2) !important; padding-bottom: var(--space-2) !important; }
          .report-category-card > span:first-child { width: 36px !important; height: 36px !important; }
          .report-category-column { padding-top: var(--space-3) !important; padding-bottom: var(--space-3) !important; }
          .report-category-list { gap: 6px !important; }
        }
      `,
        }}
      />

      <div
        style={{
          /*
           * `var(--space-4) var(--space-6)` — 16px vertical, 32px
           * horizontal. The step's 48px top/bottom padding plus the
           * 24px gaps consumed 168px of the region, which pushed the
           * 5-category list past the bottom and made the column
           * scroll. Tighter padding fits the whole list.
           */
          padding: 'var(--space-4) var(--space-6)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
          minHeight: 0,
          overflowY: 'auto',
          overscrollBehavior: 'contain',
        }}
        className="report-category-column"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <h1
            lang={LANG}
            style={{
              margin: 0,
              // One consistent step-heading scale across the whole
              // flow: mockup 14's `.card-title` is
              // `--text-display-md` (24px), and the location / photo
              // / note steps already use it.
              fontSize: 'var(--text-display-md)',
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
              // `--text-body` rather than `--text-body-lg`: the
              // helper is a one-line cue, not the step's headline,
              // and the tighter size keeps the whole category list
              // inside the region without a scrollbar.
              fontSize: 'var(--text-body)',
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
            <ICONS.search.icon size={20} weight={ICONS.search.weight} aria-hidden />
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
              padding: 'var(--space-3) var(--space-5) var(--space-3) calc(var(--space-4) + 20px + var(--space-3))',
              background: 'var(--color-surface-card)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              fontSize: 'var(--text-body-lg)',
              color: 'var(--color-ink)',
              fontFamily: 'var(--font-body)',
              // 48px — comfortably over the 44px touch minimum, and
              // 8px shorter than `--touch-large`, which the tighter
              // column rhythm does not have room for.
              minHeight: 48,
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
            className="report-category-list"
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
              // `--space-2` (8px) rather than `--space-3` (12px):
              // 5 cards × 4 gaps saved 16px, which is what let the
              // whole list fit the region without a scrollbar.
              gap: 'var(--space-2)',
            }}
          >
            {visibleCategories.map((c) => {
              const isSelected = selected === c.id;
              return (
                <li key={c.id} style={{ display: 'block' }}>
                  <Button
                    variant="secondary"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setSelected(c.id)}
                    className="report-category-card"
                    data-testid={`report-category-${c.slug}`}
                    /*
                     * The card is a LAYOUT — icon tile, label block and
                     * a trailing chevron — so the children must be
                     * direct flex items of the button. The `Button`
                     * primitive's label wrapper would nest them one
                     * level down, where they are no longer flex
                     * children and the row collapses into a narrow
                     * centred stack.
                     */
                    rawChildren
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      /*
                       * `var(--space-3) var(--space-5)` — 12px vertical,
                       * 20px horizontal. The card is a 44px icon tile
                       * plus two lines of text, so 12px of padding
                       * keeps it comfortable while letting all five
                       * categories fit the region without the column
                       * scrolling.
                       */
                      padding: 'var(--space-3) var(--space-5)',
                      minHeight: 'var(--touch-cta)',
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
                      // The card's content starts at the left edge;
                      // the primitive centres a label, which is
                      // right for a CTA and wrong for a card row.
                      justifyContent: 'flex-start',
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
                        /*
                         * The tile is DECORATIVE — the whole card is
                         * the tap target (`minHeight: var(--touch-cta)`
                         * = 64px, well over the 44px minimum). It does
                         * not need the 56px `--touch-large` box, which
                         * made each card 90px tall and pushed the
                         * 5-category list past the region so the
                         * column scrolled.
                         */
                        width: 40,
                        height: 40,
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
                      <CategoryIcon
                        slug={c.slug}
                        size={24}
                        /*
                         * On the selected card the tile is SOLID
                         * primary, so the category's own colour
                         * (a slate pothole, a green bin) would be
                         * illegible against it. The glyph takes the
                         * tile's foreground instead.
                         */
                        color={isSelected ? 'var(--color-on-primary)' : undefined}
                      />
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
                          // Pushed to the right edge of the card.
                          marginLeft: 'auto',
                          width: 'var(--space-8)',
                          height: 'var(--space-8)',
                          borderRadius: '50%',
                          background: 'var(--color-primary)',
                          color: 'var(--color-on-primary)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <ICONS.check.icon size={16} weight="bold" />
                      </span>
                    ) : (
                      <span
                        aria-hidden
                        style={{
                          flexShrink: 0,
                          marginLeft: 'auto',
                          color: 'var(--color-ink-tertiary)',
                          display: 'inline-flex',
                          alignItems: 'center',
                        }}
                      >
                        <ICONS.chevronRight.icon size={18} weight={ICONS.chevronRight.weight} />
                      </span>
                    )}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ReportStepAside
        currentStep={3}
        totalSteps={5}
        lang={LANG}
        sticky
        help={t('report.category.routing_note', null, LANG)}
        primary={
          <ReportStepPrimary
            onClick={handleContinue}
            disabled={!selected}
            aria-disabled={!selected}
            trailing={
              <span aria-hidden style={{ display: 'inline-flex' }}>
                <ICONS.forward.icon size={16} weight={ICONS.forward.weight} />
              </span>
            }
            data-testid="report-category-continue"
          >
            {t('report.step.continue_next', { next: t('report.step.4', null, LANG) }, LANG)}
          </ReportStepPrimary>
        }
        back={
          <ReportStepBack href="/report/photo">
            {t('report.step.back', null, LANG)}
          </ReportStepBack>
        }
      />
    </div>
  );
}
