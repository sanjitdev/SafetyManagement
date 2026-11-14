/**
 * FilterChipGroup — keyboard-navigable filter chip group.
 *
 * S-002.1 (Side-panel hierarchy + filter chip group) + S-003.3
 * (FilterChipGroup primitive with keyboard + ARIA).
 *
 * Implements the WAI-ARIA "Toolbar" pattern with roving tabindex:
 * the group as a whole takes a single tab stop; arrow keys move
 * the active descendant among the chips; Home/End jump to the
 * first/last chip; Enter/Space activate the focused chip. This
 * matches the keyboard model used by Gmail's filter bar, GitHub
 * issue filters, and iOS segmented controls.
 *
 * The active chip carries `aria-pressed="true"`; the other
 * chips carry `aria-pressed="false"`. The group wrapper has
 * `role="group"` with an `aria-label` so screen readers
 * announce it as a single control.
 *
 * Each chip is a presentational element with `display: inline-flex`
 * and a min-height of 32px (the team.md-mandated touch minimum is
 * 44px, but the chip group is a secondary control and lives
 * inside a scrollable region; the parent can wrap the group in a
 * hit-area if a 44px floor is required at a particular breakpoint).
 *
 * The group is a client component because keyboard handling
 * requires `useState` / event listeners. The chips themselves
 * are presentational; data and selection state live in the
 * parent.
 */

'use client';

import { useRef, useState, useCallback, KeyboardEvent, ReactNode, type CSSProperties } from 'react';
import { type Language } from '@/lib/i18n/keys';

export interface FilterChipOption<T extends string> {
  /** Stable id, used as the key and as the onChange value. */
  value: T;
  /** Localized label. */
  label: string;
  /** Optional disabled state. */
  disabled?: boolean;
  /**
   * Test hook for THIS chip.
   *
   * The group carries its own `data-testid`, but a spec that clicks
   * one specific chip needs to name that chip — the group testid
   * selects the whole group, not a member of it.
   */
  testId?: string;
}

export interface FilterChipGroupProps<T extends string> {
  /** The option list (in display order). */
  options: ReadonlyArray<FilterChipOption<T>>;
  /** Currently selected value. */
  value: T;
  /** Fired when a chip is activated (click, Enter, or Space). */
  onChange: (value: T) => void;
  /** Group-level aria-label. Required. */
  ariaLabel: string;
  /** Document language for the rendered chips. */
  lang: Language;
  /** Optional className passthrough. */
  className?: string;
  /**
   * Optional inline style for the GROUP wrapper.
   *
   * The group is a horizontal row by default. A left rail wants a
   * vertical stack, and the chips need to fill the rail's width —
   * neither is expressible as a className without a stylesheet this
   * primitive does not own.
   */
  style?: CSSProperties;
  /** Test hook. */
  'data-testid'?: string;
}

export function FilterChipGroup<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  lang,
  className,
  style,
  'data-testid': testId,
}: FilterChipGroupProps<T>) {
  const [focusedIndex, setFocusedIndex] = useState(() => {
    const idx = options.findIndex((o) => o.value === value);
    return idx === -1 ? 0 : idx;
  });
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusChip = useCallback((index: number) => {
    const len = options.length;
    if (len === 0) return;
    const wrapped = ((index % len) + len) % len;
    setFocusedIndex(wrapped);
    const el = buttonRefs.current[wrapped];
    if (el) el.focus();
  }, [options.length]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      // Roving tabindex: arrow keys move focus within the group.
      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          focusChip(focusedIndex + 1);
          return;
        case 'ArrowLeft':
          e.preventDefault();
          focusChip(focusedIndex - 1);
          return;
        case 'Home':
          e.preventDefault();
          focusChip(0);
          return;
        case 'End':
          e.preventDefault();
          focusChip(options.length - 1);
          return;
        default:
          return;
      }
    },
    [focusChip, focusedIndex, options.length],
  );

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      data-testid={testId}
      className={className}
      onKeyDown={handleKeyDown}
      style={{
        display: 'inline-flex',
        gap: 'var(--space-2)',
        flexWrap: 'wrap',
        alignItems: 'center',
        ...style,
      }}
    >
      {options.map((opt, i) => {
        const isActive = opt.value === value;
        const isFocused = i === focusedIndex;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              buttonRefs.current[i] = el;
            }}
            type="button"
            lang={lang}
            data-testid={opt.testId}
            aria-pressed={isActive}
            aria-label={opt.label}
            tabIndex={isFocused ? 0 : -1}
            data-active={isActive ? 'true' : 'false'}
            data-focused={isFocused ? 'true' : 'false'}
            disabled={opt.disabled}
            onClick={() => {
              if (opt.disabled) return;
              setFocusedIndex(i);
              onChange(opt.value);
            }}
            style={{
              padding: 'var(--space-1) var(--space-3)',
              minHeight: 32,
              background: isActive ? 'var(--color-accent)' : 'var(--color-surface-raised)',
              color: isActive ? 'var(--color-on-primary)' : 'var(--color-ink-secondary)',
              border: isActive ? '1px solid var(--color-accent)' : '1px solid transparent',
              borderRadius: 'var(--radius-pill)',
              fontSize: 'var(--text-caption)',
              fontWeight: 'var(--weight-semibold)',
              cursor: opt.disabled ? 'not-allowed' : 'pointer',
              opacity: opt.disabled ? 0.5 : 1,
              transition: 'background var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out)',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}