'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminSecurityKey } from '@/components/AdminSecurityKey';
import { UserMenu } from '@/components/UserMenu';
import type { CityActivityPin, CityActivityStatus } from '@/components/CityActivityMap';
import { CityFixMark } from '@/components/CityFixMark';
import { Button } from '@/components/ui/Button';
import { MetricStrip, type MetricTone, type MetricTrend } from '@/components/ui/MetricStrip';
import { ThemeToggle } from '@/components/ThemeToggle';
import { SkeletonBlock, SkeletonStatus } from '@/components/ui/Skeleton';
import { SessionProvider, useSession } from '@/components/SessionProvider';
import { ICONS } from '@/lib/ui/icon-map';
import { DHAKA_CENTER } from '@/lib/geo/constants';
import { MAP_STATUS_COLORS } from '@/lib/ui/map-colors';
import { t, type Language } from '@/lib/i18n/keys';
import { formatDayLabel } from '@/lib/format/datetime';
import { todayInProductZone } from '@/lib/format/clock';
import type { SerializedTicket } from '@/lib/serializers/ticket';

const CityActivityMap = dynamic(() => import('@/components/CityActivityMap'), {
  ssr: false,
  loading: () => <SkeletonBlock style={{ width: '100%', height: '100%', minHeight: 262 }} />,
});

const LANG_KEY = 'cityfix.preferred_language.v1';
const ADMIN_MAP_COLORS = MAP_STATUS_COLORS;
const RANGE_OPTIONS = [7, 30, 90] as const;
const DAY_MS = 86_400_000;

interface AdminIdentity {
  cityId: string;
  name: string | null;
}

interface AdminCity {
  id: string;
  name: string;
  nameBn: string | null;
}

interface AdminCrewUser {
  id: string;
  role: string;
  status: string;
}

interface AdminDashboardPayload {
  tickets: SerializedTicket[];
  previousTickets: SerializedTicket[];
  crewUsers: AdminCrewUser[];
  cityName: string;
}

interface MetricDefinition {
  key: 'total' | 'progress' | 'resolved' | 'pending';
  color: string;
  soft: string;
  icon: keyof typeof ICONS;
  current: number;
  previous: number;
  spark: number[];
}

function countStatus(tickets: SerializedTicket[], key: MetricDefinition['key']) {
  if (key === 'total') return tickets.length;
  if (key === 'progress') return tickets.filter((ticket) => ticket.status === 'routed' || ticket.status === 'in_progress').length;
  if (key === 'resolved') return tickets.filter((ticket) => ticket.status === 'resolved' || ticket.status === 'closed').length;
  return tickets.filter((ticket) => ticket.status === 'submitted').length;
}

function trendFor(tickets: SerializedTicket[], key: MetricDefinition['key'], days: number) {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() - Math.min(days, 7) + 1);
  const daily = Array.from({ length: Math.min(days, 7) }, (_, index) => {
    const date = new Date(firstDay.getFullYear(), firstDay.getMonth(), firstDay.getDate() + index);
    return { date, value: 0 };
  });
  for (const ticket of tickets) {
    const created = new Date(ticket.createdAt);
    const dayIndex = daily.findIndex((day) => day.date.toDateString() === created.toDateString());
    if (dayIndex < 0) continue;
    const counts = key === 'total'
      || (key === 'progress' && (ticket.status === 'routed' || ticket.status === 'in_progress'))
      || (key === 'resolved' && (ticket.status === 'resolved' || ticket.status === 'closed'))
      || (key === 'pending' && ticket.status === 'submitted');
    if (counts) daily[dayIndex].value += 1;
  }
  return daily.map((entry) => entry.value);
}

