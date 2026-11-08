/**
 * Status transition engine (lib/platform/transitions.ts).
 *
 * PLAT-REQ-005: every status transition records {from, to, actor, timestamp, note?}
 * atomically with the status change. Invalid transitions return 409.
 *
 * Allowed transitions (from WO-000 / spec 3.3):
 *   submitted   → routed, cancelled
 *   routed      → in_progress, cancelled
 *   in_progress → resolved, cancelled
 *   resolved    → (terminal)
 *   closed      → (terminal)
 *   cancelled   → (terminal)
 *
 * Backend-agnostic: works on Prisma or the in-memory dev store.
 *
 * CONCURRENCY (2026-11-08)
 * --------------------------
 * This function used to be a non-atomic read-modify-write:
 *
 *   const ticket = await db.ticket.findUnique({ where: { id } });  // READ
 *   const allowed = ALLOWED[ticket.status];                         // validate on a STALE read
 *   await db.ticket.update({ where: { id }, data: { status } });    // WRITE, id-only predicate
 *   await db.trail.create({ ... });                                 // separate statement
 *   await writeAudit({ ... });                                      // separate statement
 *
 * Two dispatchers transitioning the same ticket both passed the
 * validation, and the second write silently overwrote the first. The
 * trail insert and the audit write were separate statements on top of
 * that, so the citizen-facing status trail could record a sequence
 * that could not legally have happened — for instance a ticket that
 * ended `cancelled` carrying a row claiming `in_progress`. The status
 * trail is the platform's central trust surface, so that is the worst
 * possible place for a lost update.
 *
 * The fix has three parts:
 *
 *   1. A COMPARE-AND-SWAP WRITE. The update carries the status (and,
 *      when the caller supplies one, the version) it read in its
 *      `where` clause, so a writer whose read has been overtaken
 *      updates ZERO rows instead of clobbering the winner. The count
 *      is checked; a count of 0 is a lost update and the transition
 *      is rejected.
 *
 *   2. ONE TRANSACTION. The status update, the trail insert and the
 *      audit write happen inside a single database transaction, so a
 *      partial failure cannot leave a ticket in a new state with no
 *      trail row — or a trail row describing a state the ticket never
 *      reached.
 *
 *   3. THE DEV STORE IMPLEMENTS THE SAME SEMANTICS. The dev store's
 *      read-then-set pair is atomic only by accident of Node's
 *      single-threaded event loop, so a dev-store implementation that
 *      skipped the guard would let CI pass while production silently
 *      lost updates. The dev store's `updateWhere` therefore applies
 *      the same compound guard and returns the same affected-row count.
 *
 * The `version` column (Prisma `Ticket.version Int @default(0)`) is the
 * optimistic-lock counter. The status guard alone is enough to stop the
 * classic double-transition, but the counter also catches writers that
 * mutate a ticket without changing its status (assign-crew, dedup
 * confirm, priority edits) racing a transition — those paths bump the
 * counter so the transition's version guard fails.
 */

import { db } from '@/lib/db-switch';
import { writeAudit } from './audit';
import { freesDedupKey } from './dedup';
import type { TicketStatus } from '@prisma/client';

const ALLOWED: Record<TicketStatus, TicketStatus[]> = {
  submitted: ['routed', 'cancelled'],
  routed: ['in_progress', 'cancelled'],
  in_progress: ['resolved', 'cancelled'],
  resolved: [],
  closed: [],
  cancelled: [],
};

export interface TransitionInput {
  ticketId: string;
  toStatus: TicketStatus;
  actorId: string;
  note?: string;
}

export class InvalidTransitionError extends Error {
  constructor(
    public fromStatus: TicketStatus,
    public toStatus: TicketStatus,
  ) {
    super(`Cannot transition from ${fromStatus} to ${toStatus}`);
    this.name = 'InvalidTransitionError';
  }
}

/**
 * `ConcurrentTransitionError` lives in `lib/platform/concurrency.ts`
 * alongside `ConcurrentWriteError` — the two optimistic-locking
 * failures, one for status transitions and one for non-status field
 * writes. It is re-exported here so the existing importers of
 * `lib/platform/transitions` keep working.
 */
export { ConcurrentTransitionError } from '@/lib/platform/concurrency';
import { ConcurrentTransitionError } from '@/lib/platform/concurrency';

/**
 * Run `fn` inside a single database transaction.
 *
 * On the Prisma path this is `prisma.$transaction(fn)`. On the dev
 * store there is no database, so the "transaction" is a snapshot-and-
 * restore: the dev store's mutable collections are captured before the
 * callback and restored if it throws. That is not a real ACID
 * transaction — the dev store cannot roll back a concurrent write
 * made by another task mid-callback — but it DOES give the same
 * observable guarantee the transition path needs: either all three
 * writes landed or none did.
 */
async function withTransaction<T>(
  fn: (tx: typeof db) => Promise<T>,
): Promise<T> {
  const { runInTransaction } = await import('./transaction');
  return runInTransaction(db, fn);
}

export async function transitionTicket(input: TransitionInput): Promise<void> {
  const ticket = await db.ticket.findUnique({
    where: { id: input.ticketId },
  });
  if (!ticket) {
    throw new Error(`Ticket ${input.ticketId} not found`);
  }
  const allowed = ALLOWED[ticket.status];
  if (!allowed.includes(input.toStatus)) {
    throw new InvalidTransitionError(ticket.status, input.toStatus);
  }

  // The version the read observed. `undefined` means the row predates
  // the version column (or the dev-store fixture omits it), which
  // reads as 0 — the same value the database default produces.
  const expectedVersion = ticket.version ?? 0;

  await withTransaction(async (tx) => {
    // COMPARE-AND-SWAP. The `where` clause carries BOTH the status
    // and the version this call read. If another writer got there
    // first, the predicate matches zero rows and `count` is 0 —
    // the write is rejected rather than clobbering the winner.
    const count = await tx.ticket.updateWhere({
      where: {
        id: input.ticketId,
        status: ticket.status,
        version: expectedVersion,
      },
      data: {
        status: input.toStatus,
        version: expectedVersion + 1,
        ...(input.toStatus === 'resolved'
          ? { resolvedAt: new Date().toISOString() }
          : {}),
        // Release the dedup key when the ticket leaves the open
        // statuses.
        //
        // The key exists to stop an OPEN ticket being shadowed by a
        // second open ticket at the same spot. Once the original is
        // resolved, closed or cancelled, the spot is free again: a
        // citizen who sees the same unrepaired pothole next month
        // must be able to file it. Clearing the key releases the
        // unique index slot, so the next report at that spot
        // succeeds.
        //
        // A ticket that is ALREADY closed keeps a NULL key, so
        // writing NULL is a no-op in that case — it is simply the
        // correct value.
        ...(freesDedupKey(input.toStatus) ? { dedupKey: null } : {}),
      },
    });

    if (count === 0) {
      throw new ConcurrentTransitionError(
        input.ticketId,
        ticket.status,
        input.toStatus,
      );
    }

    await tx.trail.create({
      data: {
        ticketId: input.ticketId,
        toStatus: input.toStatus,
        actorId: input.actorId,
        note: input.note ?? null,
      },
    });

    await writeAudit(
      {
        entityType: 'ticket',
        entityId: input.ticketId,
        action: 'ticket.transition',
        actorId: input.actorId,
        beforeValue: { status: ticket.status },
        afterValue: { status: input.toStatus, note: input.note ?? null },
      },
      tx,
    );
  });
}
