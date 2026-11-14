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

/**
 * The VISUAL size of the control, in px.
 *
 * `sm` (32px) and `md` (40px) are below the 44px touch-target floor
 * (`--touch-min` in `tokens.css`).
 *
 * A citizen on a phone needs 44×44px of tappable area (WCAG 2.5.8
 * Target Size (Minimum) and the project's own `--touch-min` token).
 * Shrinking the button to 32px would have made the photo-remove
 * control genuinely hard to hit with a thumb.
 */
const SIZE: Record<IconButtonSize, number> = { sm: 32, md: 40, lg: 48 };

/** The minimum tappable area, in px. Matches `--touch-min`. */
const TOUCH_MIN = 44;

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

  /*
   * HOW THE TOUCH TARGET IS REACHED
   * -------------------------------
   * The BUTTON's own box is the 44×44 hit area. The smaller visual
   * is drawn by an INNER element that carries the background, border
   * and border-radius.
   *
   * Three earlier designs were all measured in a browser and all
   * failed:
   *
   *  1. `box-sizing: content-box` + `padding` on the button: padding
   *     and border ADD to the declared width (a 44px control became
   *     58px), and `background-clip: content-box` clips only the FILL
   *     so the border still painted around the full padding box.
   *
   *  2. A transparent `::before` overlay on the BUTTON: `inset`
   *     resolves against the PADDING box, so every overlay came up
   *     2px short of its target.
   *
   *  3. The same overlay on a WRAPPER span: the overlay is a SIBLING
   *     of the button, so it paints on top of the button and swallows
   *     every pointer event without forwarding them. The control
   *     became unclickable.
   *
   * Making the button itself 44×44 and drawing the visual inside it
   * is the only arrangement where a click at the edge of the target
   * reaches the button's handler.
   */
  const hitArea = Math.max(dimension, TOUCH_MIN);

  return (
    <span
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--space-1)',
      }}
    >
      <button
        {...rest}
        type={type}
        data-testid={testId}
        aria-label={label}
        title={label}
        disabled={disabled}
        data-variant={variant}
        data-size={size}
        data-hit-area={hitArea}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          // The BUTTON is the touch target: 44×44 (or bigger). It
          // paints nothing itself — the inner element draws the
          // visible control.
          width: hitArea,
          height: hitArea,
          padding: 0,
          background: 'transparent',
          // `border: '0'`, not `border: 'none'`. The two paint
          // identically — the computed style of both is
          // `border-*-style: none; border-*-width: 0px` — but a
          // CSSOM serialises the `none` shorthand to its INITIAL
          // value (`medium`), so the `none` form is not
          // round-trippable through `element.style.border`. `0`
          // serialises to `0px` in every engine.
          border: '0',
          borderRadius: 'var(--radius-input)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.55 : 1,
          fontFamily: 'inherit',
        }}
      >
        {/*
         * The visible control. `style` is forwarded HERE (not to the
         * button) so a call site that overrides `width`/`height` or
         * `borderRadius` changes how the control LOOKS without
         * shrinking the tappable area.
         */}
        <span
          aria-hidden
          className="iconbutton-visual"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: dimension,
            height: dimension,
            background: variantStyle.background,
            color: variantStyle.color,
            border: variantStyle.border,
            borderRadius: 'var(--radius-input)',
            ...style,
          }}
        >
          {icon}
        </span>
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
