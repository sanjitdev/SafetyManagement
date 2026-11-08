/**
 * Dispatcher triage queue (/dispatcher).
 *
 * DISP-002 (Intent 003, Unit 002): the dispatcher's primary
 * surface. Lists tickets in (submitted, routed) status, scoped
 * to the dispatcher's session (cityId, wardId, departmentId),
 * sorted oldest-first. Polls every 30 s.
 *
 * Layout (3-region desktop work surface, per WO-002 mockup
 * 05 daily-queue-dashboard):
 *   - Top bar: brand + dispatcher's ward · department badge,
 *     language toggle, theme toggle, logout.
 *   - Filter rail: status filter (All / Submitted / Routed),
 *     poll-state indicator, "Possible duplicates" link to
 *     /dispatcher/dedup (N=0 placeholder in v1; Unit 004
 *     wires the count).
 *   - Queue list: rows sorted oldest-first. Each row has
 *     category icon, ward, age, status pill, reporter id
 *     (real, not anonymised — the dispatcher needs it),
 *     "View ticket" link.
 *
 * Auth gate: the page redirects to /login if no session is
 * resolved. The API also enforces the same gate.
 *
 * Out of scope (v1): WebSocket / SSE updates (the page polls).
 * Out of scope (v1.1): map view.
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { t, type Language } from '@/lib/i18n/keys';
import { firstRenderablePhotoUrl, thumbnailBackground } from '@/lib/format/photo-url';
import { formatWeekday } from '@/lib/format/datetime';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { MetricStrip } from '@/components/ui/MetricStrip';
import { SkeletonBlock, SkeletonStatus } from '@/components/ui/Skeleton';
import { useSession } from '@/components/SessionProvider';
import type { CityActivityPin, CityActivityStatus } from '@/components/CityActivityMap';
import { ICONS } from '@/lib/ui/icon-map';
import type { PerfSnapshot } from '@/lib/dispatcher/performance';

const LANG_KEY = 'cityfix.preferred_language.v1';
const POLL_INTERVAL_MS = 30_000;
const DHAKA_CENTER = { lat: 23.789, lng: 90.4075 };
const CityActivityMap = dynamic(() => import('@/components/CityActivityMap'), { ssr: false, loading: () => <SkeletonBlock style={{ width: '100%', height: '100%', minHeight: 280 }} /> });

type TicketStatus = 'submitted' | 'routed' | 'in_progress' | 'resolved' | 'closed' | 'cancelled';

interface QueueTicket {
  id: string;
  status: TicketStatus;
  cityId: string;
  wardId: string;
  categoryId: string;
  categoryName?: string | null;
  categoryNameBn?: string | null;
  categorySlug?: string | null;
  wardName?: string | null;
  wardNameBn?: string | null;
  locationLat: number;
  locationLng: number;
  note: string | null;
  reporterId: string;
  reporterName?: string | null;
  photoUrls: string[];
  createdAt: string;
}

type QueueFilter = 'all' | 'submitted' | 'routed';

function formatAge(iso: string, lang: Language): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) {
    return lang === 'bn' ? 'এইমাত্র' : 'just now';
  }
  if (minutes < 60) {
    return lang === 'bn'
      ? `${minutes} মিনিট আগে`
      : `${minutes} min ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return lang === 'bn'
      ? `${hours} ঘণ্টা আগে`
      : `${hours} hr ago`;
  }
  const days = Math.floor(hours / 24);
  return lang === 'bn'
    ? `${days} দিন আগে`
    : `${days} day ago`;
}


/**
 * Human label for the ticket's ward. Falls back to the raw id when
 * the backend join is missing (older API payloads), so the row is
 * never blank.
 */
function wardLabel(ticket: QueueTicket, lang: Language): string {
  const name = lang === 'bn' ? ticket.wardNameBn : ticket.wardName;
  return name ?? ticket.wardId;
}

/**
 * Human label for the ticket's category. Falls back to the raw id
 * when the backend join is missing.
 */
function categoryLabel(ticket: QueueTicket, lang: Language): string {
  const name = lang === 'bn' ? ticket.categoryNameBn : ticket.categoryName;
  return name ?? ticket.categoryId;
}

