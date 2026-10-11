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
 * Map: v1 uses an SVG placeholder with city wards and pin overlays. v1.1
 * will swap to MapLibre with OSM raster tiles. The placeholder mirrors
 * the welcome page's pin-map art so the visual story is consistent.
 */

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { t, type Language } from '@/lib/i18n/keys';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
  applyStatusFilter,
  filterToI18nKey,
  type StatusFilter,
} from '@/lib/home-filter';

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
  const previousIdsRef = useRef<Set<string>>(new Set());

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
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const statusRes = await fetch('/api/auth/status', { credentials: 'include' });
        const status = (await statusRes.json()) as { authenticated: boolean; session?: { userId: string } };
        if (cancelled) return;
        if (!status.authenticated) {
          setSignedIn(false);
          return;
        }
        setSignedIn(true);
        setUserId(status.session?.userId ?? null);

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
  }, []);

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

  function toggleLang() {
    const next: Language = lang === 'bn' ? 'en' : 'bn';
    setLang(next);
    try {
      window.localStorage.setItem(LANG_KEY, next);
    } catch {
      // ignore
    }
  }

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
        style={{
          minHeight: '100vh',
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

  const cityDisplay =
    bootstrap && (bootstrap.city.nameBn || bootstrap.city.name);
  const wardDisplay = bootstrap?.ward
    ? lang === 'bn'
      ? bootstrap.ward.nameBn ?? bootstrap.ward.name
      : bootstrap.ward.name
    : '';

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-surface-page)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Top bar */}
      <header
        style={{
          height: 64,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 var(--space-5)',
          background: 'var(--color-surface-card)',
          borderBottom: '1px solid var(--color-border)',
          gap: 'var(--space-3)',
        }}
      >
        {/* Brand + city */}
        <Link
          href="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            textDecoration: 'none',
            color: 'var(--color-ink)',
            flexShrink: 1,
            maxWidth: '38%',
          }}
        >
          <span
            aria-hidden
            style={{
              width: 12,
              height: 12,
              background: 'var(--color-primary)',
              borderRadius: '50%',
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: 'var(--text-body-lg)',
              fontWeight: 'var(--weight-bold)',
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
          >
            CityFix
          </span>
          {cityDisplay && (
            <span
              className="home-brand-city"
              lang={lang}
              style={{
                fontSize: 'var(--text-body-sm)',
                color: 'var(--color-ink-secondary)',
                marginLeft: 'var(--space-1)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
                flexShrink: 1,
              }}
            >
              · {cityDisplay}
            </span>
          )}
        </Link>

        {/* Primary Report CTA */}
        <button
          type="button"
          onClick={() => router.push('/report/location')}
          lang={lang}
          style={{
            height: 48,
            padding: '0 var(--space-5)',
            background: 'var(--color-primary)',
            color: 'var(--color-on-primary)',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--text-body)',
            fontWeight: 'var(--weight-semibold)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          <PlusIcon />
          {t('home.topbar.report', null, lang)}
        </button>

        {/* Right cluster */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            flexShrink: 0,
          }}
        >
          <Link
            href="/reports"
            lang={lang}
            style={{
              fontSize: 'var(--text-body-sm)',
              color: 'var(--color-ink-secondary)',
              textDecoration: 'none',
              fontWeight: 'var(--weight-semibold)',
            }}
          >
            {t('home.topbar.my_reports', null, lang)}
          </Link>
          <button
            type="button"
            onClick={toggleLang}
            aria-label="Toggle language"
            style={{
              padding: 'var(--space-1) var(--space-3)',
              background: 'transparent',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-pill)',
              color: 'var(--color-ink-secondary)',
              fontSize: 'var(--text-caption)',
              fontWeight: 'var(--weight-semibold)',
              cursor: 'pointer',
            }}
          >
            {t('welcome.lang.toggle', null, lang)}
          </button>
          <ThemeToggle lang={lang} variant="compact" />
          <Avatar />
        </div>
      </header>

      {/* Two-region content area */}
      <div className="home-grid">
        {/* Map region */}
        <div
          style={{
            position: 'relative',
            background: 'var(--color-surface-raised)',
            overflow: 'hidden',
            minHeight: 320,
          }}
        >
          <CityMap tickets={tickets} lang={lang} />

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

function Avatar() {
  return (
    <div
      aria-label="Profile menu"
      style={{
        width: 32,
        height: 32,
        borderRadius: '50%',
        background: 'var(--color-primary-soft, #e6f2ee)',
        color: 'var(--color-primary)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 'var(--text-caption)',
        fontWeight: 'var(--weight-bold)',
        cursor: 'pointer',
      }}
    >
      র
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
      <div
        aria-hidden
        style={{
          width: 56,
          height: 56,
          borderRadius: 'var(--radius-sm)',
          background:
            item.photoUrls[0] && item.photoUrls[0].startsWith('http')
              ? `url(${item.photoUrls[0]}) center/cover`
              : 'linear-gradient(135deg, var(--color-primary-soft, #e6f2ee) 0%, var(--color-surface-raised) 100%)',
          flexShrink: 0,
        }}
      />
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
  const map: Record<ActivityItem['status'], { bg: string; fg: string }> = {
    submitted: { bg: 'var(--color-status-submitted, #fff4e6)', fg: 'var(--color-warning, #b58410)' },
    routed: { bg: 'var(--color-status-routed, #e7f5ff)', fg: 'var(--color-primary)' },
    in_progress: { bg: 'var(--color-status-in-progress, #e7f5ff)', fg: 'var(--color-primary)' },
    resolved: { bg: 'var(--color-status-resolved, #e6fcf5)', fg: 'var(--color-success, #1f7a3f)' },
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

function CityMap({ tickets, lang }: { tickets: ActivityItem[]; lang: Language }) {
  // Project lat/lng to SVG coords. Center on Dhaka (DHAKA_CENTER); scale
  // a small window (~0.04° ≈ 4.4km) to fit the 600x360 viewbox.
  const center = { lat: 23.8069, lng: 90.3687 };
  const window = 0.06;
  const project = (lat: number, lng: number) => {
    const x = ((lng - center.lng) / window + 0.5) * 600;
    const y = ((center.lat - lat) / window + 0.5) * 360;
    return { x, y };
  };
  return (
    <svg
      viewBox="0 0 600 360"
      preserveAspectRatio="xMidYMid slice"
      style={{ width: '100%', height: '100%', display: 'block' }}
      role="presentation"
    >
      <defs>
        <pattern
          id="cf-grid"
          width="40"
          height="40"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 40 0 L 0 0 0 40"
            fill="none"
            stroke="var(--color-border)"
            strokeWidth="0.5"
          />
        </pattern>
      </defs>
      <rect width="600" height="360" fill="var(--color-surface-raised)" />
      <rect width="600" height="360" fill="url(#cf-grid)" />
      {/* A few "roads" / "blocks" for context */}
      <g stroke="var(--color-border)" strokeWidth="3" fill="none" opacity="0.6">
        <path d="M0 90 L600 90" />
        <path d="M0 180 L600 180" />
        <path d="M0 270 L600 270" />
        <path d="M150 0 L150 360" />
        <path d="M300 0 L300 360" />
        <path d="M450 0 L450 360" />
      </g>
      {/* Pins */}
      {tickets.map((t) => {
        const p = project(t.locationLat, t.locationLng);
        const color =
          t.status === 'resolved'
            ? 'var(--color-status-resolved, #1f7a3f)'
            : t.status === 'in_progress' || t.status === 'routed'
              ? 'var(--color-status-in-progress, #1f6feb)'
              : 'var(--color-primary)';
        return (
          <g key={t.id} transform={`translate(${p.x}, ${p.y})`}>
            <circle r="10" fill="white" stroke={color} strokeWidth="2" />
            <circle r="4" fill={color} />
          </g>
        );
      })}
      {/* Hint text */}
      <text
        x="20"
        y="340"
        fontSize="12"
        fill="var(--color-ink-tertiary)"
      >
        {lang === 'bn' ? 'মিরপুর ১০' : 'Mirpur 10'}
      </text>
    </svg>
  );
}