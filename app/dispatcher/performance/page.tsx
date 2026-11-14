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
 * Accessibility: every chart comes from the shared chart kit, which
 * ships a VISIBLE, SORTABLE data-table fallback from the same data
 * array — with `<caption>` and `<th scope="col">`. The tables are
 * hidden behind a real "Show table" toggle rather than being
 * `aria-hidden`, so a keyboard user can reach them.
 *
 * The page holds NO chart or table implementation of its own: the
 * three charts are `TrendLine` / `CategoryBar` / `StatusDonut`, the
 * two tables are `DataTable`, and the controls are `Button` and
 * `Select`. That is the point of the redesign — one implementation
 * per job, not one per page.
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { t, type Language } from '@/lib/i18n/keys';
import { formatTicketId } from '@/lib/format/ticket-id';
import { formatTimestampShort as formatTimestamp } from '@/lib/format/datetime';
import { formatDuration } from '@/lib/format/duration';
import { categoryLabel, categoryLabelBySlug } from '@/lib/identity/display-name';
import { MetricStrip, type MetricTone, type MetricTrend } from '@/components/ui/MetricStrip';
import { TrendLine, CategoryBar, StatusDonut } from '@/components/ui/charts';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { STATUS_COLOR } from '@/lib/ui/status-tokens';
import { useLanguage } from '@/components/useLanguage';
import { SkeletonBlock, SkeletonStatus } from '@/components/ui/Skeleton';
import { useSession } from '@/components/SessionProvider';


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

/**
 * One crew row in the performance table.
 *
 * Named separately from the snapshot so the column definitions can
 * name their row type — a column's `render` and `sortValue` both
 * need to know what a row is.
 */
interface CrewRow {
  crewId: string;
  crewName: string;
  specialty: string | null;
  jobsCompleted: number;
  avgTimeToResolveMs: number | null;
  positiveFeedback: number;
  negativeFeedback: number;
  feedbackRatio: number | null;
}

/** One row in the long-tail table — a ticket that is still open. */
interface LongTailRow {
  id: string;
  categoryId: string;
  /** The stable machine key — see `categoryBreakdown`. */
  categorySlug?: string | null;
  createdAt: string;
  ageMs: number;
  assignedCrewId: string | null;
  assignedCrewName: string | null;
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
  categoryBreakdown: Array<{
    categoryId: string;
    count: number;
    /**
     * The stable machine key ("streetlight", "pothole", …). The
     * server resolves it from the database, because `categoryId` is
     * backend-specific (`cat_streetlight` in the dev store, a CUID in
     * Postgres) and cannot be localized from the client.
     */
    categorySlug?: string | null;
  }>;
  statusBreakdown: Array<{ status: string; count: number }>;
  crewTable: CrewRow[];
  longTail: LongTailRow[];
  range: { fromIso: string; toIso: string };
  ward: {
    wardId: string | null;
    wardLabel: string | null;
    wardLabelBn: string | null;
  };
}

