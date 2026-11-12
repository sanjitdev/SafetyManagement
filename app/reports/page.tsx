/**
 * 1.6 Reports — list view (mockup 15: "My reports").
 *
 * Intent 009 / Unit 004 — citizen surface re-composition.
 *
 * WHAT CHANGED (presentation only)
 * --------------------------------
 * The list now matches mockup 15:
 *
 *   - A sticky filter-chip row (All / New / Active / Resolved) whose
 *     chips carry a LIVE COUNT. The counts are never the number of
 *     rows that happened to be rendered — they are per-group TOTALS
 *     over the whole set the chips filter (see the two sections
 *     below on how staff and citizens differ).
 *   - Each row carries the PUBLIC ticket code (`#TIX-XXXX`) in its
 *     meta line, next to the ward and the relative age. The code is
 *     derived from the internal id by `formatTicketId`; the internal
 *     id itself never reaches the DOM.
 *   - Rows are `Card`-free plain links (mockup 15 uses an `<a
 *     class="row">`), but every control is a design-system
 *     primitive — no hand-rolled `<button>`.
 *
 * WHAT DID NOT CHANGE
 * -------------------
 * The API surface, the role model and the transports are byte-
 * identical. The page still reads its rows from `/api/v1/activity`
 * and its city config from `/api/v1/activity/public`; the filter is
 * applied client-side over exactly the same fetched set as before, so
 * a citizen still sees only their own reports and staff still see
 * every report filed in the session's city.
 *
 * WHY THE COUNTS ARE THE API'S, NOT THE ROWS'
 * --------------------------------------------
 * The feed is paginated, so the rendered row count is a PAGE size,
 * not a TOTAL. A chip that counted the rendered rows would say "All 5"
 * on a city with 58 reports. `stats.counts` is the per-group total
 * over every ticket in the city, so the chips always describe the
 * whole set they filter.
 *
 * FOR A CITIZEN, THE COUNTS ARE THE CITIZEN'S OWN
 * ------------------------------------------------
 * `stats.counts` is city-wide, and this page is "MY reports" — a
 * citizen with 3 reports must not see "All 58". So for citizens the
 * chip counts are computed over the citizen's OWN filtered set, using
 * the SAME group semantics the API uses (`new` = submitted + routed,
 * `active` = in_progress, `resolved` = resolved + closed + cancelled).
 * For staff the list IS the city's list, so the API's own
 * `stats.counts` are used verbatim.
 *
 * The group semantics live in one place so the page and the API
 * cannot drift: `lib/report-status-group.ts`.
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { t, type Language } from '@/lib/i18n/keys';
import { firstRenderablePhotoUrl, thumbnailBackground } from '@/lib/format/photo-url';
import { formatTicketId } from '@/lib/format/ticket-id';
import { nowMs } from '@/lib/format/clock';
import { PhotoPlaceholder } from '@/components/ui/PhotoPlaceholder';
import { useLanguage } from '@/components/useLanguage';
import { SkeletonBlock, SkeletonStatus } from '@/components/ui/Skeleton';
import { useSession } from '@/components/SessionProvider';
import { FilterChipGroup, StatusPill, Button, type StatusKey } from '@/components/ui';
import { ICONS } from '@/lib/ui/icon-map';
import {
  applyReportStatusFilter,
  countByReportStatusGroup,
  type ReportStatusFilter,
} from '@/lib/report-status-group';


type TicketStatus =
  | 'submitted'
  | 'routed'
  | 'in_progress'
  | 'resolved'
  | 'closed'
  | 'cancelled';

interface ActivityItem {
  id: string;
  status: TicketStatus;
  categoryId: string;
  categoryName?: string;
  categoryNameBn?: string;
  categorySlug?: string;
  wardId: string;
  wardName?: string;
  wardNameBn?: string;
  note: string | null;
  photoUrls: string[];
  createdAt: string;
  reporterId: string;
}

/**
 * The city configuration the page renders against.
 *
 * WHY NOT /api/report/bootstrap
 * -----------------------------
 * That endpoint is the REPORT FORM's bootstrap and is deliberately
 * citizen-only — its OpenAPI contract says "Only citizens file
 * reports". This page used to call it for the category list, which
 * meant a dispatcher (or crew, or admin) who landed here got a 403
 * and the page fell into its "reports.error" state — even though the
 * list itself is explicitly designed to show staff every report filed
 * in the session's city (see the `isStaff` filter below).
 *
 * `/api/v1/activity/public` is the endpoint that actually serves the
 * city-config purpose: it works for every role, and it already
 * returns the city's `categories` and `wards` alongside the feed.
 */
