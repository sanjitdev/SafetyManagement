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
  entityType: 'ticket' | 'city' | 'category' | 'department' | 'ward' | 'user' | 'dedupFlag';
  entityId: string;
  action: string; // e.g. "ticket.transition", "category.update"
  actorId: string;
  beforeValue?: Record<string, unknown>;
  afterValue?: Record<string, unknown>;
}

/**
 * The write handle `writeAudit` can use. Structurally the `audit`
 * namespace of the `db` facade — which is also the shape of the
 * transaction-scoped facade built in `lib/platform/transaction.ts`.
 */
type AuditWriteTarget = Pick<typeof db, 'audit'>;

/**
 * Append an audit entry.
 *
 * `target` lets a caller pass a transaction-scoped handle so the audit
 * row commits or rolls back with the change it describes. Without it
 * the write goes through the module-level `db`, which is a SEPARATE
 * statement outside any surrounding transaction — meaning a transition
 * whose audit write failed could still leave the status changed with
 * no audit row, which is exactly the accountability gap the audit log
 * exists to close.
 *
 * Callers that are not inside a transaction can omit `target`; the
 * behaviour is unchanged for them.
 */
export async function writeAudit(
  input: AuditWriteInput,
  target: AuditWriteTarget = db,
): Promise<void> {
  await target.audit.create({
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
