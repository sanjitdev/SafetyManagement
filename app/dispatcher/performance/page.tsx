/**
 * Dispatcher performance snapshot (/dispatcher/performance).
 *
 * UX spec 2.7 — "Ward Performance Snapshot" (Habib the Handler,
 * screen 7 of 7). A calm, factual, print-friendly report the
 * dispatcher can pull up on a projector and screenshot.
 *
 * Layout (per the spec):
 *   - 960px page cap.
 *   - Sticky 64px header: back arrow (left), "Ward N ·
 *     Performance snapshot" (centre), date-range picker (right).
 *   - Three hero stat cards (total reports + delta, resolution
 *     rate + delta, avg time-to-resolve + delta).
 *   - Three charts: submitted-vs-resolved line, category
 *     breakdown horizontal bar, status donut.
 *   - Sortable crew performance table.
 *   - Long-tail list of the 10 oldest still-open tickets.
 *   - Export PDF (primary) + CSV (secondary) controls.
 *   - A print stylesheet that hides the back arrow, date picker
 *     and export controls.
 *
 * Real-time: this page is a SNAPSHOT — it does NOT poll. It
 * refreshes when the date range changes or when the dispatcher
 * reloads.
 *
 * Accessibility: every chart renders an equivalent `<table>`
 * sibling from the same data array, with `<caption>` and
 * `<th scope="col">`.
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { t, type Language } from '@/lib/i18n/keys';
import { formatTicketId } from '@/lib/format/ticket-id';
import { formatTimestampShort as formatTimestamp } from '@/lib/format/datetime';
import { categoryLabel } from '@/lib/identity/display-name';
import { MetricStrip, type MetricTone, type MetricTrend } from '@/components/ui/MetricStrip';
import { SkeletonBlock, SkeletonStatus } from '@/components/ui/Skeleton';
import { useSession } from '@/components/SessionProvider';

const LANG_KEY = 'cityfix.preferred_language.v1';

type TicketStatus =
  | 'submitted'
  | 'routed'
  | 'in_progress'
  | 'resolved'
  | 'closed'
  | 'cancelled';

type RangePreset = 'today' | 'last7' | 'last30' | 'custom';

interface HeroStat {
  value: number;
  delta: number;
}

interface PerfSnapshot {
  hero: {
    totalReports: HeroStat;
    resolutionRate: HeroStat;
    avgTimeToResolve: { valueMs: number; deltaMs: number };
  };
  submittedVsResolved: Array<{
    date: string;
    submitted: number;
    resolved: number;
  }>;
  categoryBreakdown: Array<{ categoryId: string; count: number }>;
  statusBreakdown: Array<{ status: string; count: number }>;
  crewTable: Array<{
    crewId: string;
    crewName: string;
    specialty: string | null;
    jobsCompleted: number;
    avgTimeToResolveMs: number | null;
    positiveFeedback: number;
    negativeFeedback: number;
    feedbackRatio: number | null;
  }>;
  longTail: Array<{
    id: string;
    categoryId: string;
    createdAt: string;
    ageMs: number;
    assignedCrewId: string | null;
    assignedCrewName: string | null;
  }>;
  range: { fromIso: string; toIso: string };
  ward: {
    wardId: string | null;
    wardLabel: string | null;
    wardLabelBn: string | null;
  };
}

type CrewSortKey =
  | 'crewName'
  | 'specialty'
  | 'jobsCompleted'
  | 'avgTimeToResolveMs'
  | 'feedbackRatio';

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

export default function DispatcherPerformancePage() {
  const [lang, setLang] = useState<Language>('bn');
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  // The shared session — one request for the whole page.
  const { authenticated } = useSession();
  const [snapshot, setSnapshot] = useState<PerfSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preset, setPreset] = useState<RangePreset>('last7');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [sortKey, setSortKey] = useState<CrewSortKey>('jobsCompleted');
  const [sortAsc, setSortAsc] = useState(false);
  const [exporting, setExporting] = useState(false);

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
    window.addEventListener('storage', syncLang);
    window.addEventListener('focus', syncLang);
    const id = window.setInterval(syncLang, 1000);
    return () => {
      window.removeEventListener('storage', syncLang);
      window.removeEventListener('focus', syncLang);
      window.clearInterval(id);
    };
  }, []);

  /** Resolve the current range preset into `from` / `to` query params. */
  const rangeParams = useMemo(() => {
    const now = new Date();
    if (preset === 'today') {
      const from = new Date(now);
      from.setHours(0, 0, 0, 0);
      return { from: from.toISOString(), to: now.toISOString() };
    }
    if (preset === 'last30') {
      const from = new Date(now.getTime() - 30 * 86_400_000);
      return { from: from.toISOString(), to: now.toISOString() };
    }
    if (preset === 'custom' && customFrom && customTo) {
      return {
        from: new Date(customFrom).toISOString(),
        to: new Date(customTo).toISOString(),
      };
    }
    const from = new Date(now.getTime() - 7 * 86_400_000);
    return { from: from.toISOString(), to: now.toISOString() };
  }, [preset, customFrom, customTo]);

  const fetchSnapshot = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      qs.set('from', rangeParams.from);
      qs.set('to', rangeParams.to);
      const res = await fetch(
        `/api/v1/dispatcher/performance?${qs.toString()}`,
        { credentials: 'include' },
      );
      if (!res.ok) {
        setError('dispatcher.performance.error');
        setLoading(false);
        return;
      }
      const data = (await res.json()) as PerfSnapshot;
      setSnapshot(data);
      setError(null);
      setLoading(false);
    } catch {
      setError('dispatcher.performance.error');
      setLoading(false);
    }
  }, [rangeParams.from, rangeParams.to]);

  // Auth check — reads the shared session.
  useEffect(() => {
    if (authenticated === null) return; // still loading
    setSignedIn(authenticated);
  }, [authenticated]);

  // Snapshot — NOT polled. Refetched when the date range changes.
  useEffect(() => {
    if (!signedIn) return;
    setLoading(true);
    void fetchSnapshot();
  }, [signedIn, fetchSnapshot]);

  const sortedCrew = useMemo(() => {
    if (!snapshot) return [];
    const rows = [...snapshot.crewTable];
    rows.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      // Nulls always sort last, regardless of direction.
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (av === bv) return 0;
      const cmp = av < bv ? -1 : 1;
      return sortAsc ? cmp : -cmp;
    });
    return rows;
  }, [snapshot, sortKey, sortAsc]);

  const onSort = (key: CrewSortKey) => {
    if (key === sortKey) {
      setSortAsc((prev) => !prev);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  /** Download the snapshot as CSV. */
  const onExportCsv = useCallback(() => {
    if (!snapshot) return;
    const lines: string[] = [];
    lines.push('section,key,value');
    lines.push(
      `hero,total_reports,${snapshot.hero.totalReports.value}`,
    );
    lines.push(
      `hero,resolution_rate,${snapshot.hero.resolutionRate.value}`,
    );
    lines.push(
      `hero,avg_time_to_resolve_ms,${snapshot.hero.avgTimeToResolve.valueMs}`,
    );
    lines.push('category,category_id,count');
    for (const c of snapshot.categoryBreakdown) {
      lines.push(`category,${c.categoryId},${c.count}`);
    }
    lines.push('status,status,count');
    for (const s of snapshot.statusBreakdown) {
      lines.push(`status,${s.status},${s.count}`);
    }
    lines.push(
      'crew,crew_id,name,specialty,jobs_completed,avg_time_to_resolve_ms,positive_feedback,negative_feedback,feedback_ratio',
    );
    for (const c of snapshot.crewTable) {
      lines.push(
        `crew,${c.crewId},${csvEscape(c.crewName)},${csvEscape(
          c.specialty ?? '',
        )},${c.jobsCompleted},${c.avgTimeToResolveMs ?? ''},${
          c.positiveFeedback
        },${c.negativeFeedback},${c.feedbackRatio ?? ''}`,
      );
    }
    lines.push('long_tail,ticket_id,category_id,created_at,age_ms,assigned_crew');
    for (const l of snapshot.longTail) {
      lines.push(
        `long_tail,${l.id},${l.categoryId},${l.createdAt},${l.ageMs},${csvEscape(
          l.assignedCrewName ?? '',
        )}`,
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cityfix-ward-performance.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, [snapshot]);

  /** Print the page to PDF via the browser's print dialog. */
  const onExportPdf = useCallback(() => {
    setExporting(true);
    // Give the browser a tick to render the "preparing" label
    // before opening the print dialog (which blocks the thread).
    window.setTimeout(() => {
      window.print();
      setExporting(false);
    }, 50);
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
            {t('dispatcher.performance.signin_required', null, lang)}
          </p>
          <Link
            href={`/login?next=${encodeURIComponent('/dispatcher/performance')}`}
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

  const wardLabel =
    (lang === 'bn'
      ? snapshot?.ward?.wardLabelBn
      : snapshot?.ward?.wardLabel) ?? '';

  return (
    <div
      style={{
        minHeight: '100%',
        background: 'var(--color-surface-page)',
        display: 'flex',
        flexDirection: 'column',
      }}
      data-testid="dispatcher-performance-page"
    >
      {/* Sticky 64px header */}
      <header
        data-testid="dispatcher-performance-header"
        style={{
          height: 64,
          position: 'sticky',
          top: 0,
          zIndex: 10,
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
          aria-label={t('dispatcher.performance.back', null, lang)}
          data-testid="dispatcher-performance-back"
          className="dispatcher-performance-back"
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
          {wardLabel
            ? t('dispatcher.performance.ward_title', { ward: wardLabel }, lang)
            : t('dispatcher.performance.title', null, lang)}
        </h1>
        <div
          data-testid="dispatcher-performance-range"
          className="dispatcher-performance-range"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            flexShrink: 0,
          }}
        >
          <label
            htmlFor="dispatcher-performance-range-select"
            lang={lang}
            style={{
              fontSize: 'var(--text-micro)',
              color: 'var(--color-ink-secondary)',
            }}
          >
            {t('dispatcher.performance.range.label', null, lang)}
          </label>
          <select
            id="dispatcher-performance-range-select"
            data-testid="dispatcher-performance-range-select"
            value={preset}
            onChange={(e) => setPreset(e.target.value as RangePreset)}
            style={{
              padding: '4px var(--space-2)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-surface-page)',
              color: 'var(--color-ink)',
              fontSize: 'var(--text-caption)',
              fontFamily: 'inherit',
            }}
          >
            <option value="today">
              {t('dispatcher.performance.range.today', null, lang)}
            </option>
            <option value="last7">
              {t('dispatcher.performance.range.last7', null, lang)}
            </option>
            <option value="last30">
              {t('dispatcher.performance.range.last30', null, lang)}
            </option>
            <option value="custom">
              {t('dispatcher.performance.range.custom', null, lang)}
            </option>
          </select>
          {preset === 'custom' && (
            <>
              <input
                type="date"
                aria-label={t('dispatcher.performance.range.custom', null, lang)}
                data-testid="dispatcher-performance-custom-from"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                style={dateInputStyle}
              />
              <input
                type="date"
                aria-label={t('dispatcher.performance.range.custom', null, lang)}
                data-testid="dispatcher-performance-custom-to"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                style={dateInputStyle}
              />
            </>
          )}
        </div>
      </header>

      {/* Body */}
      <main
        style={{
          flex: 1,
          maxWidth: 960,
          width: '100%',
          margin: '0 auto',
          padding: 'var(--space-5) var(--space-4)',
        }}
      >
        {loading ? (
          <SkeletonStatus lang={lang} className="performance-loading" data-testid="dispatcher-performance-loading">
            {/* The skeleton mirrors the strip's shape: a wide headline
                block beside a row of figure blocks, not three identical
                cards. A skeleton that does not match the loaded layout
                makes the page jump on arrival. */}
            <div className="metric-strip performance-loading-stats">
              <div className="metric-strip-headline">
                <SkeletonBlock style={{ width: '52%', height: 13 }} />
                <SkeletonBlock style={{ width: '44%', height: 30 }} />
              </div>
              <div className="metric-strip-figures">
                {[0, 1].map((item) => (
                  <div key={item} className="metric-strip-figure">
                    <SkeletonBlock style={{ width: '64%', height: 12 }} />
                    <SkeletonBlock style={{ width: '42%', height: 22 }} />
                  </div>
                ))}
              </div>
            </div>
            <div className="performance-loading-chart"><SkeletonBlock style={{ width: 190, height: 17 }} /><SkeletonBlock style={{ width: '100%', height: 200, borderRadius: 'var(--radius-md)' }} /></div>
            <div className="performance-loading-table">
              {[0, 1, 2, 3, 4].map((item) => <div key={item}><SkeletonBlock style={{ width: `${64 + (item % 3) * 9}%`, height: 14 }} /><SkeletonBlock style={{ width: 52, height: 14 }} /></div>)}
            </div>
          </SkeletonStatus>
        ) : error ? (
          <p
            lang={lang}
            role="alert"
            data-testid="dispatcher-performance-error"
            style={{
              fontSize: 'var(--text-body-sm)',
              color: 'var(--color-danger)',
              textAlign: 'center',
              padding: 'var(--space-7)',
            }}
          >
            {t('dispatcher.performance.error', null, lang)}
          </p>
        ) : snapshot ? (
          <>
            {/* Hero stats. The total report count is the headline; the
                resolution rate and the average resolution time are the
                two ways of reading it, so they share one surface rather
                than each getting an equal card. */}
            <section
              data-testid="dispatcher-performance-hero-stats"
              style={{ marginBottom: 'var(--space-5)' }}
            >
              <MetricStrip
                lang={lang}
                className="dispatcher-performance-metric-strip"
                ariaLabel={t('dispatcher.performance.hero.total', null, lang)}
                headline={heroFigure(
                  t('dispatcher.performance.hero.total', null, lang),
                  String(snapshot.hero.totalReports.value),
                  snapshot.hero.totalReports.delta,
                  'count',
                  lang,
                )}
                figures={[
                  heroFigure(
                    t('dispatcher.performance.hero.resolution_rate', null, lang),
                    `${snapshot.hero.resolutionRate.value}%`,
                    snapshot.hero.resolutionRate.delta,
                    'percent',
                    lang,
                  ),
                  heroFigure(
                    t('dispatcher.performance.hero.avg_time', null, lang),
                    formatDuration(snapshot.hero.avgTimeToResolve.valueMs, lang),
                    snapshot.hero.avgTimeToResolve.deltaMs,
                    'duration',
                    lang,
                  ),
                ]}
                data-testid="dispatcher-performance-metric-strip"
                data-testid-headline="dispatcher-performance-hero-total"
              />
            </section>

            {/* Charts */}
            <section
              data-testid="dispatcher-performance-charts"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-4)',
                marginBottom: 'var(--space-5)',
              }}
            >
              <SubmittedVsResolvedChart
                points={snapshot.submittedVsResolved}
                lang={lang}
              />
              <CategoryBreakdownChart
                rows={snapshot.categoryBreakdown}
                lang={lang}
              />
              <StatusDonutChart rows={snapshot.statusBreakdown} lang={lang} />
            </section>

            {/* Crew performance table */}
            <section
              data-testid="dispatcher-performance-crew-table"
              style={sectionStyle}
            >
              <h2 lang={lang} style={sectionTitleStyle}>
                {t('dispatcher.performance.crew.title', null, lang)}
              </h2>
              {snapshot.crewTable.length === 0 ? (
                <p lang={lang} style={emptyStyle}>
                  {t('dispatcher.performance.crew.empty', null, lang)}
                </p>
              ) : (
                <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                  {/* `minWidth` forces the wrapper to scroll sideways on
                      a phone instead of letting the columns collapse. */}
                  <table
                    style={{
                      width: '100%',
                      minWidth: 620,
                      borderCollapse: 'collapse',
                    }}
                  >
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                        {(
                          [
                            ['crewName', 'dispatcher.performance.crew.col.name'],
                            ['specialty', 'dispatcher.performance.crew.col.specialty'],
                            ['jobsCompleted', 'dispatcher.performance.crew.col.jobs'],
                            ['avgTimeToResolveMs', 'dispatcher.performance.crew.col.avg_time'],
                            ['feedbackRatio', 'dispatcher.performance.crew.col.feedback'],
                          ] as Array<[CrewSortKey, string]>
                        ).map(([key, labelKey]) => (
                          <th
                            key={key}
                            scope="col"
                            aria-sort={
                              sortKey === key
                                ? sortAsc
                                  ? 'ascending'
                                  : 'descending'
                                : 'none'
                            }
                            style={thStyle}
                          >
                            <button
                              type="button"
                              onClick={() => onSort(key)}
                              data-testid={`dispatcher-performance-sort-${key}`}
                              lang={lang}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                padding: 0,
                                cursor: 'pointer',
                                font: 'inherit',
                                color: 'inherit',
                                fontWeight: 'var(--weight-semibold)',
                              }}
                            >
                              {t(labelKey, null, lang)}
                              {sortKey === key ? (sortAsc ? ' ▲' : ' ▼') : ''}
                            </button>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedCrew.map((row) => {
                        const lowFeedback =
                          row.feedbackRatio !== null && row.feedbackRatio < 50;
                        return (
                          <tr
                            key={row.crewId}
                            data-testid="dispatcher-performance-crew-row"
                            style={{ borderBottom: '1px solid var(--color-border)' }}
                          >
                            <td style={tdStyle}>{row.crewName}</td>
                            <td style={tdStyle}>
                              {row.specialty
                                ? row.specialty
                                : t(
                                    'dispatcher.performance.crew.specialty_unknown',
                                    null,
                                    lang,
                                  )}
                            </td>
                            <td style={tdStyle}>{row.jobsCompleted}</td>
                            <td style={tdStyle}>
                              {row.avgTimeToResolveMs === null
                                ? '—'
                                : formatDuration(row.avgTimeToResolveMs, lang)}
                            </td>
                            <td style={tdStyle}>
                              {row.feedbackRatio === null ? (
                                <span style={{ color: 'var(--color-ink-tertiary)' }}>
                                  {t(
                                    'dispatcher.performance.crew.feedback.not_enough_data',
                                    null,
                                    lang,
                                  )}
                                </span>
                              ) : (
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 'var(--space-2)',
                                  }}
                                >
                                  {t(
                                    'dispatcher.performance.crew.feedback.ratio',
                                    {
                                      positive: row.positiveFeedback,
                                      negative: row.negativeFeedback,
                                    },
                                    lang,
                                  )}
                                  {lowFeedback && (
                                    <span
                                      data-testid="dispatcher-performance-low-feedback-badge"
                                      style={{
                                        padding: '2px var(--space-2)',
                                        borderRadius: 'var(--radius-pill)',
                                        background: 'var(--color-status-error-soft)',
                                        color: 'var(--color-status-error)',
                                        fontSize: 10,
                                        fontWeight: 'var(--weight-bold)',
                                      }}
                                    >
                                      {t(
                                        'dispatcher.performance.crew.low_feedback_badge',
                                        null,
                                        lang,
                                      )}
                                    </span>
                                  )}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Long-tail list */}
            <section
              data-testid="dispatcher-performance-long-tail"
              style={sectionStyle}
            >
              <h2 lang={lang} style={sectionTitleStyle}>
                {t('dispatcher.performance.long_tail.title', null, lang)}
              </h2>
              {snapshot.longTail.length === 0 ? (
                <p lang={lang} style={emptyStyle}>
                  {t('dispatcher.performance.long_tail.empty', null, lang)}
                </p>
              ) : (
                <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                  {/* `minWidth` forces the wrapper to scroll sideways on
                      a phone instead of letting the columns collapse. */}
                  <table
                    style={{
                      width: '100%',
                      minWidth: 620,
                      borderCollapse: 'collapse',
                    }}
                  >
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <th scope="col" style={thStyle}>
                          {t('dispatcher.performance.long_tail.col.ticket', null, lang)}
                        </th>
                        <th scope="col" style={thStyle}>
                          {t('dispatcher.performance.long_tail.col.category', null, lang)}
                        </th>
                        <th scope="col" style={thStyle}>
                          {t('dispatcher.performance.long_tail.col.submitted', null, lang)}
                        </th>
                        <th scope="col" style={thStyle}>
                          {t('dispatcher.performance.long_tail.col.age', null, lang)}
                        </th>
                        <th scope="col" style={thStyle}>
                          {t('dispatcher.performance.long_tail.col.crew', null, lang)}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshot.longTail.map((row) => (
                        <tr
                          key={row.id}
                          data-testid="dispatcher-performance-long-tail-row"
                          style={{ borderBottom: '1px solid var(--color-border)' }}
                        >
                          <td style={tdStyle}>
                            <Link
                              href={`/dispatcher/tickets/${row.id}`}
                              style={{
                                color: 'var(--color-primary)',
                                fontWeight: 'var(--weight-semibold)',
                                textDecoration: 'none',
                                fontFamily: 'var(--font-mono)',
                                fontSize: 'var(--text-caption)',
                              }}
                            >
                              {formatTicketId(row.id)}
                            </Link>
                          </td>
                          <td style={tdStyle}>
                            {categoryLabel(row.categoryId, lang)}
                          </td>
                          <td style={tdStyle}>
                            {formatTimestamp(row.createdAt, lang)}
                          </td>
                          <td style={tdStyle}>
                            {formatDuration(row.ageMs, lang)}
                          </td>
                          <td style={tdStyle}>
                            {row.assignedCrewName ??
                              t('dispatcher.performance.long_tail.unassigned', null, lang)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Export controls */}
            <div
              data-testid="dispatcher-performance-export"
              className="dispatcher-performance-export"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-4)',
                marginTop: 'var(--space-5)',
              }}
            >
              <button
                type="button"
                onClick={onExportPdf}
                disabled={exporting}
                data-testid="dispatcher-performance-export-pdf"
                lang={lang}
                style={{
                  padding: 'var(--space-3) var(--space-5)',
                  background: 'var(--color-primary)',
                  color: 'var(--color-on-primary)',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-body-sm)',
                  fontWeight: 'var(--weight-semibold)',
                  cursor: exporting ? 'wait' : 'pointer',
                  opacity: exporting ? 0.7 : 1,
                }}
              >
                {exporting
                  ? t('dispatcher.performance.export.pdf_preparing', null, lang)
                  : t('dispatcher.performance.export.pdf', null, lang)}
              </button>
              <button
                type="button"
                onClick={onExportCsv}
                data-testid="dispatcher-performance-export-csv"
                lang={lang}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--color-primary)',
                  fontSize: 'var(--text-body-sm)',
                  fontWeight: 'var(--weight-semibold)',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: 0,
                }}
              >
                {t('dispatcher.performance.export.csv', null, lang)}
              </button>
            </div>
          </>
        ) : null}
      </main>

      {/* Print stylesheet — hides the back arrow, date picker and
          export controls; renders the charts flat (no shadows). */}
      <style jsx>{`
        @media print {
          .dispatcher-performance-back,
          .dispatcher-performance-range,
          .dispatcher-performance-export {
            display: none !important;
          }
          [data-testid='dispatcher-performance-page'] {
            background: #ffffff !important;
          }
          [data-testid='dispatcher-performance-charts'] section,
          [data-testid='dispatcher-performance-crew-table'],
          [data-testid='dispatcher-performance-long-tail'] {
            box-shadow: none !important;
            break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hero figures                                                        */
/* ------------------------------------------------------------------ */

/**
 * Turn a hero metric into a MetricStrip figure.
 *
 * A negative delta on "avg time to resolve" is GOOD (faster), so the
 * tone inverts for the duration kind. The direction is carried by the
 * strip's arrow, never by the colour alone, and the "no change" case
 * is stated in words rather than left blank — an absent delta reads
 * as a rendering failure.
 */
function heroFigure(
  label: string,
  value: string,
  delta: number,
  deltaKind: 'count' | 'percent' | 'duration',
  lang: Language,
) {
  // A negative delta on "avg time to resolve" is GOOD (faster),
  // so the colour direction inverts for the duration kind.
  const favorable = deltaKind === 'duration' ? delta < 0 : delta > 0;
  const unfavorable = deltaKind === 'duration' ? delta > 0 : delta < 0;
  const deltaText =
    deltaKind === 'duration'
      ? formatDuration(Math.abs(delta), lang)
      : `${delta > 0 ? '+' : ''}${delta}${deltaKind === 'percent' ? 'pp' : ''}`;
  const trend: MetricTrend = delta > 0 ? 'up' : 'down';
  const trendTone: MetricTone = favorable ? 'success' : unfavorable ? 'danger' : 'neutral';
  return {
    key: label,
    label,
    value,
    ...(delta === 0
      ? { hint: t('dispatcher.performance.hero.no_delta', null, lang) }
      : {
          trend,
          trendValue: deltaText,
          trendTone,
          hint: t('dispatcher.performance.hero.delta_vs_previous', null, lang),
        }),
  };
}

/* ------------------------------------------------------------------ */
/* Charts — inline SVG, each with an accessible table sibling         */
/* ------------------------------------------------------------------ */

function SubmittedVsResolvedChart({
  points,
  lang,
}: {
  points: PerfSnapshot['submittedVsResolved'];
  lang: Language;
}) {
  const width = 880;
  const height = 180;
  const padLeft = 34;
  const padBottom = 22;
  const plotW = width - padLeft - 8;
  const plotH = height - padBottom - 8;
  const max = Math.max(
    1,
    ...points.map((p) => Math.max(p.submitted, p.resolved)),
  );
  const step = points.length > 1 ? plotW / (points.length - 1) : plotW;
  const y = (v: number) => plotH - (v / max) * plotH;
  const submittedPath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${(padLeft + i * step).toFixed(2)},${y(p.submitted).toFixed(2)}`)
    .join(' ');
  const resolvedPath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${(padLeft + i * step).toFixed(2)},${y(p.resolved).toFixed(2)}`)
    .join(' ');
  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <section data-testid="dispatcher-performance-chart-submitted" style={sectionStyle}>
      <h2 lang={lang} style={sectionTitleStyle}>
        {t('dispatcher.performance.chart.submitted_vs_resolved.title', null, lang)}
      </h2>
      <svg
        role="img"
        aria-label={t('dispatcher.performance.chart.submitted_vs_resolved.caption', null, lang)}
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
      >
        {gridLines.map((g) => (
          <line
            key={g}
            x1={padLeft}
            x2={width - 8}
            y1={8 + g * plotH}
            y2={8 + g * plotH}
            stroke="var(--color-border)"
            strokeWidth={1}
          />
        ))}
        <path
          d={submittedPath}
          fill="none"
          stroke="var(--color-status-routed)"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        <path
          d={resolvedPath}
          fill="none"
          stroke="var(--color-status-resolved)"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {points.map((p, i) => (
          <g key={p.date}>
            <circle
              cx={padLeft + i * step}
              cy={8 + y(p.submitted)}
              r={3}
              fill="var(--color-status-routed)"
            >
              <title>{`${p.date}: ${p.submitted} submitted, ${p.resolved} resolved`}</title>
            </circle>
            <circle
              cx={padLeft + i * step}
              cy={8 + y(p.resolved)}
              r={3}
              fill="var(--color-status-resolved)"
            />
          </g>
        ))}
      </svg>
      <ChartTable
        caption={t('dispatcher.performance.chart.submitted_vs_resolved.caption', null, lang)}
        headers={[
          t('dispatcher.performance.chart.col.date', null, lang),
          t('dispatcher.performance.chart.col.submitted', null, lang),
          t('dispatcher.performance.chart.col.resolved', null, lang),
        ]}
        rows={points.map((p) => [p.date, String(p.submitted), String(p.resolved)])}
        testId="dispatcher-performance-chart-submitted-table"
      />
    </section>
  );
}

function CategoryBreakdownChart({
  rows,
  lang,
}: {
  rows: PerfSnapshot['categoryBreakdown'];
  lang: Language;
}) {
  const width = 880;
  const rowHeight = 26;
  const height = Math.max(1, rows.length) * rowHeight + 8;
  const labelWidth = 150;
  const plotW = width - labelWidth - 40;
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <section data-testid="dispatcher-performance-chart-category" style={sectionStyle}>
      <h2 lang={lang} style={sectionTitleStyle}>
        {t('dispatcher.performance.chart.category.title', null, lang)}
      </h2>
      {rows.length === 0 ? (
        <p lang={lang} style={emptyStyle}>
          {t('dispatcher.performance.empty', null, lang)}
        </p>
      ) : (
        <svg
          role="img"
          aria-label={t('dispatcher.performance.chart.category.caption', null, lang)}
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          {rows.map((r, i) => {
            const y = i * rowHeight + 4;
            const w = (r.count / max) * plotW;
            return (
              <g key={r.categoryId}>
                <text
                  x={0}
                  y={y + rowHeight / 2}
                  dominantBaseline="middle"
                  fontSize={11}
                  fill="var(--color-ink-secondary)"
                >
                  {categoryLabel(r.categoryId, lang)}
                </text>
                <rect
                  x={labelWidth}
                  y={y + 4}
                  width={Math.max(2, w)}
                  height={rowHeight - 10}
                  rx={3}
                  fill="var(--color-primary)"
                >
                  <title>{`${categoryLabel(r.categoryId, lang)}: ${r.count}`}</title>
                </rect>
                <text
                  x={labelWidth + Math.max(2, w) + 6}
                  y={y + rowHeight / 2}
                  dominantBaseline="middle"
                  fontSize={11}
                  fill="var(--color-ink)"
                >
                  {r.count}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      <ChartTable
        caption={t('dispatcher.performance.chart.category.caption', null, lang)}
        headers={[
          t('dispatcher.performance.chart.col.category', null, lang),
          t('dispatcher.performance.chart.col.count', null, lang),
        ]}
        rows={rows.map((r) => [categoryLabel(r.categoryId, lang), String(r.count)])}
        testId="dispatcher-performance-chart-category-table"
      />
    </section>
  );
}

const DONUT_COLORS: Record<string, string> = {
  submitted: 'var(--color-status-submitted)',
  routed: 'var(--color-status-routed)',
  in_progress: 'var(--color-status-in-progress)',
  resolved: 'var(--color-status-resolved)',
  closed: 'var(--color-ink-tertiary)',
  cancelled: 'var(--color-border-strong)',
};

function StatusDonutChart({
  rows,
  lang,
}: {
  rows: PerfSnapshot['statusBreakdown'];
  lang: Language;
}) {
  const size = 180;
  const radius = 70;
  const stroke = 28;
  const circumference = 2 * Math.PI * radius;
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  let offset = 0;
  return (
    <section data-testid="dispatcher-performance-chart-status" style={sectionStyle}>
      <h2 lang={lang} style={sectionTitleStyle}>
        {t('dispatcher.performance.chart.status.title', null, lang)}
      </h2>
      {total === 0 ? (
        <p lang={lang} style={emptyStyle}>
          {t('dispatcher.performance.empty', null, lang)}
        </p>
      ) : (
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-5)',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <svg
            role="img"
            aria-label={t('dispatcher.performance.chart.status.caption', null, lang)}
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
          >
            <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
              {rows.map((r) => {
                if (r.count === 0) return null;
                const frac = r.count / total;
                const dash = frac * circumference;
                const el = (
                  <circle
                    key={r.status}
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={DONUT_COLORS[r.status] ?? 'var(--color-ink-tertiary)'}
                    strokeWidth={stroke}
                    strokeDasharray={`${dash} ${circumference - dash}`}
                    strokeDashoffset={-offset}
                  >
                    <title>{`${r.status}: ${r.count}`}</title>
                  </circle>
                );
                offset += dash;
                return el;
              })}
            </g>
            <text
              x={size / 2}
              y={size / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={22}
              fontWeight="700"
              fill="var(--color-ink)"
            >
              {total}
            </text>
          </svg>
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-1)',
            }}
          >
            {rows.map((r) => (
              <li
                key={r.status}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  fontSize: 'var(--text-caption)',
                  color: 'var(--color-ink-secondary)',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background:
                      DONUT_COLORS[r.status] ?? 'var(--color-ink-tertiary)',
                    flexShrink: 0,
                  }}
                />
                {t(`status.${r.status}`, null, lang)} · {r.count}
              </li>
            ))}
          </ul>
        </div>
      )}
      <ChartTable
        caption={t('dispatcher.performance.chart.status.caption', null, lang)}
        headers={[
          t('dispatcher.performance.chart.col.status', null, lang),
          t('dispatcher.performance.chart.col.count', null, lang),
        ]}
        rows={rows.map((r) => [
          t(`status.${r.status}`, null, lang),
          String(r.count),
        ])}
        testId="dispatcher-performance-chart-status-table"
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

/** Escape a CSV cell (quotes + commas). */
function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

const sectionStyle: React.CSSProperties = {
  background: 'var(--color-surface-card)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-4)',
  marginBottom: 'var(--space-4)',
  position: 'relative',
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 'var(--text-body-lg)',
  fontWeight: 'var(--weight-bold)',
  color: 'var(--color-ink)',
  margin: '0 0 var(--space-3)',
};

const emptyStyle: React.CSSProperties = {
  fontSize: 'var(--text-body-sm)',
  color: 'var(--color-ink-tertiary)',
  margin: 0,
};

const thStyle: React.CSSProperties = {
  padding: 'var(--space-2) var(--space-3)',
  textAlign: 'left',
  fontWeight: 'var(--weight-semibold)',
  color: 'var(--color-ink-secondary)',
  fontSize: 'var(--text-caption)',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: 'var(--space-2) var(--space-3)',
  verticalAlign: 'middle',
  fontSize: 'var(--text-caption)',
  color: 'var(--color-ink)',
};

const dateInputStyle: React.CSSProperties = {
  padding: '4px var(--space-2)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--color-surface-page)',
  color: 'var(--color-ink)',
  fontSize: 'var(--text-caption)',
  fontFamily: 'inherit',
};
