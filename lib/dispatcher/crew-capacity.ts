/**
 * Crew capacity — the load limit on a field crew member.
 *
 * WHY THIS EXISTS
 * ---------------
 * The concurrency audit (scenario 5) recorded that a crew member can be
 * assigned N tickets with nothing stopping it, and concluded that
 * "if double-booking is a business rule, it exists nowhere in the
 * codebase. If it is not, the absence should be recorded as a decision
 * rather than left ambiguous."
 *
 * The answer turned out to be that the rule DOES exist — in the UX
 * spec, not in the code. `design-artifacts/C-UX-Scenarios/
 * 02-habib-the-handler/2.4-assign-to-crew/2.4-assign-to-crew.md`
 * specifies:
 *
 *   - the crew card shows "Current load — 3 jobs in progress", with a
 *     **red badge if > 5**;
 *   - the list is **sorted by current load (low first)**;
 *   - and a 409 conflict is returned when "crew just took another job".
 *
 * All three are capacity behaviour. None of them was implemented: the
 * picker returned `{ id, name }` and nothing else, and the assignment
 * endpoint checked only role, ward and department.
 *
 * So this is not an open product question — it is an **unimplemented
 * specification**, and the implementation is what closes the audit
 * finding.
 *
 * WHY THE LIMIT IS A CONSTANT, NOT A DATABASE CONSTRAINT
 * -------------------------------------------------------
 * A capacity limit is a *counting* rule, not a *uniqueness* rule. It
 * cannot be a `@@unique` — the same crew member legitimately holds
 * many tickets, just not more than N. The check is therefore a read
 * followed by a write, which is a check-then-act race in principle.
 *
 * That race is benign here, and deliberately so:
 *
 *   - The worst outcome is that a crew member transiently holds
 *     LIMIT+1 tickets instead of LIMIT. Nobody's data is corrupted;
 *     the dispatcher sees the true load in the picker and in the
 *     monitor chart, and the extra ticket can be reassigned.
 *   - Closing it properly would need a serialisable transaction or a
 *     row lock on the crew member, which would mean taking a lock in
 *     the middle of the assignment path — a real cost for a soft
 *     business rule.
 *
 * This is the same trade the audit accepted for the dedup path, where
 * a `Serializable` transaction would have bought nothing over the
 * unique index. Here there is no index to reach for, so the race is
 * accepted and the count is re-read *after* the write as well, so the
 * audit trail records what actually happened.
 *
 * WHAT COUNTS AS "LOAD"
 * ---------------------
 * An **active** ticket: assigned to the crew member and not in a
 * terminal state. `submitted`, `routed` and `in_progress` count.
 * `resolved`, `closed` and `cancelled` do not — work that is finished
 * or cancelled is not work in progress, and a crew member who closed
 * their last ticket must be assignable again immediately.
 *
 * This matches `buildCrewLoad` in `lib/dispatcher/monitor.ts`, which
 * is the chart the dispatcher already reads to see who is busy. The
 * picker and the chart must not disagree about what "busy" means, or
 * the dispatcher will see "2 jobs" on the chart and be told "5 jobs" by
 * the picker.
 *
 * Backend-agnostic: works on Prisma or the in-memory dev store.
 */

import { db } from '@/lib/db-switch';
import type { TicketStatus } from '@prisma/client';

/**
 * The maximum number of active tickets one crew member may hold.
 *
 * The UX spec's red badge fires at **> 5**, so 5 is the last load
 * that is not flagged. The limit is 5: a member holding 6 is over
 * the line the spec drew.
 *
 * Exported so the picker, the assign service and the tests all read
 * the same number — a limit that appears as a literal in three places
 * is a limit that will drift.
 */
export const CREW_CAPACITY_LIMIT = 5;

/**
 * The statuses that count towards a crew member's load.
 *
 * Mirrors the open-status set in `lib/platform/dedup.ts`. A ticket
 * leaves the load when it becomes terminal.
 */
const ACTIVE_STATUSES: TicketStatus[] = ['submitted', 'routed', 'in_progress'];

export interface CrewLoad {
  /** The crew user's id. */
  crewId: string;
  /** How many active tickets the crew member currently holds. */
  activeCount: number;
}

/**
 * Count the active tickets a crew member currently holds.
 *
 * `excludeTicketId` is the ticket being assigned. Without it, a
 * dispatcher who re-assigns a ticket that is *already* assigned to the
 * same crew member would be counted against that member's own load —
 * the ticket would appear twice (once as the existing assignment, once
 * as the new one) and the dispatcher would be told the member is over
 * capacity when they are not.
 */
export async function countCrewActiveLoad(
  crewId: string,
  excludeTicketId?: string,
): Promise<number> {
  const rows = await db.ticket.findMany({
    where: {
      assignedCrewId: crewId,
      status: { in: ACTIVE_STATUSES },
    },
  });
  return rows.filter((t) => t.id !== excludeTicketId).length;
}

/**
 * Load for several crew members at once.
 *
 * The picker needs every candidate's load, not one member's, so it
 * would otherwise issue one query per crew member. This issues one
 * query for the whole set.
 */
export async function countCrewActiveLoads(
  crewIds: string[],
): Promise<Map<string, number>> {
  const loads = new Map<string, number>();
  if (crewIds.length === 0) return loads;

  const rows = await db.ticket.findMany({
    where: {
      assignedCrewId: { in: crewIds },
      status: { in: ACTIVE_STATUSES },
    },
  });
  for (const id of crewIds) loads.set(id, 0);
  for (const t of rows) {
    if (!t.assignedCrewId) continue;
    loads.set(t.assignedCrewId, (loads.get(t.assignedCrewId) ?? 0) + 1);
  }
  return loads;
}

export interface CrewCapacityCheck {
  /** The member's active-ticket count, excluding the ticket being assigned. */
  activeCount: number;
  /** The limit in force. */
  limit: number;
  /** `true` when the member is at or over the limit. */
  atCapacity: boolean;
}

/**
 * Check whether a crew member can take one more ticket.
 *
 * Returns the count and the verdict rather than throwing, so the
 * caller can decide how to surface it — the assign service turns it
 * into a 409, while the picker reads the count to sort and badge.
 */
export async function checkCrewCapacity(
  crewId: string,
  excludeTicketId?: string,
): Promise<CrewCapacityCheck> {
  const activeCount = await countCrewActiveLoad(crewId, excludeTicketId);
  return {
    activeCount,
    limit: CREW_CAPACITY_LIMIT,
    atCapacity: activeCount >= CREW_CAPACITY_LIMIT,
  };
}
