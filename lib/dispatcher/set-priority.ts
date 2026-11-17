/**
 * Dispatcher service: set the triage priority on a ticket.
 *
 * WHY THIS IS A SEPARATE SERVICE, NOT A FIELD ON THE PATCH ROUTE
 * -------------------------------------------------------------
 * The dispatcher PATCH route (`app/api/v1/dispatcher/tickets/[id]`)
 * already writes three fields — ward, category, internal note — and
 * it writes them with a shared `guardedWrite` helper that chains a
 * compare-and-swap per field. Priority could have been a fourth
 * field there, and for the WRITE it nearly is.
 *
 * It is a separate service because priority has two properties the
 * other three do not:
 *
 *   1. It is the one field the DISPATCHER QUEUE sorts by. Every
 *      read of the queue — the list, the counts, the ordering —
 *      depends on it. A field that only exists on the detail
 *      endpoint cannot order a list.
 *   2. It is a TRIAGE DECISION, and the audit trail is where a
 *      decision belongs. `assign-crew` already set that precedent:
 *      it is a separate service precisely so its audit row is
 *      unambiguous (`ticket.assign_crew` vs the route's generic
 *      `reassign`).
 *
 * So this service owns the priority WRITE, its audit row, and its
 * no-op semantics. The queue route owns the priority READ.
 *
 * THE NO-OP
 * ---------
 * Setting the priority to the value it already has writes NO audit
 * row and bumps NO version. A dispatcher clicking "urgent" on a
 * ticket that is already urgent has not made a decision, and an
 * audit trail full of no-op rows is a trail nobody reads. This
 * matches the no-op pattern in `assign-crew` and in the PATCH
 * route's ward/category/note handling.
 *
 * THE COMPARE-AND-SWAP
 * --------------------
 * The write is guarded on `Ticket.version`, exactly as
 * `assign-crew` and the transition path are. Two dispatchers
 * triaging the same ticket concurrently both read
 * `priority = 'low'` and both write. Without the guard the second
 * write silently clobbers the first, and the audit trail would
 * show two plausible decisions with no indication that one was
 * lost — which is precisely the question the audit trail exists to
 * answer.
 *
 * The write also bumps the version, so a status transition that
 * read this ticket before the triage write fails its own
 * compare-and-swap rather than overwriting the new priority.
 *
 * Backend-agnostic: works on Prisma or the in-memory dev store.
 */

import { db, getTicketWithTrail } from '@/lib/db-switch';
import { ApiError, requireSameCity, requireScope } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/platform/audit';
import { ConcurrentWriteError } from '@/lib/platform/concurrency';
import { PRIORITY_ORDER, priorityRank, type TicketPriority } from '@/lib/dispatcher/priority';
import type { DevTicketWithTrail } from '@/lib/dev-store';
import type { SessionContext } from '@/lib/auth/session';

// The scale, its order, and its rank live in `priority.ts` — one
// definition, imported by both the write service and the queue
// sorter. Two copies of the enum would be two places to forget to
// extend when a fifth priority is ever added.
export { PRIORITY_ORDER, priorityRank, type TicketPriority };

export interface SetPriorityInput {
  priority: TicketPriority;
}

export interface SetPriorityResult {
  ticket: DevTicketWithTrail;
  /** `true` when the write actually changed `priority`. */
  changed: boolean;
  /** The audit action that was written, or `null` on a no-op. */
  auditAction: 'ticket.priority' | null;
}