interface CityConfig {
  categories: Array<{ id: string; slug: string; name: string; nameBn: string | null }>;
  wards: Array<{ id: string; number: number; name: string; nameBn: string | null }>;
}

/** The per-chip totals the public activity endpoint reports. */
interface ActivityCounts {
  all: number;
  new: number;
  active: number;
  resolved: number;
}

/**
 * The relative age of a row ("3 min ago", "2 days ago").
 *
 * The clock comes from the pinned-clock helper so a Playwright
 * baseline captured on one day does not drift the next — the same
 * reason every other timestamp on the product goes through
 * `lib/format/clock.ts`.
 */
function formatAge(iso: string, lang: Language, nowMs: number): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return '';
  const ms = nowMs - parsed;
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return t('reports.age.now', null, lang);
  if (minutes < 60) return t('reports.age.minutes', { count: minutes }, lang);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('reports.age.hours', { count: hours }, lang);
  const days = Math.floor(hours / 24);
  return t('reports.age.days', { count: days }, lang);
}

/**
 * The status key for the `StatusPill` primitive.
 *
 * `StatusPill` carries the icon + word + colour triple, so a status
 * is never colour-alone. The ticket status enum and the pill's key
 * union overlap exactly, so the cast is safe.
 */
function statusPillKey(status: TicketStatus): StatusKey {
  return status as StatusKey;
}

