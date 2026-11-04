/**
 * SideNav — the vertical navigation rail of the staff consoles.
 *
 * A `<nav>` landmark with an ordered list. The active item carries
 * `aria-current="page"` and is marked by BOTH a weight change and a
 * left rule — the active state is never colour alone.
 *
 * `items` is a plain data array so the same nav can be rendered by the
 * dispatcher, crew and admin shells without each page hand-writing
 * the markup (and each page getting the active-state rules wrong).
 */

import type { ReactNode } from 'react';
import { t, type Language } from '@/lib/i18n/keys';

export interface SideNavItem {
  /** Stable id. */
  key: string;
  /** Visible label. */
  label: string;
  /** Link target. */
  href: string;
  /** Optional leading icon. */
  icon?: ReactNode;
  /** Optional trailing count (a badge number). */
  count?: number;
  /** Marks the item as disabled (e.g. a module not enabled for this city). */
  disabled?: boolean;
}

export interface SideNavProps {
  /** The navigation items. */
  items: readonly SideNavItem[];
  /** The href of the current page. */
  activeHref?: string;
  /** Accessible name for the nav landmark. */
  ariaLabel?: string;
  /** Document language. */
  lang: Language;
  /** Optional content pinned above the items (a workspace switcher). */
  leading?: ReactNode;
  /** Optional content pinned below the items (a sign-out action). */
  trailing?: ReactNode;
  /** Test hook. */
  'data-testid'?: string;
}

export function SideNav({
  items,
  activeHref,
  ariaLabel,
  lang,
  leading,
  trailing,
  'data-testid': testId,
}: SideNavProps) {
  return (
    <nav
      aria-label={ariaLabel ?? t('ui.nav.label', null, lang)}
      data-testid={testId}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        padding: 'var(--space-3)',
        background: 'var(--color-surface-card)',
        borderRight: '1px solid var(--color-border)',
        height: '100%',
      }}
    >
      {leading}

      <ul style={{ display: 'flex', flexDirection: 'column', gap: '2px', margin: 0, padding: 0, listStyle: 'none' }}>
        {items.map((item) => {
          const isActive = activeHref === item.href;
          return (
            <li key={item.key}>
              <a
                href={item.href}
                lang={lang}
                aria-current={isActive ? 'page' : undefined}
                aria-disabled={item.disabled || undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  padding: 'var(--space-2) var(--space-3)',
                  borderRadius: 'var(--radius-input)',
                  borderLeft: `2px solid ${isActive ? 'var(--color-primary)' : 'transparent'}`,
                  background: isActive ? 'var(--color-primary-soft)' : 'transparent',
                  color: item.disabled
                    ? 'var(--color-ink-disabled)'
                    : isActive
                      ? 'var(--color-primary)'
                      : 'var(--color-ink-secondary)',
                  fontWeight: isActive ? 'var(--weight-semibold)' : 'var(--weight-medium)',
                  fontSize: 'var(--text-body-sm)',
                  textDecoration: 'none',
                  opacity: item.disabled ? 0.6 : 1,
                  cursor: item.disabled ? 'not-allowed' : 'pointer',
                }}
              >
                {item.icon ? (
                  <span aria-hidden style={{ display: 'inline-flex' }}>
                    {item.icon}
                  </span>
                ) : null}
                <span style={{ flex: '1 1 auto', minWidth: 0 }}>{item.label}</span>
                {typeof item.count === 'number' ? (
                  <span
                    className="tabular-nums"
                    style={{
                      fontSize: 'var(--text-micro)',
                      fontWeight: 'var(--weight-bold)',
                      color: 'var(--color-ink-tertiary)',
                    }}
                  >
                    {item.count}
                  </span>
                ) : null}
              </a>
            </li>
          );
        })}
      </ul>

      {trailing ? <div style={{ marginTop: 'auto' }}>{trailing}</div> : null}
    </nav>
  );
}
