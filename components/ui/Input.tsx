/**
 * Input — the text input control.
 *
 * A thin wrapper over the native `<input>` that applies the system's
 * control styling (border, radius, height, focus) and optionally
 * reserves room for a leading icon and a trailing adornment.
 *
 * The native input is deliberately NOT replaced with a div + custom
 * keyboard handling: the native control already has the correct
 * caret behaviour, IME composition, autofill, password-manager and
 * mobile-keyboard semantics for free.
 *
 * When there is no icon and no adornment the `<input>` renders bare,
 * so it still fills its container without a wrapper element in the way.
 */

import type { InputHTMLAttributes, ReactNode } from 'react';

export type InputSize = 'sm' | 'md' | 'lg';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Control height. Defaults to `md`. */
  size?: InputSize;
  /** Optional leading icon (a Phosphor glyph). */
  icon?: ReactNode;
  /** Optional trailing adornment (a suffix, a unit, an action). */
  trailing?: ReactNode;
}

const SIZE_HEIGHT: Record<InputSize, number> = { sm: 32, md: 40, lg: 48 };

export function Input({ size = 'md', icon, trailing, style, ...rest }: InputProps) {
  const controlStyle: React.CSSProperties = {
    width: '100%',
    minHeight: SIZE_HEIGHT[size],
    padding: icon
      ? `0 var(--space-4) 0 var(--space-6)`
      : trailing
        ? `0 var(--space-8) 0 var(--space-3)`
        : `0 var(--space-3)`,
    background: 'var(--color-surface-card)',
    color: 'var(--color-ink)',
    border: '1px solid var(--color-border-input)',
    borderRadius: 'var(--radius-input)',
    fontFamily: 'inherit',
    fontSize: 'var(--text-body)',
    lineHeight: 'var(--leading-snug)',
    ...style,
  };

  if (!icon && !trailing) {
    return <input {...rest} data-size={size} style={controlStyle} />;
  }

  return (
    <span style={{ position: 'relative', display: 'inline-flex', width: '100%' }}>
      {icon ? (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            left: 'var(--space-3)',
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'inline-flex',
            color: 'var(--color-ink-tertiary)',
            pointerEvents: 'none',
          }}
        >
          {icon}
        </span>
      ) : null}
      <input {...rest} data-size={size} style={controlStyle} />
      {trailing ? (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            right: 'var(--space-3)',
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'inline-flex',
            alignItems: 'center',
            color: 'var(--color-ink-tertiary)',
            pointerEvents: 'none',
          }}
        >
          {trailing}
        </span>
      ) : null}
    </span>
  );
}
