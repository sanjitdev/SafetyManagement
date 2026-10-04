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
 */

import type { TicketStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { writeAudit } from './audit';

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
  // optional scope binding for dispatcher/crew transitions
  expectedWardId?: string;
  expectedDepartmentId?: string;
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

export async function transitionTicket(
  input: TransitionInput,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const client = tx ?? prisma;
  // The transaction wrapper around this function (if any) is the caller's
  // responsibility. Single-ticket transitions are typically called inside a
  // `prisma.$transaction(async (tx) => { ... })` block so the status update
  // + trail entry + audit entry + push notification all succeed or fail
  // together.
  const ticket = await client.ticket.findUnique({
    where: { id: input.ticketId },
    select: { status: true, cityId: true, wardId: true, categoryId: true },
  });
  if (!ticket) {
    throw new Error(`Ticket ${input.ticketId} not found`);
  }
  const allowed = ALLOWED[ticket.status];
  if (!allowed.includes(input.toStatus)) {
    throw new InvalidTransitionError(ticket.status, input.toStatus);
  }

  await client.ticket.update({
    where: { id: input.ticketId },
    data: {
      status: input.toStatus,
      ...(input.toStatus === 'resolved' ? { resolvedAt: new Date() } : {}),
    },
  });

  await client.ticketTrailEntry.create({
    data: {
      ticketId: input.ticketId,
      toStatus: input.toStatus,
      actorId: input.actorId,
      note: input.note,
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