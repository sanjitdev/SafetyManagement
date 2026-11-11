/**
 * Public landing experience (components/PublicLandingExperience.tsx).
 *
 * v1.1 launch-polish hotfix: the public landing at `/` (app/page.tsx)
 * shows a read-only city activity feed + interactive city map for
 * visitors who haven't registered. This is the data + interactive
 * surface; the route handler decides whether to render it (anonymous)
 * or redirect to /home (authed).
 *
 * No auth required. The activity feed polls
 * `/api/v1/activity/public`, which is PII-stripped via
 * `serializeTicketForPublic` (lib/serializers/ticket.ts): no reporter
 * id, no internal note, no assigned crew id, no trail, no
 * locationLabel. The pins on the map are status-coloured (same
 * palette as the home page CityActivityMap) and read-only.
 *
 * Anonymous "Report what you see" CTA → `/register?next=/report/location`
 * — register-before-submit (no report-draft can carry a session-only
 * state for an anonymous user, so the citizen registers first, the
 * draft is then created in sessionStorage once they're authed). The
 * "Log in" CTA → `/login?next=/report/location` for returning
 * citizens.
 *
 * Polling: every 30 s. Per-IP rate limited at the API layer via
 * `lib/platform/rate-limit.ts`; the client doesn't double-throttle.
 *
 * Bilingual: bn (default) / en, toggle persists in localStorage.
 */

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import CityActivityMap, {
  type CityActivityPin,
} from '@/components/CityActivityMap';
import { t, type Language } from '@/lib/i18n/keys';
import { CityFixMark } from '@/components/CityFixMark';
import { firstDisplayablePhotoUrl } from '@/lib/format/photo-url';
import { PhotoPlaceholder } from '@/components/ui/PhotoPlaceholder';

const LANG_KEY = 'cityfix.preferred_language.v1';
const POLL_INTERVAL_MS = 30_000;
/**
 * How many cards one page of the activity feed holds.
 *
 * The UX scenario specs call for 20 per page ("Pagination: 20 items
 * per page … 'Load older' trigger at bottom"), and that is what the
 * server's `limit` means here. The landing page used to ask for 30
 * in one shot, which hid the pagination affordance entirely — the
 * visitor never learned there was more to see.
 */
const PAGE_SIZE = 20;
const DHAKA_CENTER = { lat: 23.8069, lng: 90.3687 };

type PublicStatus =
  | 'submitted'
  | 'routed'
  | 'in_progress'
  | 'resolved'
  | 'closed'
  | 'cancelled';

interface PublicTicket {
  id: string;
  cityId: string;
  wardId: string;
  /**
   * Human-readable ward name (Bolt 008-011). When present, the
   * card renders "Ward 14 — Mirpur" instead of slicing the raw
   * wardId. Falls back to the id slice when the join is missing.
   */
  wardName: string | null;
  wardNameBn: string | null;
  categoryId: string;
  /**
   * Human-readable category name. The public card used to show a
   * bare status pill with no indication of WHAT was reported, so a
   * visitor could not tell a streetlight report from a drainage
   * one. Null when the backend join is absent.
   */
  categoryName: string | null;
  categoryNameBn: string | null;
  status: PublicStatus;
  locationLng: number;
  locationLat: number;
  note: string | null;
  photoUrls: string[];
  createdAt: string;
}

/**
 * One ward in the city's ward list, as returned by the public
 * activity endpoint. Drives the landing page's location filter.
 *
 * `count` is the number of the city's reports in this ward,
 * computed over the FULL ticket set — it does not change when a
 * status chip is active, so the chip always shows the size of the
 * locality.
 */
interface PublicWard {
  id: string;
  number: number;
  name: string;
  nameBn: string | null;
  count: number;
}

/**
 * The landing page's stats row + filter chips.
 *
 * Backed by `computeStats` in app/api/v1/activity/public/route.ts —
 * these are real city counters, not authored constants. The counts are
 * city-wide and therefore do NOT change with the active filter; the
 * chips need to show the size of every group at once.
 */
interface PublicActivityStats {
  reportsThisMonth: number;
  resolvedThisMonth: number;
  resolutionRate: number;
  avgDaysToResolve: number;
  /**
   * Reports in the previous calendar month — the comparison base for
   * the trend line under "reports this month".
   */
  reportsLastMonth: number;
  /**
   * The month-over-month direction.
   *
   * `none` means there was no previous month to compare against, so
   * the card shows no trend claim at all — distinct from `flat`,
   * which means the two months held the same number.
   */
  trend: 'up' | 'down' | 'flat' | 'none';
  counts: { all: number; new: number; active: number; resolved: number };
}

/**
 * The filter-chip groups. Matches the `?status=` values the public
 * activity endpoint accepts — see `STATUS_GROUP` in the route.
 */
type PublicFilter = 'all' | 'new' | 'active' | 'resolved';

const EMPTY_STATS: PublicActivityStats = {
  reportsThisMonth: 0,
  resolvedThisMonth: 0,
  resolutionRate: 0,
  avgDaysToResolve: 0,
  reportsLastMonth: 0,
  trend: 'none',
  counts: { all: 0, new: 0, active: 0, resolved: 0 },
};

// Status pill palette. Bolt 008-011: switched from raw hex
// (which clashed on the dark theme — the cream/amber "submitted"
// pill read as abandoned) to the brand's semantic status tokens
// (defined in tokens.css) so the pill matches the rest of the
// app on both light and dark themes. The hex fallbacks keep the
// page legible if the token is missing.
const STATUS_COLORS: Record<PublicStatus, { bg: string; fg: string }> = {
  submitted: {
    bg: 'var(--color-primary-soft)',
    fg: 'var(--color-primary)',
  },
  routed: {
    bg: 'var(--color-status-routed-soft)',
    fg: 'var(--color-status-routed)',
  },
  in_progress: {
    bg: 'var(--color-status-in-progress-soft)',
    fg: 'var(--color-status-in-progress)',
  },
  resolved: {
    bg: 'var(--color-status-resolved-soft)',
    fg: 'var(--color-status-resolved)',
  },
  closed: {
    bg: 'var(--color-surface-raised)',
    fg: 'var(--color-ink-secondary)',
  },
  cancelled: {
    bg: 'var(--color-status-error-soft)',
    fg: 'var(--color-status-error)',
  },
};

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

