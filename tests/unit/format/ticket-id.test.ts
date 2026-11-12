/**
 * Unit tests for the public ticket code helper (lib/format/ticket-id.ts).
 *
 * Context: citizens quote a SHORT public code over the phone — the
 * mockups and UX specs 1.11 / 1.12 all show `#TIX-1234`. The
 * internal id cannot be shown: it is long, it leaks the storage
 * layout, and it differs between backends (the dev store mints
 * `tkt_*`, Postgres mints a cuid).
 *
 * The public code is therefore DERIVED from the id. These tests pin
 * the properties the derivation must hold:
 *
 *   1. Deterministic — the same id always yields the same code.
 *   2. Shape-stable — every code is `#TIX-` plus exactly four
 *      uppercase base-36 characters, whichever backend minted the id.
 *   3. Prefix-insensitive — `ticket_x` and `tkt_x` describe the same
 *      ticket, so they must yield the same code.
 *   4. Non-leaking — the rendered code must not contain any raw id
 *      fragment, so a citizen cannot read the internal handle back
 *      out of their own reference.
 */

import { describe, expect, it } from 'vitest';
import { formatTicketId, ticketCode } from '@/lib/format/ticket-id';

/** A dev-store id (`tkt_` prefix). */
const DEV_STORE_ID = 'tkt_01HQ8X4M';
/** A Postgres cuid (no prefix). */
const CUID_ID = 'clx0abc123def';
/** A seeded id from the fixture store (`ticket_` prefix, readable tail). */
const SEEDED_ID = 'ticket_seed_routed_1';

const CODE_SHAPE = /^#TIX-[0-9A-Z]{4}$/;

describe('formatTicketId', () => {
  it('renders the dev-store id shape as a short public code', () => {
    const code = formatTicketId(DEV_STORE_ID);
    expect(code).toMatch(CODE_SHAPE);
    expect(code.startsWith('#TIX-')).toBe(true);
  });

  it('renders the Postgres cuid shape as the same public shape', () => {
    const code = formatTicketId(CUID_ID);
    expect(code).toMatch(CODE_SHAPE);
    expect(code.startsWith('#TIX-')).toBe(true);
  });

  it('produces the same SHAPE for both backends', () => {
    // The two backends mint ids of different lengths and alphabets.
    // The public code must not let a citizen tell which one they are
    // on, and must not change width when the backend changes.
    const dev = formatTicketId(DEV_STORE_ID);
    const cuid = formatTicketId(CUID_ID);
    expect(dev).toHaveLength(cuid.length);
    expect(dev.slice(0, 5)).toBe(cuid.slice(0, 5));
  });

  it('is deterministic — the same id always yields the same code', () => {
    expect(formatTicketId(DEV_STORE_ID)).toBe(formatTicketId(DEV_STORE_ID));
    expect(formatTicketId(CUID_ID)).toBe(formatTicketId(CUID_ID));
    expect(formatTicketId(SEEDED_ID)).toBe(formatTicketId(SEEDED_ID));
  });

  it('is prefix-insensitive — ticket_x and tkt_x describe one ticket', () => {
    expect(formatTicketId('ticket_abc123')).toBe(formatTicketId('tkt_abc123'));
    expect(formatTicketId('ticket_seed_routed_1')).toBe(
      formatTicketId('tkt_seed_routed_1'),
    );
  });

  it('distinguishes different ids', () => {
    expect(formatTicketId(DEV_STORE_ID)).not.toBe(formatTicketId(CUID_ID));
    expect(formatTicketId('tkt_a')).not.toBe(formatTicketId('tkt_b'));
  });

  it('never leaks the raw id into the rendered code', () => {
    for (const id of [DEV_STORE_ID, CUID_ID, SEEDED_ID]) {
      const code = formatTicketId(id);
      const bare = id.replace(/^(ticket|tkt)_/, '');
      // No substring of the raw id may appear in the code. The check
      // walks every substring of length >= 3 so a partial leak is
      // caught, not just the whole id.
      for (let i = 0; i + 3 <= bare.length; i += 1) {
        expect(code).not.toContain(bare.slice(i, i + 3));
      }
      expect(code).not.toContain(id);
      expect(code).not.toContain(bare);
    }
  });

  it('uses only uppercase base-36 characters in the suffix', () => {
    const code = formatTicketId(SEEDED_ID);
    const suffix = code.replace('#TIX-', '');
    expect(suffix).toMatch(/^[0-9A-Z]{4}$/);
    expect(suffix).toBe(suffix.toUpperCase());
  });

  it('handles an empty id without throwing', () => {
    expect(formatTicketId('')).toMatch(CODE_SHAPE);
  });
});

describe('ticketCode', () => {
  it('returns the code without the leading hash', () => {
    const code = ticketCode(DEV_STORE_ID);
    expect(code.startsWith('#')).toBe(false);
    expect(code).toMatch(/^TIX-[0-9A-Z]{4}$/);
    expect(`#${code}`).toBe(formatTicketId(DEV_STORE_ID));
  });
});
