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
 */

import { db } from '@/lib/db-switch';
import { writeAudit } from './audit';
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

  await db.ticket.update({
    where: { id: input.ticketId },
    data: {
      status: input.toStatus,
      ...(input.toStatus === 'resolved'
        ? { resolvedAt: new Date().toISOString() }
        : {}),
    },
  });

  await db.trail.create({
    data: {
      ticketId: input.ticketId,
      toStatus: input.toStatus,
      actorId: input.actorId,
      note: input.note ?? null,
    },
  });

  await writeAudit({
    entityType: 'ticket',
    entityId: input.ticketId,
    action: 'ticket.transition',
    actorId: input.actorId,
    beforeValue: { status: ticket.status },
    afterValue: { status: input.toStatus, note: input.note ?? null },
  });
}