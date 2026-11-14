/**
 * Status tokens — the ONE place a status maps to a colour.
 *
 * ── WHY THIS MODULE EXISTS ──────────────────────────────────────
 *
 * Wave 4 / bolt 009-005 found FOUR independent status→colour maps
 * in the dispatcher surfaces:
 *
 *   - `components/ui/StatusPill.tsx` — the canonical one, private.
 *   - `app/dispatcher/monitor/page.tsx` — `FLOW_COLORS`.
 *   - `app/dispatcher/performance/page.tsx` — `DONUT_COLORS`.
 *   - `app/dispatcher/map/page.tsx` — a local `StatusPill` shadow
 *     with its own colour map.
 *
 * Plus `lib/ui/map-colors.ts`, which is a FIFTH map — but that one
 * is deliberately different: the map tiles are light OpenStreetMap
 * imagery in BOTH themes, so the pins need literal hexes rather
 * than tokens. That is a real difference, not a duplication, so it
 * stays where it is.
 *
 * Four copies of the same mapping is four places for a status to
 * drift: add a status to three of them and the fourth draws it in
 * the wrong colour. This module is the single source, and the
 * StatusPill reads from it too.
 *
 * ── THE COLOUR IS NEVER THE ONLY SIGNAL ──────────────────────────
 *
 * This map answers "what colour", never "what does this status
 * MEAN". Every surface that uses a colour from here must also carry
 * the status's word (and, for a pill, its icon). A chart legend
 * that shows a coloured dot and a count, with the status name
 * spelled out, is the minimum.
 */

import type { StatusKey } from '@/components/ui/StatusPill';

/**
 * The foreground colour token for a status.
 *
 * The `-soft` background variant lives beside it in `tokens.css`;
 * this module exposes the foreground because a chart series, a
 * legend dot and a bar all want the saturated colour, while a pill
 * wants the soft fill.
 */
export const STATUS_COLOR: Record<StatusKey, string> = {
  submitted: 'var(--color-status-submitted)',
  routed: 'var(--color-status-routed)',
  in_progress: 'var(--color-status-in-progress)',
  resolved: 'var(--color-status-resolved)',
  closed: 'var(--color-ink-tertiary)',
  cancelled: 'var(--color-ink-tertiary)',
  paused: 'var(--color-status-paused)',
  error: 'var(--color-status-error)',
  warning: 'var(--color-status-warning)',
};

/**
 * The soft (tinted) background token for a status.
 */
export const STATUS_COLOR_SOFT: Record<StatusKey, string> = {
  submitted: 'var(--color-status-submitted-soft)',
  routed: 'var(--color-status-routed-soft)',
  in_progress: 'var(--color-status-in-progress-soft)',
  resolved: 'var(--color-status-resolved-soft)',
  closed: 'var(--color-surface-raised)',
  cancelled: 'var(--color-surface-raised)',
  paused: 'var(--color-status-in-progress-soft)',
  error: 'var(--color-status-error-soft)',
  warning: 'var(--color-status-warning-soft)',
};

/**
 * The status colour for an arbitrary status string.
 *
 * A chart breakdown can carry a status the union does not name (a
 * seed row, a future status). An unknown status gets the neutral
 * ink colour rather than a wrong hue — a grey slice is honest, a
 * green slice on a cancelled ticket is a lie.
 */
export function statusColor(status: string): string {
  return STATUS_COLOR[status as StatusKey] ?? 'var(--color-ink-tertiary)';
}
