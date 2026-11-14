/**
 * The dispatcher's SLA countdown (lib/dispatcher/sla.ts).
 *
 * ── What the chip means ─────────────────────────────────────────
 *
 * A ticket's category carries a resolution SLA: the number of hours
 * the city commits to between `routed` and `resolved`. The chip
 * shows the time **REMAINING** against that target — not the time
 * elapsed, and not a static "48h" label.
 *
 * The distinction matters to the dispatcher. "Submitted 3 days ago" is
 * a fact about the ticket; "2 days left" is a fact about the
 * dispatcher's work, and it is the number that decides whether the
 * ticket needs a crew today.
 *
 * ── Why the target comes from the database ──────────────────────
 *
 * The target is read from the `SlaPolicy` row for the ticket's
 * category. It is NOT hard-coded in the component: hard-coding the
 * five hour counts would duplicate `prisma/seed.ts`'s
 * `DHAKA_SLA_POLICIES` and drift the moment the seed changed. A
 * chip that reads its own target from a constant is a chip that
 * lies quietly.
 *
 * ── The clock starts at `routed`, not at `submitted` ───────────
 *
 * `SlaPolicy.resolveHours` is documented in `prisma/schema.prisma`
 * as "the number of hours from `routed` to `resolved` before the
 * ticket is considered SLA-breached". The clock therefore starts
 * when the ticket is ROUTED, and a ticket that has not been routed
 * yet has no running clock — it is "not started", which is a
 * distinct state from "on time" and from "breached".
 *
 * A ticket routed to nobody never breaches, but it is not "on time"
 * either: it is waiting. The chip says so.
 */

/** The tone of an SLA chip. Drives colour AND an icon + word. */
export type SlaTone = 'on_track' | 'at_risk' | 'breached' | 'not_started' | 'met';

export interface SlaState {
  tone: SlaTone;
  /** Hours remaining against the target. Negative once breached. */
  remainingHours: number;
  /** The policy's target, in hours. `null` when no policy is set. */
  targetHours: number | null;
  /** The ISO instant the clock started, or `null` if not routed yet. */
  startedAt: string | null;
  /** The ISO instant the target expires, or `null` if no policy is set. */
  dueAt: string | null;
}

/**
 * The tone thresholds, as a fraction of the target.
 *
 * A chip that only turns red at the moment of breach is useless —
 * by then the dispatcher can do nothing about it. The band is
 * derived from the target rather than fixed in absolute hours, so a
 * 48-hour policy and a 168-hour policy both get the same three
 * warning stages, scaled to their own length.
 */
const AT_RISK_FRACTION = 0.5;
const AT_RISK_URGENT_FRACTION = 0.25;

const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * The instant the SLA clock started for a ticket.
 *
 * The clock starts at `routed`. For a ticket that has not been
 * routed yet there is no clock, and the caller must be told so
 * rather than being handed a zero.
 *
 * The trail is the authoritative record of the transition — the
 * ticket row itself carries no `routedAt` column. The trail entry
 * whose `toStatus` is `routed` is the moment the dispatcher took
 * it.
 */
export function slaStartedAt(
  trail: ReadonlyArray<{ toStatus: string; timestamp: string | Date }>,
): string | null {
  for (const entry of trail) {
    if (entry.toStatus !== 'routed') continue;
    const ts =
      typeof entry.timestamp === 'string'
        ? entry.timestamp
        : entry.timestamp.toISOString();
    const parsed = new Date(ts);
    if (Number.isNaN(parsed.getTime())) continue;
    return ts;
  }
  return null;
}

/**
 * Compute the SLA state for a ticket.
 *
 * @param startedAt    The instant the clock started (see `slaStartedAt`).
 * @param targetHours  The policy's target in hours, or `null` when the
 *                     category has no policy.
 * @param now          "Now", in epoch milliseconds. Injectable so the
 *                     value is deterministic in tests — a chip that
 *                     depends on the wall clock cannot be asserted.
 */