async function fetchTicketWindow(cityId: string, from: Date, to: Date) {
  const tickets: SerializedTicket[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 8; page += 1) {
    const params = new URLSearchParams({
      cityId,
      from: from.toISOString(),
      to: to.toISOString(),
      limit: '100',
    });
    if (cursor) params.set('cursor', cursor);
    const response = await fetch(`/api/v1/admin/tickets?${params.toString()}`, { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`tickets_${response.status}`);
    const payload = (await response.json()) as { tickets: SerializedTicket[]; nextCursor: string | null };
    tickets.push(...payload.tickets);
    if (!payload.nextCursor || payload.nextCursor === cursor) break;
    cursor = payload.nextCursor;
  }
  return tickets;
}

/**
 * Turn a metric definition into a MetricStrip figure.
 *
 * The delta against the previous period rides with the value, not
 * below it in its own block: it is a qualifier on the number, and
 * the strip's supporting cells are already busy with the label and
 * the value. The sign is carried by an ARROW beside the percentage
 * and never by the colour alone, because a rising ticket count is
 * not a good thing.
 */
function metricFigure(metric: MetricDefinition, lang: Language) {
  const titleKey = `admin.dashboard.metric.${metric.key}` as const;
  const delta = metric.previous === 0
    ? null
    : Math.round(((metric.current - metric.previous) / metric.previous) * 100);
  const trend: MetricTrend = delta !== null && delta < 0 ? 'down' : 'up';
  // A rising count is only good for "resolved"; everywhere else more
  // tickets means more outstanding work.
  const trendTone: MetricTone = metric.key === 'resolved'
    ? (delta !== null && delta < 0 ? 'danger' : 'success')
    : (delta !== null && delta < 0 ? 'success' : 'warning');
  return {
    key: metric.key,
    label: t(titleKey, null, lang),
    value: metric.current.toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-US'),
    ...(delta === null ? {} : { trend, trendValue: `${Math.abs(delta)}%`, trendTone }),
    hint: t('admin.dashboard.metric.compare', null, lang),
  };
}

function TrendChart({ tickets, lang, days }: { tickets: SerializedTicket[]; lang: Language; days: number }) {
  /*
   * The axis window is read from the PINNED clock and the PRODUCT
   * timezone.
   *
   * `new Date()` slid the window with the wall clock, so the labels
   * moved every day and the visual baseline could never hold. And
   * `new Date(y, m, d)` builds the day in the RUNTIME's calendar, so a
   * UTC server could label "today in Dhaka" as yesterday — shifting the
   * whole window by one day and mis-bucketing the tickets in it.
   */
  const labels = useMemo(() => {
    const count = Math.min(days, 7);
    const today = todayInProductZone();
    return Array.from({ length: count }, (_, index) => {
      const date = new Date(Date.UTC(today.year, today.month, today.day - count + index + 1, 12, 0, 0));
      return formatDayLabel(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), lang);
    });
  }, [days, lang]);
  const series = [
    { key: 'total' as const, label: t('admin.dashboard.trend.total', null, lang), color: 'var(--color-primary)' },
    { key: 'resolved' as const, label: t('admin.dashboard.trend.resolved', null, lang), color: 'var(--color-status-resolved)' },
    { key: 'pending' as const, label: t('admin.dashboard.trend.pending', null, lang), color: 'var(--color-status-submitted)' },
  ];
  const values = series.map((entry) => trendFor(tickets, entry.key, days));
  const max = Math.max(1, ...values.flat());
  const pointPath = (line: number[]) => line.map((value, index) => {
    const x = line.length <= 1 ? 280 : 34 + (index / (line.length - 1)) * 480;
    const y = 140 - (value / max) * 112;
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');

  return (
    <div className="admin-trend-content">
      <div className="admin-chart-legend">
        {series.map((entry) => <span key={entry.key}><i style={{ background: entry.color }} />{entry.label}</span>)}
      </div>
      <svg className="admin-trend-svg" viewBox="0 0 560 180" role="img" aria-label={t('admin.dashboard.trend', null, lang)}>
        {[28, 56, 84, 112, 140].map((y) => <line key={y} x1="34" x2="540" y1={y} y2={y} stroke="var(--color-border)" strokeWidth="1" />)}
        {series.map((entry, index) => <path key={entry.key} d={pointPath(values[index])} fill="none" stroke={entry.color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />)}
        {labels.map((label, index) => {
          const x = labels.length <= 1 ? 280 : 34 + (index / (labels.length - 1)) * 480;
          return <text key={label} x={x} y="165" textAnchor="middle" fill="var(--color-ink-secondary)" fontSize="11">{label}</text>;
        })}
      </svg>
      <span className="sr-only">{t('admin.dashboard.range', null, lang)}: {days}</span>
    </div>
  );
}

function CrewActivity({ crewUsers, lang }: { crewUsers: AdminCrewUser[]; lang: Language }) {
  const crew = crewUsers.filter((user) => user.role === 'crew');
  const active = crew.filter((user) => user.status === 'active').length;
  const invited = crew.filter((user) => user.status === 'invited').length;
  const unavailable = crew.filter((user) => user.status === 'disabled').length;
  const percentage = crew.length ? Math.round((active / crew.length) * 100) : 0;
  return (
    <div className="admin-crew-content">
      <div className="admin-donut" style={{ background: `conic-gradient(var(--color-status-resolved) 0 ${percentage}%, var(--color-surface-raised) ${percentage}% 100%)` }} role="img" aria-label={`${percentage}% ${t('admin.dashboard.crew.active', null, lang)}`}>
        <span><strong>{percentage}%</strong><small>{t('admin.dashboard.crew.active', null, lang)}</small></span>
      </div>
      <ul className="admin-crew-stats">
        <li><i className="is-active" /><strong>{active}</strong><span lang={lang}>{t('admin.dashboard.crew.active', null, lang)}</span></li>
        <li><i className="is-invited" /><strong>{invited}</strong><span lang={lang}>{t('admin.dashboard.crew.invited', null, lang)}</span></li>
        <li><i className="is-unavailable" /><strong>{unavailable}</strong><span lang={lang}>{t('admin.dashboard.crew.unavailable', null, lang)}</span></li>
      </ul>
    </div>
  );
}

function ReportRow({ ticket, lang }: { ticket: SerializedTicket; lang: Language }) {
  const title = ticket.note?.trim().split('\n')[0] || ticket.categoryName || ticket.categoryId;
  const location = (lang === 'bn' ? ticket.locationLabelBn : ticket.locationLabel) || ticket.wardName || ticket.cityName || '—';
  const photo = ticket.photoUrls[0];
  const statusKey = `status.${ticket.status}`;
  const age = formatAge(ticket.createdAt, lang);
  return (
    <Link href={`/admin/tickets/${ticket.id}`} className="admin-report-row">
      <span className="admin-report-thumb">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" loading="lazy" />
        ) : <ICONS.reports.icon size={21} weight="regular" aria-hidden />}
      </span>
      <span className="admin-report-description">
        <strong lang={lang}>{title}</strong>
        <small lang={lang}><ICONS.mapPin.icon size={12} aria-hidden />{location}</small>
      </span>
      <span className={`admin-status-chip status-${ticket.status}`} lang={lang}>{t(statusKey, null, lang)}</span>
      <time className="admin-report-age">{age}</time>
    </Link>
  );
}

function formatAge(value: string, lang: Language) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  const relative = new Intl.RelativeTimeFormat(lang === 'bn' ? 'bn-BD' : 'en', { numeric: 'auto', style: 'narrow' });
  if (minutes < 60) return relative.format(-minutes, 'minute');
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return relative.format(-hours, 'hour');
  return relative.format(-Math.floor(hours / 24), 'day');
}

