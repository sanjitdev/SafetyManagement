/**
 * Audit log writer (lib/platform/audit.ts).
 *
 * PLAT-REQ-007: append-only audit log. Every ticket transition and every
 * per-city config change recorded.
 *
 * Backend-agnostic: writes to the in-memory dev store when
 * CITYFIX_DEV_STORE is set, otherwise Prisma. The Prisma client
 * (lib/db.ts) is unchanged.
 */

import { db } from '@/lib/db-switch';

export interface AuditWriteInput {
  entityType: 'ticket' | 'city' | 'category' | 'department' | 'ward' | 'user';
  entityId: string;
  action: string; // e.g. "ticket.transition", "category.update"
  actorId: string;
  beforeValue?: Record<string, unknown>;
  afterValue?: Record<string, unknown>;
}

export async function writeAudit(input: AuditWriteInput): Promise<void> {
  await db.audit.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      actorId: input.actorId,
      beforeValue: input.beforeValue ?? null,
      afterValue: input.afterValue ?? null,
    },
  });
}
