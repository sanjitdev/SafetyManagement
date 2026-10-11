/**
 * Pure helpers for the home / city activity feed
 * (lib/home-filter.ts).
 *
 * The home page is a client component; the filter
 * logic lives here so it can be unit-tested without
 * the React runtime. Two helpers:
 *
 * - `applyStatusFilter(items, filter)` — narrows an
 *   `ActivityItem[]` by the four pill values.
 * - `filterToApiStatus(filter)` — maps the pill
 *   value to the `status` query param for
 *   `GET /api/v1/activity`.
 *
 * The `all` value is the no-op sentinel for both.
 */

export type ActivityStatus =
  | 'submitted'
  | 'routed'
  | 'in_progress'
  | 'resolved'
  | 'closed'
  | 'cancelled';

export type StatusFilter = 'all' | 'submitted' | 'in_progress' | 'resolved';

export interface ActivityItemLite {
  status: ActivityStatus;
}

/**
 * Apply the four-pill status filter to an activity
 * list. The `all` value is the identity (returns the
 * input unchanged).
 */
export function applyStatusFilter<T extends ActivityItemLite>(
  items: T[],
  filter: StatusFilter,
): T[] {
  if (filter === 'all') return items;
  return items.filter((t) => t.status === filter);
}

/**
 * Map a `StatusFilter` to the API's `status` query
 * parameter. Returns `undefined` for `all` so the
 * API call omits the param (matches the existing
 * `app/api/v1/activity/route.ts` behaviour).
 */
export function filterToApiStatus(
  filter: StatusFilter,
): ActivityStatus | undefined {
  if (filter === 'all') return undefined;
  return filter;
}

/**
 * Map a `StatusFilter` to the i18n key for the pill
 * label. The `submitted` filter uses the
 * `home.filter.new` key (UI label is "New" /
 * "নতুন") while the API still filters on
 * `submitted`. This is the only label that diverges
 * from the API value.
 */
export function filterToI18nKey(filter: StatusFilter): string {
  if (filter === 'submitted') return 'home.filter.new';
  return `home.filter.${filter}`;
}