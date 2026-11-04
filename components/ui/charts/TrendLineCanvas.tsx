'use client';

/**
 * TrendLineCanvas — the Recharts canvas for `TrendLine`.
 *
 * Loaded through `next/dynamic` with `ssr: false` because Recharts
 * measures the DOM at mount and cannot render on the server.
 *
 * The SVG is `aria-hidden` (the parent `ChartFrame` sets it): the
 * accessible content is the data table, which carries the real
 * numbers. Announcing the SVG's internals would read out "path,
 * line, 4 points" instead of the figures.
 */

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TrendLinePoint, TrendLineSeries } from './TrendLine';

export interface TrendLineCanvasProps {
  /** The data points. */
  data: TrendLinePoint[];
  /** The series to draw. */
  series: TrendLineSeries[];
  /** Chart height in px. */
  height: number;
}

export function TrendLineCanvas({ data, series, height }: TrendLineCanvasProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="var(--color-border)" strokeDasharray="2 4" vertical={false} />
        <XAxis
          dataKey="label"
          stroke="var(--color-ink-tertiary)"
          tick={{ fill: 'var(--color-ink-tertiary)', fontSize: 12 }}
          tickLine={false}
          axisLine={{ stroke: 'var(--color-border)' }}
        />
        <YAxis
          stroke="var(--color-ink-tertiary)"
          tick={{ fill: 'var(--color-ink-tertiary)', fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          width={44}
          allowDecimals={false}
        />
        <Tooltip
          cursor={{ stroke: 'var(--color-border-strong)' }}
          contentStyle={{
            background: 'var(--color-surface-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-input)',
            fontSize: 'var(--text-caption)',
            color: 'var(--color-ink)',
          }}
          labelStyle={{ color: 'var(--color-ink)', fontWeight: 'var(--weight-semibold)' }}
          itemStyle={{ color: 'var(--color-ink-secondary)' }}
        />
        {series.map((entry) => (
          <Line
            key={entry.key}
            type="monotone"
            dataKey={entry.key}
            name={entry.label}
            stroke={entry.color}
            strokeWidth={2}
            strokeDasharray={entry.dashArray}
            dot={{ r: 3, fill: entry.color, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export default TrendLineCanvas;
