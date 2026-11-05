'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CityFixMark } from '@/components/CityFixMark';
import { UserMenu } from '@/components/UserMenu';
import { ICONS } from '@/lib/ui/icon-map';
import { t, type Language } from '@/lib/i18n/keys';

type ShellRole = 'citizen' | 'staff';
type Item = { href: string; label: string; icon: keyof typeof ICONS; exact?: boolean; roleFilter?: string };

const LANG_KEY = 'cityfix.preferred_language.v1';

export function RoleSidebar({ role = 'citizen', onNavigate }: { role?: ShellRole; onNavigate: () => void }) {
  const pathname = usePathname() ?? '/';
  const [lang, setLang] = useState<Language>('bn');
  const [userRole, setUserRole] = useState<string | null>(null);
  const [cityId, setCityId] = useState<string | null>(null);
  const [userListFilter, setUserListFilter] = useState<string | null>(null);
  const surface = pathname.startsWith('/admin') ? 'admin' : pathname.startsWith('/dispatcher') ? 'dispatcher' : pathname.startsWith('/crew') ? 'crew' : (pathname.startsWith('/reports') || pathname.startsWith('/profile') || pathname.startsWith('/feed')) && userRole && userRole !== 'citizen' ? userRole : role === 'staff' && userRole ? userRole : 'citizen';

  useEffect(() => {
    try {
      const value = window.localStorage.getItem(LANG_KEY);
      if (value === 'bn' || value === 'en') setLang(value);
    } catch { /* keep Bangla fallback */ }
    const onLanguageUpdated = (event: Event) => {
      const value = (event as CustomEvent<Language>).detail;
      if (value === 'bn' || value === 'en') setLang(value);
    };
    window.addEventListener('cityfix:language-updated', onLanguageUpdated);
    const syncUserListFilter = () => setUserListFilter(new URLSearchParams(window.location.search).get('role') ?? 'all');
    const onUserListFilterUpdated = (event: Event) => {
      const roleFilter = (event as CustomEvent<string>).detail;
      if (roleFilter === 'crew' || roleFilter === 'all' || roleFilter === 'dispatcher' || roleFilter === 'supervisor') setUserListFilter(roleFilter);
    };
    syncUserListFilter();
    window.addEventListener('popstate', syncUserListFilter);
    window.addEventListener('cityfix:admin-users-filter-updated', onUserListFilterUpdated);
    void fetch('/api/auth/status', { credentials: 'same-origin' })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { setUserRole(data?.session?.role ?? null); setCityId(data?.session?.cityId ?? null); })
      .catch(() => { setUserRole(null); setCityId(null); });
    return () => {
      window.removeEventListener('cityfix:language-updated', onLanguageUpdated);
      window.removeEventListener('popstate', syncUserListFilter);
      window.removeEventListener('cityfix:admin-users-filter-updated', onUserListFilterUpdated);
    };
  }, []);

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
      { href: '/crew', label: t('shell.nav.dashboard', null, lang), icon: 'home', exact: true },
      { href: '/reports', label: t('shell.nav.reports', null, lang), icon: 'reports' },
      { href: '/profile', label: t('shell.nav.profile', null, lang), icon: 'users' },
    ];
    return [
      { href: '/home', label: t('shell.nav.dashboard', null, lang), icon: 'home', exact: true },
      { href: '/reports', label: t('shell.nav.reports', null, lang), icon: 'reports' },
      { href: '/report/location', label: t('shell.nav.new_report', null, lang), icon: 'newReport' },
      { href: '/feed', label: t('shell.nav.notifications', null, lang), icon: 'notifications' },
      { href: '/profile', label: t('shell.nav.profile', null, lang), icon: 'users' },
    ];
  }, [cityId, lang, surface]);

  return (
    <aside id="role-sidebar" className="role-sidebar">
      <Link href={surface === 'admin' ? '/admin' : surface === 'dispatcher' ? '/dispatcher' : surface === 'crew' ? '/crew' : '/home'} className="role-sidebar-brand" aria-label="CityFix">
        <CityFixMark size={44} />
        <span><strong>CityFix</strong><small>{surface === 'dispatcher' ? 'Dispatcher Portal' : t('shell.brand.tagline', null, lang)}</small></span>
      </Link>
      <nav className="role-sidebar-nav" aria-label={t('shell.nav.label', null, lang)}>
        {items.map((item) => {
          const path = item.href.split('?')[0];
          const isUserList = pathname.includes('/users');
          const active = item.roleFilter
            ? isUserList && userListFilter === item.roleFilter
            : item.exact
              ? pathname === path
              : pathname === path || pathname.startsWith(`${path}/`);
          const Icon = ICONS[item.icon].icon;
          return (
            <Link key={`${item.href}:${item.label}`} href={item.href} onClick={() => {
              if (item.roleFilter) setUserListFilter(item.roleFilter);
              onNavigate();
            }} className={`role-sidebar-link${active ? ' is-active' : ''}`} aria-current={active ? 'page' : undefined}>
              <Icon size={20} weight={active ? 'bold' : 'regular'} aria-hidden />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="role-sidebar-footer">
        <div className="role-sidebar-tagline">{t('shell.brand.tagline', null, lang)}</div>
        <UserMenu lang={lang} variant="sidebar" />
      </div>
      <span className="role-sidebar-cityline" aria-hidden="true" />
      <span className="role-sidebar-cityline role-sidebar-cityline--front" aria-hidden="true" />
    </aside>
  );
}
