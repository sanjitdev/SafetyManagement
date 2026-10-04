/**
 * Audit log writer (lib/platform/audit.ts).
 *
 * PLAT-REQ-007: append-only audit log. Every ticket transition and every
 * per-city config change recorded.
 *
 * The API layer never exposes UPDATE/DELETE on AuditEntry — enforced via
 * Prisma client wrappers if needed in v1.1. For now, the audit module is
 * the only place that writes audit entries.
 */

import { prisma } from '@/lib/db';

export interface AuditWriteInput {
  entityType: 'ticket' | 'city' | 'category' | 'department' | 'ward' | 'user';
  entityId: string;
  action: string; // e.g. "ticket.transition", "category.update"
  actorId: string;
  beforeValue?: Record<string, unknown>;
  afterValue?: Record<string, unknown>;
}

export async function writeAudit(input: AuditWriteInput): Promise<void> {
  await prisma.auditEntry.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      actorId: input.actorId,
      beforeValue: input.beforeValue
        ? JSON.parse(JSON.stringify(input.beforeValue))
        : undefined,
      afterValue: input.afterValue
        ? JSON.parse(JSON.stringify(input.afterValue))
        : undefined,
    },
  });
}