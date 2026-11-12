/**
 * Ticket id formatting (lib/format/ticket-id.ts).
 *
 * A citizen-facing ticket reference is a SHORT, PUBLIC code — not the
 * internal row id. The internal id is a machine handle: it changes
 * shape between backends (the in-memory dev store mints `tkt_*`, the
 * Postgres schema mints a cuid like `clx0abc123def`), it leaks the
 * storage layout, and it is long enough to break a badge, a table
 * cell, or a phone-width header.
 *
 * Every mockup, UX spec 1.11 / 1.12, and the older mockups 03 / 04 /
 * 05 show the same public form: `#TIX-1234`. The `Ticket` model has no
 * `publicId` column and the `tkt_` prefix exists only in the dev
 * store, so the public code is DERIVED from the id rather than stored.
 * The derivation is presentation-only: the raw id is still the right
 * thing to put in a link, an API path, or a copy-to-clipboard payload.
 *
 * Derivation rules:
 *   1. Deterministic — the same id always yields the same code, so
 *      the code on a list row and the code on the detail page agree.
 *   2. Prefix-insensitive — `ticket_x` and `tkt_x` describe the same
 *      ticket, so the prefix is stripped before hashing. (The Postgres
 *      cuid has no prefix at all, which is why the strip is generic
 *      rather than a two-branch special case.)
 *   3. Non-reversible in practice — a citizen who quotes the code can
 *      be looked up by an operator, but the code does not reveal the
 *      id and cannot be used to guess another ticket's id.
 *
 * Hash choice: FNV-1a (32-bit, offset basis 0x811c9dc5, prime
 * 0x01000193) rather than SHA-256. The output space is only 36^4 =
 * 1,679,616 codes, so the hash's job is to SPREAD ids evenly across
 * that space, not to be collision-proof against an adversary — and
 * SHA-256 cannot help there, because the truncation to 4 base-36
 * characters happens either way. FNV-1a is a dependency-free,
 * well-understood, 10-line function with no `crypto` import, which
 * keeps this helper usable from a client component without dragging a
 * Node-only module into the bundle.
 *
 * Collision risk: with 36^4 = 1,679,616 possible codes, the birthday
 * bound puts a collision near ~50% at roughly 1,290 distinct tickets.
 * The seeded dataset is on the order of tens of tickets, and even a
 * city-scale pilot of a few thousand tickets would have a low
 * single-digit chance of one collision (and a collision is cosmetic —
 * two rows would show the same public code, they would still be
 * distinct tickets internally). If a deployment ever needs collision
 * freedom, the fix is to widen the code to 6 base-36 characters
 * (36^6 = 2.18 billion), not to swap the hash.
 */

/** The public prefix every citizen-facing reference carries. */
const PUBLIC_PREFIX = 'TIX';

/** Number of base-36 characters after the prefix. */
const CODE_LENGTH = 4;

/**
 * Strip the storage-layer prefix from an id.
 *
 * `ticket_seed_routed_1` → `seed_routed_1`
 * `tkt_a1b2c3d4e5f6`      → `a1b2c3d4e5f6`
 * `clx0abc123def`         → `clx0abc123def`  (cuid — no prefix)
 */
function stripInternalPrefix(id: string): string {
  return id.replace(/^(ticket|tkt)_/, '');
}

/**
 * FNV-1a, 32-bit. Returns an unsigned 32-bit integer.
 *
 * Implemented over UTF-16 code units rather than bytes because the
 * ids are ASCII in every backend; the two agree for ASCII input and
 * the code-unit version avoids a TextEncoder dependency.
 */
function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    // hash *= 0x01000193, kept in 32-bit range via shifts.
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    hash >>>= 0;
  }
  return hash >>> 0;
}

/**
 * The public ticket code for an internal ticket id.
 *
 * `ticket_seed_routed_1` → `#TIX-<4 base-36 chars>`
 * `tkt_01HQ8X4M`          → `#TIX-<4 base-36 chars>`
 * `clx0abc123def`         → `#TIX-<4 base-36 chars>`
 *
 * The suffix is always exactly `CODE_LENGTH` uppercase base-36
 * characters, so every code has the same shape regardless of which
 * backend minted the id.
 */
export function formatTicketId(id: string): string {
  const bare = stripInternalPrefix(id);
  const hash = fnv1a32(bare);
  // Spread the 32-bit hash over the 36^CODE_LENGTH code space. The
  // multiply-and-take-remainder biases the low end very slightly
  // (36 does not divide 2^32), which is irrelevant at this scale but
  // is noted here so nobody later treats the output as uniform.
  let value = hash;
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    out = (value % 36).toString(36).toUpperCase() + out;
    value = Math.floor(value / 36);
  }
  return `#${PUBLIC_PREFIX}-${out}`;
}

/**
 * The bare public code without the `#` prefix — for copy-to-clipboard
 * payloads and for tests that compare against an API-derived value.
 */
export function ticketCode(id: string): string {
  return formatTicketId(id).replace(/^#/, '');
}
