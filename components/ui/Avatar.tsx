/**
 * Avatar — a user or city avatar.
 *
 * Renders an image when one is supplied and falls back to initials
 * when it is not. The fallback is `aria-hidden` and the WRAPPER
 * carries the `aria-label`, so a screen reader announces the name
 * once rather than twice ("Rashid Ahmed" and then "R A").
 */

import type { ReactNode } from 'react';

export type AvatarSize = 'sm' | 'md' | 'lg';

export interface AvatarProps {
  /** The person's (or city's) name. Used for the accessible label and the initials fallback. */
  name: string;
  /** Optional image URL. */
  src?: string;
  /** Control size. Defaults to `md`. */
  size?: AvatarSize;
  /** Visual tone. Defaults to `primary`. */
  tone?: 'neutral' | 'primary';
  /** Optional trailing element (e.g. a status dot). */
  trailing?: ReactNode;
  /** Test hook. */
  'data-testid'?: string;
}

const SIZE: Record<AvatarSize, number> = { sm: 24, md: 32, lg: 40 };

/**
 * The first letters of the first two words of a name.
 *
 * "Rashid Ahmed" → "RA"; "Dhaka North City Corporation" → "DC";
 * an empty name → "?" so the control never collapses to nothing.
 */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function Avatar({ name, src, size = 'md', tone = 'primary', trailing, 'data-testid': testId }: AvatarProps) {
  const dimension = SIZE[size];
  const background = tone === 'primary' ? 'var(--color-primary-soft)' : 'var(--color-surface-raised)';
  const foreground = tone === 'primary' ? 'var(--color-primary)' : 'var(--color-ink-secondary)';

  return (
    <span
      aria-label={name}
      role="img"
      data-testid={testId}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: dimension,
        height: dimension,
        borderRadius: 'var(--radius-pill)',
        background,
        color: foreground,
        border: '1px solid var(--color-border)',
        fontSize: 'var(--text-micro)',
        fontWeight: 'var(--weight-bold)',
        lineHeight: 1,
        overflow: 'visible',
        flexShrink: 0,
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name}
          width={dimension}
          height={dimension}
          style={{ width: '100%', height: '100%', borderRadius: 'var(--radius-pill)', objectFit: 'cover' }}
        />
      ) : (
        <span aria-hidden>{initialsOf(name)}</span>
      )}
      {trailing}
    </span>
  );
}
