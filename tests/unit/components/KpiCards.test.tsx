// @vitest-environment jsdom
/**
 * Unit tests for the KpiCards row.
 *
 * The dispatcher dashboard used to render its four headline numbers
 * through `MetricStrip`. It now renders them as four separate cards,
 * because the four queue states are PEERS: the dispatcher reads them
 * left to right as one set of counts, not as one dominant number with
 * three footnotes.
 *
 * The tests cover the three things that replacement has to get
 * right, each of which was a real defect at some point:
 *
 *   1. SEPARATENESS. The cards must be separate cards — the row must
 *      not collapse back into one shared surface.
 *   2. THE SKELETON MIRRORS THE LOADED ROW. A skeleton that does not
 *      match the loaded layout makes the page jump the moment the
 *      data lands, which is the one thing a skeleton exists to
 *      prevent.
 *   3. THE COLOUR IS NEVER THE ONLY SIGNAL. The badge carries the
 *      status colour, but the label is always spelled out beside it,
 *      so the row is readable without colour vision.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { KpiCards, KpiCardsSkeleton } from '@/components/ui/KpiCards';
import { ICONS } from '@/lib/ui/icon-map';

afterEach(() => {
  cleanup();
});

const CARDS = [
  { key: 'new', label: 'নতুন রিপোর্ট', value: '২৮', icon: ICONS.statusSubmitted, color: 'var(--color-status-submitted)', colorSoft: 'var(--color-status-submitted-soft)' },
  { key: 'review', label: 'পর্যালোচনাধীন', value: '৭', icon: ICONS.statusRouted, color: 'var(--color-status-routed)', colorSoft: 'var(--color-status-routed-soft)' },
  { key: 'progress', label: 'চলমান', value: '১', icon: ICONS.statusInProgress, color: 'var(--color-status-in-progress)', colorSoft: 'var(--color-status-in-progress-soft)' },
  { key: 'resolved', label: 'সমাধান হয়েছে', value: '১০', icon: ICONS.statusResolved, color: 'var(--color-status-resolved)', colorSoft: 'var(--color-status-resolved-soft)' },
];

describe('KpiCards', () => {
  it('renders every card with its label and value', () => {
    render(<KpiCards lang="bn" cards={CARDS} />);

    for (const card of CARDS) {
      expect(screen.getByText(card.label)).toBeDefined();
      expect(screen.getByText(card.value)).toBeDefined();
    }
  });

  it('renders one SEPARATE card per figure, not one shared surface', () => {
    const { container } = render(
      <KpiCards lang="bn" cards={CARDS} data-testid-prefix="dispatcher-kpi" />,
    );

    const cards = container.querySelectorAll('.dispatcher-kpi-card');
    expect(cards).toHaveLength(CARDS.length);

    // The old MetricStrip rendered one bordered surface holding the
    // headline and the figures. If that shape ever comes back, the
    // cards have stopped being peers.
    expect(container.querySelector('.metric-strip-surface')).toBeNull();

    // Each card is its own bordered surface.
    for (const card of cards) {
      const style = (card as HTMLElement).style;
      expect(style.border).toContain('1px solid');
    }
  });

  it('gives the row its card count to the layout, not a hard-coded four', () => {
    const { container } = render(<KpiCards lang="bn" cards={CARDS.slice(0, 2)} />);

    const row = container.querySelector('.dispatcher-kpi-cards') as HTMLElement;
    expect(row.style.getPropertyValue('--kpi-card-count')).toBe('2');
  });

  it('carries no shadow, because the design system reserves shadows for overlays', () => {
    const { container } = render(<KpiCards lang="bn" cards={CARDS} />);

    const card = container.querySelector('.dispatcher-kpi-card') as HTMLElement;
    // "Cards have NO shadow — a 1px border lifts them." The
    // separation between the cards comes from the gap plus each
    // card's own border.
    expect(card.style.boxShadow).toBe('');
  });

  it('spells the label out beside the badge, so the colour is never the only signal', () => {
    const { container } = render(
      <KpiCards lang="bn" cards={CARDS} data-testid-prefix="dispatcher-kpi" />,
    );

    const badge = container.querySelector('[data-testid="dispatcher-kpi-new"] > span:first-child');
    expect(badge).not.toBeNull();
    // The badge is decorative: the label beside it carries the
    // meaning.
    expect(badge?.getAttribute('aria-hidden')).toBe('true');

    expect(screen.getByText('নতুন রিপোর্ট')).toBeDefined();
  });

  it('exposes the region with a name', () => {
    render(<KpiCards lang="bn" cards={CARDS} ariaLabel="পরিসংখ্যান" />);
    expect(screen.getByRole('group', { name: 'পরিসংখ্যান' })).toBeDefined();
  });
});

describe('KpiCardsSkeleton', () => {
  it('renders one placeholder card per figure', () => {
    const { container } = render(<KpiCardsSkeleton lang="bn" count={4} />);

    const row = container.querySelector('.dispatcher-kpi-cards');
    expect(row).not.toBeNull();
    expect(row?.children).toHaveLength(4);
  });

  it('mirrors the loaded row’s card geometry, so the page does not jump', () => {
    const { container } = render(<KpiCardsSkeleton lang="bn" count={4} />);

    const card = container.querySelector('.dispatcher-kpi-cards > *') as HTMLElement;
    const style = card.style;

    // The same surface treatment as a loaded card.
    expect(style.border).toContain('1px solid');
    expect(style.borderRadius).toContain('radius-card');
    expect(style.padding).toContain('space-4');

    // The badge placeholder is a CIRCLE of the same size the loaded
    // card's icon badge uses. A skeleton badge that collapsed to an
    // ellipse was a real defect: the wrapper had no height, so the
    // 38px circle was squashed.
    const badge = card.children[0] as HTMLElement;
    expect(badge.style.width).toBe('38px');
    expect(badge.style.height).toBe('38px');
    expect(badge.style.borderRadius).toBe('50%');
  });

  it('gives the text block room to render its bars', () => {
    const { container } = render(<KpiCardsSkeleton lang="bn" count={4} />);

    const card = container.querySelector('.dispatcher-kpi-cards > *') as HTMLElement;
    const textBlock = card.children[1] as HTMLElement;

    // Without a grow, the text block collapsed to zero width and the
    // label and value bars inside it — sized in percentages of this
    // wrapper — vanished entirely.
    expect(textBlock.style.flex).toContain('1 1 auto');

    // The bars themselves are still there.
    expect(textBlock.querySelectorAll('.cityfix-skeleton').length).toBe(2);
  });

  it('announces itself as a loading status', () => {
    render(<KpiCardsSkeleton lang="bn" count={4} />);
    expect(screen.getByRole('status')).toBeDefined();
  });
});

/*
 * The CREW variant.
 *
 * The crew dashboard's design reference
 * (`ui-design/Crew Portal Dashboard.png`) draws its four numbers as
 * four cards whose ANATOMY differs from the dispatcher's: the badge
 * is on the left, the NUMBER sits above its caption, and a chevron
 * closes the card. The surface treatment is the same — 1px border,
 * no shadow — because the design system's rule is about surfaces,
 * not about which dashboard you are on.
 */
