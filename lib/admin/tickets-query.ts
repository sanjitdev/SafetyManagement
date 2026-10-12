/**
 * Admin tickets query helper (lib/admin/tickets-query.ts).
 *
 * Library-level; no React, no Next.js. The route handler at
 * `app/api/v1/admin/tickets/route.ts` calls `listTicketsForAdmin(...)`;
 * the Vitest suite calls `buildWhere(...)` + `clampLimit(...)` to
 * verify the Zod-derived `where` shape without hitting the dev store.
 *
 * Design notes (parallels `lib/admin/audit-query.ts`):
 *
 * - Read-only. No create / update / delete. The ticket write path
 *   is `lib/platform/transitions.ts`; admin writes route through the
 *   shared `POST /api/tickets/:id/transition` endpoint.
 * - Cursor pagination (not offset). Cursor is the ISO timestamp of
 *   the last row on the previous page; the next query is
 *   `createdAt < cursor`. Stable under appends.
 * - Default `from = now - 7d`, `to = now`, `limit = 50` — same
 *   defaults as the audit dashboard so the two surfaces feel
 *   uniform.
 * - Dev-store limitation: the in-memory `db.ticket.findMany` does
 *   NOT honour `createdAt` range queries or `createdAt: { lt: cursor }`
 *   (it supports `status: { in: [...] }`, `locationLat/Lng` range,
 *   and exact equality on every other key, see `lib/dev-store.ts:1148-1176`).
 *   The cursor + date-range filters are therefore applied in code
 *   here, not pushed into the dev store. Prisma's `findMany` would
 *   handle the same `where` natively; the JS path is the v1-correct
 *   code path for both backends.
 */

import { db, getTicketWithTrail } from '@/lib/db-switch';
import { serializeTicketForRole } from '@/lib/serializers/ticket';
import type { SerializedTicket } from '@/lib/serializers/ticket';

const DEFAULT_FROM_DAYS = 7;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MIN_LIMIT = 1;

export type TicketStatusFilter =
  | 'submitted'
  | 'routed'
  | 'in_progress'
  | 'resolved'
  | 'closed'
  | 'cancelled';

export const TICKET_STATUS_VALUES: TicketStatusFilter[] = [
  'submitted',
  'routed',
  'in_progress',
  'resolved',
  'closed',
  'cancelled',
];

export interface AdminTicketsFilters {
  status?: TicketStatusFilter;
  cityId?: string;
  categoryId?: string;
  wardId?: string;
  q?: string; // exact-match ticket id
  from?: string; // ISO
  to?: string; // ISO
}

export interface AdminTicketsQueryInput extends AdminTicketsFilters {
  cursor?: string;
  limit?: number;
}

export interface AdminTicketsQueryResult {
  tickets: SerializedTicket[];
  nextCursor: string | null;
}

interface WhereShape {
  cityId?: string;
  status?: { in: TicketStatusFilter[] } | TicketStatusFilter;
  wardId?: string;
  categoryId?: string;
  id?: string;
  createdAt?: { gte: string; lte: string; lt?: string };
}

export function buildWhere(input: AdminTicketsQueryInput): {
  where: WhereShape;
  fromIso: string;
  toIso: string;
} {
  const toIso = input.to ?? new Date().toISOString();
  const fromMs = input.from
    ? Date.parse(input.from)
    : Date.now() - DEFAULT_FROM_DAYS * 86_400_000;
  const fromIso = input.from ?? new Date(fromMs).toISOString();

  const where: WhereShape = {
    cityId: input.cityId,
    createdAt: { gte: fromIso, lte: toIso },
  };
  if (input.status) {
    where.status = input.status;
  }
  if (input.wardId) {
    where.wardId = input.wardId;
  }
  if (input.categoryId) {
    where.categoryId = input.categoryId;
  }
  if (input.q) {
    where.id = input.q;
  }
  if (input.cursor) {
    where.createdAt = { ...where.createdAt, lt: input.cursor } as {
      gte: string;
      lte: string;
      lt: string;
    };
  }
  return { where, fromIso, toIso };
}

export function clampLimit(n: number | undefined): number {
  if (n === undefined || !Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.max(MIN_LIMIT, Math.min(MAX_LIMIT, Math.floor(n)));
}

function matchesDateRange(
  isoCreatedAt: string,
  fromIso: string,
  toIso: string,
  cursor: string | null,
): boolean {
  // ISO string comparison is lexicographic and matches time order.
  if (isoCreatedAt < fromIso) return false;
  if (isoCreatedAt > toIso) return false;
  if (cursor && !(isoCreatedAt < cursor)) return false;
  return true;
}

export async function listTicketsForAdmin(
  input: AdminTicketsQueryInput,
): Promise<AdminTicketsQueryResult> {
  const { where, fromIso, toIso } = buildWhere(input);
  const limit = clampLimit(input.limit);

  // The dev store's `findMany` accepts the same keys as Prisma (the
  // proxy at `lib/db-switch.ts` normalises the call). The store
  // handles the city/ward/category/status/id equality filters; the
  // date range + cursor are applied in JS below because the dev
  // store's filter logic does not (yet) know about `createdAt`.
  const candidates = await db.ticket.findMany({
    where: where as never,
    orderBy: { createdAt: 'desc' },
  });

  const filtered = candidates.filter((t) =>
    matchesDateRange(t.createdAt, fromIso, toIso, input.cursor ?? null),
  );

  const trimmed = filtered.slice(0, limit);
  const hasMore = filtered.length > limit;

  // Load the trail for each kept row and serialise as the admin role.
  // N+1 for the dev store; v1.1 should batch via
  // `db.ticket.findManyWithTrails`.
  const tickets = await Promise.all(
    trimmed.map(async (t) => {
      const withTrail = await getTicketWithTrail(t.id);
      if (!withTrail) {
        return serializeTicketForRole(
          t as never,
          [],
          'admin',
          'bn',
        );
      }
      return serializeTicketForRole(
        withTrail,
        withTrail.trail,
        'admin',
        'bn',
      );
    }),
  );

  return {
    tickets,
    nextCursor: hasMore
      ? trimmed[trimmed.length - 1].createdAt
      : null,
  };
}

export async function getTicketForAdmin(
  id: string,
): Promise<SerializedTicket | null> {
  const withTrail = await getTicketWithTrail(id);
  if (!withTrail) return null;
  return serializeTicketForRole(withTrail, withTrail.trail, 'admin', 'bn');
}
