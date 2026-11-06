/**
 * 1.6 Home / City Activity
 *
 * Per UX spec 1.6-home-city-activity and the Phase B (2026-10-04) re-skin:
 *   - Top bar (64px): brand + city, **centered primary Report CTA**,
 *     "My reports" link, avatar.
 *   - Two-region layout:
 *       - large viewport (≥1025px): map on the left, side panel on the right
 *       - medium viewport (≤1024px): map on top, side panel below
 *   - Report CTA always in the top bar (no floating FAB).
 *   - Side panel: activity feed with status filter pills (All / New /
 *     In progress / Resolved), 20-item window, polling every 15s.
 *   - Empty state: "No reports yet" + Report CTA.
 *   - Notification prompt banner: shown once after first authenticated
 *     open if the user hasn't yet seen it.
 *   - Bilingual copy.
 *
 * Map: MapLibre GL JS + OpenStreetMap raster basemap +
 * Dhaka District polygon overlay (components/CityActivityMap.tsx).
 * Replaces the v1 SVG placeholder; pins are colored by status and
 * match the activity feed's status pills so the two surfaces read
 * as one consistent visual.
 */

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { t, type Language } from '@/lib/i18n/keys';
import {
  applyStatusFilter,
  filterToI18nKey,
  type StatusFilter,
} from '@/lib/home-filter';
import { firstRenderablePhotoUrl, thumbnailBackground } from '@/lib/format/photo-url';
import { PhotoPlaceholder } from '@/components/ui/PhotoPlaceholder';
import { useSession } from '@/components/SessionProvider';
import { ICONS } from '@/lib/ui/icon-map';
import CityActivityMap, {
  type CityActivityPin,
  type CityActivityStatus,
} from '@/components/CityActivityMap';
import { MAP_STATUS_COLORS } from '@/lib/ui/map-colors';

// DHAKA_CENTER — the home map's default focal point. Mirrors the
// same constant used by `components/MapView.tsx` (the 1.7 location
// page) and `components/DispatcherMap.tsx` (the 3.5 dispatcher
// page), so all city-facing map surfaces share one anchor.
const DHAKA_CENTER = { lat: 23.8069, lng: 90.3687 };
const HOME_MAP_COLORS: Partial<Record<CityActivityStatus, string>> = MAP_STATUS_COLORS;

const LANG_KEY = 'cityfix.preferred_language.v1';
const NOTIF_PROMPT_KEY = 'cityfix.notification_prompt_seen.v1';
const POLL_INTERVAL_MS = 15_000;

interface ActivityItem {
  id: string;
  status: 'submitted' | 'routed' | 'in_progress' | 'resolved' | 'closed' | 'cancelled';
  categoryId: string;
  categoryName?: string;
  categoryNameBn?: string;
  wardId: string;
  wardName?: string;
  wardNameBn?: string;
  locationLat: number;
  locationLng: number;
  note: string | null;
  photoUrls: string[];
  createdAt: string;
  isOwnReport: boolean;
}

interface Bootstrap {
  city: { id: string; name: string; nameBn: string | null };
  ward: { id: string; name: string; nameBn: string | null; number: number } | null;
  categories: Array<{
    id: string;
    slug: string;
    name: string;
    nameBn: string | null;
  }>;
  // Note: /api/report/bootstrap returns only the citizen's own ward
  // (`ward`, singular), not the full ward list. The home page used to
  // declare `wards` here and read it, which silently threw at runtime
  // and surfaced the "feed.error" state. We now use the citizen's own
  // ward for the row's ward label, matching v1 semantics (cross-ward
  // filing is deferred to v1.1).
}

