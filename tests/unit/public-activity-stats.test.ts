/**
 * Vitest: the landing page's stats row + filter chips.
 *
 * ## What this guards
 *
 * The public landing (`/`) shows three counters ("reports this month",
 * "resolved", "average days to resolve") and a filter row of four
 * chips with per-group counts. Both come from
 * `computeStats` in `app/api/v1/activity/public/route.ts`.
 *
 * Two properties matter and both are easy to break:
 *
 *  1. **The chip counts must not move when a filter is applied.** A
 *     citizen who taps "সমাধান" (17) must still see that "নতুন" holds
 *     41 — otherwise the chips become useless as a map of the city.
 *     The counts are therefore computed over the city's FULL ticket
 *     set, before the filter narrows the returned page.
 *
 *  2. **The counters must be real, not authored constants.** The
 *     mockup shipped hard-coded numbers (482 / 397 / 3.4 days); the
 *     live page shows what the database actually holds. These tests
 *     pin that the numbers track the data.
 *
 * The month window uses UTC so the numbers do not shift with the
 * runner's timezone.
 */

import { describe, expect, test } from 'vitest';
import { computeStats } from '@/app/api/v1/activity/public/route';

const NOW = new Date('2026-11-09T12:00:00Z');

function ticket(
  overrides: Partial<{
    status: string;
    createdAt: string;
    resolvedAt: string | null;
  }> = {},
) {
  return {
    status: 'submitted',
    createdAt: '2026-11-01T00:00:00.000Z',
    resolvedAt: null,
    ...overrides,
  };
}

describe('computeStats — month counters', () => {
  test('counts only the current month', () => {
    const stats = computeStats(
      [
        ticket({ createdAt: '2026-11-05T00:00:00.000Z' }),
        ticket({ createdAt: '2026-11-08T00:00:00.000Z' }),
        // Last month — must not count.
        ticket({ createdAt: '2026-10-31T23:59:59.000Z' }),
        // Two months ago — must not count.
        ticket({ createdAt: '2026-09-15T00:00:00.000Z' }),
      ],
      NOW,
    );
    expect(stats.reportsThisMonth).toBe(2);
  });

  test('a month boundary falls on the 1st at UTC midnight', () => {
    // 2026-10-31T23:59:59Z is October; 2026-11-01T00:00:00Z is
    // November. The month must not be off by the runner's timezone.
    const stats = computeStats(
      [
        ticket({ createdAt: '2026-10-31T23:59:59.999Z' }),
        ticket({ createdAt: '2026-11-01T00:00:00.000Z' }),
      ],
      NOW,
    );
    expect(stats.reportsThisMonth).toBe(1);
  });

  test('the resolution rate is resolved-this-month over reported-this-month', () => {
    const stats = computeStats(
      [
        ticket({ status: 'resolved', resolvedAt: '2026-11-03T00:00:00.000Z' }),
        ticket({ status: 'closed', resolvedAt: '2026-11-04T00:00:00.000Z' }),
        ticket({ status: 'cancelled', resolvedAt: '2026-11-05T00:00:00.000Z' }),
        ticket({ status: 'submitted' }),
        ticket({ status: 'in_progress' }),
      ],
      NOW,
    );
    expect(stats.reportsThisMonth).toBe(5);
    expect(stats.resolvedThisMonth).toBe(3);
    expect(stats.resolutionRate).toBe(60);
  });

  test('an empty city reports zeroes rather than NaN', () => {
    const stats = computeStats([], NOW);
    expect(stats.reportsThisMonth).toBe(0);
    expect(stats.resolvedThisMonth).toBe(0);
    expect(stats.resolutionRate).toBe(0);
    expect(stats.avgDaysToResolve).toBe(0);
  });

  test('a city with no reports this month reports a zero rate, not a division error', () => {
    const stats = computeStats(
      [ticket({ createdAt: '2026-10-01T00:00:00.000Z' })],
      NOW,
    );
    expect(stats.reportsThisMonth).toBe(0);
    expect(stats.resolutionRate).toBe(0);
  });
});

