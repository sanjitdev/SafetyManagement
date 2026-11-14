// @vitest-environment jsdom
/**
 * Unit tests for the Combobox primitive
 * (components/ui/Combobox.tsx).
 *
 * ── Why this file exists ───────────────────────────────────────
 *
 * The combobox is the only control in the dispatcher console
 * that implements the WAI-ARIA 1.2 *activedescendant* pattern:
 * the DOM focus stays on the text input while the highlight
 * moves through the list. That pattern has two ways to fail
 * silently:
 *
 *   1. the ARIA wiring drifts (aria-expanded stuck, the
 *      activedescendant pointing at a non-existent option),
 *      which no screen-reader user can work around, and
 *   2. the keyboard model breaks, which no mouse user can
 *      work around.
 *
 * Both are invisible in a screenshot. So they are asserted
 * here rather than in the Playwright visual spec.
 *
 * ── The filter is tested on its own ────────────────────────────
 *
 * `filterComboboxOptions` is exported precisely so the match
 * rule can be asserted without a DOM: a filter that matches
 * the wrong substring produces a picker that looks broken
 * without ever throwing.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { Combobox, filterComboboxOptions } from '@/components/ui/Combobox';

const OPTIONS = [
  { value: 'crew_a', label: 'রশিদ হাসান', description: 'বিদ্যুৎ বিভাগ' },
  { value: 'crew_b', label: 'সেলিম মিয়া', description: 'পানি বিভাগ' },
  { value: 'crew_c', label: 'Karim Uddin', description: 'Road crew' },
];

afterEach(() => {
  cleanup();
});

describe('filterComboboxOptions', () => {
  it('returns every option for an empty query', () => {
    expect(filterComboboxOptions(OPTIONS, '')).toHaveLength(3);
  });

  it('returns every option for a whitespace-only query', () => {
    // A stray space must not filter the list down to nothing —
    // that reads as "no crews found" for a crew list that has
    // three of them.
    expect(filterComboboxOptions(OPTIONS, '   ')).toHaveLength(3);
  });

  it('matches a Bangla substring', () => {
    const out = filterComboboxOptions(OPTIONS, 'রশিদ');
    expect(out).toHaveLength(1);
    expect(out[0].value).toBe('crew_a');
  });

  it('matches a Latin-script substring case-insensitively', () => {
    expect(filterComboboxOptions(OPTIONS, 'karim')).toHaveLength(1);
    expect(filterComboboxOptions(OPTIONS, 'KARIM')).toHaveLength(1);
  });

  it('matches on the label, never on the description', () => {
    // The description is context, not the search target — a
    // dispatcher searching "বিদ্যুৎ" wants the electrician, but
    // the label is what the user sees on the option.
    const out = filterComboboxOptions(OPTIONS, 'বিদ্যুৎ');
    expect(out).toHaveLength(0);
  });

  it('returns nothing when the query matches nothing', () => {
    expect(filterComboboxOptions(OPTIONS, 'zzz')).toHaveLength(0);
  });

  it('does not mutate the option list it was given', () => {
    const source = [...OPTIONS];
    filterComboboxOptions(source, '');
    expect(source).toEqual(OPTIONS);
  });
});

describe('Combobox — the ARIA contract', () => {
  it('exposes a combobox that names itself', () => {
    render(
      <Combobox
        options={OPTIONS}
        value={null}
        onChange={() => {}}
        label="ক্রু বেছে নিন"
      />,
    );
    const input = screen.getByRole('combobox');
    expect(input.getAttribute('aria-label')).toBeNull();
    expect(input.getAttribute('aria-labelledby')).not.toBeNull();
    expect(input.getAttribute('aria-autocomplete')).toBe('list');
    expect(input.getAttribute('aria-haspopup')).toBe('listbox');
  });

  it('starts collapsed and expands on focus', () => {
    render(
      <Combobox
        options={OPTIONS}
        value={null}
        onChange={() => {}}
        label="ক্রু বেছে নিন"
      />,
    );
    const input = screen.getByRole('combobox');
    expect(input.getAttribute('aria-expanded')).toBe('false');

    fireEvent.focus(input);
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('listbox')).toBeDefined();
  });

  it('points aria-controls at the listbox it actually renders', () => {
    render(
      <Combobox
        options={OPTIONS}
        value={null}
        onChange={() => {}}
        label="ক্রু বেছে নিন"
      />,
    );
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    expect(input.getAttribute('aria-controls')).toBe(
      screen.getByRole('listbox').id,
    );
  });

  it('renders one option per entry, each with an id', () => {
    render(
      <Combobox
        options={OPTIONS}
        value={null}
        onChange={() => {}}
        label="ক্রু বেছে নিন"
      />,
    );
    fireEvent.focus(screen.getByRole('combobox'));
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(3);
    for (const option of options) {
      expect(option.id).not.toBe('');
    }
  });

  it('moves aria-activedescendant with the arrow keys', () => {
    render(
      <Combobox
        options={OPTIONS}
        value={null}
        onChange={() => {}}
        label="ক্রু বেছে নিন"
      />,
    );
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);

    const first = screen.getAllByRole('option')[0].id;
    expect(input.getAttribute('aria-activedescendant')).toBe(first);

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const second = screen.getAllByRole('option')[1].id;
    expect(input.getAttribute('aria-activedescendant')).toBe(second);

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input.getAttribute('aria-activedescendant')).toBe(first);
  });

  it('wraps around the ends of the list', () => {
    render(
      <Combobox
        options={OPTIONS}
        value={null}
        onChange={() => {}}
        label="ক্রু বেছে নিন"
      />,
    );
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);

    // From the first option, ArrowUp wraps to the last.
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    const ids = screen.getAllByRole('option').map((o) => o.id);
    expect(input.getAttribute('aria-activedescendant')).toBe(ids[2]);
  });

  it('jumps to the first and last option with Home and End', () => {
    render(
      <Combobox
        options={OPTIONS}
        value={null}
        onChange={() => {}}
        label="ক্রু বেছে নিন"
      />,
    );
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);

    const ids = screen.getAllByRole('option').map((o) => o.id);
    fireEvent.keyDown(input, { key: 'End' });
    expect(input.getAttribute('aria-activedescendant')).toBe(ids[2]);
    fireEvent.keyDown(input, { key: 'Home' });
    expect(input.getAttribute('aria-activedescendant')).toBe(ids[0]);
  });

  it('has no activedescendant when the filter matches nothing', () => {
    render(
      <Combobox
        options={OPTIONS}
        value={null}
        onChange={() => {}}
        label="ক্রু বেছে নিন"
      />,
    );
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'zzz' } });
    expect(input.getAttribute('aria-activedescendant')).toBeNull();
  });

  it('marks the committed option as selected', () => {
    render(
      <Combobox
        options={OPTIONS}
        value="crew_b"
        onChange={() => {}}
        label="ক্রু বেছে নিন"
      />,
    );
    fireEvent.focus(screen.getByRole('combobox'));
    const selected = screen
      .getAllByRole('option')
      .filter((o) => o.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
    expect(selected[0].textContent).toContain('সেলিম মিয়া');
  });
});

describe('Combobox — the keyboard model', () => {
  it('commits the active option with Enter', () => {
    const onChange = vi.fn();
    render(
      <Combobox
        options={OPTIONS}
        value={null}
        onChange={onChange}
        label="ক্রু বেছে নিন"
      />,
    );
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('crew_b');
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });

  it('does not commit a disabled option', () => {
    const onChange = vi.fn();
    render(
      <Combobox
        options={[{ value: 'crew_a', label: 'রশিদ হাসান', disabled: true }]}
        value={null}
        onChange={onChange}
        label="ক্রু বেছে নিন"
      />,
    );
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('closes the list with Escape but keeps the query for a second Escape', () => {
    render(
      <Combobox
        options={OPTIONS}
        value={null}
        onChange={() => {}}
        label="ক্রু বেছে নিন"
      />,
    );
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'রশিদ' } });

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.getAttribute('aria-expanded')).toBe('false');
    // The query survives the first Escape — the user is closing
    // the list, not yet clearing the search.
    expect((input as HTMLInputElement).value).toBe('রশিদ');

    fireEvent.keyDown(input, { key: 'Escape' });
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('closes the list on Tab without committing anything', () => {
    const onChange = vi.fn();
    render(
      <Combobox
        options={OPTIONS}
        value={null}
        onChange={onChange}
        label="ক্রু বেছে নিন"
      />,
    );
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not commit on Enter when the list is closed', () => {
    const onChange = vi.fn();
    render(
      <Combobox
        options={OPTIONS}
        value={null}
        onChange={onChange}
        label="ক্রু বেছে নিন"
      />,
    );
    const input = screen.getByRole('combobox');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('opens the list on ArrowDown from the closed state', () => {
    render(
      <Combobox
        options={OPTIONS}
        value={null}
        onChange={() => {}}
        label="ক্রু বেছে নিন"
      />,
    );
    const input = screen.getByRole('combobox');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('Combobox — the value is not lost by typing', () => {
  it('shows the committed label when the list is closed', () => {
    render(
      <Combobox
        options={OPTIONS}
        value="crew_a"
        onChange={() => {}}
        label="ক্রু বেছে নিন"
      />,
    );
    const input = screen.getByRole('combobox') as HTMLInputElement;
    expect(input.value).toBe('রশিদ হাসান');
  });

  it('keeps the committed value when the user types without committing', () => {
    const onChange = vi.fn();
    render(
      <Combobox
        options={OPTIONS}
        value="crew_a"
        onChange={onChange}
        label="ক্রু বেছে নিন"
      />,
    );
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'সেলিম' } });
    // The typed text is the QUERY, not a new selection.
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not clear the committed value when the user re-opens the list', () => {
    render(
      <Combobox
        options={OPTIONS}
        value="crew_a"
        onChange={() => {}}
        label="ক্রু বেছে নিন"
      />,
    );
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    // The committed label STAYS on screen while the list is
    // browsed — hiding it would make the current selection
    // invisible at the exact moment the user is comparing
    // options against it.
    expect((input as HTMLInputElement).value).toBe('রশিদ হাসান');
    // The selection itself is untouched.
    expect(screen.getAllByRole('option')[0].getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('commits a chosen option and shows its label', () => {
    const onChange = vi.fn();
    render(
      <Combobox
        options={OPTIONS}
        value={null}
        onChange={onChange}
        label="ক্রু বেছে নিন"
      />,
    );
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.click(screen.getByRole('option', { name: /সেলিম মিয়া/ }));
    expect(onChange).toHaveBeenCalledWith('crew_b');
    expect((input as HTMLInputElement).value).toBe('সেলিম মিয়া');
  });
});
