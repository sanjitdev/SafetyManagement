/**
 * Photo placeholder (components/ui/PhotoPlaceholder.tsx).
 *
 * ── Why this component exists ──────────────────────────────────
 *
 * Every list surface that shows a report row needs a slot for the
 * citizen's photo. When a report has NO photo (or a stored URL we
 * cannot render), that slot used to be filled with a bare
 * `linear-gradient(135deg, primary-soft, surface-raised)` square —
 * a blank, unlabelled teal-grey blob that read as a broken image
 * rather than as an intentional "no photo" state.
 *
 * `components/PublicLandingExperience.tsx` already solved this
 * properly (Bolt 008-011): a dashed border, a camera glyph, and a
 * short label. But that markup lived inline in one component, so the
 * feed, the home activity list and the report cards kept using the
 * old gradient — three copies of the same bad placeholder.
 *
 * This module extracts that markup into one place so every surface
 * gets the same intentional-looking empty state.
 *
 * The label is localised through the typed i18n registry
 * (`lib/i18n/keys.ts`) — the team rule is that no user-facing copy
 * is hard-coded in a component.
 */

import { t, type Language } from '@/lib/i18n/keys';

export interface PhotoPlaceholderProps {
  /**
   * Square edge length in px. The feed row uses 56, the public
   * landing cards use 80.
   */
  size?: number;
  /** BCP-47 language for the label. */
  lang?: Language;
  /**
   * Whether to render the short text label beneath the glyph.
   *
   * Off for small thumbnails (56px) — at that size a 9px label is
   * illegible and just adds noise, so the glyph alone reads better.
   * On for the larger public landing cards.
   */
  showLabel?: boolean;
  /** Extra style overrides. */
  className?: string;
  style?: React.CSSProperties;
}

/**
 * The "no photo" empty state.
 *
 * Rendered instead of an `<img>` when a report has no renderable
 * photo URL. Deliberately an inert `<div>` (not an `<img>` with an
 * empty `src`) so the browser never paints its broken-image glyph.
 */
export function PhotoPlaceholder({
  size = 56,
  lang = 'en',
  showLabel = false,
  className,
  style,
}: PhotoPlaceholderProps) {
  const glyphSize = Math.max(14, Math.round(size * 0.32));

  return (
    <div
      aria-label={t('public.feed.no_photo', null, lang)}
      data-testid="photo-placeholder"
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: 'var(--radius-sm)',
        border: '1px dashed var(--color-border)',
        background: 'var(--color-surface-raised)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        color: 'var(--color-ink-tertiary)',
        flexShrink: 0,
        ...style,
      }}
    >
      {/* Inline camera glyph — stroked SVG, inherits currentColor. */}
      <svg
        width={glyphSize}
        height={glyphSize}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M3 7h3l2-2h8l2 2h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
      {showLabel ? (
        <span
          style={{
            fontSize: 9,
            fontWeight: 'var(--weight-semibold, 600)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          {t('public.feed.no_photo', null, lang)}
        </span>
      ) : null}
    </div>
  );
}
