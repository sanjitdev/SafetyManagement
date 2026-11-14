'use client';

/**
 * DataTable — sortable, accessible data table.
 *
 * The chart kit and the admin/dispatcher tables both need the same
 * thing: a table whose headers can be re-sorted by pointer AND by
 * keyboard, that announces its sort state to assistive tech, and that
 * never relies on colour to convey that state.
 *
 * WHY A CUSTOM TABLE INSTEAD OF A LIBRARY
 * ---------------------------------------
 * A sortable table is ~120 lines of state and ARIA. Pulling a data-grid
 * library in for that would add a runtime dependency and a styling
 * fight with the token system for no gain. The native `<table>`
 * semantics do the hard work (row/column relationships, screen-reader
 * navigation); this component only adds sorting.
 *
 * SORTING CONTRACT
 * ----------------
 *   - The header cell carries `aria-sort="ascending" | "descending" |
 *     "none"`. That is the only sanctioned way to expose sort state.
 *   - The header's button carries an accessible name that combines the
 *     column title with the sort state, so a screen-reader user hears
 *     "Tickets, sorted descending" rather than a bare "Tickets".
 *   - The sort arrow is `aria-hidden` — it is a visual duplicate of
 *     what `aria-sort` already announces.
 *   - Numeric columns are right-aligned and use the global
 *     `.tabular-nums` utility so the digits line up.
 *
 * The component is a client component because sorting is state. It
 * renders no markup of its own beyond the table, so it can be dropped
 * into a server page as a leaf.
 */

import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { t, type Language } from '@/lib/i18n/keys';

export type SortDirection = 'asc' | 'desc';

export interface DataTableColumn<T> {
  /** Stable column id — also the sort key. */
  key: string;
  /** Visible header text. */
  header: string;
  /** Cell renderer. */
  render: (row: T) => ReactNode;
  /**
   * Sort accessor. Omit to make the column unsortable (a column of
   * actions or of pre-formatted prose usually should be).
   */
  sortValue?: (row: T) => number | string;
  /** Right-align + tabular numerals. */
  numeric?: boolean;
  /** Extra inline style for the cell (e.g. width). */
  width?: string;
  /**
   * Test hook for this column's SORT BUTTON.
   *
   * The table carries the `data-testid` (the whole table), but a spec
   * that clicks a header needs to name the button specifically — the
   * table testid plus a column key would not select it, because the
   * button is a descendant rather than the table itself.
   */
  sortTestId?: string;
  /**
   * Test hook for this column's ROW.
   *
   * A spec that asserts "the low-feedback badge is on the crew named
   * X" needs to point at one row. The row hook is applied to the
   * `<tr>`, so a row-level query resolves to the row, not the cell.
   */
  rowTestId?: (row: T) => string | undefined;
}

export interface DataTableProps<T> {
  /** Column definitions, in display order. */
  columns: ReadonlyArray<DataTableColumn<T>>;
  /** The rows. */
  rows: ReadonlyArray<T>;
  /** Stable row key. */
  rowKey: (row: T) => string;
  /** Accessible caption (visually hidden is fine — the caption still names the table). */
  caption?: string;
  /** Document language. */
  lang: Language;
  /** Initial sort. Defaults to the first sortable column, ascending. */
  initialSort?: { key: string; direction: SortDirection };
  /** Message shown when there are no rows. */
  emptyLabel?: string;
  /** Test hook. */
  'data-testid'?: string;
}

function compareValues(a: number | string, b: number | string): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

/**
 * Sort state for a table.
 *
 * Exported separately so a test can drive the pure sorting logic
 * without mounting the component.
 */
export function sortRows<T>(
  rows: ReadonlyArray<T>,
  columns: ReadonlyArray<DataTableColumn<T>>,
  sort: { key: string; direction: SortDirection } | null,
): T[] {
  if (!sort) return [...rows];
  const column = columns.find((c) => c.key === sort.key);
  if (!column?.sortValue) return [...rows];
  const accessor = column.sortValue;
  const factor = sort.direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => compareValues(accessor(a), accessor(b)) * factor);
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  lang,
  initialSort,
  emptyLabel,
  'data-testid': testId,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; direction: SortDirection } | null>(
    initialSort ??
      (() => {
        const firstSortable = columns.find((c) => c.sortValue);
        return firstSortable ? { key: firstSortable.key, direction: 'asc' } : null;
      })(),
  );

  const sortedRows = useMemo(() => sortRows(rows, columns, sort), [rows, columns, sort]);

  function toggleSort(column: DataTableColumn<T>) {
    if (!column.sortValue) return;
    setSort((current) => {
      if (!current || current.key !== column.key) {
        return { key: column.key, direction: 'asc' };
      }
      return {
        key: column.key,
        direction: current.direction === 'asc' ? 'desc' : 'asc',
      };
    });
  }

  const emptyText = emptyLabel ?? t('ui.empty.title', null, lang);

  return (
    <div
      style={{
        overflowX: 'auto',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-card)',
        background: 'var(--color-surface-card)',
      }}
      data-testid={testId}
    >
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 'var(--text-body-sm)',
          color: 'var(--color-ink)',
        }}
      >
        {caption ? <caption style={visuallyHidden}>{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((column) => {
              const isSorted = sort?.key === column.key;
              const ariaSort = !column.sortValue
                ? undefined
                : isSorted
                  ? sort.direction === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : 'none';
              const stateLabel = !column.sortValue
                ? ''
                : isSorted
                  ? sort.direction === 'asc'
                    ? t('ui.table.sort_asc', null, lang)
                    : t('ui.table.sort_desc', null, lang)
                  : t('ui.table.sort_none', null, lang);

              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={ariaSort}
                  style={{
                    textAlign: column.numeric ? 'right' : 'left',
                    padding: 'var(--space-2) var(--space-3)',
                    background: 'var(--color-surface-raised)',
                    borderBottom: '1px solid var(--color-border)',
                    fontSize: 'var(--text-caption)',
                    fontWeight: 'var(--weight-semibold)',
                    color: 'var(--color-ink-secondary)',
                    whiteSpace: 'nowrap',
                    width: column.width,
                  }}
                >
                  {column.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(column)}
                      data-testid={column.sortTestId}
                      aria-label={`${column.header}, ${stateLabel}`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 'var(--space-1)',
                        background: 'transparent',
                        border: 'none',
                        padding: 0,
                        margin: 0,
                        font: 'inherit',
                        color: isSorted ? 'var(--color-primary)' : 'inherit',
                        cursor: 'pointer',
                      }}
                    >
                      <span>{column.header}</span>
                      <span aria-hidden style={{ fontSize: 'var(--text-micro)' }}>
                        {isSorted ? (sort.direction === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sortedRows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                style={{
                  padding: 'var(--space-4)',
                  textAlign: 'center',
                  color: 'var(--color-ink-tertiary)',
                  fontSize: 'var(--text-body-sm)',
                }}
              >
                {emptyText}
              </td>
            </tr>
          ) : (
            sortedRows.map((row) => (
              <tr
                key={rowKey(row)}
                data-testid={columns.find((c) => c.rowTestId)?.rowTestId?.(row)}
                style={{ borderBottom: '1px solid var(--color-border)' }}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    style={{
                      padding: 'var(--space-2) var(--space-3)',
                      textAlign: column.numeric ? 'right' : 'left',
                      verticalAlign: 'top',
                    }}
                    className={column.numeric ? 'tabular-nums' : undefined}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

const visuallyHidden: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
};
