/**
 * IconButton — an icon-only button.
 *
 * The rule this primitive enforces: an icon-only control MUST carry
 * an accessible name. `label` is required, not optional, and it is
 * rendered as `aria-label` AND `title` (the title gives sighted mouse
 * users the same hint).
 *
 * The optional visible caption under the icon is `aria-hidden` — the
 * `aria-label` is the name, and announcing both would make screen
 * readers say the same word twice.
 */

import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type IconButtonVariant = 'ghost' | 'secondary' | 'danger';
export type IconButtonSize = 'sm' | 'md' | 'lg';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** The accessible name. Required — an icon-only button without one is invisible to a screen reader. */
  label: string;
  /** The icon element. */
  icon: ReactNode;
  /** Visual weight. Defaults to `ghost`. */
  variant?: IconButtonVariant;
  /** Square control size. Defaults to `md`. */
  size?: IconButtonSize;
  /** Optional visible caption rendered under the icon. */
  caption?: string;
  /** Test hook. */
  'data-testid'?: string;
}

const SIZE: Record<IconButtonSize, number> = { sm: 32, md: 40, lg: 48 };

const VARIANT_STYLE: Record<IconButtonVariant, { background: string; color: string; border: string }> = {
  ghost: {
    background: 'transparent',
    color: 'var(--color-ink-secondary)',
    border: '1px solid transparent',
  },
  secondary: {
    background: 'var(--color-surface-card)',
    color: 'var(--color-ink)',
    border: '1px solid var(--color-border-strong)',
  },
  danger: {
    background: 'transparent',
    color: 'var(--color-danger)',
    border: '1px solid var(--color-border-strong)',
  },
};

export function IconButton({
  label,
  icon,
  variant = 'ghost',
  size = 'md',
  caption,
  disabled,
  type = 'button',
  style,
  'data-testid': testId,
  ...rest
}: IconButtonProps) {
  const variantStyle = VARIANT_STYLE[variant];
  const dimension = SIZE[size];

  return (
    <span
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--space-1)',
      }}
      data-testid={testId}
    >
      <button
        {...rest}
        type={type}
        aria-label={label}
        title={label}
        disabled={disabled}
        data-variant={variant}
        data-size={size}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: dimension,
          height: dimension,
          padding: 0,
          background: variantStyle.background,
          color: variantStyle.color,
          border: variantStyle.border,
          borderRadius: 'var(--radius-input)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.55 : 1,
          fontFamily: 'inherit',
          ...style,
        }}
      >
        {icon}
      </button>
      {caption ? (
        <span
          aria-hidden
          style={{
            fontSize: 'var(--text-micro)',
            color: 'var(--color-ink-tertiary)',
            lineHeight: 'var(--leading-snug)',
          }}
        >
          {caption}
        </span>
      ) : null}
    </span>
  );
}
