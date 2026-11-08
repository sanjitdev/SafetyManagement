/**
 * Transaction helper (lib/platform/transaction.ts).
 *
 * WHY THIS EXISTS
 * ---------------
 * The status-transition path writes to three tables in one logical
 * operation: the `Ticket` row (status), the `TicketTrailEntry` row
 * (the citizen-facing status trail) and the `AuditEntry` row (the
 * immutable audit log). Before this helper those were three separate
 * statements, so a failure between them left the platform describing
 * a transition that had not fully happened:
 *
 *   - status written, trail insert failed → the citizen sees a ticket
 *     whose status changed with no explanation of how it got there
 *   - status + trail written, audit write failed → the transition is
 *     invisible to the audit log, which is the record the platform
 *     relies on for accountability
 *
 * The fix is to run all three inside one transaction, so the operation
 * is all-or-nothing.
 *
 * THE TWO BACKENDS
 * ----------------
 * Prisma path: `prisma.$transaction(async (tx) => { ... })`. The `tx`
 * client is a transaction-scoped Prisma client, so every statement
 * inside it either commits together or rolls back together.
 *
 * Dev-store path: there is no database, so there is nothing to commit
 * or roll back. The dev store instead SNAPSHOTS its mutable
 * collections before the callback and RESTORES them if the callback
 * throws. That is not an ACID transaction — the dev store cannot undo
 * a concurrent write made by another task mid-callback — but it does
 * give the transition path the guarantee it actually needs: either
 * the status, the trail row and the audit row all landed, or none of
 * them did. That is the same observable behaviour a caller sees from
 * a rolled-back Prisma transaction, which is what the unit suite
 * asserts against.
 *
 * WHY NOT JUST USE THE SNAPSHOT FOR EVERYTHING
 * ---------------------------------------------
 * Because the Prisma path has a real database, and a real database's
 * transaction is stronger than a snapshot: it holds locks, so a
 * concurrent writer blocks rather than interleaving. The snapshot
 * approach is only a stand-in for the dev store, where the test suite
 * runs. Using it in production would be strictly worse than what we
 * have.
 */

import { getStore, isDevStore } from '@/lib/dev-store';
import { prisma } from '@/lib/db';

/**
 * The `db` facade's shape, as far as the transaction helper needs it.
 *
 * Declared structurally rather than imported from `lib/db-switch.ts`
 * because `lib/db-switch.ts` imports this module — a value import
 * would create a module-initialisation cycle. The type-only import
 * below is erased at compile time, so it costs nothing at runtime.
 */
type DbLike = typeof import('@/lib/db-switch').db;

/**
 * The transaction-scoped Prisma client. Structurally the same as the
 * root client, but every statement it issues participates in the
 * open transaction.
 */
type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Run `fn` inside a single transaction.
 *
 * `fn` receives a transaction-scoped handle with the same shape as the
 * `db` facade. On the Prisma path that handle is a facade over the
 * transaction-scoped Prisma client, so `tx.ticket.updateWhere(...)`,
 * `tx.trail.create(...)` and `tx.audit.create(...)` all run on the
 * same transaction.
 *
 * `db` is passed in by the caller rather than imported so this module
 * does not need to reach back into `lib/db-switch.ts` — which imports
 * this module.
 */
export async function runInTransaction<T>(
  db: DbLike,
  fn: (tx: DbLike) => Promise<T>,
): Promise<T> {
  if (isDevStore()) {
    return runInDevStoreTransaction(db, fn);
  }
  return prisma.$transaction(async (tx) => {
    return fn(buildTransactionFacade(db, tx));
  });
}

