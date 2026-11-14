'use client';

/**
 * FilterRail — the dispatcher's triage filter rail.
 *
 * Wave 4 / bolt 009-005.
 *
 * ── What this rail filters ─────────────────────────────────────
 *
 * Two axes, both NARROWING:
 *
 *   - **Status** — all four ticket states the model has, plus
 *     "All". The queue endpoint accepts exactly these four
 *     (`app/api/v1/dispatcher/queue/route.ts`); a rail that
 *     offered a state the endpoint rejects with a 400 would be a
 *     rail that lies.
 *   - **Ward** — the wards the signed-in dispatcher may actually
 *     REACH. For a ward-bound dispatcher that is one ward; for a
 *     city-wide dispatcher it is every ward in the city.
 *
 * ── Why the ward list is data, not a constant ──────────────────
 *
 * The rail reads its ward list from the queue response
 * (`wards` + `wardScoped`). The obvious alternative — a
 * hard-coded list of wards — would show a rail the API cannot
 * serve: the dev store seeds 2 wards and real Postgres seeds 50.
 * A filter that selects zero tickets is worse than no filter,
 * because the dispatcher cannot tell it apart from an empty
 * queue.
 *
 * ── A WARD-BOUND DISPATCHER IS TOLD SO ─────────────────────────
 *
 * When the session is bound to a single ward the rail would show
 * one row, which reads as a broken control rather than as an
 * authorisation boundary. So the rail says "limited to your
 * ward" explicitly, and the ward control collapses to a static
 * statement rather than a filter that can only ever be in one
 * state.
 *
 * ── The rail never WIDENS the scope ────────────────────────────
 *
 * A `ward` request is intersected with the session's ward on the
 * server: both conditions must hold, and the session always wins.
 * The rail therefore only ever offers wards the dispatcher can
 * reach in the first place — the UI cannot widen the scope even
 * if the request were tampered with, but it also does not pretend
 * the choice is wider than it is.
 *
 * ── Keyboard ───────────────────────────────────────────────────
 *
 * The status axis is a `FilterChipGroup` (the shared toolbar
 * pattern with roving tabindex). The ward axis is a native
 * `<select>` — see `components/ui/Select.tsx` for why the native
 * control is right for a short, fixed list, and why the crew
 * picker in `components/ui/Combobox.tsx` is the exception.
 */

import { FilterChipGroup } from '@/components/ui/FilterChipGroup';
import { Select } from '@/components/ui/Select';
import { t, type Language } from '@/lib/i18n/keys';

export type QueueStatusFilter =
  | 'all'
  | 'submitted'
  | 'routed'
  | 'in_progress'
  | 'resolved';

export interface WardOption {
  id: string;
  number: number;
  name: string | null;
  nameBn: string | null;
}

export interface FilterRailProps {
  /** The selected status. `'all'` means "no status filter". */
  status: QueueStatusFilter;
  /** Fired when the status axis changes. */
  onStatusChange: (status: QueueStatusFilter) => void;
  /** The selected ward id, or `null` for "all wards". */
  ward: string | null;
  /** Fired when the ward axis changes. */
  onWardChange: (ward: string | null) => void;
  /** The wards the dispatcher may reach. Never a hard-coded list. */
  wards: readonly WardOption[];
  /** Whether the dispatcher's session is bound to a single ward. */
  wardScoped: boolean;
  /** Document language. */
  lang: Language;
  /** The search text. */
  search: string;
  /** Fired when the search text changes. */
  onSearchChange: (value: string) => void;
  /** Optional slot for the poll-state indicator. */
  trailing?: React.ReactNode;
  /** Test hook. */
  'data-testid'?: string;
}

/**
 * The status axis, in the order the dispatcher thinks about it.
 *
 * The order is the ticket's life, not alphabetical: a ticket
 * arrives (submitted), is dispatched (routed), is being worked
 * (in_progress), and is done (resolved). "All" sits first
 * because it is the default state.
 */
const STATUS_OPTIONS: ReadonlyArray<{
  value: QueueStatusFilter;
  key: string;
}> = [
  { value: 'all', key: 'dispatcher.queue.filter.all' },
  { value: 'submitted', key: 'dispatcher.queue.filter.submitted' },
  { value: 'routed', key: 'dispatcher.queue.filter.routed' },
  { value: 'in_progress', key: 'dispatcher.queue.filter.in_progress' },
  { value: 'resolved', key: 'dispatcher.queue.filter.resolved' },
];

export function FilterRail({
  status,
  onStatusChange,
  ward,
  onWardChange,
  wards,
  wardScoped,
  lang,
  search,
  onSearchChange,
  trailing,
  'data-testid': testId,
}: FilterRailProps) {
  const wardOptions = wards.map((w) => {
    const name = lang === 'bn' ? w.nameBn : w.name;
    // A ward with no display name still needs a readable label —
    // the raw id is better than a blank row, because a blank row
    // is indistinguishable from a rendering bug.
    const label = name ?? `${t('dispatcher.queue.filter.ward_heading', null, lang)} ${w.number}`;
    return { value: w.id, label };
  });

  return (
    <div className="dispatcher-filter-rail" data-testid={testId}>
      <div className="dispatcher-filter-rail-search">
        <label className="dispatcher-filter-rail-label" htmlFor="dispatcher-queue-search">
          {t('dispatcher.queue.filter.search_placeholder', null, lang)}
        </label>
        <input
          id="dispatcher-queue-search"
          type="search"
          className="dispatcher-filter-rail-input"
          lang={lang}
          value={search}
          placeholder={t('dispatcher.queue.filter.search_placeholder', null, lang)}
          onChange={(event) => onSearchChange(event.target.value)}
          data-testid="dispatcher-queue-search"
        />
      </div>

      <div className="dispatcher-filter-rail-axis">
        <span className="dispatcher-filter-rail-label" id="dispatcher-status-filter-label">
          {t('dispatcher.queue.filter.heading', null, lang)}
        </span>
        <FilterChipGroup
          lang={lang}
          value={status}
          onChange={onStatusChange}
          ariaLabel={t('dispatcher.queue.filter.heading', null, lang)}
          options={STATUS_OPTIONS.map((option) => ({
            value: option.value,
            label: t(option.key, null, lang),
          }))}
          className="dispatcher-filter-rail-chips"
          data-testid="dispatcher-status-filter"
        />
      </div>

      <div className="dispatcher-filter-rail-axis">
        <span className="dispatcher-filter-rail-label" id="dispatcher-ward-filter-label">
          {t('dispatcher.queue.filter.ward_heading', null, lang)}
        </span>
        {wardScoped ? (
          /*
           * A ward-bound dispatcher has exactly one reachable ward.
           * Rendering a one-option <select> would be a control that
           * looks broken, so the boundary is stated instead.
           */
          <span
            className="dispatcher-filter-rail-static"
            data-testid="dispatcher-ward-scoped-note"
            lang={lang}
          >
            {t('dispatcher.queue.filter.ward_scoped', null, lang)}
          </span>
        ) : (
          <Select
            aria-label={t('dispatcher.queue.filter.ward_heading', null, lang)}
            lang={lang}
            className="dispatcher-filter-rail-ward"
            data-testid="dispatcher-ward-filter"
            value={ward ?? ''}
            onChange={(event) =>
              onWardChange(event.target.value ? event.target.value : null)
            }
            options={[
              {
                value: '',
                label: t('dispatcher.queue.filter.all_wards', null, lang),
              },
              ...wardOptions,
            ]}
          />
        )}
      </div>

      {trailing ? <div className="dispatcher-filter-rail-trailing">{trailing}</div> : null}
    </div>
  );
}