describe('KpiCards — the crew variant', () => {
  const CREW_CARDS = [
    { key: 'assigned', label: 'বরাদ্দকৃত কাজ', value: '3', icon: ICONS.crewAssigned, color: 'var(--color-primary)', colorSoft: 'var(--color-primary-soft)' },
    { key: 'completed', label: 'আজ সম্পন্ন', value: '1', icon: ICONS.crewCompleted, color: 'var(--color-success)', colorSoft: 'var(--color-success-soft)' },
    { key: 'pending', label: 'অপেক্ষমাণ', value: '2', icon: ICONS.crewPending, color: 'var(--color-warning)', colorSoft: 'var(--color-warning-soft)' },
    { key: 'work-time', label: 'মোট কাজের সময়', value: '6h 30m', icon: ICONS.crewWorkTime, color: 'var(--color-primary)', colorSoft: 'var(--color-primary-soft)' },
  ];

  it('renders one separate card per figure', () => {
    const { container } = render(
      <KpiCards lang="bn" variant="crew" cards={CREW_CARDS} />,
    );

    expect(container.querySelectorAll('.crew-kpi-card')).toHaveLength(CREW_CARDS.length);
    // Still not a shared strip.
    expect(container.querySelector('.metric-strip-surface')).toBeNull();
  });

  it('puts the VALUE above its caption, the way the crew design does', () => {
    const { container } = render(
      <KpiCards lang="bn" variant="crew" cards={CREW_CARDS} />,
    );

    const card = container.querySelector('.crew-kpi-card') as HTMLElement;
    const textBlock = card.children[1];
    const [valueLine, labelLine] = [...textBlock.children];

    // The value is the FIRST line, the caption the second.
    expect(valueLine.textContent).toBe('3');
    expect(labelLine.textContent).toBe('বরাদ্দকৃত কাজ');
  });

  it('closes the card with a decorative chevron', () => {
    const { container } = render(
      <KpiCards lang="bn" variant="crew" cards={CREW_CARDS} />,
    );

    const card = container.querySelector('.crew-kpi-card') as HTMLElement;
    const chevron = card.children[card.children.length - 1];

    // The chevron suggests the card is a way in to the job list, but
    // none of these cards IS a link — so the chevron must not be
    // announced as one, and must not be the only thing carrying the
    // card's meaning.
    expect(chevron.getAttribute('aria-hidden')).toBe('true');
  });

  it('carries no shadow', () => {
    const { container } = render(
      <KpiCards lang="bn" variant="crew" cards={CREW_CARDS} />,
    );

    const card = container.querySelector('.crew-kpi-card') as HTMLElement;
    expect(card.style.boxShadow).toBe('');
    expect(card.style.border).toContain('1px solid');
  });

  it('keeps the dispatcher variant free of the crew chevron', () => {
    const { container } = render(
      <KpiCards lang="bn" cards={CREW_CARDS} />,
    );

    const card = container.querySelector('.dispatcher-kpi-card') as HTMLElement;
    expect(card.classList.contains('crew-kpi-card')).toBe(false);
    // Three children: the badge, the text block. No chevron.
    expect(card.children).toHaveLength(2);
  });

  it('gives the crew skeleton the same anatomy, value first', () => {
    const { container } = render(
      <KpiCardsSkeleton lang="bn" count={4} variant="crew" />,
    );

    const card = container.querySelector('.crew-kpi-cards > *') as HTMLElement;

    // Badge, text block, chevron placeholder.
    expect(card.children).toHaveLength(3);
    const textBlock = card.children[1];
    // The text block carries the value line FIRST, then the caption.
    expect(textBlock.children[0].children[0].style.width).toBe('44%');
    expect(textBlock.children[1].children[0].style.width).toBe('72%');
  });
});

