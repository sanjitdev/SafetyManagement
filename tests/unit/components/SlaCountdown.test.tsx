// @vitest-environment jsdom
/**
 * Unit tests for the SLA countdown chip
 * (components/ui/SlaCountdown.tsx).
 *
 * ── The contract this file defends ─────────────────────────────
 *
 * The chip is the dispatcher's answer to "does this ticket need
 * a crew today?". It has to survive three things that a
 * screenshot cannot show:
 *
 *   1. **Greyscale.** The chip must be readable when the colour
 *      is dropped. That means the STATE must not be carried by
 *      hue alone — it needs a word and a shape.
 *   2. **A screen reader.** The accessible name must carry the
 *      state AND the figure. A bare "48" means nothing.
 *   3. **A missing policy.** A category with no SLA policy is
 *      NOT "on track". It is "no target" — nothing has been
 *      promised, so nothing can be missed. Conflating the two
 *      tells the dispatcher a ticket is fine when no clock is
 *      even running.
 *
 * The chip is also the only place the wave's "never colour
 * alone" rule is load-bearing on a *value* rather than a
 * decoration, so it is worth asserting directly.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SlaCountdown } from '@/components/ui/SlaCountdown';
import type { SlaState } from '@/lib/dispatcher/sla';

afterEach(() => {
  cleanup();
});

function state(overrides: Partial<SlaState> = {}): SlaState {
  return {
    tone: 'on_track',
    remainingHours: 46,
    targetHours: 48,
    startedAt: '2026-11-13T10:00:00Z',
    dueAt: '2026-11-15T10:00:00Z',
    ...overrides,
  };
}

describe('SlaCountdown — the state is never colour alone', () => {
  it('renders a WORD for every tone, not just a colour', () => {
    const tones = [
      ['on_track', 'সময়মতো'],
      ['at_risk', 'ঝুঁকিতে'],
      ['breached', 'সময় পেরিয়েছে'],
      ['met', 'সময়মতো সম্পন্ন'],
      ['not_started', 'শুরু হয়নি'],
    ] as const;

    for (const [tone, word] of tones) {
      const { unmount } = render(
        <SlaCountdown state={state({ tone })} lang="bn" showLabel />,
      );
      expect(screen.getByText(word)).toBeDefined();
      unmount();
    }
  });

  it('gives every tone a DISTINCT icon, so the states do not collapse in greyscale', () => {
    const tones = [
      'on_track',
      'at_risk',
      'breached',
      'met',
      'not_started',
    ] as const;
    const svgs: string[] = [];
    for (const tone of tones) {
      const { container, unmount } = render(
        <SlaCountdown state={state({ tone })} lang="bn" />,
      );
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
      // The Phosphor glyphs differ by path data, so the raw inner
      // markup is the shape signature.
      svgs.push(svg!.innerHTML);
      unmount();
    }
    // Five tones, five shapes. Two tones sharing a glyph would
    // make the chip ambiguous without colour.
    expect(new Set(svgs).size).toBe(tones.length);
  });

  it('exposes the tone as a data attribute for CSS and for tests', () => {
    render(
      <SlaCountdown
        state={state({ tone: 'breached' })}
        lang="bn"
        data-testid="sla"
      />,
    );
    expect(screen.getByTestId('sla').getAttribute('data-sla-tone')).toBe(
      'breached',
    );
  });

  it('gives the on_track and met states different icons', () => {
    // Both are "good", but they are different facts: the ticket is
    // still running on time, or it was finished on time.
    const { container: a } = render(
      <SlaCountdown state={state({ tone: 'on_track' })} lang="en" />,
    );
    const onTrack = a.querySelector('svg')!.innerHTML;
    const { container: b } = render(
      <SlaCountdown state={state({ tone: 'met' })} lang="en" />,
    );
    const met = b.querySelector('svg')!.innerHTML;
    expect(onTrack).not.toBe(met);
  });
});

describe('SlaCountdown — the accessible name', () => {
  it('carries the state AND the figure', () => {
    render(
      <SlaCountdown
        state={state({ tone: 'at_risk', remainingHours: 18 })}
        lang="en"
      />,
    );
    const element = document.querySelector('[data-sla-tone]');
    expect(element!.getAttribute('aria-label')).toBe('At risk: 18 hours');
  });

  it('announces the state alone when there is no figure', () => {
    render(
      <SlaCountdown
        state={state({
          tone: 'not_started',
          targetHours: null,
          startedAt: null,
          dueAt: null,
          remainingHours: 0,
        })}
        lang="en"
      />,
    );
    const element = document.querySelector('[data-sla-tone]');
    expect(element!.getAttribute('aria-label')).toBe('Not started');
  });

  it('mirrors the accessible name into the title attribute', () => {
    render(
      <SlaCountdown
        state={state({ tone: 'on_track', remainingHours: 46 })}
        lang="en"
      />,
    );
    const element = document.querySelector('[data-sla-tone]');
    expect(element!.getAttribute('title')).toBe(
      element!.getAttribute('aria-label'),
    );
  });
});

describe('SlaCountdown — the figure', () => {
  it('shows minutes under an hour', () => {
    render(
      <SlaCountdown
        state={state({ tone: 'on_track', remainingHours: 0.75 })}
        lang="en"
      />,
    );
    expect(document.querySelector('[data-sla-tone]')!.textContent).toContain(
      '45 minutes',
    );
  });

  it('shows hours between an hour and two days', () => {
    render(
      <SlaCountdown
        state={state({ tone: 'at_risk', remainingHours: 18 })}
        lang="en"
      />,
    );
    expect(document.querySelector('[data-sla-tone]')!.textContent).toContain(
      '18 hours',
    );
  });

  it('shows days beyond two days', () => {
    render(
      <SlaCountdown
        state={state({ tone: 'on_track', remainingHours: 78 })}
        lang="en"
      />,
    );
    expect(document.querySelector('[data-sla-tone]')!.textContent).toContain(
      '4 days',
    );
  });

  it('renders the Bengali numeral system for a Bengali reader', () => {
    render(
      <SlaCountdown
        state={state({ tone: 'at_risk', remainingHours: 18 })}
        lang="bn"
      />,
    );
    // bn-BD renders 18 as ১৮ — the chip must read as part of the
    // page, not as a pasted-in Western numeral.
    expect(document.querySelector('[data-sla-tone]')!.textContent).toContain(
      '১৮',
    );
  });

  it('shows the OVERDUE amount on a breached chip', () => {
    render(
      <SlaCountdown
        state={state({ tone: 'breached', remainingHours: -2 })}
        lang="en"
      />,
    );
    const element = document.querySelector('[data-sla-tone]');
    expect(element!.textContent).toContain('2 hours');
    // The sign is not shown as a negative number — "2 hours
    // overdue" is the fact, not "-2 hours".
    expect(element!.textContent).not.toContain('-2');
  });

  it('hides the word on a narrow chip but keeps it in the accessible name', () => {
    render(
      <SlaCountdown
        state={state({ tone: 'at_risk', remainingHours: 18 })}
        lang="en"
        showLabel={false}
      />,
    );
    const element = document.querySelector('[data-sla-tone]')!;
    expect(element.textContent).not.toContain('At risk');
    expect(element.getAttribute('aria-label')).toBe('At risk: 18 hours');
  });
});

describe('SlaCountdown — no policy is not on track', () => {
  it('reports "not started", never "on track", when the clock has not begun', () => {
    render(
      <SlaCountdown
        state={state({
          tone: 'not_started',
          targetHours: 48,
          startedAt: null,
          dueAt: null,
          remainingHours: 48,
        })}
        lang="en"
      />,
    );
    const element = document.querySelector('[data-sla-tone]')!;
    expect(element.getAttribute('data-sla-tone')).toBe('not_started');
    expect(element.getAttribute('aria-label')).not.toContain('On track');
  });

  it('shows no figure at all when the category has no policy', () => {
    render(
      <SlaCountdown
        state={state({
          tone: 'not_started',
          targetHours: null,
          startedAt: null,
          dueAt: null,
          remainingHours: 0,
        })}
        lang="en"
      />,
    );
    const element = document.querySelector('[data-sla-tone]')!;
    // "0 hours" would be a lie: nothing is being counted down.
    expect(element.textContent).toBe('Not started');
  });
});
