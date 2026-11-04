/**
 * Card — a bordered content surface.
 *
 * The Swiss/Minimal direction forbids decorative shadow stacks: a
 * raised surface is a 1px border on the page background, not a card
 * floating on three blurred layers. The only shadow in the system is
 * reserved for overlays (modals, popovers, toasts).
 *
 * `Card` is the plain container; `Panel` (see Panel.tsx) adds a
 * header/footer structure. Use `Card` for a self-contained block of
 * content, `Panel` for a titled region.
 */

import type { ReactNode } from 'react';

export interface CardProps {
  /** Card content. */
  children: ReactNode;
  /** Optional heading rendered above the content. */
  title?: ReactNode;
  /** Optional action rendered on the right of the heading row. */
  action?: ReactNode;
  /** Removes the inner padding (for a card that holds a table or a chart edge-to-edge). */
  flush?: boolean;
  /** Visual tone. `plain` = page background, `raised` = inset surface. */
  tone?: 'plain' | 'raised';
  /** Optional class passthrough. */
  className?: string;
  /** Test hook. */
  'data-testid'?: string;
}

export function Card({
  children,
  title,
  action,
  flush = false,
  tone = 'plain',
  className,
  'data-testid': testId,
}: CardProps) {
  return (
    <section
      data-testid={testId}
      className={className}
      style={{
        background: tone === 'raised' ? 'var(--color-surface-raised)' : 'var(--color-surface-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-card)',
        overflow: 'hidden',
      }}
    >
      {title || action ? (
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-3)',
            padding: 'var(--space-4) var(--space-5)',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 'var(--text-body-lg)',
              fontWeight: 'var(--weight-semibold)',
              color: 'var(--color-ink)',
              lineHeight: 'var(--leading-snug)',
            }}
          >
            {title}
          </h2>
          {action}
        </header>
      ) : null}
      <div style={flush ? undefined : { padding: 'var(--space-5)' }}>{children}</div>
    </section>
  );
}