/*
 * The CITIZEN variant.
 *
 * The citizen dashboard's design reference
 * (`ui-design/citien-dashboard.png`) draws its overview row as a blue
 * "Report a Problem" CTA block followed by THREE cards — total
 * reports, resolved, in progress. The cards differ from the crew's in
 * one way that matters: there is no chevron, because the citizen's
 * row is a readout, not a set of doorways.
 */
describe('KpiCards — the citizen variant', () => {
  const CITIZEN_CARDS = [
    { key: 'reports', label: 'আমার রিপোর্ট', value: '3', icon: ICONS.citizenReports, color: 'var(--color-primary)', colorSoft: 'var(--color-primary-soft)' },
    { key: 'resolved', label: 'সমাধান হয়েছে', value: '1', icon: ICONS.citizenResolved, color: 'var(--color-success)', colorSoft: 'var(--color-success-soft)' },
    { key: 'progress', label: 'চলমান', value: '2', icon: ICONS.citizenInProgress, color: 'var(--color-warning)', colorSoft: 'var(--color-warning-soft)' },
  ];

  it('renders one separate card per figure', () => {
    const { container } = render(
      <KpiCards lang="bn" variant="citizen" cards={CITIZEN_CARDS} />,
    );

    expect(container.querySelectorAll('.citizen-kpi-card')).toHaveLength(CITIZEN_CARDS.length);
    // Still not a shared strip.
    expect(container.querySelector('.metric-strip-surface')).toBeNull();
  });

  it('puts the VALUE above its caption, the way the citizen design does', () => {
    const { container } = render(
      <KpiCards lang="bn" variant="citizen" cards={CITIZEN_CARDS} />,
    );

    const card = container.querySelector('.citizen-kpi-card') as HTMLElement;
    const textBlock = card.children[1];
    const [valueLine, labelLine] = [...textBlock.children];

    expect(valueLine.textContent).toBe('3');
    expect(labelLine.textContent).toBe('আমার রিপোর্ট');
  });

  it('closes the card with NO chevron — the citizen row is a readout, not a doorway', () => {
    const { container } = render(
      <KpiCards lang="bn" variant="citizen" cards={CITIZEN_CARDS} />,
    );

    const card = container.querySelector('.citizen-kpi-card') as HTMLElement;
    // Badge, text block. Nothing at the right edge.
    expect(card.children).toHaveLength(2);
  });

  it('draws the badge as a soft wash with the glyph in the saturated colour', () => {
    const { container } = render(
      <KpiCards lang="bn" variant="citizen" cards={CITIZEN_CARDS} />,
    );

    const card = container.querySelector('.citizen-kpi-card') as HTMLElement;
    const badge = card.children[0] as HTMLElement;

    // The same badge treatment as the dispatcher and crew: a soft
    // circular wash carrying the saturated status colour, so the
    // row reads as one set of status colours across all three
    // dashboards.
    expect(badge.style.background).toBe('var(--color-primary-soft)');
    expect(badge.style.color).toBe('var(--color-primary)');
    expect(badge.style.borderRadius).toBe('50%');
  });

  it('carries no shadow', () => {
    const { container } = render(
      <KpiCards lang="bn" variant="citizen" cards={CITIZEN_CARDS} />,
    );

    const card = container.querySelector('.citizen-kpi-card') as HTMLElement;
    expect(card.style.boxShadow).toBe('');
    expect(card.style.border).toContain('1px solid');
  });

  it('gives the citizen skeleton the same anatomy, value first and no chevron', () => {
    const { container } = render(
      <KpiCardsSkeleton lang="bn" count={3} variant="citizen" />,
    );

    const card = container.querySelector('.citizen-kpi-cards > *') as HTMLElement;

    // Badge, text block. NO chevron placeholder.
    expect(card.children).toHaveLength(2);
    const textBlock = card.children[1];
    // The text block carries the value line FIRST, then the caption.
    expect(textBlock.children[0].children[0].style.width).toBe('44%');
    expect(textBlock.children[1].children[0].style.width).toBe('72%');
  });

  it('gives the citizen skeleton one placeholder card per figure', () => {
    const { container } = render(
      <KpiCardsSkeleton lang="bn" count={3} variant="citizen" />,
    );

    expect(container.querySelector('.citizen-kpi-cards')?.children).toHaveLength(3);
  });
});