/**
 * The dispatcher's scope tag in the sub-header: role + ward +
 * department. Previously a hardcoded English string that also leaked
 * the raw `ward_14` / `dept_streetlight` ids into the UI. The ward +
 * department names come from the session (`/api/auth/status`).
 */
function scopeLabel(
  lang: Language,
  scope: {
    wardName?: string | null;
    wardNameBn?: string | null;
    departmentName?: string | null;
    departmentNameBn?: string | null;
  } | null,
): string {
  const parts: string[] = [t('dispatcher.queue.scope', null, lang)];
  const ward = lang === 'bn' ? scope?.wardNameBn : scope?.wardName;
  if (ward) {
    // The ward's display name already carries its own prefix
    // ("Ward 14 — Mirpur" / "ওয়ার্ড ১৪ — মিরপুর"), so wrapping it in
    // the "Ward {ward}" template rendered "ওয়ার্ড ওয়ার্ড ১৪ — মিরপুর".
    // Only bare-number wards get the template.
    parts.push(
      /^\s*(ward|ওয়ার্ড)\b/i.test(ward)
        ? ward
        : t('dispatcher.queue.scope.ward', { ward }, lang),
    );
  }
  const dept = lang === 'bn' ? scope?.departmentNameBn : scope?.departmentName;
  if (dept) {
    parts.push(t('dispatcher.queue.scope.department', { dept }, lang));
  }
  return parts.join(' · ');
}

