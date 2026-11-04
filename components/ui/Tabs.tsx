/**
 * Tabs — the WAI-ARIA tabs pattern.
 *
 * The tablist is ONE tab stop with roving tabindex: Tab moves into
 * the tablist and lands on the active tab; Arrow keys move between
 * tabs. The panel carries `role="tabpanel"` and is wired to its tab
 * with `aria-labelledby` + `aria-controls`.
 *
 * The component owns the ARIA mechanics but NOT the content: the
 * caller renders the panel body for the selected tab. That keeps the
 * tabs usable from a server component (the tab strip itself) while
 * the switching stays on the client.
 */

'use client';

import { useCallback, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { t, type Language } from '@/lib/i18n/keys';

export interface TabItem {
  /** Stable id. */
  key: string;
  /** Visible label. */
  label: string;
  /** Optional leading icon. */
  icon?: ReactNode;
  /** Optional trailing count. */
  count?: number;
  /** Disables the tab. */
  disabled?: boolean;
}

export interface TabsProps {
  /** The tabs, in display order. */
  items: readonly TabItem[];
  /** The initially selected tab key. */
  defaultActiveKey?: string;
  /** Called when the selection changes. */
  onChange?: (key: string) => void;
  /** Accessible name for the tablist. */
  ariaLabel?: string;
  /** Document language. */
  lang: Language;
  /** The panel body for the selected tab. */
  children?: ReactNode;
  /** Test hook. */
  'data-testid'?: string;
}

export function Tabs({
  items,
  defaultActiveKey,
  onChange,
  ariaLabel,
  lang,
  children,
  'data-testid': testId,
}: TabsProps) {
  const initial = defaultActiveKey ?? items.find((item) => !item.disabled)?.key ?? items[0]?.key ?? '';
  const [activeKey, setActiveKey] = useState<string>(initial);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const select = useCallback(
    (key: string) => {
      setActiveKey(key);
      onChange?.(key);
    },
    [onChange],
  );

  const focusAt = useCallback(
    (index: number) => {
      const length = items.length;
      if (length === 0) return;
      const wrapped = ((index % length) + length) % length;
      const target = items[wrapped];
      if (!target || target.disabled) return;
      buttonRefs.current[wrapped]?.focus();
      select(target.key);
    },
    [items, select],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const current = items.findIndex((item) => item.key === activeKey);
      switch (event.key) {
        case 'ArrowRight':
          event.preventDefault();
          focusAt(current + 1);
          return;
        case 'ArrowLeft':
          event.preventDefault();
          focusAt(current - 1);
          return;
        case 'Home':
          event.preventDefault();
          focusAt(0);
          return;
        case 'End':
          event.preventDefault();
          focusAt(items.length - 1);
          return;
        default:
          return;
      }
    },
    [activeKey, focusAt, items],
  );

  return (
    <div data-testid={testId}>
      <div
        role="tablist"
        aria-label={ariaLabel ?? t('ui.tabs.label', null, lang)}
        onKeyDown={handleKeyDown}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-1)',
          borderBottom: '1px solid var(--color-border)',
          overflowX: 'auto',
        }}
      >
        {items.map((item, index) => {
          const isActive = item.key === activeKey;
          return (
            <button
              key={item.key}
              ref={(el) => {
                buttonRefs.current[index] = el;
              }}
              type="button"
              role="tab"
              id={`tab-${item.key}`}
              aria-selected={isActive}
              aria-controls={`tabpanel-${item.key}`}
              tabIndex={isActive ? 0 : -1}
              disabled={item.disabled}
              onClick={() => select(item.key)}
              lang={lang}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                padding: 'var(--space-2) var(--space-3)',
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${isActive ? 'var(--color-primary)' : 'transparent'}`,
                color: isActive ? 'var(--color-primary)' : 'var(--color-ink-secondary)',
                fontFamily: 'inherit',
                fontSize: 'var(--text-body-sm)',
                fontWeight: isActive ? 'var(--weight-semibold)' : 'var(--weight-medium)',
                whiteSpace: 'nowrap',
                cursor: item.disabled ? 'not-allowed' : 'pointer',
                opacity: item.disabled ? 0.55 : 1,
              }}
            >
              {item.icon ? (
                <span aria-hidden style={{ display: 'inline-flex' }}>
                  {item.icon}
                </span>
              ) : null}
              {item.label}
              {typeof item.count === 'number' ? (
                <span className="tabular-nums" style={{ fontSize: 'var(--text-micro)' }}>
                  {item.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {children ? (
        <div
          role="tabpanel"
          id={`tabpanel-${activeKey}`}
          aria-labelledby={`tab-${activeKey}`}
          tabIndex={0}
          style={{ paddingTop: 'var(--space-4)' }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
