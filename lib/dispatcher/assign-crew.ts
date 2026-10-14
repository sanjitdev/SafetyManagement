/**
 * Dispatcher service: assign or unassign a crew member on a ticket.
 *
 * Bolt 007-002 (Intent 007 — Citizen Resolution Visibility):
 * the dispatcher crew picker.
 *
 * The endpoint is the load-bearing trust boundary — the picker
 * UI is a hint, not the source of truth. The service:
 *
 *   1. Loads the ticket with `getTicketWithTrail(id)`. Out-of-
 *      scope → returns `null` (the route maps to 404).
 *   2. Verifies the same-city + scope (wardId + departmentId)
 *      against the dispatcher's session. Throws `ApiError` on
 *      failure; the route catches.
 *   3. If `assignedCrewId` is non-null:
 *      a. Loads the user with `db.user.findUnique`. Returns
 *         `not_found` (route → 404) if the user does not exist.
 *      b. Verifies `user.role === 'crew'`. Returns `forbidden_role`
 *         (route → 403) otherwise — a dispatcher can't promote
 *         a citizen to crew via this endpoint.
 *      c. Verifies `user.wardId === ticket.wardId`. Returns
 *         `cross_ward_access_denied` (route → 403) otherwise —
 *         this is the load-bearing ward-scope check the unit
 *         tests pin.
 *   4. No-ops (returns the unchanged ticket) when the requested
 *      `assignedCrewId` matches the current value. This keeps
 *      the audit log noise-free and matches the same-ward /
 *      same-category / same-internalNote no-op pattern in the
 *      existing PATCH route.
 *   5. Writes the ticket update via `db.ticket.update`.
 *   6. Writes one `AuditEntry`:
 *        - action `ticket.assign_crew` when assigning.
 *        - action `ticket.unassign_crew` when clearing.
 *      `beforeValue` / `afterValue` carry the full
 *      `{ assignedCrewId: prev | next }` shape.
 *   7. Returns the refreshed ticket via `getTicketWithTrail`.
 *
 * The function throws `ApiError` on every documented failure
 * (matches the established pattern in
 * `app/api/v1/dispatcher/tickets/[id]/route.ts`). The
 * `Result<T, E>` shape mentioned in `team.md` is unwritten at
 * this layer; the route catches and serialises.
 *
 * Backend-agnostic: works on Prisma or the in-memory dev store.
 */

import { db, getTicketWithTrail } from '@/lib/db-switch';
import { ApiError, requireSameCity, requireScope } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/platform/audit';
import type { DevTicketWithTrail } from '@/lib/dev-store';
import type { SessionContext } from '@/lib/auth/session';

export interface AssignCrewInput {
  /** The crew user's id, or `null` to clear the assignment. */
  assignedCrewId: string | null;
}

export interface AssignCrewResult {
  ticket: DevTicketWithTrail;
  /** `true` when the write actually changed `assignedCrewId`. */
  changed: boolean;
  /** The audit action that was written, or `null` on a no-op. */
  auditAction: 'ticket.assign_crew' | 'ticket.unassign_crew' | null;
}

export async function assignCrew(
  ticketId: string,
  input: AssignCrewInput,
  session: SessionContext,
): Promise<AssignCrewResult> {
  const ticket = await getTicketWithTrail(ticketId);
  if (!ticket) {
    throw new ApiError(404, 'not_found');
  }

  // Same-city + scope guard. These mirror the existing PATCH
  // route's `loadInScope`; the route catches and returns 404 on
  // any of these throws (so an out-of-scope ticket is
  // indistinguishable from a missing one).
  try {
    requireSameCity(session, ticket.cityId);
  } catch (e) {
    if (e instanceof ApiError) {
      throw new ApiError(404, 'not_found');
    }
    throw e;
  }
  try {
    requireScope(session, ticket.wardId, ticket.departmentId);
  } catch (e) {
    if (e instanceof ApiError) {
      throw new ApiError(404, 'not_found');
    }
    throw e;
  }

  const prev = ticket.assignedCrewId;
  const next = input.assignedCrewId;

  // No-op: same value as before. Returns the ticket without an
  // audit row so a Save click that didn't change anything
  // doesn't pollute the audit log.
  if (prev === next) {
    return { ticket, changed: false, auditAction: null };
  }

  // Cross-ward / non-crew checks. Only when assigning; clearing
  // (next === null) is always allowed.
  if (next !== null) {
    const crew = await db.user.findUnique({ where: { id: next } });
    if (!crew) {
      throw new ApiError(404, 'not_found');
    }
    if (crew.role !== 'crew') {
      throw new ApiError(403, 'forbidden_role');
    }
    if (crew.wardId !== ticket.wardId) {
      // The load-bearing ward-scope check. A dispatcher cannot
      // assign a crew member from a different ward via this
      // endpoint, even with a valid session.
      throw new ApiError(403, 'cross_ward_access_denied');
    }
  }

  // Apply the change.
  await db.ticket.update({
    where: { id: ticket.id },
    data: { assignedCrewId: next },
  });

  // Audit row. Two actions so the dashboard can grep on either.
  const auditAction: 'ticket.assign_crew' | 'ticket.unassign_crew' =
    next === null ? 'ticket.unassign_crew' : 'ticket.assign_crew';
  await writeAudit({
    entityType: 'ticket',
    entityId: ticket.id,
    action: auditAction,
    actorId: session.userId,
    beforeValue: { assignedCrewId: prev },
    afterValue: { assignedCrewId: next },
  });

  const refreshed = await getTicketWithTrail(ticket.id);
  if (!refreshed) {
    // Should not happen — the row was just updated. Surface a
    // 500 via the route's catch.
    throw new ApiError(500, 'post_assign_fetch_failed');
  }
  return { ticket: refreshed, changed: true, auditAction };
}