export default function DispatcherPage() {
  const [lang, setLang] = useState<Language>('bn');
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [scope, setScope] = useState<{
    wardName?: string | null;
    wardNameBn?: string | null;
    departmentName?: string | null;
    departmentNameBn?: string | null;
  } | null>(null);
  const [tickets, setTickets] = useState<QueueTicket[]>([]);
  const [activityTickets, setActivityTickets] = useState<QueueTicket[]>([]);
  const [performance, setPerformance] = useState<PerfSnapshot | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<QueueFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The shared session — one request for the whole page.
  const { authenticated, session } = useSession();
  const [lastPollAt, setLastPollAt] = useState<string | null>(null);
  const [dedupPendingCount, setDedupPendingCount] = useState<number>(0);
  const previousIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    function syncLang() {
      try {
        const stored = window.localStorage.getItem(LANG_KEY);
        if (stored === 'en' || stored === 'bn') setLang(stored);
      } catch {
        // ignore
      }
    }
    syncLang();
    // Listen for cross-component lang changes (the global AppHeader
    // writes the same key on toggle, but `storage` events only fire
    // for OTHER tabs/windows. So we also poll on focus + a small
    // interval, which catches same-tab updates cheaply).
    window.addEventListener('storage', syncLang);
    window.addEventListener('focus', syncLang);
    const id = window.setInterval(syncLang, 1000);
    return () => {
      window.removeEventListener('storage', syncLang);
      window.removeEventListener('focus', syncLang);
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    setSearchQuery(new URLSearchParams(window.location.search).get('q') ?? '');
  }, []);

  const fetchQueue = useCallback(async () => {
    try {
      const status =
        filter === 'all' ? undefined : filter;
      const qs = new URLSearchParams();
      if (status) qs.set('status', status);
      qs.set('limit', '50');
      const url =
        '/api/v1/dispatcher/queue' + (qs.toString() ? `?${qs.toString()}` : '');
      const [res, activityRes, performanceRes] = await Promise.all([
        fetch(url, { credentials: 'include' }),
        fetch('/api/v1/activity?limit=50', { credentials: 'include' }),
        fetch('/api/v1/dispatcher/performance?days=7', { credentials: 'include' }),
      ]);
      if (!res.ok) {
        setError('dispatcher.queue.error');
        setLoading(false);
        return;
      }
      const data = (await res.json()) as {
        tickets: Array<{
          id: string;
          status: TicketStatus;
          cityId: string;
          wardId: string;
          wardName?: string | null;
          wardNameBn?: string | null;
          categoryId: string;
          categorySlug?: string | null;
          categoryName?: string | null;
          categoryNameBn?: string | null;
          locationLat: number;
          locationLng: number;
          note: string | null;
          photoUrls: string[];
          reporterId: string;
          reporterName?: string | null;
          createdAt: string;
          internalNote: string | null;
          assignedCrewId: string | null;
          trail: Array<{
            toStatus: TicketStatus;
            actorLabel: string;
            note: string | null;
            timestamp: string;
          }>;
        }>;
      };
      const items: QueueTicket[] = data.tickets.map((t) => ({
        id: t.id,
        status: t.status,
        cityId: t.cityId,
        wardId: t.wardId,
        wardName: t.wardName ?? null,
        wardNameBn: t.wardNameBn ?? null,
        categoryId: t.categoryId,
        categorySlug: t.categorySlug ?? null,
        categoryName: t.categoryName ?? null,
        categoryNameBn: t.categoryNameBn ?? null,
        locationLat: t.locationLat,
        locationLng: t.locationLng,
        note: t.note,
        reporterId: t.reporterId,
        reporterName: t.reporterName ?? null,
        photoUrls: t.photoUrls,
        createdAt: t.createdAt,
      }));
      setTickets(items);
      if (activityRes.ok) {
        const activityData = await activityRes.json() as { tickets: Array<{
          id: string; status: TicketStatus; cityId: string; wardId: string; wardName?: string | null; wardNameBn?: string | null;
          categoryId: string; categorySlug?: string | null; categoryName?: string | null; categoryNameBn?: string | null;
          locationLat: number; locationLng: number; note: string | null; photoUrls: string[]; reporterId: string;
          reporterName?: string | null; createdAt: string;
        }> };
        setActivityTickets(activityData.tickets.map((ticket) => ({ ...ticket, categorySlug: ticket.categorySlug ?? null, categoryName: ticket.categoryName ?? null, categoryNameBn: ticket.categoryNameBn ?? null, wardName: ticket.wardName ?? null, wardNameBn: ticket.wardNameBn ?? null, reporterName: ticket.reporterName ?? null })));
      }
      if (performanceRes.ok) setPerformance(await performanceRes.json() as PerfSnapshot);
      setLastPollAt(new Date().toISOString());
      setError(null);
      setLoading(false);
      previousIdsRef.current = new Set(items.map((it) => it.id));
    } catch {
      setError('dispatcher.queue.error');
      setLoading(false);
    }
  }, [filter]);

  // Auth check — reads the shared session instead of issuing its own
  // `/api/auth/status` request.
  useEffect(() => {
    if (authenticated === null) return; // still loading
    setSignedIn(authenticated);
    setScope(session ?? null);
  }, [authenticated, session]);

  // Polling
  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    let timer: number | null = null;
    void fetchQueue();
    timer = window.setInterval(() => {
      if (!cancelled) void fetchQueue();
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [signedIn, fetchQueue]);

  // Unit 004: dedup-pending badge. Polls /api/v1/dispatcher/dedup-flags
  // (the list endpoint scoped to the dispatcher) and reads the
  // length of `flags` as the pending count. The list endpoint
  // is the source of truth — we don't expose a separate count
  // endpoint to keep the API surface small.
  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    let timer: number | null = null;
    async function fetchCount() {
      try {
        const res = await fetch('/api/v1/dispatcher/dedup-flags?limit=100', {
          credentials: 'include',
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { flags?: Array<unknown> };
        if (cancelled) return;
        setDedupPendingCount(data.flags?.length ?? 0);
      } catch {
        // silently fall back to 0
      }
    }
    void fetchCount();
    timer = window.setInterval(() => {
      if (!cancelled) void fetchCount();
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [signedIn]);

  const filteredTickets = useMemo(() => {
    const needle = searchQuery.trim().toLocaleLowerCase();
    return tickets.filter((ticket) => {
      const matchesStatus = filter === 'all' || ticket.status === filter;
      const matchesSearch = !needle || [ticket.id, ticket.note, ticket.categoryName, ticket.categoryNameBn, ticket.wardName, ticket.wardNameBn, ticket.reporterName]
        .some((value) => value?.toLocaleLowerCase().includes(needle));
      return matchesStatus && matchesSearch;
    });
  }, [tickets, filter, searchQuery]);

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
            {t('dispatcher.queue.signin_required', null, lang)}
          </p>
          <Link
            href={`/login?next=${encodeURIComponent('/dispatcher')}`}
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

  const statusCount = (statuses: TicketStatus[]) => performance?.statusBreakdown
    .filter((row) => statuses.includes(row.status as TicketStatus))
    .reduce((sum, row) => sum + row.count, 0) ?? 0;
  const statusTrend = (statuses: TicketStatus[]) => {
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (6 - index));
      return date.toDateString();
    });
    return days.map((day) => activityTickets.filter((ticket) => statuses.includes(ticket.status) && new Date(ticket.createdAt).toDateString() === day).length);
  };
  const dashboardPins: CityActivityPin[] = activityTickets.slice(0, 500).map((ticket) => ({ id: ticket.id, lat: ticket.locationLat, lng: ticket.locationLng, status: ticket.status as CityActivityStatus }));

  return (
    <div className="dispatcher-portal" data-testid="dispatcher-queue-page">
      <header className="dispatcher-dashboard-heading">
        <div><h1 lang={lang}>{t('dispatcher.dashboard.title', null, lang)}</h1><p lang={lang}>{t('dispatcher.dashboard.subtitle', null, lang)}</p></div>
        <span className="dispatcher-scope-badge">{scopeLabel(lang, scope)}</span>
      </header>

      {/* The queue depth is the dispatcher's headline number — it is
          what they open the page to see. The other three statuses are
          the context around it, so they share one surface instead of
          each getting an equal card. */}
      <section className="dispatcher-kpi-grid" aria-label={t('dispatcher.dashboard.title', null, lang)}>
        {/* The skeleton mirrors the strip's shape: a wide headline
            block beside a row of figure blocks. A skeleton that does
            not match the loaded layout makes the page jump. */}
        {loading ? (
          <SkeletonStatus lang={lang} className="dispatcher-kpi-skeleton">
            <div className="metric-strip">
              <div className="metric-strip-headline">
                <SkeletonBlock style={{ width: '52%', height: 13 }} />
                <SkeletonBlock style={{ width: '44%', height: 30 }} />
              </div>
              <div className="metric-strip-figures">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="metric-strip-figure">
                    <SkeletonBlock style={{ width: '64%', height: 12 }} />
                    <SkeletonBlock style={{ width: '42%', height: 22 }} />
                  </div>
                ))}
              </div>
            </div>
          </SkeletonStatus>
        ) : (
          <MetricStrip
            lang={lang}
            className="dispatcher-metric-strip"
            ariaLabel={t('dispatcher.dashboard.title', null, lang)}
            headline={{
              key: 'new',
              label: t('dispatcher.dashboard.new', null, lang),
              value: statusCount(['submitted']).toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-US'),
            }}
            figures={[
              {
                key: 'review',
                label: t('dispatcher.dashboard.review', null, lang),
                value: statusCount(['routed']).toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-US'),
              },
              {
                key: 'progress',
                label: t('dispatcher.dashboard.progress', null, lang),
                value: statusCount(['in_progress']).toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-US'),
              },
              {
                key: 'resolved',
                label: t('dispatcher.dashboard.resolved', null, lang),
                value: statusCount(['resolved', 'closed']).toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-US'),
              },
            ]}
            data-testid="dispatcher-metric-strip"
            data-testid-headline="dispatcher-metric-new"
          />
        )}
      </section>

      <section className="dispatcher-overview-grid">
        <article className="dispatcher-panel dispatcher-map-panel">
          <header className="dispatcher-panel-heading">
            <h2><ICONS.map.icon size={20} aria-hidden />{t('dispatcher.dashboard.map', null, lang)}</h2>
            <div className="dispatcher-map-legend"><span><i className="is-new" />{t('dispatcher.dashboard.new', null, lang)}</span><span><i className="is-assigned" />{t('dispatcher.dashboard.review', null, lang)}</span><span><i className="is-progress" />{t('dispatcher.dashboard.progress', null, lang)}</span><span><i className="is-resolved" />{t('dispatcher.dashboard.resolved', null, lang)}</span></div>
            <Link href="/dispatcher/map">{t('dispatcher.dashboard.full_map', null, lang)} <ICONS.forward.icon size={15} aria-hidden /></Link>
          </header>
          <div className="dispatcher-dashboard-map">{loading ? <SkeletonStatus lang={lang} className="dispatcher-dashboard-map-skeleton"><SkeletonBlock style={{ width: '100%', height: 300 }} /></SkeletonStatus> : <CityActivityMap pins={dashboardPins} center={DHAKA_CENTER} />}</div>
        </article>

        <article className="dispatcher-panel dispatcher-recent-panel">
          <header className="dispatcher-panel-heading">
            <h2><ICONS.queue.icon size={20} aria-hidden />{t('dispatcher.dashboard.recent', null, lang)}</h2>
            <Link href="/dispatcher/monitor">{t('dispatcher.dashboard.view_all', null, lang)} <ICONS.forward.icon size={15} aria-hidden /></Link>
          </header>
          <div className="dispatcher-filter-row">
            {([['all', 'dispatcher.queue.filter.all'], ['submitted', 'dispatcher.queue.filter.submitted'], ['routed', 'dispatcher.queue.filter.routed']] as Array<[QueueFilter, string]>).map(([value, key]) => (
              <FilterRow key={value} active={filter === value} onClick={() => setFilter(value)} lang={lang} testId={`dispatcher-filter-${value}`}>{t(key, null, lang)}</FilterRow>
            ))}
            {lastPollAt ? <small>{t('dispatcher.dashboard.updated', null, lang)} {formatAge(lastPollAt, lang)}</small> : null}
          </div>
          <div className="dispatcher-recent-list">
            {loading ? <QueueSkeleton /> : error ? <p className="dispatcher-dashboard-error" role="alert">{t('dispatcher.queue.error', null, lang)}</p> : filteredTickets.length ? filteredTickets.slice(0, 5).map((ticket) => <QueueRow key={ticket.id} ticket={ticket} lang={lang} />) : <EmptyState lang={lang} />}
          </div>
        </article>
      </section>

      <section className="dispatcher-lower-grid">
        <article className="dispatcher-panel dispatcher-crew-panel">
          <header className="dispatcher-panel-heading"><h2><ICONS.crew.icon size={20} aria-hidden />{t('dispatcher.dashboard.crew_activity', null, lang)}</h2><Link href="/dispatcher/performance">{t('dispatcher.dashboard.view_crews', null, lang)} <ICONS.forward.icon size={15} aria-hidden /></Link></header>
          <div className="dispatcher-crew-list">
            {loading ? <SkeletonStatus lang={lang} className="dispatcher-crew-skeleton">{[0, 1, 2, 3].map((item) => <div key={item}><SkeletonBlock style={{ width: 38, height: 38, borderRadius: '50%' }} /><SkeletonBlock style={{ width: '46%', height: 13 }} /><SkeletonBlock style={{ width: 42, height: 13 }} /></div>)}</SkeletonStatus> : <>{performance?.crewTable.slice(0, 4).map((crew) => <div className="dispatcher-crew-row" key={crew.crewId}><span className="dispatcher-crew-avatar">{crew.crewName.slice(0, 1).toLocaleUpperCase()}</span><span><strong>{crew.crewName}</strong><small>{crew.specialty || t('dispatcher.dashboard.field_crew', null, lang)}</small></span><b>{crew.jobsCompleted}<small>{t('dispatcher.dashboard.jobs', null, lang)}</small></b></div>)}{!performance?.crewTable.length ? <p className="dispatcher-panel-empty">{t('dispatcher.dashboard.no_crew_activity', null, lang)}</p> : null}</>}
          </div>
        </article>
        <article className="dispatcher-panel dispatcher-actions-panel">
          <header className="dispatcher-panel-heading"><h2><ICONS.newReport.icon size={20} aria-hidden />{t('dispatcher.dashboard.quick_actions', null, lang)}</h2></header>
          <div className="dispatcher-quick-actions">
            <Link href="/dispatcher/map"><ICONS.crew.icon size={19} aria-hidden /><span>{t('dispatcher.dashboard.assign', null, lang)}</span></Link>
            <Link href="/dispatcher/monitor"><ICONS.reports.icon size={19} aria-hidden /><span>{t('dispatcher.dashboard.view_reports', null, lang)}</span></Link>
            <Link href="/dispatcher/dedup"><ICONS.dedup.icon size={19} aria-hidden /><span>{t('dispatcher.dashboard.duplicates', null, lang)}{dedupPendingCount ? <b>{dedupPendingCount}</b> : null}</span></Link>
            <Link href="/dispatcher/performance"><ICONS.performance.icon size={19} aria-hidden /><span>{t('dispatcher.dashboard.performance', null, lang)}</span></Link>
          </div>
        </article>
        <article className="dispatcher-panel dispatcher-trend-panel">
          <header className="dispatcher-panel-heading"><h2><ICONS.performance.icon size={20} aria-hidden />{t('dispatcher.dashboard.trends', null, lang)}</h2><span>{t('dispatcher.dashboard.week', null, lang)}</span></header>
          {loading ? <SkeletonStatus lang={lang} className="dispatcher-trend-skeleton"><SkeletonBlock style={{ width: '100%', height: 160 }} /></SkeletonStatus> : <DispatcherTrend points={performance?.submittedVsResolved ?? []} lang={lang} />}
        </article>
      </section>
    </div>
  );
}

