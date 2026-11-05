/**
 * TrendLine — the ticket-volume trend chart.
 *
 * A Recharts `LineChart` with one line per series. Each series
 * carries a distinct STROKE PATTERN as well as a distinct colour, so
 * the chart is readable in greyscale and for a colour-blind reader.
 * The stroke colours are CSS custom properties — Recharts writes them
 * straight onto the SVG `stroke` attribute, and a `var(--token)`
 * resolves in the browser, so the chart follows the theme.
 *
 * THE CHART IS DYNAMICALLY IMPORTED
 * ---------------------------------
 * Recharts is ~120 KB gzipped and touches `window` at module scope.
 * Importing it from a server component would pull the whole bundle
 * into the server payload and break the build. The chart body
 * therefore lives in `TrendLineCanvas.tsx` (a `'use client'` file)
 * and is loaded with `next/dynamic`, `ssr: false`. The data-table
 * fallback in this file is plain HTML — it renders on the server and
 * is the accessible content.
 */

import dynamic from 'next/dynamic';
import { ChartFrame } from './ChartFrame';
import { DataTable, type DataTableColumn } from '../DataTable';
import { type Language } from '@/lib/i18n/keys';
import { SkeletonBlock } from '@/components/ui/Skeleton';

const TrendLineCanvas = dynamic(() => import('./TrendLineCanvas'), {
  ssr: false,
  loading: () => <SkeletonBlock style={{ width: '100%', height: 260 }} />,
});

export interface TrendLinePoint {
  /** The x-axis label (a date, a week). */
  label: string;
  /** One number per series, keyed by the series key. */
  [seriesKey: string]: string | number;
}

export interface TrendLineSeries {
  /** The series key — also the `dataKey` in the row data. */
  key: string;
  /** The visible series name (legend + table header). */
  label: string;
  /** The series colour. A CSS token, e.g. `var(--color-primary)`. */
  color: string;
  /**
   * The stroke pattern. Distinct patterns are what make the chart
   * readable without colour — `undefined` = solid.
   */
  dashArray?: string;
}

export interface TrendLineProps {
  /** The chart heading. */
  title: string;
  /** Optional supporting copy. */
  description?: string;
  /** The data points. */
  data: readonly TrendLinePoint[];
  /** The series to draw. */
  series: readonly TrendLineSeries[];
  /** Document language. */
  lang: Language;
  /** Chart height in px. */
  height?: number;
  /** Optional actions in the heading row. */
  actions?: React.ReactNode;
  /** Test hook. */
  'data-testid'?: string;
}

export function TrendLine({
  title,
  description,
  data,
  series,
  lang,
  height = 260,
  actions,
  'data-testid': testId,
}: TrendLineProps) {
  const columns: DataTableColumn<TrendLinePoint>[] = [
    {
      key: 'label',
      header: 'Label',
      render: (row) => row.label,
      sortValue: (row) => row.label,
    },
    ...series.map((entry) => ({
      key: entry.key,
      header: entry.label,
      numeric: true,
      render: (row: TrendLinePoint) => {
        const value = row[entry.key];
        return typeof value === 'number' ? value : String(value ?? '');
      },
      sortValue: (row: TrendLinePoint) => {
        const value = row[entry.key];
        return typeof value === 'number' ? value : String(value ?? '');
      },
    })),
  ];

  return (
    <ChartFrame
      title={title}
      description={description}
      lang={lang}
      actions={actions}
      data-testid={testId}
      chart={
        <TrendLineCanvas
          data={data as TrendLinePoint[]}
          series={series as TrendLineSeries[]}
          height={height}
        />
      }
      table={
        <DataTable
          columns={columns}
          rows={data}
          rowKey={(row: TrendLinePoint) => row.label}
          caption={title}
          lang={lang}
        />
      }
    />
  );
}
