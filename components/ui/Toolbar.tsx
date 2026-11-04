/**
 * Toolbar — the action bar above a list or a table.
 *
 * Implements the WAI-ARIA toolbar pattern: a horizontal strip of
 * related controls that behaves as ONE tab stop. Arrow keys move
 * between the controls, Home/End jump to the ends. Without the
 * roving tabindex, a toolbar with eight filters adds eight tab stops
 * to a page that already has a header, a nav and a table.
 *
 * The component is presentational: the toolbar owns the keyboard
 * MODEL, the page owns the selection state.
 */

'use client';

import { useCallback, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { t, type Language } from '@/lib/i18n/keys';

export interface ToolbarProps {
  /** Toolbar content — buttons, filters, groups. */
  children: ReactNode;
  /** Accessible name for the toolbar region. */
  ariaLabel?: string;
  /** Document language. */
  lang: Language;
  /** Optional leading cluster (a title, a count). */
  leading?: ReactNode;
  /** Optional trailing cluster (a primary action). */
  trailing?: ReactNode;
  /** Test hook. */
  'data-testid'?: string;
}

export function Toolbar({
  children,
  ariaLabel,
  lang,
  leading,
  trailing,
  'data-testid': testId,
}: ToolbarProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const focusAt = useCallback((index: number) => {
    const root = containerRef.current;
    if (!root) return;
    const focusable = Array.from(
      root.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
    );
    if (focusable.length === 0) return;
    const wrapped = ((index % focusable.length) + focusable.length) % focusable.length;
    focusable[wrapped].focus();
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const root = containerRef.current;
      if (!root) return;
      const focusable = Array.from(
        root.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
      );
      const current = focusable.findIndex((el) => el === document.activeElement);
      if (current === -1) return;

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
          focusAt(focusable.length - 1);
          return;
        default:
          return;
      }
    },
    [focusAt],
  );

  return (
    <div
      ref={containerRef}
      role="toolbar"
      aria-label={ariaLabel ?? t('ui.toolbar.label', null, lang)}
      aria-orientation="horizontal"
      onKeyDown={handleKeyDown}
      data-testid={testId}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-3)',
        padding: 'var(--space-2) var(--space-3)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-input)',
        background: 'var(--color-surface-card)',
        flexWrap: 'wrap',
      }}
    >
      {leading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>{leading}</div>
      ) : null}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        {children}
      </div>
      {trailing ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginLeft: 'auto' }}>
          {trailing}
        </div>
      ) : null}
    </div>
  );
}
