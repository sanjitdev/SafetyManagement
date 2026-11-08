/**
 * Audit query helper (lib/admin/audit-query.ts).
 *
 * Bolt 005-004 (Intent 005, Unit 004) — admin audit dashboard
 * read surface. Library-level; no React, no Next.js. The route
 * handler at `app/api/v1/admin/audit/route.ts` calls
 * `listAuditEntries(...)`; the Vitest suite calls `buildWhere(...)`
 * to verify the Zod-derived `where` shape without hitting the dev
 * store.
 *
 * Design notes (see `bolts/005-004-audit-dashboard/ddd-01-domain-model.md`
 * + `ddd-03-adr-analysis.md`):
 *
 * - Read-only. No create / update / delete. The audit log is
 *   append-only by ADR-005.
 * - Cursor pagination (not offset). The cursor is the ISO
 *   timestamp of the last row on the previous page; the next
 *   query is `createdAt < cursor`. Stable under appends.
 * - `actorName` is server-side resolved (one `user.findUnique`
 *   per actor; v1 admin set is single-digit so N+1 is per-actor,
 *   not per-row). v1.1 may add `db.user.findManyByIds`.
 */

import { db } from '@/lib/db-switch';
import { nowIso, nowMs } from '@/lib/format/clock';
import type { AuditWriteInput } from '@/lib/platform/audit';

const DEFAULT_FROM_DAYS = 7;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MIN_LIMIT = 1;

export type AuditEntityType = AuditWriteInput['entityType'];
export type AuditRole = 'citizen' | 'dispatcher' | 'crew' | 'admin';

export interface AuditEntryView {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: AuditRole;
  action: string;
  entityType: AuditEntityType;
  entityId: string;
  beforeValue: Record<string, unknown> | null;
  afterValue: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditQueryFilters {
  actorId?: string;
  action?: string[];
  entityType?: AuditEntityType[];
  from?: string;
  to?: string;
}

export interface AuditQueryInput extends AuditQueryFilters {
  cursor?: string;
  limit?: number;
}

export interface AuditQueryResult {
  entries: AuditEntryView[];
  nextCursor: string | null;
}

interface AdminActor {
  id: string;
  name: string;
  role: AuditRole;
}

export function buildWhere(input: AuditQueryInput): {
  where: NonNullable<
    Parameters<typeof db.audit.findMany>[0]
  >['where'];
  fromIso: string;
  toIso: string;
} {
  /*
   * The default window is computed from the PINNED clock, not the wall
   * clock.
   *
   * This window decides WHICH ROWS APPEAR. The seed writes rows at
   * fixed offsets from the pinned epoch, so a wall-clock window can
   * include a different set of them on each run — and the rendered
   * table, and any screenshot of it, changes with the clock.
   */
  const toIso = input.to ?? nowIso();
  const fromMs = input.from
    ? Date.parse(input.from)
    : nowMs() - DEFAULT_FROM_DAYS * 86_400_000;
  const fromIso = input.from ?? new Date(fromMs).toISOString();

  const where: Record<string, unknown> = {
    createdAt: { gte: fromIso, lte: toIso },
  };
  if (input.actorId) {
    where.actorId = input.actorId;
  }
  if (input.action && input.action.length > 0) {
    where.action =
      input.action.length === 1 ? input.action[0] : { in: input.action };
  }
  if (input.entityType && input.entityType.length > 0) {
    where.entityType =
      input.entityType.length === 1
        ? input.entityType[0]
        : { in: input.entityType };
  }
  if (input.cursor) {
    (where.createdAt as Record<string, string>).lt = input.cursor;
  }
  return { where: where as never, fromIso, toIso };
}

export function clampLimit(n: number | undefined): number {
  if (n === undefined || !Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.max(MIN_LIMIT, Math.min(MAX_LIMIT, Math.floor(n)));
}

/**
 * The role encoded in an actor id, used only when the actor's user
 * row can no longer be found.
 *
 * Every seeded and generated user id carries its role as
 * `user_<role>_<name>` (`user_admin_dncc`, `user_crew_rashid`). When
 * the user row is gone the id is all that is left, and reading the
 * role from it beats guessing "citizen" — which would misattribute
 * an admin action to a citizen in the audit trail.
 *
 * An id with no recognisable role prefix falls back to `citizen`,
 * the most common actor type.
 */
export function roleFromActorId(actorId: string): AuditRole {
  const m = /^user_(admin|dispatcher|crew|citizen)_/.exec(actorId);
  return (m?.[1] as AuditRole | undefined) ?? 'citizen';
}

async function hydrateActors(
  ids: string[],
): Promise<Map<string, AdminActor>> {
  const out = new Map<string, AdminActor>();
  for (const id of ids) {
    const u = await db.user.findUnique({ where: { id } });
    if (u) {
      out.set(id, {
        id: u.id,
        name: u.name,
        role: u.role as AuditRole,
      });
    }
  }
  return out;
}

export async function listAuditEntries(
  input: AuditQueryInput,
): Promise<AuditQueryResult> {
  const { where } = buildWhere(input);
  const limit = clampLimit(input.limit);
  const rows = await db.audit.findMany({
    where: where as never,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
  });
  const hasMore = rows.length > limit;
  const trimmed = hasMore ? rows.slice(0, limit) : rows;
  const actors = await hydrateActors(
    [...new Set(trimmed.map((r) => r.actorId))],
  );
  const entries: AuditEntryView[] = trimmed.map((r) => {
    const a = actors.get(r.actorId);
    // An actor whose user row no longer exists (deleted, or an id
    // written by a script that never created the user) must NOT be
    // rendered as a raw id in the audit table, and must NOT be
    // silently labelled a citizen — that misattributes the action.
    // The `user_<role>_` id prefix is the only signal left, so read
    // the role from it and show the id as a "(deleted user)" name.
    const fallbackRole = roleFromActorId(r.actorId);
    return {
      id: r.id,
      actorId: r.actorId,
      actorName: a
        ? `${a.name} (${a.role})`
        : `${r.actorId} (${fallbackRole} — deleted user)`,
      actorRole: a?.role ?? fallbackRole,
      action: r.action,
      entityType: r.entityType as AuditEntityType,
      entityId: r.entityId,
      beforeValue: r.beforeValue,
      afterValue: r.afterValue,
      createdAt: r.timestamp,
    };
  });
  return {
    entries,
    nextCursor: hasMore ? trimmed[trimmed.length - 1].timestamp : null,
  };
}
