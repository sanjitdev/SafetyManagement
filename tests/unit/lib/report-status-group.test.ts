/**
 * Vitest: the citizen filter-chip grouping, and its parity with the API.
 *
 * ## What this guards
 *
 * The citizen surfaces filter with a four-value vocabulary — All /
 * New / Active / Resolved — while the data layer stores a six-value
 * status enum. The mapping between the two lives in TWO places:
 *
 *   - the public activity route's own `STATUS_GROUP` map (server
 *     side, `app/api/v1/activity/public/route.ts`), and
 *   - `lib/report-status-group.ts` (shared, used by the client
 *     chips on `/reports`).
 *
 * If the two drift, a chip's count and the rows it filters disagree:
 * the chip says "New (4)" and the list shows two rows, or the chip
 * says "New (2)" and the list shows four. Nothing in the type system
 * catches that — the two maps have independent types.
 *
 * So the parity is asserted HERE, by BEHAVIOUR: for every status in
 * the enum, the set of tickets the API's filter keeps must be exactly
 * the set the shared group's filter keeps.
 *
 * ## Why behavioural parity and not a string comparison
 *
 * The route's `STATUS_GROUP` is module-private (it is not exported),
 * so a test cannot import and diff the literal maps without
 * changing the route — and the route is frozen for this bolt. But
 * `applyPublicFilters` IS exported, and it is the only consumer of
 * `STATUS_GROUP`. Diffing the two filters' OUTPUT over a ticket set
 * that contains every status proves the grouping itself agrees, and
 * it also proves the parity can break: the "the test can fail"
 * property is demonstrated by the mutation assertion below.
 */

import { describe, expect, test } from 'vitest';
import { applyPublicFilters } from '@/app/api/v1/activity/public/route';
import {
  REPORT_STATUS_GROUPS,
  applyReportStatusFilter,
  countByReportStatusGroup,
  groupForStatus,
  type ReportStatus,
  type ReportStatusFilter,
} from '@/lib/report-status-group';

/**
 * Every status in the enum, one ticket each.
 *
 * The ward is fixed and irrelevant — the parity under test is the
 * STATUS grouping, so the ward filter stays out of it.
 */
const EVERY_STATUS: readonly ReportStatus[] = [
  'submitted',
  'routed',
  'in_progress',
  'resolved',
  'closed',
  'cancelled',
];

interface Row {
  id: string;
  status: ReportStatus;
  wardId: string;
}

const ROWS: Row[] = EVERY_STATUS.map((status) => ({
  id: `row-${status}`,
  status,
  wardId: 'ward-a',
}));

/**
 * The chip values, minus `all` — `all` is the identity on both
 * sides and carries no grouping to compare.
 */
const GROUPED_CHIPS: ReportStatusFilter[] = ['new', 'active', 'resolved'];

describe('report-status-group', () => {
  test('every status in the enum belongs to exactly one group', () => {
    // A status that belonged to NO group would fall into 'all' only,
    // and a status in TWO groups would be counted twice.
    for (const status of EVERY_STATUS) {
      const group = groupForStatus(status);
      expect(group).not.toBe('all');
      const owners = REPORT_STATUS_GROUPS.filter(
        (g) => g.value !== 'all' && g.statuses.includes(status),
      );
      expect(owners).toHaveLength(1);
      expect(owners[0]!.value).toBe(group);
    }
  });

  test('the groups cover every status exactly once', () => {
    const covered = REPORT_STATUS_GROUPS.filter((g) => g.value !== 'all').flatMap(
      (g) => g.statuses,
    );
    expect([...covered].sort()).toEqual([...EVERY_STATUS].sort());
  });

  test("the 'all' group is the identity", () => {
    expect(applyReportStatusFilter(ROWS, 'all')).toHaveLength(ROWS.length);
  });

  test('the filter does not mutate its input', () => {
    const original = [...ROWS];
    applyReportStatusFilter(ROWS, 'new');
    expect(ROWS).toEqual(original);
  });

  test('the counts sum to the list length', () => {
    const counts = countByReportStatusGroup(ROWS);
    expect(counts.all).toBe(ROWS.length);
    expect(counts.new + counts.active + counts.resolved).toBe(ROWS.length);
  });

  test('an empty list yields zero counts', () => {
    expect(countByReportStatusGroup([])).toEqual({
      all: 0,
      new: 0,
      active: 0,
      resolved: 0,
    });
  });
});

describe('parity with the API route’s status grouping', () => {
  test.each(GROUPED_CHIPS)(
    'the "%s" chip keeps exactly the same tickets as the API filter',
    (chip) => {
      const apiRows = applyPublicFilters(ROWS, chip, null);
      const sharedRows = applyReportStatusFilter(ROWS, chip);
      expect(sharedRows.map((r) => r.id).sort()).toEqual(
        apiRows.map((r) => r.id).sort(),
      );
    },
  );

  test('the API and the shared filter agree on every single ticket', () => {
    // Per-ticket rather than per-chip: this catches a chip that keeps
    // the right NUMBER of rows but the wrong ones.
    for (const row of ROWS) {
      for (const chip of GROUPED_CHIPS) {
        const apiKeeps = applyPublicFilters([row], chip, null).length === 1;
        const sharedKeeps = applyReportStatusFilter([row], chip).length === 1;
        expect(sharedKeeps).toBe(apiKeeps);
      }
    }
  });

  test('the chip counts agree with what the API filter would return', () => {
    // The count on the chip and the rows the chip filters are
    // computed by different code paths in the page (the API's
    // `stats.counts` for staff, `countByReportStatusGroup` for
    // citizens). They must agree, or a citizen sees "New (2)" above
    // a list of four New reports.
    const counts = countByReportStatusGroup(ROWS);
    expect(counts.new).toBe(applyPublicFilters(ROWS, 'new', null).length);
    expect(counts.active).toBe(applyPublicFilters(ROWS, 'active', null).length);
    expect(counts.resolved).toBe(
      applyPublicFilters(ROWS, 'resolved', null).length,
    );
  });

  test('the parity assertion can actually fail', () => {
    // A guard that cannot fail is not a guard. This proves the
    // comparison above is discriminating: a DELIBERATELY wrong
    // grouping must not satisfy it.
    const wrongGrouping = (rows: readonly Row[]) =>
      rows.filter((r) => r.status === 'submitted');

    const apiRows = applyPublicFilters(ROWS, 'new', null);
    const wrongRows = wrongGrouping(ROWS);

    // `new` really does keep more than just `submitted`...
    expect(apiRows.length).toBeGreaterThan(wrongRows.length);
    // ...so the wrong grouping does NOT satisfy the parity.
    expect(wrongRows.map((r) => r.id).sort()).not.toEqual(
      apiRows.map((r) => r.id).sort(),
    );
  });
});
