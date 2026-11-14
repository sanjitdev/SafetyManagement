/**
 * Dispatcher monitor surface (/dispatcher/monitor).
 *
 * UX spec 2.5 — "Monitor Updates" (Habib the Handler, screen 5 of 7).
 * A thin, live panel of the dispatcher's watched tickets so they can
 * see the field move without leaving the dispatcher surface.
 *
 * Layout (per the spec):
 *   - 960px page cap, full-width on mobile.
 *   - 56px header: back arrow (left), "Live updates" (centre),
 *     filter chips (right).
 *   - Single-column list of watched tickets, sorted by most-recently
 *     updated. Each row: 40x40 thumbnail + category/ward + status
 *     pill + most-recent-activity snippet + unread dot. Rows expand
 *     inline to reveal the last 3 trail steps + new photos.
 *   - 280px right-hand chart strip (desktop only): today's flow
 *     (stacked bar), avg response time (sparkline, last 7 days),
 *     crew load (bars).
 *   - An aggregate "N new updates" counter at the top.
 *
 * Real-time: the page polls every 5 seconds (the spec's v1 default;
 * WebSocket is a v1.1 enhancement). A network failure shows a slim
 * "Live updates paused" banner and polling continues.
 *
 * Acknowledgement: the per-row "✓" button POSTs to
 * `/api/v1/dispatcher/monitor/ack`, which writes an audit row.
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { t, type Language } from '@/lib/i18n/keys';
import { SkeletonBlock, SkeletonStatus } from '@/components/ui/Skeleton';
import { useLanguage } from '@/components/useLanguage';
import { useSession } from '@/components/SessionProvider';
import { StatusPill } from '@/components/ui/StatusPill';
import { FilterChipGroup } from '@/components/ui/FilterChipGroup';
import { IconButton } from '@/components/ui/IconButton';
import { Button } from '@/components/ui/Button';
import { ICONS } from '@/lib/ui/icon-map';
import { TrendLine, CategoryBar, StatusDonut } from '@/components/ui/charts';
import { STATUS_COLOR } from '@/lib/ui/status-tokens';
import { categoryLabel, displayNameFor } from '@/lib/identity/display-name';
import { thumbnailBackground } from '@/lib/format/photo-url';
import { formatDuration } from '@/lib/format/duration';

/** The spec's v1 polling cadence: every 5 seconds. */
const POLL_INTERVAL_MS = 5_000;

type TicketStatus =
  | 'submitted'
  | 'routed'
  | 'in_progress'
  | 'resolved'
  | 'closed'
  | 'cancelled';

type MonitorFilter = 'all' | 'my_ward' | 'my_crews';

interface TrailStep {
  toStatus: string;
  actorId: string | null;
  /** The actor's display name, joined server-side. */
  actorName: string | null;
  actorRole: string | null;
  note: string | null;
  timestamp: string;
}

interface MonitorRow {
  id: string;
  status: TicketStatus;
  categoryId: string;
  /** The category's localized display name, joined server-side. */
  categoryName: string | null;
  categoryNameBn: string | null;
  wardId: string;
  wardName: string | null;
  assignedCrewId: string | null;
  updatedAt: string;
  latestActivity: {
    actorId: string | null;
    /** The actor's display name, joined server-side. */
    actorName: string | null;
    /** The actor's role, resolved server-side from the user record. */
    actorRole: string | null;
    toStatus: string | null;
    timestamp: string;
    unread: boolean;
  };
  trail: TrailStep[];
  thumbnailUrl: string | null;
  photoCount: number;
}

interface MonitorCharts {
  flow: {
    total: number;
    segments: Array<{ status: string; count: number }>;
  };
  response: {
    points: Array<{ date: string; avgMinutes: number; samples: number }>;
  };
  crewLoad: Array<{
    crewId: string;
    crewName: string;
    openCount: number;
  }>;
}

interface MonitorResponse {
  rows: MonitorRow[];
  charts: MonitorCharts;
  generatedAt: string;
}

/** Format a timestamp as a short "5 min ago" string. */
function formatAge(iso: string, lang: Language): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return t('dispatcher.monitor.age.now', null, lang);
  if (minutes < 60) {
    return t('dispatcher.monitor.age.minutes', { n: minutes }, lang);
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return t('dispatcher.monitor.age.hours', { n: hours }, lang);
  }
  const days = Math.floor(hours / 24);
  return t('dispatcher.monitor.age.days', { n: days }, lang);
}