function DispatcherTrend({ points, lang }: { points: PerfSnapshot['submittedVsResolved']; lang: Language }) {
  const max = Math.max(1, ...points.flatMap((point) => [point.submitted, point.resolved]));
  const coord = (value: number, index: number) => `${points.length <= 1 ? 270 : 26 + index * (490 / (points.length - 1))},${136 - (value / max) * 110}`;
  const submitted = points.map((point, index) => `${index ? 'L' : 'M'}${coord(point.submitted, index)}`).join(' ');
  const resolved = points.map((point, index) => `${index ? 'L' : 'M'}${coord(point.resolved, index)}`).join(' ');
  return <div className="dispatcher-trend-content"><div className="dispatcher-trend-legend"><span className="is-created">{t('dispatcher.dashboard.new', null, lang)}</span><span className="is-done">{t('dispatcher.dashboard.resolved', null, lang)}</span></div><svg viewBox="0 0 540 174" role="img" aria-label={t('dispatcher.dashboard.trends', null, lang)}>{[26,53,80,107,136].map((y) => <line key={y} x1="24" x2="526" y1={y} y2={y} />)}<path d={submitted} className="trend-created" /><path d={resolved} className="trend-resolved" />{points.map((point, index) => <text key={point.date} x={points.length <= 1 ? 270 : 26 + index * (490 / (points.length - 1))} y="164" textAnchor="middle">{formatWeekday(point.date, lang)}</text>)}</svg></div>;
}

