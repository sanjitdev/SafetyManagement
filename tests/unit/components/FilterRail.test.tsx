// @vitest-environment jsdom
/**
 * Unit tests for the dispatcher's FilterRail
 * (components/dispatcher/FilterRail.tsx).
 *
 * ── The contract this file defends ─────────────────────────────
 *
 * The rail is the surface that was lying before Wave 4: it
 * offered filters the API could not serve. Three properties keep
 * it honest:
 *
 *   1. **The status axis covers all four states** the ticket
 *      model has, plus "All". A rail that offers a state the
 *      endpoint rejects with a 400 is a rail that lies.
 *   2. **The ward axis reads its options from the caller**, never
 *      from a constant. A hard-coded list would show a rail the
 *      API cannot serve.
 *   3. **A ward-bound dispatcher is told they are ward-bound**
 *      rather than being shown a one-option control that looks
 *      broken.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { FilterRail, type WardOption } from '@/components/dispatcher/FilterRail';

const WARDS: WardOption[] = [
  { id: 'ward_14', number: 14, name: 'Ward 14 — Mirpur', nameBn: 'ওয়ার্ড ১৪ — মিরপুর' },
  { id: 'ward_15', number: 15, name: 'Ward 15 — Cantonment', nameBn: 'ওয়ার্ড ১৫ — ক্যান্টনমেন্ট' },
];

afterEach(() => {
  cleanup();
});

function renderRail(overrides: Partial<React.ComponentProps<typeof FilterRail>> = {}) {
  const props: React.ComponentProps<typeof FilterRail> = {
    status: 'all',
    onStatusChange: vi.fn(),
    ward: null,
    onWardChange: vi.fn(),
    wards: WARDS,
    wardScoped: false,
    lang: 'en',
    search: '',
    onSearchChange: vi.fn(),
    ...overrides,
  };
  render(<FilterRail {...props} />);
  return props;
}

describe('FilterRail — the status axis', () => {
  it('offers every state the ticket model has, plus All', () => {
    renderRail();
    const group = screen.getByTestId('dispatcher-status-filter');
    const labels = Array.from(group.querySelectorAll('button')).map((b) =>
      b.textContent,
    );
    expect(labels).toEqual([
      'All',
      'Submitted only',
      'Routed only',
      'In progress only',
      'Resolved only',
    ]);
  });

  it('marks the active status as pressed', () => {
    renderRail({ status: 'in_progress' });
    const group = screen.getByTestId('dispatcher-status-filter');
    const pressed = Array.from(group.querySelectorAll('button')).filter(
      (b) => b.getAttribute('aria-pressed') === 'true',
    );
    expect(pressed).toHaveLength(1);
    expect(pressed[0].textContent).toBe('In progress only');
  });

  it('fires onStatusChange with the new status', () => {
    const props = renderRail();
    const group = screen.getByTestId('dispatcher-status-filter');
    const button = Array.from(group.querySelectorAll('button')).find(
      (b) => b.textContent === 'Resolved only',
    );
    fireEvent.click(button!);
    expect(props.onStatusChange).toHaveBeenCalledWith('resolved');
  });
});

describe('FilterRail — the ward axis', () => {
  it('lists the wards it was given, and nothing else', () => {
    renderRail();
    const select = screen.getByTestId('dispatcher-ward-filter');
    const values = Array.from(select.querySelectorAll('option')).map(
      (o) => (o as HTMLOptionElement).value,
    );
    expect(values).toEqual(['', 'ward_14', 'ward_15']);
  });

  it('offers no ward it was not given', () => {
    renderRail({ wards: [WARDS[0]] });
    const select = screen.getByTestId('dispatcher-ward-filter');
    const values = Array.from(select.querySelectorAll('option')).map(
      (o) => (o as HTMLOptionElement).value,
    );
    expect(values).toEqual(['', 'ward_14']);
  });

  it('fires onWardChange with null for "all wards"', () => {
    const props = renderRail();
    const select = screen.getByTestId('dispatcher-ward-filter');
    fireEvent.change(select, { target: { value: '' } });
    expect(props.onWardChange).toHaveBeenCalledWith(null);
  });

  it('fires onWardChange with the ward id', () => {
    const props = renderRail();
    const select = screen.getByTestId('dispatcher-ward-filter');
    fireEvent.change(select, { target: { value: 'ward_15' } });
    expect(props.onWardChange).toHaveBeenCalledWith('ward_15');
  });

  it('labels a ward with no display name by its number', () => {
    renderRail({
      wards: [{ id: 'ward_99', number: 99, name: null, nameBn: null }],
    });
    const select = screen.getByTestId('dispatcher-ward-filter');
    const option = Array.from(select.querySelectorAll('option')).find(
      (o) => (o as HTMLOptionElement).value === 'ward_99',
    ) as HTMLOptionElement;
    // A blank row is indistinguishable from a rendering bug, so
    // the number is used instead.
    expect(option.textContent).toContain('99');
  });
});

describe('FilterRail — a ward-bound dispatcher is told so', () => {
  it('states the boundary instead of rendering a one-option control', () => {
    renderRail({ wardScoped: true });
    expect(screen.getByTestId('dispatcher-ward-scoped-note')).toBeDefined();
    expect(screen.queryByTestId('dispatcher-ward-filter')).toBeNull();
  });

  it('says the boundary in words, not only in the control shape', () => {
    renderRail({ wardScoped: true, lang: 'en' });
    expect(
      screen.getByTestId('dispatcher-ward-scoped-note').textContent,
    ).toBe('Limited to your ward');
  });

  it('shows the ward control when the scope is city-wide', () => {
    renderRail({ wardScoped: false });
    expect(screen.getByTestId('dispatcher-ward-filter')).toBeDefined();
    expect(screen.queryByTestId('dispatcher-ward-scoped-note')).toBeNull();
  });
});

describe('FilterRail — the search field', () => {
  it('names the search field with a label, not just a placeholder', () => {
    renderRail();
    // A placeholder is not an accessible name — a screen reader
    // announces an unnamed search box as just "edit".
    const input = screen.getByTestId('dispatcher-queue-search');
    const label = document.querySelector(
      `label[for="${input.getAttribute('id')}"]`,
    );
    expect(label).not.toBeNull();
    expect(label!.textContent).toBe('Search reports…');
  });

  it('fires onSearchChange with the typed text', () => {
    const props = renderRail();
    const input = screen.getByTestId('dispatcher-queue-search');
    fireEvent.change(input, { target: { value: 'pothole' } });
    expect(props.onSearchChange).toHaveBeenCalledWith('pothole');
  });

  it('shows the current search text', () => {
    renderRail({ search: 'pothole' });
    const input = screen.getByTestId(
      'dispatcher-queue-search',
    ) as HTMLInputElement;
    expect(input.value).toBe('pothole');
  });
});