export default function DispatcherMonitorPage() {
  const { lang, setLang } = useLanguage();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  // The shared session — one request for the whole page.
  const { authenticated } = useSession();
  const [rows, setRows] = useState<MonitorRow[]>([]);
  const [charts, setCharts] = useState<MonitorCharts | null>(null);
  const [filter, setFilter] = useState<MonitorFilter>('all');
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());
  const [newUpdates, setNewUpdates] = useState(0);
  // Mirrors the last fetched rows in a ref so the polling callback
  // can compare timestamps without re-binding the interval.
  //
  // `hasPolledBefore` is a flag, not a set: the comparison needs the
  // previous TIMESTAMPS (`prevRowsRef`), and the old ids were only
  // ever stored to answer "is this the first poll?". A set of ids was
  // a second copy of the row list, kept in step with it, for nothing.
  const hasPolledBefore = useRef(false);
  const prevRowsRef = useRef<MonitorRow[]>([]);

  useEffect(() => {
    function syncLang() {
    }
    syncLang();
    window.addEventListener('storage', syncLang);
    window.addEventListener('focus', syncLang);
    const id = window.setInterval(syncLang, 1000);
    return () => {
      window.removeEventListener('storage', syncLang);
      window.removeEventListener('focus', syncLang);
      window.clearInterval(id);
    };
  }, []);

  const fetchMonitor = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (filter !== 'all') qs.set('filter', filter);
      qs.set('limit', '50');
      const res = await fetch(
        `/api/v1/dispatcher/monitor?${qs.toString()}`,
        { credentials: 'include' },
      );
      if (!res.ok) {
        setPaused(true);
        setLoading(false);
        return;
      }
      const data = (await res.json()) as MonitorResponse;
      // Count "new" updates: a row whose latest-activity timestamp
      // moved forward since the previous poll.
      if (hasPolledBefore.current) {
        const prevById = new Map(
          prevRowsRef.current.map((r) => [r.id, r.latestActivity.timestamp]),
        );
        let added = 0;
        for (const row of data.rows) {
          const known = prevById.get(row.id);
          if (known && row.latestActivity.timestamp > known) added += 1;
        }
        if (added > 0) setNewUpdates((n) => n + added);
      }
      hasPolledBefore.current = true;
      prevRowsRef.current = data.rows;
      setRows(data.rows);
      setCharts(data.charts);
      setPaused(false);
      setLoading(false);
    } catch {
      setPaused(true);
      setLoading(false);
    }
  }, [filter]);

  // Auth check — reads the shared session.
  useEffect(() => {
    if (authenticated === null) return; // still loading
    setSignedIn(authenticated);
  }, [authenticated]);

  // Polling — every 5 seconds per the spec.
  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    let timer: number | null = null;
    void fetchMonitor();
    timer = window.setInterval(() => {
      if (!cancelled) void fetchMonitor();
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [signedIn, fetchMonitor]);

  const unreadCount = useMemo(
    () => rows.filter((r) => r.latestActivity.unread && !acknowledged.has(r.id)).length,
    [rows, acknowledged],
  );

  const onAcknowledge = useCallback(async (ticketId: string) => {
    setAcknowledged((prev) => {
      const next = new Set(prev);
      next.add(ticketId);
      return next;
    });
    try {
      await fetch('/api/v1/dispatcher/monitor/ack', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId }),
      });
    } catch {
      // The optimistic local state stands; the next poll re-syncs.
    }
  }, []);

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
            {t('dispatcher.monitor.signin_required', null, lang)}
          </p>
          <Link
            href={`/login?next=${encodeURIComponent('/dispatcher/monitor')}`}
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
      data-testid="dispatcher-monitor-page"
    >
      {/* Header — 56px, back arrow left, title centre, filter chips right. */}
      <header
        data-testid="dispatcher-monitor-header"
        style={{
          height: 56,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-3)',
          padding: '0 var(--space-4)',
          background: 'var(--color-surface-card)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <Link
          href="/dispatcher"
          aria-label={t('dispatcher.monitor.back', null, lang)}
          data-testid="dispatcher-monitor-back"
          style={{
            fontSize: 'var(--text-body-lg)',
            color: 'var(--color-ink)',
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          ←
        </Link>
        <h1
          lang={lang}
          style={{
            fontSize: 'var(--text-body-lg)',
            fontWeight: 'var(--weight-bold)',
            color: 'var(--color-ink)',
            margin: 0,
            textAlign: 'center',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {t('dispatcher.monitor.title', null, lang)}
        </h1>
        <FilterChipGroup
          options={(
            [
              ['all', 'dispatcher.monitor.filter.all'],
              ['my_ward', 'dispatcher.monitor.filter.my_ward'],
              ['my_crews', 'dispatcher.monitor.filter.my_crews'],
            ] as Array<[MonitorFilter, string]>
          ).map(([f, key]) => ({
            value: f,
            label: t(key, null, lang),
            testId: `dispatcher-monitor-filter-${f}`,
          }))}
          value={filter}
          onChange={setFilter}
          ariaLabel={t('dispatcher.monitor.filter.all', null, lang)}
          lang={lang}
        />
      </header>

      {/* Network-failure banner */}
      {paused && (
        <div
          role="alert"
          data-testid="dispatcher-monitor-paused"
          lang={lang}
          style={{
            padding: 'var(--space-2) var(--space-4)',
            background: 'var(--color-warning-soft)',
            color: 'var(--color-warning)',
            fontSize: 'var(--text-caption)',
            textAlign: 'center',
          }}
        >
          {t('dispatcher.monitor.paused', null, lang)}
        </div>
      )}

      {/* Body — list + chart strip */}
      <div
        className="dispatcher-monitor-grid"
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 280px',
          gap: 'var(--space-5)',
          maxWidth: 960,
          width: '100%',
          margin: '0 auto',
          padding: 'var(--space-4)',
          alignItems: 'start',
        }}
      >
        {/* Live activity list */}
        <main style={{ minWidth: 0 }}>
          {/* Aggregate new-updates counter */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--space-3)',
              marginBottom: 'var(--space-3)',
            }}
          >
            <span
              lang={lang}
              data-testid="dispatcher-monitor-unread-count"
              style={{
                fontSize: 'var(--text-caption)',
                fontWeight: 'var(--weight-semibold)',
                color: 'var(--color-ink-secondary)',
              }}
            >
              {t('dispatcher.monitor.unread_count', { n: unreadCount }, lang)}
            </span>
            {newUpdates > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setNewUpdates(0)}
                data-testid="dispatcher-monitor-new-updates"
                lang={lang}
              >
                {t('dispatcher.monitor.new_updates', { n: newUpdates }, lang)}
              </Button>
            )}
          </div>

          {loading ? (
            <SkeletonStatus lang={lang} data-testid="dispatcher-monitor-skeleton" className="dispatcher-monitor-skeleton">
              {[0, 1, 2].map((i) => <div key={i} className="dispatcher-monitor-skeleton-row"><SkeletonBlock style={{ width: 40, height: 40, borderRadius: '50%' }} /><div><SkeletonBlock style={{ width: '46%', height: 14 }} /><SkeletonBlock style={{ width: '78%', height: 12 }} /></div><SkeletonBlock style={{ width: 72, height: 24, borderRadius: 999 }} /></div>)}
            </SkeletonStatus>
          ) : rows.length === 0 ? (
            <div
              data-testid="dispatcher-monitor-empty"
              lang={lang}
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
                style={{
                  fontSize: 'var(--text-h3)',
                  fontWeight: 'var(--weight-semibold)',
                  color: 'var(--color-ink)',
                  margin: 0,
                }}
              >
                {t('dispatcher.monitor.empty.title', null, lang)}
              </p>
              <p
                style={{
                  fontSize: 'var(--text-body-sm)',
                  color: 'var(--color-ink-secondary)',
                  margin: 0,
                  maxWidth: 360,
                }}
              >
                {t('dispatcher.monitor.empty.subtitle', null, lang)}
              </p>
              <Link
                href="/dispatcher"
                style={{
                  fontSize: 'var(--text-body-sm)',
                  color: 'var(--color-primary)',
                  fontWeight: 'var(--weight-semibold)',
                }}
              >
                {t('dispatcher.monitor.empty.link', null, lang)}
              </Link>
            </div>
          ) : (
            <ul
              data-testid="dispatcher-monitor-list"
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-2)',
              }}
            >
              {rows.map((row) => (
                <MonitorRowItem
                  key={row.id}
                  row={row}
                  lang={lang}
                  expanded={expandedId === row.id}
                  acknowledged={acknowledged.has(row.id)}
                  onToggle={() =>
                    setExpandedId((prev) => (prev === row.id ? null : row.id))
                  }
                  onAcknowledge={() => void onAcknowledge(row.id)}
                />
              ))}
            </ul>
          )}
        </main>

        {/* Desktop chart strip */}
        <aside
          data-testid="dispatcher-monitor-chart-strip"
          aria-label={t('dispatcher.monitor.title', null, lang)}
          style={{
            width: 280,
            display: 'none',
            flexDirection: 'column',
            gap: 'var(--space-4)',
          }}
        >
          {charts ? (
            <>
              <FlowChart charts={charts.flow} lang={lang} />
              <ResponseSparkline charts={charts.response} lang={lang} />
              <CrewLoadChart charts={charts.crewLoad} lang={lang} />
            </>
          ) : null}
        </aside>
      </div>

      {/* The chart strip is desktop-only. The spec places it in the
          right column above 960px; below that it collapses. */}
      <style jsx>{`
        @media (min-width: 1025px) {
          .dispatcher-monitor-grid > aside {
            display: flex !important;
          }
        }
        @media (max-width: 1024px) {
          .dispatcher-monitor-grid {
            grid-template-columns: minmax(0, 1fr) !important;
          }
        }
      `}</style>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Row                                                                 */
