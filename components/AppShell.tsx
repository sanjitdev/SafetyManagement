/**
 * AppShell (components/AppShell.tsx).
 *
 * Single wrapper component that gives every page the same chrome:
 *   - 64dp (desktop) / 56dp (mobile) sticky `<AppHeader>` at the top.
 *   - A scrollable `<main>` below it whose inner regions are free
 *     to use `overflow: auto` without producing a page-level scrollbar.
 *
 * Pages pass the desired header `role` (citizen / staff / public)
 * and their `children` render inside the main slot. The shell
 * is a server-compatible React component — the header handles its
 * own client islands (theme toggle, user menu) internally.
 *
 * The `data-app-shell` attribute on the root gives the test
 * harness a stable selector for "is the global chrome present?"
 * regardless of the page route.
 */

import type { ReactNode } from 'react';
import { AppHeader } from './AppHeader';
import type { Language } from '@/lib/i18n/keys';

interface AppShellProps {
  children: ReactNode;
  /** Active UI language. Forwarded to the header so the lang toggle is consistent. */
  lang?: Language;
  /** Citizen = show inline nav + Report CTA. Staff = role-tinted brand. Public = brand only. */
  role?: 'citizen' | 'staff' | 'public';
  /** Optional: force the signed-in state (skips the header's /api/auth/status probe). */
  signedIn?: boolean | null;
  /**
   * Optional sub-header (used by /report/* to slot its step indicator
   * strip *below* the global header without competing with it).
   * The sub-header shares the sticky offset of the global header
   * and renders inside the main scroll region so it scrolls
   * away with the page content.
   */
  subHeader?: ReactNode;
}

export function AppShell({
  children,
  lang,
  role = 'public',
  signedIn,
  subHeader,
}: AppShellProps) {
  return (
    <div
      data-app-shell
      data-shell-role={role}
      style={{
        minHeight: '100dvh',
        background: 'var(--color-surface-page)',
        color: 'var(--color-ink)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden', // inner regions own their own scroll
      }}
    >
      <AppHeader lang={lang} role={role} signedIn={signedIn} />
      {subHeader}
      <main
        style={{
          flex: '1 1 auto',
          minHeight: 0, // critical: lets inner regions scroll
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
        }}
      >
        {children}
      </main>
    </div>
  );
}
