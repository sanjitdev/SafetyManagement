/**
 * Unit tests for the dispatcher performance service
 * (lib/dispatcher/performance.ts).
 *
 * UX spec 2.7 — "Ward Performance Snapshot". The pure builders
 * carry all the arithmetic (hero deltas, daily buckets, category /
 * status breakdowns, the crew table, the long tail), so this
 * suite pins them with fixture arrays. The DB-facing wrapper
 * (`getPerformanceSnapshot`) is exercised against the real in-memory
 * dev store, the same approach as `list-crew-for-ward.test.ts`.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { getStore, resetStore } from '@/lib/dev-store';
import {
  FEEDBACK_MIN_SAMPLES,
  PERFORMANCE_DEFAULT_DAYS,
  PERFORMANCE_LONG_TAIL_LIMIT,
  PERFORMANCE_MAX_DAYS,
  PERFORMANCE_OPEN_STATUSES,
  PERFORMANCE_STATUS_ORDER,
  buildCategoryBreakdown,
  buildCrewTable,
  buildHeroStats,
  buildLongTail,
  buildPerformanceSnapshot,
  buildStatusBreakdown,
  buildSubmittedVsResolved,
  getPerformanceSnapshot,
  inPerfRange,
  perfDayKey,
  resolvePerfRange,
  toBanglaDigits,
  type PerfCrew,
  type PerfRange,
  type PerfTicket,
} from '@/lib/dispatcher/performance';
import type { SessionContext } from '@/lib/auth/session';
import { rangeContaining } from '../../helpers/perf-range';

beforeEach(() => {
  resetStore();
});

/** A dispatcher session scoped to ward_14 in the seeded city. */
const DISPATCHER_SESSION: SessionContext = {
  sessionId: 'session_test_dispatcher',
  userId: 'user_dispatcher_habib',
  cityId: 'city_dhaka_north',
  wardId: 'ward_14',
  departmentId: null,
  role: 'dispatcher',
};

/** Build a performance-ticket fixture. */
function ticket(overrides: Partial<PerfTicket> = {}): PerfTicket {
  return {
    id: 'ticket_1',
    cityId: 'city_dhaka_north',
    wardId: 'ward_14',
    categoryId: 'cat_pothole',
    status: 'in_progress',
    assignedCrewId: 'user_crew_rashid',
    createdAt: '2026-10-20T08:00:00.000Z',
    updatedAt: '2026-10-20T09:00:00.000Z',
    resolvedAt: null,
    ...overrides,
  };
}

const RANGE: PerfRange = {
  fromIso: '2026-10-20T00:00:00.000Z',
  toIso: '2026-10-20T23:59:59.999Z',
};

/* ------------------------------------------------------------------ */
/* Range resolution                                                   */
/* ------------------------------------------------------------------ */

describe('resolvePerfRange', () => {
  it('defaults to the last 7 days ending now', () => {
    const now = new Date('2026-10-20T12:00:00.000Z');
    const range = resolvePerfRange({ now });
    expect(range.toIso).toBe('2026-10-20T12:00:00.000Z');
    expect(range.fromIso).toBe('2026-10-13T12:00:00.000Z');
  });

  it('honours an explicit from/to pair', () => {
    const range = resolvePerfRange({
      from: '2026-10-01T00:00:00.000Z',
      to: '2026-10-05T00:00:00.000Z',
    });
    expect(range.fromIso).toBe('2026-10-01T00:00:00.000Z');
    expect(range.toIso).toBe('2026-10-05T00:00:00.000Z');
  });

  it('clamps the days parameter into [1, 90]', () => {
    const now = new Date('2026-10-20T12:00:00.000Z');
    expect(resolvePerfRange({ days: 0, now }).fromIso).toBe(
      '2026-10-19T12:00:00.000Z',
    );
    expect(resolvePerfRange({ days: 999, now }).fromIso).toBe(
      new Date(now.getTime() - PERFORMANCE_MAX_DAYS * 86_400_000).toISOString(),
    );
  });

  it('defaults to PERFORMANCE_DEFAULT_DAYS', () => {
    const now = new Date('2026-10-20T12:00:00.000Z');
    const range = resolvePerfRange({ now });
    const days =
      (Date.parse(range.toIso) - Date.parse(range.fromIso)) / 86_400_000;
    expect(days).toBe(PERFORMANCE_DEFAULT_DAYS);
  });
});