describe('computeStats — average days to resolve', () => {
  test('averages the resolved durations', () => {
    const stats = computeStats(
      [
        // 2 days.
        ticket({
          status: 'resolved',
          createdAt: '2026-11-01T00:00:00.000Z',
          resolvedAt: '2026-11-03T00:00:00.000Z',
        }),
        // 4 days.
        ticket({
          status: 'resolved',
          createdAt: '2026-11-01T00:00:00.000Z',
          resolvedAt: '2026-11-05T00:00:00.000Z',
        }),
      ],
      NOW,
    );
    expect(stats.avgDaysToResolve).toBe(3);
  });

  test('unresolved tickets do not drag the average down', () => {
    const stats = computeStats(
      [
        ticket({
          status: 'resolved',
          createdAt: '2026-11-01T00:00:00.000Z',
          resolvedAt: '2026-11-03T00:00:00.000Z',
        }),
        // Still open — no resolvedAt, so it contributes nothing.
        ticket({ status: 'in_progress', createdAt: '2026-11-01T00:00:00.000Z' }),
      ],
      NOW,
    );
    expect(stats.avgDaysToResolve).toBe(2);
  });

  test('a negative duration is ignored rather than skewing the average', () => {
    // Clock skew: resolvedAt before createdAt. A negative average
    // would be nonsense, so the sample is dropped.
    const stats = computeStats(
      [
        ticket({
          status: 'resolved',
          createdAt: '2026-11-05T00:00:00.000Z',
          resolvedAt: '2026-11-01T00:00:00.000Z',
        }),
        ticket({
          status: 'resolved',
          createdAt: '2026-11-01T00:00:00.000Z',
          resolvedAt: '2026-11-03T00:00:00.000Z',
        }),
      ],
      NOW,
    );
    expect(stats.avgDaysToResolve).toBe(2);
  });

  test('rounds to one decimal place', () => {
    const stats = computeStats(
      [
        ticket({
          status: 'resolved',
          createdAt: '2026-11-01T00:00:00.000Z',
          resolvedAt: '2026-11-01T05:00:00.000Z',
        }),
        ticket({
          status: 'resolved',
          createdAt: '2026-11-01T00:00:00.000Z',
          resolvedAt: '2026-11-01T07:00:00.000Z',
        }),
      ],
      NOW,
    );
    // 5h and 7h → mean 6h → 0.25 days → 0.3.
    expect(stats.avgDaysToResolve).toBe(0.3);
  });
});

