/**
 * Triage ordering for the dispatcher queue.
 *
 * WHY THE SORT HAPPENS IN CODE, NOT IN THE DATABASE
 * --------------------------------------------------
 * The obvious implementation is `orderBy: [{ priority: 'desc' },
 * { createdAt: 'asc' }]` on the ticket query. That is not
 * available, for a reason this repo has already been bitten by:
 * the in-memory dev store's `findMany` supports exactly ONE
 * `orderBy` field, and only `createdAt` at that.
 *
 * The dev store is not a toy — `tests/unit/ward-routing-regression.test.ts`
 * and the concurrency suites run against it, precisely because a
 * mock-based test would prove nothing about the parity claim. So a
 * queue whose ordering works in Postgres but silently degrades in
 * the dev store is a queue whose ORDERING IS NEVER TESTED. The
 * sort therefore lives here, in one place, and both backends get
 * it.
 *
 * The `(cityId, priority)` index added by the priority migration
 * still earns its keep: it serves the `WHERE cityId = ?` filter
 * and narrows the rows the sort has to consider. It is just not
 * what does the sorting.
 *
 * THE ORDERING RULE
 * -----------------
 *   1. Priority DESC — an `urgent` ticket outranks a `low` one.
 *   2. Oldest first WITHIN a priority band.
 *   3. Untriaged (`prioritySetAt === null`) sorts BEFORE triaged
 *      within the same band.
 *
 * Rule 3 is the subtle one. `low` is the default, so a brand-new
 * report and a report a dispatcher deliberately deprioritised share
 * a priority value. They are NOT in the same state, and the queue
 * must not treat them as such:
 *
 *   - The untriaged ticket is UNKNOWN work. It may be a gas leak
 *     and it may be a discarded wrapper. Nobody has looked.
 *   - The deprioritised ticket is KNOWN work that was judged less
 *     urgent. It is not being neglected; it was triaged.
 *
 * Sorting untriaged first means the dispatcher sees the tickets
 * that have never been looked at before the ones they themselves
 * set aside. The `prioritySetAt` timestamp is what makes the
 * distinction possible at all — without it, the two states are
 * indistinguishable.
 *
 * A ticket that was triaged and then had its priority RAISED
 * carries a `prioritySetAt`, so it sorts after the untriaged
 * tickets in its band. That is correct: it has been looked at.
 *
 * Backend-agnostic: takes plain objects, so both the Prisma rows
 * and the dev-store rows can be sorted by it.
 */

/** The triage scale. Mirrors the Prisma `TicketPriority` enum. */
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';

/**
 * The scale, lowest first. The ORDER is meaningful: the queue
 * sorts by this descending, so the array order IS the product's
 * notion of "more urgent".
 */
export const PRIORITY_ORDER: readonly TicketPriority[] = [
  'low',
  'normal',
  'high',
  'urgent',
] as const;

/** Numeric rank of each priority. Higher = more urgent. */
export function priorityRank(
  p: TicketPriority | null | undefined,
): number {
  if (!p) return 0;
  const i = PRIORITY_ORDER.indexOf(p);
  // An unknown value ranks with `low` rather than throwing — one
  // bad row must not break the whole queue's ordering.
  return i < 0 ? 0 : i;
}

/**
 * The minimum shape this sorter needs. Both the Prisma row and the
 * dev-store row satisfy it.
 */
export interface Prioritizable {
  /** The ticket id. Also the final tiebreak, so the order is total. */
  id: string;
  priority?: TicketPriority | null;
  prioritySetAt?: string | null;
  createdAt: string | Date;
}

/**
 * Sort tickets into dispatcher triage order.
 *
 * Returns a NEW array — the input is not mutated. The comparator
 * is total (every pair is comparable), so the result is
 * deterministic: the same input always produces the same order.
 */
export function sortByTriagePriority<T extends Prioritizable>(
  tickets: readonly T[],
): T[] {
  return [...tickets].sort((a, b) => {
    // 1. Priority DESC.
    const rankDiff = priorityRank(b.priority) - priorityRank(a.priority);
    if (rankDiff !== 0) return rankDiff;

    // 2. Untriaged before triaged, within the same band.
    const aUntriaged = !a.prioritySetAt;
    const bUntriaged = !b.prioritySetAt;
    if (aUntriaged !== bUntriaged) return aUntriaged ? -1 : 1;

    // 3. Oldest first. Both sides may be a `Date` (Prisma) or an
    // ISO string (dev store), so compare via epoch millis.
    const aTime = toMillis(a.createdAt);
    const bTime = toMillis(b.createdAt);
    if (aTime !== bTime) return aTime - bTime;

    // 4. A total order needs a final tiebreak, or two tickets
    //    created in the same millisecond could swap places
    //    between renders and make the queue look unstable.
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

function toMillis(v: string | Date): number {
  if (v instanceof Date) return v.getTime();
  const t = Date.parse(v);
  // An unparseable timestamp sorts last rather than throwing.
  return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
}