describe('perfDayKey / inPerfRange', () => {
  it('returns the YYYY-MM-DD prefix', () => {
    expect(perfDayKey('2026-10-20T09:30:00.000Z')).toBe('2026-10-20');
  });

  it('is inclusive on both ends', () => {
    expect(inPerfRange('2026-10-20T00:00:00.000Z', RANGE)).toBe(true);
    expect(inPerfRange('2026-10-20T23:59:59.999Z', RANGE)).toBe(true);
    expect(inPerfRange('2026-10-19T23:59:59.999Z', RANGE)).toBe(false);
    expect(inPerfRange('2026-10-21T00:00:00.000Z', RANGE)).toBe(false);
  });
});

describe('toBanglaDigits', () => {
  it('converts every ASCII digit', () => {
    expect(toBanglaDigits('14')).toBe('১৪');
    expect(toBanglaDigits('0123456789')).toBe('০১২৩৪৫৬৭৮৯');
  });

  it('leaves non-digit characters untouched', () => {
    expect(toBanglaDigits('ward_14')).toBe('ward_১৪');
    expect(toBanglaDigits('')).toBe('');
  });
});

/* ------------------------------------------------------------------ */
/* Hero stats                                                         */
/* ------------------------------------------------------------------ */

describe('buildHeroStats', () => {
  it('counts the total reports and the delta vs the previous period', () => {
    const hero = buildHeroStats(
      [ticket({ id: 'a' }), ticket({ id: 'b' })],
      [ticket({ id: 'c' })],
    );
    expect(hero.totalReports.value).toBe(2);
    expect(hero.totalReports.delta).toBe(1);
  });

  it('reports a negative delta when the period shrank', () => {
    const hero = buildHeroStats([ticket()], [ticket(), ticket()]);
    expect(hero.totalReports.delta).toBe(-1);
  });

  it('computes the resolution rate as a whole percentage', () => {
    const hero = buildHeroStats(
      [
        ticket({ id: 'a', status: 'resolved' }),
        ticket({ id: 'b', status: 'closed' }),
        ticket({ id: 'c', status: 'submitted' }),
        ticket({ id: 'd', status: 'routed' }),
      ],
      [],
    );
    expect(hero.resolutionRate.value).toBe(50);
    expect(hero.resolutionRate.delta).toBe(50);
  });

  it('reports a zero resolution rate for an empty period', () => {
    const hero = buildHeroStats([], []);
    expect(hero.resolutionRate.value).toBe(0);
  });

  it('averages the creation → resolution time', () => {
    const hero = buildHeroStats(
      [
        ticket({
          id: 'a',
          status: 'resolved',
          createdAt: '2026-10-20T08:00:00.000Z',
          resolvedAt: '2026-10-20T10:00:00.000Z',
        }),
        ticket({
          id: 'b',
          status: 'resolved',
          createdAt: '2026-10-20T08:00:00.000Z',
          resolvedAt: '2026-10-20T12:00:00.000Z',
        }),
      ],
      [],
    );
    // 2 h and 4 h → a 3 h mean.
    expect(hero.avgTimeToResolve.valueMs).toBe(3 * 3_600_000);
    // The delta is only meaningful when the previous period also
    // has an average; with an empty previous period it stays 0.
    expect(hero.avgTimeToResolve.deltaMs).toBe(0);
  });

  it('reports the avg-time delta when both periods have an average', () => {
    const hero = buildHeroStats(
      [
        ticket({
          id: 'a',
          status: 'resolved',
          createdAt: '2026-10-20T08:00:00.000Z',
          resolvedAt: '2026-10-20T10:00:00.000Z',
        }),
      ],
      [
        ticket({
          id: 'b',
          status: 'resolved',
          createdAt: '2026-10-13T08:00:00.000Z',
          resolvedAt: '2026-10-13T12:00:00.000Z',
        }),
      ],
    );
    // 2 h now vs 4 h before → 2 h faster (a negative delta).
    expect(hero.avgTimeToResolve.valueMs).toBe(2 * 3_600_000);
    expect(hero.avgTimeToResolve.deltaMs).toBe(-2 * 3_600_000);
  });

  it('ignores tickets without a resolution timestamp in the average', () => {
    const hero = buildHeroStats(
      [
        ticket({
          id: 'a',
          status: 'resolved',
          createdAt: '2026-10-20T08:00:00.000Z',
          resolvedAt: '2026-10-20T10:00:00.000Z',
        }),
        ticket({ id: 'b', status: 'in_progress', resolvedAt: null }),
      ],
      [],
    );
    expect(hero.avgTimeToResolve.valueMs).toBe(2 * 3_600_000);
  });

  it('reports a zero average when nothing was resolved', () => {
    const hero = buildHeroStats([ticket()], []);
    expect(hero.avgTimeToResolve.valueMs).toBe(0);
    expect(hero.avgTimeToResolve.deltaMs).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* Chart breakdowns                                                    */
/* ------------------------------------------------------------------ */

describe('buildSubmittedVsResolved', () => {
  it('emits one point per day in the range, oldest first', () => {
    const points = buildSubmittedVsResolved([], RANGE);
    expect(points).toHaveLength(1);
    expect(points[0]).toEqual({ date: '2026-10-20', submitted: 0, resolved: 0 });
  });

  it('counts creations on the created day and resolutions on the resolved day', () => {
    const points = buildSubmittedVsResolved(
      [
        ticket({
          id: 'a',
          createdAt: '2026-10-20T08:00:00.000Z',
          resolvedAt: '2026-10-20T10:00:00.000Z',
        }),
      ],
      RANGE,
    );
    expect(points[0].submitted).toBe(1);
    expect(points[0].resolved).toBe(1);
  });

  it('emits zero-filled days so the axis stays continuous', () => {
    const range: PerfRange = {
      fromIso: '2026-10-18T00:00:00.000Z',
      toIso: '2026-10-20T00:00:00.000Z',
    };
    const points = buildSubmittedVsResolved(
      [
        ticket({
          id: 'a',
          createdAt: '2026-10-19T08:00:00.000Z',
          resolvedAt: null,
        }),
      ],
      range,
    );
    expect(points.map((p) => p.date)).toEqual([
      '2026-10-18',
      '2026-10-19',
      '2026-10-20',
    ]);
    expect(points[0].submitted).toBe(0);
    expect(points[1].submitted).toBe(1);
    expect(points[2].submitted).toBe(0);
  });

  it('ignores tickets outside the range', () => {
    const points = buildSubmittedVsResolved(
      [ticket({ createdAt: '2026-10-01T08:00:00.000Z' })],
      RANGE,
    );
    expect(points[0].submitted).toBe(0);
  });
});

describe('buildCategoryBreakdown', () => {
  it('counts per category, highest first', () => {
    const rows = buildCategoryBreakdown([
      ticket({ id: 'a', categoryId: 'cat_pothole' }),
      ticket({ id: 'b', categoryId: 'cat_pothole' }),
      ticket({ id: 'c', categoryId: 'cat_drainage' }),
    ]);
    expect(rows).toEqual([
      { categoryId: 'cat_pothole', count: 2 },
      { categoryId: 'cat_drainage', count: 1 },
    ]);
  });

  it('breaks ties on categoryId for a stable order', () => {
    const rows = buildCategoryBreakdown([
      ticket({ id: 'a', categoryId: 'cat_z' }),
      ticket({ id: 'b', categoryId: 'cat_a' }),
    ]);
    expect(rows.map((r) => r.categoryId)).toEqual(['cat_a', 'cat_z']);
  });

  it('returns [] for an empty ticket set', () => {
    expect(buildCategoryBreakdown([])).toEqual([]);
  });
});

describe('buildStatusBreakdown', () => {
  it('emits every canonical status, even the zero-count ones', () => {
    const rows = buildStatusBreakdown([ticket({ status: 'resolved' })]);
    expect(rows.map((r) => r.status)).toEqual([...PERFORMANCE_STATUS_ORDER]);
    expect(rows.find((r) => r.status === 'resolved')?.count).toBe(1);
    expect(rows.find((r) => r.status === 'submitted')?.count).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* Crew table                                                         */
/* ------------------------------------------------------------------ */

describe('buildCrewTable', () => {
  const crew: PerfCrew[] = [
    { id: 'user_crew_rashid', name: 'Rashid', specialty: 'road' },
    { id: 'user_crew_karim', name: 'Karim', specialty: null },
  ];

  it('counts only resolved/closed jobs as completed', () => {
    const rows = buildCrewTable(
      [
        ticket({ id: 'a', status: 'resolved' }),
        ticket({ id: 'b', status: 'closed' }),
        ticket({ id: 'c', status: 'in_progress' }),
      ],
      crew,
    );
    expect(rows[0].jobsCompleted).toBe(2);
    expect(rows[1].jobsCompleted).toBe(0);
  });

  it('averages the time to resolve over the completed jobs', () => {
    const rows = buildCrewTable(
      [
        ticket({
          id: 'a',
          status: 'resolved',
          createdAt: '2026-10-20T08:00:00.000Z',
          resolvedAt: '2026-10-20T10:00:00.000Z',
        }),
      ],
      crew,
    );
    expect(rows[0].avgTimeToResolveMs).toBe(2 * 3_600_000);
  });

  it('reports a null average when the crew has no timed job', () => {
    const rows = buildCrewTable([], crew);
    expect(rows[0].avgTimeToResolveMs).toBeNull();
  });

  it('suppresses the feedback ratio below the minimum sample count', () => {
    const rows = buildCrewTable([], crew, [
      { crewId: 'user_crew_rashid', positive: 1, negative: 1 },
    ]);
    expect(rows[0].feedbackRatio).toBeNull();
  });

  it('reports the feedback ratio at or above the minimum sample count', () => {
    const rows = buildCrewTable([], crew, [
      {
        crewId: 'user_crew_rashid',
        positive: FEEDBACK_MIN_SAMPLES,
        negative: 0,
      },
    ]);
    expect(rows[0].feedbackRatio).toBe(100);
  });

  it('reports a 0% ratio when every sample is negative', () => {
    const rows = buildCrewTable([], crew, [
      {
        crewId: 'user_crew_rashid',
        positive: 0,
        negative: FEEDBACK_MIN_SAMPLES,
      },
    ]);
    expect(rows[0].feedbackRatio).toBe(0);
  });

  it('carries the specialty through (null when unknown)', () => {
    const rows = buildCrewTable([], crew);
    expect(rows[0].specialty).toBe('road');
    expect(rows[1].specialty).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Long tail                                                          */
/* ------------------------------------------------------------------ */

describe('buildLongTail', () => {
  it('lists only open tickets, oldest first', () => {
    const rows = buildLongTail([
      ticket({
        id: 'newer',
        status: 'submitted',
        createdAt: '2026-10-19T08:00:00.000Z',
      }),
      ticket({
        id: 'older',
        status: 'routed',
        createdAt: '2026-10-10T08:00:00.000Z',
      }),
      ticket({
        id: 'closed',
        status: 'resolved',
        createdAt: '2026-10-01T08:00:00.000Z',
      }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(['older', 'newer']);
  });

  it('excludes every non-open status', () => {
    const rows = buildLongTail([
      ticket({ id: 'a', status: 'resolved' }),
      ticket({ id: 'b', status: 'closed' }),
      ticket({ id: 'c', status: 'cancelled' }),
    ]);
    expect(rows).toEqual([]);
  });

  it('caps the list at PERFORMANCE_LONG_TAIL_LIMIT', () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      ticket({
        id: `ticket_${i}`,
        status: 'submitted',
        createdAt: `2026-10-${String((i % 28) + 1).padStart(2, '0')}T08:00:00.000Z`,
      }),
    );
    expect(buildLongTail(many)).toHaveLength(PERFORMANCE_LONG_TAIL_LIMIT);
  });

  it('resolves the assigned crew name and leaves unassigned rows null', () => {
    const rows = buildLongTail(
      [
        ticket({ id: 'a', assignedCrewId: 'user_crew_rashid' }),
        ticket({ id: 'b', assignedCrewId: null }),
      ],
      { user_crew_rashid: 'Rashid' },
    );
    expect(rows[0].assignedCrewName).toBe('Rashid');
    expect(rows[1].assignedCrewName).toBeNull();
  });

  it('falls back to the crew id when the name is unknown', () => {
    const rows = buildLongTail([ticket({ assignedCrewId: 'user_crew_ghost' })]);
    expect(rows[0].assignedCrewName).toBe('user_crew_ghost');
  });

  it('computes a non-negative age', () => {
    const rows = buildLongTail([
      ticket({ createdAt: '2020-01-01T00:00:00.000Z' }),
    ]);
    expect(rows[0].ageMs).toBeGreaterThan(0);
  });

  it('accepts every open status', () => {
    expect(PERFORMANCE_OPEN_STATUSES).toContain('submitted');
    expect(PERFORMANCE_OPEN_STATUSES).toContain('routed');
    expect(PERFORMANCE_OPEN_STATUSES).toContain('in_progress');
  });
});

/* ------------------------------------------------------------------ */
/* Snapshot assembly                                                  */
/* ------------------------------------------------------------------ */

describe('buildPerformanceSnapshot', () => {
  it('assembles every section from the same ticket set', () => {
    const snapshot = buildPerformanceSnapshot({
      current: [
        ticket({ id: 'a', status: 'resolved', resolvedAt: '2026-10-20T10:00:00.000Z' }),
        ticket({ id: 'b', status: 'in_progress' }),
      ],
      previous: [],
      range: RANGE,
      crew: [{ id: 'user_crew_rashid', name: 'Rashid', specialty: 'road' }],
      crewNames: { user_crew_rashid: 'Rashid' },
    });

    expect(snapshot.hero.totalReports.value).toBe(2);
    expect(snapshot.submittedVsResolved).toHaveLength(1);
    expect(snapshot.categoryBreakdown).toHaveLength(1);
    expect(snapshot.statusBreakdown).toHaveLength(PERFORMANCE_STATUS_ORDER.length);
    expect(snapshot.crewTable).toHaveLength(1);
    expect(snapshot.longTail).toHaveLength(1);
    expect(snapshot.range).toEqual(RANGE);
  });

  it('defaults the ward block to nulls when none is supplied', () => {
    const snapshot = buildPerformanceSnapshot({
      current: [],
      previous: [],
      range: RANGE,
      crew: [],
    });
    expect(snapshot.ward).toEqual({
      wardId: null,
      wardLabel: null,
      wardLabelBn: null,
    });
  });
});

/* ------------------------------------------------------------------ */
/* DB-facing wrapper                                                  */
/* ------------------------------------------------------------------ */

describe('getPerformanceSnapshot', () => {
  it('returns a snapshot scoped to the dispatcher ward', async () => {
    const snapshot = await getPerformanceSnapshot(DISPATCHER_SESSION);
    expect(snapshot.ward.wardId).toBe('ward_14');
    // The label is the bare ward NUMBER — the page header's
    // "Ward {ward}" template supplies the surrounding word.
    expect(snapshot.ward.wardLabel).toBe('14');
    expect(snapshot.ward.wardLabelBn).toBe('১৪');
    expect(Array.isArray(snapshot.crewTable)).toBe(true);
    expect(snapshot.crewTable.every((c) => c.crewId !== 'user_crew_jamal')).toBe(
      true,
    );
  });

  it('echoes the requested range back', async () => {
    const snapshot = await getPerformanceSnapshot(DISPATCHER_SESSION, {
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-30T00:00:00.000Z',
    });
    expect(snapshot.range.fromIso).toBe('2026-09-01T00:00:00.000Z');
    expect(snapshot.range.toIso).toBe('2026-09-30T00:00:00.000Z');
  });

  it('builds a daily series that spans the requested range', async () => {
    const snapshot = await getPerformanceSnapshot(DISPATCHER_SESSION, {
      from: '2026-10-14T00:00:00.000Z',
      to: '2026-10-20T00:00:00.000Z',
    });
    expect(snapshot.submittedVsResolved.length).toBeGreaterThan(1);
    expect(snapshot.submittedVsResolved[0].date).toBe('2026-10-14');
  });

  it('excludes tickets created before the range', async () => {
    const snapshot = await getPerformanceSnapshot(DISPATCHER_SESSION, {
      from: '2026-10-19T00:00:00.000Z',
      to: '2026-10-20T00:00:00.000Z',
    });
    // The seeded tickets are 1–20 days old; the closed one (20 days)
    // and the resolved one (10 days) fall outside a 2-day window.
    expect(snapshot.hero.totalReports.value).toBeLessThanOrEqual(4);
  });

  /* ---------------------------------------------------------------- */
  /* WO-002 — the citizen feedback aggregate                           */
  /* ---------------------------------------------------------------- */

  it('reports a zero feedback tally when no ticket carries feedback', async () => {
    const snapshot = await getPerformanceSnapshot(DISPATCHER_SESSION);
    for (const row of snapshot.crewTable) {
      expect(row.positiveFeedback).toBe(0);
      expect(row.negativeFeedback).toBe(0);
      // Fewer than FEEDBACK_MIN_SAMPLES samples → the ratio is
      // suppressed ("not enough data").
      expect(row.feedbackRatio).toBeNull();
    }
  });

  it('aggregates the persisted feedback into the crew table', async () => {
    // Give the seeded resolved ticket a positive rating from its
    // assigned crew. The seeded resolved ticket is assigned to the
    // ward's crew (user_crew_karim — drainage is `dept_roads`,
    // so it goes to the roads crew, not the streetlight crew).
    const store = getStore();
    const resolved = store.tickets.get('ticket_seed_resolved_1');
    expect(resolved?.assignedCrewId).toBeTruthy();
    store.tickets.set('ticket_seed_resolved_1', {
      ...resolved!,
      feedback: '{"rating":"positive"}',
    });

    // The range is derived from the ticket's OWN createdAt. A
    // hard-coded October window would silently fall behind the
    // wall-clock-seeded dev store and drop the ticket out of
    // the current period, reading the tally as 0.
    const snapshot = await getPerformanceSnapshot(
      DISPATCHER_SESSION,
      rangeContaining(resolved!.createdAt),
    );

    const row = snapshot.crewTable.find(
      (c) => c.crewId === resolved!.assignedCrewId,
    );
    expect(row).toBeDefined();
    expect(row!.positiveFeedback).toBe(1);
    expect(row!.negativeFeedback).toBe(0);
    // One sample is below FEEDBACK_MIN_SAMPLES → the ratio stays
    // suppressed, but the raw counts are now truthful.
    expect(row!.feedbackRatio).toBeNull();
  });

  it('reports a ratio once the crew clears the minimum sample count', async () => {
    const store = getStore();
    const base = store.tickets.get('ticket_seed_resolved_1')!;
    const crewId = base.assignedCrewId!;
    // Plant FEEDBACK_MIN_SAMPLES positive tickets for the same crew,
    // created INSIDE the requested range so they land in the current
    // period (the aggregate reads the current period only).
    const range = rangeContaining(base.createdAt);
    const created = base.createdAt;
    for (let i = 0; i < FEEDBACK_MIN_SAMPLES; i += 1) {
      const id = `ticket_fb_${i}`;
      store.tickets.set(id, {
        ...base,
        id,
        feedback: '{"rating":"positive"}',
        createdAt: created,
        updatedAt: created,
        resolvedAt: created,
      });
    }

    const snapshot = await getPerformanceSnapshot(DISPATCHER_SESSION, range);

    const row = snapshot.crewTable.find((c) => c.crewId === crewId);
    expect(row).toBeDefined();
    expect(row!.positiveFeedback).toBeGreaterThanOrEqual(FEEDBACK_MIN_SAMPLES);
    expect(row!.feedbackRatio).toBe(100);
  });

  it('ignores neutral feedback in the crew tally', async () => {
    const store = getStore();
    const base = store.tickets.get('ticket_seed_resolved_1')!;
    store.tickets.set('ticket_seed_resolved_1', {
      ...base,
      feedback: '{"rating":"neutral"}',
    });

    const snapshot = await getPerformanceSnapshot(
      DISPATCHER_SESSION,
      rangeContaining(base.createdAt),
    );

    const row = snapshot.crewTable.find(
      (c) => c.crewId === base.assignedCrewId,
    );
    expect(row).toBeDefined();
    expect(row!.positiveFeedback).toBe(0);
    expect(row!.negativeFeedback).toBe(0);
  });
});
