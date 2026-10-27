/**
 * Unit tests for the 4.7 adoption-dashboard domain logic
 * (`lib/admin/adoption.ts`).
 *
 * Pure logic — no DB, no Next runtime. Covers the hero deltas, the
 * funnel, the daily series, the ward heatmap, the engagement signals,
 * the health flags and the CSV export rows.
 */

import { describe, expect, it } from 'vitest';
import {
  averageResolveDuration,
  buildAdoptionCsvRows,
  buildAdoptionDashboard,
  buildDailySeries,
  buildEngagementSignals,
  buildFunnel,
  buildHeroStats,
  buildHealthFlags,
  buildWardActivity,
  dateRangeKeys,
  inRange,
  median,
  percentDelta,
  shiftDays,
  toDateKey,
  toIso,
  type AdoptionStaffRow,
  type AdoptionTicketRow,
  type AdoptionTrailRow,
  type AdoptionWardRow,
} from '@/lib/admin/adoption';

const WARDS: AdoptionWardRow[] = [
  { id: 'ward_14', number: 14, name: 'Mirpur 14', nameBn: 'মিরপুর ১৪' },
  { id: 'ward_15', number: 15, name: 'Mirpur 15', nameBn: 'মিরপুর ১৫' },
];

function ticket(
  overrides: Partial<AdoptionTicketRow> = {},
): AdoptionTicketRow {
  return {
    id: 't1',
    cityId: 'city_1',
    wardId: 'ward_14',
    reporterId: 'citizen_1',
    status: 'submitted',
    assignedCrewId: null,
    createdAt: '2026-10-10T00:00:00.000Z',
    updatedAt: null,
    resolvedAt: null,
    feedback: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

describe('helpers', () => {
  it('normalises a timestamp to ISO', () => {
    expect(toIso('2026-10-10T00:00:00.000Z')).toBe('2026-10-10T00:00:00.000Z');
    expect(toIso(new Date('2026-10-10T00:00:00.000Z'))).toBe(
      '2026-10-10T00:00:00.000Z',
    );
    expect(toIso(null)).toBeNull();
    expect(toIso('not a date')).toBeNull();
  });

  it('derives a UTC date key', () => {
    expect(toDateKey('2026-10-10T13:45:00.000Z')).toBe('2026-10-10');
  });

  it('checks an inclusive range', () => {
    expect(
      inRange('2026-10-10T00:00:00.000Z', '2026-10-01T00:00:00.000Z', '2026-10-31T00:00:00.000Z'),
    ).toBe(true);
    expect(
      inRange('2026-11-10T00:00:00.000Z', '2026-10-01T00:00:00.000Z', '2026-10-31T00:00:00.000Z'),
    ).toBe(false);
  });

  it('shifts by whole days', () => {
    expect(shiftDays('2026-10-10T00:00:00.000Z', 7)).toBe(
      '2026-10-03T00:00:00.000Z',
    );
  });

  it('produces a stable, capped date-key series', () => {
    const keys = dateRangeKeys(
      '2026-10-01T00:00:00.000Z',
      '2026-10-05T00:00:00.000Z',
    );
    expect(keys).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
      '2026-10-05',
    ]);
    // An inverted range produces nothing.
    expect(
      dateRangeKeys('2026-10-05T00:00:00.000Z', '2026-10-01T00:00:00.000Z'),
    ).toEqual([]);
    // The series is capped at 180 days.
    expect(
      dateRangeKeys('2020-01-01T00:00:00.000Z', '2026-10-05T00:00:00.000Z').length,
    ).toBe(180);
  });

  it('computes a median, including for an even-length list', () => {
    expect(median([])).toBeNull();
    expect(median([3])).toBe(3);
    expect(median([1, 3, 5])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});

// ---------------------------------------------------------------------------
// Hero stats
// ---------------------------------------------------------------------------

describe('percent delta', () => {
  it('is null when there is no baseline', () => {
    expect(percentDelta(0, 0)).toBe(0);
    expect(percentDelta(5, 0)).toBeNull();
  });

  it('computes the percentage change', () => {
    expect(percentDelta(120, 100)).toBe(20);
    expect(percentDelta(80, 100)).toBe(-20);
  });
});

describe('hero stats', () => {
  it('produces the four 4.7 cards with their deltas', () => {
    const hero = buildHeroStats(
      {
        registeredCitizens: 120,
        reportsReceived: 50,
        resolved: 40,
        resolutionRate: 80,
        avgResolveMs: 3_600_000,
      },
      {
        registeredCitizens: 100,
        reportsReceived: 50,
        resolved: 25,
        resolutionRate: 50,
        avgResolveMs: 7_200_000,
      },
    );
    expect(hero.map((h) => h.key)).toEqual([
      'registeredCitizens',
      'reportsReceived',
      'resolutionRate',
      'avgTimeToResolve',
    ]);
    expect(hero[0].deltaPercent).toBe(20);
    // 80% vs 50% ⇒ +60% relative.
    expect(hero[2].deltaPercent).toBe(60);
    // A shorter average resolve time is an improvement, so the delta
    // is inverted.
    expect(hero[3].deltaPercent).toBe(50);
    expect(hero[3].unit).toBe('duration');
  });
});

// ---------------------------------------------------------------------------
// Funnel
// ---------------------------------------------------------------------------

describe('funnel', () => {
  it('computes the conversion from the previous stage', () => {
    const funnel = buildFunnel({
      visitors: 200,
      registered: 100,
      submitted: 60,
      secondReport: 20,
      feedback: 10,
    });
    expect(funnel.map((f) => f.key)).toEqual([
      'visit',
      'registered',
      'submitted',
      'secondReport',
      'feedback',
    ]);
    expect(funnel[0].conversion).toBeNull();
    expect(funnel[1].conversion).toBe(0.5);
    expect(funnel[2].conversion).toBe(0.6);
    expect(funnel[3].conversion).toBe(0.333);
    expect(funnel[4].conversion).toBe(0.5);
  });

  it('leaves the conversion null when the previous stage is empty', () => {
    const funnel = buildFunnel({
      visitors: 0,
      registered: 0,
      submitted: 5,
      secondReport: 0,
      feedback: 0,
    });
    expect(funnel[1].conversion).toBeNull();
    expect(funnel[2].conversion).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Daily series + heatmap
// ---------------------------------------------------------------------------

describe('daily series', () => {
  it('counts submitted, resolved and registered per day', () => {
    const series = buildDailySeries(
      [
        ticket({ id: 't1', createdAt: '2026-10-01T10:00:00.000Z' }),
        ticket({
          id: 't2',
          createdAt: '2026-10-01T12:00:00.000Z',
          resolvedAt: '2026-10-02T09:00:00.000Z',
        }),
        ticket({ id: 't3', createdAt: '2026-10-03T10:00:00.000Z' }),
      ],
      [{ createdAt: '2026-10-01T08:00:00.000Z' }],
      '2026-10-01T00:00:00.000Z',
      '2026-10-03T23:59:59.999Z',
    );
    expect(series).toHaveLength(3);
    expect(series[0]).toEqual({
      date: '2026-10-01',
      submitted: 2,
      resolved: 0,
      registered: 1,
    });
    expect(series[1].resolved).toBe(1);
    expect(series[2].submitted).toBe(1);
  });

  it('emits a zero row for days with no activity', () => {
    const series = buildDailySeries([], [], '2026-10-01T00:00:00.000Z', '2026-10-02T00:00:00.000Z');
    expect(series).toHaveLength(2);
    expect(series[0].submitted).toBe(0);
  });
});

describe('ward activity', () => {
  it('counts the reports per ward and normalises the intensity', () => {
    const activity = buildWardActivity(
      [
        ticket({ id: 't1', wardId: 'ward_14' }),
        ticket({ id: 't2', wardId: 'ward_14' }),
        ticket({ id: 't3', wardId: 'ward_15' }),
      ],
      WARDS,
    );
    expect(activity).toHaveLength(2);
    expect(activity[0].wardNumber).toBe(14);
    expect(activity[0].reports).toBe(2);
    expect(activity[0].intensity).toBe(1);
    expect(activity[1].reports).toBe(1);
    expect(activity[1].intensity).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// Engagement signals
// ---------------------------------------------------------------------------

describe('engagement signals', () => {
  const staff: AdoptionStaffRow[] = [
    { id: 's1', role: 'dispatcher' },
    { id: 's2', role: 'crew' },
  ];

  it('computes the staff activity percentage from the sessions', () => {
    const signals = buildEngagementSignals({
      staff,
      sessions: [
        {
          userId: 's1',
          lastSeenAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        },
      ],
      tickets: [],
      trail: [],
    });
    expect(signals[0].key).toBe('staffActivity');
    expect(signals[0].value).toBe(50);
    expect(signals[0].detail).toEqual({ active: 1, total: 2 });
  });

  it('computes the citizen retention percentage from a 2nd report', () => {
    const signals = buildEngagementSignals({
      staff: [],
      sessions: [],
      tickets: [
        ticket({ id: 't1', reporterId: 'c1', createdAt: '2026-10-01T00:00:00.000Z' }),
        ticket({ id: 't2', reporterId: 'c1', createdAt: '2026-10-10T00:00:00.000Z' }),
        ticket({ id: 't3', reporterId: 'c2', createdAt: '2026-10-01T00:00:00.000Z' }),
        ticket({ id: 't4', reporterId: 'c2', createdAt: '2026-12-01T00:00:00.000Z' }),
      ],
      trail: [],
    });
    expect(signals[1].key).toBe('citizenRetention');
    // c1's 2nd report was 9 days later ⇒ retained. c2's was 61 days
    // later ⇒ not retained.
    expect(signals[1].value).toBe(50);
  });

  it('computes the median crew response time from the trail', () => {
    const trail: AdoptionTrailRow[] = [
      { ticketId: 't1', toStatus: 'routed', timestamp: '2026-10-01T00:00:00.000Z' },
      { ticketId: 't1', toStatus: 'in_progress', timestamp: '2026-10-01T01:00:00.000Z' },
    ];
    const signals = buildEngagementSignals({
      staff: [],
      sessions: [],
      tickets: [ticket({ id: 't1' })],
      trail,
    });
    expect(signals[2].key).toBe('crewResponseTime');
    expect(signals[2].value).toBe(3_600_000);
    expect(signals[2].unit).toBe('duration');
  });
});

// ---------------------------------------------------------------------------
// Health flags
// ---------------------------------------------------------------------------

describe('health flags', () => {
  it('flags a dispatcher who has not signed in for 7+ days', () => {
    const flags = buildHealthFlags({
      staffLastSeen: [
        { id: 's1', role: 'dispatcher', lastSeenAt: null },
        { id: 's2', role: 'dispatcher', lastSeenAt: new Date().toISOString() },
      ],
      unassignedOlderThan: 0,
      unassignedCount: 0,
      silentWards: [],
      cityId: 'city_1',
    });
    expect(flags).toHaveLength(1);
    expect(flags[0].key).toBe('stale_dispatchers');
    expect(flags[0].vars.count).toBe(1);
    expect(flags[0].href).toContain('/admin/cities/city_1/users');
  });

  it('flags an unassigned backlog older than 7 days', () => {
    const flags = buildHealthFlags({
      staffLastSeen: [],
      unassignedOlderThan: 9,
      unassignedCount: 12,
      silentWards: [],
      cityId: 'city_1',
    });
    expect(flags[0].key).toBe('unassigned_backlog');
    expect(flags[0].vars).toEqual({ count: 12, days: 9 });
  });

  it('flags a silent ward', () => {
    const flags = buildHealthFlags({
      staffLastSeen: [],
      unassignedOlderThan: 0,
      unassignedCount: 0,
      silentWards: [{ wardNumber: 22, days: 14 }],
      cityId: 'city_1',
    });
    expect(flags[0].key).toBe('silent_ward_22');
    expect(flags[0].vars).toEqual({ ward: 22, days: 14 });
  });

  it('produces no flags for a healthy city', () => {
    const flags = buildHealthFlags({
      staffLastSeen: [
        { id: 's1', role: 'dispatcher', lastSeenAt: new Date().toISOString() },
      ],
      unassignedOlderThan: 0,
      unassignedCount: 0,
      silentWards: [],
      cityId: 'city_1',
    });
    expect(flags).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Average resolve duration
// ---------------------------------------------------------------------------

describe('average resolve duration', () => {
  it('averages the resolved-at minus created-at gap', () => {
    const ms = averageResolveDuration([
      ticket({
        createdAt: '2026-10-01T00:00:00.000Z',
        resolvedAt: '2026-10-01T02:00:00.000Z',
      }),
      ticket({
        createdAt: '2026-10-01T00:00:00.000Z',
        resolvedAt: '2026-10-01T04:00:00.000Z',
      }),
    ]);
    expect(ms).toBe(3 * 3_600_000);
  });

  it('is null when nothing is resolved', () => {
    expect(averageResolveDuration([ticket()])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Full dashboard
// ---------------------------------------------------------------------------

describe('buildAdoptionDashboard', () => {
  const input = {
    cityId: 'city_1',
    citySlug: 'dhaka-north',
    fromIso: '2026-10-01T00:00:00.000Z',
    toIso_: '2026-10-10T00:00:00.000Z',
    tickets: [
      ticket({
        id: 't1',
        createdAt: '2026-10-02T00:00:00.000Z',
        resolvedAt: '2026-10-03T00:00:00.000Z',
        status: 'resolved',
        feedback: 'ধন্যবাদ',
      }),
      ticket({ id: 't2', createdAt: '2026-10-04T00:00:00.000Z' }),
    ],
    citizens: [{ id: 'c1', createdAt: '2026-10-02T00:00:00.000Z' }],
    staff: [{ id: 's1', role: 'dispatcher' }],
    sessions: [
      {
        userId: 's1',
        lastSeenAt: '2026-10-09T00:00:00.000Z',
        expiresAt: '2026-11-09T00:00:00.000Z',
      },
    ],
    trail: [],
    wards: WARDS,
    comparisonCity: null,
    comparisonTickets: [],
    comparisonCitizens: [],
  };

  it('assembles every section of the dashboard', () => {
    const dash = buildAdoptionDashboard(input);
    expect(dash.hero).toHaveLength(4);
    expect(dash.funnel).toHaveLength(5);
    expect(dash.daily.length).toBeGreaterThan(0);
    expect(dash.wards).toHaveLength(2);
    expect(dash.engagement).toHaveLength(3);
    expect(dash.comparison).toBeNull();
  });

  it('counts the "provided feedback" funnel stage from `Ticket.feedback`', () => {
    const dash = buildAdoptionDashboard(input);
    const feedbackStage = dash.funnel.find((f) => f.key === 'feedback');
    // Only t1 carries a feedback text.
    expect(feedbackStage?.count).toBe(1);
  });

  it('builds the Dhaka overlay when a comparison city is supplied', () => {
    const dash = buildAdoptionDashboard({
      ...input,
      comparisonCity: {
        id: 'city_dhaka',
        slug: 'dhaka-north',
        name: 'Dhaka North',
        nameBn: 'ঢাকা উত্তর',
      },
      comparisonTickets: [
        ticket({ id: 'd1', cityId: 'city_dhaka', createdAt: '2026-10-02T00:00:00.000Z' }),
      ],
      comparisonCitizens: [{ id: 'dc1', createdAt: '2026-10-02T00:00:00.000Z' }],
    });
    expect(dash.comparison).not.toBeNull();
    expect(dash.comparison?.reportsReceived).toBe(1);
    expect(dash.comparison?.registeredCitizens).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

describe('CSV export rows', () => {
  it('emits one row per day of the daily series', () => {
    const dash = buildAdoptionDashboard({
      cityId: 'city_1',
      citySlug: 'dhaka-north',
      fromIso: '2026-10-01T00:00:00.000Z',
      toIso_: '2026-10-03T00:00:00.000Z',
      tickets: [ticket({ createdAt: '2026-10-02T00:00:00.000Z' })],
      citizens: [],
      staff: [],
      sessions: [],
      trail: [],
      wards: WARDS,
      comparisonCity: null,
      comparisonTickets: [],
      comparisonCitizens: [],
    });
    const { header, rows } = buildAdoptionCsvRows(dash);
    expect(header).toEqual([
      'date',
      'reports_submitted',
      'reports_resolved',
      'citizens_registered',
    ]);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual(['2026-10-02', 1, 0, 0]);
  });
});
