'use client';

/**
 * ThemeToggle (components/ThemeToggle.tsx).
 *
 * Compact 2-state icon button: a single sun / moon toggle. The
 * underlying appearance model still supports three values
 * (`'light' | 'dark' | 'system'`) — the dark value is the
 * default until the user chooses another appearance. After that,
 * clicking flips between `'light'` and `'dark'`. The first paint
 * never FOUCs: the inline boot script
 * (`app/appearance-boot.tsx`) reads the stored preference and
 * applies the right class to <html> before React hydrates.
 *
 * Why a single button instead of the earlier 3-option segmented
 * control: the AppHeader is shared across every surface and the
 * 3-option pill took too much horizontal space at 1024×768. A
 * 44×44 icon button remains easy to tap while leaving room for the inline nav and the
 * Report CTA in the citizen header. Staff and public headers
 * have even more room; the same button works on every role.
 *
 * The button is rendered as a plain `<button type="button">` with
 * an explicit `aria-label` that announces both the current state
 * ("Switch to light mode" / "Switch to dark mode") so screen
 * readers describe the action, not the state.
 */

import { useTheme } from '@/lib/theme/ThemeProvider';
import { t, type Language } from '@/lib/i18n/keys';

interface ThemeToggleProps {
  /** i18n language for the aria-label. Defaults to 'bn' (Bangla-first). */
  lang?: Language;
}

function SunIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden focusable="false">
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
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden focusable="false">
      <path
        d="M16.5 12.5A6.5 6.5 0 0 1 7.5 3.5a6.5 6.5 0 1 0 9 9z"
        fill="currentColor"
      />
    </svg>
  );
}

export function ThemeToggle({ lang = 'bn' }: ThemeToggleProps) {
  const { resolved, setAppearance } = useTheme();
  const isDark = resolved === 'dark';
  const next: 'light' | 'dark' = isDark ? 'light' : 'dark';
  const label = isDark ? t('theme.option.light', null, lang) : t('theme.option.dark', null, lang);

  return (
    <button
      type="button"
      onClick={() => setAppearance(next)}
      aria-label={label}
      title={label}
      style={{
        width: 44,
        height: 44,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        border: '1px solid var(--color-border)',
        borderRadius: '50%',
        color: 'var(--color-ink-secondary)',
        cursor: 'pointer',
        padding: 0,
        fontFamily: 'inherit',
        transition: 'background var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out)',
      }}
      onMouseDown={(e) => e.preventDefault() /* keep focus ring visible */}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
