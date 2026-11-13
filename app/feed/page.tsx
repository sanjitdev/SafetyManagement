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
 *
 * VISUAL RECOMPOSITION (mockup 12-feed.html)
 * --------------------------------------------
 * This page was re-composed to match the approved visual mockup
 * `design-artifacts/D-Design-System/01-Visual-Design/mockups/12-feed.html`.
 *
 * NOTE (2026-11-13): the page-per-page mockups were replaced by the four
 * role dashboards, so `12-feed.html` no longer exists. The composition
 * described below is retained here as the record of the contract this
 * page was built against.
 *
 * It is a PRESENTATION-LAYER change only. Every data-flow decision is
 * unchanged:
 *   - the same single fetch to /api/v1/activity/public (limit=50)
 *   - the same 15s polling and the same 5s "new" badge window
 *   - the same five-way client-side filter and the same 20-per-page
 *     "load older" pagination
 *   - the same role split: staff (dispatcher / crew / admin) see the
 *     full feed, citizens see the PII-stripped public projection
 *   - the same PII stripping — no reporter name, phone or exact
 *     address is read, rendered or fetched on this surface
 *
 * What changed is only how the result is composed:
 *   - the content column is 760px wide (mockup) instead of 720px
 *   - the sticky filter row is offset BELOW the global header
 *     (`top: var(--header-height-desktop)`) rather than sticking to
 *     the top of the scroll region, and its chips are PRIMARY blue
 *     when active — the landing page's active chip is ink-coloured,
 *     and the two surfaces deliberately differ
 *   - every chip carries its LIVE count and `aria-pressed`
 *   - the feed rows carry a 64px thumb (the landing uses 76px), a
 *     single-line truncated note, a ward pill with a map-pin glyph,
 *     and a status pill that carries an ICON + a WORD + a colour
 *   - the "new" state carries BOTH a primary-soft tint and a badge
 */

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { t, TRANSLATIONS, type Language } from '@/lib/i18n/keys';
import { firstRenderablePhotoUrl, thumbnailBackground } from '@/lib/format/photo-url';
import { PhotoPlaceholder } from '@/components/ui/PhotoPlaceholder';
import { StatusPill } from '@/components/ui/StatusPill';
import { Button } from '@/components/ui/Button';
import { useLanguage } from '@/components/useLanguage';
import { useSession } from '@/components/SessionProvider';
import { ICONS } from '@/lib/ui/icon-map';

const POLL_INTERVAL_MS = 15_000;
const PAGE_SIZE = 20;

/** The feed's content column, per mockup 12. */
const COLUMN_MAX_WIDTH = 760;

/** The thumbnail's edge length, per mockup 12 (the landing uses 76). */
const THUMB_SIZE = 64;

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

/**
 * Format a counter for display.
 *
 * Bangla renders the digits in Bangla numerals (০১২৩৪৫৬৭৮৯) to match
 * the rest of the Bangla-first surface; English uses ASCII digits.
 * The landing page's counter formatter (`components/PublicLandingExperience.tsx`)
 * is the same rule — kept local rather than imported so this page
 * carries no dependency on the landing's module.
 */