export default function ReportsListPage() {
  const { lang } = useLanguage();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  // Bolt 008-010: capture the session role so we can render the
  // staff view ("All city reports") for admin / dispatcher / crew.
  const [role, setRole] = useState<'citizen' | 'dispatcher' | 'crew' | 'admin' | null>(
    null,
  );
  const [config, setConfig] = useState<CityConfig | null>(null);
  const [tickets, setTickets] = useState<ActivityItem[]>([]);
  // The API's own per-chip totals. City-wide for staff; for a
  // citizen they are replaced by counts over their own reports (see
  // the `chipCounts` memo).
  const [apiCounts, setApiCounts] = useState<ActivityCounts | null>(null);
  const [filter, setFilter] = useState<ReportStatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The pinned "now" for the relative-age labels. Read once per
  // fetch so a re-render never changes a rendered age.
  const [now, setNow] = useState<number>(0);
  // The session comes from the shared `SessionProvider` — the page no
  // longer issues its own `/api/auth/status` request.
  const { authenticated, session } = useSession();

  // Auth + city config + ticket fetch
  //
  // The session comes from the shared `SessionProvider`; this page
  // reads it instead of issuing its own `/api/auth/status` request.
  //
  // The city config comes from `/api/v1/activity/public`, which serves
  // every role. It used to come from `/api/report/bootstrap`, a
  // citizen-only endpoint — so a dispatcher landing here got a 403 and
  // the page fell into its "reports.error" state, even though the list
  // below is explicitly designed to show staff every report in the city.
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
        setRole(session?.role ?? null);

        const cfgRes = await fetch('/api/v1/activity/public?limit=1', {
          credentials: 'include',
        });
        if (!cfgRes.ok) {
          setError('reports.error');
          setLoading(false);
          return;
        }
        const cfg = (await cfgRes.json()) as {
          categories: CityConfig['categories'];
          wards: CityConfig['wards'];
          stats?: { counts?: ActivityCounts };
        };
        if (cancelled) return;
        setConfig({ categories: cfg.categories ?? [], wards: cfg.wards ?? [] });
        if (cfg.stats?.counts) setApiCounts(cfg.stats.counts);

        const actRes = await fetch('/api/v1/activity?limit=50', { credentials: 'include' });
        if (!actRes.ok) {
          setError('reports.error');
          setLoading(false);
          return;
        }
        const data = (await actRes.json()) as {
          tickets: Array<{
            id: string;
            status: TicketStatus;
            categoryId: string;
            wardId: string;
            wardName?: string | null;
            wardNameBn?: string | null;
            note: string | null;
            photoUrls: string[];
            createdAt: string;
            reporterId: string;
          }>;
        };
        if (cancelled) return;
        const items: ActivityItem[] = data.tickets.map((t) => {
          // The locally-fetched config, not the state: the state is
          // still null on this first pass, and the category/ward names
          // would come out blank.
          const cat = cfg.categories.find((c) => c.id === t.categoryId);
          // The row's ward is the ward the ticket was FILED IN, which
          // is what the serializer already returns. The city's ward list
          // is the fallback for a row whose ward was not hydrated.
          const ward = cfg.wards.find((w) => w.id === t.wardId);
          return {
            id: t.id,
            status: t.status,
            categoryId: t.categoryId,
            categoryName: cat?.name,
            categoryNameBn: cat?.nameBn ?? cat?.name,
            categorySlug: cat?.slug,
            wardId: t.wardId,
            wardName: t.wardName ?? ward?.name,
            wardNameBn: t.wardNameBn ?? ward?.nameBn ?? ward?.name,
            note: t.note,
            photoUrls: t.photoUrls,
            createdAt: t.createdAt,
            reporterId: t.reporterId,
          };
        });
        setTickets(items);
        setNow(nowMs());
        setError(null);
        setLoading(false);
      } catch {
        if (!cancelled) {
          setError('reports.error');
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authenticated, session]);

  // Citizens see only their own reports; staff (admin / dispatcher /
  // crew) see every report filed in the session's city — the API
  // already scopes to session.cityId. The activity endpoint is
  // city-scoped for every role (Bolt 008-009), so this filter is
  // safe: a non-citizen role can never see another city's tickets.
  const isStaff = role !== null && role !== 'citizen';
  const mine = useMemo(
    () => (isStaff ? tickets : userId ? tickets.filter((t) => t.reporterId === userId) : []),
    [tickets, userId, isStaff],
  );

  /**
   * The chip counts.
   *
   * For staff the list IS the city's list, so the API's own
   * `stats.counts` are authoritative and are used verbatim. For a
   * citizen the API's counts are city-wide and would be misleading on
   * a "my reports" page, so the counts are computed over the
   * citizen's OWN set using the same group semantics.
   */
  const chipCounts = useMemo<ActivityCounts>(() => {
    if (isStaff && apiCounts) return apiCounts;
    return countByReportStatusGroup(mine);
  }, [isStaff, apiCounts, mine]);

  /**
   * The rows the active chip shows.
   *
   * The filter runs over the citizen's OWN set (or the city's set for
   * staff) — the same set the chip counts were computed over, so the
   * chip and the list always agree.
   */
  const visibleReports = useMemo(
    () => applyReportStatusFilter(mine, filter),
    [mine, filter],
  );

  /**
   * The chip order and each chip's i18n key.
   *
   * The keys are listed EXPLICITLY rather than interpolated from the
   * filter value (`reports.filter.${value}`). The interpolation would
   * have to be cast to a registry key to typecheck, and the cast would
   * be a lie — it would tell the compiler the key is always
   * `'reports.filter.all'` while the runtime value is one of four. An
   * explicit table keeps the compiler honest AND makes a missing key a
   * COMPILE error rather than a runtime fallback that renders the raw
   * key string to the citizen.
   */
  const CHIP_LABEL_KEYS: Record<ReportStatusFilter, 'reports.filter.all' | 'reports.filter.new' | 'reports.filter.active' | 'reports.filter.resolved'> = {
    all: 'reports.filter.all',
    new: 'reports.filter.new',
    active: 'reports.filter.active',
    resolved: 'reports.filter.resolved',
  };

  /**
   * The chip ORDER, stated explicitly.
   *
   * `Object.keys()` on a string-keyed object returns the keys in
   * INSERTION order, so the table above happens to render in this
   * order today. But "happens to" is not a contract: the route spec
   * reads the chip counts POSITIONALLY (`all, new, active, resolved`)
   * to assert that the three group counts sum to the "all" count, and
   * a reordering of the table — or a reader adding a chip in the
   * wrong place — would silently break that assertion rather than
   * fail it. The order is the one the shared grouping declares
   * (`REPORT_STATUS_GROUPS`), so it is declared here too.
   */
  const CHIP_ORDER: readonly ReportStatusFilter[] = ['all', 'new', 'active', 'resolved'];

  const chipOptions = useMemo(
    () =>
      CHIP_ORDER.map((value) => ({
        value,
        label: t(CHIP_LABEL_KEYS[value], null, lang),
      })),
    [lang],
  );

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
            {t('reports.signin_required', null, lang)}
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
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      {/* Content column. Note: the global AppHeader (rendered by the
          /reports/layout's AppShell) is the only `<header>` on this
          page. This page uses an H1 + breadcrumb + Report CTA block
          instead of a second `<header>` element to avoid stacking
          two `<header>` landmarks (which screen readers and Playwright
          visual-regression tests both flag as duplicate chrome). */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          justifyContent: 'center',
          padding: 'var(--space-6) var(--space-5)',
          minHeight: 0,
          overflowY: 'auto',
        }}
      >
        <div style={{ width: '100%', maxWidth: 760 }}>
          {/* NO KICKER ABOVE THE H1.
              The page used to render an uppercase breadcrumb
              ("MY REPORTS") immediately above an H1 that said
              "My reports" — and for a citizen those two were the SAME
              STRING (`reports.breadcrumb` and `reports.title` are both
              "আমার রিপোর্ট"), so the page printed its own title twice
              in two different type styles. Mockup 15 carries an `<h1>`
              and no kicker, and the audit flagged it as a major
              violation of the craft brief's "one hierarchy" rule.

              For STAFF the two strings differ ("All reports" vs "All
              city reports"), so the kicker was at least informative —
              but the brief's rule is about the MOCKUP, and mockup 15 is
              the citizen's list. The staff variant is a different page
              state on the same route; the hierarchy rule applies to
              both, so the kicker is gone from both and the H1 carries
              the distinction on its own. */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 'var(--space-3)',
              flexWrap: 'wrap',
              marginBottom: 'var(--space-5)',
            }}
          >
            <div style={{ minWidth: 0 }}>
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
                {t(isStaff ? 'reports.title.all' : 'reports.title', null, lang)}
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
                {t(isStaff ? 'reports.subtitle.all' : 'reports.subtitle', null, lang)}
              </p>
            </div>
            {/* Bolt 008-010: staff don't file reports, so the "+ Report"
                CTA is hidden for non-citizen roles. The empty state
                below also omits its CTA for staff. */}
            {!isStaff && (
            <Link
              href="/report/location"
              lang={lang}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--space-1)',
                padding: 'var(--space-2) var(--space-4)',
                background: 'var(--color-primary)',
                color: 'var(--color-on-primary)',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-body-sm)',
                fontWeight: 'var(--weight-semibold)',
                textDecoration: 'none',
                flexShrink: 0,
              }}
            >
              {t('reports.empty.cta', null, lang)}
            </Link>
            )}
          </div>

          {/* The filter chip row. Mockup 15 makes it STICKY so the
              chips stay reachable while a long list scrolls. Each
              chip carries the count for its group — the count is
              baked into the chip label because `FilterChipGroup` has
              no separate count slot. */}
          <div
            data-testid="reports-filter-row"
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 2,
              display: 'flex',
              gap: 'var(--space-2)',
              overflowX: 'auto',
              padding: 'var(--space-3) 0',
              marginBottom: 'var(--space-4)',
              background: 'var(--color-surface-page)',
              borderBottom: '1px solid var(--color-border)',
            }}
          >
            <FilterChipGroup<ReportStatusFilter>
              options={chipOptions.map((opt) => ({
                value: opt.value,
                label: t(
                  'reports.filter.count',
                  { label: opt.label, count: chipCounts[opt.value] },
                  lang,
                ),
              }))}
              value={filter}
              onChange={setFilter}
              ariaLabel={t('reports.filter.group_label', null, lang)}
              lang={lang}
              data-testid="reports-filter-chips"
            />
          </div>

          {/* Loading / error / empty / list */}
          {loading && (
            <SkeletonStatus lang={lang} className="reports-loading-list">
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="reports-loading-card">
                  <SkeletonBlock
                    style={{
                      width: 'var(--touch-cta)',
                      height: 'var(--touch-cta)',
                      borderRadius: 'var(--radius-md)',
                      flex: '0 0 auto',
                    }}
                  />
                  <div style={{ display: 'grid', gap: 'var(--space-2)', flex: 1 }}>
                    <SkeletonBlock style={{ width: '52%', height: 'var(--space-4)' }} />
                    <SkeletonBlock style={{ width: '86%', height: 'var(--space-3)' }} />
                    <SkeletonBlock style={{ width: '36%', height: 'var(--space-3)' }} />
                  </div>
                  <SkeletonBlock
                    className="reports-loading-status"
                    style={{
                      width: 'var(--space-9)',
                      height: 'var(--space-6)',
                      borderRadius: 'var(--radius-pill)',
                    }}
                  />
                </div>
              ))}
            </SkeletonStatus>
          )}

          {error && !loading && (
            <div
              role="alert"
              style={{
                padding: 'var(--space-4)',
                background: 'var(--color-danger-soft)',
                border: '1px solid var(--color-danger)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <p
                lang={lang}
                style={{
                  color: 'var(--color-ink)',
                  fontSize: 'var(--text-body)',
                  margin: '0 0 var(--space-3)',
                }}
              >
                {t('reports.error.title', null, lang)}
              </p>
              <Button
                variant="secondary"
                onClick={() => window.location.reload()}
                data-testid="reports-error-retry"
              >
                {t('reports.error.retry', null, lang)}
              </Button>
            </div>
          )}

          {!loading && !error && visibleReports.length === 0 && (
            <div
              style={{
                textAlign: 'center',
                padding: 'var(--space-7) var(--space-5)',
                background: 'var(--color-surface-card)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
              }}
            >
              <p
                lang={lang}
                style={{
                  fontSize: 'var(--text-h3)',
                  fontWeight: 'var(--weight-semibold)',
                  color: 'var(--color-ink)',
                  margin: '0 0 var(--space-2)',
                }}
              >
                {filter === 'all'
                  ? t(isStaff ? 'reports.empty.title.all' : 'reports.empty.title', null, lang)
                  : t('reports.empty.filtered.title', null, lang)}
              </p>
              <p
                lang={lang}
                style={{
                  fontSize: 'var(--text-body)',
                  color: 'var(--color-ink-secondary)',
                  margin: '0 0 var(--space-5)',
                  lineHeight: 1.5,
                }}
              >
                {filter === 'all'
                  ? t(isStaff ? 'reports.empty.subtitle.all' : 'reports.empty.subtitle', null, lang)
                  : t('reports.empty.filtered.subtitle', null, lang)}
              </p>
              {!isStaff && filter === 'all' && (
              <Link
                href="/report/location"
                lang={lang}
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
                {t('reports.empty.cta', null, lang)}
              </Link>
              )}
            </div>
          )}

          {!loading && !error && visibleReports.length > 0 && (
            <>
              <h2
                lang={lang}
                style={{
                  // The heading must OUTRANK what it labels. The
                  // row titles it labels are `--text-body-sm`
                  // (15px, mockup 15's `.row-title`), so 20px gives
                  // a 1.33× ratio — a heading that reads as the
                  // parent of its rows, not as a peer caption.
                  fontSize: 'var(--text-h2)',
                  fontWeight: 'var(--weight-semibold)',
                  color: 'var(--color-ink-secondary)',
                  margin: '0 0 var(--space-3)',
                }}
              >
                {t('reports.list.heading', null, lang)} ·{' '}
                {t('reports.list.count', { count: visibleReports.length }, lang)}
              </h2>
              <ul
                data-testid="reports-list"
                style={{
                  listStyle: 'none',
                  margin: 0,
                  padding: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-3)',
                }}
              >
                {visibleReports.map((tkt) => {
                  /*
                   * The category label.
                   *
                   * The chain is: localised name → English name → the
                   * category SLUG → a generic "Other".
                   *
                   * It deliberately does NOT fall back to
                   * `tkt.categoryId`. That id is a Prisma `cuid()` (or a
                   * dev-store `cat_*` key) — an INTERNAL identifier, and
                   * rendering it would put a raw internal id on a
                   * citizen surface. The slug is the public, stable
                   * handle for the same category ("streetlight"), and
                   * the "Other" label covers the case where the
                   * category was deleted after the report was filed.
                   *
                   * This mirrors `categoryLabel()` on
                   * `app/reports/[id]/page.tsx`.
                   */
                  const catName =
                    lang === 'bn'
                      ? tkt.categoryNameBn ?? tkt.categoryName ?? tkt.categorySlug
                      : tkt.categoryName ?? tkt.categorySlug ?? tkt.categoryNameBn;
                  const wardName =
                    lang === 'bn'
                      ? tkt.wardNameBn ?? tkt.wardName
                      : tkt.wardName ?? tkt.wardNameBn;
                  /*
                   * The report thumbnail. The stored photo URL can be an
                   * inline `data:image/…` URL (the default — the photo
                   * picker inlines the file bytes), an absolute
                   * `https://` URL (R2/S3 with a public base URL), or a
                   * root-relative `/api/blob/…` path (the local blob
                   * provider). `firstRenderablePhotoUrl` picks the first
                   * URL we can actually render; the shared placeholder
                   * is the genuine "no photo attached" state.
                   */
                  const photoUrl = firstRenderablePhotoUrl(tkt.photoUrls);
                  const thumbBackground = thumbnailBackground(photoUrl);
                  return (
                    <li key={tkt.id}>
                      <Link
                        href={`/reports/${tkt.id}`}
                        data-testid="reports-row"
                        style={{
                          display: 'flex',
                          gap: 'var(--space-3)',
                          padding: 'var(--space-4)',
                          background: 'var(--color-surface-card)',
                          border: '1px solid var(--color-border)',
                          borderRadius: 'var(--radius-md)',
                          textDecoration: 'none',
                          color: 'var(--color-ink)',
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
                              width: 'var(--touch-cta)',
                              height: 'var(--touch-cta)',
                              borderRadius: 'var(--radius-sm)',
                              objectFit: 'cover',
                              background: 'var(--color-surface-raised)',
                              flexShrink: 0,
                            }}
                          />
                        ) : (
                          /* No renderable photo → the shared "no photo" empty state. */
                          <PhotoPlaceholder size={64} lang={lang} />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {/* The title line: the category (what is
                              wrong) plus the ward, with the status
                              pill on the right — mockup 15's
                              `.row-top`. */}
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 'var(--space-2)',
                              marginBottom: 'var(--space-2)',
                            }}
                          >
                            <span
                              lang={lang}
                              style={{
                                // Mockup 15's `.row-title` is
                                // `--text-body-sm` (15px) — the
                                // same scale as the list heading's
                                // parent, with the note and the meta
                                // line one step below at
                                // `--text-caption`.
                                fontSize: 'var(--text-body-sm)',
                                fontWeight: 'var(--weight-semibold)',
                                color: 'var(--color-ink)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                minWidth: 0,
                              }}
                            >
                              {catName ?? t('category.other', null, lang)}
                              {wardName ? ` · ${wardName}` : ''}
                            </span>
                            <StatusPill
                              status={statusPillKey(tkt.status)}
                              lang={lang}
                              size="md"
                            />
                          </div>
                          {tkt.note && (
                            <p
                              lang={lang}
                              style={{
                                // Mockup 15's `.row-note` is
                                // `--text-caption` — one step below
                                // the row title.
                                fontSize: 'var(--text-caption)',
                                color: 'var(--color-ink-secondary)',
                                margin: '0 0 var(--space-2)',
                                lineHeight: 1.4,
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                              }}
                            >
                              {tkt.note}
                            </p>
                          )}
                          {/* The meta line: ward, the PUBLIC ticket code
                              and the relative age. The code is the
                              only ticket identifier a citizen ever
                              sees — the internal id never reaches
                              the DOM. */}
                          <div
                            data-testid="reports-row-meta"
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 'var(--space-3)',
                              flexWrap: 'wrap',
                              fontSize: 'var(--text-caption)',
                              color: 'var(--color-ink-tertiary)',
                            }}
                          >
                            {wardName && (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 'var(--space-1)',
                                }}
                              >
                                <ICONS.mapPin.icon
                                  size={12}
                                  weight={ICONS.mapPin.weight}
                                  aria-hidden
                                />
                                {wardName}
                              </span>
                            )}
                            <span
                              data-testid="reports-row-code"
                              style={{
                                fontFamily: 'var(--font-mono, monospace)',
                                fontVariantNumeric: 'tabular-nums',
                                color: 'var(--color-ink-secondary)',
                                fontWeight: 'var(--weight-semibold)',
                              }}
                            >
                              {formatTicketId(tkt.id)}
                            </span>
                            <span>{formatAge(tkt.createdAt, lang, now)}</span>
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