/* ------------------------------------------------------------------ */

function MonitorRowItem({
  row,
  lang,
  expanded,
  acknowledged,
  onToggle,
  onAcknowledge,
}: {
  row: MonitorRow;
  lang: Language;
  expanded: boolean;
  acknowledged: boolean;
  onToggle: () => void;
  onAcknowledge: () => void;
}) {
  const isUnread = row.latestActivity.unread && !acknowledged;
  /*
   * Prefer the server-joined actor name. The id-prefix heuristic
   * below only fits the dev store's `user_crew` / `user_citizen`
   * ids — on Postgres the ids are opaque strings, so every actor
   * would be mislabelled "dispatcher".
   */
  const actorLabel = row.latestActivity.actorName
    ? row.latestActivity.actorName
    : row.latestActivity.actorId
      ? displayNameFor(
          (row.latestActivity.actorId.startsWith('user_crew')
            ? 'crew'
            : row.latestActivity.actorId.startsWith('user_citizen')
              ? 'citizen'
              : 'dispatcher') as 'crew' | 'citizen' | 'dispatcher',
          row.latestActivity.actorId,
        )
      : null;
  const activityText = row.latestActivity.toStatus
    ? actorLabel
      ? t(
          'dispatcher.monitor.row.activity',
          {
            actor: actorLabel,
            status: t(`status.${row.latestActivity.toStatus}`, null, lang),
            age: formatAge(row.latestActivity.timestamp, lang),
          },
          lang,
        )
      : t(
          'dispatcher.monitor.row.activity_unknown_actor',
          { age: formatAge(row.latestActivity.timestamp, lang) },
          lang,
        )
    : formatAge(row.updatedAt, lang);

  return (
    <li
      data-testid={`dispatcher-monitor-row-${row.id}`}
      style={{
        background: 'var(--color-surface-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '40px minmax(0, 1fr) auto',
          gap: 'var(--space-3)',
          alignItems: 'center',
          padding: 'var(--space-3)',
        }}
      >
        {/*
          Thumbnail — 40x40. The background is built by
          `thumbnailBackground`, which QUOTES the URL: an inline
          `data:image/…` URL contains commas and parentheses that
          would otherwise break out of an unquoted `url(...)` and
          leave the square blank.
        */}
        <span
          aria-hidden
          data-testid="dispatcher-monitor-thumbnail"
          style={{
            width: 40,
            height: 40,
            borderRadius: 'var(--radius-sm)',
            background:
              thumbnailBackground(row.thumbnailUrl) ??
              'var(--color-surface-raised)',
            border: '1px solid var(--color-border)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
          }}
        >
          {!row.thumbnailUrl ? '🖼' : ''}
        </span>

        {/* Category + ward + activity line */}
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              gap: 'var(--space-2)',
              alignItems: 'center',
              marginBottom: 2,
            }}
          >
            <span
              lang={lang}
              style={{
                fontSize: 'var(--text-body-sm)',
                fontWeight: 'var(--weight-semibold)',
                color: 'var(--color-ink)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {row.categoryName
                ? lang === 'bn'
                  ? (row.categoryNameBn ?? row.categoryName)
                  : row.categoryName
                : categoryLabel(row.categoryId, lang)}
            </span>
            <span
              lang={lang}
              style={{
                fontSize: 'var(--text-micro)',
                color: 'var(--color-ink-tertiary)',
                whiteSpace: 'nowrap',
              }}
            >
              {row.wardName ?? row.wardId}
            </span>
            <StatusPill status={row.status} lang={lang} />
          </div>
          <div
            lang={lang}
            data-testid="dispatcher-monitor-activity"
            style={{
              fontSize: 'var(--text-caption)',
              color: 'var(--color-ink-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
            }}
          >
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {activityText}
            </span>
            {isUnread && (
              <span
                aria-label={t('dispatcher.monitor.unread_count', { n: 1 }, lang)}
                data-testid="dispatcher-monitor-unread-dot"
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'var(--color-primary)',
                  flexShrink: 0,
                }}
              />
            )}
          </div>
        </div>

        {/* Actions — expand toggle + acknowledge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
          }}
        >
          {/*
            Two icon-only controls. The glyphs used to be the
            characters `▲`/`▼` and `✓` — a text caret and a text
            tick, which look different on every platform and cannot
            be recoloured by a token. The Phosphor carets and the
            check draw at the same weight as the rest of the
            product.

            The expand toggle's direction is carried by the ICON
            (a caret pointing the way the panel will move) as well
            as by `aria-expanded`, so the control still reads in
            greyscale.
          */}
          <IconButton
            label={
              expanded
                ? t('dispatcher.monitor.row.collapse', null, lang)
                : t('dispatcher.monitor.row.expand', null, lang)
            }
            icon={
              expanded ? (
                <ICONS.chevronDown.icon
                  size={16}
                  weight={ICONS.chevronDown.weight}
                  aria-hidden
                  focusable="false"
                />
              ) : (
                <ICONS.chevronRight.icon
                  size={16}
                  weight={ICONS.chevronRight.weight}
                  aria-hidden
                  focusable="false"
                />
              )
            }
            variant="ghost"
            size="sm"
            onClick={onToggle}
            aria-expanded={expanded}
            data-testid={`dispatcher-monitor-toggle-${row.id}`}
          />
          <IconButton
            label={
              acknowledged
                ? t('dispatcher.monitor.row.acknowledged', null, lang)
                : t('dispatcher.monitor.row.acknowledge', null, lang)
            }
            icon={
              <ICONS.check.icon
                size={16}
                weight={ICONS.check.weight}
                aria-hidden
                focusable="false"
              />
            }
            variant="secondary"
            size="sm"
            onClick={onAcknowledge}
            data-testid={`dispatcher-monitor-acknowledge-${row.id}`}
            style={
              acknowledged
                ? {
                    borderRadius: '50%',
                    background: 'var(--color-status-resolved-soft)',
                    color: 'var(--color-status-resolved)',
                  }
                : { borderRadius: '50%' }
            }
          />
        </div>
      </div>

      {/* Expanded panel — the last 3 trail steps + new photos */}
      {expanded && (
        <div
          data-testid={`dispatcher-monitor-expanded-${row.id}`}
          lang={lang}
          style={{
            padding: 'var(--space-3)',
            paddingTop: 0,
            borderTop: '1px solid var(--color-border)',
            background: 'var(--color-surface-raised)',
          }}
        >
          <p
            style={{
              fontSize: 'var(--text-micro)',
              fontWeight: 'var(--weight-bold)',
              color: 'var(--color-ink-secondary)',
              margin: 'var(--space-2) 0 var(--space-2)',
            }}
          >
            {t('dispatcher.monitor.row.trail_heading', { n: 3 }, lang)}
          </p>
          <ol
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
            }}
          >
            {row.trail.length === 0 ? (
              <li style={{ fontSize: 'var(--text-caption)', color: 'var(--color-ink-tertiary)' }}>
                —
              </li>
            ) : (
              row.trail.map((step, i) => (
                <li
                  key={`${step.timestamp}-${i}`}
                  data-testid="dispatcher-monitor-trail-step"
                  style={{
                    display: 'flex',
                    gap: 'var(--space-2)',
                    alignItems: 'center',
                    fontSize: 'var(--text-caption)',
                    color: 'var(--color-ink-secondary)',
                  }}
                >
                  <StatusPill status={step.toStatus as TicketStatus} lang={lang} />
                  <span>
                    {step.actorName
                      ? step.actorName
                      : step.actorId
                        ? displayNameFor(
                            (step.actorRole as 'crew' | 'citizen' | 'dispatcher') ??
                              'dispatcher',
                            step.actorId,
                          )
                        : '—'}
                  </span>
                  <span style={{ color: 'var(--color-ink-tertiary)' }}>
                    {formatAge(step.timestamp, lang)}
                  </span>
                </li>
              ))
            )}
          </ol>
          {row.photoCount > 0 && (
            <p
              style={{
                fontSize: 'var(--text-micro)',
                color: 'var(--color-ink-tertiary)',
                margin: 'var(--space-2) 0 0',
              }}
            >
              {t('dispatcher.monitor.row.new_photos', { n: row.photoCount }, lang)}
            </p>
          )}
          <Link
            href={`/dispatcher/tickets/${row.id}`}
            data-testid={`dispatcher-monitor-open-${row.id}`}
            style={{
              display: 'inline-block',
              marginTop: 'var(--space-2)',
              fontSize: 'var(--text-caption)',
              fontWeight: 'var(--weight-semibold)',
              color: 'var(--color-primary)',
            }}
          >
            {t('dispatcher.monitor.row.open_detail', null, lang)} →
          </Link>
        </div>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Charts — the shared kit, not hand-rolled SVG                         */
