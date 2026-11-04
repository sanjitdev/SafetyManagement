/**
 * FilterBar — a labelled row of filters above a list.
 *
 * The filter bar is the page's "narrowing" region: category chips,
 * status chips, a date range, a search box. It is a `region` with an
 * accessible name (so a screen-reader user can jump to it), not a
 * toolbar — the filters are a set of independent controls rather
 * than a roving-tabindex composite.
 *
 * When a filter is active the bar shows how many are active and
 * offers a reset, so the user is never stuck in a narrowed list
 * without an obvious way out.
 */

import type { ReactNode } from 'react';
import { t, type Language } from '@/lib/i18n/keys';

export interface FilterBarProps {
  /** Filter controls. */
  children: ReactNode;
  /** Accessible name for the region. */
  ariaLabel?: string;
  /** Document language. */
  lang: Language;
  /** How many filters are currently active (0 hides the reset control). */
  activeCount?: number;
  /** Called when the user clears the filters. */
  onClear?: () => void;
  /** Optional content pinned to the right (e.g. a result count). */
  trailing?: ReactNode;
  /** Test hook. */
  'data-testid'?: string;
}

export function FilterBar({
  children,
  ariaLabel,
  lang,
  activeCount = 0,
  onClear,
  trailing,
  'data-testid': testId,
}: FilterBarProps) {
  return (
    <div
      role="region"
      aria-label={ariaLabel ?? t('ui.filterbar.label', null, lang)}
      data-testid={testId}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-2) var(--space-3)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-input)',
        background: 'var(--color-surface-card)',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap', flex: '1 1 auto' }}>
        {children}
      </div>

      {activeCount > 0 ? (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            fontSize: 'var(--text-caption)',
            color: 'var(--color-ink-secondary)',
            whiteSpace: 'nowrap',
          }}
        >
          <span className="tabular-nums">{activeCount}</span>
          {onClear ? (
            <button
              type="button"
              onClick={onClear}
              lang={lang}
              style={{
                background: 'transparent',
                border: 'none',
                padding: 0,
                font: 'inherit',
                fontWeight: 'var(--weight-semibold)',
                color: 'var(--color-accent)',
                cursor: 'pointer',
              }}
            >
              {t('ui.action.close', null, lang)}
            </button>
          ) : null}
        </span>
      ) : null}

      {trailing}
    </div>
  );
}
