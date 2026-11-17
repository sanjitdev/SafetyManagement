// @vitest-environment jsdom
/**
 * Unit tests for the PriorityPicker primitive
 * (components/ui/PriorityPicker.tsx).
 *
 * ── The contract this file defends ─────────────────────────────
 *
 * The picker is the dispatcher's triage control. Four properties
 * keep it honest:
 *
 *   1. **All four bands are always visible.** A `<select>`
 *      collapses the scale into one line, so the dispatcher cannot
 *      see the ESCALATION without opening the dropdown — and the
 *      escalation is exactly what the control exists to express.
 *   2. **The untriaged state is NOT a choice.** "Not triaged" is
 *      the ABSENCE of a decision, so it is not offered as a
 *      selectable option. The dispatcher who wants to leave a
 *      ticket untriaged does not choose it — they do not choose.
 *   3. **The control is a real radio group**, so a screen reader
 *      announces the selected band as the selected one.
 *   4. **A band is never colour alone** — each option carries a
 *      shape and a word.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { PriorityPicker } from '@/components/ui/PriorityPicker';

afterEach(() => {
  cleanup();
});

function renderPicker(
  overrides: Partial<React.ComponentProps<typeof PriorityPicker>> = {},
) {
  const props: React.ComponentProps<typeof PriorityPicker> = {
    value: null,
    onChange: vi.fn(),
    lang: 'en',
    ...overrides,
  };
  render(<PriorityPicker data-testid="picker" {...props} />);
  return props;
}

describe('PriorityPicker — the four bands', () => {
  it('shows all four bands at once, in scale order', () => {
    renderPicker();
    const group = screen.getByTestId('picker');
    const labels = Array.from(group.querySelectorAll('button')).map((b) =>
      b.textContent,
    );
    expect(labels).toEqual(['Low', 'Normal', 'High', 'Urgent']);
  });

  it('shows the bands in ASCENDING urgency, so the escalation is visible', () => {
    renderPicker();
    const group = screen.getByTestId('picker');
    const labels = Array.from(group.querySelectorAll('button')).map((b) =>
      b.textContent,
    );
    expect(labels.indexOf('Low')).toBeLessThan(labels.indexOf('Urgent'));
  });

  it('gives every band a distinct shape, not only a colour', () => {
    renderPicker();
    const group = screen.getByTestId('picker');
    const shapes = Array.from(group.querySelectorAll('button')).map(
      (b) => b.querySelector('svg')!.innerHTML,
    );
    expect(shapes.every((s) => s.length > 0)).toBe(true);
    expect(new Set(shapes).size).toBe(4);
  });

  it('translates the bands', () => {
    renderPicker({ lang: 'bn' });
    const group = screen.getByTestId('picker');
    const labels = Array.from(group.querySelectorAll('button')).map((b) =>
      b.textContent,
    );
    expect(labels).toEqual(['কম', 'সাধারণ', 'বেশি', 'জরুরি']);
  });
});

describe('PriorityPicker — the untriaged state is not a choice', () => {
  it('offers no "not triaged" option', () => {
    renderPicker();
    const group = screen.getByTestId('picker');
    const labels = Array.from(group.querySelectorAll('button')).map((b) =>
      b.textContent,
    );
    expect(labels).not.toContain('Not triaged');
  });

  it('reports the untriaged state when nothing is selected', () => {
    renderPicker({ value: null });
    expect(screen.getByTestId('dispatcher-priority-untriaged')).toBeDefined();
    expect(
      screen.getByTestId('dispatcher-priority-untriaged').textContent,
    ).toBe('Not triaged');
  });

  it('drops the untriaged note once a band is chosen', () => {
    renderPicker({ value: 'high' });
    expect(screen.queryByTestId('dispatcher-priority-untriaged')).toBeNull();
  });
});

describe('PriorityPicker — the radio group', () => {
  it('is announced as a radiogroup with a label', () => {
    renderPicker();
    const group = screen.getByTestId('picker');
    expect(group.getAttribute('role')).toBe('radiogroup');
    expect(group.getAttribute('aria-label')).toBe('Priority');
  });

  it('marks exactly one option as checked', () => {
    renderPicker({ value: 'normal' });
    const group = screen.getByTestId('picker');
    const checked = Array.from(group.querySelectorAll('button')).filter(
      (b) => b.getAttribute('aria-checked') === 'true',
    );
    expect(checked).toHaveLength(1);
    expect(checked[0].textContent).toBe('Normal');
  });

  it('marks nothing as checked when the ticket is untriaged', () => {
    renderPicker({ value: null });
    const group = screen.getByTestId('picker');
    const checked = Array.from(group.querySelectorAll('button')).filter(
      (b) => b.getAttribute('aria-checked') === 'true',
    );
    expect(checked).toHaveLength(0);
  });

  it('reports the chosen band', () => {
    const props = renderPicker();
    fireEvent.click(screen.getByTestId('dispatcher-priority-option-urgent'));
    expect(props.onChange).toHaveBeenCalledWith('urgent');
  });

  it('refuses to change while it is disabled', () => {
    const props = renderPicker({ disabled: true });
    const button = screen.getByTestId('dispatcher-priority-option-high');
    expect(button.hasAttribute('disabled')).toBe(true);
    fireEvent.click(button);
    expect(props.onChange).not.toHaveBeenCalled();
  });
});
