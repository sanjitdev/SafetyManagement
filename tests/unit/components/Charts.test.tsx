// @vitest-environment jsdom
/**
 * Unit tests for the chart kit (components/ui/charts/).
 *
 * The charts themselves are rendered by Recharts in a dynamically
 * imported client component, so what is tested here is the part
 * that is guaranteed: the accessible data table, the chart/table
 * toggle, the ARIA labelling, and the pure ordering and clamping
 * helpers.
 *
 * The rule the whole kit exists to satisfy: A CHART IS NEVER THE
 * ONLY WAY TO READ THE DATA.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import {
  CategoryBar,
  sortByValueDescending,
  SlaBullet,
  clampToScale,
  StatCard,
  TrendLine,
} from '@/components/ui/charts';

afterEach(() => {
  cleanup();
});

const TREND_DATA = [
  { label: '১২ মে', submitted: 10, resolved: 4 },
  { label: '১৩ মে', submitted: 18, resolved: 9 },
];

const TREND_SERIES = [
  { key: 'submitted', label: 'জমা', color: 'var(--color-primary)' },
  { key: 'resolved', label: 'সমাধান', color: 'var(--color-success)', dashArray: '4 3' },
];

describe('sortByValueDescending', () => {
  it('ranks the entries by value, largest first', () => {
    const sorted = sortByValueDescending([
      { key: 'a', label: 'আলো', value: 4, color: 'var(--color-cat-streetlight)' },
      { key: 'b', label: 'গর্ত', value: 12, color: 'var(--color-cat-pothole)' },
      { key: 'c', label: 'আবর্জনা', value: 8, color: 'var(--color-cat-garbage)' },
    ]);

    expect(sorted.map((entry) => entry.value)).toEqual([12, 8, 4]);
  });

  it('does not mutate the input array', () => {
    const input = [
      { key: 'a', label: 'আলো', value: 1, color: 'var(--color-cat-streetlight)' },
      { key: 'b', label: 'গর্ত', value: 2, color: 'var(--color-cat-pothole)' },
    ];
    sortByValueDescending(input);
    expect(input[0].value).toBe(1);
  });
});

describe('clampToScale', () => {
  it('keeps a value inside the scale', () => {
    expect(clampToScale(5, 10)).toBe(5);
  });

  it('clamps a value that overshoots the scale', () => {
    expect(clampToScale(20, 10)).toBe(10);
  });

  it('clamps a negative value to zero and a non-finite value to zero', () => {
    expect(clampToScale(-3, 10)).toBe(0);
    expect(clampToScale(Number.NaN, 10)).toBe(0);
  });
});

describe('TrendLine', () => {
  it('renders the heading', () => {
    render(<TrendLine title="দৈনিক টিকিট" data={TREND_DATA} series={TREND_SERIES} lang="bn" />);
    // The title appears twice: as the heading and as the table caption.
    expect(screen.getAllByText('দৈনিক টিকিট').length).toBeGreaterThan(0);
  });

  it('keeps the data table behind a toggle that reports its state', () => {
    render(<TrendLine title="দৈনিক টিকিট" data={TREND_DATA} series={TREND_SERIES} lang="bn" />);

    const toggle = screen.getByRole('button', { name: 'টেবিল দেখান' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(toggle);

    expect(screen.getByRole('button', { name: 'টেবিল লুকান' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('exposes every data point and every series in the table', () => {
    render(<TrendLine title="দৈনিক টিকিট" data={TREND_DATA} series={TREND_SERIES} lang="bn" />);

    fireEvent.click(screen.getByRole('button', { name: 'টেবিল দেখান' }));

    expect(screen.getByText('১২ মে')).toBeDefined();
    expect(screen.getByText('১৩ মে')).toBeDefined();
    expect(screen.getByText('জমা')).toBeDefined();
    expect(screen.getByText('সমাধান')).toBeDefined();
  });
});

describe('CategoryBar', () => {
  const ENTRIES = [
    { key: 'a', label: 'রাস্তার আলো', value: 4, color: 'var(--color-cat-streetlight)' },
    { key: 'b', label: 'রাস্তায় গর্ত', value: 12, color: 'var(--color-cat-pothole)' },
  ];

  it('renders the heading', () => {
    render(<CategoryBar title="বিভাগ অনুযায়ী" entries={ENTRIES} lang="bn" />);
    expect(screen.getAllByText('বিভাগ অনুযায়ী').length).toBeGreaterThan(0);
  });

  it('lists the categories ranked by value in the table', () => {
    render(<CategoryBar title="বিভাগ অনুযায়ী" entries={ENTRIES} lang="bn" />);

    fireEvent.click(screen.getByRole('button', { name: 'টেবিল দেখান' }));

    const cells = screen.getAllByRole('cell');
    // The first cell of the first body row is the largest category.
    expect(cells[0].textContent).toBe('রাস্তায় গর্ত');
  });

  it('sorts the value column descending by default', () => {
    render(<CategoryBar title="বিভাগ অনুযায়ী" entries={ENTRIES} lang="bn" />);

    fireEvent.click(screen.getByRole('button', { name: 'টেবিল দেখান' }));

    const header = screen.getByRole('columnheader', { name: /Value/ });
    expect(header.getAttribute('aria-sort')).toBe('descending');
  });
});

describe('SlaBullet', () => {
  it('renders the metric, the achieved value and the target', () => {
    render(
      <SlaBullet title="SLA" label="গড় সমাধান সময়" value={18} target={24} unit="ঘণ্টা" lang="bn" />,
    );

    expect(screen.getAllByText('গড় সমাধান সময়').length).toBeGreaterThan(0);
    expect(screen.getByText('18')).toBeDefined();
  });

  it('puts the metric and the target in the data table', () => {
    render(
      <SlaBullet title="SLA" label="গড় সমাধান সময়" value={18} target={24} unit="ঘণ্টা" lang="bn" />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'টেবিল দেখান' }));

    expect(screen.getAllByText('গড় সমাধান সময়').length).toBeGreaterThan(0);
    expect(screen.getByText('18 ঘণ্টা')).toBeDefined();
    expect(screen.getByText('24 ঘণ্টা')).toBeDefined();
  });
});

describe('StatCard', () => {
  it('renders the label and the value', () => {
    render(<StatCard label="মোট টিকিট" value="৫৮" lang="bn" />);

    expect(screen.getByText('মোট টিকিট')).toBeDefined();
    expect(screen.getByText('৫৮')).toBeDefined();
  });

  it('shows the trend as an arrow plus the change value', () => {
    const { container } = render(
      <StatCard label="মোট টিকিট" value="৫৮" trend="up" trendValue="১২%" lang="bn" />,
    );

    // The arrow is a Phosphor SVG, not a text glyph — a Unicode triangle
    // renders differently on every platform and cannot be recoloured by
    // the theme token, which is exactly what the trend tone needs.
    const arrow = container.querySelector('svg');
    expect(arrow).not.toBeNull();
    // The change value is always present beside the arrow, so the
    // direction never depends on the shape alone.
    expect(screen.getByText('১২%')).toBeDefined();
  });

  it('omits the trend row when there is no trend', () => {
    const { container } = render(
      <StatCard label="মোট টিকিট" value="৫৮" lang="bn" />,
    );
    expect(container.querySelector('svg')).toBeNull();
  });
});