export default function PublicLandingExperience() {
  const [lang, setLang] = useState<Language>('bn');
  const [tickets, setTickets] = useState<PublicTicket[]>([]);
  const [stats, setStats] = useState<PublicActivityStats>(EMPTY_STATS);
  const [wards, setWards] = useState<PublicWard[]>([]);
  const [filter, setFilter] = useState<PublicFilter>('all');
  /**
   * The active location filter. `null` means "the whole city";
   * otherwise it is the ward's NUMBER as a string — the same form
   * the API accepts and the same form the chips render.
   */
  const [ward, setWard] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  /**
   * Pagination state.
   *
   * `nextCursor` is the server's token for the page AFTER the rows we
   * hold — null means we have reached the end. `total` is how many
   * rows the active filter matches, so the UI can say "showing 30 of
   * 58" and know whether a "show all" escape hatch is worth offering.
   */
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  /** True while a "Load older" request is in flight. */
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LANG_KEY);
      if (stored === 'en' || stored === 'bn') setLang(stored);
    } catch {
      // ignore — storage may be disabled
    }
  }, []);

  // Poll the public activity feed. No cookies, no auth.
  //
  // The request carries the active filters so the server does the
  // grouping — the chip counts are computed server-side from the
  // city's full ticket set, so the client never has to hold more
  // than one page of rows to know how big each group is.
  //
  // `limit=30` — the mockup's feed shows a dense board of cards; 20
  // left visible gaps on a desktop viewport. The server caps the
  // page at 50 and the city-wide filters (status, ward) are applied
  // BEFORE the slice, so "Ward 1 + New" returns the newest New
  // reports in Ward 1 — not the ones that happened to fall inside
  // the first 30 rows of the unfiltered feed.
  //
  // ── Pagination ─────────────────────────────────────────────────
  //
  // The feed is paged by an opaque server cursor (`?cursor=`). Two
  // things use it, and they behave differently on purpose:
  //
  //   - The POLL replaces the list with page 1. New reports appear
  //     at the top, and the older pages the visitor paged through
  //     are dropped — they will re-fetch if they page down again.
  //
  //   - "Load older" APPENDS the next page. It must not clobber
  //     the rows already on screen, or the visitor loses their
  //     place every time they ask for more.
  //
  // The poll's cursor is read from a ref rather than from state so
  // that the polling effect does not re-subscribe every time the
  // cursor changes — otherwise paging down would restart the poll
  // and reset the list.
  const cursorRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    const fetchOnce = async () => {
      try {
        const params = new URLSearchParams({
          limit: String(PAGE_SIZE),
          status: filter,
        });
        if (ward !== null) params.set('ward', ward);
        const res = await fetch(`/api/v1/activity/public?${params.toString()}`, {
          // Public endpoint, no credentials. Caching headers are server-side.
          cache: 'no-store',
        });
        if (cancelled) return;
        if (!res.ok) {
          setError(true);
          setLoading(false);
          return;
        }
        const data = (await res.json()) as {
          tickets: PublicTicket[];
          wards?: PublicWard[];
          stats?: PublicActivityStats;
          nextCursor?: string | null;
          total?: number;
        };
        if (cancelled) return;
        setTickets(data.tickets ?? []);
        setWards(data.wards ?? []);
        setStats(data.stats ?? EMPTY_STATS);
        setNextCursor(data.nextCursor ?? null);
        setTotal(data.total ?? data.tickets?.length ?? 0);
        cursorRef.current = data.nextCursor ?? null;
        setError(false);
        setLoading(false);
      } catch {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      }
    };

    void fetchOnce();
    timer = window.setInterval(fetchOnce, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [filter, ward]);

  /**
   * Fetch the next page and APPEND it to the rows on screen.
   *
   * The rows already shown are not re-requested: the server's cursor
   * points past the last one, so the response is exactly the rows
   * the visitor has not seen. The append is keyed by ticket id and
   * de-duplicated, because a poll may have landed in between and
   * inserted a row that the new page also carries.
   */
  const loadOlder = async () => {
    const cursor = nextCursor;
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        status: filter,
        cursor,
      });
      if (ward !== null) params.set('ward', ward);
      const res = await fetch(`/api/v1/activity/public?${params.toString()}`, {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        tickets?: PublicTicket[];
        nextCursor?: string | null;
      };
      setTickets((prev) => {
        const seen = new Set(prev.map((t) => t.id));
        const incoming = (data.tickets ?? []).filter((t) => !seen.has(t.id));
        return incoming.length > 0 ? [...prev, ...incoming] : prev;
      });
      const next = data.nextCursor ?? null;
      setNextCursor(next);
      cursorRef.current = next;
    } catch {
      // A failed "load older" leaves the cursor where it was, so the
      // visitor can simply press the button again. The list stays
      // exactly as it was — a broken page must not empty the feed.
    } finally {
      setLoadingMore(false);
    }
  };

  function toggleLang() {
    const next: Language = lang === 'bn' ? 'en' : 'bn';
    setLang(next);
    try {
      window.localStorage.setItem(LANG_KEY, next);
    } catch {
      // ignore
    }
  }

  const pins: CityActivityPin[] = useMemo(
    () =>
      tickets.map((t) => ({
        id: t.id,
        lat: t.locationLat,
        lng: t.locationLng,
        status: t.status,
      })),
    [tickets],
  );

  /**
   * The wards worth offering as location chips — only the ones that
   * actually hold reports.
   *
   * The city's ward table carries 50 rows for Dhaka North, but the
   * reports are concentrated in a handful of wards. Rendering all 50
   * as chips would bury the status chips the filter sits next to and
   * push the feed below the fold. The "all areas" chip carries the
   * city-wide total, so no report is unaccounted for.
   */
  const wardsWithReports = useMemo(
    () => wards.filter((w) => w.count > 0),
    [wards],
  );

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
        <Link
          href="/"
          aria-label="CityFix"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            textDecoration: 'none',
            color: 'var(--color-ink)',
          }}
        >
          <CityFixMark size={34} />
          <span
            style={{
              fontSize: 'var(--text-body-lg)',
              fontWeight: 'var(--weight-bold)',
              whiteSpace: 'nowrap',
            }}
          >
            CityFix
          </span>
        </Link>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            flexShrink: 0,
          }}
        >
          <Link
            href="/login?next=/report/location"
            lang={lang}
            style={{
              padding: 'var(--space-2) var(--space-3)',
              fontSize: 'var(--text-body-sm)',
              color: 'var(--color-ink-secondary)',
              textDecoration: 'none',
              fontWeight: 'var(--weight-semibold)',
            }}
          >
            {t('public.cta.login', null, lang)}
          </Link>
          <Link
            href="/register?next=/report/location"
            lang={lang}
            style={{
              padding: 'var(--space-2) var(--space-4)',
              background: 'var(--color-primary)',
              color: 'var(--color-on-primary)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-body-sm)',
              fontWeight: 'var(--weight-semibold)',
              textDecoration: 'none',
            }}
          >
            {t('public.cta.register', null, lang)}
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
        </div>
      </header>

      {/* Hero */}
      <section
        style={{
          padding: 'var(--space-8) var(--space-5) var(--space-7)',
          maxWidth: 1200,
          margin: '0 auto',
          width: '100%',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)',
          gap: 'var(--space-7)',
          alignItems: 'center',
        }}
        className="public-hero-grid"
      >
        <style>{`
          @media (max-width: 900px) {
            .public-hero-grid { grid-template-columns: 1fr !important; gap: var(--space-5) !important; }
          }
        `}</style>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
            maxWidth: 560,
          }}
        >
          <p
            lang={lang}
            style={{
              margin: 0,
              color: 'var(--color-ink-tertiary)',
              fontSize: 'var(--text-caption)',
              fontWeight: 'var(--weight-medium)',
              letterSpacing: 'var(--tracking-wide)',
              textTransform: 'uppercase',
            }}
          >
            {t('public.hero.eyebrow', null, lang)}
          </p>
          <h1
            lang={lang}
            style={{
              fontSize: 'var(--text-display-lg)',
              fontWeight: 'var(--weight-semibold)',
              color: 'var(--color-ink)',
              margin: 0,
              letterSpacing: 'var(--tracking-tight)',
              lineHeight: 1.1,
            }}
            dangerouslySetInnerHTML={{
              __html: t('public.hero.headline', null, lang),
            }}
          />
          <p
            lang={lang}
            style={{
              fontSize: 'var(--text-body-lg)',
              color: 'var(--color-ink-secondary)',
              margin: 0,
              lineHeight: 1.55,
            }}
          >
            {t('public.hero.subhead', null, lang)}
          </p>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
              marginTop: 'var(--space-3)',
            }}
          >
            <Link
              href="/register?next=/report/location"
              lang={lang}
              style={{
                height: 56,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--color-primary)',
                color: 'var(--color-on-primary)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-body-lg)',
                fontWeight: 'var(--weight-semibold)',
                textDecoration: 'none',
                gap: 'var(--space-2)',
              }}
            >
              <PlusIcon />
              {t('public.cta.report', null, lang)}
            </Link>
            <span
              lang={lang}
              style={{
                fontSize: 'var(--text-caption)',
                color: 'var(--color-ink-tertiary)',
                textAlign: 'center',
              }}
            >
              {t('public.cta.report.hint', null, lang)}
            </span>
          </div>

          {/* Live stats — the counters behind these come from the API
              (`computeStats`), not from authored constants. A city
              with no reports this month renders zeroes rather than
              hiding the row, so the layout never jumps. */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 'var(--space-3)',
              marginTop: 'var(--space-4)',
            }}
          >
            <StatCard
              icon={<FileIcon />}
              label={t('public.stats.reports_this_month', null, lang)}
              value={formatNumber(stats.reportsThisMonth, lang)}
              foot={renderTrendFoot(stats, lang)}
              footTone={stats.trend === 'down' ? 'down' : 'up'}
            />
            <StatCard
              icon={<CheckCircleIcon />}
              label={t('public.stats.resolved', null, lang)}
              value={formatNumber(stats.resolvedThisMonth, lang)}
              foot={t('public.stats.resolved.foot', { rate: stats.resolutionRate }, lang)}
            />
            <StatCard
              icon={<ClockIcon />}
              label={t('public.stats.avg_time', null, lang)}
              value={t('public.stats.days', { value: formatNumber(stats.avgDaysToResolve, lang) }, lang)}
              foot={t('public.stats.avg_time.foot', null, lang)}
            />
          </div>
        </div>

        {/* Map preview */}
        <div
          style={{
            position: 'relative',
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
            minHeight: 380,
            height: '100%',
            boxShadow: 'var(--shadow-xs)',
          }}
        >
          <CityActivityMap pins={pins} center={DHAKA_CENTER} />
          {/* Map badge — the mockup shows the CITY here ("ঢাকা উত্তর ·
              লাইভ"), not the feed title. The feed title already heads
              the section below, so reusing it here was a duplicate
              label pointing at the wrong thing. */}
          <div
            style={{
              position: 'absolute',
              top: 'var(--space-3)',
              left: 'var(--space-3)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              padding: '4px var(--space-3)',
              background: 'var(--color-surface-card)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-pill)',
              fontSize: 'var(--text-caption)',
              color: 'var(--color-ink)',
              fontWeight: 'var(--weight-semibold)',
            }}
          >
            <span
              aria-hidden
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--color-primary)',
              }}
            />
            {t('public.map.badge', null, lang)}
          </div>

          {/* Legend — the mockup's three status colours. The live map
              draws the same three pin states, so the legend tells a
              first-time visitor what the dots mean. */}
          <div
            style={{
              position: 'absolute',
              bottom: 'var(--space-3)',
              left: 'var(--space-3)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              padding: '6px var(--space-3)',
              background: 'var(--color-surface-card)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-pill)',
              fontSize: 'var(--text-caption)',
              color: 'var(--color-ink-secondary)',
            }}
          >
            <LegendDot label={t('public.map.legend.new', null, lang)} color="var(--color-status-routed)" />
            <LegendDot label={t('public.map.legend.active', null, lang)} color="var(--color-status-in-progress)" />
            <LegendDot label={t('public.map.legend.resolved', null, lang)} color="var(--color-status-resolved)" />
          </div>
        </div>
      </section>

      {/* Trust cards — the mockup's three reassurance cards. These
          replaced a single thin grey pill that carried only three
          comma-separated phrases with no supporting explanation. The
          pill's three phrases are kept below as the fine-print
          strip so no reassurance copy is lost in the upgrade.

          The `id="trust"` anchor is the target for the footer's
          terms/privacy links — the legal pages are a v1.1 item and
          are not routes yet, so those links must not 404. */}
      <section
        id="trust"
        style={{
          maxWidth: 1200,
          width: '100%',
          margin: '0 auto',
          padding: '0 var(--space-5) var(--space-6)',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 'var(--space-3)',
        }}
      >
        <TrustCard
          icon={<ShieldIcon />}
          title={t('public.trust.government.title', null, lang)}
          desc={t('public.trust.government.desc', null, lang)}
        />
        <TrustCard
          icon={<LockIcon />}
          title={t('public.trust.privacy.title', null, lang)}
          desc={t('public.trust.privacy.desc', null, lang)}
        />
        <TrustCard
          icon={<GlobeIcon />}
          title={t('public.trust.bilingual.title', null, lang)}
          desc={t('public.trust.bilingual.desc', null, lang)}
        />
      </section>

      {/* Fine-print reassurance strip — the three phrases the trust
          strip carried before the cards above. */}
      <section
        style={{
          maxWidth: 1200,
          width: '100%',
          margin: '0 auto',
          padding: '0 var(--space-5) var(--space-6)',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-3)',
            alignItems: 'center',
            padding: 'var(--space-3) var(--space-4)',
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-pill)',
            fontSize: 'var(--text-caption)',
            color: 'var(--color-ink-tertiary)',
            flexWrap: 'wrap',
          }}
        >
          <span
            lang={lang}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}
          >
            {t('public.trust.marker1', null, lang)}
          </span>
          <Divider />
          <span
            lang={lang}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}
          >
            {t('public.trust.marker2', null, lang)}
          </span>
          <Divider />
          <span
            lang={lang}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}
          >
            {t('public.trust.marker3', null, lang)}
          </span>
        </div>
      </section>

      {/* Activity feed */}
      <section
        style={{
          maxWidth: 1200,
          width: '100%',
          margin: '0 auto',
          padding: '0 var(--space-5) var(--space-8)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            marginBottom: 'var(--space-3)',
            gap: 'var(--space-3)',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h2
              lang={lang}
              style={{
                fontSize: 'var(--text-h2)',
                fontWeight: 'var(--weight-semibold)',
                color: 'var(--color-ink)',
                margin: '0 0 var(--space-1)',
              }}
            >
              {t('public.feed.title', null, lang)}
            </h2>
            <p
              lang={lang}
              style={{
                fontSize: 'var(--text-caption)',
                color: 'var(--color-ink-tertiary)',
                margin: 0,
              }}
            >
              {t('public.feed.subtitle', null, lang)}
            </p>
          </div>

          {/* Filter panel — the status chips AND the location filter.
              Both rows filter the SAME city-wide list server-side;
              the counts on each chip are the CITY-WIDE totals from
              the API (computed over every ticket, not just the
              filtered page), so a chip always shows how big its
              group is regardless of what else is selected. */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: 'var(--space-2)',
            }}
          >
            <div
              role="group"
              aria-label={t('public.feed.title', null, lang)}
              style={{
                display: 'flex',
                gap: 'var(--space-2)',
                flexWrap: 'wrap',
                justifyContent: 'flex-end',
              }}
            >
              {(
                [
                  ['all', 'public.filter.all'],
                  ['new', 'public.filter.new'],
                  ['active', 'public.filter.active'],
                  ['resolved', 'public.filter.resolved'],
                ] as const
              ).map(([value, key]) => {
                const isActive = filter === value;
                const count = stats.counts[value];
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFilter(value)}
                    aria-pressed={isActive}
                    lang={lang}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 'var(--space-2)',
                      padding: 'var(--space-2) var(--space-3)',
                      background: isActive
                        ? 'var(--color-ink)'
                        : 'var(--color-surface-card)',
                      color: isActive
                        ? 'var(--color-surface-page)'
                        : 'var(--color-ink-secondary)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-pill)',
                      fontSize: 'var(--text-body-sm)',
                      fontWeight: 'var(--weight-semibold)',
                      cursor: 'pointer',
                      transition: 'background 120ms ease, color 120ms ease',
                    }}
                  >
                    {t(key, null, lang)}
                    <span
                      style={{
                        fontVariantNumeric: 'tabular-nums',
                        opacity: isActive ? 0.8 : 0.65,
                      }}
                    >
                      {formatNumber(count, lang)}
                    </span>
                  </button>
                );
              })}
            </div>

            {/*
              Location filter — a row of ward chips.

              Only wards that HOLD reports are shown. The city's
              ward table has 50 rows but only a handful carry
              activity, and a filter strip of 50 dead chips would
              bury the status chips it sits next to. The "all areas"
              chip carries the city-wide total, so the strip still
              accounts for every report in the city.

              The chip label uses the ward's NAME ("ওয়ার্ড 14" /
              "Ward 14") rather than a bare number — "14" alone is
              meaningless to a first-time visitor, but the seeded
              ward names already carry the word, so they render
              without the duplicated prefix the card bug produced.
            */}
            {wardsWithReports.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  maxWidth: '100%',
                }}
              >
                <span
                  lang={lang}
                  style={{
                    fontSize: 'var(--text-caption)',
                    color: 'var(--color-ink-tertiary)',
                    fontWeight: 'var(--weight-medium)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t('public.location.label', null, lang)}
                </span>
                <div
                  role="group"
                  aria-label={t('public.location.label', null, lang)}
                  style={{
                    display: 'flex',
                    gap: 'var(--space-2)',
                    flexWrap: 'wrap',
                    justifyContent: 'flex-end',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setWard(null)}
                    aria-pressed={ward === null}
                    lang={lang}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 'var(--space-2)',
                      padding: 'var(--space-1) var(--space-3)',
                      background:
                        ward === null
                          ? 'var(--color-primary-soft)'
                          : 'transparent',
                      color:
                        ward === null
                          ? 'var(--color-primary)'
                          : 'var(--color-ink-secondary)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-pill)',
                      fontSize: 'var(--text-caption)',
                      fontWeight: 'var(--weight-semibold)',
                      cursor: 'pointer',
                    }}
                  >
                    {t('public.location.all', null, lang)}
                    <span
                      style={{
                        fontVariantNumeric: 'tabular-nums',
                        opacity: ward === null ? 0.8 : 0.6,
                      }}
                    >
                      {formatNumber(stats.counts.all, lang)}
                    </span>
                  </button>
                  {wardsWithReports.map((w) => {
                    const value = String(w.number);
                    const isActive = ward === value;
                    const label =
                      lang === 'bn'
                        ? w.nameBn ?? w.name
                        : w.name ?? w.nameBn ?? value;
                    return (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() =>
                          setWard(isActive ? null : value)
                        }
                        aria-pressed={isActive}
                        lang={lang}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 'var(--space-2)',
                          padding: 'var(--space-1) var(--space-3)',
                          background: isActive
                            ? 'var(--color-primary-soft)'
                            : 'transparent',
                          color: isActive
                            ? 'var(--color-primary)'
                            : 'var(--color-ink-secondary)',
                          border: '1px solid var(--color-border)',
                          borderRadius: 'var(--radius-pill)',
                          fontSize: 'var(--text-caption)',
                          fontWeight: 'var(--weight-semibold)',
                          cursor: 'pointer',
                        }}
                      >
                        {label}
                        <span
                          style={{
                            fontVariantNumeric: 'tabular-nums',
                            opacity: isActive ? 0.8 : 0.6,
                          }}
                        >
                          {formatNumber(w.count, lang)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <FeedSkeleton />
        ) : error ? (
          <p
            lang={lang}
            role="alert"
            style={{
              padding: 'var(--space-5)',
              background: 'var(--color-warning-soft)',
              border: '1px solid var(--color-warning)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-ink)',
              fontSize: 'var(--text-body-sm)',
              margin: 0,
            }}
          >
            {t('public.feed.error', null, lang)}
          </p>
        ) : tickets.length === 0 ? (
          <div
            style={{
              padding: 'var(--space-7) var(--space-5)',
              background: 'var(--color-surface-card)',
              border: '1px dashed var(--color-border)',
              borderRadius: 'var(--radius-md)',
              textAlign: 'center',
            }}
          >
            {/*
              A filtered-to-nothing feed and a genuinely empty city
              are different states and deserve different copy. When a
              filter is active, say so AND offer the way back —
              otherwise the visitor is stuck on an empty board with no
              idea why.
            */}
            <p
              lang={lang}
              style={{
                fontSize: 'var(--text-body)',
                color: 'var(--color-ink-secondary)',
                margin: '0 0 var(--space-4)',
              }}
            >
              {ward !== null || filter !== 'all'
                ? t('public.location.empty', null, lang)
                : t('public.feed.empty', null, lang)}
            </p>
            <div
              style={{
                display: 'flex',
                gap: 'var(--space-3)',
                justifyContent: 'center',
                flexWrap: 'wrap',
              }}
            >
              {(ward !== null || filter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setWard(null);
                    setFilter('all');
                  }}
                  lang={lang}
                  style={{
                    display: 'inline-block',
                    padding: 'var(--space-3) var(--space-5)',
                    background: 'var(--color-surface-raised)',
                    color: 'var(--color-ink)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: 'var(--text-body-sm)',
                    fontWeight: 'var(--weight-semibold)',
                    cursor: 'pointer',
                  }}
                >
                  {t('public.location.all', null, lang)}
                </button>
              )}
              <Link
                href="/register?next=/report/location"
                lang={lang}
                style={{
                  display: 'inline-block',
                  padding: 'var(--space-3) var(--space-5)',
                  background: 'var(--color-primary)',
                  color: 'var(--color-on-primary)',
                  borderRadius: 'var(--radius-md)',
                  textDecoration: 'none',
                  fontSize: 'var(--text-body-sm)',
                  fontWeight: 'var(--weight-semibold)',
                }}
              >
                {t('public.cta.report', null, lang)}
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div
              aria-busy={loadingMore}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 'var(--space-3)',
              }}
            >
              {tickets.map((ticket) => (
                <PublicActivityCard
                  key={ticket.id}
                  ticket={ticket}
                  lang={lang}
                />
              ))}
            </div>

            {/*
              Skeleton cards below the current list while the next
              page loads — the UX spec calls for exactly this
              ("Skeleton items below the current list during
              pagination"). The placeholders sit BELOW the real cards
              so the grid does not reflow under the visitor's eyes.
            */}
            {loadingMore && (
              <div
                aria-hidden="true"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: 'var(--space-3)',
                  marginTop: 'var(--space-3)',
                }}
              >
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    style={{
                      height: '148px',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--color-surface-raised)',
                    }}
                  />
                ))}
              </div>
            )}

            {/*
              The pagination affordance.

              "Load older" is the primary control — the UX scenario
              specs name it explicitly ("'Load older' trigger at
              bottom"), and it is the same affordance the /feed page
              already ships. It appears only when the server says
              there is another page, and disappears at the end of the
              list, so its presence always means "there is more".

              The "Showing X of Y" line is the honest summary of how
              much of the city the visitor is actually looking at.
              Without it the grid looks like the whole city — which
              is exactly the bug this pagination fixes.
            */}
            {(nextCursor !== null || total > tickets.length) && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  marginTop: 'var(--space-5)',
                }}
              >
                <p
                  aria-live="polite"
                  lang={lang}
                  style={{
                    margin: 0,
                    fontSize: 'var(--text-caption)',
                    color: 'var(--color-ink-secondary)',
                    fontFamily: 'var(--font-mono)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {t(
                    'public.feed.showing',
                    { shown: tickets.length, total },
                    lang,
                  )}
                </p>

                {nextCursor !== null && (
                  <button
                    type="button"
                    onClick={() => {
                      void loadOlder();
                    }}
                    disabled={loadingMore}
                    lang={lang}
                    style={{
                      padding: 'var(--space-2) var(--space-5)',
                      background: 'transparent',
                      color: 'var(--color-primary)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-pill)',
                      fontSize: 'var(--text-body-sm)',
                      fontWeight: 'var(--weight-semibold)',
                      cursor: loadingMore ? 'progress' : 'pointer',
                      opacity: loadingMore ? 0.6 : 1,
                    }}
                  >
                    {t('public.feed.load_older', null, lang)}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </section>

      {/* Footer — the mockup's footer. The links point at real
          destinations: `/splash` carries the help copy, the terms and
          privacy links anchor the landing's own trust section (the
          legal pages are a v1.1 item and are NOT yet routes), and the
          hotline is a `tel:` link so it works on a phone. */}
      <footer
        style={{
          marginTop: 'auto',
          borderTop: '1px solid var(--color-border)',
          background: 'var(--color-surface-card)',
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            width: '100%',
            margin: '0 auto',
            padding: 'var(--space-6) var(--space-5)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 'var(--space-5)',
            flexWrap: 'wrap',
          }}
        >
          <p
            lang={lang}
            style={{
              fontSize: 'var(--text-caption)',
              color: 'var(--color-ink-tertiary)',
              maxWidth: 420,
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            {t('public.footer.note', null, lang)}
          </p>
          <div
            style={{
              display: 'flex',
              gap: 'var(--space-5)',
              flexWrap: 'wrap',
            }}
          >
            <FooterLink href="/splash" lang={lang}>
              {t('public.footer.help', null, lang)}
            </FooterLink>
            <FooterLink href="#trust" lang={lang}>
              {t('public.footer.terms', null, lang)}
            </FooterLink>
            <FooterLink href="#trust" lang={lang}>
              {t('public.footer.privacy', null, lang)}
            </FooterLink>
            <FooterLink href="tel:0199000000" lang={lang}>
              {t('public.footer.hotline', null, lang)}
            </FooterLink>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FooterLink({
  href,
  lang,
  children,
}: {
  href: string;
  lang: Language;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      lang={lang}
      style={{
        fontSize: 'var(--text-caption)',
        color: 'var(--color-ink-secondary)',
        textDecoration: 'none',
      }}
    >
      {children}
    </Link>
  );
}

function Divider() {
  return (
    <span
      aria-hidden
      style={{
        width: 1,
        height: 12,
        background: 'var(--color-border)',
      }}
    />
  );
}

/**
 * Format a counter for display. Bangla renders the digits in
 * Bangla numerals (০১২৩৪৫৬৭৮৯) to match the rest of the Bangla-first
 * surface; English uses ASCII digits.
 *
 * `toLocaleString` on the `bn` locale gives Bangla digits with the
 * locale's own grouping separators, which is what a Bangla reader
 * expects for a count like 482.
 */
function formatNumber(value: number, lang: Language): string {
  return value.toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-US');
}

/**
 * The trend line under the "reports this month" counter.
 *
 * This used to be a fixed string — "More than last month" — shown
 * whatever the data said. That is a claim the platform could not
 * back: a city whose reports fell, or whose previous month was
 * empty, still showed "more than last month".
 *
 * The API now returns `reportsLastMonth` and a `trend` direction, and
 * the copy is chosen from those:
 *
 * - `up`    — more reports than last month, by the difference
 * - `down`  — fewer reports than last month, by the difference
 * - `flat`  — exactly the same number of reports
 * - `none`  — there was no previous month to compare against, so no
 *             trend is claimed at all
 *
 * The `none` case is why `trend` is a four-value enum rather than a
 * signed number: 0 against 0 is the ABSENCE of a comparison, not a
 * flat one, and dressing it up as "same as last month" would be a
 * claim about a month the city has no data for.
 */
function renderTrendFoot(
  stats: PublicActivityStats,
  lang: Language,
): string {
  switch (stats.trend) {
    case 'up':
      return t(
        'public.stats.trend.up',
        { count: formatNumber(stats.reportsThisMonth - stats.reportsLastMonth, lang) },
        lang,
      );
    case 'down':
      return t(
        'public.stats.trend.down',
        { count: formatNumber(stats.reportsLastMonth - stats.reportsThisMonth, lang) },
        lang,
      );
    case 'flat':
      return t('public.stats.trend.flat', null, lang);
    case 'none':
    default:
      return t('public.stats.trend.none', null, lang);
  }
}

/**
 * Render the ward pill's text.
 *
 * The seeded ward names ALREADY carry their ward number in the
 * word — "Ward 14" / "ওয়ার্ড 14". Prefixing the generic "ওয়ার্ড" /
 * "Ward" label therefore produced "ওয়ার্ড ওয়ার্ড 14", which reads
 * as a rendering bug to a citizen. The prefix is now applied only
 * when the name does not already lead with it.
 *
 * The raw wardId fallback ("cmvtghhkl00182f9o3q8zx2e8") gets the
 * prefix, because an opaque id needs the word to be readable at all.
 */
function renderWardLabel(ticket: PublicTicket, lang: Language): string {
  const name =
    lang === 'bn'
      ? ticket.wardNameBn ?? ticket.wardName
      : ticket.wardName ?? ticket.wardNameBn;

  if (name) {
    // If the name already starts with the ward word in either
    // language, show it alone.
    const alreadyLabelled =
      /^\s*(ward|ওয়ার্ড)\b/i.test(name) ||
      /^\s*ওয়ার্ড/i.test(name);
    if (alreadyLabelled) return name;
    return `${t('public.feed.ward', null, lang)} ${name}`;
  }

  return `${t('public.feed.ward', null, lang)} ${ticket.wardId}`;
}

/**
 * The note text the public card renders.
 *
 * Two cases need handling:
 *
 *  1. **No note at all.** The card used to render nothing in the
 *     note slot, which left the card visually short and made it
 *     look broken. A neutral placeholder says the citizen gave no
 *     description, which is a real and common state.
 *
 *  2. **Internal test-fixture text.** The seeded and test-generated
 *     rows carry notes like "No photo attached — placeholder
 *     regression fixture" and "Streetlight out — thumbnail
 *     regression fixture". Those are engineering strings describing
 *     a test, not a citizen's report of a broken streetlight. A
 *     visitor to the public landing page reading "regression
 *     fixture" concludes the platform is unfinished.
 *
 *     The fixture strings are detected and replaced with the neutral
 *     placeholder. The row itself is KEPT — it is a real report with
 *     a real status and a real ward; only its description text was
 *     never meant for the public. (The row count on the chip is
 *     therefore still honest.)
 */
export function renderPublicNote(
  note: string | null,
  lang: Language,
): string {
  const trimmed = (note ?? '').trim();
  const isFixture = /regression fixture|placeholder regression|test fixture/i.test(
    trimmed,
  );
  if (!trimmed || isFixture) {
    return t('public.card.no_note', null, lang);
  }
  return trimmed;
}

/**
 * One of the three stat cards under the hero CTA. The mockup's
 * "কীভাবে কাজ করে" section; the values come from the API.
 */
function StatCard({
  icon,
  label,
  value,
  foot,
  footTone = 'default',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  foot: string;
  /**
   * The colour of the foot line.
   *
   * `up` is the success green — a rise in reports is a GOOD thing
   * for a city (citizens are engaging). `down` is the warning tone,
   * for the month-over-month fall. `default` is the muted ink.
   */
  footTone?: 'default' | 'up' | 'down';
}) {
  return (
    <div
      style={{
        padding: 'var(--space-3)',
        background: 'var(--color-surface-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          fontSize: 'var(--text-caption)',
          color: 'var(--color-ink-secondary)',
          marginBottom: 'var(--space-1)',
        }}
      >
        <span aria-hidden style={{ display: 'inline-flex', color: 'var(--color-ink-tertiary)' }}>
          {icon}
        </span>
        <span>{label}</span>
      </div>
      <div
        style={{
          fontSize: 'var(--text-display-md)',
          fontWeight: 'var(--weight-semibold)',
          color: 'var(--color-ink)',
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1.15,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 'var(--text-caption)',
          marginTop: 2,
          color:
            footTone === 'up'
              ? 'var(--color-status-resolved)'
              : footTone === 'down'
                ? 'var(--color-warning)'
                : 'var(--color-ink-tertiary)',
        }}
      >
        {foot}
      </div>
    </div>
  );
}

/**
 * One of the three trust cards below the hero. Icon + title + a
 * one-line explanation — the mockup's reassurance section.
 */
function TrustCard({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 'var(--space-3)',
        padding: 'var(--space-4)',
        background: 'var(--color-surface-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <span
        aria-hidden
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 34,
          height: 34,
          flexShrink: 0,
          borderRadius: 'var(--radius-sm)',
          background: 'var(--color-primary-soft)',
          color: 'var(--color-primary)',
        }}
      >
        {icon}
      </span>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 'var(--text-body-sm)',
            fontWeight: 'var(--weight-semibold)',
            color: 'var(--color-ink)',
            marginBottom: 2,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 'var(--text-caption)',
            color: 'var(--color-ink-secondary)',
            lineHeight: 1.45,
          }}
        >
          {desc}
        </div>
      </div>
    </div>
  );
}

