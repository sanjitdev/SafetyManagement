/**
 * /register/* layout — citizen registration surface.
 *
 * Renders chromeless: no global AppHeader. The registration card
 * owns its own visual frame and the page background extends
 * edge-to-edge so the citizen lands on a clean auth surface.
 */

import type { ReactNode } from 'react';

export default function RegisterLayout({ children }: { children: ReactNode }) {
  return (
    <div
      data-app-shell
      data-shell-role="public"
      style={{
        minHeight: '100dvh',
        background: 'var(--color-surface-page)',
        color: 'var(--color-ink)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {children}
    </div>
  );
}
