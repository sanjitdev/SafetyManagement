// @vitest-environment jsdom
/**
 * Unit tests for the MetricStrip.
 *
 * The strip is the replacement for the row of four identical KPI
 * cards, so the tests are mostly about the two properties that
 * replacement was supposed to buy:
 *
 *   1. A HIERARCHY. The headline is not just the first figure — it is
 *      structurally distinct from the supporting figures.
 *   2. A real DEFINITION LIST. The supporting figures are `<dt>` /
 *      `<dd>` pairs, so a screen reader binds each label to its value
 *      instead of reading two unrelated strings.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MetricStrip } from '@/components/ui/MetricStrip';

afterEach(() => {
  cleanup();
});

const HEADLINE = { key: 'total', label: 'মোট রিপোর্ট', value: '৫৮' };
const FIGURES = [
  { key: 'resolved', label: 'সমাধান', value: '৪২' },
  { key: 'pending', label: 'অপেক্ষমাণ', value: '১৬' },
];

describe('MetricStrip', () => {
  it('renders the headline figure and every supporting figure', () => {
    render(<MetricStrip lang="bn" headline={HEADLINE} figures={FIGURES} />);

    expect(screen.getByText('মোট রিপোর্ট')).toBeDefined();
    expect(screen.getByText('৫৮')).toBeDefined();
    expect(screen.getByText('সমাধান')).toBeDefined();
    expect(screen.getByText('৪২')).toBeDefined();
    expect(screen.getByText('অপেক্ষমাণ')).toBeDefined();
    expect(screen.getByText('১৬')).toBeDefined();
  });

  it('gives the headline its own element, distinct from the figures', () => {
    const { container } = render(
      <MetricStrip
        lang="bn"
        headline={HEADLINE}
        figures={FIGURES}
        data-testid-headline="strip-headline"
      />,
    );

    const headline = container.querySelector('[data-testid="strip-headline"]');
    expect(headline).not.toBeNull();

    // The headline is NOT one of the supporting figures. It is the
    // one figure that gets its own surface and the display type; the
    // rest share a strip. If the headline ever became a peer, the
    // hierarchy the strip exists to create would be gone.
    const figures = container.querySelectorAll('.metric-strip-figure');
    expect(figures).toHaveLength(FIGURES.length);
    expect(headline?.classList.contains('metric-strip-figure')).toBe(false);
  });

  it('binds each supporting label to its value in a definition list', () => {
    const { container } = render(
      <MetricStrip lang="bn" headline={HEADLINE} figures={FIGURES} />,
    );

    const list = container.querySelector('dl');
    expect(list).not.toBeNull();

    // One `<dt>` (the label) and one `<dd>` (the value) per figure —
    // not a bare pile of spans.
    expect(list?.querySelectorAll('dt')).toHaveLength(FIGURES.length);
    expect(list?.querySelectorAll('dd')).toHaveLength(FIGURES.length);
  });

  it('shows the trend as an arrow beside its value, never the colour alone', () => {
    const { container } = render(
      <MetricStrip
        lang="bn"
        headline={{ ...HEADLINE, trend: 'up', trendValue: '১২%', trendTone: 'danger' }}
      />,
    );

    // The arrow is a Phosphor SVG, not a Unicode text glyph — a text
    // triangle renders differently on every platform and cannot take
    // the theme's tone colour.
    expect(container.querySelector('svg')).not.toBeNull();
    // The value is always present beside the arrow, so the direction
    // never depends on the shape alone.
    expect(screen.getByText('১২%')).toBeDefined();
  });

  it('renders without supporting figures', () => {
    render(<MetricStrip lang="bn" headline={HEADLINE} />);

    expect(screen.getByText('মোট রিপোর্ট')).toBeDefined();
    expect(screen.getByText('৫৮')).toBeDefined();
    expect(document.querySelector('dl')).toBeNull();
  });

  it('exposes the region with a name', () => {
    render(<MetricStrip lang="bn" headline={HEADLINE} figures={FIGURES} />);
    expect(screen.getByRole('group', { name: 'মূল পরিসংখ্যান' })).toBeDefined();
  });
});
