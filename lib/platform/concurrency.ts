/**
 * Optimistic-locking errors for concurrent ticket writes.
 *
 * `Ticket.version` is an optimistic-lock counter. A writer reads the
 * row, decides what to do, and writes back with the version it read
 * in the `where` clause. If another writer got there first, the
 * write matches zero rows and the caller must be told.
 *
 * Two distinct errors, because the client's response differs:
 *
 *   - `ConcurrentTransitionError` — the caller was changing the
 *     ticket's STATUS. The ticket is in some other legal status.
 *     The client should re-read and re-decide.
 *   - `ConcurrentWriteError` — the caller was changing a
 *     non-status field (assignee, ward, category, internal note).
 *     The ticket's status is untouched; only the field the caller
 *     wanted to change has moved on. The client should re-read and
 *     re-apply.
 *
 * Both are 409. Neither is a 422: the request was legal when it was
 * read, and the ticket is not in an illegal state.
 *
 * Added 2026-11-08 with the compare-and-swap transition (R1) and the
 * version-guarded field writes (R3) — see
 * `docs/CONCURRENCY_AND_ACCOUNTABILITY_AUDIT.md`.
 */

import type { TicketStatus } from '@prisma/client';

/**
 * A status transition lost the race: the ticket's status was not the
 * status the caller read.
 */
export class ConcurrentTransitionError extends Error {
  constructor(
    public ticketId: string,
    public expectedStatus: TicketStatus,
    public toStatus: TicketStatus,
  ) {
    super(
      `Ticket ${ticketId} was modified concurrently: expected status ${expectedStatus}, ` +
        `attempted ${toStatus}`,
    );
    this.name = 'ConcurrentTransitionError';
  }
}

/**
 * A non-status ticket write lost the race: the ticket's version was
 * not the version the caller read.
 */
export class ConcurrentWriteError extends Error {
  constructor(
    public ticketId: string,
    public field: string,
    public expectedVersion: number,
  ) {
    super(
      `Ticket ${ticketId} was modified concurrently: expected version ` +
        `${expectedVersion} while writing "${field}"`,
    );
    this.name = 'ConcurrentWriteError';
  }
}