export default function DispatcherPerformancePage() {
  const { lang, setLang } = useLanguage();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  // The shared session — one request for the whole page.
  const { authenticated } = useSession();
  const [snapshot, setSnapshot] = useState<PerfSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preset, setPreset] = useState<RangePreset>('last7');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [exporting, setExporting] = useState(false);

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

  /**
   * The crew table's columns.
   *
   * The sort lives in `DataTable`, so the page keeps no sort state of
   * its own: two sort implementations is one too many, and the
   * hand-rolled one left an unsorted column with no `aria-sort` and
   * put the sort arrow in the button label rather than on the `th`.
   *
   * The sort accessors keep the "nulls last" rule the hand-rolled
   * comparator had — a crew with no feedback data sorts to the bottom
   * of the feedback column rather than to the top.
   */
  const crewColumns = useMemo<DataTableColumn<CrewRow>[]>(
    () => [
      {
        key: 'crewName',
        header: t('dispatcher.performance.crew.col.name', null, lang),
        render: (row) => row.crewName,
        sortValue: (row) => row.crewName,
        sortTestId: 'dispatcher-performance-sort-crewName',
      },
      {
        key: 'specialty',
        header: t('dispatcher.performance.crew.col.specialty', null, lang),
        render: (row) =>
          row.specialty
            ? row.specialty
            : t('dispatcher.performance.crew.specialty_unknown', null, lang),
        sortValue: (row) => row.specialty ?? '',
        sortTestId: 'dispatcher-performance-sort-specialty',
      },
      {
        key: 'jobsCompleted',
        header: t('dispatcher.performance.crew.col.jobs', null, lang),
        numeric: true,
        render: (row) => row.jobsCompleted,
        sortValue: (row) => row.jobsCompleted,
        sortTestId: 'dispatcher-performance-sort-jobsCompleted',
      },
      {
        key: 'avgTimeToResolveMs',
        header: t('dispatcher.performance.crew.col.avg_time', null, lang),
        numeric: true,
        render: (row) =>
          row.avgTimeToResolveMs === null
            ? '—'
            : formatDuration(row.avgTimeToResolveMs, lang),
        // A crew with no resolved jobs has no average; it sorts last.
        sortValue: (row) => row.avgTimeToResolveMs ?? Number.MAX_SAFE_INTEGER,
        sortTestId: 'dispatcher-performance-sort-avgTimeToResolveMs',
      },
      {
        key: 'feedbackRatio',
        header: t('dispatcher.performance.crew.col.feedback', null, lang),
        numeric: true,
        render: (row) => {
          if (row.feedbackRatio === null) {
            return (
              <span style={{ color: 'var(--color-ink-tertiary)' }}>
                {t(
                  'dispatcher.performance.crew.feedback.not_enough_data',
                  null,
                  lang,
                )}
              </span>
            );
          }
          const lowFeedback = row.feedbackRatio < 50;
          return (
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
                  {t('dispatcher.performance.crew.low_feedback_badge', null, lang)}
                </span>
              )}
            </span>
          );
        },
        sortValue: (row) => row.feedbackRatio ?? Number.MAX_SAFE_INTEGER,
        sortTestId: 'dispatcher-performance-sort-feedbackRatio',
      },
    ],
    [lang],
  );

  /**
   * The long-tail table's columns.
   *
   * The ticket column is a link — the dispatcher follows it straight
   * into the record. Every other column sorts by its underlying
   * value, not by the formatted string, so "age" sorts by milliseconds
   * rather than by the order the localised duration strings happen to
   * read in.
   */
  const longTailColumns = useMemo<DataTableColumn<LongTailRow>[]>(
    () => [
      {
        key: 'ticket',
        header: t('dispatcher.performance.long_tail.col.ticket', null, lang),
        render: (row) => (
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
        ),
        sortValue: (row) => formatTicketId(row.id),
        sortTestId: 'dispatcher-performance-long-tail-sort-ticket',
      },
      {
        key: 'category',
        header: t('dispatcher.performance.long_tail.col.category', null, lang),
        render: (row) => categoryLabelBySlug(row.categorySlug, lang, row.categoryId),
        sortValue: (row) => categoryLabelBySlug(row.categorySlug, lang, row.categoryId),
        sortTestId: 'dispatcher-performance-long-tail-sort-category',
      },
      {
        key: 'submitted',
        header: t('dispatcher.performance.long_tail.col.submitted', null, lang),
        render: (row) => formatTimestamp(row.createdAt, lang),
        sortValue: (row) => new Date(row.createdAt).getTime(),
        sortTestId: 'dispatcher-performance-long-tail-sort-submitted',
      },
      {
        key: 'age',
        header: t('dispatcher.performance.long_tail.col.age', null, lang),
        numeric: true,
        render: (row) => formatDuration(row.ageMs, lang),
        sortValue: (row) => row.ageMs,
        sortTestId: 'dispatcher-performance-long-tail-sort-age',
      },
      {
        key: 'crew',
        header: t('dispatcher.performance.long_tail.col.crew', null, lang),
        render: (row) =>
          row.assignedCrewName ??
          t('dispatcher.performance.long_tail.unassigned', null, lang),
        sortValue: (row) => row.assignedCrewName ?? '',
        sortTestId: 'dispatcher-performance-long-tail-sort-crew',
      },
    ],
    [lang],
  );

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
          <Select
            id="dispatcher-performance-range-select"
            data-testid="dispatcher-performance-range-select"
            size="sm"
            value={preset}
            onChange={(e) => setPreset(e.target.value as RangePreset)}
            lang={lang}
            options={[
              { value: 'today', label: t('dispatcher.performance.range.today', null, lang) },
              { value: 'last7', label: t('dispatcher.performance.range.last7', null, lang) },
              { value: 'last30', label: t('dispatcher.performance.range.last30', null, lang) },
              { value: 'custom', label: t('dispatcher.performance.range.custom', null, lang) },
            ]}
            style={{ width: 'auto' }}
          />
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

            {/* Charts.
                Every chart is one of the SHARED kit components, so
                the three of them behave identically: each has a
                caption, a scoped-column data table the reader can
                reach, and no series encoded by hue alone. The
                hand-rolled SVG that used to live here had the table
                as a visually-hidden sibling — a sighted keyboard
                user could not reach the numbers the chart was
                drawing.
            */}
            <section
              data-testid="dispatcher-performance-charts"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-4)',
                marginBottom: 'var(--space-5)',
              }}
            >
              <TrendLine
                title={t(
                  'dispatcher.performance.chart.submitted_vs_resolved.title',
                  null,
                  lang,
                )}
                description={t(
                  'dispatcher.performance.chart.submitted_vs_resolved.caption',
                  null,
                  lang,
                )}
                data={snapshot.submittedVsResolved.map((point) => ({
                  label: point.date,
                  submitted: point.submitted,
                  resolved: point.resolved,
                }))}
                series={[
                  {
                    key: 'submitted',
                    label: t(
                      'dispatcher.performance.chart.col.submitted',
                      null,
                      lang,
                    ),
                    color: STATUS_COLOR.submitted,
                    // A dash pattern, so the two series stay
                    // separable when the colour is dropped.
                    dashArray: '6 3',
                  },
                  {
                    key: 'resolved',
                    label: t(
                      'dispatcher.performance.chart.col.resolved',
                      null,
                      lang,
                    ),
                    color: STATUS_COLOR.resolved,
                    dashArray: '2 3',
                  },
                ]}
                lang={lang}
                height={220}
                data-testid="dispatcher-performance-chart-submitted"
                data-testid-table="dispatcher-performance-chart-submitted-table"
              />
              <CategoryBar
                title={t(
                  'dispatcher.performance.chart.category.title',
                  null,
                  lang,
                )}
                description={t(
                  'dispatcher.performance.chart.category.caption',
                  null,
                  lang,
                )}
                entries={snapshot.categoryBreakdown.map((row) => ({
                  key: row.categoryId,
                  label: categoryLabelBySlug(
                    row.categorySlug,
                    lang,
                    row.categoryId,
                  ),
                  value: row.count,
                  color: 'var(--color-primary)',
                }))}
                lang={lang}
                height={Math.max(
                  120,
                  snapshot.categoryBreakdown.length * 34,
                )}
                data-testid="dispatcher-performance-chart-category"
                data-testid-table="dispatcher-performance-chart-category-table"
              />
              <StatusDonut
                title={t(
                  'dispatcher.performance.chart.status.title',
                  null,
                  lang,
                )}
                description={t(
                  'dispatcher.performance.chart.status.caption',
                  null,
                  lang,
                )}
                entries={snapshot.statusBreakdown.map((row) => ({
                  status: row.status,
                  count: row.count,
                }))}
                lang={lang}
                data-testid="dispatcher-performance-chart-status"
                data-testid-table="dispatcher-performance-chart-status-table"
              />
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
                <DataTable
                  columns={crewColumns}
                  rows={snapshot.crewTable}
                  rowKey={(row) => row.crewId}
                  caption={t('dispatcher.performance.crew.title', null, lang)}
                  lang={lang}
                  initialSort={{ key: 'jobsCompleted', direction: 'desc' }}
                  data-testid="dispatcher-performance-crew-table-body"
                />
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
                <DataTable
                  columns={longTailColumns}
                  rows={snapshot.longTail}
                  rowKey={(row) => row.id}
                  caption={t('dispatcher.performance.long_tail.title', null, lang)}
                  lang={lang}
                  data-testid="dispatcher-performance-long-tail-table"
                />
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
              <Button
                variant="primary"
                onClick={onExportPdf}
                loading={exporting}
                data-testid="dispatcher-performance-export-pdf"
                lang={lang}
              >
                {exporting
                  ? t('dispatcher.performance.export.pdf_preparing', null, lang)
                  : t('dispatcher.performance.export.pdf', null, lang)}
              </Button>
              <Button
                variant="ghost"
                onClick={onExportCsv}
                data-testid="dispatcher-performance-export-csv"
                lang={lang}
              >
                {t('dispatcher.performance.export.csv', null, lang)}
              </Button>
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

const dateInputStyle: React.CSSProperties = {
  padding: '4px var(--space-2)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--color-surface-page)',
  color: 'var(--color-ink)',
  fontSize: 'var(--text-caption)',
  fontFamily: 'inherit',
};
