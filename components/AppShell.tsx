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

 'use client';

import { useState, type ReactNode } from 'react';
import { AppHeader } from './AppHeader';
import { SessionProvider } from './SessionProvider';
import type { Language } from '@/lib/i18n/keys';
import { RoleSidebar } from './RoleSidebar';

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
    /*
     * `SessionProvider` owns the single `/api/auth/status` request for
     * the whole page. The header, the role sidebar, the user menu and
     * the page's own auth gate all read the shared payload from it.
     *
     * Before this, each of those consumers fetched the session
     * independently — measured at 8 requests per page load (4 sources ×
     * React 18 StrictMode's double-invoked mount effects), each costing
     * up to 6 sequential DB round-trips. Now it is 1 request.
     *
     * `signedIn` short-circuits the probe entirely for callers that
     * already resolved the session on the server (e.g. /profile).
     */
    <SessionProvider enabled={signedIn !== true}>
      <AppShellInner
        lang={lang}
        role={role}
        signedIn={signedIn}
        subHeader={subHeader}
      >
        {children}
      </AppShellInner>
    </SessionProvider>
  );
}

function AppShellInner({
  children,
  lang,
  role,
  signedIn,
  subHeader,
}: AppShellProps) {
  const [navOpen, setNavOpen] = useState(false);

  if (role !== 'public') {
    return (
      <div className={`role-app-shell${navOpen ? ' role-app-shell--nav-open' : ''}`} data-app-shell data-shell-role={role}>
        <RoleSidebar role={role} onNavigate={() => setNavOpen(false)} />
        <button className="role-shell-scrim" type="button" aria-label="Close navigation" onClick={() => setNavOpen(false)} />
        <div className="role-app-main">
          <AppHeader lang={lang} role={role} signedIn={signedIn} compact navOpen={navOpen} onOpenNav={() => setNavOpen(true)} />
          {subHeader}
          <main className="role-app-content">{children}</main>
        </div>
      </div>
    );
  }

  return (
    <div
      data-app-shell
      data-shell-role={role}
      style={{
        // `height` (not just `minHeight`) is what makes the shell a
        // BOUNDED box. With only `minHeight`, the shell GREW to fit
        // its content (1175px on /admin/tickets) while `overflow:
        // 'hidden'` prevented it from scrolling — so everything below
        // the fold was clipped and unreachable.
        //
        // Capping the shell at the viewport and letting <main> scroll
        // is the containment model the AppShell header comment always
        // described: "a scrollable <main> below it whose inner
        // regions are free to use overflow: auto without producing a
        // page-level scrollbar."
        //
        // `100dvh` (not `100vh`) so mobile browser chrome (the URL
        // bar) is accounted for.
        height: '100dvh',
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
          minHeight: 0, // critical: lets the region scroll
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          // The shell sets `overflow: hidden` so the STICKY header and
          // the shell's own chrome never produce a viewport scrollbar.
          //
          // That made <main> the scroll region: without this, a page
          // with no inner `overflow: auto` container grew the shell
          // past the viewport and the content below the fold was
          // CLIPPED — unreachable by scrolling. The admin surfaces hit
          // this hardest (the users, adoption and tickets pages all
          // measured taller than a 900px viewport).
          //
          // `overflowY: 'auto'` + `overscrollBehavior: 'contain'` keeps
          // the scroll INSIDE <main>, so the sticky header stays put
          // and the page never gets a viewport-level scrollbar. Pages
          // that DO have their own inner scroll container (the
          // dispatcher / crew landing pages) are unaffected — their
          // inner region consumes the wheel first.
          overflowY: 'auto',
          overscrollBehavior: 'contain',
        }}
      >
        {children}
      </main>
    </div>
  );
}