export async function setPriority(
  ticketId: string,
  input: SetPriorityInput,
  session: SessionContext,
): Promise<SetPriorityResult> {
  const ticket = await getTicketWithTrail(ticketId);
  if (!ticket) {
    throw new ApiError(404, 'not_found');
  }

  // Same-city + scope guard, mirroring `assign-crew`. An
  // out-of-scope ticket is reported as `not_found` so its existence
  // is not disclosed.
  try {
    requireSameCity(session, ticket.cityId);
  } catch (e) {
    if (e instanceof ApiError) {
      throw new ApiError(404, 'not_found');
    }
    throw e;
  }
  try {
    requireScope(session, ticket.wardId, ticket.departmentId);
  } catch (e) {
    if (e instanceof ApiError) {
      throw new ApiError(404, 'not_found');
    }
    throw e;
  }

  const prev = (ticket.priority ?? 'low') as TicketPriority;
  const next = input.priority;

  // No-op: same value as before. No audit row, no version bump.
  //
  // The comparison is on the BAND and the TRIAGE STATE, not the band
  // alone. A ticket that has never been triaged carries the default
  // `low` band with a NULL `prioritySetAt`, and a dispatcher who
  // explicitly triages it as `low` HAS made a decision — the two
  // states are not the same, and the queue's ordering depends on the
  // difference.
  //
  // Comparing the band alone would make "explicitly triaged as low"
  // indistinguishable from "nobody has looked at this yet": the
  // no-op would return without stamping `prioritySetAt`, and the
  // ticket would sit in the untriaged part of the queue forever
  // despite a dispatcher having explicitly set it aside.
  //
  // So the no-op is: the band is unchanged AND the ticket has already
  // been triaged. A first-time triage of `low` on an untriaged
  // ticket is a real change and is recorded as one.
  const wasTriaged = ticket.prioritySetAt !== null && ticket.prioritySetAt !== undefined;
  if (prev === next && wasTriaged) {
    return { ticket, changed: false, auditAction: null };
  }

  // A closed ticket is not triaged. Triage ordering applies to
  // OPEN work; letting a dispatcher raise the priority of a
  // resolved ticket would put a dead ticket at the top of a sorted
  // list and make the ordering lie.
  if (
    ticket.status === 'resolved' ||
    ticket.status === 'closed' ||
    ticket.status === 'cancelled'
  ) {
    throw new ApiError(409, 'ticket_not_open');
  }

  // Apply the change — as a compare-and-swap on the version the
  // caller read.
  const expectedVersion = ticket.version ?? 0;
  const count = await db.ticket.updateWhere({
    where: { id: ticket.id, version: expectedVersion },
    data: {
      priority: next,
      // An ISO STRING, not a `Date`.
      //
      // `DevTicket.prioritySetAt` is typed `string | null`, and the
      // dev store's `updateWhere` spreads `data` straight onto the
      // row — so a `Date` would be stored as a `Date` object where
      // the type says a string, and the queue's `toMillis()` helper
      // (which reads `Date.parse(v)`) would then return NaN and
      // sort the ticket LAST. The failure would be invisible: the
      // write succeeds, the row reads back, and only the ORDER is
      // wrong.
      //
      // The Prisma path accepts an ISO string for a `DateTime`
      // column, so one shape serves both backends. This is the same
      // convention as `lib/platform/transitions.ts`.
      prioritySetAt: new Date().toISOString(),
      version: expectedVersion + 1,
    },
  });
  if (count === 0) {
    // Another writer moved the ticket between our read and our write.
    throw new ConcurrentWriteError(ticket.id, 'priority', expectedVersion);
  }

  // The audit row. The before/after pair carries the FULL scale
  // position, not just the enum, so a reader can tell that
  // `low → urgent` is a bigger move than `normal → high` without
  // consulting the enum definition.
  await writeAudit({
    entityType: 'ticket',
    entityId: ticket.id,
    action: 'ticket.priority',
    actorId: session.userId,
    beforeValue: { priority: prev },
    afterValue: { priority: next },
  });

  const refreshed = await getTicketWithTrail(ticket.id);
  if (!refreshed) {
    // Should not happen — the row was just updated.
    throw new ApiError(500, 'post_priority_fetch_failed');
  }
  return { ticket: refreshed, changed: true, auditAction: 'ticket.priority' };
}
