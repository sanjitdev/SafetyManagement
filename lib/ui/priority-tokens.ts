/**
 * Priority tokens — the ONE place a priority band maps to a colour.
 *
 * The sibling of `lib/ui/status-tokens.ts`, and it exists for the same
 * reason: the triage-priority scale appears in more than one place (the
 * queue row, the ticket detail header, the picker's swatches), and
 * three copies of the same map is three places for a band to drift.
 *
 * ── THE COLOUR IS NEVER THE ONLY SIGNAL ──────────────────────────
 *
 * This module answers "what colour", never "what does this band MEAN".
 * Every surface that uses a colour from here must also carry the
 * band's WORD (and, for a pill, its shape). The `PriorityPill` does
 * exactly that.
 *
 * ── WHY THE SCALE LOOKS THE WAY IT DOES ──────────────────────────
 *
 * The four bands escalate by COLOUR SATURATION AND SHAPE TOGETHER:
 *
 *   low     — neutral ink. The band's whole point is that it is the
 *             unremarkable default.
 *   normal  — the accent. Ordinary expected workload.
 *   high    — the warning tone. Visibly worse than the usual flow.
 *   urgent  — the error tone. The dispatcher wants this worked next.
 *
 * The shapes escalate by SIDE COUNT (circle → triangle → diamond →
 * octagon), so the escalation survives greyscale.
 *
 * ── THE UNTRIAGED STATE ──────────────────────────────────────────
 *
 * An untriaged report is NOT a band. It is the ABSENCE of a decision,
 * and it needs its own visual: a dashed outline rather than a filled
 * chip, because "nobody has looked at this yet" and "a dispatcher
 * judged this low" must never look the same.
 */

import type { TicketPriority } from '@/lib/dispatcher/priority';

/**
 * The triage bands, PLUS the untriaged state.
 *
 * `null` is not a band — it is the absence of one — but the visual
 * layer needs to render it, so the union here includes it.
 */
export type PriorityVisualKey = TicketPriority | 'untriaged';

/**
 * The foreground colour token for a priority band.
 *
 * The `-soft` background variant lives beside it in `tokens.css`;
 * this module exposes the foreground because a swatch wants the
 * saturated colour while a pill wants the soft fill.
 */
export const PRIORITY_COLOR: Record<PriorityVisualKey, string> = {
  low: 'var(--color-ink-tertiary)',
  normal: 'var(--color-accent)',
  high: 'var(--color-status-warning)',
  urgent: 'var(--color-status-error)',
  untriaged: 'var(--color-ink-tertiary)',
};

/**
 * The soft (tinted) background token for a priority band.
 */
export const PRIORITY_COLOR_SOFT: Record<PriorityVisualKey, string> = {
  low: 'var(--color-surface-raised)',
  normal: 'var(--color-accent-soft)',
  high: 'var(--color-status-warning-soft)',
  urgent: 'var(--color-status-error-soft)',
  untriaged: 'var(--color-surface-raised)',
};

/**
 * The priority colour for an arbitrary band string.
 *
 * A seed row or a future band can carry a value the union does not
 * name. An unknown band gets the neutral ink colour rather than a
 * wrong hue — a grey chip is honest, a red chip on a `low` report is
 * a lie.
 */
export function priorityColor(priority: string | null | undefined): string {
  if (!priority) return PRIORITY_COLOR.untriaged;
  return PRIORITY_COLOR[priority as TicketPriority] ?? PRIORITY_COLOR.untriaged;
}