function formatCount(value: number, lang: Language): string {
  return value.toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-US');
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

/**
 * The five filters the page's filter logic actually supports.
 *
 * Mockup 12 draws five chips (সব / নতুন / চলমান / সমাধান / আজ
 * সমাধান) and the UX spec lists the same five. Every one of them
 * maps onto a branch of the existing `filtered` memo below, so no
 * chip is decorative and none is added that the page cannot honour.
 */
const FILTERS: ReadonlyArray<{
  value: StatusFilter;
  i18nKey: keyof typeof TRANSLATIONS;
}> = [
  { value: 'all', i18nKey: 'home.filter.all' },
  { value: 'open', i18nKey: 'feed.filter.open' },
  { value: 'in_progress', i18nKey: 'home.filter.in_progress' },
  { value: 'resolved', i18nKey: 'home.filter.resolved' },
  { value: 'resolved_today', i18nKey: 'feed.filter.resolved_today' },
];

export default function FeedPage() {
  const { lang } = useLanguage();
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
  // The session comes from the shared `SessionProvider` — the page no
  // longer issues its own `/api/auth/status` request.
  const { authenticated } = useSession();

  // Auth check (Bolt 008-012): the shared session is the only auth
  // check on this page now. The /api/v1/activity/public endpoint that
  // powers the list is auth-agnostic — it works for unauthenticated
  // visitors too, but we still gate the page on sign-in because the
  // /feed surface is positioned as "your city's activity", not as the
  // public landing.
  //
  // The session itself comes from `SessionProvider`, so this page does
  // not issue its own `/api/auth/status` request.
  useEffect(() => {
    if (authenticated === null) return; // still loading
    setSignedIn(authenticated);
  }, [authenticated]);

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

  /**
   * The LIVE count on each chip.
   *
   * Each count is the size of that group over the WHOLE fetched set
   * (not over the currently-visible page), so a chip always tells the
   * reader how big its group is — the same rule the public landing
   * applies to its own chips. The counts are derived from the same
   * `tickets` array the list renders, so they refresh with every poll
   * without an extra request.
   */
  const counts = useMemo(() => {
    const countFor = (value: StatusFilter): number => {
      switch (value) {
        case 'all':
          return tickets.length;
        case 'open':
          return tickets.filter((t) => t.status === 'submitted' || t.status === 'routed').length;
        case 'in_progress':
          return tickets.filter((t) => t.status === 'in_progress').length;
        case 'resolved':
          return tickets.filter((t) => t.status === 'resolved' || t.status === 'closed').length;
        case 'resolved_today':
          return tickets.filter(
            (t) => (t.status === 'resolved' || t.status === 'closed') && isResolvedToday(t.createdAt),
          ).length;
        default:
          return tickets.length;
      }
    };
    const map: Record<StatusFilter, number> = {
      all: 0,
      open: 0,
      in_progress: 0,
      resolved: 0,
      resolved_today: 0,
    };
    for (const f of FILTERS) map[f.value] = countFor(f.value);
    return map;
  }, [tickets]);

  if (signedIn === false) {
    return (
      <div
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
        minHeight: '100%',
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
          of the global one.

          The header therefore keeps its own role gating — the inline
          nav (and the citizen-only "My reports" item inside it) and
          the Report CTA are rendered by <AppHeader> for citizen
          surfaces only. This page does not render a second nav, so a
          staff session never sees a citizen-only route exposed here. */}

      {/* Content column */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          justifyContent: 'center',
          padding: 'var(--space-6) var(--space-5) var(--space-8)',
        }}
      >
        <div style={{ width: '100%', maxWidth: COLUMN_MAX_WIDTH }}>
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
                lineHeight: 'var(--leading-normal)',
              }}
            >
              {t('feed.subtitle.24h', null, lang)}
            </p>
          </div>

          {/* Sticky filter chip row.

              Mockup 12 sticks this row BELOW the global header
              (`top: var(--header-height-desktop)`), not to the top of
              the scroll region — the header is sticky too, so a
              `top: 0` filter row would slide under it. `z-index: 1`
              is deliberate: the header sits on `--z-sticky` (10), and
              the filter row has to stay below it.

              The background is OPAQUE (`--color-surface-page`) so the
              rows scrolling underneath do not show through the chips. */}
          <div
            className="feed-filter-row"
            style={{
              position: 'sticky',
              top: 'var(--header-height-desktop)',
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
            {FILTERS.map(({ value, i18nKey }) => {
              const isActive = filter === value;
              return (
                <Button
                  key={value}
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setFilter(value);
                    setPage(1);
                  }}
                  aria-pressed={isActive}
                  lang={lang}
                  className="feed-chip"
                  data-active={isActive ? 'true' : 'false'}
                  style={{
                    minHeight: 36,
                    padding: '0 var(--space-4)',
                    gap: 'var(--space-2)',
                    background: isActive ? 'var(--color-primary)' : 'var(--color-surface-card)',
                    color: isActive ? 'var(--color-on-primary)' : 'var(--color-ink-secondary)',
                    border: '1px solid',
                    borderColor: isActive ? 'var(--color-primary)' : 'var(--color-border)',
                    borderRadius: 'var(--radius-pill)',
                    fontSize: 'var(--text-caption)',
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                    transition:
                      'background var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out)',
                  }}
                >
                  {t(i18nKey, null, lang)}
                  <span
                    className="feed-chip-count"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--text-micro)',
                      opacity: 0.8,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {formatCount(counts[value], lang)}
                  </span>
                </Button>
              );
            })}
          </div>

          {loading ? (
            <FeedSkeleton />
          ) : error ? (
            <p
              lang={lang}
              role="alert"
              style={{
                fontSize: 'var(--text-body-sm)',
                color: 'var(--color-danger)',
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
                className="feed-list"
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
                    display: 'flex',
                    justifyContent: 'center',
                    marginTop: 'var(--space-5)',
                  }}
                >
                  <Button
                    variant="secondary"
                    onClick={() => setPage((p) => p + 1)}
                    lang={lang}
                    style={{
                      background: 'var(--color-surface-card)',
                      color: 'var(--color-ink)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-pill)',
                      height: 44,
                      padding: '0 var(--space-5)',
                    }}
                  >
                    {t('feed.load_older', null, lang)}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/*
       * The chip row scrolls HORIZONTALLY on narrow viewports rather
       * than wrapping into a tall stack, and the content column drops
       * to the compact padding. The chip's `flex-shrink: 0` (set
       * inline above) keeps each chip at its natural width inside the
       * scroller.
       */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @media (max-width: 768px) {
          .feed-filter-row {
            flex-wrap: nowrap !important;
            overflow-x: auto;
            scrollbar-width: none;
          }
          .feed-filter-row::-webkit-scrollbar { display: none; }
          .feed-chip { flex-shrink: 0; }
        }
        .feed-chip:focus-visible {
          outline: none;
          box-shadow: var(--shadow-focus);
        }
        .feed-chip:hover:not([data-active="true"]) {
          background: var(--color-surface-raised);
          color: var(--color-ink);
        }
      `,
        }}
      />
    </div>
  );
}

/**
 * One feed row — mockup 12's `.row`.
 *
 * The composition is: a 64px thumbnail, a body column (title +
 * status pill, a single-line truncated note, and a meta line with a
 * ward pill and a relative timestamp), and — on a NEW row — a
 * "new" badge in the meta line.
 *
 * The row is built inline rather than from the shared `ReportCard`
 * primitive because the mockup's row differs from `ReportCard` in
 * four visible ways: a 64px thumb (ReportCard uses 56), a card
 * surface (`--color-surface-card`, ReportCard uses the page surface),
 * a ward pill with a map-pin glyph (ReportCard renders the ward as
 * bare text), and a single-line `text-overflow: ellipsis` note
 * (ReportCard uses a `-webkit-line-clamp` box).
 */
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
  /*
   * The thumbnail. The stored photo URL can be an inline `data:` URL
   * (the default — the photo picker inlines the file bytes), an
   * absolute `https://` URL (R2/S3 with a public base URL), or a
   * root-relative `/api/blob/…` path (the local blob provider). The
   * old guard was `startsWith('http')`, which matched only the
   * middle shape — so the citizen's own submitted photo rendered as
   * a blank gradient square in the feed.
   *
   * `firstRenderablePhotoUrl` picks the first URL we can actually
   * render; the dashed placeholder is the genuine "no photo attached"
   * state.
   */
  const photoUrl = firstRenderablePhotoUrl(item.photoUrls);
  const thumbBackground = thumbnailBackground(photoUrl);
  return (
    <Link
      href={`/reports/${item.id}`}
      className="feed-row"
      data-new={isNew ? 'true' : undefined}
      style={{
        display: 'flex',
        gap: 'var(--space-3)',
        padding: 'var(--space-3)',
        background: isNew ? 'var(--color-primary-soft)' : 'var(--color-surface-card)',
        border: '1px solid',
        borderColor: isNew ? 'var(--color-primary)' : 'var(--color-border)',
        borderRadius: 'var(--radius-md)',
        textDecoration: 'none',
        color: 'var(--color-ink)',
        transition: 'background var(--duration-base) var(--ease-out)',
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
            width: THUMB_SIZE,
            height: THUMB_SIZE,
            borderRadius: 'var(--radius-sm)',
            objectFit: 'cover',
            background: 'var(--color-surface-raised)',
            flexShrink: 0,
          }}
        />
      ) : (
        /*
         * No renderable photo → the shared "no photo" empty state
         * (dashed border + camera glyph), NOT the old bare gradient
         * square. The gradient read as a broken image rather than as
         * an intentional empty state.
         */
        <PhotoPlaceholder
          size={THUMB_SIZE}
          lang={lang}
          style={{ border: '1px dashed var(--color-border-strong)' }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-2)',
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
          {/* The status pill carries an ICON, a WORD and a colour —
              never colour alone. */}
          <StatusPill status={item.status} lang={lang} />
        </div>
        {item.note && (
          <p
            lang={lang}
            style={{
              fontSize: 'var(--text-caption)',
              color: 'var(--color-ink-secondary)',
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
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
            marginTop: 'var(--space-1)',
          }}
        >
          {wardName && (
            <span
              lang={lang}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px var(--space-2)',
                background: 'var(--color-surface-raised)',
                borderRadius: 'var(--radius-pill)',
                color: 'var(--color-ink-secondary)',
                fontWeight: 'var(--weight-semibold)',
                whiteSpace: 'nowrap',
              }}
            >
              <ICONS.mapPin.icon size={11} weight={ICONS.mapPin.weight} aria-hidden focusable="false" />
              {wardName}
            </span>
          )}
          <span lang={lang} style={{ whiteSpace: 'nowrap' }}>
            {formatAge(item.createdAt, lang)}
          </span>
          {isNew && (
            <span
              lang={lang}
              style={{
                marginLeft: 'auto',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px var(--space-2)',
                background: 'var(--color-primary)',
                color: 'var(--color-on-primary)',
                borderRadius: 'var(--radius-pill)',
                fontSize: 'var(--text-micro)',
                fontWeight: 'var(--weight-bold)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                whiteSpace: 'nowrap',
              }}
            >
              <svg
                width={10}
                height={10}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
                focusable="false"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              {t('home.activity.new_badge', null, lang)}
            </span>
          )}
        </div>
      </div>
    </Link>
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
              width: THUMB_SIZE,
              height: THUMB_SIZE,
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-surface-raised)',
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1 }}>
            <div
              style={{
                width: '50%',
                height: 12,
                background: 'var(--color-surface-raised)',
                borderRadius: 'var(--radius-xs)',
                marginBottom: 6,
              }}
            />
            <div
              style={{
                width: '70%',
                height: 10,
                background: 'var(--color-surface-raised)',
                borderRadius: 'var(--radius-xs)',
                marginBottom: 4,
              }}
            />
            <div
              style={{
                width: '30%',
                height: 10,
                background: 'var(--color-surface-raised)',
                borderRadius: 'var(--radius-xs)',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
