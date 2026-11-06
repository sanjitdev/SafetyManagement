/**
 * The crew-facing ticket reference number.
 *
 * The crew portal's design reference
 * (`ui-design/Crew Portal Dashboard.png`) labels every job with a
 * civic reference — "#CF-1024" — which is what the crew quotes to
 * the dispatcher over the radio. The backend ids are opaque
 * strings ("ticket_seed_crew_routed_2"), so the reference is
 * derived from a stable hash of the id: the same ticket always
 * yields the same number, and the number survives reloads.
 *
 * WHY A HASH AND NOT A SEQUENCE
 * ------------------------------
 * A real sequence ("the 1024th ticket") would need a database
 * counter, and it would change the moment the dev store is
 * re-seeded — the crew's screenshot of a reference would stop
 * matching the ticket. A hash of the id is stable for the life
 * of the row and identical on every device that can see it.
 */

/**
 * The ticket's civic reference, e.g. "CF-1024".
 *
 * djb2-xor (a rolling multiply-add), folded into a four-digit
 * sequence. Cheap, dependency-free, and deterministic.
 */
export function ticketReference(id: string): string {
  let hash = 5381;
  for (let i = 0; i < id.length; i += 1) {
    hash = ((hash << 5) + hash + id.charCodeAt(i)) >>> 0;
  }
  const sequence = (hash % 9000) + 1000;
  return `CF-${sequence}`;
}