/**
 * Snapshot-and-restore transaction for the in-memory dev store.
 *
 * The snapshot is shallow per collection but deep enough for the
 * transition path: the `tickets` map's ticket rows are copied into a
 * new map, and the `trail` and `audit` arrays are copied into new
 * arrays. A rollback restores the store to the snapshot, so any
 * mutation the callback made to a ticket row, a trail entry or an
 * audit entry is discarded.
 *
 * CONCURRENT WRITERS (2026-11-08)
 * -------------------------------
 * The first version of this helper restored the collections by
 * REPLACING them wholesale:
 *
 *   store.trail.length = 0;
 *   store.trail.push(...trailSnapshot);
 *
 * That is correct for a single writer and WRONG for two. Two
 * concurrent transitions both snapshot the trail; the winner appends
 * its row; the loser then rolls back and replaces the whole trail
 * with its own (pre-race) snapshot — erasing the WINNER's row. The
 * observable result was a ticket whose status had advanced with no
 * trail row explaining it, which is exactly the defect the
 * transaction was introduced to prevent. The dev store's rollback
 * was manufacturing the very corruption the Prisma path's rollback
 * avoids.
 *
 * The fix is to restore only the rows THIS callback added or
 * modified, leaving other writers' rows alone:
 *
 *   - Trail and audit are APPEND-ONLY. A rollback removes the rows
 *     this callback appended (matched by id) and leaves rows added
 *     by anyone else in place.
 *   - Tickets are MUTABLE. A rollback restores only the ticket rows
 *     this callback actually changed, back to the value they had in
 *     the snapshot. Rows another writer changed after the snapshot
 *     are left as that writer left them.
 *
 * The Prisma path has a real database and a real transaction, so this
 * problem does not arise there — the `tx` client's writes are
 * invisible to other transactions and a rollback touches only its own
 * writes. This fix brings the dev store's observable behaviour in
 * line with that.
 *
 * Mutations to collections NOT captured here (sessions, otps,
 * dedupFlags, photos) are not rolled back. The transition path does
 * not touch them, so this is sufficient for its purpose — but it is
 * a limitation of the dev store, not of the Prisma path, and it is
 * stated here so nobody widens the dev store's use of this helper
 * without widening the snapshot.
 */
async function runInDevStoreTransaction<T>(
  db: DbLike,
  fn: (tx: DbLike) => Promise<T>,
): Promise<T> {
  const store = getStore();

  // The ticket rows as they stood BEFORE the callback runs. A rollback
  // consults this to decide which rows to put back.
  const ticketsSnapshot = new Map(store.tickets);

  // The ids of the trail and audit rows THIS callback appends. The
  // rollback removes exactly these, and nothing else — see the
  // concurrency note above for why a whole-collection restore is
  // wrong.
  const trailIdsWritten = new Set<string>();
  const auditIdsWritten = new Set<string>();

  try {
    // The dev store has no separate transaction-scoped client — its
    // recording facade IS the transaction, so the facade below is the
    // transaction handle.
    return await fn(buildDevStoreFacade(db, trailIdsWritten, auditIdsWritten));
  } catch (error) {
    // TICKETS. Restore only the rows THIS callback changed. A row is
    // "ours" if it differs from the snapshot AND carries the version
    // this callback's write produced. If another writer has since
    // moved the row on (its version differs from what we wrote),
    // that writer's write wins — clobbering it would be the same
    // lost-update bug in reverse.
    for (const [key, before] of ticketsSnapshot) {
      const current = store.tickets.get(key);
      if (!current) continue;
      if (current === before) continue; // untouched by this callback
      const currentVersion = current.version ?? 0;
      const beforeVersion = before.version ?? 0;
      // We only own the row if we are the ones who moved the version
      // forward (the transition path writes `version: expected + 1`).
      // Otherwise it was moved by somebody else and we leave it alone.
      if (currentVersion !== beforeVersion + 1) continue;
      store.tickets.set(key, before);
    }

    // TRAIL and AUDIT are append-only. Remove ONLY the rows this
    // callback appended. Rows written by another writer — including
    // rows that landed after this callback's snapshot was taken — are
    // left alone.
    if (trailIdsWritten.size > 0) {
      store.trail = store.trail.filter((e) => !trailIdsWritten.has(e.id));
    }
    if (auditIdsWritten.size > 0) {
      store.audit = store.audit.filter((e) => !auditIdsWritten.has(e.id));
    }

    throw error;
  }
}

/**
 * Build the dev store's transaction handle.
 *
 * The dev store has no transaction-scoped client, so this facade
 * delegates to the ordinary one — but it RECORDS the ids of the
 * trail and audit rows the callback appends. That record is what
 * lets a rollback remove exactly this callback's rows and no
 * others.
 *
 * The recording is why a plain "restore the snapshot" rollback is not
 * sufficient here: with two concurrent writers, one writer's
 * snapshot can already contain the other's rows, and a wholesale
 * restore then erases a row the other writer legitimately wrote.
 */
