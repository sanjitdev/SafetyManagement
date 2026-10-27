/**
 * /admin/cities/[id]/adoption — 4.7 Post-launch Adoption Dashboard.
 *
 * Bolt 005-003 (Intent 005, Unit 003).
 *
 * A snapshot (no polling) of the four hero stats, the adoption
 * funnel, the daily-activity line chart, the ward heatmap, the three
 * engagement signals and the health flags.
 *
 * CHARTS: there is no charting library in this project and none may
 * be added, so every chart is inline SVG. Each chart has a table
 * sibling built from the SAME data array so the information is
 * reachable by a screen reader and by the CSV export.
 *
 * PDF EXPORT: the charts are inline SVG, which cannot be rasterised
 * server-side without a rendering dependency the project does not
 * have. The PDF export therefore uses the browser print stylesheet
 * plus `window.print()` — the admin picks "Save as PDF" in the
 * print dialog. The CSV export IS server-rendered
 * (`/api/v1/admin/cities/[id]/adoption/export`).
 *
 * All user-facing copy goes through `t(...)`.
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { t, type Language } from '@/lib/i18n/keys';

const LANG_KEY = 'cityfix.preferred_language.v1';

interface HeroStat {
  key: 'registeredCitizens' | 'reportsReceived' | 'resolutionRate' | 'avgTimeToResolve';
  value: number;
  unit: 'count' | 'percent' | 'duration';
  deltaPercent: number | null;
  durationMs: number | null;
}

interface FunnelStage {
  key: 'visit' | 'registered' | 'submitted' | 'secondReport' | 'feedback';
  count: number;
  conversion: number | null;
}

interface DailyPoint {
  date: string;
  submitted: number;
  resolved: number;
  registered: number;
}

interface WardActivity {
  wardId: string;
  wardNumber: number;
  wardName: string;
  wardNameBn: string | null;
  reports: number;
  resolved: number;
  intensity: number;
}

interface EngagementSignal {
  key: 'staffActivity' | 'citizenRetention' | 'crewResponseTime';
  value: number;
  unit: 'percent' | 'duration';
  detail: { active: number; total: number };
}

interface HealthFlag {
  key: string;
  kind: 'staff' | 'backlog' | 'coverage';
  vars: Record<string, string | number>;
  href: string;
}

interface Comparison {
  cityId: string;
  cityName: string;
  reportsReceived: number;
  resolutionRate: number;
  registeredCitizens: number;
  daily: DailyPoint[];
}

interface Dashboard {
  cityId: string;
  from: string;
  to: string;
  hero: HeroStat[];
  funnel: FunnelStage[];
  daily: DailyPoint[];
  wards: WardActivity[];
  engagement: EngagementSignal[];
  healthFlags: HealthFlag[];
  comparison: Comparison | null;
}

type RangeKey = '7d' | '30d' | 'sinceLaunch' | 'custom';

const RANGE_DAYS: Record<RangeKey, number | null> = {
  '7d': 7,
  '30d': 30,
  sinceLaunch: null,
  custom: null,
};

export default function AdminCityAdoptionPage() {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const cityId = params?.id ?? '';
  const [lang, setLang] = useState<Language>('bn');
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<RangeKey>('30d');
  const [compare, setCompare] = useState(false);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  useEffect(() => {
    const stored =
      typeof window !== 'undefined'
        ? window.localStorage.getItem(LANG_KEY)
        : null;
    if (stored === 'bn' || stored === 'en') setLang(stored);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LANG_KEY, lang);
    }
  }, [lang]);

  const rangeParams = useCallback((): string => {
    const now = new Date();
    const to = now.toISOString();
    if (range === 'custom') {
      const params = new URLSearchParams();
      if (customFrom) params.set('from', customFrom);
      if (customTo) params.set('to', customTo);
      if (compare) params.set('compare', '1');
      return params.toString();
    }
    const days = RANGE_DAYS[range];
    const from =
      days === null
        ? new Date(0).toISOString()
        : new Date(now.getTime() - days * 86_400_000).toISOString();
    const params = new URLSearchParams({ from, to });
    if (compare) params.set('compare', '1');
    return params.toString();
  }, [range, customFrom, customTo, compare]);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch(
      `/api/v1/admin/cities/${cityId}/adoption?${rangeParams()}`,
      { credentials: 'include' },
    );
    if (!res.ok) {
      setError(`http_${res.status}`);
      return;
    }
    const payload = (await res.json()) as Dashboard;
    setDash(payload);
  }, [cityId, rangeParams]);

  // Auth + role gate.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const statusRes = await fetch('/api/auth/status', {
          credentials: 'include',
        });
        const status = (await statusRes.json()) as {
          authenticated: boolean;
          session?: { role: 'citizen' | 'dispatcher' | 'crew' | 'admin' } | null;
        };
        if (cancelled) return;
        if (!status.authenticated) {
          window.location.href =
            '/login?next=' + encodeURIComponent(pathname || '/admin/cities');
          return;
        }
        if (status.session?.role !== 'admin') {
          window.location.href = '/';
          return;
        }
        setSignedIn(true);
      } catch {
        if (!cancelled) setError('network');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    if (signedIn) void load();
  }, [signedIn, load]);

  const handleExportCsv = useCallback(() => {
    window.location.href = `/api/v1/admin/cities/${cityId}/adoption/export?${rangeParams()}`;
  }, [cityId, rangeParams]);

  const handleExportPdf = useCallback(() => {
    // The charts are inline SVG, so the PDF is produced by the
    // browser's print pipeline rather than a server-side renderer.
    window.print();
  }, []);

  // --- Chart geometry helpers -----------------------------------------
  const chart = useMemo(() => {
    const width = 720;
    const height = 220;
    const padL = 36;
    const padR = 12;
    const padT = 12;
    const padB = 24;
    const innerW = width - padL - padR;
    const innerH = height - padT - padB;
    return { width, height, padL, padR, padT, padB, innerW, innerH };
  }, []);

  const maxDaily = useMemo(() => {
    const values: number[] = [];
    for (const d of dash?.daily ?? []) {
      values.push(d.submitted, d.resolved, d.registered);
    }
    for (const d of dash?.comparison?.daily ?? []) {
      values.push(d.submitted);
    }
    return Math.max(1, ...values);
  }, [dash]);

  const linePath = useCallback(
    (points: { x: number; y: number }[]): string =>
      points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
    [],
  );

  const dailySeries = useMemo(() => {
    const days = dash?.daily ?? [];
    const empty = {
      submitted: [] as { x: number; y: number }[],
      resolved: [] as { x: number; y: number }[],
      registered: [] as { x: number; y: number }[],
      comparison: [] as { x: number; y: number }[],
    };
    if (days.length === 0) return empty;
    const step =
      days.length > 1 ? chart.innerW / (days.length - 1) : chart.innerW;
    const y = (v: number) =>
      chart.padT + chart.innerH - (v / maxDaily) * chart.innerH;
    const x = (i: number) => chart.padL + i * step;
    const build = (pick: (d: DailyPoint) => number) =>
      days.map((d, i) => ({ x: x(i), y: y(pick(d)) }));
    const cmpDays = dash?.comparison?.daily ?? [];
    const cmp = cmpDays.map((d, i) => ({
      x: x(i),
      y: y(d.submitted),
    }));
    return {
      submitted: build((d) => d.submitted),
      resolved: build((d) => d.resolved),
      registered: build((d) => d.registered),
      comparison: cmp,
    };
  }, [dash, chart, maxDaily]);

  const formatDuration = (ms: number): string => {
    if (!Number.isFinite(ms) || ms <= 0) return '—';
    const hours = ms / 3_600_000;
    if (hours < 1) return `${Math.round(ms / 60_000)}m`;
    if (hours < 48) return `${hours.toFixed(1)}h`;
    return `${Math.round(hours / 24)}d`;
  };

  if (signedIn === null) {
    return (
      <div className="p-8 text-sm text-slate-600">
        {t('admin.adoption.title', null, lang)} …
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-block { break-inside: avoid; }
          body { background: #fff; }
        }
      `}</style>

      <header
        data-testid="admin-city-adoption-header"
        className="no-print sticky top-0 z-20 border-b border-slate-200 bg-white px-6 py-4 flex items-center justify-between flex-wrap gap-3"
      >
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-slate-900">
            {t('admin.adoption.title', null, lang)}
          </h1>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              data-testid="admin-city-adoption-compare-toggle"
              checked={compare}
              onChange={(e) => setCompare(e.target.checked)}
            />
            {t('admin.adoption.compare.toggle', null, lang)}
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            data-testid="admin-city-adoption-button-export-pdf"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
            onClick={handleExportPdf}
          >
            {t('admin.adoption.cta.exportPdf', null, lang)}
          </button>
          <button
            type="button"
            data-testid="admin-city-adoption-button-export-csv"
            className="text-sm text-emerald-700 hover:underline"
            onClick={handleExportCsv}
          >
            {t('admin.adoption.cta.exportCsv', null, lang)}
          </button>
          <Link
            href="/admin/cities"
            className="text-sm text-slate-600 hover:underline"
          >
            {t('admin.adoption.back', null, lang)}
          </Link>
        </div>
      </header>

      <main
        data-testid="admin-city-adoption-page"
        className="mx-auto max-w-[960px] space-y-6 px-6 py-6"
      >
        {/* ---------------- Date range ---------------- */}
        <div className="no-print flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">
              {t('admin.adoption.range.label', null, lang)}
            </span>
            <select
              data-testid="admin-city-adoption-range"
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
              value={range}
              onChange={(e) => setRange(e.target.value as RangeKey)}
            >
              <option value="7d">{t('admin.adoption.range.7d', null, lang)}</option>
              <option value="30d">{t('admin.adoption.range.30d', null, lang)}</option>
              <option value="sinceLaunch">
                {t('admin.adoption.range.sinceLaunch', null, lang)}
              </option>
              <option value="custom">
                {t('admin.adoption.range.custom', null, lang)}
              </option>
            </select>
          </label>
          {range === 'custom' ? (
            <>
              <label className="text-sm">
                <span className="sr-only">from</span>
                <input
                  type="date"
                  data-testid="admin-city-adoption-range-from"
                  className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                />
              </label>
              <label className="text-sm">
                <span className="sr-only">to</span>
                <input
                  type="date"
                  data-testid="admin-city-adoption-range-to"
                  className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                />
              </label>
            </>
          ) : null}
        </div>

        {error ? (
          <div
            data-testid="admin-city-adoption-error"
            className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
          >
            {t('admin.adoption.error', null, lang)} ({error})
          </div>
        ) : null}

        {!dash ? (
          <div className="text-sm text-slate-600">…</div>
        ) : (
          <>
            {/* ---------------- Hero stats ---------------- */}
            <section
              data-testid="admin-city-adoption-hero-stats"
              className="print-block grid grid-cols-2 gap-3 md:grid-cols-4"
            >
              {dash.hero.map((stat) => (
                <div
                  key={stat.key}
                  data-testid={`admin-city-adoption-hero-${stat.key}`}
                  className="rounded border border-slate-200 bg-white p-4"
                >
                  <div className="text-xs text-slate-500">
                    {t(`admin.adoption.hero.${stat.key}`, null, lang)}
                  </div>
                  <div className="mt-1 text-2xl font-semibold text-slate-900">
                    {stat.unit === 'percent'
                      ? `${stat.value}%`
                      : stat.unit === 'duration'
                        ? formatDuration(stat.value)
                        : stat.value}
                  </div>
                  <div
                    className={
                      stat.deltaPercent === null
                        ? 'mt-1 text-xs text-slate-400'
                        : stat.deltaPercent > 0
                          ? 'mt-1 text-xs text-emerald-600'
                          : stat.deltaPercent < 0
                            ? 'mt-1 text-xs text-rose-600'
                            : 'mt-1 text-xs text-slate-500'
                    }
                  >
                    {stat.deltaPercent === null
                      ? t('admin.adoption.hero.delta.none', null, lang)
                      : `${stat.deltaPercent > 0 ? '+' : ''}${stat.deltaPercent}% ${t(
                          stat.deltaPercent > 0
                            ? 'admin.adoption.hero.delta.up'
                            : stat.deltaPercent < 0
                              ? 'admin.adoption.hero.delta.down'
                              : 'admin.adoption.hero.delta.flat',
                          null,
                          lang,
                        )}`}
                  </div>
                </div>
              ))}
            </section>

            {/* ---------------- Funnel ---------------- */}
            <section
              data-testid="admin-city-adoption-funnel"
              className="print-block rounded border border-slate-200 bg-white p-4"
            >
              <h2 className="mb-3 text-sm font-semibold text-slate-900">
                {t('admin.adoption.funnel.title', null, lang)}
              </h2>
              <svg
                role="img"
                aria-label={t('admin.adoption.funnel.title', null, lang)}
                viewBox="0 0 720 200"
                className="h-48 w-full"
              >
                {dash.funnel.map((stage, i) => {
                  const top = i * 40;
                  const max = Math.max(
                    1,
                    ...dash.funnel.map((s) => s.count),
                  );
                  const w = Math.max(4, (stage.count / max) * 680);
                  return (
                    <g key={stage.key}>
                      <rect
                        x={chart.padL}
                        y={top}
                        width={w}
                        height={26}
                        rx={4}
                        fill={
                          i === 0
                            ? '#047857'
                            : `rgba(4, 120, 87, ${1 - i * 0.16})`
                        }
                      />
                      <text
                        x={chart.padL + 8}
                        y={top + 18}
                        fontSize={12}
                        fill="#ffffff"
                      >
                        {t(`admin.adoption.funnel.${stage.key}`, null, lang)}
                      </text>
                      <text
                        x={chart.padL + w + 8}
                        y={top + 18}
                        fontSize={12}
                        fill="#334155"
                      >
                        {stage.count}
                        {stage.conversion !== null
                          ? ` (${Math.round(stage.conversion * 100)}%)`
                          : ''}
                      </text>
                    </g>
                  );
                })}
              </svg>
              <table className="mt-3 w-full text-sm">
                <caption className="sr-only">
                  {t('admin.adoption.funnel.tableCaption', null, lang)}
                </caption>
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <th scope="col" className="px-2 py-1 text-left">
                      {t('admin.adoption.funnel.title', null, lang)}
                    </th>
                    <th scope="col" className="px-2 py-1 text-right">
                      {t('admin.adoption.funnel.stageCount', null, lang)}
                    </th>
                    <th scope="col" className="px-2 py-1 text-right">
                      {t('admin.adoption.funnel.conversion', null, lang)}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {dash.funnel.map((stage) => (
                    <tr key={stage.key} className="border-t border-slate-100">
                      <th scope="row" className="px-2 py-1 text-left font-normal">
                        {t(`admin.adoption.funnel.${stage.key}`, null, lang)}
                      </th>
                      <td className="px-2 py-1 text-right">{stage.count}</td>
                      <td className="px-2 py-1 text-right">
                        {stage.conversion === null
                          ? '—'
                          : `${Math.round(stage.conversion * 100)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {/* ---------------- Daily activity chart ---------------- */}
            <section
              data-testid="admin-city-adoption-daily-chart"
              className="print-block rounded border border-slate-200 bg-white p-4"
            >
              <h2 className="mb-3 text-sm font-semibold text-slate-900">
                {t('admin.adoption.daily.title', null, lang)}
              </h2>
              <svg
                role="img"
                aria-label={t('admin.adoption.daily.title', null, lang)}
                viewBox={`0 0 ${chart.width} ${chart.height}`}
                className="h-56 w-full"
              >
                {[0, 0.5, 1].map((frac) => (
                  <line
                    key={frac}
                    x1={chart.padL}
                    x2={chart.width - chart.padR}
                    y1={chart.padT + chart.innerH * (1 - frac)}
                    y2={chart.padT + chart.innerH * (1 - frac)}
                    stroke="#e2e8f0"
                    strokeWidth={1}
                  />
                ))}
                {dailySeries.submitted.length > 0 ? (
                  <>
                    <path
                      d={linePath(dailySeries.submitted)}
                      fill="none"
                      stroke="#047857"
                      strokeWidth={2}
                    />
                    <path
                      d={linePath(dailySeries.resolved)}
                      fill="none"
                      stroke="#2563eb"
                      strokeWidth={2}
                    />
                    <path
                      d={linePath(dailySeries.registered)}
                      fill="none"
                      stroke="#9333ea"
                      strokeWidth={2}
                    />
                    {compare && dailySeries.comparison.length > 0 ? (
                      <path
                        d={linePath(dailySeries.comparison)}
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        strokeDasharray="6 4"
                      />
                    ) : null}
                  </>
                ) : null}
              </svg>
              <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-600">
                <span className="flex items-center gap-1">
                  <span
                    className="inline-block h-1 w-4"
                    style={{ background: '#047857' }}
                  />
                  {t('admin.adoption.daily.submitted', null, lang)}
                </span>
                <span className="flex items-center gap-1">
                  <span
                    className="inline-block h-1 w-4"
                    style={{ background: '#2563eb' }}
                  />
                  {t('admin.adoption.daily.resolved', null, lang)}
                </span>
                <span className="flex items-center gap-1">
                  <span
                    className="inline-block h-1 w-4"
                    style={{ background: '#9333ea' }}
                  />
                  {t('admin.adoption.daily.registered', null, lang)}
                </span>
                {compare ? (
                  <span className="flex items-center gap-1">
                    <span
                      className="inline-block h-1 w-4"
                      style={{ background: '#f59e0b' }}
                    />
                    {t('admin.adoption.compare.dhaka', null, lang)}
                  </span>
                ) : null}
              </div>
              <table className="mt-3 w-full text-sm">
                <caption className="sr-only">
                  {t('admin.adoption.daily.tableCaption', null, lang)}
                </caption>
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <th scope="col" className="px-2 py-1 text-left">
                      {t('admin.adoption.daily.title', null, lang)}
                    </th>
                    <th scope="col" className="px-2 py-1 text-right">
                      {t('admin.adoption.daily.submitted', null, lang)}
                    </th>
                    <th scope="col" className="px-2 py-1 text-right">
                      {t('admin.adoption.daily.resolved', null, lang)}
                    </th>
                    <th scope="col" className="px-2 py-1 text-right">
                      {t('admin.adoption.daily.registered', null, lang)}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {dash.daily.map((d) => (
                    <tr key={d.date} className="border-t border-slate-100">
                      <th scope="row" className="px-2 py-1 text-left font-normal">
                        {d.date}
                      </th>
                      <td className="px-2 py-1 text-right">{d.submitted}</td>
                      <td className="px-2 py-1 text-right">{d.resolved}</td>
                      <td className="px-2 py-1 text-right">{d.registered}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {/* ---------------- Ward heatmap ---------------- */}
            <section
              data-testid="admin-city-adoption-heatmap"
              className="print-block rounded border border-slate-200 bg-white p-4"
            >
              <h2 className="mb-3 text-sm font-semibold text-slate-900">
                {t('admin.adoption.heatmap.title', null, lang)}
              </h2>
              <svg
                role="img"
                aria-label={t('admin.adoption.heatmap.title', null, lang)}
                viewBox="0 0 720 220"
                className="h-56 w-full"
              >
                {dash.wards.map((w, i) => {
                  const cols = 8;
                  const rows = Math.ceil(dash.wards.length / cols);
                  const cell = 26;
                  const gap = 6;
                  const col = i % cols;
                  const row = Math.floor(i / cols);
                  const opacity =
                    w.reports === 0 ? 0.08 : 0.2 + w.intensity * 0.8;
                  return (
                    <g key={w.wardId}>
                      <rect
                        x={col * (cell + gap) + 8}
                        y={row * (cell + gap) + 8}
                        width={cell}
                        height={cell}
                        rx={4}
                        fill={`rgba(4, 120, 87, ${opacity.toFixed(2)})`}
                      />
                      <text
                        x={col * (cell + gap) + 8 + cell / 2}
                        y={row * (cell + gap) + 8 + cell / 2 + 4}
                        fontSize={10}
                        textAnchor="middle"
                        fill="#0f172a"
                      >
                        {w.wardNumber}
                      </text>
                    </g>
                  );
                })}
                {dash.wards.length === 0 ? (
                  <text x={360} y={110} fontSize={12} textAnchor="middle" fill="#64748b">
                    {t('admin.adoption.empty', null, lang)}
                  </text>
                ) : null}
              </svg>
              <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                <span>{t('admin.adoption.heatmap.legend.none', null, lang)}</span>
                <span className="inline-block h-2 w-24 rounded bg-gradient-to-r from-emerald-100 to-emerald-600" />
                <span>{t('admin.adoption.heatmap.legend.high', null, lang)}</span>
              </div>
              <table className="mt-3 w-full text-sm">
                <caption className="sr-only">
                  {t('admin.adoption.heatmap.tableCaption', null, lang)}
                </caption>
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <th scope="col" className="px-2 py-1 text-left">
                      {t('admin.users.form.wards', null, lang)}
                    </th>
                    <th scope="col" className="px-2 py-1 text-right">
                      {t('admin.adoption.heatmap.reports', null, lang)}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {dash.wards.map((w) => (
                    <tr key={w.wardId} className="border-t border-slate-100">
                      <th scope="row" className="px-2 py-1 text-left font-normal">
                        {w.wardNumber} — {w.wardNameBn ?? w.wardName}
                      </th>
                      <td className="px-2 py-1 text-right">{w.reports}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {/* ---------------- Engagement signals ---------------- */}
            <section
              data-testid="admin-city-adoption-engagement"
              className="print-block grid grid-cols-1 gap-3 md:grid-cols-3"
            >
              {dash.engagement.map((sig) => (
                <div
                  key={sig.key}
                  data-testid={`admin-city-adoption-engagement-${sig.key}`}
                  className="rounded border border-slate-200 bg-white p-4"
                >
                  <div className="text-xs text-slate-500">
                    {t(`admin.adoption.engagement.${sig.key}`, null, lang)}
                  </div>
                  <div className="mt-1 text-xl font-semibold text-slate-900">
                    {sig.unit === 'percent' ? `${sig.value}%` : formatDuration(sig.value)}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {t(`admin.adoption.engagement.${sig.key}.detail`, null, lang)}
                  </div>
                </div>
              ))}
            </section>

            {/* ---------------- Health flags ---------------- */}
            <section
              data-testid="admin-city-adoption-health-flags"
              className="print-block rounded border border-slate-200 bg-white p-4"
            >
              <h2 className="mb-3 text-sm font-semibold text-slate-900">
                {t('admin.adoption.health.title', null, lang)}
              </h2>
              {dash.healthFlags.length === 0 ? (
                <p className="text-sm text-emerald-700">
                  {t('admin.adoption.health.none', null, lang)}
                </p>
              ) : (
                <ul className="space-y-2">
                  {dash.healthFlags.map((flag) => (
                    <li key={flag.key}>
                      <Link
                        href={flag.href}
                        data-testid={`admin-city-adoption-health-${flag.key}`}
                        className={
                          flag.kind === 'staff'
                            ? 'block rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800'
                            : flag.kind === 'backlog'
                              ? 'block rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800'
                              : 'block rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700'
                        }
                      >
                        {t(`admin.adoption.health.${flag.key}`, flag.vars, lang)}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {dash.comparison ? (
              <section
                data-testid="admin-city-adoption-comparison"
                className="print-block rounded border border-slate-200 bg-white p-4 text-sm"
              >
                <h2 className="mb-2 text-sm font-semibold text-slate-900">
                  {t('admin.adoption.compare.legend', null, lang)} —{' '}
                  {t('admin.adoption.compare.dhaka', null, lang)}
                </h2>
                <dl className="flex flex-wrap gap-6">
                  <div>
                    <dt className="text-xs text-slate-500">
                      {t('admin.adoption.hero.reportsReceived', null, lang)}
                    </dt>
                    <dd className="text-lg font-semibold">
                      {dash.comparison.reportsReceived}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">
                      {t('admin.adoption.hero.resolutionRate', null, lang)}
                    </dt>
                    <dd className="text-lg font-semibold">
                      {dash.comparison.resolutionRate}%
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">
                      {t('admin.adoption.hero.registeredCitizens', null, lang)}
                    </dt>
                    <dd className="text-lg font-semibold">
                      {dash.comparison.registeredCitizens}
                    </dd>
                  </div>
                </dl>
              </section>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