export function computeSlaState(
  startedAt: string | null,
  targetHours: number | null,
  now: number,
): SlaState {
  if (targetHours === null) {
    // No policy for this category — there is no target to be on
    // time against. The chip must say "no target", not "on time".
    return {
      tone: 'not_started',
      remainingHours: 0,
      targetHours: null,
      startedAt: null,
      dueAt: null,
    };
  }

  if (startedAt === null) {
    // The ticket has not been routed yet, so the clock has not
    // started. This is distinct from "on track": nothing is late,
    // but nothing is running either.
    return {
      tone: 'not_started',
      remainingHours: targetHours,
      targetHours,
      startedAt: null,
      dueAt: null,
    };
  }

  const startedMs = new Date(startedAt).getTime();
  if (Number.isNaN(startedMs)) {
    return {
      tone: 'not_started',
      remainingHours: targetHours,
      targetHours,
      startedAt: null,
      dueAt: null,
    };
  }

  const dueMs = startedMs + targetHours * MS_PER_HOUR;
  const remainingHours = (dueMs - now) / MS_PER_HOUR;

  let tone: SlaTone;
  if (remainingHours <= 0) {
    tone = 'breached';
  } else if (remainingHours <= targetHours * AT_RISK_URGENT_FRACTION) {
    tone = 'at_risk';
  } else if (remainingHours <= targetHours * AT_RISK_FRACTION) {
    tone = 'at_risk';
  } else {
    tone = 'on_track';
  }

  return {
    tone,
    remainingHours,
    targetHours,
    startedAt,
    dueAt: new Date(dueMs).toISOString(),
  };
}

/**
 * The SLA state of a ticket that has been RESOLVED.
 *
 * A resolved ticket cannot be "at risk" any more. If it was resolved
 * before the target it met the SLA; if it was resolved after, it
 * missed it. The chip says so — a resolved ticket showing a
 * countdown against a deadline that no longer matters is noise.
 */
export function computeMetSlaState(
  targetHours: number | null,
  startedAt: string | null,
  resolvedAt: string | null,
): SlaState {
  if (targetHours === null) {
    return {
      tone: 'not_started',
      remainingHours: 0,
      targetHours: null,
      startedAt: null,
      dueAt: null,
    };
  }
  if (startedAt === null || resolvedAt === null) {
    return {
      tone: 'not_started',
      remainingHours: targetHours,
      targetHours,
      startedAt: null,
      dueAt: null,
    };
  }

  const startedMs = new Date(startedAt).getTime();
  const resolvedMs = new Date(resolvedAt).getTime();
  if (Number.isNaN(startedMs) || Number.isNaN(resolvedMs)) {
    return {
      tone: 'not_started',
      remainingHours: targetHours,
      targetHours,
      startedAt: null,
      dueAt: null,
    };
  }

  const dueMs = startedMs + targetHours * MS_PER_HOUR;
  const remainingHours = (dueMs - resolvedMs) / MS_PER_HOUR;

  return {
    tone: remainingHours >= 0 ? 'met' : 'breached',
    remainingHours,
    targetHours,
    startedAt,
    dueAt: new Date(dueMs).toISOString(),
  };
}

/**
 * Format the remaining time as a compact duration.
 *
 * Under an hour the chip shows minutes — "৪৫ মিনিট বাকি" is the
 * useful number when a ticket is about to breach. Under a day it
 * shows hours. Beyond that it shows days and hours.
 *
 * The value is rounded UP for a positive remaining time. A ticket
 * with 12.4 hours left showing "12h" reads as if it had less time
 * than it does; "13h" is the honest reading of "12 hours and 24
 * minutes left", and rounding in the dispatcher's disfavour is the
 * safe direction to err.
 */
export function formatRemainingHours(remainingHours: number): {
  value: number;
  unit: 'minutes' | 'hours' | 'days';
} {
  if (remainingHours <= 0) {
    const overdue = Math.abs(remainingHours);
    if (overdue < 1) return { value: 1, unit: 'hours' };
    if (overdue < 48) return { value: Math.ceil(overdue), unit: 'hours' };
    return { value: Math.ceil(overdue / 24), unit: 'days' };
  }
  if (remainingHours < 1) {
    return { value: Math.max(1, Math.ceil(remainingHours * 60)), unit: 'minutes' };
  }
  if (remainingHours < 48) {
    return { value: Math.ceil(remainingHours), unit: 'hours' };
  }
  return { value: Math.ceil(remainingHours / 24), unit: 'days' };
}
