/**
 * Types + values for the admin tickets query (lib/admin/tickets-query-types.ts).
 *
 * This file is intentionally side-effect-free (no db, no auth, no
 * Prisma client) so the client `AdminTicketsFilters` component
 * can import the status enum and the filter shape from it without
 * dragging the `lib/db-switch` → `lib/auth/session` →
 * `next/headers` chain into a client bundle. The runtime query
 * helper (`lib/admin/tickets-query.ts`) re-uses these types and
 * also pulls the dev/Prisma db.
 *
 * The audit dashboard does the same split by keeping the type
 * and runtime helpers in the same file (it works because the
 * audit client component imports only `import type` aliases,
 * which TypeScript fully erases at compile time). The new
 * tickets filter UI needs the *value* `TICKET_STATUS_VALUES`
 * for the `<select>` options, so we can't rely on type-only
 * import erasure here.
 */

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
