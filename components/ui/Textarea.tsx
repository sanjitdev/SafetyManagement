/**
 * Textarea — the multi-line text control.
 *
 * Same styling contract as `Input`, plus an optional character
 * counter. The counter is `aria-hidden`: the `maxLength` attribute
 * is already announced by every screen reader, so a live counter that
 * also spoke would talk over the user.
 */

import type { TextareaHTMLAttributes } from 'react';

export interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'maxLength'> {
  /** Visible rows. Defaults to 4. */
  rows?: number;
  /** Show the `{length} / {maxLength}` counter under the control. */
  showCount?: boolean;
  /** Maximum length used by the counter. Falls back to `maxLength`. */
  maxLength?: number;
}

export function Textarea({
  rows = 4,
  showCount = false,
  maxLength,
  value,
  style,
  ...rest
}: TextareaProps) {
  const limit = maxLength;
  const currentLength = typeof value === 'string' ? value.length : 0;

  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
      <textarea
        {...rest}
        rows={rows}
        maxLength={maxLength}
        value={value}
        style={{
          width: '100%',
          padding: 'var(--space-3)',
          background: 'var(--color-surface-card)',
          color: 'var(--color-ink)',
          border: '1px solid var(--color-border-input)',
          borderRadius: 'var(--radius-input)',
          fontFamily: 'inherit',
          fontSize: 'var(--text-body)',
          lineHeight: 'var(--leading-normal)',
          resize: 'vertical',
          ...style,
        }}
      />
      {showCount && limit ? (
        <span
          aria-hidden
          data-testid="textarea-count"
          className="tabular-nums"
          style={{
            alignSelf: 'flex-end',
            fontSize: 'var(--text-micro)',
            color: 'var(--color-ink-tertiary)',
          }}
        >
          {currentLength} / {limit}
        </span>
      ) : null}
    </span>
  );
}
