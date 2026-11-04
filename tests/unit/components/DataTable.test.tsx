// @vitest-environment jsdom
/**
 * Unit tests for the DataTable primitive (components/ui/DataTable.tsx).
 *
 * The sorting contract is the substance here: `aria-sort` on the
 * header, a combined accessible name on the sort button, and a
 * pure `sortRows` function that can be tested without a DOM.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { DataTable, sortRows, type DataTableColumn } from '@/components/ui/DataTable';

afterEach(() => {
  cleanup();
});

interface Row {
  id: string;
  name: string;
  count: number;
}

const ROWS: Row[] = [
  { id: 'a', name: 'আলো', count: 30 },
  { id: 'b', name: 'গর্ত', count: 10 },
  { id: 'c', name: 'আবর্জনা', count: 20 },
];

const COLUMNS: DataTableColumn<Row>[] = [
  { key: 'name', header: 'বিভাগ', render: (row) => row.name, sortValue: (row) => row.name },
  { key: 'count', header: 'সংখ্যা', numeric: true, render: (row) => row.count, sortValue: (row) => row.count },
];

describe('sortRows', () => {
  it('sorts ascending by the requested column', () => {
    const sorted = sortRows(ROWS, COLUMNS, { key: 'count', direction: 'asc' });
    expect(sorted.map((row) => row.count)).toEqual([10, 20, 30]);
  });

  it('sorts descending by the requested column', () => {
    const sorted = sortRows(ROWS, COLUMNS, { key: 'count', direction: 'desc' });
    expect(sorted.map((row) => row.count)).toEqual([30, 20, 10]);
  });

  it('returns the rows untouched when the sort column is not sortable', () => {
    const sorted = sortRows(ROWS, COLUMNS, { key: 'missing', direction: 'asc' });
    expect(sorted).toHaveLength(ROWS.length);
  });
});

describe('DataTable', () => {
  it('renders a row per record and marks the first sortable column as ascending', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(row) => row.id} caption="টিকিট" lang="bn" />);

    expect(screen.getAllByRole('row')).toHaveLength(ROWS.length + 1);

    const header = screen.getByRole('columnheader', { name: /বিভাগ/ });
    expect(header.getAttribute('aria-sort')).toBe('ascending');
  });

  it('flips the sort direction when the header is clicked again', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(row) => row.id} caption="টিকিট" lang="bn" />);

    const button = screen.getByRole('button', { name: /বিভাগ/ });
    fireEvent.click(button);

    const header = screen.getByRole('columnheader', { name: /বিভাগ/ });
    expect(header.getAttribute('aria-sort')).toBe('descending');
  });

  it('shows the empty message when there are no rows', () => {
    render(
      <DataTable
        columns={COLUMNS}
        rows={[]}
        rowKey={(row: Row) => row.id}
        caption="টিকিট"
        lang="en"
        emptyLabel="কোনো টিকিট নেই"
      />,
    );

    expect(screen.getByText('কোনো টিকিট নেই')).toBeDefined();
  });

  it('does not render a sort button for a column with no accessor', () => {
    render(
      <DataTable
        columns={[{ key: 'actions', header: 'কার্যক্রম', render: (row: Row) => row.id }]}
        rows={ROWS}
        rowKey={(row) => row.id}
        caption="টিকিট"
        lang="bn"
      />,
    );

    expect(screen.queryByRole('button', { name: /কার্যক্রম/ })).toBeNull();
  });
});
