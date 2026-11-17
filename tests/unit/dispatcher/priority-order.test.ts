/**
 * Unit tests for the triage ordering (lib/dispatcher/priority.ts).
 *
 * The queue's ORDER is a product decision, not an implementation
 * detail: it is what the dispatcher sees first. This test pins the
 * four rules and the reason each one exists.
 *
 *   1. Priority DESC — an `urgent` ticket outranks a `low` one.
 *   2. Untriaged before triaged WITHIN a band.
 *   3. Oldest first within a band.
 *   4. A total order, so the queue never reshuffles between
 *      renders.
 *
 * RULE 2 IS THE SUBTLE ONE. `low` is the DEFAULT band, so a
 * brand-new report and a report a dispatcher deliberately
 * deprioritised share a priority value. They are NOT in the same
 * state:
 *
 *   - The untriaged ticket is UNKNOWN work. It may be a gas leak
 *     and it may be a discarded wrapper. Nobody has looked.
 *   - The deprioritised ticket is KNOWN work that was judged less
 *     urgent. It was triaged.
 *
 * Sorting untriaged first means the dispatcher sees the tickets
 * that have never been looked at before the ones they themselves
 * set aside.
 *
 * The sort lives in CODE rather than in the query because the dev
 * store's `findMany` supports exactly ONE `orderBy` field. A
 * database-side multi-field sort would silently degrade in the dev
 * store, and the ordering would never be exercised by the suite.
 */

import { describe, it, expect } from 'vitest';
import {
  PRIORITY_ORDER,
  priorityRank,
  sortByTriagePriority,
  type Prioritizable,
  type TicketPriority,
} from '@/lib/dispatcher/priority';

const TRIAGED_AT = '2026-11-17T10:00:00.000Z';

function mk(
  id: string,
  priority: TicketPriority | null,
  prioritySetAt: string | null,
  createdAt: string,
): Prioritizable {
  return { id, priority, prioritySetAt, createdAt };
}

describe('the scale', () => {
  it('lists the four bands lowest first', () => {
    expect([...PRIORITY_ORDER]).toEqual(['low', 'normal', 'high', 'urgent']);
  });

  it('ranks higher as the band gets more urgent', () => {
    expect(priorityRank('low')).toBeLessThan(priorityRank('normal'));
    expect(priorityRank('normal')).toBeLessThan(priorityRank('high'));
    expect(priorityRank('high')).toBeLessThan(priorityRank('urgent'));
  });

  it('ranks a missing band with the lowest', () => {
    expect(priorityRank(null)).toBe(priorityRank('low'));
    expect(priorityRank(undefined)).toBe(priorityRank('low'));
  });

  it('ranks an unknown band with the lowest rather than throwing', () => {
    // One bad row must not break the whole queue's ordering.
    expect(priorityRank('catastrophic' as TicketPriority)).toBe(
      priorityRank('low'),
    );
  });
});