/* ------------------------------------------------------------------ */

/**
 * The flow chart is a STATUS MIX, so it is a ring.
 *
 * It was a stacked bar before — a 16px strip whose segments the
 * reader had to measure by eye and whose only labels lived in the
 * hidden table. A ring with a spelled-out legend says the same thing
 * in a shape the reader can read at a glance, and it sorts its slices
 * by the ticket's own life (submitted -> routed -> in progress ->
 * resolved), so the ring does not reshuffle between polls.
 */
function FlowChart({
  charts,
  lang,
}: {
  charts: MonitorCharts['flow'];
  lang: Language;
}) {
  return (
    <StatusDonut
      title={t('dispatcher.monitor.chart.flow.title', null, lang)}
      description={t('dispatcher.monitor.chart.flow.table_caption', null, lang)}
      entries={charts.segments.map((seg) => ({ status: seg.status, count: seg.count }))}
      lang={lang}
      data-testid="dispatcher-monitor-chart-flow"
      data-testid-table="dispatcher-monitor-chart-flow-table"
    />
  );
}

/**
 * The response sparkline is a METRIC OVER TIME, so it is a trend
 * line.
 *
 * The old sparkline was a bare path with no axis, no scale and no
 * label on it — the reader could see "up and down" but not "how much".
 * `TrendLine` draws a labelled axis and gives every point a value in
 * the data table.
 */
