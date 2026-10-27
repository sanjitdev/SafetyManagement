/**
 * Unit tests for the dispatcher monitor service
 * (lib/dispatcher/monitor.ts).
 *
 * UX spec 2.5 — "Monitor Updates". The service is split into pure
 * builders (rows + charts) and a DB-facing read/ack pair. This
 * suite pins the pure builders with fixture arrays and exercises
 * the DB-facing pair against the real in-memory dev store (the
 * same approach as `list-crew-for-ward.test.ts` — no mocks, so
 * the facade wiring is covered too).
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { getStore, resetStore } from '@/lib/dev-store';
import {
  MONITOR_FILTERS,
  MONITOR_TRAIL_STEPS,
  MONITOR_WATCHED_STATUSES,
  acknowledgeMonitorUpdate,
  buildCrewLoad,
  buildFlowChart,
  buildMonitorCharts,
  buildMonitorRows,
  buildResponseSparkline,
  clampMonitorLimit,
  compareByUpdatedAtDesc,
  isoDayKey,
  listMonitorTickets,
  normalizeMonitorFilter,
  type WatchedTicket,
} from '@/lib/dispatcher/monitor';
import type { SessionContext } from '@/lib/auth/session';

beforeEach(() => {
  resetStore();
});

/**
 * Every seeded ticket lives in ward_14, so the cross-ward cases
 * need a ticket planted in another ward. The dev store exposes the
 * raw store, so the test writes one directly.
 */
const CROSS_WARD_TICKET_ID = 'ticket_test_ward_other_1';

function plantCrossWardTicket(): void {
  const store = getStore();
  const now = new Date().toISOString();
  store.tickets.set(CROSS_WARD_TICKET_ID, {
    id: CROSS_WARD_TICKET_ID,
    cityId: 'city_dhaka_north',
    wardId: 'ward_other',
    categoryId: 'cat_other',
    reporterId: 'user_citizen_rahim',
    assignedCrewId: 'user_crew_jamal',
    status: 'in_progress',
    locationLng: 90.4,
    locationLat: 23.8,
    locationLabel: 'Other ward',
    locationLabelBn: 'অন্য ওয়ার্ড',
    note: 'Cross-ward test ticket.',
    internalNote: null,
    duplicateOfId: null,
    closeReason: null,
    createdAt: now,
    updatedAt: now,
    resolvedAt: null,
  });
}

/** A dispatcher session scoped to ward_14 in the seeded city. */
const DISPATCHER_SESSION: SessionContext = {
  sessionId: 'session_test_dispatcher',
  userId: 'user_dispatcher_habib',
  cityId: 'city_dhaka_north',
  wardId: 'ward_14',
  departmentId: null,
  role: 'dispatcher',
};

