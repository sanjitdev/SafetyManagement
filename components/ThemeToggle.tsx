'use client';

/**
 * ThemeToggle (components/ThemeToggle.tsx).
 *
 * Three-state segmented control: Light / Dark / System. The active
 * option is filled with --color-primary; inactive options show
 * --color-ink-secondary on a transparent background and pick up
 * --color-primary on hover.
 *
 * Rendered as a radiogroup so screen readers announce role + state
 * correctly. Keyboard support: Tab focuses the group; arrow keys
 * move between options; Space/Enter selects.
 *
 * The whole component is a client component (it reads from the
 * ThemeProvider context). The first paint of the parent page should
 * NOT depend on this component — the appearance boot script
 * (`app/appearance-boot.tsx`) has already applied the right class
 * to <html> before React hydrates.
 */

import { useId } from 'react';
import { useTheme } from '@/lib/theme/ThemeProvider';
import { APPEARANCES, type Appearance } from '@/lib/theme/appearance';
import { t, type Language } from '@/lib/i18n/keys';

interface ThemeToggleProps {
  /** i18n language for labels. Defaults to 'bn' (Bangla-first). */
  lang?: Language;
  /** Visual density. 'compact' renders short labels (single character). */
  variant?: 'full' | 'compact';
}

const ICONS: Record<Appearance, JSX.Element> = {
  light: (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden focusable="false">
      <circle cx="10" cy="10" r="3.5" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <line x1="10" y1="1.5" x2="10" y2="4" />
        <line x1="10" y1="16" x2="10" y2="18.5" />
        <line x1="1.5" y1="10" x2="4" y2="10" />
        <line x1="16" y1="10" x2="18.5" y2="10" />
        <line x1="3.8" y1="3.8" x2="5.5" y2="5.5" />
        <line x1="14.5" y1="14.5" x2="16.2" y2="16.2" />
        <line x1="3.8" y1="16.2" x2="5.5" y2="14.5" />
        <line x1="14.5" y1="5.5" x2="16.2" y2="3.8" />
      </g>
    </svg>
  ),
  dark: (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden focusable="false">
      <path
        d="M16.5 12.5A6.5 6.5 0 0 1 7.5 3.5a6.5 6.5 0 1 0 9 9z"
        fill="currentColor"
      />
    </svg>
  ),
  system: (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden focusable="false">
      <rect
        x="2.5"
        y="3.5"
        width="15"
        height="10"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <line
        x1="7.5"
        y1="16.5"
        x2="12.5"
        y2="16.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  ),
};

const LABEL_KEYS: Record<Appearance, { full: string; short: string }> = {
  light: { full: 'theme.option.light', short: 'theme.option.light_short' },
  dark: { full: 'theme.option.dark', short: 'theme.option.dark_short' },
  system: { full: 'theme.option.system', short: 'theme.option.system_short' },
};

export function ThemeToggle({ lang = 'bn', variant = 'full' }: ThemeToggleProps) {
  const { appearance, setAppearance } = useTheme();
  const groupId = useId();

  return (
    <div
      role="radiogroup"
      aria-label={t('theme.toggle.aria_label', null, lang)}
      style={{
        display: 'inline-flex',
        gap: 'var(--space-1)',
        padding: '4px',
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-pill)',
      }}
    >
      {APPEARANCES.map((opt) => {
        const isActive = appearance === opt;
        const key = variant === 'compact' ? LABEL_KEYS[opt].short : LABEL_KEYS[opt].full;
        const label = t(key as keyof typeof import('@/lib/i18n/keys').TRANSLATIONS, null, lang);
        return (
          <button
            key={opt}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => setAppearance(opt)}
            id={`${groupId}-${opt}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              minHeight: 32,
              padding: variant === 'compact' ? '0 10px' : '0 var(--space-3)',
              background: isActive ? 'var(--color-primary)' : 'transparent',
              color: isActive ? 'var(--color-on-primary)' : 'var(--color-ink-secondary)',
              border: 'none',
              borderRadius: 'var(--radius-pill)',
              fontSize: 'var(--text-caption)',
              fontWeight: 'var(--weight-semibold)',
              fontFamily: 'inherit',
              cursor: 'pointer',
              transition: 'background var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out)',
            }}
            onMouseDown={(e) => e.preventDefault() /* keep focus ring visible */}
            title={t('theme.option.system_hint', null, lang) + (opt === 'system' ? '' : `: ${label}`)}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center' }}>{ICONS[opt]}</span>
            {variant === 'full' && <span>{label}</span>}
          </button>
        );
      })}
    </div>
  );
}
