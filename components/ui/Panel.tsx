/**
 * Panel — a titled region with optional header and footer slots.
 *
 * The structural counterpart to `Card`. A Panel says "this is a
 * region of the page with a heading"; a Card says "this is a
 * self-contained item". Panels are used for the filter rail, the
 * detail pane and the chart regions on the dispatcher and admin
 * consoles.
 */

import type { ReactNode } from 'react';

export interface PanelProps {
  /** Panel heading. */
  title?: ReactNode;
  /** Secondary text under the heading. */
  description?: ReactNode;
  /** Actions rendered on the right of the heading row. */
  actions?: ReactNode;
  /** Panel body. */
  children: ReactNode;
  /** Content pinned to the bottom of the panel (a sticky action bar). */
  footer?: ReactNode;
  /** Removes the body padding. */
  flush?: boolean;
  /** Optional class passthrough. */
  className?: string;
  /** Test hook. */
  'data-testid'?: string;
}

export function Panel({
  title,
  description,
  actions,
  children,
  footer,
  flush = false,
  className,
  'data-testid': testId,
}: PanelProps) {
  return (
    <section
      data-testid={testId}
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-surface-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-card)',
        overflow: 'hidden',
      }}
    >
      {title || description || actions ? (
        <header
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 'var(--space-3)',
            padding: 'var(--space-4) var(--space-5)',
            borderBottom: '1px solid var(--color-border)',
            flexShrink: 0,
          }}
        >
          <div style={{ minWidth: 0 }}>
            {title ? (
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
            ) : null}
            {description ? (
              <p
                style={{
                  margin: 'var(--space-1) 0 0',
                  fontSize: 'var(--text-caption)',
                  color: 'var(--color-ink-secondary)',
                  lineHeight: 'var(--leading-snug)',
                }}
              >
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}>
              {actions}
            </div>
          ) : null}
        </header>
      ) : null}

      <div style={{ flex: '1 1 auto', minHeight: 0, padding: flush ? undefined : 'var(--space-5)' }}>
        {children}
      </div>

      {footer ? (
        <footer
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 'var(--space-2)',
            padding: 'var(--space-3) var(--space-4)',
            borderTop: '1px solid var(--color-border)',
            background: 'var(--color-surface-raised)',
            flexShrink: 0,
          }}
        >
          {footer}
        </footer>
      ) : null}
    </section>
  );
}
