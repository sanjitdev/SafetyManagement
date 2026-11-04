/**
 * Select — a native dropdown.
 *
 * A native `<select>` rather than a custom listbox. The custom
 * listbox is the single biggest accessibility regression a design
 * system can introduce: it has to re-implement type-ahead, the
 * screen-reader announcement of the active option, the mobile OS
 * picker and the Escape/Enter/arrow keyboard model. Every phone in
 * Bangladesh opens a native picker that the user already knows.
 *
 * The visual treatment comes from the token system, so the select
 * matches the inputs around it.
 */

import type { SelectHTMLAttributes } from 'react';
import { t, type Language } from '@/lib/i18n/keys';

export interface SelectOption {
  /** The submitted value. */
  value: string;
  /** The visible label. */
  label: string;
  /** Disabled options stay in the list but cannot be chosen. */
  disabled?: boolean;
}

export type SelectSize = 'sm' | 'md' | 'lg';

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children' | 'size'> {
  /** The option list. */
  options: readonly SelectOption[];
  /** Control height. Defaults to `md`. */
  size?: SelectSize;
  /** Render a leading empty option carrying the placeholder label. */
  placeholder?: boolean;
  /** Document language — used for the placeholder copy. */
  lang?: Language;
}

const SIZE_HEIGHT: Record<SelectSize, number> = { sm: 32, md: 40, lg: 48 };

export function Select({
  options,
  size = 'md',
  placeholder = false,
  lang = 'bn',
  style,
  ...rest
}: SelectProps) {
  return (
    <select
      {...rest}
      data-size={size}
      style={{
        width: '100%',
        minHeight: SIZE_HEIGHT[size],
        padding: `0 var(--space-3)`,
        background: 'var(--color-surface-card)',
        color: 'var(--color-ink)',
        border: '1px solid var(--color-border-input)',
        borderRadius: 'var(--radius-input)',
        fontFamily: 'inherit',
        fontSize: 'var(--text-body)',
        lineHeight: 'var(--leading-snug)',
        appearance: 'none',
        ...style,
      }}
    >
      {placeholder ? (
        <option value="" disabled>
          {t('ui.select.placeholder', null, lang)}
        </option>
      ) : null}
      {options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