/*
 * The ADMIN variant.
 *
 * The admin's design reference (`ui-design/admin-dashboard.png`) draws
 * its four headline counts as four separate cards, and each card has
 * an ANATOMY the other three dashboards do not have: a SOLID disc
 * badge with the glyph reversed out of it, the number over its
 * caption, a trend percentage with an arrow, and a sparkline in the
 * bottom corner.
 *
 * The sparkline is the part that was actually MISSING: the admin page
 * computed a daily series for every metric and never drew it. These
 * tests pin the four things the card has to get right — separate
 * cards, the solid badge, the trend, and the sparkline — because each
 * is a shape that can silently regress to nothing.
 */
describe('KpiCards — the admin variant', () => {
  const ADMIN_CARDS = [
    {
      key: 'total',
      label: 'মোট রিপোর্ট',
      value: '১,২৪৮',
      icon: ICONS.reports,
      color: 'var(--color-primary)',
      colorSoft: 'var(--color-primary-soft)',
      spark: [12, 18, 14, 22, 19, 26, 31],
      trend: 'up' as const,
      trendValue: '2.8%',
      trendTone: 'warning' as const,
    },
    {
      key: 'resolved',
      label: 'সমাধান হয়েছে',
      value: '১,১০২',
      icon: ICONS.statusResolved,
      color: 'var(--color-status-resolved)',
      colorSoft: 'var(--color-status-resolved-soft)',
      spark: [8, 11, 15, 14, 20, 24, 29],
      trend: 'up' as const,
      trendValue: '4.1%',
      trendTone: 'success' as const,
    },
  ];

  it('renders one separate card per figure, not one shared surface', () => {
    const { container } = render(
      <KpiCards lang="bn" variant="admin" cards={ADMIN_CARDS} />,
    );

    expect(container.querySelectorAll('.admin-kpi-card')).toHaveLength(ADMIN_CARDS.length);
    // The old MetricStrip rendered one bordered surface holding the
    // headline and the figures.
    expect(container.querySelector('.metric-strip-surface')).toBeNull();
  });

  it('puts the VALUE above its caption, the way the admin design does', () => {
    const { container } = render(
      <KpiCards lang="bn" variant="admin" cards={ADMIN_CARDS} />,
    );

    const card = container.querySelector('.admin-kpi-card') as HTMLElement;
    // The admin's card is a COLUMN: the top row holds the badge and
    // the text block, and the footer holds the trend and the
    // sparkline.
    const topRow = card.children[0];
    const textBlock = topRow.children[1];
    const [valueLine, labelLine] = [...textBlock.children];

    expect(valueLine.textContent).toBe('১,২৪৮');
    expect(labelLine.textContent).toBe('মোট রিপোর্ট');
  });

  it('draws the badge as a SOLID disc with the glyph reversed out of it', () => {
    const { container } = render(
      <KpiCards lang="bn" variant="admin" cards={ADMIN_CARDS} />,
    );

    const card = container.querySelector('.admin-kpi-card') as HTMLElement;
    const badge = card.children[0].children[0] as HTMLElement;

    // The one variant that fills the circle: the saturated status
    // colour is the background and the soft colour is the glyph.
    expect(badge.style.background).toBe('var(--color-primary)');
    expect(badge.style.color).toBe('var(--color-primary-soft)');
    expect(badge.style.borderRadius).toBe('50%');
    expect(badge.getAttribute('aria-hidden')).toBe('true');
  });

  it('draws the sparkline, which the admin page computed but never rendered', () => {
    const { container } = render(
      <KpiCards lang="bn" variant="admin" cards={ADMIN_CARDS} />,
    );

    const card = container.querySelector('.admin-kpi-card') as HTMLElement;
    const footer = card.children[1] as HTMLElement;
    // The sparkline is the footer's SECOND child — the first is the
    // trend badge, which carries its own arrow glyph.
    const spark = footer.children[1];

    expect(spark.tagName.toLowerCase()).toBe('svg');
    // The line is decorative: the numbers it plots are already
    // spelled out as the card's value and its trend percentage.
    expect(spark.getAttribute('aria-hidden')).toBe('true');

    // One path, and it carries the card's status colour.
    const path = spark.querySelector('path');
    expect(path).not.toBeNull();
    expect(path?.getAttribute('stroke')).toBe('var(--color-primary)');
    expect(path?.getAttribute('d')).toContain('M');
  });

  it('shows the trend arrow BESIDE the percentage, never the arrow alone', () => {
    const { container } = render(
      <KpiCards lang="bn" variant="admin" cards={ADMIN_CARDS} />,
    );

    const card = container.querySelector('.admin-kpi-card') as HTMLElement;
    const footer = card.children[1] as HTMLElement;
    const trend = footer.children[0];

    // The percentage is spelled out.
    expect(trend.textContent).toContain('2.8%');
    // And the arrow that carries the direction is beside it, hidden
    // from assistive technology so it is never the only signal.
    const arrow = trend.querySelector('svg');
    expect(arrow).not.toBeNull();
    expect(arrow?.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('colours the trend by its TONE, because a rising count is not good', () => {
    const { container } = render(
      <KpiCards lang="bn" variant="admin" cards={ADMIN_CARDS} />,
    );

    const cards = [...container.querySelectorAll('.admin-kpi-card')];
    const totalTrend = (cards[0].children[1] as HTMLElement).children[0] as HTMLElement;
    const resolvedTrend = (cards[1].children[1] as HTMLElement).children[0] as HTMLElement;

    // More outstanding tickets going up is a warning; more resolved
    // tickets going up is a success.
    expect(totalTrend.style.color).toBe('var(--color-warning)');
    expect(resolvedTrend.style.color).toBe('var(--color-success)');
  });

  it('carries no shadow and no chevron', () => {
    const { container } = render(
      <KpiCards lang="bn" variant="admin" cards={ADMIN_CARDS} />,
    );

    const card = container.querySelector('.admin-kpi-card') as HTMLElement;
    // "Cards have NO shadow — a 1px border lifts them."
    expect(card.style.boxShadow).toBe('');
    expect(card.style.border).toContain('1px solid');

    // No chevron: the admin's cards are a readout, not a doorway. The
    // card's own children are the top row and the footer — a chevron
    // would be a third.
    expect(card.children).toHaveLength(2);
  });

  it('gives the admin skeleton the same anatomy, with a footer row', () => {
    const { container } = render(
      <KpiCardsSkeleton lang="bn" count={4} variant="admin" />,
    );

    const card = container.querySelector('.admin-kpi-cards > *') as HTMLElement;

    // The top row (badge + text) and the footer row (trend + sparkline).
    expect(card.children).toHaveLength(2);

    const topRow = card.children[0];
    const badge = topRow.children[0] as HTMLElement;
    expect(badge.style.width).toBe('38px');
    expect(badge.style.height).toBe('38px');
    expect(badge.style.borderRadius).toBe('50%');

    // The text block carries the value line FIRST, then the caption.
    const textBlock = topRow.children[1];
    expect(textBlock.children[0].children[0].style.width).toBe('44%');
    expect(textBlock.children[1].children[0].style.width).toBe('72%');

    // The footer row carries a trend bar and a block for the line, so
    // the card does not change height when the data lands.
    const footer = card.children[1] as HTMLElement;
    expect(footer.children).toHaveLength(2);
    expect((footer.children[1] as HTMLElement).style.width).toBe('64px');
  });

  it('gives the admin skeleton one placeholder card per figure', () => {
    const { container } = render(
      <KpiCardsSkeleton lang="bn" count={4} variant="admin" />,
    );

    expect(container.querySelector('.admin-kpi-cards')?.children).toHaveLength(4);
  });
});
