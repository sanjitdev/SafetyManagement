/**
 * 1.13 City Activity Feed (full list, power-user view)
 *
 * Per UX spec 1.13-city-activity-feed:
 *   - Top bar (same surface as the rest of the app) with brand +
 *     breadcrumb "What's happening" and a Home link + avatar.
 *   - Centered content column (max-width 720px) on a calm neutral surface.
 *   - Sticky filter chip row: All / Open / In progress / Resolved /
 *     Resolved today.
 *   - Vertical feed list of 20 most-recent items.
 *   - Polling every 15s for new items; new items get a "new" badge
 *     that fades after 5s.
 *   - Empty state: "No reports" + "Be the first to report" link.
 *   - Auth required.
 *   - Bilingual copy.
 *
 * Phase B (2026-10-04): web-first, 1440×900 + 1024×768 viewports.
 *
 * Bolt 008-012: this page used to call /api/report/bootstrap (a
 * citizen-only endpoint) and /api/v1/activity (auth-required) as two
 * separate fetches. That worked for citizens but 403'd for staff
 * roles (admin / dispatcher / crew) and surfaced the misleading
 * "Could not load feed" error. The page now calls the
 * role-agnostic /api/v1/activity/public endpoint, which:
 *   - reads the session cookie internally and defaults to the
 *     session's city (so an admin in city_chittagong sees Chattogram
 *     tickets, not Dhaka North)
 *   - returns the city's category list in the same response, so we
 *     no longer need a second fetch to /api/report/bootstrap
 *   - is the same data source the public landing page uses
 *
 * The page still gates on /api/auth/status to render the "Please sign
 * in" empty state for unauthenticated visitors, but a 200 from
 * /auth/status is now the only auth check on this page.
 */

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { t, type Language } from '@/lib/i18n/keys';

const LANG_KEY = 'cityfix.preferred_language.v1';
const POLL_INTERVAL_MS = 15_000;
const PAGE_SIZE = 20;

type StatusFilter = 'all' | 'open' | 'in_progress' | 'resolved' | 'resolved_today';

interface ActivityItem {
  id: string;
  status: 'submitted' | 'routed' | 'in_progress' | 'resolved' | 'closed' | 'cancelled';
  categoryId: string;
  categoryName?: string;
  categoryNameBn?: string;
  wardId: string;
  wardName?: string;
  wardNameBn?: string;
  note: string | null;
  photoUrls: string[];
  createdAt: string;
}

interface CategoryRow {
  id: string;
  name: string;
  nameBn: string | null;
}

interface ActivityResponse {
  tickets: Array<{
    id: string;
    status: ActivityItem['status'];
    categoryId: string;
    wardId: string;
    wardName?: string | null;
    wardNameBn?: string | null;
    note: string | null;
    photoUrls: string[];
    createdAt: string;
  }>;
  categories: CategoryRow[];
}

function formatAge(iso: string, lang: Language): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return lang === 'bn' ? 'এইমাত্র' : 'just now';
  if (minutes < 60) return lang === 'bn' ? `${minutes} মিনিট আগে` : `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return lang === 'bn' ? `${hours} ঘণ্টা আগে` : `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return lang === 'bn' ? `${days} দিন আগে` : `${days} day ago`;
}

function isResolvedToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate() &&
    d.getHours() >= 0
  );
}

