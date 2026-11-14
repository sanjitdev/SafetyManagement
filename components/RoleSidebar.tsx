'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CityFixMark } from '@/components/CityFixMark';
import { useSession } from '@/components/SessionProvider';
import { useLanguage } from '@/components/useLanguage';
import { ICONS } from '@/lib/ui/icon-map';
import { t } from '@/lib/i18n/keys';

type ShellRole = 'citizen' | 'staff';
type Item = {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  exact?: boolean;
  roleFilter?: string;
  /**
   * The item is the CURRENT step of the report flow — render it as an
   * inert active marker instead of a link (see `inReportFlow`).
   */
  inert?: boolean;
};

export function RoleSidebar({
  role = 'citizen',
  surface: surfaceProp,
  onNavigate,
  inReportFlow = false,
}: {
  role?: ShellRole;
  /**
   * The staff surface to render when the shared session is unavailable
   * (a route whose layout resolved the session on the server and so
   * disabled the `SessionProvider`).
   */
  surface?: 'crew' | 'dispatcher' | 'admin';
  onNavigate: () => void;
  /**
   * True when the sidebar is rendered inside the report flow
   * (`/report/*`).
   *
   * The citizen nav's third item is "New report" → `/report/location`,
   * which is the FIRST step of the very flow the citizen is in the
   * middle of. Rendered as a link it offers a control that silently
   * throws the citizen back to step 1 mid-report. Inside the flow the
   * item therefore renders as an inert ACTIVE marker: the reader can
   * still see that "New report" is where they are, and it cannot
   * restart the flow.
   */
  inReportFlow?: boolean;
}) {
  const pathname = usePathname() ?? '/';
  // The shared hook owns the language — it reads the stored preference
  // during the first render and subscribes to `cityfix:language-updated`,
  // so the sidebar and the page body always show the same language.
  const { lang } = useLanguage();
  const [userListFilter, setUserListFilter] = useState<string | null>(null);
  // The `tab` query of the CURRENT URL.
  //
  // This deliberately does NOT use `useSearchParams()`. That hook
  // forces a client-side-rendering bailout on every route that
  // renders the sidebar, which broke static prerendering for the
  // whole app (Next.js: "useSearchParams() should be wrapped in a
  // suspense boundary"). The sidebar is shared chrome, so its
  // hook cost every page — and a `<Suspense>` boundary inside a
  // client component does not satisfy Next.js's check.
  //
  // Instead, the tab is read from `window.location.search` and
  // re-read whenever the route changes. The PAGE that owns the tab
  // also publishes it over a `cityfix:profile-tab-updated`
  // event, so a client-side Link navigation updates the highlight
  // immediately — the same pattern the admin users `role` filter
  // already uses below.
  const [currentTab, setCurrentTab] = useState<string | null>(null);
  // The sidebar used to fetch `/api/auth/status` on mount to learn the
  // session's role and cityId. It now reads the shared session, which
  // the AppShell's `SessionProvider` already resolved with a single
  // request — one fewer redundant round-trip per page load.
  const { session } = useSession();
  const userRole = session?.role ?? null;
  const cityId = session?.cityId ?? null;
  const surface = pathname.startsWith('/admin') ? 'admin' : pathname.startsWith('/dispatcher') ? 'dispatcher' : pathname.startsWith('/crew') ? 'crew' : (pathname.startsWith('/reports') || pathname.startsWith('/profile') || pathname.startsWith('/feed')) && userRole && userRole !== 'citizen' ? userRole : role === 'staff' ? (userRole ?? surfaceProp ?? 'crew') : 'citizen';

  useEffect(() => {
    const syncUserListFilter = () => setUserListFilter(new URLSearchParams(window.location.search).get('role') ?? 'all');
    const onUserListFilterUpdated = (event: Event) => {
      const roleFilter = (event as CustomEvent<string>).detail;
      if (roleFilter === 'crew' || roleFilter === 'all' || roleFilter === 'dispatcher' || roleFilter === 'supervisor') setUserListFilter(roleFilter);
    };
    // The page that owns the `tab` query publishes the active tab.
    // This is what makes a client-side Link navigation (which does
    // NOT fire `popstate`) update the highlight.
    const onProfileTabUpdated = (event: Event) => {
      const tab = (event as CustomEvent<string | null>).detail;
      setCurrentTab(tab ?? null);
    };
    syncUserListFilter();
    window.addEventListener('popstate', syncUserListFilter);
    window.addEventListener('cityfix:admin-users-filter-updated', onUserListFilterUpdated);
    window.addEventListener('cityfix:profile-tab-updated', onProfileTabUpdated);
    return () => {
      window.removeEventListener('popstate', syncUserListFilter);
      window.removeEventListener('cityfix:admin-users-filter-updated', onUserListFilterUpdated);
      window.removeEventListener('cityfix:profile-tab-updated', onProfileTabUpdated);
    };
  }, []);

  // Re-read the `tab` query whenever the route changes. This
  // covers a direct load of `/profile?tab=settings` and a
  // back/forward navigation (the `popstate` listener above only
  // covers the admin `role` filter).
  useEffect(() => {
    setCurrentTab(new URLSearchParams(window.location.search).get('tab'));
  }, [pathname]);

  const items = useMemo<Item[]>(() => {
    if (surface === 'admin') return [
      { href: '/admin', label: t('shell.nav.dashboard', null, lang), icon: 'home', exact: true },
      { href: '/admin/tickets', label: t('shell.nav.reports', null, lang), icon: 'reports' },
      { href: cityId ? `/admin/cities/${encodeURIComponent(cityId)}/users?role=crew` : '/admin/cities', label: t('shell.nav.crews', null, lang), icon: 'crew', roleFilter: 'crew' },
      { href: '/admin/audit', label: t('shell.nav.operations', null, lang), icon: 'queue' },
      { href: cityId ? `/admin/cities/${encodeURIComponent(cityId)}/users?role=all` : '/admin/cities', label: t('shell.nav.users', null, lang), icon: 'users', roleFilter: 'all' },
      { href: cityId ? `/admin/cities/${encodeURIComponent(cityId)}/setup` : '/admin/cities', label: t('shell.nav.settings', null, lang), icon: 'city' },
    ];
    if (surface === 'dispatcher') return [
      { href: '/dispatcher', label: t('shell.nav.dashboard', null, lang), icon: 'home', exact: true },
      { href: '/reports', label: t('shell.nav.reports', null, lang), icon: 'reports' },
      { href: '/dispatcher/map', label: t('shell.nav.assignments', null, lang), icon: 'queue' },
      { href: '/dispatcher/performance', label: t('shell.nav.crews', null, lang), icon: 'crew' },
      { href: '/dispatcher/monitor', label: t('shell.nav.notifications', null, lang), icon: 'notifications' },
      { href: '/dispatcher/dedup', label: t('dispatcher.dashboard.duplicates', null, lang), icon: 'city' },
    ];
    if (surface === 'crew') return [
      { href: '/crew', label: t('shell.nav.my_jobs', null, lang), icon: 'home', exact: true },
      { href: '/crew/map', label: t('shell.nav.map', null, lang), icon: 'map' },
      { href: '/crew/activity', label: t('shell.nav.activity_log', null, lang), icon: 'queue' },
      { href: '/crew/safety-guide', label: t('shell.nav.safety_guide', null, lang), icon: 'security' },
      { href: '/profile', label: t('shell.nav.profile', null, lang), icon: 'users' },
      { href: '/profile?tab=settings', label: t('shell.nav.settings', null, lang), icon: 'city' },
    ];
    return [
      { href: '/home', label: t('shell.nav.dashboard', null, lang), icon: 'home', exact: true },
      { href: '/reports', label: t('shell.nav.reports', null, lang), icon: 'reports' },
      {
        href: '/report/location',
        label: t('shell.nav.new_report', null, lang),
        icon: 'newReport',
        // Inside the report flow this item is the CURRENT step — a
        // link would restart the flow and throw the citizen back to
        // step 1. It renders as an inert active marker instead.
        inert: inReportFlow,
      },
      { href: '/feed', label: t('shell.nav.notifications', null, lang), icon: 'notifications' },
      { href: '/profile', label: t('shell.nav.profile', null, lang), icon: 'users' },
    ];
  }, [cityId, inReportFlow, lang, surface]);

  // The `tab` query claimed by a sibling nav item, if any. `/profile`
  // and `/profile?tab=settings` are two destinations on the same path,
  // so the bare-path item must stand down when the URL carries the
  // query its sibling claims.
  const claimedTab = useMemo(() => {
    for (const item of items) {
      const query = item.href.split('?')[1];
      if (query) return new URLSearchParams(query).get('tab');
    }
    return null;
  }, [items]);

  return (
    <aside id="role-sidebar" className="role-sidebar">
      <Link href={surface === 'admin' ? '/admin' : surface === 'dispatcher' ? '/dispatcher' : surface === 'crew' ? '/crew' : '/home'} className="role-sidebar-brand" aria-label="CityFix">
        <CityFixMark />
        <span><strong>CityFix</strong><small>{surface === 'dispatcher' ? 'Dispatcher Portal' : t('shell.brand.tagline', null, lang)}</small></span>
      </Link>
      <nav className="role-sidebar-nav" aria-label={t('shell.nav.label', null, lang)}>
        {items.map((item) => {
          const [itemPath, itemQuery] = item.href.split('?');
          const isUserList = pathname.includes('/users');
          // A nav item that carries its own query string is a DISTINCT
          // destination from its bare-path sibling: `/profile` and
          // `/profile?tab=settings` are two different pages. Matching
          // on the path alone would light up BOTH at once.
          //
          // So the `tab` query is compared on both sides of the pair:
          //   - an item WITH a query is active only when the URL
          //     carries that exact query;
          //   - an item WITHOUT a query is active only when the URL
          //     does NOT carry a query that a sibling claims.
          // A URL with no `tab` at all activates the bare-path item,
          // which is the common case.
          const itemTab = itemQuery ? new URLSearchParams(itemQuery).get('tab') : null;
          const queryMatches = itemTab
            ? currentTab === itemTab
            : claimedTab === null || currentTab !== claimedTab;
          const active = item.roleFilter
            ? isUserList && userListFilter === item.roleFilter
            : item.exact
              ? pathname === itemPath
              : (pathname === itemPath || pathname.startsWith(`${itemPath}/`)) && queryMatches;
          const Icon = ICONS[item.icon].icon;
          const key = `${item.href}:${item.label}`;
          // An inert item is the CURRENT step of the report flow. It
          // renders as a non-interactive active marker: the reader sees
          // where they are, and clicking it cannot restart the flow.
          if (item.inert) {
            return (
              <span
                key={key}
                className="role-sidebar-link role-sidebar-link--current"
                aria-current="page"
              >
                <Icon size={20} weight="bold" aria-hidden />
                <span>{item.label}</span>
              </span>
            );
          }
          return (
            <Link key={key} href={item.href} onClick={() => {
              if (item.roleFilter) setUserListFilter(item.roleFilter);
              onNavigate();
            }} className={`role-sidebar-link${active ? ' is-active' : ''}`} aria-current={active ? 'page' : undefined}>
              <Icon size={20} weight={active ? 'bold' : 'regular'} aria-hidden />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <span className="role-sidebar-cityline" aria-hidden="true" />
      <span className="role-sidebar-cityline role-sidebar-cityline--front" aria-hidden="true" />
    </aside>
  );
}