describe('rule 1 — the band decides first', () => {
  it('puts urgent above high above normal above low', () => {
    const sorted = sortByTriagePriority([
      mk('a', 'low', TRIAGED_AT, '2026-01-01T00:00:00.000Z'),
      mk('b', 'urgent', TRIAGED_AT, '2026-06-01T00:00:00.000Z'),
      mk('c', 'normal', TRIAGED_AT, '2026-02-01T00:00:00.000Z'),
      mk('d', 'high', TRIAGED_AT, '2026-03-01T00:00:00.000Z'),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(['b', 'd', 'c', 'a']);
  });

  it('beats the age — a newer urgent outranks an older low', () => {
    const sorted = sortByTriagePriority([
      mk('old-low', 'low', TRIAGED_AT, '2026-01-01T00:00:00.000Z'),
      mk('new-urgent', 'urgent', TRIAGED_AT, '2026-06-01T00:00:00.000Z'),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(['new-urgent', 'old-low']);
  });
});

describe('rule 2 — untriaged before triaged, within a band', () => {
  it('puts the untriaged report first, even though it is older', () => {
    const sorted = sortByTriagePriority([
      mk('triaged-low', 'low', TRIAGED_AT, '2026-01-01T00:00:00.000Z'),
      mk('untriaged-low', 'low', null, '2026-06-01T00:00:00.000Z'),
    ]);
    // The untriaged one is NEWER but comes first: nobody has
    // looked at it, so it is unknown work.
    expect(sorted.map((t) => t.id)).toEqual(['untriaged-low', 'triaged-low']);
  });

  it('applies the rule in every band, not just low', () => {
    for (const band of PRIORITY_ORDER) {
      const sorted = sortByTriagePriority([
        mk(`triaged-${band}`, band, TRIAGED_AT, '2026-01-01T00:00:00.000Z'),
        mk(`untriaged-${band}`, band, null, '2026-06-01T00:00:00.000Z'),
      ]);
      expect(sorted.map((t) => t.id)).toEqual([
        `untriaged-${band}`,
        `triaged-${band}`,
      ]);
    }
  });

  it('treats a band with no timestamp as untriaged', () => {
    // The write path always stamps a band and a timestamp
    // together, so this can only be a row written before the
    // feature existed — and such a row has genuinely never been
    // triaged.
    const sorted = sortByTriagePriority([
      mk('stamped', 'high', TRIAGED_AT, '2026-01-01T00:00:00.000Z'),
      mk('unstamped', 'high', null, '2026-06-01T00:00:00.000Z'),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(['unstamped', 'stamped']);
  });
});

describe('rule 3 — oldest first within a band', () => {
  it('orders by creation time once the band and the triage state match', () => {
    const sorted = sortByTriagePriority([
      mk('newer', 'high', TRIAGED_AT, '2026-06-01T00:00:00.000Z'),
      mk('older', 'high', TRIAGED_AT, '2026-01-01T00:00:00.000Z'),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(['older', 'newer']);
  });

  it('reads a Date as readily as an ISO string', () => {
    // Prisma returns a `Date`; the dev store holds an ISO string.
    // A comparator that only handled one of them would sort the
    // whole queue wrongly on the other backend — and the
    // comparison would still "work", silently.
    const sorted = sortByTriagePriority([
      {
        id: 'as-date',
        priority: 'high',
        prioritySetAt: TRIAGED_AT,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: 'as-string',
        priority: 'high',
        prioritySetAt: TRIAGED_AT,
        createdAt: '2026-06-01T00:00:00.000Z',
      },
    ]);
    expect(sorted.map((t) => t.id)).toEqual(['as-date', 'as-string']);
  });

  it('sorts an unparseable timestamp last rather than throwing', () => {
    const sorted = sortByTriagePriority([
      mk('broken', 'high', TRIAGED_AT, 'not-a-date'),
      mk('good', 'high', TRIAGED_AT, '2026-01-01T00:00:00.000Z'),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(['good', 'broken']);
  });
});

describe('rule 4 — the order is total', () => {
  it('breaks a tie on the id, so the queue never reshuffles', () => {
    const createdAt = '2026-01-01T00:00:00.000Z';
    const sorted = sortByTriagePriority([
      mk('tkt_b', 'high', TRIAGED_AT, createdAt),
      mk('tkt_a', 'high', TRIAGED_AT, createdAt),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(['tkt_a', 'tkt_b']);
  });

  it('is deterministic — the same input always gives the same order', () => {
    const input = [
      mk('tkt_c', 'high', TRIAGED_AT, '2026-01-01T00:00:00.000Z'),
      mk('tkt_a', 'high', TRIAGED_AT, '2026-01-01T00:00:00.000Z'),
      mk('tkt_b', 'low', null, '2026-02-01T00:00:00.000Z'),
    ];
    const first = sortByTriagePriority(input).map((t) => t.id);
    const second = sortByTriagePriority(input).map((t) => t.id);
    expect(first).toEqual(second);
  });

  it('does not mutate the input', () => {
    const input = [
      mk('tkt_b', 'high', TRIAGED_AT, '2026-01-01T00:00:00.000Z'),
      mk('tkt_a', 'low', null, '2026-02-01T00:00:00.000Z'),
    ];
    const before = input.map((t) => t.id);
    sortByTriagePriority(input);
    expect(input.map((t) => t.id)).toEqual(before);
  });
});
