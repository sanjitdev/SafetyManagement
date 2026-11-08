/**
 * List crew users scoped to a (cityId, wardId) pair.
 *
 * Bolt 007-002 (Intent 007 — Citizen Resolution Visibility):
 * the dispatcher crew picker surface.
 *
 * Returns `{ id, name }[]` ordered by `name` ASC. Used by:
 *   - `app/api/v1/dispatcher/tickets/[id]/route.ts` GET to
 *     populate the picker's `<select>` options.
 *   - the service-layer unit test in
 *     `tests/unit/dispatcher/list-crew-for-ward.test.ts`.
 *
 * Filter is the (cityId, role: 'crew', wardId) triple. The
 * service does NOT verify the calling session's scope — the
 * route is responsible for that via `requireSameCity` +
 * `requireScope` on the ticket. This function is a pure
 * DB query; the route is the trust boundary.
 *
 * DEPARTMENT FILTER
 * -----------------
 * `departmentId` is optional. When supplied, only crew members in
 * that department are returned.
 *
 * It exists because a crew member's department decides which tickets
 * they can see: `GET /api/v1/crew/tickets` filters on the ticket's
 * CATEGORY department matching the CREW MEMBER's department. Offering
 * a roads-drainage crew member on a streetlight ticket produced an
 * assignment that vanished from that member's list — the dispatcher
 * believed the work was assigned and nobody could see it. The picker
 * now only offers crew that can actually take the ticket.
 *
 * A crew member with NO department (`departmentId === null`) is a
 * general-purpose responder and is always eligible.
 *
 * LOAD
 * ----
 * The returned list carries each member's **current load** — the
 * number of active (non-terminal) tickets they hold — because the UX
 * spec (`2.4-assign-to-crew.md`) designs the crew card to show it:
 *
 *   - "Current load — 3 jobs in progress", badged **red if > 5**;
 *   - sorted by best fit first: specialty match → **current load
 *     (low first)** → distance → last activity;
 *   - and a 409 when "crew just took another job".
 *
 * The badge and the sort are the dispatcher's *hint*. The load-bearing
 * check is `lib/dispatcher/crew-capacity.ts`, enforced by the assign
 * service — the same "picker UI is a hint, the endpoint is the trust
 * boundary" discipline the rest of this file follows.
 *
 * Sorting here is by load **then** name. The UX spec's full ordering
 * (specialty → load → distance → last activity) cannot be completed
 * here: distance needs the crew member's last known location, which
 * v1 approximates from their last ticket, and "last activity" is a
 * timestamp the `User` row does not carry. The department filter
 * already implements the specialty-match step.
 *
 * Backend-agnostic: works on Prisma or the in-memory dev
 * store. The dev-store implementation lives in
 * `lib/dev-store.ts`; the Prisma path is the `prisma.user.findMany`
 * with the same `where` shape.
 */

import { db } from '@/lib/db-switch';
import { countCrewActiveLoads, CREW_CAPACITY_LIMIT } from '@/lib/dispatcher/crew-capacity';

export interface CrewMember {
  id: string;
  name: string;
  /** The member's active-ticket count. */
  activeCount: number;
  /** The load limit in force — so the client need not hard-code it. */
  capacityLimit: number;
  /** `true` when the member is at or over the limit. */
  atCapacity: boolean;
}

export async function listCrewForWard(args: {
  cityId: string;
  wardId: string;
  /** Optional department filter — see the docblock. */
  departmentId?: string | null;
}): Promise<CrewMember[]> {
  const rows = await db.user.findMany({
    where: {
      cityId: args.cityId,
      role: 'crew',
      wardId: args.wardId,
    },
    orderBy: { name: 'asc' },
  });
  const filtered = args.departmentId
    ? rows.filter(
        (u) => u.departmentId === null || u.departmentId === args.departmentId,
      )
    : rows;

  // One query for the whole roster, not one per member.
  const loads = await countCrewActiveLoads(filtered.map((u) => u.id));

  return filtered
    .map((u) => {
      const activeCount = loads.get(u.id) ?? 0;
      return {
        id: u.id,
        name: u.name,
        activeCount,
        capacityLimit: CREW_CAPACITY_LIMIT,
        atCapacity: activeCount >= CREW_CAPACITY_LIMIT,
      };
    })
    // Least-loaded first; name breaks ties so the order is stable.
    .sort((a, b) =>
      a.activeCount === b.activeCount
        ? a.name.localeCompare(b.name)
        : a.activeCount - b.activeCount,
    );
}
