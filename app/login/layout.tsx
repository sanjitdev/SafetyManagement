/**
 * /login/* layout — citizen auth surface.
 *
 * Renders chromeless: no global AppHeader. The login card owns its
 * own visual frame and the page background extends edge-to-edge so
 * the citizen lands on a clean auth surface, not a sub-route of the
 * shell. The lang/theme controls are not needed here (the page
 * reads the persisted language and the form is the only focus).
 */

import type { ReactNode } from 'react';

export default function LoginLayout({ children }: { children: ReactNode }) {
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