function FilterRow({
  active,
  onClick,
  lang,
  children,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  lang: Language;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      lang={lang}
      data-testid={testId}
      aria-pressed={active}
      style={{
        padding: 'var(--space-2) var(--space-3)',
        background: active ? 'var(--color-primary-soft)' : 'transparent',
        color: active ? 'var(--color-primary)' : 'var(--color-ink)',
        border: `1px solid ${active ? 'var(--color-primary)' : 'transparent'}`,
        borderRadius: 'var(--radius-sm)',
        fontSize: 'var(--text-body-sm)',
        fontWeight: active ? 'var(--weight-semibold)' : 'var(--weight-regular)',
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      {children}
    </button>
  );
}

function QueueRow({ ticket, lang }: { ticket: QueueTicket; lang: Language }) {
  /*
   * The triage thumbnail. The dispatcher needs to recognise the
   * issue at a glance — the photo is the strongest signal. The
   * stored URL can be an inline `data:image/…` URL (the default),
   * an absolute `https://` URL, or a root-relative `/api/blob/…`
   * path, so `firstRenderablePhotoUrl` picks the first one we can
   * actually render. Without a photo, the row falls back to the
   * category glyph.
   */
  const photoUrl = firstRenderablePhotoUrl(ticket.photoUrls);
  const thumbBackground = thumbnailBackground(photoUrl);
  return (
    <Link
      href={`/dispatcher/tickets/${ticket.id}`}
      data-testid="dispatcher-queue-row"
      className="dispatcher-queue-row"
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        gap: 'var(--space-4)',
        alignItems: 'center',
        padding: 'var(--space-4) var(--space-5)',
        background: 'var(--color-surface-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-card)',
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
            width: 48,
            height: 48,
            borderRadius: 'var(--radius-sm)',
            objectFit: 'cover',
            background: 'var(--color-surface-raised)',
          }}
        />
      ) : (
        <span
          aria-hidden
          style={{
            width: 48,
            height: 48,
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-surface-raised)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <CategoryIcon slug={ticket.categorySlug} size={20} />
        </span>
      )}
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 'var(--text-body-sm)',
            fontWeight: 'var(--weight-semibold)',
            display: 'flex',
            gap: 'var(--space-2)',
            alignItems: 'center',
            marginBottom: 'var(--space-1)',
          }}
        >
          <span lang={lang} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {wardLabel(ticket, lang)} · {categoryLabel(ticket, lang)}
          </span>
          <StatusPill status={ticket.status} lang={lang} />
        </div>
        <div
          lang={lang}
          style={{
            fontSize: 'var(--text-caption)',
            color: 'var(--color-ink-tertiary)',
          }}
        >
          {formatAge(ticket.createdAt, lang)} · {t('dispatcher.queue.row.reporter', null, lang)}{' '}
          <span style={{ fontWeight: 'var(--weight-semibold)' }}>
            {ticket.reporterName ?? ticket.reporterId}
          </span>
        </div>
      </div>
      <span
        lang={lang}
        style={{
          fontSize: 'var(--text-body-sm)',
          color: 'var(--color-primary)',
          fontWeight: 'var(--weight-semibold)',
          whiteSpace: 'nowrap',
        }}
      >
        {t('dispatcher.queue.row.view', null, lang)} →
      </span>
    </Link>
  );
}