export default function AdminHomePage() {
  /*
   * The /admin dashboard is the one surface that does NOT use
   * `<AppShell>` — it renders its own header. It still needs the shared
   * session, because its header mounts a `<UserMenu>` (which used to
   * fetch `/api/auth/status` on its own) and the page's own gate
   * fetched it a second time.
   *
   * Wrapping it in the same `SessionProvider` collapses those two
   * requests into one.
   */
  return (
    <SessionProvider>
      <AdminHomePageInner />
    </SessionProvider>
  );
}

function AdminHomePageInner() {
  const [lang, setLang] = useState<Language>('en');
  const [identity, setIdentity] = useState<AdminIdentity | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [rangeDays, setRangeDays] = useState<(typeof RANGE_OPTIONS)[number]>(30);
  const [dashboard, setDashboard] = useState<AdminDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [operationsOpen, setOperationsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  // The shared session — one request for the whole page.
  const { authenticated, session } = useSession();

  const toggleLanguage = useCallback(() => {
    const next: Language = lang === 'bn' ? 'en' : 'bn';
    setLang(next);
    try {
      window.localStorage.setItem(LANG_KEY, next);
    } catch {
      // Keep the current page language if browser storage is unavailable.
    }
    window.dispatchEvent(new CustomEvent('cityfix:language-updated', { detail: next }));
  }, [lang]);

  useEffect(() => {
    try {
      const savedLanguage = window.localStorage.getItem(LANG_KEY);
      if (savedLanguage === 'bn' || savedLanguage === 'en') setLang(savedLanguage);
    } catch {
      // Use the design's English presentation by default.
    }
    const onLanguageUpdated = (event: Event) => {
      const next = (event as CustomEvent<Language>).detail;
      if (next === 'bn' || next === 'en') setLang(next);
    };
    window.addEventListener('cityfix:language-updated', onLanguageUpdated);
    return () => window.removeEventListener('cityfix:language-updated', onLanguageUpdated);
  }, []);

  // Auth check — reads the shared session. The admin dashboard used to
  // fetch `/api/auth/status` itself AND the header's `<UserMenu>` (and
  // the `ThemeToggle` sibling) fetched it again.
  useEffect(() => {
    if (authenticated === null) return; // still loading
    if (!authenticated) {
      window.location.href = '/login?next=%2Fadmin';
      return;
    }
    if (session?.role !== 'admin') {
      window.location.href = '/';
      return;
    }
    setIdentity({ cityId: session.cityId, name: session.name });
    setSignedIn(true);
  }, [authenticated, session]);

  const loadDashboard = useCallback(async () => {
    if (!identity) return;
    setLoading(true);
    setError(false);
    const to = new Date();
    const from = new Date(to.getTime() - rangeDays * DAY_MS);
    const previousFrom = new Date(from.getTime() - rangeDays * DAY_MS);
    try {
      const [tickets, previousTickets, cityResponse, usersResponse] = await Promise.all([
        fetchTicketWindow(identity.cityId, from, to),
        fetchTicketWindow(identity.cityId, previousFrom, from),
        fetch('/api/v1/admin/cities', { credentials: 'same-origin' }),
        fetch(`/api/v1/admin/cities/${encodeURIComponent(identity.cityId)}/users`, { credentials: 'same-origin' }),
      ]);
      const [cityPayload, usersPayload] = await Promise.all([
        cityResponse.ok ? cityResponse.json() as Promise<{ cities: AdminCity[] }> : Promise.resolve({ cities: [] }),
        usersResponse.ok ? usersResponse.json() as Promise<{ users: AdminCrewUser[] }> : Promise.resolve({ users: [] }),
      ]);
      const city = cityPayload.cities.find((candidate) => candidate.id === identity.cityId);
      setDashboard({
        tickets,
        previousTickets,
        crewUsers: usersPayload.users ?? [],
        cityName: city ? (lang === 'bn' ? city.nameBn || city.name : city.name) : '',
      });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [identity, rangeDays, lang]);

  useEffect(() => {
    if (signedIn === true) void loadDashboard();
  }, [signedIn, loadDashboard]);

  const tickets = dashboard?.tickets ?? [];
  const previousTickets = dashboard?.previousTickets ?? [];
  const metrics: MetricDefinition[] = [
    { key: 'total', color: 'var(--color-primary)', soft: 'var(--color-primary-soft)', icon: 'reports', current: countStatus(tickets, 'total'), previous: countStatus(previousTickets, 'total'), spark: trendFor(tickets, 'total', rangeDays) },
    { key: 'progress', color: 'var(--color-status-in-progress)', soft: 'var(--color-status-in-progress-soft)', icon: 'statusInProgress', current: countStatus(tickets, 'progress'), previous: countStatus(previousTickets, 'progress'), spark: trendFor(tickets, 'progress', rangeDays) },
    { key: 'resolved', color: 'var(--color-status-resolved)', soft: 'var(--color-status-resolved-soft)', icon: 'statusResolved', current: countStatus(tickets, 'resolved'), previous: countStatus(previousTickets, 'resolved'), spark: trendFor(tickets, 'resolved', rangeDays) },
    { key: 'pending', color: 'var(--color-status-submitted)', soft: 'var(--color-status-submitted-soft)', icon: 'statusSubmitted', current: countStatus(tickets, 'pending'), previous: countStatus(previousTickets, 'pending'), spark: trendFor(tickets, 'pending', rangeDays) },
  ];
  const filteredReports = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const recent = [...tickets].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
    if (!needle) return recent;
    return recent.filter((ticket) => [ticket.id, ticket.note, ticket.locationLabel, ticket.locationLabelBn, ticket.categoryName].some((value) => value?.toLocaleLowerCase().includes(needle)));
  }, [query, tickets]);
  const pins: CityActivityPin[] = useMemo(() => tickets.slice(0, 500).map((ticket) => ({
    id: ticket.id,
    lat: ticket.locationLat,
    lng: ticket.locationLng,
    status: ticket.status as CityActivityStatus,
  })), [tickets]);
  const activeCity = identity?.cityId;
  const userHref = activeCity ? `/admin/cities/${activeCity}/users?role=all` : '/admin/cities';
  const crewHref = activeCity ? `/admin/cities/${activeCity}/users?role=crew` : '/admin/cities';
  const settingsHref = activeCity ? `/admin/cities/${activeCity}/setup` : '/admin/cities';
  const pendingCount = metrics.find((metric) => metric.key === 'pending')?.current ?? 0;

  return (
    <div data-app-shell data-shell-role="staff" className={`admin-dashboard${navOpen ? ' admin-dashboard--nav-open' : ''}`}>
      <button type="button" className="admin-dashboard-scrim" aria-label={t('ui.action.close', null, lang)} onClick={() => setNavOpen(false)} />
      <aside className="admin-dashboard-sidebar">
        <Link href="/admin" className="admin-brand" aria-label="CityFix dashboard">
          <CityFixMark size={48} />
          <span><strong>CityFix</strong><small>A Cleaner, Safer City</small></span>
        </Link>
        <nav id="admin-dashboard-sidebar" className="admin-side-nav" aria-label={t('shell.nav.label', null, lang)}>
          <Link href="/admin" className="admin-side-link is-active" aria-current="page" onClick={() => setNavOpen(false)}>
            <ICONS.home.icon size={21} weight="bold" aria-hidden /><span>{t('admin.dashboard.nav.dashboard', null, lang)}</span>
          </Link>
          <Link href="/admin/tickets" className="admin-side-link" onClick={() => setNavOpen(false)}>
            <ICONS.reports.icon size={21} aria-hidden /><span>{t('admin.dashboard.nav.reports', null, lang)}</span>
          </Link>
          <Link href={crewHref} className="admin-side-link" onClick={() => setNavOpen(false)}>
            <ICONS.users.icon size={21} aria-hidden /><span>{t('admin.dashboard.nav.crews', null, lang)}</span>
          </Link>
          <button type="button" className={`admin-side-link admin-side-toggle${operationsOpen ? ' is-open' : ''}`} onClick={() => setOperationsOpen((open) => !open)} aria-expanded={operationsOpen}>
            <ICONS.queue.icon size={21} aria-hidden /><span>{t('admin.dashboard.nav.operations', null, lang)}</span><ICONS.chevronDown.icon className="admin-side-chevron" size={16} aria-hidden />
          </button>
          {operationsOpen ? (
            <div className="admin-side-subnav">
              <Link href="/admin/tickets" onClick={() => setNavOpen(false)}>{t('admin.dashboard.nav.reports', null, lang)}</Link>
              <Link href="/admin/audit" onClick={() => setNavOpen(false)}>{t('admin.dashboard.action.status', null, lang)}</Link>
            </div>
          ) : null}
          <Link href={userHref} className="admin-side-link" onClick={() => setNavOpen(false)}>
            <ICONS.users.icon size={21} aria-hidden /><span>{t('admin.dashboard.nav.users', null, lang)}</span>
          </Link>
          <Link href={settingsHref} className="admin-side-link" onClick={() => setNavOpen(false)}>
            <ICONS.city.icon size={21} aria-hidden /><span>{t('admin.dashboard.nav.settings', null, lang)}</span>
          </Link>
        </nav>
        <div className="admin-sidebar-account">
          <UserMenu lang={lang} variant="sidebar" />
        </div>
      </aside>

      <div className="admin-dashboard-main">
        <header className="admin-dashboard-topbar">
          <button type="button" className="admin-mobile-menu" aria-label={t('shell.nav.open', null, lang)} aria-expanded={navOpen} aria-controls="admin-dashboard-sidebar" onClick={() => setNavOpen(true)}>
            <ICONS.menu.icon size={21} aria-hidden />
          </button>
          <label className="admin-searchbox">
            <ICONS.search.icon size={20} aria-hidden />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('admin.dashboard.search', null, lang)} aria-label={t('admin.dashboard.search', null, lang)} />
          </label>
          <div className="admin-topbar-actions">
            <div className="admin-notification-wrap">
              <button type="button" className={`admin-notification-button${notificationsOpen ? ' is-open' : ''}`} aria-label={t('admin.dashboard.notifications', null, lang)} aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen((open) => !open)}>
                <ICONS.notifications.icon size={21} aria-hidden />
                {pendingCount > 0 ? <span>{pendingCount > 9 ? '9+' : pendingCount}</span> : null}
              </button>
              {notificationsOpen ? (
                <div className="admin-notification-popover">
                  <strong>{t('admin.dashboard.notifications', null, lang)}</strong>
                  <p>{pendingCount ? `${pendingCount} ${t('admin.dashboard.metric.pending', null, lang).toLowerCase()}` : t('admin.dashboard.empty_reports', null, lang)}</p>
                  <Link href="/admin/tickets?status=submitted" onClick={() => setNotificationsOpen(false)}>{t('admin.dashboard.view_all', null, lang)} <ICONS.forward.icon size={14} aria-hidden /></Link>
                </div>
              ) : null}
            </div>
            <label className="admin-range-select">
              <ICONS.city.icon size={18} aria-hidden />
              <span className="sr-only">{t('admin.dashboard.range', null, lang)}</span>
              <select value={rangeDays} onChange={(event) => setRangeDays(Number(event.target.value) as (typeof RANGE_OPTIONS)[number])}>
                {RANGE_OPTIONS.map((days) => <option key={days} value={days}>{t(`admin.dashboard.range.${days}` as const, null, lang)}</option>)}
              </select>
              <ICONS.chevronDown.icon size={14} aria-hidden />
            </label>
            <button type="button" className="admin-language-toggle" onClick={toggleLanguage} aria-label={t('welcome.lang.toggle', null, lang)} title={t('welcome.lang.toggle', null, lang)}>
              <span className="admin-language-long">{t('welcome.lang.toggle', null, lang)}</span>
              <span className="admin-language-short" aria-hidden="true">{lang === 'bn' ? 'EN' : 'বাং'}</span>
            </button>
            <ThemeToggle lang={lang} />
          </div>
        </header>

        <main className="admin-dashboard-content">
          <div className="admin-dashboard-heading">
            <div>
              <h1 lang={lang}>{t('admin.dashboard.title', null, lang)}</h1>
              <p lang={lang}>{dashboard?.cityName ? `${t('admin.dashboard.subtitle', null, lang)} · ${dashboard.cityName}` : t('admin.dashboard.subtitle', null, lang)}</p>
            </div>
            {loading ? <span className="admin-refresh-indicator" role="status">{t('admin.dashboard.loading', null, lang)}</span> : null}
          </div>

          {error ? (
            <div className="admin-dashboard-error" role="alert">
              <span>{t('admin.dashboard.error', null, lang)}</span>
              <Button variant="secondary" size="sm" onClick={() => void loadDashboard()}>{t('ui.action.retry', null, lang)}</Button>
            </div>
          ) : null}

          {/* The total report count is the headline the admin opens the
              dashboard for; the three status counts are its breakdown.
              A MetricStrip says so. Four equal cards said "these four
              numbers matter equally" and hid the breakdown inside a
              wall of identical boxes. */}
          <section className="admin-kpi-grid" aria-label={t('admin.home.title', null, lang)}>
            {loading && !dashboard ? (
              <SkeletonStatus lang={lang} className="admin-dashboard-kpi-skeleton">
                {/* The skeleton mirrors the strip's shape: a wide
                    headline block and a row of figure blocks, not four
                    identical cards. A skeleton that does not match the
                    loaded layout makes the page jump on arrival. */}
                <div className="metric-strip">
                  <div className="admin-kpi-skeleton admin-kpi-skeleton-headline">
                    <SkeletonBlock style={{ width: '52%', height: 13 }} />
                    <SkeletonBlock style={{ width: '58%', height: 28 }} />
                    <SkeletonBlock style={{ width: '72%', height: 12 }} />
                  </div>
                  <div className="metric-strip-figures admin-kpi-skeleton">
                    {metrics.slice(1).map((metric) => (
                      <div key={metric.key} className="metric-strip-figure">
                        <SkeletonBlock style={{ width: '62%', height: 12 }} />
                        <SkeletonBlock style={{ width: '44%', height: 22 }} />
                      </div>
                    ))}
                  </div>
                </div>
              </SkeletonStatus>
            ) : (
              <MetricStrip
                lang={lang}
                className="admin-metric-strip"
                ariaLabel={t('admin.home.title', null, lang)}
                headline={metricFigure(metrics[0], lang)}
                figures={metrics.slice(1).map((metric) => metricFigure(metric, lang))}
                data-testid="admin-metric-strip"
                data-testid-headline="admin-dashboard-kpi-total"
              />
            )}
          </section>

          <section className="admin-dashboard-middle">
            <article className="admin-dashboard-panel admin-map-panel">
              <header className="admin-panel-heading">
                <h2><ICONS.map.icon size={20} weight="bold" aria-hidden />{t('admin.dashboard.map', null, lang)}</h2>
                <div className="admin-map-legend">
                  <span><i className="legend-new" />{t('admin.dashboard.map.new', null, lang)}</span>
                  <span><i className="legend-progress" />{t('admin.dashboard.map.progress', null, lang)}</span>
                  <span><i className="legend-resolved" />{t('admin.dashboard.map.resolved', null, lang)}</span>
                </div>
              </header>
              <div className="admin-map-view">
                {loading && !dashboard ? <SkeletonStatus lang={lang} className="admin-map-data-skeleton"><SkeletonBlock style={{ width: '100%', height: 262, borderRadius: 0 }} /></SkeletonStatus> : <CityActivityMap pins={pins} center={DHAKA_CENTER} pinColors={ADMIN_MAP_COLORS} />}
              </div>
            </article>

            <article className="admin-dashboard-panel admin-recent-panel">
              <header className="admin-panel-heading">
                <h2><ICONS.queue.icon size={20} weight="bold" aria-hidden />{t('admin.dashboard.recent', null, lang)}</h2>
                <Link href="/admin/tickets" className="admin-view-all">{t('admin.dashboard.view_all', null, lang)} <ICONS.forward.icon size={16} aria-hidden /></Link>
              </header>
              <div className="admin-reports-list">
                {loading && !tickets.length ? <SkeletonStatus lang={lang} className="admin-reports-skeleton">{[0, 1, 2, 3].map((item) => <div key={item}><SkeletonBlock style={{ width: 54, height: 40, borderRadius: 8 }} /><span><SkeletonBlock style={{ width: '70%', height: 13 }} /><SkeletonBlock style={{ width: '46%', height: 11 }} /></span></div>)}</SkeletonStatus> : filteredReports.length ? filteredReports.map((ticket) => <ReportRow key={ticket.id} ticket={ticket} lang={lang} />) : (
                  <p className="admin-reports-empty">{t('admin.dashboard.empty_reports', null, lang)}</p>
                )}
              </div>
            </article>
          </section>

          <section className="admin-dashboard-bottom">
            <article className="admin-dashboard-panel admin-trend-panel">
              <header className="admin-panel-heading"><h2><ICONS.performance.icon size={20} weight="bold" aria-hidden />{t('admin.dashboard.trend', null, lang)}</h2></header>
              {loading && !tickets.length ? <SkeletonStatus lang={lang} className="admin-chart-skeleton"><SkeletonBlock style={{ width: '100%', height: 190 }} /></SkeletonStatus> : <TrendChart tickets={tickets} lang={lang} days={rangeDays} />}
            </article>
            <article className="admin-dashboard-panel admin-crew-panel">
              <header className="admin-panel-heading"><h2><ICONS.users.icon size={20} weight="bold" aria-hidden />{t('admin.dashboard.crew_activity', null, lang)}</h2></header>
              {loading && !dashboard ? <SkeletonStatus lang={lang} className="admin-crew-skeleton">{[0, 1, 2].map((item) => <div key={item}><SkeletonBlock style={{ width: 42, height: 42, borderRadius: '50%' }} /><SkeletonBlock style={{ width: '50%', height: 13 }} /><SkeletonBlock style={{ width: 46, height: 13 }} /></div>)}</SkeletonStatus> : <CrewActivity crewUsers={dashboard?.crewUsers ?? []} lang={lang} />}
            </article>
            <article className="admin-dashboard-panel admin-actions-panel">
              <header className="admin-panel-heading"><h2><ICONS.newReport.icon size={20} weight="bold" aria-hidden />{t('admin.dashboard.quick_actions', null, lang)}</h2></header>
              <div className="admin-quick-actions">
                <QuickAction href="/admin/tickets" icon={ICONS.reports.icon} tone="blue" title={t('admin.dashboard.action.reports', null, lang)} hint={t('admin.dashboard.action.reports_hint', null, lang)} />
                <QuickAction href={crewHref} icon={ICONS.users.icon} tone="purple" title={t('admin.dashboard.action.crews', null, lang)} hint={t('admin.dashboard.action.crews_hint', null, lang)} />
                <QuickAction href="/admin/audit" icon={ICONS.audit.icon} tone="green" title={t('admin.dashboard.action.status', null, lang)} hint={t('admin.dashboard.action.status_hint', null, lang)} />
                <QuickAction href={settingsHref} icon={ICONS.city.icon} tone="neutral" title={t('admin.dashboard.action.settings', null, lang)} hint={t('admin.dashboard.action.settings_hint', null, lang)} />
              </div>
            </article>
          </section>

          <details className="admin-security-details">
            <summary>{t('admin.dashboard.security', null, lang)}</summary>
            <AdminSecurityKey lang={lang} />
          </details>
        </main>
      </div>
    </div>
  );
}

function QuickAction({ href, icon: Icon, tone, title, hint }: { href: string; icon: typeof ICONS.reports.icon; tone: 'blue' | 'purple' | 'green' | 'neutral'; title: string; hint: string }) {
  return (
    <Link href={href} className={`admin-quick-action tone-${tone}`}>
      <Icon size={20} weight="bold" aria-hidden />
      <span><strong>{title}</strong><small>{hint}</small></span>
    </Link>
  );
}
