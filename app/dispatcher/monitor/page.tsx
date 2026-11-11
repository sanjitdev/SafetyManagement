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
import { categoryLabel, displayNameFor } from '@/lib/identity/display-name';
import { thumbnailBackground } from '@/lib/format/photo-url';

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
  actorRole: string | null;
  note: string | null;
  timestamp: string;
}

interface MonitorRow {
  id: string;
  status: TicketStatus;
  categoryId: string;
  wardId: string;
  wardName: string | null;
  assignedCrewId: string | null;
  updatedAt: string;
  latestActivity: {
    actorId: string | null;
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

/** Format a duration in ms as a compact "2 d 3 h" style string. */
function formatDuration(ms: number, lang: Language): string {
  if (ms <= 0) return '—';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) {
    return t('dispatcher.performance.duration.minutes', { n: minutes }, lang);
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return t('dispatcher.performance.duration.hours', { n: hours }, lang);
  }
  const days = Math.floor(hours / 24);
  return t('dispatcher.performance.duration.days', { n: days }, lang);
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
  const previousIdsRef = useRef<Set<string> | null>(null);
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
      const prev = previousIdsRef.current;
      if (prev) {
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
      previousIdsRef.current = new Set(data.rows.map((r) => r.id));
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
        <div
          role="group"
          aria-label={t('dispatcher.monitor.filter.all', null, lang)}
          style={{
            display: 'flex',
            gap: 'var(--space-1)',
            flexShrink: 0,
          }}
        >
          {(
            [
              ['all', 'dispatcher.monitor.filter.all'],
              ['my_ward', 'dispatcher.monitor.filter.my_ward'],
              ['my_crews', 'dispatcher.monitor.filter.my_crews'],
            ] as Array<[MonitorFilter, string]>
          ).map(([f, key]) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              data-testid={`dispatcher-monitor-filter-${f}`}
              lang={lang}
              style={{
                padding: '4px var(--space-2)',
                background: filter === f ? 'var(--color-primary)' : 'transparent',
                color: filter === f ? 'var(--color-on-primary)' : 'var(--color-ink-secondary)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-pill)',
                fontSize: 'var(--text-micro)',
                fontWeight: 'var(--weight-semibold)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {t(key, null, lang)}
            </button>
          ))}
        </div>
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
              <button
                type="button"
                onClick={() => setNewUpdates(0)}
                data-testid="dispatcher-monitor-new-updates"
                lang={lang}
                style={{
                  fontSize: 'var(--text-caption)',
                  fontWeight: 'var(--weight-semibold)',
                  color: 'var(--color-primary)',
                  background: 'var(--color-primary-soft)',
                  border: 'none',
                  borderRadius: 'var(--radius-pill)',
                  padding: '4px var(--space-3)',
                  cursor: 'pointer',
                }}
              >
                {t('dispatcher.monitor.new_updates', { n: newUpdates }, lang)}
              </button>
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
  const actorLabel = row.latestActivity.actorId
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
              {categoryLabel(row.categoryId, lang)}
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
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={
              expanded
                ? t('dispatcher.monitor.row.collapse', null, lang)
                : t('dispatcher.monitor.row.expand', null, lang)
            }
            data-testid={`dispatcher-monitor-toggle-${row.id}`}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-ink-secondary)',
              fontSize: 12,
              padding: 'var(--space-1)',
            }}
          >
            {expanded ? '▲' : '▼'}
          </button>
          <button
            type="button"
            onClick={onAcknowledge}
            aria-label={t('dispatcher.monitor.row.acknowledge', null, lang)}
            title={
              acknowledged
                ? t('dispatcher.monitor.row.acknowledged', null, lang)
                : t('dispatcher.monitor.row.acknowledge', null, lang)
            }
            data-testid={`dispatcher-monitor-acknowledge-${row.id}`}
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              border: '1px solid var(--color-border)',
              background: acknowledged
                ? 'var(--color-status-resolved-soft)'
                : 'var(--color-surface-card)',
              color: acknowledged
                ? 'var(--color-status-resolved)'
                : 'var(--color-ink-secondary)',
              cursor: 'pointer',
              fontSize: 12,
              lineHeight: 1,
            }}
          >
            ✓
          </button>
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
                    {step.actorId
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
/* Charts — inline SVG, each with an accessible table sibling         */
/* ------------------------------------------------------------------ */

const FLOW_COLORS: Record<string, string> = {
  submitted: 'var(--color-status-submitted)',
  routed: 'var(--color-status-routed)',
  in_progress: 'var(--color-status-in-progress)',
  resolved: 'var(--color-status-resolved)',
};

function FlowChart({
  charts,
  lang,
}: {
  charts: MonitorCharts['flow'];
  lang: Language;
}) {
  const width = 248;
  const height = 16;
  const total = charts.total;
  let offset = 0;
  return (
    <section
      data-testid="dispatcher-monitor-chart-flow"
      style={chartCardStyle}
    >
      <h3 lang={lang} style={chartTitleStyle}>
        {t('dispatcher.monitor.chart.flow.title', null, lang)}
      </h3>
      {total === 0 ? (
        <p lang={lang} style={chartEmptyStyle}>
          {t('dispatcher.monitor.chart.no_data', null, lang)}
        </p>
      ) : (
        <svg
          role="img"
          aria-label={t('dispatcher.monitor.chart.flow.table_caption', null, lang)}
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
        >
          {charts.segments.map((seg) => {
            if (seg.count === 0) return null;
            const w = (seg.count / total) * width;
            const x = offset;
            offset += w;
            return (
              <rect
                key={seg.status}
                x={x}
                y={0}
                width={w}
                height={height}
                fill={FLOW_COLORS[seg.status] ?? 'var(--color-ink-tertiary)'}
              >
                <title>{`${seg.status}: ${seg.count}`}</title>
              </rect>
            );
          })}
        </svg>
      )}
      <ChartTable
        caption={t('dispatcher.monitor.chart.flow.table_caption', null, lang)}
        headers={[t('dispatcher.monitor.chart.col.status', null, lang), t('dispatcher.monitor.chart.col.count', null, lang)]}
        rows={charts.segments.map((s) => [
          t(`status.${s.status}`, null, lang),
          String(s.count),
        ])}
        testId="dispatcher-monitor-chart-flow-table"
      />
    </section>
  );
}

function ResponseSparkline({
  charts,
  lang,
}: {
  charts: MonitorCharts['response'];
  lang: Language;
}) {
  const width = 248;
  const height = 48;
  const points = charts.points;
  const max = Math.max(1, ...points.map((p) => p.avgMinutes));
  const step = points.length > 1 ? width / (points.length - 1) : width;
  const path = points
    .map((p, i) => {
      const x = i * step;
      const y = height - (p.avgMinutes / max) * (height - 4) - 2;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
  const hasData = points.some((p) => p.samples > 0);
  return (
    <section
      data-testid="dispatcher-monitor-chart-response"
      style={chartCardStyle}
    >
      <h3 lang={lang} style={chartTitleStyle}>
        {t('dispatcher.monitor.chart.response.title', null, lang)}
      </h3>
      {!hasData ? (
        <p lang={lang} style={chartEmptyStyle}>
          {t('dispatcher.monitor.chart.no_data', null, lang)}
        </p>
      ) : (
        <svg
          role="img"
          aria-label={t('dispatcher.monitor.chart.response.table_caption', null, lang)}
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          <path
            d={path}
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      )}
      <ChartTable
        caption={t('dispatcher.monitor.chart.response.table_caption', null, lang)}
        headers={[t('dispatcher.monitor.chart.col.date', null, lang), t('dispatcher.monitor.chart.col.minutes', null, lang)]}
        rows={points.map((p) => [p.date, String(p.avgMinutes)])}
        testId="dispatcher-monitor-chart-response-table"
      />
    </section>
  );
}

function CrewLoadChart({
  charts,
  lang,
}: {
  charts: MonitorCharts['crewLoad'];
  lang: Language;
}) {
  const width = 248;
  const barHeight = 12;
  const gap = 6;
  const labelWidth = 56;
  const plotW = width - labelWidth - 20;
  const max = Math.max(1, ...charts.map((c) => c.openCount));
  const height = Math.max(1, charts.length) * (barHeight + gap);
  return (
    <section
      data-testid="dispatcher-monitor-chart-crew"
      style={chartCardStyle}
    >
      <h3 lang={lang} style={chartTitleStyle}>
        {t('dispatcher.monitor.chart.crew.title', null, lang)}
      </h3>
      {charts.length === 0 ? (
        <p lang={lang} style={chartEmptyStyle}>
          {t('dispatcher.monitor.chart.no_data', null, lang)}
        </p>
      ) : (
        <svg
          role="img"
          aria-label={t('dispatcher.monitor.chart.crew.table_caption', null, lang)}
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          {charts.map((c, i) => {
            const y = i * (barHeight + gap);
            const w = (c.openCount / max) * plotW;
            return (
              <g key={c.crewId}>
                <text
                  x={0}
                  y={y + barHeight / 2}
                  dominantBaseline="middle"
                  fontSize={10}
                  fill="var(--color-ink-secondary)"
                >
                  {c.crewName}
                </text>
                <rect
                  x={labelWidth}
                  y={y}
                  width={Math.max(2, w)}
                  height={barHeight}
                  rx={3}
                  fill="var(--color-status-in-progress)"
                >
                  <title>{`${c.crewName}: ${c.openCount}`}</title>
                </rect>
                <text
                  x={labelWidth + Math.max(2, w) + 4}
                  y={y + barHeight / 2}
                  dominantBaseline="middle"
                  fontSize={10}
                  fill="var(--color-ink)"
                >
                  {c.openCount}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      <ChartTable
        caption={t('dispatcher.monitor.chart.crew.table_caption', null, lang)}
        headers={[t('dispatcher.monitor.chart.col.crew', null, lang), t('dispatcher.monitor.chart.col.open', null, lang)]}
        rows={charts.map((c) => [c.crewName, String(c.openCount)])}
        testId="dispatcher-monitor-chart-crew-table"
      />
    </section>
  );
}

/**
 * The accessible table sibling every chart renders alongside it.
 * Visually hidden (the chart is the visual; the table is for
 * screen readers and for copy/paste), but present in the DOM.
 */
function ChartTable({
  caption,
  headers,
  rows,
  testId,
}: {
  caption: string;
  headers: string[];
  rows: string[][];
  testId: string;
}) {
  return (
    <table
      data-testid={testId}
      style={{
        position: 'absolute',
        width: 1,
        height: 1,
        padding: 0,
        margin: -1,
        overflow: 'hidden',
        clip: 'rect(0, 0, 0, 0)',
        whiteSpace: 'nowrap',
        border: 0,
      }}
    >
      <caption>{caption}</caption>
      <thead>
        <tr>
          {headers.map((h) => (
            <th key={h} scope="col">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (
              <td key={j}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const chartCardStyle: React.CSSProperties = {
  background: 'var(--color-surface-card)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-3)',
  position: 'relative',
};

const chartTitleStyle: React.CSSProperties = {
  fontSize: 'var(--text-caption)',
  fontWeight: 'var(--weight-bold)',
  color: 'var(--color-ink-secondary)',
  margin: '0 0 var(--space-2)',
};

const chartEmptyStyle: React.CSSProperties = {
  fontSize: 'var(--text-caption)',
  color: 'var(--color-ink-tertiary)',
  margin: 0,
};