function StatusPill({ status, lang }: { status: TicketStatus; lang: Language }) {
  // The design tokens define a `*-soft` background + a saturated
  // `*-status` foreground for every status. The pill previously used
  // the SATURATED token as the background, which for `routed` is
  // `--color-status-routed: #2C5282` — byte-identical to
  // `--color-primary`, the foreground colour. The pill rendered as
  // a solid blue blob with invisible text.
  const map: Record<TicketStatus, { bg: string; fg: string; label: string }> = {
    submitted: {
      bg: 'var(--color-status-submitted-soft)',
      fg: 'var(--color-status-submitted)',
      label: 'status.submitted',
    },
    routed: {
      bg: 'var(--color-status-routed-soft)',
      fg: 'var(--color-status-routed)',
      label: 'status.routed',
    },
    in_progress: {
      bg: 'var(--color-status-in-progress-soft)',
      fg: 'var(--color-status-in-progress)',
      label: 'status.in_progress',
    },
    resolved: {
      bg: 'var(--color-status-resolved-soft)',
      fg: 'var(--color-status-resolved)',
      label: 'status.resolved',
    },
    closed: {
      bg: 'var(--color-surface-raised)',
      fg: 'var(--color-ink-tertiary)',
      label: 'status.closed',
    },
    cancelled: {
      bg: 'var(--color-surface-raised)',
      fg: 'var(--color-ink-tertiary)',
      label: 'status.cancelled',
    },
  };
  const c = map[status];
  return (
    <span
      lang={lang}
      style={{
        padding: '2px var(--space-2)',
        background: c.bg,
        color: c.fg,
        borderRadius: 'var(--radius-pill)',
        fontSize: 10,
        fontWeight: 'var(--weight-bold)',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      {t(c.label, null, lang)}
    </span>
  );
}

function EmptyState({ lang }: { lang: Language }) {
  return (
    <div
      style={{
        padding: 'var(--space-8) var(--space-4)',
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
          background: 'var(--color-primary-soft)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
        }}
      >
        ✓
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
        {t('dispatcher.queue.empty.title', null, lang)}
      </p>
      <p
        lang={lang}
        style={{
          fontSize: 'var(--text-body-sm)',
          color: 'var(--color-ink-secondary)',
          margin: 0,
          maxWidth: 360,
        }}
      >
        {t('dispatcher.queue.empty.subtitle', null, lang)}
      </p>
    </div>
  );
}

function QueueSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            height: 72,
            background: 'var(--color-surface-raised)',
            borderRadius: 'var(--radius-md)',
          }}
        />
      ))}
    </div>
  );
}
