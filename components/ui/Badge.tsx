/**
 * Badge — a small count or label chip.
 *
 * A Badge is NOT a status indicator. A status must carry a shape and
 * a word (see `StatusPill`); a Badge is for counts, categories and
 * neutral metadata where the colour carries no meaning of its own.
 *
 * The tones map to the semantic tokens so a badge reads consistently
 * with the rest of the system. Every tone is a foreground over its own
 * soft fill — never a saturated fill with a light label.
 */

import type { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'primary' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

export interface BadgeProps {
  /** The badge content. */
  children: ReactNode;
  /** Semantic tone. Defaults to `neutral`. */
  tone?: BadgeTone;
  /** Control size. Defaults to `sm`. */
  size?: 'sm' | 'md';
  /** Optional leading icon. */
  icon?: ReactNode;
  /** Overrides the accessible name when the content is not a plain string. */
  ariaLabel?: string;
  /** Optional class passthrough. */
  className?: string;
  /** Test hook. */
  'data-testid'?: string;
}

const TONE_STYLE: Record<BadgeTone, { fg: string; bg: string }> = {
  neutral: { fg: 'var(--color-ink-secondary)', bg: 'var(--color-surface-raised)' },
  primary: { fg: 'var(--color-primary)', bg: 'var(--color-primary-soft)' },
  accent: { fg: 'var(--color-accent)', bg: 'var(--color-accent-soft)' },
  success: { fg: 'var(--color-success)', bg: 'var(--color-success-soft)' },
  warning: { fg: 'var(--color-warning)', bg: 'var(--color-warning-soft)' },
  danger: { fg: 'var(--color-danger)', bg: 'var(--color-danger-soft)' },
  info: { fg: 'var(--color-info)', bg: 'var(--color-info-soft)' },
};

export function Badge({
  children,
  tone = 'neutral',
  size = 'sm',
  icon,
  ariaLabel,
  className,
  'data-testid': testId,
}: BadgeProps) {
  const style = TONE_STYLE[tone];

  return (
    <span
      aria-label={ariaLabel}
      data-tone={tone}
      data-testid={testId}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-1)',
        padding: size === 'md' ? 'var(--space-1) var(--space-2)' : '2px var(--space-2)',
        background: style.bg,
        color: style.fg,
        borderRadius: 'var(--radius-pill)',
        fontSize: size === 'md' ? 'var(--text-caption)' : 'var(--text-micro)',
        fontWeight: 'var(--weight-semibold)',
        lineHeight: 'var(--leading-snug)',
        whiteSpace: 'nowrap',
      }}
    >
      {icon}
      {children}
    </span>
  );
}
