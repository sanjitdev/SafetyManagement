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
}): Promise<CrewMember[]> {
  const rows = await db.user.findMany({
    where: {
      cityId: args.cityId,
      role: 'crew',
      wardId: args.wardId,
    },
    orderBy: { name: 'asc' },
  });
  return rows.map((u) => ({ id: u.id, name: u.name }));
}