function buildDevStoreFacade(
  db: DbLike,
  trailIdsWritten: Set<string>,
  auditIdsWritten: Set<string>,
): DbLike {
  return new Proxy(db, {
    get(target, prop) {
      if (prop === 'trail' || prop === 'audit') {
        const namespace = target[prop as keyof DbLike] as Record<string, unknown>;
        const written =
          prop === 'trail' ? trailIdsWritten : auditIdsWritten;
        return new Proxy(namespace, {
          get(ns, method) {
            const impl = ns[method as string];
            if (method !== 'create' || typeof impl !== 'function') {
              return typeof impl === 'function'
                ? impl.bind(ns)
                : impl;
            }
            return async (args: { data: Record<string, unknown> }) => {
              const created = (await impl.call(ns, args)) as { id?: string };
              if (created?.id) written.add(created.id);
              return created;
            };
          },
        });
      }
      return Reflect.get(target, prop, target);
    },
  });
}

/**
 * Build a facade over a transaction-scoped Prisma client.
 *
 * Only the namespaces the transition path needs are re-pointed at the
 * transaction client. The remaining namespaces are delegated through
 * to the root facade — but that is a real limitation, not a cosmetic
 * one: a statement made through a non-transactional namespace would
 * NOT be part of the transaction. The transition path only uses
 * `ticket`, `trail` and `audit`, and `writeAudit` writes through
 * `db.audit`, which is covered.
 */
function buildTransactionFacade(db: DbLike, tx: PrismaTx): DbLike {
  return new Proxy(db, {
    get(target, prop) {
      if (prop === 'ticket' || prop === 'trail' || prop === 'audit') {
        return buildScopedFacade(
          target[prop as keyof DbLike],
          tx,
          prop,
        );
      }
      return Reflect.get(target, prop, target);
    },
  });
}

/**
 * Build one namespace's facade over the transaction-scoped client.
 *
 * The transaction-scoped Prisma client exposes the same model
 * delegates as the root client (`tx.ticket`, `tx.ticketTrailEntry`,
 * `tx.auditEntry`), so the namespace's methods are re-pointed at
 * them. The method names differ between the dev store and Prisma in
 * a few places (`trail.create` → `ticketTrailEntry.create`), so the
 * mapping is explicit rather than derived.
 *
 * THE COMPARSE-AND-SWAP (2026-11-08)
 * ----------------------------------
 * `updateWhere` and `bumpVersion` are FACADE methods, not Prisma
 * methods — they are defined on the `db` facade in `lib/db-switch.ts`
 * and they reach for the module-level `prismaClient`. If the scoped
 * facade simply bound them, the write would ESCAPE the transaction:
 * it would run on the root client, outside the open transaction, and
 * would not roll back with the rest of the work.
 *
 * So these two are translated explicitly onto the transaction-scoped
 * client's own delegates:
 *
 *   updateWhere → tx.ticket.updateMany  (returning the affected count)
 *   bumpVersion → tx.ticket.updateMany  (with an increment)
 *
 * The affected-row count is what the caller needs — a count of 0 is
 * how the compare-and-swap reports a lost update.
 */
function buildScopedFacade(
  namespace: unknown,
  tx: PrismaTx,
  namespaceName: string,
): unknown {
  const modelName =
    namespaceName === 'trail'
      ? 'ticketTrailEntry'
      : namespaceName === 'audit'
        ? 'auditEntry'
        : 'ticket';

  const model = (tx as unknown as Record<string, Record<string, unknown>>)[
    modelName
  ];
  if (!model) {
    throw new Error(
      `transaction facade: the transaction client has no "${modelName}" delegate`,
    );
  }

  return new Proxy(namespace as Record<string, unknown>, {
    get(target, prop) {
      if (namespaceName === 'ticket') {
        if (prop === 'updateWhere') {
          return async (args: {
            where: Record<string, unknown>;
            data: Record<string, unknown>;
          }): Promise<number> => {
            const result = (await (
              model.updateMany as (a: unknown) => Promise<{ count: number }>
            )({
              where: args.where,
              data: args.data,
            })) as { count: number };
            return result.count;
          };
        }
        if (prop === 'bumpVersion') {
          return async (args: {
            where: { id: string };
          }): Promise<void> => {
            await (model.updateMany as (a: unknown) => Promise<unknown>)({
              where: { id: args.where.id },
              data: { version: { increment: 1 } },
            });
          };
        }
      }

      const impl = model[prop as string];
      if (typeof impl !== 'function') {
        return Reflect.get(target, prop, target);
      }
      return impl.bind(model);
    },
  });
}
