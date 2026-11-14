/**
 * CategoryBar — "reports by category", sorted descending.
 *
 * A horizontal bar chart, because the category names are long in
 * Bangla and a vertical bar chart truncates every label.
 *
 * SORTED, NOT IN INPUT ORDER
 * --------------------------
 * The bars are sorted descending by value. A bar chart whose bars
 * are in arbitrary order is much harder to read than one that ranks
 * them — the reader's eye goes to the longest bar first, and the
 * ranking IS the information.
 *
 * The table fallback preserves the same descending order, so the two
 * views agree.
 */

import dynamic from 'next/dynamic';
import { ChartFrame } from './ChartFrame';
import { DataTable, type DataTableColumn } from '../DataTable';
import { type Language } from '@/lib/i18n/keys';
import { SkeletonBlock } from '@/components/ui/Skeleton';

const CategoryBarCanvas = dynamic(() => import('./CategoryBarCanvas'), {
  ssr: false,
  loading: () => <SkeletonBlock style={{ width: '100%', height: 260 }} />,
});

export interface CategoryBarEntry {
  /** The category slug. */
  key: string;
  /** The visible category label. */
  label: string;
  /** The value (the number of reports). */
  value: number;
  /** The bar colour. A CSS token. */
  color: string;
}

export interface CategoryBarProps {
  /** The chart heading. */
  title: string;
  /** Optional supporting copy. */
  description?: string;
  /** The entries. They are sorted descending by value for display. */
  entries: readonly CategoryBarEntry[];
  /** Document language. */
  lang: Language;
  /** Chart height in px. */
  height?: number;
  /** Optional actions in the heading row. */
  actions?: React.ReactNode;
  /** Test hook. */
  'data-testid'?: string;
  /**
   * Test hook for the data table.
   *
   * The table is a SEPARATE element from the chart, so a spec that
   * wants to assert on the table needs its own hook.
   */
  'data-testid-table'?: string;
}

/**
 * Sort the entries by value, descending.
 *
 * Exported so the ordering rule can be tested without mounting the
 * chart, and so the table fallback and the canvas cannot disagree.
 */
export function sortByValueDescending(entries: readonly CategoryBarEntry[]): CategoryBarEntry[] {
  return [...entries].sort((a, b) => b.value - a.value);
}

export function CategoryBar({
  title,
  description,
  entries,
  lang,
  height = 260,
  actions,
  'data-testid': testId,
  'data-testid-table': tableTestId,
}: CategoryBarProps) {
  const sorted = sortByValueDescending(entries);

  const columns: DataTableColumn<CategoryBarEntry>[] = [
    {
      key: 'label',
      header: 'Label',
      render: (row) => row.label,
      sortValue: (row) => row.label,
    },
    {
      key: 'value',
      header: 'Value',
      numeric: true,
      render: (row) => row.value,
      sortValue: (row) => row.value,
    },
  ];

  return (
    <ChartFrame
      title={title}
      description={description}
      lang={lang}
      actions={actions}
      data-testid={testId}
      chart={<CategoryBarCanvas entries={sorted} height={height} />}
      table={
        <DataTable
          columns={columns}
          rows={sorted}
          rowKey={(row) => row.key}
          caption={title}
          lang={lang}
          initialSort={{ key: 'value', direction: 'desc' }}
          data-testid={tableTestId}
        />
      }
    />
  );
}
