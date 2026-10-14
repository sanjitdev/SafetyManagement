/**
 * Actor-role map builder (lib/identity/actor-role-map.ts).
 *
 * Intent 008 / Bolt 008-002 — Story 002 (Render Display Names on
 * Ticket Surfaces). Builds a (actorId → role) lookup from a
 * flat list of actor ids. Used by the dispatcher / crew route
 * handlers to enrich the ticket serializer with the role each
 * trail entry's actor had, so the client can render the actor's
 * display name (via lib/identity/display-name.ts) without a
 * second round-trip.
 *
 * The function is intentionally a thin wrapper around
 * `db.user.findUnique` so the route handler does not need to
 * know about the Prisma vs. dev-store split. Unknown ids are
 * silently dropped (the serializer falls back to the raw id).
 *
 * The role returned is the role the actor had at lookup time —
 * the user table does not store role history, and v1 does not
 * need it (a dispatcher is always a dispatcher in v1).
 */

import { db } from '@/lib/db-switch';

export type ActorRole = 'citizen' | 'dispatcher' | 'crew' | 'admin';

/**
 * Build a `{ [actorId]: role }` map from a flat list of ids.
 *
 * Returns an empty object for an empty input. Uses
 * `db.user.findUnique` so the implementation is backend-agnostic
 * (Prisma or in-memory dev store).
 */
export async function buildActorRoleMap(
  actorIds: ReadonlyArray<string>,
): Promise<Record<string, ActorRole>> {
  const out: Record<string, ActorRole> = {};
  if (actorIds.length === 0) return out;
  // De-duplicate before the round-trips.
  const unique = Array.from(new Set(actorIds.filter((id) => !!id)));
  // Issue the lookups in parallel — they share no state and the
  // dev store is in-memory so the parallelism is free.
  await Promise.all(
    unique.map(async (id) => {
      const u = await db.user.findUnique({ where: { id } });
      if (u) {
        out[id] = u.role as ActorRole;
      }
    }),
  );
  return out;
}
