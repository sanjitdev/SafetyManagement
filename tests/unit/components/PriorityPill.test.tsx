// @vitest-environment jsdom
/**
 * Unit tests for the PriorityPill primitive
 * (components/ui/PriorityPill.tsx).
 *
 * ── The contract this file defends ─────────────────────────────
 *
 * The chip answers ONE question: how urgent is this report, and
 * has anyone judged it yet? Three properties keep it honest:
 *
 *   1. **The untriaged state is NOT a band.** A report nobody has
 *      triaged and a report a dispatcher deliberately judged `low`
 *      are different facts. The chip must never draw them the
 *      same way — the untriaged chip is dashed and unfilled.
 *   2. **The colour is never the only signal.** The chip carries a
 *      shape, a word AND a colour, so it survives a greyscale
 *      printout and a colour-blind reader.
 *   3. **The band and the timestamp are read independently.** The
 *      serializer emits them separately, so a row can carry a band
 *      with no timestamp — and such a row has never been triaged.
 *      The chip and the queue's ordering must agree on that.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { PriorityPill } from '@/components/ui/PriorityPill';

afterEach(() => {
  cleanup();
});

describe('PriorityPill — the untriaged state', () => {
  it('draws a null band as untriaged, not as low', () => {
    render(<PriorityPill data-testid="pill" priority={null} lang="en" />);
    const chip = screen.getByTestId('pill');
    expect(chip.getAttribute('data-priority')).toBe('untriaged');
    expect(chip.getAttribute('data-triaged')).toBe('false');
  });

  it('draws an explicit low band as triaged', () => {
    render(<PriorityPill data-testid="pill" priority="low" prioritySetAt="2026-11-17T10:00:00.000Z" lang="en" />);
    const chip = screen.getByTestId('pill');
    expect(chip.getAttribute('data-priority')).toBe('low');
    expect(chip.getAttribute('data-triaged')).toBe('true');
  });

  it('says "Not triaged" rather than repeating the low word', () => {
    render(<PriorityPill data-testid="pill" priority={null} lang="en" showLabel />);
    expect(screen.getByTestId('pill').textContent).toBe('Not triaged');
  });

  it('treats a band with no timestamp as untriaged', () => {
    // The write path always stamps a band and a timestamp
    // together, so this state only arises on a row written before
    // the feature existed — and such a row genuinely has never
    // been triaged. The chip must agree with the queue's ordering.
    render(<PriorityPill data-testid="pill" priority="urgent" prioritySetAt={null} lang="en" />);
    const chip = screen.getByTestId('pill');
    expect(chip.getAttribute('data-priority')).toBe('untriaged');
    expect(chip.getAttribute('data-triaged')).toBe('false');
  });

  it('draws the untriaged state with a DASHED border and no fill', () => {
    render(<PriorityPill data-testid="pill" priority={null} lang="en" />);
    const style = screen.getByTestId('pill').style;
    expect(style.border).toContain('dashed');
    expect(style.background).toBe('transparent');
  });

  it('draws a triaged band with a SOLID border and a fill', () => {
    render(<PriorityPill data-testid="pill" priority="high" prioritySetAt="2026-11-17T10:00:00.000Z" lang="en" />);
    const style = screen.getByTestId('pill').style;
    expect(style.border).not.toContain('dashed');
    expect(style.background).not.toBe('transparent');
  });

  it('never draws the untriaged chip the same as a filled low chip', () => {
    const { unmount } = render(
      <PriorityPill data-testid="pill" priority={null} lang="en" />,
    );
    const untriaged = screen.getByTestId('pill').getAttribute('style');
    unmount();
    render(
      <PriorityPill data-testid="pill" priority="low" prioritySetAt="2026-11-17T10:00:00.000Z" lang="en" />,
    );
    const low = screen.getByTestId('pill').getAttribute('style');
    expect(untriaged).not.toBe(low);
  });
});

describe('PriorityPill — the band is never colour alone', () => {
  it('carries a shape for every band, and the shapes differ', () => {
    const bands = ['low', 'normal', 'high', 'urgent'] as const;
    const shapes: string[] = [];
    for (const band of bands) {
      const { unmount } = render(
        <PriorityPill data-testid="pill" priority={band} prioritySetAt="2026-11-17T10:00:00.000Z" lang="en" />,
      );
      const chip = screen.getByTestId('pill');
      // The icon is the only child of the chip when the label is
      // hidden, so its presence proves a shape was rendered.
      expect(chip.querySelector('svg')).not.toBeNull();
      shapes.push(chip.querySelector('svg')!.innerHTML);
      unmount();
    }
    // Four bands, four distinct silhouettes — so the escalation
    // survives a greyscale printout.
    expect(new Set(shapes).size).toBe(4);
  });

  it('labels the band in words when asked to', () => {
    render(
      <PriorityPill data-testid="pill" priority="urgent" prioritySetAt="2026-11-17T10:00:00.000Z" lang="en" showLabel />,
    );
    expect(screen.getByTestId('pill').textContent).toBe('Urgent');
  });

  it('names the band for a screen reader even when the label is hidden', () => {
    render(
      <PriorityPill data-testid="pill" priority="high" prioritySetAt="2026-11-17T10:00:00.000Z" lang="en" />,
    );
    expect(screen.getByTestId('pill').getAttribute('aria-label')).toBe('High');
  });

  it('translates the band', () => {
    render(
      <PriorityPill data-testid="pill" priority="urgent" prioritySetAt="2026-11-17T10:00:00.000Z" lang="bn" showLabel />,
    );
    expect(screen.getByTestId('pill').textContent).toBe('জরুরি');
  });
});
