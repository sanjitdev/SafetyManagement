/**
 * Ticket id formatting (lib/format/ticket-id.ts).
 *
 * Ticket ids are internally generated (`ticket_seed_routed_1`,
 * `tkt_a1b2c3…`) and are long enough to break a badge, a table
 * cell, or a phone-width header. The raw id is still the right
 * thing to COPY — the citizen quotes it to the call centre — so the
 * helper shortens it for DISPLAY only and never mutates the value
 * that goes into a link, an API path, or a copy-to-clipboard action.
 *
 * The `ticket_` / `tkt_` prefix carries no information for a reader
 * (every ticket has one), so it is dropped and the remainder is
 * trimmed to a readable width.
 */

/**
 * A ticket id prefixed with `#`, shortened for display.
 *
 * `ticket_seed_routed_1` → `#seed_routed_1`
 * `tkt_a1b2c3d4e5f6`      → `#a1b2c3d4e5f6`
 *
 * When the id is longer than `max`, the middle is elided rather than
 * the tail — the tail of a ticket id is the least distinctive part,
 * so the prefix plus the head identifies it best.
 */
export function formatTicketId(id: string, max = 14): string {
  const bare = id.replace(/^(ticket|tkt)_/, '');
  if (bare.length <= max) return `#${bare}`;
  const head = bare.slice(0, max - 1);
  return `#${head}…`;
}
