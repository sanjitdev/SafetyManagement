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
 * Backend-agnostic: works on Prisma or the in-memory dev
 * store. The dev-store implementation lives in
 * `lib/dev-store.ts`; the Prisma path is the `prisma.user.findMany`
 * with the same `where` shape.
 */

import { db } from '@/lib/db-switch';

export interface CrewMember {
  id: string;
  name: string;
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
  return filtered.map((u) => ({ id: u.id, name: u.name }));
}