describe('computeStats — the month-over-month trend', () => {
  /**
   * The trend line under "reports this month" used to be a FIXED
   * string — "More than last month" — shown regardless of what the
   * data said. These tests pin the replacement: the direction is
   * derived from a real comparison against the previous calendar
   * month.
   */
  test('counts the previous month separately', () => {
    const stats = computeStats(
      [
        ticket({ createdAt: '2026-11-05T00:00:00.000Z' }),
        ticket({ createdAt: '2026-11-08T00:00:00.000Z' }),
        ticket({ createdAt: '2026-10-20T00:00:00.000Z' }),
        ticket({ createdAt: '2026-10-25T00:00:00.000Z' }),
      ],
      NOW,
    );
    expect(stats.reportsThisMonth).toBe(2);
    expect(stats.reportsLastMonth).toBe(2);
  });

  test('reports "up" when this month has more reports', () => {
    const stats = computeStats(
      [
        ticket({ createdAt: '2026-11-05T00:00:00.000Z' }),
        ticket({ createdAt: '2026-11-06T00:00:00.000Z' }),
        ticket({ createdAt: '2026-11-07T00:00:00.000Z' }),
        ticket({ createdAt: '2026-10-20T00:00:00.000Z' }),
      ],
      NOW,
    );
    expect(stats.trend).toBe('up');
  });

  test('reports "down" when this month has fewer reports', () => {
    const stats = computeStats(
      [
        ticket({ createdAt: '2026-11-05T00:00:00.000Z' }),
        ticket({ createdAt: '2026-10-20T00:00:00.000Z' }),
        ticket({ createdAt: '2026-10-21T00:00:00.000Z' }),
        ticket({ createdAt: '2026-10-22T00:00:00.000Z' }),
      ],
      NOW,
    );
    expect(stats.trend).toBe('down');
  });

  test('reports "flat" when the two months hold the same number', () => {
    const stats = computeStats(
      [
        ticket({ createdAt: '2026-11-05T00:00:00.000Z' }),
        ticket({ createdAt: '2026-10-20T00:00:00.000Z' }),
      ],
      NOW,
    );
    expect(stats.trend).toBe('flat');
  });

  test('reports "none" when there is no previous month to compare against', () => {
    // The case a naive signed-number comparison gets wrong: 0 against
    // 0 is the ABSENCE of a comparison, not a flat one. The card must
    // not claim "same as last month" about a month with no data.
    const stats = computeStats(
      [ticket({ createdAt: '2026-11-05T00:00:00.000Z' })],
      NOW,
    );
    expect(stats.reportsLastMonth).toBe(0);
    expect(stats.trend).toBe('none');
    expect(stats.trend).not.toBe('flat');
  });

  test('an empty city reports "none", not "flat"', () => {
    const stats = computeStats([], NOW);
    expect(stats.trend).toBe('none');
  });

  test('the previous month is the calendar month, not a 30-day window', () => {
    // "Last month" has to mean the whole calendar month before this
    // one. A 30-day subtraction would miss the tail of October and
    // count part of September instead.
    const stats = computeStats(
      [
        // 2026-10-01 — first day of last month. Counts.
        ticket({ createdAt: '2026-10-01T00:00:00.000Z' }),
        // 2026-09-30 — two months ago. Does not.
        ticket({ createdAt: '2026-09-30T23:59:59.999Z' }),
      ],
      NOW,
    );
    expect(stats.reportsLastMonth).toBe(1);
  });

  test('the last-month count does not leak into the this-month count', () => {
    const stats = computeStats(
      [
        ticket({ createdAt: '2026-11-05T00:00:00.000Z' }),
        ticket({ createdAt: '2026-10-05T00:00:00.000Z' }),
      ],
      NOW,
    );
    expect(stats.reportsThisMonth).toBe(1);
    expect(stats.reportsLastMonth).toBe(1);
    // The chip counts still cover every ticket.
    expect(stats.counts.all).toBe(2);
  });
});

describe('computeStats — chip counts', () => {
  test('groups the statuses the way the chips claim', () => {
    const stats = computeStats(
      [
        ticket({ status: 'submitted' }),
        ticket({ status: 'submitted' }),
        ticket({ status: 'routed' }),
        ticket({ status: 'in_progress' }),
        ticket({ status: 'resolved' }),
        ticket({ status: 'closed' }),
        ticket({ status: 'cancelled' }),
      ],
      NOW,
    );
    expect(stats.counts).toEqual({
      all: 7,
      new: 3, // submitted + routed
      active: 1, // in_progress
      resolved: 3, // resolved + closed + cancelled
    });
  });

  test('the chip counts cover every ticket exactly once', () => {
    const stats = computeStats(
      [
        ticket({ status: 'submitted' }),
        ticket({ status: 'routed' }),
        ticket({ status: 'in_progress' }),
        ticket({ status: 'resolved' }),
        ticket({ status: 'closed' }),
        ticket({ status: 'cancelled' }),
      ],
      NOW,
    );
    const { all, new: n, active, resolved } = stats.counts;
    expect(n + active + resolved).toBe(all);
  });

  test('the chip counts are city-wide — they include older tickets', () => {
    // The chip counts describe the whole city, not just this month.
    const stats = computeStats(
      [
        ticket({ status: 'submitted', createdAt: '2026-10-01T00:00:00.000Z' }),
        ticket({ status: 'submitted', createdAt: '2026-11-01T00:00:00.000Z' }),
      ],
      NOW,
    );
    expect(stats.counts.all).toBe(2);
    expect(stats.counts.new).toBe(2);
    // Only one of them is in the month window.
    expect(stats.reportsThisMonth).toBe(1);
  });
});