export default function FeedPage() {
  const [lang, setLang] = useState<Language>('bn');
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  // Bolt 008-012: the citywide activity endpoint now returns the
  // category list alongside the tickets, so the page only needs a
  // single fetch for both. The `bootstrap` + `ward` state are gone —
  // the per-row ward label is already on each ticket (Bolt 008-011).
  // We cache the categories in a ref (not state) so the polling effect
  // doesn't re-fire on every category refresh; the row-rendering path
  // reads it synchronously inside the render.
  const categoriesRef = useRef<CategoryRow[]>([]);
  const [tickets, setTickets] = useState<ActivityItem[]>([]);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const previousIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LANG_KEY);
      if (stored === 'en' || stored === 'bn') setLang(stored);
    } catch {
      // ignore
    }
  }, []);

  // Auth check (Bolt 008-012): the /api/auth/status endpoint is the
  // only auth check on this page now. The /api/v1/activity/public
  // endpoint that powers the list is auth-agnostic — it works for
  // unauthenticated visitors too, but we still gate the page on sign-in
  // because the /feed surface is positioned as "your city's activity",
  // not as the public landing.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const statusRes = await fetch('/api/auth/status', { credentials: 'include' });
      const status = (await statusRes.json()) as { authenticated: boolean };
      if (cancelled) return;
      setSignedIn(status.authenticated);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Polling — Bolt 008-012: switched from the auth-required
  // /api/v1/activity to the role-agnostic /api/v1/activity/public.
  // The public endpoint reads the session cookie internally and
  // defaults to the session's cityId, so an admin in Chattogram
  // sees Chattogram tickets without a query string. The endpoint
  // also returns the city's `categories` list, which we cache in
  // a ref and use to translate `categoryId` → `categoryName` per row.
  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    let timer: number | null = null;
    const fetchActivity = async () => {
      try {
        const res = await fetch(`/api/v1/activity/public?limit=50`, {
          credentials: 'include',
        });
        if (cancelled) return;
        if (!res.ok) {
          setError('feed.error');
          setLoading(false);
          return;
        }
        const data = (await res.json()) as ActivityResponse;
        if (cancelled) return;
        // Cache the categories list. The list is the same for every
        // poll within a session; only the tickets change. The ref
        // avoids re-running this effect on every refresh.
        if (data.categories && data.categories.length > 0) {
          categoriesRef.current = data.categories;
        }
        const cats = categoriesRef.current;
        const items: ActivityItem[] = data.tickets.map((t) => {
          const cat = cats.find((c) => c.id === t.categoryId);
          return {
            id: t.id,
            status: t.status,
            categoryId: t.categoryId,
            categoryName: cat?.name,
            categoryNameBn: cat?.nameBn ?? cat?.name,
            wardId: t.wardId,
            // Bolt 008-011: the public serializer already returns
            // wardName / wardNameBn per ticket, so we don't need the
            // citizen-only bootstrap to resolve the row's ward label.
            wardName: t.wardName ?? undefined,
            wardNameBn: t.wardNameBn ?? t.wardName ?? undefined,
            note: t.note,
            photoUrls: t.photoUrls,
            createdAt: t.createdAt,
          };
        });
        setTickets(items);
        setError(null);
        setLoading(false);
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
          setError('feed.error');
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
  }, [signedIn]);

  const filtered = useMemo(() => {
    if (filter === 'all') return tickets;
    if (filter === 'open')
      return tickets.filter((t) => t.status === 'submitted' || t.status === 'routed');
    if (filter === 'in_progress')
      return tickets.filter((t) => t.status === 'in_progress');
    if (filter === 'resolved')
      return tickets.filter((t) => t.status === 'resolved' || t.status === 'closed');
    if (filter === 'resolved_today')
      return tickets.filter(
        (t) => (t.status === 'resolved' || t.status === 'closed') && isResolvedToday(t.createdAt),
      );
    return tickets;
  }, [tickets, filter]);

  const visible = useMemo(() => filtered.slice(0, page * PAGE_SIZE), [filtered, page]);

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
            {t('feed.signin_required', null, lang)}
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

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-surface-page)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* No page-level top bar: the global <AppHeader> is provided by
          the /feed layout's <AppShell role="citizen"> wrapper. It
          already renders the brand, the inline Home / Activity / My
          reports nav (with the current "Activity" link highlighted),
          the primary Report CTA, the language toggle, the theme
          toggle, and the user menu. The previous hand-rolled header
          duplicated every one of those affordances and stacked on top
          of the global one. */}

      {/* Content column */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          justifyContent: 'center',
          padding: 'var(--space-6) var(--space-5)',
        }}
      >
        <div style={{ width: '100%', maxWidth: 720 }}>
          {/* In-content page title block. This is the <h1> + subtitle
              for the feed, NOT a second <header> landmark — the only
              <header> on the page is the global AppHeader above. A
              <div> here is correct per the same a11y reasoning the
              /reports list page uses. */}
          <div style={{ marginBottom: 'var(--space-5)' }}>
            <h1
              lang={lang}
              style={{
                fontSize: 'var(--text-h1)',
                fontWeight: 'var(--weight-semibold)',
                color: 'var(--color-ink)',
                margin: '0 0 var(--space-2)',
                letterSpacing: 'var(--tracking-tight)',
              }}
            >
              {t('feed.title', null, lang)}
            </h1>
            <p
              lang={lang}
              style={{
                fontSize: 'var(--text-body)',
                color: 'var(--color-ink-secondary)',
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              {t('feed.subtitle', null, lang)}
            </p>
          </div>

          {/* Sticky filter chip row */}
          <div
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 1,
              padding: 'var(--space-3) 0',
              background: 'var(--color-surface-page)',
              borderBottom: '1px solid var(--color-border)',
              display: 'flex',
              gap: 'var(--space-2)',
              flexWrap: 'wrap',
              marginBottom: 'var(--space-4)',
            }}
          >
            {(
              [
                ['all', 'home.filter.all'],
                ['open', 'feed.filter.open'],
                ['in_progress', 'home.filter.in_progress'],
                ['resolved', 'home.filter.resolved'],
                ['resolved_today', 'feed.filter.resolved_today'],
              ] as Array<[StatusFilter, string]>
            ).map(([key, i18nKey]) => (
              <FilterChip
                key={key}
                active={filter === key}
                onClick={() => {
                  setFilter(key);
                  setPage(1);
                }}
                lang={lang}
              >
                {t(i18nKey, null, lang)}
              </FilterChip>
            ))}
          </div>

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
              {t('feed.error', null, lang)}
            </p>
          ) : filtered.length === 0 ? (
            <EmptyState lang={lang} />
          ) : (
            <>
              <ul
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-2)',
                }}
              >
                {visible.map((item) => (
                  <li key={item.id}>
                    <FeedRow item={item} lang={lang} isNew={newIds.has(item.id)} />
                  </li>
                ))}
              </ul>
              {visible.length < filtered.length && (
                <div
                  style={{
                    marginTop: 'var(--space-4)',
                    textAlign: 'center',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setPage((p) => p + 1)}
                    lang={lang}
                    style={{
                      padding: 'var(--space-2) var(--space-5)',
                      background: 'transparent',
                      color: 'var(--color-primary)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-pill)',
                      fontSize: 'var(--text-body-sm)',
                      fontWeight: 'var(--weight-semibold)',
                      cursor: 'pointer',
                    }}
                  >
                    {t('feed.load_older', null, lang)}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function FilterChip({
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
        background: active ? 'var(--color-primary)' : 'var(--color-surface-card)',
        color: active ? 'var(--color-on-primary)' : 'var(--color-ink-secondary)',
        border: '1px solid',
        borderColor: active ? 'var(--color-primary)' : 'var(--color-border)',
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

function FeedRow({
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
        background: isNew ? 'var(--color-primary-soft, #e6f2ee)' : 'var(--color-surface-card)',
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
      {t(`status.${status}`, null, lang)}
    </span>
  );
}

function EmptyState({ lang }: { lang: Language }) {
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
      <p
        lang={lang}
        style={{
          fontSize: 'var(--text-h3)',
          fontWeight: 'var(--weight-semibold)',
          color: 'var(--color-ink)',
          margin: 0,
        }}
      >
        {t('feed.empty.title', null, lang)}
      </p>
      <Link
        href="/report/location"
        lang={lang}
        style={{
          fontSize: 'var(--text-body-sm)',
          color: 'var(--color-primary)',
          textDecoration: 'none',
          fontWeight: 'var(--weight-semibold)',
        }}
      >
        {t('feed.empty.be_first', null, lang)}
      </Link>
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            gap: 'var(--space-3)',
            padding: 'var(--space-3)',
            background: 'var(--color-surface-card)',
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
                width: '50%',
                height: 12,
                background: 'var(--color-surface-raised)',
                borderRadius: 4,
                marginBottom: 6,
              }}
            />
            <div
              style={{
                width: '70%',
                height: 10,
                background: 'var(--color-surface-raised)',
                borderRadius: 4,
                marginBottom: 4,
              }}
            />
            <div
              style={{
                width: '30%',
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