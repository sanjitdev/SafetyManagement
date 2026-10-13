/**
 * ReportStepPrimary — the unified primary CTA for the
 * `/report/*` step pages (S-004.1-6).
 *
 * Every step exposes a primary action ("Continue" / "Submit" /
 * "Report anyway"). Before Bolt 006-004 the styling differed
 * slightly between steps (different minHeight on photo vs
 * location, different padding on summary, different
 * background tokens). This primitive pins down:
 *
 *   - 56dp fixed height (--touch-cta)
 *   - 100% width inside its slot
 *   - 16px font (--text-body-lg), 600 weight
 *   - --color-primary background, --color-on-primary text
 *   - --color-surface-sunken + 0.5 opacity when disabled
 *   - inline-flex + justify-content: center for the loading
 *     spinner to sit centered
 *   - 1.5 second animation budget via the `report-spin` class
 *     declared in `app/globals.css`
 *
 * The button renders as a `<button>` by default. Parents can
 * pass `asChild` to render a different element via clone, but
 * v1 always uses the native button.
 */

import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface ReportStepPrimaryProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  /** Optional leading icon (e.g. spinner). */
  leading?: ReactNode;
  /** Optional trailing icon (e.g. arrow). */
  trailing?: ReactNode;
  /** Always 'button' for v1. */
  type?: 'button' | 'submit' | 'reset';
  /** Test hook. */
  'data-testid'?: string;
}

export function ReportStepPrimary({
  leading,
  trailing,
  children,
  disabled,
  type = 'button',
  style,
  ...rest
}: ReportStepPrimaryProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      aria-busy={rest['aria-busy']}
      style={{
        width: '100%',
        minHeight: 'var(--touch-cta)',
        padding: 'var(--space-3) var(--space-5)',
        background: disabled
          ? 'var(--color-surface-sunken)'
          : 'var(--color-primary)',
        color: disabled
          ? 'var(--color-ink-tertiary)'
          : 'var(--color-on-primary)',
        border: 'none',
        borderRadius: 'var(--radius-md)',
        fontSize: 'var(--text-body-lg)',
        fontWeight: 'var(--weight-semibold)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-2)',
        fontFamily: 'inherit',
        ...style,
      }}
      {...rest}
    >
      {leading}
      {children}
      {trailing}
    </button>
  );
}
