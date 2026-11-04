/**
 * SlaBullet — "actual against target", as a bullet chart.
 *
 * Recharts has no bullet chart, and that is fine: a bullet is ONE
 * value against ONE target, which is a three-shape drawing, not a
 * chart with axes. Hand-rolled SVG is the right tool — it is about
 * forty lines, renders identically on the server (no dynamic import),
 * and scales crisply.
 *
 * THE THREE SHAPES
 * ----------------
 *   - the RANGE band (the acceptable zone) in a muted fill,
 *   - the TARGET tick (a vertical rule) in the ink colour, and
 *   - the VALUE bar (the actual figure) in the tone colour.
 *
 * The value bar and the target tick are distinguishable by SHAPE
 * (bar vs rule) as well as by colour, so the chart survives a
 * greyscale printout and a colour-blind reader.
 *
 * The target is also labelled with its VALUE, and the achieved value
 * is printed as text beside the figure — the picture is a summary,
 * the numbers are the content.
 */

import { ChartFrame } from './ChartFrame';
import { DataTable, type DataTableColumn } from '../DataTable';
import { t, type Language } from '@/lib/i18n/keys';

export type SlaTone = 'success' | 'warning' | 'danger' | 'neutral';

export interface SlaBulletProps {
  /** The chart heading. */
  title: string;
  /** Optional supporting copy. */
  description?: string;
  /** The metric name (e.g. "Median resolution time"). */
  label: string;
  /** The achieved value. */
  value: number;
  /** The target value. */
  target: number;
  /** The upper bound of the drawn scale. Defaults to `target * 1.5`. */
  max?: number;
  /** The lower bound of the acceptable range (e.g. 0). */
  rangeStart?: number;
  /** The upper bound of the acceptable range. Defaults to `target`. */
  rangeEnd?: number;
  /** The unit shown after the numbers (e.g. "ঘণ্টা", "%"). */
  unit?: string;
  /** The semantic tone of the value. */
  tone?: SlaTone;
  /** Document language. */
  lang: Language;
  /** Optional actions in the heading row. */
  actions?: React.ReactNode;
  /** Test hook. */
  'data-testid'?: string;
}

const TONE_COLOR: Record<SlaTone, string> = {
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  danger: 'var(--color-danger)',
  neutral: 'var(--color-primary)',
};

/**
 * Clamp a value into the drawn scale.
 *
 * A bullet whose value overshoots its scale would draw past the end
 * of the track and read as "the bar is broken" rather than "the
 * value is too high" — which is exactly the case an SLA bullet
 * exists to show.
 */
export function clampToScale(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), max);
}

export function SlaBullet({
  title,
  description,
  label,
  value,
  target,
  max,
  rangeStart = 0,
  rangeEnd,
  unit,
  tone = 'neutral',
  lang,
  actions,
  'data-testid': testId,
}: SlaBulletProps) {
  const scaleMax = max ?? target * 1.5;
  const acceptableEnd = rangeEnd ?? target;
  const safeScaleMax = scaleMax > 0 ? scaleMax : 1;

  const trackWidth = 100;
  const valuePct = (clampToScale(value, safeScaleMax) / safeScaleMax) * trackWidth;
  const targetPct = (clampToScale(target, safeScaleMax) / safeScaleMax) * trackWidth;
  const rangeStartPct = (clampToScale(rangeStart, safeScaleMax) / safeScaleMax) * trackWidth;
  const rangeEndPct = (clampToScale(acceptableEnd, safeScaleMax) / safeScaleMax) * trackWidth;

  const rows = [
    { key: 'metric', metric: label, value, target, unit: unit ?? '' },
  ];

  const columns: DataTableColumn<(typeof rows)[number]>[] = [
    { key: 'metric', header: 'Metric', render: (row) => row.metric, sortValue: (row) => row.metric },
    {
      key: 'value',
      header: 'Value',
      numeric: true,
      render: (row) => `${row.value}${row.unit ? ` ${row.unit}` : ''}`,
      sortValue: (row) => row.value,
    },
    {
      key: 'target',
      header: 'Target',
      numeric: true,
      render: (row) => `${row.target}${row.unit ? ` ${row.unit}` : ''}`,
      sortValue: (row) => row.target,
    },
  ];

  return (
    <ChartFrame
      title={title}
      description={description}
      lang={lang}
      actions={actions}
      data-testid={testId}
      chart={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
            <span lang={lang} style={{ fontSize: 'var(--text-body-sm)', color: 'var(--color-ink-secondary)' }}>
              {label}
            </span>
            <span className="tabular-nums" style={{ fontSize: 'var(--text-body)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-ink)' }}>
              {value}
              {unit ? <span style={{ fontWeight: 'var(--weight-regular)', color: 'var(--color-ink-tertiary)' }}> {unit}</span> : null}
            </span>
          </div>

          <svg
            viewBox={`0 0 ${trackWidth} 16`}
            preserveAspectRatio="none"
            role="presentation"
            style={{ width: '100%', height: 16, display: 'block' }}
          >
            {/* The acceptable range band. */}
            <rect
              x={rangeStartPct}
              y={0}
              width={Math.max(rangeEndPct - rangeStartPct, 0)}
              height={16}
              fill="var(--color-surface-raised)"
            />
            {/* The achieved value. */}
            <rect x={0} y={4} width={valuePct} height={8} fill={TONE_COLOR[tone]} rx={2} />
            {/* The target tick — a rule, so it is distinguishable from the bar by shape. */}
            <rect x={targetPct} y={0} width={1.2} height={16} fill="var(--color-ink)" />
          </svg>

          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
            <span className="tabular-nums" style={{ fontSize: 'var(--text-caption)', color: 'var(--color-ink-tertiary)' }}>
              0
            </span>
            <span lang={lang} className="tabular-nums" style={{ fontSize: 'var(--text-caption)', color: 'var(--color-ink-secondary)' }}>
              {t('ui.table.total', null, lang)}: {target}
              {unit ? ` ${unit}` : ''}
            </span>
          </div>
        </div>
      }
      table={
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.metric}
          caption={title}
          lang={lang}
        />
      }
    />
  );
}