/** Build a watched-ticket fixture. */
function ticket(overrides: Partial<WatchedTicket> = {}): WatchedTicket {
  return {
    id: 'ticket_1',
    cityId: 'city_dhaka_north',
    wardId: 'ward_14',
    categoryId: 'cat_pothole',
    status: 'in_progress',
    assignedCrewId: 'user_crew_rashid',
    createdAt: '2026-10-20T08:00:00.000Z',
    updatedAt: '2026-10-20T09:00:00.000Z',
    wardName: 'Ward 14',
    photoUrls: [],
    trail: [],
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* Pure helpers                                                        */
/* ------------------------------------------------------------------ */

describe('clampMonitorLimit', () => {
  it('defaults to 50 when the limit is absent or not finite', () => {
    expect(clampMonitorLimit(undefined)).toBe(50);
    expect(clampMonitorLimit(Number.NaN)).toBe(50);
    expect(clampMonitorLimit(Number.POSITIVE_INFINITY)).toBe(50);
  });

  it('clamps into the [1, 200] band and floors fractions', () => {
    expect(clampMonitorLimit(0)).toBe(1);
    expect(clampMonitorLimit(-5)).toBe(1);
    expect(clampMonitorLimit(999)).toBe(200);
    expect(clampMonitorLimit(12.9)).toBe(12);
  });

  it('passes a valid limit through unchanged', () => {
    expect(clampMonitorLimit(1)).toBe(1);
    expect(clampMonitorLimit(75)).toBe(75);
    expect(clampMonitorLimit(200)).toBe(200);
  });
});

describe('normalizeMonitorFilter', () => {
  it('accepts every declared filter', () => {
    for (const f of MONITOR_FILTERS) {
      expect(normalizeMonitorFilter(f)).toBe(f);
    }
  });

  it('falls back to "all" for unknown or missing values', () => {
    expect(normalizeMonitorFilter(undefined)).toBe('all');
    expect(normalizeMonitorFilter('')).toBe('all');
    expect(normalizeMonitorFilter('nonsense')).toBe('all');
  });
});

describe('compareByUpdatedAtDesc', () => {
  it('sorts the newer timestamp first', () => {
    const older = { updatedAt: '2026-10-20T08:00:00.000Z' };
    const newer = { updatedAt: '2026-10-20T09:00:00.000Z' };
    expect(compareByUpdatedAtDesc(newer, older)).toBeLessThan(0);
    expect(compareByUpdatedAtDesc(older, newer)).toBeGreaterThan(0);
  });

  it('returns 0 for equal timestamps', () => {
    const a = { updatedAt: '2026-10-20T08:00:00.000Z' };
    const b = { updatedAt: '2026-10-20T08:00:00.000Z' };
    expect(compareByUpdatedAtDesc(a, b)).toBe(0);
  });
});

describe('isoDayKey', () => {
  it('returns the YYYY-MM-DD prefix of an ISO timestamp', () => {
    expect(isoDayKey('2026-10-20T09:30:00.000Z')).toBe('2026-10-20');
  });
});

/* ------------------------------------------------------------------ */
/* Row building                                                        */
/* ------------------------------------------------------------------ */

describe('buildMonitorRows', () => {
  it('derives the latest activity from the newest trail step', () => {
    const rows = buildMonitorRows([
      ticket({
        trail: [
          {
            toStatus: 'routed',
            actorId: 'user_dispatcher_habib',
            actorRole: 'dispatcher',
            note: null,
            timestamp: '2026-10-20T08:10:00.000Z',
          },
          {
            toStatus: 'in_progress',
            actorId: 'user_crew_rashid',
            actorRole: 'crew',
            note: 'on the way',
            timestamp: '2026-10-20T09:00:00.000Z',
          },
        ],
      }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].latestActivity.toStatus).toBe('in_progress');
    expect(rows[0].latestActivity.actorId).toBe('user_crew_rashid');
    expect(rows[0].latestActivity.timestamp).toBe('2026-10-20T09:00:00.000Z');
  });

  it('marks a row with a trail step and no read marker as unread', () => {
    const rows = buildMonitorRows([
      ticket({
        trail: [
          {
            toStatus: 'routed',
            actorId: 'user_dispatcher_habib',
            actorRole: 'dispatcher',
            note: null,
            timestamp: '2026-10-20T08:10:00.000Z',
          },
        ],
      }),
    ]);
    expect(rows[0].latestActivity.unread).toBe(true);
  });

  it('marks a row as read when the marker is newer than the activity', () => {
    const rows = buildMonitorRows(
      [
        ticket({
          trail: [
            {
              toStatus: 'routed',
              actorId: 'user_dispatcher_habib',
              actorRole: 'dispatcher',
              note: null,
              timestamp: '2026-10-20T08:10:00.000Z',
            },
          ],
        }),
      ],
      { lastReadAt: { ticket_1: '2026-10-20T09:00:00.000Z' } },
    );
    expect(rows[0].latestActivity.unread).toBe(false);
  });

  it('keeps a row unread when the activity is newer than the marker', () => {
    const rows = buildMonitorRows(
      [
        ticket({
          trail: [
            {
              toStatus: 'routed',
              actorId: 'user_dispatcher_habib',
              actorRole: 'dispatcher',
              note: null,
              timestamp: '2026-10-20T10:00:00.000Z',
            },
          ],
        }),
      ],
      { lastReadAt: { ticket_1: '2026-10-20T09:00:00.000Z' } },
    );
    expect(rows[0].latestActivity.unread).toBe(true);
  });

  it('treats a ticket with no trail as read and falls back to updatedAt', () => {
    const rows = buildMonitorRows([
      ticket({ updatedAt: '2026-10-20T09:00:00.000Z' }),
    ]);
    expect(rows[0].latestActivity.unread).toBe(false);
    expect(rows[0].latestActivity.toStatus).toBeNull();
    expect(rows[0].updatedAt).toBe('2026-10-20T09:00:00.000Z');
  });

  it('keeps only the last 3 trail steps, oldest first', () => {
    const trail = [1, 2, 3, 4, 5].map((n) => ({
      toStatus: 'routed',
      actorId: 'user_dispatcher_habib',
      actorRole: 'dispatcher' as const,
      note: null,
      timestamp: `2026-10-20T0${n}:00:00.000Z`,
    }));
    const rows = buildMonitorRows([ticket({ trail })]);
    expect(rows[0].trail).toHaveLength(MONITOR_TRAIL_STEPS);
    expect(rows[0].trail[0].timestamp).toBe('2026-10-20T03:00:00.000Z');
    expect(rows[0].trail[2].timestamp).toBe('2026-10-20T05:00:00.000Z');
  });

  it('sorts the rows by most-recently-updated first', () => {
    const rows = buildMonitorRows([
      ticket({ id: 'older', updatedAt: '2026-10-20T08:00:00.000Z' }),
      ticket({ id: 'newer', updatedAt: '2026-10-20T11:00:00.000Z' }),
      ticket({ id: 'middle', updatedAt: '2026-10-20T09:00:00.000Z' }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(['newer', 'middle', 'older']);
  });

  it('uses the last photo as the thumbnail and counts the photos', () => {
    const rows = buildMonitorRows([
      ticket({ photoUrls: ['https://cdn/a.jpg', 'https://cdn/b.jpg'] }),
    ]);
    expect(rows[0].thumbnailUrl).toBe('https://cdn/b.jpg');
    expect(rows[0].photoCount).toBe(2);
  });

  it('reports a null thumbnail when there are no photos', () => {
    const rows = buildMonitorRows([ticket({ photoUrls: [] })]);
    expect(rows[0].thumbnailUrl).toBeNull();
    expect(rows[0].photoCount).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* Chart building                                                      */
/* ------------------------------------------------------------------ */

describe('buildFlowChart', () => {
  it('emits one segment per watched status, in canonical order', () => {
    const chart = buildFlowChart([
      ticket({ id: 'a', status: 'submitted' }),
      ticket({ id: 'b', status: 'in_progress' }),
      ticket({ id: 'c', status: 'in_progress' }),
    ]);

    expect(chart.segments.map((s) => s.status)).toEqual([
      ...MONITOR_WATCHED_STATUSES,
    ]);
    expect(chart.total).toBe(3);
    const byStatus = Object.fromEntries(
      chart.segments.map((s) => [s.status, s.count]),
    );
    expect(byStatus.submitted).toBe(1);
    expect(byStatus.in_progress).toBe(2);
    expect(byStatus.routed).toBe(0);
  });

  it('returns a zeroed chart for an empty ticket set', () => {
    const chart = buildFlowChart([]);
    expect(chart.total).toBe(0);
    expect(chart.segments.every((s) => s.count === 0)).toBe(true);
  });
});

describe('buildResponseSparkline', () => {
  const now = new Date('2026-10-20T12:00:00.000Z');

  it('emits exactly `days` points, oldest first', () => {
    const spark = buildResponseSparkline([], { days: 7, now });
    expect(spark.points).toHaveLength(7);
    expect(spark.points[0].date).toBe('2026-10-14');
    expect(spark.points[6].date).toBe('2026-10-20');
  });

  it('averages the creation → first-move gap for the day', () => {
    const spark = buildResponseSparkline(
      [
        ticket({
          createdAt: '2026-10-20T08:00:00.000Z',
          trail: [
            {
              toStatus: 'in_progress',
              actorId: 'user_crew_rashid',
              actorRole: 'crew',
              note: null,
              timestamp: '2026-10-20T08:30:00.000Z',
            },
          ],
        }),
        ticket({
          id: 'ticket_2',
          createdAt: '2026-10-20T09:00:00.000Z',
          trail: [
            {
              toStatus: 'in_progress',
              actorId: 'user_crew_karim',
              actorRole: 'crew',
              note: null,
              timestamp: '2026-10-20T10:00:00.000Z',
            },
          ],
        }),
      ],
      { days: 1, now },
    );

    const today = spark.points[0];
    expect(today.samples).toBe(2);
    expect(today.avgMinutes).toBe(45);
  });

  it('ignores a "submitted" step when measuring the first move', () => {
    const spark = buildResponseSparkline(
      [
        ticket({
          createdAt: '2026-10-20T08:00:00.000Z',
          trail: [
            {
              toStatus: 'submitted',
              actorId: 'user_citizen_rahim',
              actorRole: 'citizen',
              note: null,
              timestamp: '2026-10-20T08:00:00.000Z',
            },
            {
              toStatus: 'routed',
              actorId: 'user_dispatcher_habib',
              actorRole: 'dispatcher',
              note: null,
              timestamp: '2026-10-20T08:20:00.000Z',
            },
          ],
        }),
      ],
      { days: 1, now },
    );
    expect(spark.points[0].samples).toBe(1);
    expect(spark.points[0].avgMinutes).toBe(20);
  });

  it('reports a zero-sample day as 0 minutes', () => {
    const spark = buildResponseSparkline([], { days: 3, now });
    expect(spark.points.every((p) => p.samples === 0 && p.avgMinutes === 0)).toBe(
      true,
    );
  });
});

describe('buildCrewLoad', () => {
  it('counts open (non-resolved) tickets per crew, highest first', () => {
    const load = buildCrewLoad(
      [
        ticket({ id: 'a', assignedCrewId: 'user_crew_rashid' }),
        ticket({ id: 'b', assignedCrewId: 'user_crew_rashid' }),
        ticket({ id: 'c', assignedCrewId: 'user_crew_karim' }),
        ticket({
          id: 'd',
          assignedCrewId: 'user_crew_karim',
          status: 'resolved',
        }),
      ],
      { user_crew_rashid: 'Rashid', user_crew_karim: 'Karim' },
    );

    expect(load).toEqual([
      { crewId: 'user_crew_rashid', crewName: 'Rashid', openCount: 2 },
      { crewId: 'user_crew_karim', crewName: 'Karim', openCount: 1 },
    ]);
  });

  it('omits unassigned tickets and falls back to the crew id as the name', () => {
    const load = buildCrewLoad([
      ticket({ id: 'a', assignedCrewId: null }),
      ticket({ id: 'b', assignedCrewId: 'user_crew_ghost' }),
    ]);
    expect(load).toEqual([
      { crewId: 'user_crew_ghost', crewName: 'user_crew_ghost', openCount: 1 },
    ]);
  });
});

describe('buildMonitorCharts', () => {
  it('bundles the three chart datasets', () => {
    const charts = buildMonitorCharts([ticket()], {
      crewNames: { user_crew_rashid: 'Rashid' },
      now: new Date('2026-10-20T12:00:00.000Z'),
    });
    expect(charts.flow.total).toBe(1);
    expect(charts.response.points.length).toBe(7);
    expect(charts.crewLoad[0].crewName).toBe('Rashid');
  });
});

/* ------------------------------------------------------------------ */
/* DB-facing read + ack                                                */
/* ------------------------------------------------------------------ */

describe('listMonitorTickets', () => {
  it('returns rows for the dispatcher ward only', async () => {
    const result = await listMonitorTickets({ session: DISPATCHER_SESSION });
    expect(result.rows.length).toBeGreaterThan(0);
    for (const row of result.rows) {
      expect(row.wardId).toBe('ward_14');
    }
  });

  it('excludes cross-ward tickets', async () => {
    plantCrossWardTicket();
    const result = await listMonitorTickets({ session: DISPATCHER_SESSION });
    const ids = result.rows.map((r) => r.id);
    expect(ids).not.toContain(CROSS_WARD_TICKET_ID);
  });

  it('only includes watched statuses', async () => {
    const result = await listMonitorTickets({ session: DISPATCHER_SESSION });
    for (const row of result.rows) {
      expect(MONITOR_WATCHED_STATUSES).toContain(
        row.status as (typeof MONITOR_WATCHED_STATUSES)[number],
      );
    }
  });

  it('sorts the rows by most-recently-updated first', async () => {
    const result = await listMonitorTickets({ session: DISPATCHER_SESSION });
    const stamps = result.rows.map((r) => r.updatedAt);
    const sorted = [...stamps].sort().reverse();
    expect(stamps).toEqual(sorted);
  });

  it('applies the "my_crews" filter to rows with an assigned crew', async () => {
    const result = await listMonitorTickets({
      session: DISPATCHER_SESSION,
      filter: 'my_crews',
    });
    for (const row of result.rows) {
      expect(row.assignedCrewId).toBeTruthy();
    }
  });

  it('applies the "my_ward" filter to the session ward', async () => {
    const result = await listMonitorTickets({
      session: DISPATCHER_SESSION,
      filter: 'my_ward',
    });
    for (const row of result.rows) {
      expect(row.wardId).toBe('ward_14');
    }
  });

  it('honours the limit', async () => {
    const result = await listMonitorTickets({
      session: DISPATCHER_SESSION,
      limit: 1,
    });
    expect(result.rows).toHaveLength(1);
  });

  it('always returns the chart strip and a generation timestamp', async () => {
    const result = await listMonitorTickets({ session: DISPATCHER_SESSION });
    expect(result.charts.flow.segments.length).toBe(MONITOR_WATCHED_STATUSES.length);
    expect(result.charts.response.points.length).toBe(7);
    expect(Number.isFinite(Date.parse(result.generatedAt))).toBe(true);
  });
});

describe('acknowledgeMonitorUpdate', () => {
  it('writes an audit row for a ticket in the dispatcher ward', async () => {
    const result = await acknowledgeMonitorUpdate(
      'ticket_seed_inprogress_1',
      DISPATCHER_SESSION,
    );
    expect(result.ticketId).toBe('ticket_seed_inprogress_1');
    expect(Number.isFinite(Date.parse(result.acknowledgedAt))).toBe(true);
  });

  it('throws a 404 ApiError for a ticket that does not exist', async () => {
    await expect(
      acknowledgeMonitorUpdate('ticket_does_not_exist', DISPATCHER_SESSION),
    ).rejects.toMatchObject({ status: 404, code: 'not_found' });
  });

  it('throws a 404 ApiError for a ticket outside the dispatcher ward', async () => {
    plantCrossWardTicket();
    await expect(
      acknowledgeMonitorUpdate(CROSS_WARD_TICKET_ID, DISPATCHER_SESSION),
    ).rejects.toMatchObject({ status: 404, code: 'not_found' });
  });
});
