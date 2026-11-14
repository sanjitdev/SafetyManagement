/**
 * Resolving the SLA for a batch of tickets
 * (lib/dispatcher/sla-resolve.ts).
 *
 * ── Why a batch helper ─────────────────────────────────────────
 *
 * The dispatcher's queue endpoint returns up to 50 tickets. Resolving
 * the SLA per ticket would mean 50 policy lookups — an N+1 on the
 * endpoint the dispatcher hits every 30 seconds.
 *
 * The policies are keyed by category, and a queue of 50 tickets
 * touches at most a handful of categories. So the helper reads the
 * city's policies ONCE into a map and then answers per ticket from
 * memory.
 *
 * ── The clock start ─────────────────────────────────────────────
 *
 * The SLA clock starts when the ticket is ROUTED (see
 * `lib/dispatcher/sla.ts` for why). The trail is the only record of
 * that transition — the ticket row has no `routedAt` column — so the
 * helper reads it off the ticket's trail.
 */

import { db } from '@/lib/db-switch';
import {
  computeMetSlaState,
  computeSlaState,
  slaStartedAt,
  type SlaState,
  type SlaTone,
} from './sla';

/** The SLA fields the serializer accepts, for one ticket. */
export interface ResolvedSla {
  slaTargetHours: number | null;
  slaRemainingHours: number | null;
  slaStartedAt: string | null;
  slaDueAt: string | null;
  /**
   * The resolved tone.
   *
   * It travels with the row because the tone is the server's
   * answer: it depends on the warning band (a fraction of the
   * target) and on whether the ticket was resolved against its
   * target. A client that re-derived it would duplicate the
   * warning-band rule, and the two copies would drift.
   *
   * `null` when the category has no target — "nothing was
   * promised", which is not the same as "on time".
   */
  slaTone: SlaTone | null;
}

/**
 * Load the city's SLA policies, keyed by category id.
 *
 * A city with no policies yields an empty map, and every ticket then
 * reports "no target" — the correct outcome, and not an error.
 */
export async function loadSlaPoliciesByCategory(
  cityId: string,
): Promise<Map<string, number>> {
  const policies = await db.slaPolicy.findMany({ where: { cityId } });
  const byCategory = new Map<string, number>();
  for (const policy of policies) {
    byCategory.set(policy.categoryId, policy.resolveHours);
  }
  return byCategory;
}

/**
 * The SLA state for a ticket that has not been resolved.
 *
 * `now` is injected so the value is deterministic under test.
 */
export function slaStateFor(
  categoryId: string,
  trail: ReadonlyArray<{ toStatus: string; timestamp: string | Date }>,
  policies: ReadonlyMap<string, number>,
  now: number,
): { state: SlaState; resolved: ResolvedSla } {
  const targetHours = policies.get(categoryId) ?? null;
  const startedAt = slaStartedAt(trail);
  const state = computeSlaState(startedAt, targetHours, now);
  return {
    state,
    resolved: {
      slaTargetHours: state.targetHours,
      slaRemainingHours:
        state.targetHours === null || state.startedAt === null
          ? null
          : state.remainingHours,
      slaStartedAt: state.startedAt,
      slaDueAt: state.dueAt,
      // A ticket with no target has no tone to report. The
      // "not started" tone is a real state (the clock has not
      // begun) but it is not a promise — a category with no
      // policy must not be drawn as "on track", and must not
      // be drawn as "not started" either, because that would
      // imply a target exists.
      slaTone: state.targetHours === null ? null : state.tone,
    },
  };
}

/**
 * The SLA state for a ticket that HAS been resolved.
 *
 * A resolved ticket shows whether the SLA was met or missed, not a
 * countdown against a deadline that no longer exists.
 */
export function slaStateForResolved(
  categoryId: string,
  trail: ReadonlyArray<{ toStatus: string; timestamp: string | Date }>,
  policies: ReadonlyMap<string, number>,
  resolvedAt: string | null,
): { state: SlaState; resolved: ResolvedSla } {
  const targetHours = policies.get(categoryId) ?? null;
  const startedAt = slaStartedAt(trail);
  const state = computeMetSlaState(targetHours, startedAt, resolvedAt);
  return {
    state,
    resolved: {
      slaTargetHours: state.targetHours,
      slaRemainingHours:
        state.targetHours === null || state.startedAt === null
          ? null
          : state.remainingHours,
      slaStartedAt: state.startedAt,
      slaDueAt: state.dueAt,
      slaTone: state.targetHours === null ? null : state.tone,
    },
  };
}