function ResponseSparkline({
  charts,
  lang,
}: {
  charts: MonitorCharts['response'];
  lang: Language;
}) {
  const hasData = charts.points.some((p) => p.samples > 0);
  return (
    <TrendLine
      title={t('dispatcher.monitor.chart.response.title', null, lang)}
      description={t('dispatcher.monitor.chart.response.table_caption', null, lang)}
      data={charts.points.map((p) => ({ label: p.date, minutes: p.avgMinutes }))}
      series={[
        {
          key: 'minutes',
          label: t('dispatcher.monitor.chart.col.minutes', null, lang),
          color: 'var(--color-primary)',
        },
      ]}
      lang={lang}
      height={120}
      data-testid="dispatcher-monitor-chart-response"
      data-testid-table="dispatcher-monitor-chart-response-table"
    />
  );
}

/**
 * The crew load chart is a RANKED COMPARISON, so it is a bar chart.
 *
 * `CategoryBar` sorts the bars descending, which is what the reader
 * wants here: the crew carrying the most open work is the one that
 * needs attention, and a ranked list says which.
 */
function CrewLoadChart({
  charts,
  lang,
}: {
  charts: MonitorCharts['crewLoad'];
  lang: Language;
}) {
  return (
    <CategoryBar
      title={t('dispatcher.monitor.chart.crew.title', null, lang)}
      description={t('dispatcher.monitor.chart.crew.table_caption', null, lang)}
      entries={charts.map((c) => ({
        key: c.crewId,
        label: c.crewName,
        value: c.openCount,
        color: STATUS_COLOR.in_progress,
      }))}
      lang={lang}
      height={Math.max(80, charts.length * 30)}
      data-testid="dispatcher-monitor-chart-crew"
      data-testid-table="dispatcher-monitor-chart-crew-table"
    />
  );
}


