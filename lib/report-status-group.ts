/**
 * The report-status GROUPS a citizen thinks in.
 *
 * WHY THIS EXISTS
 * ---------------
 * The citizen does not think in the internal status enum ("submitted"
 * vs "routed" are the same thing to them: nobody has started yet).
 * The API groups them — `new` = submitted + routed, `active` =
 * in_progress, `resolved` = resolved + closed + cancelled — and the
 * filter chips on the citizen surfaces must group them the SAME way,
 * or a chip's count and the rows it filters disagree.
 *
 * That grouping lives in two places today: the public activity
 * route's `STATUS_GROUP` map, and (before this module) nowhere
 * shared. This module is the shared copy, exported from `lib/` so
 * the client can use it without importing from `app/` — and so the
 * two can be diffed in a unit test rather than by eye.
 *
 * NOTE ON SCOPE
 * -------------
 * This module does NOT change the API. The route keeps its own map
 * (it must — the route is the server side and `lib/` is shared).
 * The parity between the two is asserted by
 * `tests/unit/lib/report-status-group.test.ts`.
 */

/** The internal ticket statuses a citizen report can be in. */
export type ReportStatus =
  | 'submitted'
  | 'routed'
  | 'in_progress'
  | 'resolved'
  | 'closed'
  | 'cancelled';

/** The four values the citizen-facing filter chips take. */
export type ReportStatusFilter = 'all' | 'new' | 'active' | 'resolved';

export interface ReportStatusGroup {
  /** The chip value. `all` is the identity — every status. */
  value: ReportStatusFilter;
  /** The internal statuses the chip covers. `all` covers every one. */
  statuses: readonly ReportStatus[];
}

/**
 * The chip order the surfaces render.
 *
 * `all` first — it is the default view.
 */
export const REPORT_STATUS_GROUPS: readonly ReportStatusGroup[] = [
  {
    value: 'all',
    statuses: ['submitted', 'routed', 'in_progress', 'resolved', 'closed', 'cancelled'],
  },
  { value: 'new', statuses: ['submitted', 'routed'] },
  { value: 'active', statuses: ['in_progress'] },
  { value: 'resolved', statuses: ['resolved', 'closed', 'cancelled'] },
] as const;

/**
 * The group a status belongs to — the first group in the list whose
 * `statuses` contains it. `all` is excluded from the search because
 * it contains every status, so it would always win.
 */
export function groupForStatus(status: ReportStatus): ReportStatusFilter {
  for (const group of REPORT_STATUS_GROUPS) {
    if (group.value === 'all') continue;
    if (group.statuses.includes(status)) return group.value;
  }
  return 'all';
}

/**
 * Narrow a list of tickets to one chip's group.
 *
 * `all` is the identity (returns the input unchanged).
 */
export function applyReportStatusFilter<T extends { status: ReportStatus }>(
  items: readonly T[],
  filter: ReportStatusFilter,
): T[] {
  if (filter === 'all') return items.slice();
  const group = REPORT_STATUS_GROUPS.find((g) => g.value === filter);
  if (!group) return items.slice();
  return items.filter((item) => group.statuses.includes(item.status));
}

/**
 * Count a list of tickets per chip group.
 *
 * The counts are over the WHOLE list, not over a rendered page — a
 * chip that counted the rendered rows would report a page size, not a
 * total.
 */
export function countByReportStatusGroup(
  items: ReadonlyArray<{ status: ReportStatus }>,
): Record<ReportStatusFilter, number> {
  const counts: Record<ReportStatusFilter, number> = {
    all: 0,
    new: 0,
    active: 0,
    resolved: 0,
  };
  for (const item of items) {
    counts.all += 1;
    const group = groupForStatus(item.status);
    counts[group] += 1;
  }
  return counts;
}
