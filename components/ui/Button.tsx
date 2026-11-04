/**
 * Button — the primary action control.
 *
 * One button for every action in the product. Before this primitive
 * each page hand-rolled its own `<button>` with an inline `style`
 * object, which meant the CTA colour, the radius, the disabled state
 * and the focus treatment drifted from surface to surface.
 *
 * VARIANTS
 * --------
 *   primary   — the civic-blue CTA. There is at most ONE primary
 *               button in view; anything else is secondary.
 *   secondary — a bordered action on a card surface.
 *   ghost     — a tertiary action that sits in the chrome.
 *   danger    — a destructive action. Service red, never a CTA.
 *
 * The service green (`--color-success`) is deliberately NOT a variant:
 * "success" describes an outcome, never a button.
 *
 * LOADING
 * -------
 * A loading button keeps its label visible (so the button does not
 * change width mid-submit) and gains a spinner. It is natively
 * disabled and marked `aria-busy`, so a screen reader announces the
 * state and a double-submit is impossible.
 */

import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Visual weight of the action. Defaults to `primary`. */
  variant?: ButtonVariant;
  /** Control height. Defaults to `md`. */
  size?: ButtonSize;
  /** Button label. */
  children: ReactNode;
  /** Show a spinner and block interaction. */
  loading?: boolean;
  /** Icon rendered before the label. */
  icon?: ReactNode;
  /** Icon rendered after the label. */
  trailingIcon?: ReactNode;
  /** Stretch to the container width. */
  fullWidth?: boolean;
}

/** Control heights. The `sm` step is a secondary control, not a tap target. */
const SIZE_HEIGHT: Record<ButtonSize, number> = { sm: 32, md: 40, lg: 48 };

/** Horizontal padding per size, in spacing tokens. */
const SIZE_PADDING: Record<ButtonSize, string> = {
  sm: 'var(--space-2) var(--space-3)',
  md: 'var(--space-2) var(--space-4)',
  lg: 'var(--space-3) var(--space-5)',
};

const VARIANT_STYLE: Record<ButtonVariant, { background: string; color: string; border: string }> = {
  primary: {
    background: 'var(--color-primary)',
    color: 'var(--color-on-primary)',
    border: '1px solid var(--color-primary)',
  },
  secondary: {
    background: 'var(--color-surface-card)',
    color: 'var(--color-ink)',
    border: '1px solid var(--color-border-strong)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--color-accent)',
    border: '1px solid transparent',
  },
  danger: {
    background: 'var(--color-danger)',
    color: 'var(--color-surface-card)',
    border: '1px solid var(--color-danger)',
  },
};

export function Button({
  variant = 'primary',
  size = 'md',
  children,
  loading = false,
  icon,
  trailingIcon,
  fullWidth = false,
  disabled,
  type = 'button',
  style,
  ...rest
}: ButtonProps) {
  const variantStyle = VARIANT_STYLE[variant];
  const isDisabled = Boolean(disabled) || loading;

  return (
    <button
      {...rest}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      data-variant={variant}
      data-size={size}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-2)',
        minHeight: SIZE_HEIGHT[size],
        padding: SIZE_PADDING[size],
        width: fullWidth ? '100%' : undefined,
        background: variantStyle.background,
        color: variantStyle.color,
        border: variantStyle.border,
        borderRadius: 'var(--radius-input)',
        fontFamily: 'inherit',
        fontSize: size === 'sm' ? 'var(--text-caption)' : 'var(--text-body)',
        fontWeight: 'var(--weight-semibold)',
        lineHeight: 'var(--leading-snug)',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        opacity: isDisabled ? 0.55 : 1,
        transition:
          'background var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out)',
        ...style,
      }}
    >
      {loading ? <Spinner /> : icon ? <span aria-hidden>{icon}</span> : null}
      <span>{children}</span>
      {trailingIcon ? <span aria-hidden>{trailingIcon}</span> : null}
    </button>
  );
}

/**
 * The spinner.
 *
 * Drawn as inline SVG rather than pulled from the icon package so the
 * button has no dependency on the icon registry and the spinner can
 * animate with a plain CSS keyframe.
 */
function Spinner() {
  return (
    <svg
      width="var(--icon-size-sm)"
      height="var(--icon-size-sm)"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden
      focusable="false"
      style={{ animation: 'cityfix-spin 900ms linear infinite' }}
    >
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
}