/** A coloured dot + label pair in the map legend. */
function LegendDot({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span
        aria-hidden
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: color,
        }}
      />
      {label}
    </span>
  );
}

function PlusIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      aria-hidden
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

/* --- Icons for the stats row and trust cards. Same 24×24 stroke
   geometry as the mockup so they sit on the same optical grid. --- */

function FileIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 3 3 5-6" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a15 15 0 0 1 4 9 15 15 0 0 1-4 9 15 15 0 0 1-4-9 15 15 0 0 1 4-9Z" />
    </svg>
  );
}

function PublicActivityCard({
  ticket,
  lang,
}: {
  ticket: PublicTicket;
  lang: Language;
}) {
  const statusLabel = t(`status.${ticket.status}`, null, lang);
  const colors = STATUS_COLORS[ticket.status];

  /**
   * The category label — WHAT kind of problem this report is.
   *
   * The public card used to show a bare status pill with no
   * indication of what had been reported, so a visitor scanning the
   * feed could not tell a streetlight report from a drainage one.
   * The category is public city configuration (the same list the
   * taxonomy page shows), so surfacing the name leaks nothing.
   */
  const categoryLabel =
    lang === 'bn'
      ? ticket.categoryNameBn ?? ticket.categoryName
      : ticket.categoryName ?? ticket.categoryNameBn;

  /**
   * The photo thumbnail.
   *
   * A stored photo URL can be an inline `data:` URL (the default
   * upload path), an absolute `https://` URL (R2/S3), or a
   * root-relative `/api/blob/…` path (the local blob provider).
   *
   * `firstDisplayablePhotoUrl` additionally REJECTS the degenerate
   * 1×1 / 2×2 PNG swatches the seeded and test-generated rows carry.
   * Those render as an 80×80 white or magenta tile — a wall of
   * magenta squares on a public page reads as a broken app, when in
   * fact the rows have no usable photograph. Falling through to the
   * "no photo" empty state is the honest rendering.
   */
  const photoUrl = firstDisplayablePhotoUrl(ticket.photoUrls);
  const hasPhoto = photoUrl !== null;

  return (
    <article
      style={{
        display: 'flex',
        gap: 'var(--space-3)',
        padding: 'var(--space-3)',
        background: 'var(--color-surface-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        minHeight: 120,
      }}
    >
      {hasPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl!}
          alt=""
          style={{
            width: 80,
            height: 80,
            borderRadius: 'var(--radius-sm)',
            objectFit: 'cover',
            flexShrink: 0,
            background: 'var(--color-surface-raised)',
          }}
        />
      ) : (
        /*
         * No displayable photo → the shared "no photo" empty state
         * (dashed border + camera glyph + label). Bolt 008-011
         * introduced this markup inline; it now lives in
         * components/ui/PhotoPlaceholder.tsx so the feed, home list
         * and report cards all render the SAME empty state.
         */
        <PhotoPlaceholder size={80} lang={lang} showLabel />
      )}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            justifyContent: 'space-between',
          }}
        >
          <span
            lang={lang}
            style={{
              padding: '3px var(--space-2)',
              background: colors.bg,
              color: colors.fg,
              borderRadius: 'var(--radius-pill)',
              fontSize: 11,
              fontWeight: 'var(--weight-semibold)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              whiteSpace: 'nowrap',
              lineHeight: 1.2,
            }}
          >
            {statusLabel}
          </span>
          <span
            lang={lang}
            style={{
              fontSize: 'var(--text-caption)',
              color: 'var(--color-ink-tertiary)',
              whiteSpace: 'nowrap',
            }}
          >
            {formatAge(ticket.createdAt, lang)}
          </span>
        </div>

        {/*
          The category — WHAT was reported. Rendered above the note
          so the card reads "Broken streetlight / streetlight out on
          Mirpur road" rather than a bare status pill floating over
          free text. Falls back to a neutral label when the backend
          join is absent.
        */}
        <div
          lang={lang}
          style={{
            fontSize: 'var(--text-body-sm)',
            fontWeight: 'var(--weight-semibold)',
            color: 'var(--color-ink)',
            lineHeight: 1.35,
          }}
        >
          {categoryLabel ?? t('public.card.category_unknown', null, lang)}
        </div>

        {/*
          The citizen's own description. `renderPublicNote` strips
          the internal test-fixture strings the seeded rows carry
          ("… regression fixture") and substitutes a neutral
          placeholder, because those strings are not something a
          visitor to the public landing page should be reading.
        */}
        <p
          lang={lang}
          style={{
            fontSize: 'var(--text-body-sm)',
            color: ticket.note ? 'var(--color-ink)' : 'var(--color-ink-tertiary)',
            margin: 0,
            lineHeight: 1.45,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {renderPublicNote(ticket.note, lang)}
        </p>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            marginTop: 'auto',
            flexWrap: 'wrap',
          }}
        >
          {/*
            Bolt 008-011: ward pill now renders the human-readable
            ward name (e.g. "Ward 14 — Mirpur") instead of slicing
            the raw wardId ("cmv53x"). Falls back to the id slice
            when the join is missing on older payloads. The
            location-pin glyph + a soft surface tint give the pill
            a more "city bulletin" look on both light and dark
            themes.
          */}
          <span
            lang={lang}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px var(--space-2)',
              background: 'var(--color-primary-soft)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-pill)',
              fontSize: 'var(--text-caption)',
              color: 'var(--color-ink)',
              fontWeight: 'var(--weight-semibold)',
            }}
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
              style={{ flexShrink: 0 }}
            >
              <path d="M12 22s-7-7.5-7-12a7 7 0 0 1 14 0c0 4.5-7 12-7 12z" />
              <circle cx="12" cy="10" r="2.5" />
            </svg>
            <span>{renderWardLabel(ticket, lang)}</span>
          </span>
        </div>
      </div>
    </article>
  );
}

function FeedSkeleton() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 'var(--space-3)',
      }}
    >
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            gap: 'var(--space-3)',
            padding: 'var(--space-3)',
            background: 'var(--color-surface-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            minHeight: 96,
          }}
        >
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-surface-raised)',
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1 }}>
            <div
              style={{
                width: '40%',
                height: 10,
                background: 'var(--color-surface-raised)',
                borderRadius: 4,
                marginBottom: 6,
              }}
            />
            <div
              style={{
                width: '85%',
                height: 10,
                background: 'var(--color-surface-raised)',
                borderRadius: 4,
                marginBottom: 6,
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