function formatAge(iso: string, lang: Language): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) {
    return lang === 'bn' ? `${minutes} মিনিট আগে` : `${minutes} min ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return lang === 'bn' ? `${hours} ঘণ্টা আগে` : `${hours} hr ago`;
  }
  const days = Math.floor(hours / 24);
  return lang === 'bn' ? `${days} দিন আগে` : `${days} day ago`;
}

export default function HomePage() {
  const router = useRouter();
  const [lang, setLang] = useState<Language>('bn');
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [tickets, setTickets] = useState<ActivityItem[]>([]);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNotifPrompt, setShowNotifPrompt] = useState(false);
  const [showOffline, setShowOffline] = useState(false);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const previousIdsRef = useRef<Set<string>>(new Set());
  const { authenticated, session } = useSession();

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LANG_KEY);
      if (stored === 'en' || stored === 'bn') setLang(stored);
      const notifSeen = window.localStorage.getItem(NOTIF_PROMPT_KEY);
      if (!notifSeen && 'Notification' in window && Notification.permission === 'default') {
        setShowNotifPrompt(true);
      }
    } catch {
      // ignore
    }
  }, []);

  // Auth check + bootstrap
  //
  // The session comes from the shared `SessionProvider` (the AppShell
  // layout owns it), so this page does NOT issue its own
  // `/api/auth/status` request. It used to — which meant a second
  // identical request on every /home load, on top of the header's,
  // the sidebar's and the user menu's.
  useEffect(() => {
    if (authenticated === null) return; // still loading
    let cancelled = false;
    (async () => {
      try {
        if (!authenticated) {
          setSignedIn(false);
          return;
        }
        setSignedIn(true);
        setUserId(session?.userId ?? null);
        setUserName(session?.name ?? null);

        const bootRes = await fetch('/api/report/bootstrap', { credentials: 'include' });
        if (!bootRes.ok) {
          setError('home.feed.error');
          setLoading(false);
          return;
        }
        const boot = (await bootRes.json()) as Bootstrap;
        if (cancelled) return;
        setBootstrap(boot);
      } catch {
        setError('home.feed.error');
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authenticated, session]);

  // Activity polling
  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    let timer: number | null = null;
    const fetchActivity = async () => {
      try {
        const res = await fetch('/api/v1/activity?limit=20', { credentials: 'include' });
        if (cancelled) return;
        if (!res.ok) {
          setError('home.feed.error');
          setLoading(false);
          return;
        }
        const data = (await res.json()) as { tickets: Array<{
          id: string;
          status: ActivityItem['status'];
          categoryId: string;
          wardId: string;
          locationLat: number;
          locationLng: number;
          note: string | null;
          photoUrls: string[];
          createdAt: string;
          reporterId: string;
        }> };
        if (cancelled) return;
        const items: ActivityItem[] = data.tickets.map((t) => {
          const cat = bootstrap?.categories.find((c) => c.id === t.categoryId);
          // v1: surface the citizen's own ward as the row's ward label.
          const ward = bootstrap?.ward;
          return {
            id: t.id,
            status: t.status,
            categoryId: t.categoryId,
            categoryName: cat?.name,
            categoryNameBn: cat?.nameBn ?? cat?.name,
            wardId: t.wardId,
            wardName: ward?.name,
            wardNameBn: ward?.nameBn ?? ward?.name,
            locationLat: t.locationLat,
            locationLng: t.locationLng,
            note: t.note,
            photoUrls: t.photoUrls,
            createdAt: t.createdAt,
            isOwnReport: userId === t.reporterId,
          };
        });
        setTickets(items);
        setError(null);
        setLoading(false);
        // Detect new items (only on second-and-later fetches).
        const prevIds = previousIdsRef.current;
        if (prevIds.size > 0) {
          const nextNew = new Set<string>();
          for (const t of items) if (!prevIds.has(t.id)) nextNew.add(t.id);
          if (nextNew.size > 0) {
            setNewIds(nextNew);
            window.setTimeout(() => setNewIds(new Set()), 5000);
          }
        }
        previousIdsRef.current = new Set(items.map((t) => t.id));
      } catch {
        if (!cancelled) {
          setShowOffline(true);
          setLoading(false);
        }
      }
    };
    void fetchActivity();
    timer = window.setInterval(fetchActivity, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [signedIn, bootstrap, userId]);

  const filteredTickets = useMemo(
    () => applyStatusFilter(tickets, filter),
    [tickets, filter],
  );

  function acceptNotifications() {
    setShowNotifPrompt(false);
    try {
      window.localStorage.setItem(NOTIF_PROMPT_KEY, 'true');
    } catch {
      // ignore
    }
    if (typeof window !== 'undefined' && 'Notification' in window) {
      void window.Notification.requestPermission().catch(() => undefined);
    }
  }

  function dismissNotifications() {
    setShowNotifPrompt(false);
    try {
      window.localStorage.setItem(NOTIF_PROMPT_KEY, 'dismissed');
    } catch {
      // ignore
    }
  }

  // Auth gate
  if (signedIn === false) {
    return (
      <div
        className="home-page"
        style={{
          minHeight: '100%',
          background: 'var(--color-surface-page)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--space-7) var(--space-5)',
        }}
      >
        <div style={{ maxWidth: 480, textAlign: 'center' }}>
          <p
            lang={lang}
            style={{
              fontSize: 'var(--text-body-lg)',
              color: 'var(--color-ink-secondary)',
              margin: '0 0 var(--space-5)',
            }}
          >
            {t('home.signin_required', null, lang)}
          </p>
          <Link
            href="/login"
            style={{
              display: 'inline-block',
              padding: 'var(--space-3) var(--space-5)',
              background: 'var(--color-primary)',
              color: 'var(--color-on-primary)',
              borderRadius: 'var(--radius-md)',
              textDecoration: 'none',
              fontWeight: 'var(--weight-semibold)',
            }}
          >
            {t('login.cta.submit', null, lang)}
          </Link>
        </div>
      </div>
    );
  }

  const wardDisplay = bootstrap?.ward
    ? lang === 'bn'
      ? bootstrap.ward.nameBn ?? bootstrap.ward.name
      : bootstrap.ward.name
    : '';

  return (
    <div
      /*
       * `home-page` carries the dashboard's outer gutter
       * (padding + the 16px rhythm gap between regions). Without it
       * the signed-in dashboard rendered flush against the role
       * sidebar and the app header — every section started at the
       * container's content edge with zero breathing room.
       */
      className="home-page"
      style={{
        minHeight: '100%',
        background: 'var(--color-surface-page)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* No page-level top bar: the global <AppHeader> is provided by
          the /home layout's <AppShell role="citizen"> wrapper. It
          already renders the brand, the inline Home / Activity / My
          reports nav, the primary Report CTA, the language toggle,
          the theme toggle, and the user menu — every affordance the
          hand-rolled header used to provide. Keeping a second <header>
          here would create duplicate landmarks and a stacked chrome
          bar (this is the regression the previous Bolt left behind). */}

      <section className="home-dashboard-heading">
        <div>
          <h1 lang={lang}>{userName ? `${t('home.dashboard.greeting', null, lang)} ${userName}!` : t('home.dashboard.title', null, lang)}</h1>
          <p lang={lang}>{t('home.dashboard.subtitle', null, lang)}</p>
        </div>
        {wardDisplay ? <span className="home-dashboard-ward"><ICONS.mapPin.icon size={15} aria-hidden />{wardDisplay}</span> : null}
      </section>

      <section className="home-overview-grid" aria-label={t('home.dashboard.title', null, lang)}>
        <Link href="/report/location" className="home-report-action">
          <span className="home-report-action-icon"><ICONS.newReport.icon size={27} weight="bold" aria-hidden /></span>
          <span><strong>{t('home.dashboard.report', null, lang)}</strong><small>{t('home.dashboard.report_hint', null, lang)}</small></span>
          <ICONS.forward.icon className="home-report-action-arrow" size={21} aria-hidden />
        </Link>
        <OverviewMetric icon="reports" value={tickets.filter((ticket) => ticket.isOwnReport).length} label={t('home.dashboard.metric.reports', null, lang)} tone="blue" />
        <OverviewMetric icon="statusResolved" value={tickets.filter((ticket) => ticket.isOwnReport && (ticket.status === 'resolved' || ticket.status === 'closed')).length} label={t('home.dashboard.metric.resolved', null, lang)} tone="green" />
        <OverviewMetric icon="statusInProgress" value={tickets.filter((ticket) => ticket.isOwnReport && (ticket.status === 'routed' || ticket.status === 'in_progress')).length} label={t('home.dashboard.metric.progress', null, lang)} tone="amber" />
      </section>

      {/* Recent reports and live city map */}
      <div className="home-grid">
        {/* Map region */}
        <div
          className="home-map-panel"
          style={{
            position: 'relative',
            background: 'var(--color-surface-raised)',
            overflow: 'hidden',
            minHeight: 320,
          }}
        >
          <CityActivityMap
            pins={tickets.map<CityActivityPin>((t) => ({
              id: t.id,
              lat: t.locationLat,
              lng: t.locationLng,
              status: t.status,
            }))}
            center={DHAKA_CENTER}
            pinColors={HOME_MAP_COLORS}
          />

          {/* Location pill */}
          <div
            style={{
              position: 'absolute',
              left: 'var(--space-4)',
              bottom: 'var(--space-4)',
              padding: 'var(--space-2) var(--space-3)',
              background: 'var(--color-surface-card)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-pill)',
              fontSize: 'var(--text-caption)',
              color: 'var(--color-ink)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              boxShadow: '0 1px 4px rgba(0, 0, 0, 0.05)',
            }}
          >
            <span
              aria-hidden
              style={{
                width: 8,
                height: 8,
                background: 'var(--color-primary)',
                borderRadius: '50%',
              }}
            />
            <span lang={lang}>{wardDisplay || t('home.map.location_pill', null, lang)}</span>
          </div>

          {/* Offline banner overlay */}
          {showOffline && (
            <div
              lang={lang}
              style={{
                position: 'absolute',
                top: 'var(--space-3)',
                left: '50%',
                transform: 'translateX(-50%)',
                padding: 'var(--space-2) var(--space-3)',
                background: 'var(--color-warning-soft, #fdf2cf)',
                border: '1px solid var(--color-warning, #b58410)',
                borderRadius: 'var(--radius-pill)',
                fontSize: 'var(--text-caption)',
                color: 'var(--color-ink)',
              }}
            >
              {t('home.offline.banner', null, lang)}
            </div>
          )}
        </div>

        {/* Side panel — activity feed */}
        <aside
          className="home-recent-panel"
          style={{
            background: 'var(--color-surface-card)',
            borderLeft: '1px solid var(--color-border)',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          <div
            style={{
              padding: 'var(--space-4) var(--space-5)',
              borderBottom: '1px solid var(--color-border)',
              flexShrink: 0,
            }}
          >
            <h2
              lang={lang}
              style={{
                fontSize: 'var(--text-h2)',
                fontWeight: 'var(--weight-semibold)',
                color: 'var(--color-ink)',
                margin: '0 0 var(--space-1)',
              }}
            >
              {t('home.sidepanel.title', null, lang)}
            </h2>
            <p
              lang={lang}
              style={{
                fontSize: 'var(--text-caption)',
                color: 'var(--color-ink-tertiary)',
                margin: '0 0 var(--space-3)',
              }}
            >
              {t('home.sidepanel.subtitle', null, lang)}
            </p>
            {/* Filter pills */}
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              {(['all', 'submitted', 'in_progress', 'resolved'] as StatusFilter[]).map(
                (f) => (
                  <FilterPill
                    key={f}
                    active={filter === f}
                    onClick={() => setFilter(f)}
                    lang={lang}
                  >
                    {t(filterToI18nKey(f), null, lang)}
                  </FilterPill>
                ),
              )}
            </div>
          </div>

          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: 'var(--space-3) var(--space-4)',
            }}
          >
            {/* Notification prompt banner */}
            {showNotifPrompt && (
              <div
                style={{
                  padding: 'var(--space-3) var(--space-4)',
                  background: 'var(--color-primary-soft, #e6f2ee)',
                  border: '1px solid var(--color-primary)',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: 'var(--space-3)',
                }}
              >
                <p
                  lang={lang}
                  style={{
                    fontSize: 'var(--text-body-sm)',
                    color: 'var(--color-ink)',
                    margin: '0 0 var(--space-2)',
                  }}
                >
                  {t('home.notifications.banner', null, lang)}
                </p>
                <div
                  style={{
                    display: 'flex',
                    gap: 'var(--space-2)',
                    alignItems: 'center',
                  }}
                >
                  <button
                    type="button"
                    onClick={acceptNotifications}
                    lang={lang}
                    style={{
                      padding: 'var(--space-1) var(--space-3)',
                      background: 'var(--color-primary)',
                      color: 'var(--color-on-primary)',
                      border: 'none',
                      borderRadius: 'var(--radius-pill)',
                      fontSize: 'var(--text-caption)',
                      fontWeight: 'var(--weight-semibold)',
                      cursor: 'pointer',
                    }}
                  >
                    {t('home.notifications.enable', null, lang)}
                  </button>
                  <button
                    type="button"
                    onClick={dismissNotifications}
                    lang={lang}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--color-ink-secondary)',
                      fontSize: 'var(--text-caption)',
                      fontWeight: 'var(--weight-semibold)',
                      cursor: 'pointer',
                    }}
                  >
                    {t('home.notifications.not_now', null, lang)}
                  </button>
                </div>
              </div>
            )}

            {loading ? (
              <FeedSkeleton />
            ) : error ? (
              <p
                lang={lang}
                role="alert"
                style={{
                  fontSize: 'var(--text-body-sm)',
                  color: 'var(--color-danger, #c92a2a)',
                  padding: 'var(--space-4)',
                  textAlign: 'center',
                }}
              >
                {t('home.feed.error', null, lang)}
              </p>
            ) : filteredTickets.length === 0 ? (
              <EmptyState lang={lang} onReport={() => router.push('/report/location')} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {filteredTickets.map((ticket) => (
                  <ActivityCard
                    key={ticket.id}
                    item={ticket}
                    lang={lang}
                    isNew={newIds.has(ticket.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>

      <section className="home-dashboard-bottom">
        <article className="home-dashboard-panel home-dashboard-chart">
          <header><h2><ICONS.performance.icon size={19} aria-hidden />{t('home.dashboard.trend', null, lang)}</h2><span>{t('home.dashboard.recent_window', null, lang)}</span></header>
          <HomeReportTrend tickets={tickets.filter((ticket) => ticket.isOwnReport)} lang={lang} />
        </article>
        <article className="home-dashboard-panel home-help-panel">
          <span className="home-help-icon"><ICONS.info.icon size={21} aria-hidden /></span>
          <h2>{t('home.dashboard.help_title', null, lang)}</h2>
          <p>{t('home.dashboard.help_body', null, lang)}</p>
          <Link href="/reports">{t('home.dashboard.help_action', null, lang)} <ICONS.forward.icon size={16} aria-hidden /></Link>
        </article>
        <article className="home-dashboard-panel home-community-panel">
          <span className="home-community-icon"><ICONS.city.icon size={21} aria-hidden /></span>
          <h2>{t('home.dashboard.community_title', null, lang)}</h2>
          <p>{t('home.dashboard.community_body', null, lang)}</p>
          <Link href="/report/location">{t('home.dashboard.report', null, lang)} <ICONS.forward.icon size={16} aria-hidden /></Link>
        </article>
      </section>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function OverviewMetric({ icon, value, label, tone }: { icon: keyof typeof ICONS; value: number; label: string; tone: 'blue' | 'green' | 'amber' }) {
  const Icon = ICONS[icon].icon;
  return (
    <article className={`home-overview-metric tone-${tone}`}>
      <span><Icon size={23} weight="bold" aria-hidden /></span>
      <strong>{value.toLocaleString()}</strong>
      <small>{label}</small>
    </article>
  );
}

function HomeReportTrend({ tickets, lang }: { tickets: ActivityItem[]; lang: Language }) {
  const count = 7;
  const today = new Date();
  const days = Array.from({ length: count }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (count - index - 1));
    return { date, total: 0, resolved: 0 };
  });
  for (const ticket of tickets) {
    const day = days.find((entry) => entry.date.toDateString() === new Date(ticket.createdAt).toDateString());
    if (day) {
      day.total += 1;
      if (ticket.status === 'resolved' || ticket.status === 'closed') day.resolved += 1;
    }
  }
  const max = Math.max(1, ...days.map((day) => day.total));
  const points = days.map((day, index) => `${index ? 'L' : 'M'}${30 + index * 80},${126 - (day.total / max) * 100}`).join(' ');
  const resolvedPoints = days.map((day, index) => `${index ? 'L' : 'M'}${30 + index * 80},${126 - (day.resolved / max) * 100}`).join(' ');
  return (
    <div className="home-trend-chart">
      <div className="home-trend-legend"><span><i />{t('home.dashboard.metric.reports', null, lang)}</span><span><i />{t('home.dashboard.metric.resolved', null, lang)}</span></div>
      <svg viewBox="0 0 560 160" role="img" aria-label={t('home.dashboard.trend', null, lang)}>
        {[26, 51, 76, 101, 126].map((y) => <line key={y} x1="24" x2="536" y1={y} y2={y} />)}
        <path d={points} className="home-trend-line" />
        <path d={resolvedPoints} className="home-trend-line is-resolved" />
        {days.map((day, index) => <circle key={day.date.toISOString()} cx={30 + index * 80} cy={126 - (day.total / max) * 100} r="3.5" />)}
        {days.map((day, index) => <text key={`label-${index}`} x={30 + index * 80} y="151" textAnchor="middle">{day.date.toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-US', { month: 'short', day: 'numeric' })}</text>)}
      </svg>
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  children,
  lang,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  lang: Language;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      lang={lang}
      style={{
        padding: 'var(--space-1) var(--space-3)',
        background: active ? 'var(--color-primary)' : 'var(--color-surface-raised)',
        color: active ? 'var(--color-on-primary)' : 'var(--color-ink-secondary)',
        border: 'none',
        borderRadius: 'var(--radius-pill)',
        fontSize: 'var(--text-caption)',
        fontWeight: 'var(--weight-semibold)',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function ActivityCard({
  item,
  lang,
  isNew,
}: {
  item: ActivityItem;
  lang: Language;
  isNew: boolean;
}) {
  const categoryName = lang === 'bn' ? item.categoryNameBn : item.categoryName;
  const wardName = lang === 'bn' ? item.wardNameBn : item.wardName;
  /*
   * The thumbnail. `startsWith('http')` used to guard this, which
   * missed the inline `data:` URL (the DEFAULT upload path) and the
   * root-relative `/api/blob/…` path — the citizen's own photo
   * rendered as a blank gradient square.
   */
  const photoUrl = firstRenderablePhotoUrl(item.photoUrls);
  const thumbBackground = thumbnailBackground(photoUrl);
  return (
    <Link
      href={`/reports/${item.id}`}
      style={{
        display: 'flex',
        gap: 'var(--space-3)',
        padding: 'var(--space-3)',
        background: isNew ? 'var(--color-primary-soft, #e6f2ee)' : 'var(--color-surface-page)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        textDecoration: 'none',
        color: 'var(--color-ink)',
        transition: 'background 0.3s',
      }}
    >
      {thumbBackground ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl!}
          alt=""
          aria-hidden
          loading="lazy"
          style={{
            width: 56,
            height: 56,
            borderRadius: 'var(--radius-sm)',
            objectFit: 'cover',
            background: 'var(--color-surface-raised)',
            flexShrink: 0,
          }}
        />
      ) : (
        /* No renderable photo → the shared "no photo" empty state. */
        <PhotoPlaceholder size={56} lang={lang} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-2)',
            marginBottom: 'var(--space-1)',
          }}
        >
          <span
            lang={lang}
            style={{
              fontSize: 'var(--text-body-sm)',
              fontWeight: 'var(--weight-semibold)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {categoryName}
          </span>
          <StatusPill status={item.status} lang={lang} />
        </div>
        {item.note && (
          <p
            lang={lang}
            style={{
              fontSize: 'var(--text-caption)',
              color: 'var(--color-ink-secondary)',
              margin: '0 0 var(--space-1)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 1,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {item.note}
          </p>
        )}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            fontSize: 'var(--text-caption)',
            color: 'var(--color-ink-tertiary)',
          }}
        >
          {wardName && <span lang={lang}>{wardName}</span>}
          <span aria-hidden>·</span>
          <span lang={lang}>{formatAge(item.createdAt, lang)}</span>
          {isNew && (
            <span
              lang={lang}
              style={{
                marginLeft: 'auto',
                padding: '2px 6px',
                background: 'var(--color-primary)',
                color: 'var(--color-on-primary)',
                borderRadius: 'var(--radius-pill)',
                fontSize: 10,
                fontWeight: 'var(--weight-bold)',
              }}
            >
              {t('home.activity.new_badge', null, lang)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function StatusPill({ status, lang }: { status: ActivityItem['status']; lang: Language }) {
  // `*-soft` background + saturated `*-status` foreground. Using the
  // saturated token as the background made `routed` (--color-status-routed
  // === --color-primary) render as a solid blob with invisible text.
  const map: Record<ActivityItem['status'], { bg: string; fg: string }> = {
    submitted: { bg: 'var(--color-status-submitted-soft, #EDF2F7)', fg: 'var(--color-status-submitted, #718096)' },
    routed: { bg: 'var(--color-status-routed-soft, #E6F2EE)', fg: 'var(--color-status-routed, #2C5282)' },
    in_progress: { bg: 'var(--color-status-in-progress-soft, #FFFAF0)', fg: 'var(--color-status-in-progress, #B7791F)' },
    resolved: { bg: 'var(--color-status-resolved-soft, #F0F8F4)', fg: 'var(--color-status-resolved, #2F7A4F)' },
    closed: { bg: 'var(--color-surface-raised)', fg: 'var(--color-ink-tertiary)' },
    cancelled: { bg: 'var(--color-surface-raised)', fg: 'var(--color-ink-tertiary)' },
  };
  const colors = map[status];
  const key = `status.${status}`;
  return (
    <span
      lang={lang}
      style={{
        padding: '2px var(--space-2)',
        background: colors.bg,
        color: colors.fg,
        borderRadius: 'var(--radius-pill)',
        fontSize: 10,
        fontWeight: 'var(--weight-bold)',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      {t(key, null, lang)}
    </span>
  );
}

function EmptyState({ lang, onReport }: { lang: Language; onReport: () => void }) {
  return (
    <div
      style={{
        padding: 'var(--space-7) var(--space-4)',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--space-3)',
      }}
    >
      <div
        aria-hidden
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'var(--color-primary-soft, #e6f2ee)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <PlusIcon />
      </div>
      <p
        lang={lang}
        style={{
          fontSize: 'var(--text-h3)',
          fontWeight: 'var(--weight-semibold)',
          color: 'var(--color-ink)',
          margin: 0,
        }}
      >
        {t('home.empty.title', null, lang)}
      </p>
      <p
        lang={lang}
        style={{
          fontSize: 'var(--text-body-sm)',
          color: 'var(--color-ink-secondary)',
          margin: 0,
        }}
      >
        {t('home.empty.subtitle', null, lang)}
      </p>
      <button
        type="button"
        onClick={onReport}
        lang={lang}
        style={{
          padding: 'var(--space-2) var(--space-4)',
          background: 'var(--color-primary)',
          color: 'var(--color-on-primary)',
          border: 'none',
          borderRadius: 'var(--radius-md)',
          fontSize: 'var(--text-body-sm)',
          fontWeight: 'var(--weight-semibold)',
          cursor: 'pointer',
        }}
      >
        {t('home.empty.cta', null, lang)}
      </button>
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            gap: 'var(--space-3)',
            padding: 'var(--space-3)',
            background: 'var(--color-surface-page)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-surface-raised)',
            }}
          />
          <div style={{ flex: 1 }}>
            <div
              style={{
                width: '60%',
                height: 12,
                background: 'var(--color-surface-raised)',
                borderRadius: 4,
                marginBottom: 6,
              }}
            />
            <div
              style={{
                width: '40%',
                height: 10,
                background: 'var(--color-surface-raised)',
                borderRadius: 4,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// CityMap (the v1 SVG placeholder) has been retired.
// The home map is now `components/CityActivityMap.tsx`,
// a MapLibre GL JS canvas backed by the same OSM raster
// basemap + Dhaka District polygon as `MapView` (1.7) +
// `DispatcherMap` (3.5). See the project memory
// (`aidlc/spaces/default/memory/project.md →
// Corrections`, learned 2026-10-11) for the rationale.
