'use client';

/**
 * CategoryBarCanvas — the Recharts canvas for `CategoryBar`.
 *
 * A horizontal layout (`layout="vertical"` on the Y axis) so the
 * category names read left-to-right without truncation.
 */

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { CategoryBarEntry } from './CategoryBar';

export interface CategoryBarCanvasProps {
  /** The entries, already sorted descending. */
  entries: CategoryBarEntry[];
  /** Chart height in px. */
  height: number;
}

export function CategoryBarCanvas({ entries, height }: CategoryBarCanvasProps) {
  // Recharts reads `fill` from the datum, so the per-category token
  // travels with the row.
  const data = entries.map((entry) => ({
    label: entry.label,
    value: entry.value,
    fill: entry.color,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="var(--color-border)" strokeDasharray="2 4" horizontal={false} />
        <XAxis
          type="number"
          stroke="var(--color-ink-tertiary)"
          tick={{ fill: 'var(--color-ink-tertiary)', fontSize: 12 }}
          tickLine={false}
          axisLine={{ stroke: 'var(--color-border)' }}
          allowDecimals={false}
        />
        <YAxis
          type="category"
          dataKey="label"
          stroke="var(--color-ink-tertiary)"
          tick={{ fill: 'var(--color-ink-secondary)', fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          width={120}
        />
        <Tooltip
          cursor={{ fill: 'var(--color-surface-raised)' }}
          contentStyle={{
            background: 'var(--color-surface-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-input)',
            fontSize: 'var(--text-caption)',
            color: 'var(--color-ink)',
          }}
        />
        <Bar dataKey="value" isAnimationActive={false} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default CategoryBarCanvas;
