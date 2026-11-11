/**
 * Vitest: the public landing feed's pagination cursor.
 *
 * ## What this guards
 *
 * The landing page's "Latest city activity" grid is paged by an
 * opaque server cursor (`?cursor=` → `nextCursor`). The helpers that
 * encode, decode and apply that cursor live in
 * `app/api/v1/activity/public/route.ts` and are exported so they can
 * be tested directly — the same way `computeStats` and
 * `applyPublicFilters` are.
 *
 * ## The one property that really matters
 *
 * `createdAt` is **not unique**. Tickets are created in batches, so
 * several share a timestamp to the millisecond. A cursor that
 * carried only the timestamp would have to pick one of two rules for
 * the rows that tie with it:
 *
 *   - `createdAt < cursor` — silently DROPS the tied rows, and the
 *     feed can never be paged to the end.
 *   - `createdAt <= cursor` — silently REPEATS the tied rows.
 *
 * Both are invisible until someone pages to the bottom and notices a
 * missing or doubled card. The cursor therefore carries the ticket's
 * id as a tiebreaker, and the tests below pin that:
 *
 *   - the tied rows are neither dropped nor duplicated;
 *   - `sortByNewest` and `applyCursor` agree on the total order, so
 *     paging through the whole set yields every row exactly once.
 */

import { describe, expect, test } from 'vitest';
import {
  applyCursor,
  decodeCursor,
  encodeCursor,
  sortByNewest,
  toIsoString,
} from '@/app/api/v1/activity/public/route';

interface Row {
  id: string;
  createdAt: string;
}

function row(id: string, createdAt: string): Row {
  return { id, createdAt };
}

/**
 * The canonical fixture: three distinct timestamps, newest first.
 */
const ORDERED: Row[] = [
  row('t3', '2026-11-09T12:00:00.000Z'),
  row('t2', '2026-11-08T12:00:00.000Z'),
  row('t1', '2026-11-07T12:00:00.000Z'),
];

describe('encodeCursor / decodeCursor', () => {
  test('round-trips a row', () => {
    const encoded = encodeCursor(ORDERED[0]);
    expect(decodeCursor(encoded)).toEqual({
      createdAt: '2026-11-09T12:00:00.000Z',
      id: 't3',
    });
  });

  test('the encoded token is opaque — it does not read as the timestamp', () => {
    const encoded = encodeCursor(ORDERED[0]);
    expect(encoded).not.toContain('2026-11-09');
    expect(encoded).not.toContain('t3');
  });

  test('the token is URL-safe', () => {
    // A cursor travels in a query string, so it must not need
    // percent-encoding. base64url uses `-` and `_` in place of `+`
    // and `/`, and drops the `=` padding.
    const encoded = encodeCursor({
      id: 'cmvtghhkl00182f9o3q8zx2e8',
      createdAt: '2026-11-09T12:00:00.000Z',
    });
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encodeURIComponent(encoded)).toBe(encoded);
  });

  test('a null or empty cursor decodes to null', () => {
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor('')).toBeNull();
  });

  test('garbage decodes to null rather than throwing', () => {
    expect(decodeCursor('not-a-cursor')).toBeNull();
    expect(decodeCursor('!!!not base64!!!')).toBeNull();
  });

  test('valid base64 that is not JSON decodes to null', () => {
    const notJson = Buffer.from('hello there', 'utf8').toString('base64url');
    expect(decodeCursor(notJson)).toBeNull();
  });

  test('JSON of the wrong shape decodes to null', () => {
    const cases = [
      JSON.stringify({ createdAt: 123 }),
      JSON.stringify({ id: 't1' }),
      JSON.stringify({ createdAt: 'x', id: 7 }),
      JSON.stringify('a string'),
      JSON.stringify(['an', 'array']),
      JSON.stringify(null),
    ];
    for (const payload of cases) {
      const encoded = Buffer.from(payload, 'utf8').toString('base64url');
      expect(decodeCursor(encoded)).toBeNull();
    }
  });

  test('an empty-string field decodes to null', () => {
    const encoded = Buffer.from(
      JSON.stringify({ createdAt: '', id: 't1' }),
      'utf8',
    ).toString('base64url');
    expect(decodeCursor(encoded)).toBeNull();
  });
});

describe('sortByNewest', () => {
  test('sorts newest first', () => {
    const shuffled = [ORDERED[2], ORDERED[0], ORDERED[1]];
    expect(sortByNewest(shuffled).map((r) => r.id)).toEqual(['t3', 't2', 't1']);
  });

  test('does not mutate its input', () => {
    const input = [...ORDERED];
    sortByNewest(input);
    expect(input.map((r) => r.id)).toEqual(['t3', 't2', 't1']);
  });

  test('ties on createdAt are broken by id, descending', () => {
    // Same timestamp, three ids. The order must be total and
    // deterministic — otherwise the cursor has no meaning.
    const tied = [
      row('b', '2026-11-09T12:00:00.000Z'),
      row('c', '2026-11-09T12:00:00.000Z'),
      row('a', '2026-11-09T12:00:00.000Z'),
    ];
    expect(sortByNewest(tied).map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });

  test('sorting is stable across repeated calls', () => {
    const tied = [
      row('b', '2026-11-09T12:00:00.000Z'),
      row('a', '2026-11-09T12:00:00.000Z'),
    ];
    const first = sortByNewest(tied).map((r) => r.id);
    const second = sortByNewest(tied).map((r) => r.id);
    expect(first).toEqual(second);
  });
});

describe('applyCursor', () => {
  test('no cursor keeps everything', () => {
    expect(applyCursor(ORDERED, null).map((r) => r.id)).toEqual([
      't3',
      't2',
      't1',
    ]);
  });

  test('a malformed cursor keeps everything', () => {
    // A stale bookmark must land the visitor on the top of the feed,
    // not on an empty list or an error.
    expect(applyCursor(ORDERED, 'garbage').map((r) => r.id)).toEqual([
      't3',
      't2',
      't1',
    ]);
  });

  test('drops the cursor row and everything newer', () => {
    const cursor = encodeCursor(ORDERED[0]);
    expect(applyCursor(ORDERED, cursor).map((r) => r.id)).toEqual(['t2', 't1']);
  });

  test('keeps everything older than the cursor', () => {
    const cursor = encodeCursor(ORDERED[1]);
    expect(applyCursor(ORDERED, cursor).map((r) => r.id)).toEqual(['t1']);
  });

  test('a cursor past the end leaves nothing', () => {
    const cursor = encodeCursor({
      id: 't0',
      createdAt: '2026-11-01T00:00:00.000Z',
    });
    expect(applyCursor(ORDERED, cursor)).toEqual([]);
  });
});

describe('applyCursor — the tied-timestamp case', () => {
  /**
   * The defect a timestamp-only cursor would cause.
   *
   * Two tickets share a timestamp. The page boundary falls between
   * them. A `createdAt < cursor` cursor drops the second one; a
   * `createdAt <= cursor` cursor repeats the first one. The
   * composite cursor must do neither.
   */
  const tied: Row[] = [
    row('b', '2026-11-09T12:00:00.000Z'),
    row('a', '2026-11-09T12:00:00.000Z'),
    row('c', '2026-11-08T12:00:00.000Z'),
  ];

  test('the tied rows are ordered deterministically', () => {
    expect(sortByNewest(tied).map((r) => r.id)).toEqual(['b', 'a', 'c']);
  });

  test('a cursor on the first tied row keeps the second one', () => {
    const ordered = sortByNewest(tied);
    const cursor = encodeCursor(ordered[0]);
    // 'b' is the cursor row. 'a' shares its timestamp and sorts
    // after it, so 'a' MUST survive — a timestamp-only cursor
    // would have dropped it.
    expect(applyCursor(ordered, cursor).map((r) => r.id)).toEqual(['a', 'c']);
  });

  test('a cursor on the second tied row drops both tied rows', () => {
    const ordered = sortByNewest(tied);
    const cursor = encodeCursor(ordered[1]);
    expect(applyCursor(ordered, cursor).map((r) => r.id)).toEqual(['c']);
  });

  test('paging through the tied set yields every row exactly once', () => {
    // The end-to-end property: page size 1, follow the cursor until
    // it runs out. Every row appears once and only once.
    const ordered = sortByNewest(tied);
    const seen: string[] = [];
    let cursor: string | null = null;

    for (let guard = 0; guard < 10; guard += 1) {
      const page = applyCursor(ordered, cursor).slice(0, 1);
      if (page.length === 0) break;
      seen.push(page[0].id);
      cursor = encodeCursor(page[0]);
    }

    expect(seen).toEqual(['b', 'a', 'c']);
    expect(new Set(seen).size).toBe(3);
  });
});

describe('the two backends disagree about the timestamp type', () => {
  /**
   * Prisma returns `createdAt` as a `Date`; the dev store returns an
   * ISO string. The cursor has to mean the same thing in both modes.
   *
   * This is not a theoretical concern: with the raw values compared
   * directly, a `Date` on the left and a string on the right makes
   * `<` coerce the string to `NaN`, and every comparison against it
   * is false. The result was a feed whose second page was always
   * EMPTY — the visitor could never reach the reports past the first
   * page, and no unit test caught it because the fixtures all used
   * strings.
   */
  interface DateRow {
    id: string;
    createdAt: Date | string;
  }

  test('toIsoString normalises both shapes to the same value', () => {
    const iso = '2026-11-09T12:00:00.000Z';
    expect(toIsoString(new Date(iso))).toBe(iso);
    expect(toIsoString(iso)).toBe(iso);
  });

  test('a Date row and a string row compare correctly', () => {
    const mixed: DateRow[] = [
      { id: 't3', createdAt: new Date('2026-11-09T12:00:00.000Z') },
      { id: 't2', createdAt: '2026-11-08T12:00:00.000Z' },
      { id: 't1', createdAt: new Date('2026-11-07T12:00:00.000Z') },
    ];
    const ordered = sortByNewest(mixed);
    expect(ordered.map((r) => r.id)).toEqual(['t3', 't2', 't1']);
  });

  test('a cursor taken from a Date row still pages a string row', () => {
    // The cursor is always ENCODED from a row, but the row it is
    // applied to may come from the other backend.
    const dateRow: DateRow = {
      id: 't2',
      createdAt: new Date('2026-11-08T12:00:00.000Z'),
    };
    const cursor = encodeCursor(dateRow);
    const stringRows: DateRow[] = [
      { id: 't3', createdAt: '2026-11-09T12:00:00.000Z' },
      { id: 't2', createdAt: '2026-11-08T12:00:00.000Z' },
      { id: 't1', createdAt: '2026-11-07T12:00:00.000Z' },
    ];
    // The Date-encoded cursor must drop 't2' and keep 't1'.
    expect(applyCursor(stringRows, cursor).map((r) => r.id)).toEqual(['t1']);
  });

  test('paging a Date-backed set converges', () => {
    const rows: DateRow[] = [
      { id: 'a', createdAt: new Date('2026-11-09T12:00:00.000Z') },
      { id: 'b', createdAt: new Date('2026-11-08T12:00:00.000Z') },
      { id: 'c', createdAt: new Date('2026-11-07T12:00:00.000Z') },
    ];
    const ordered = sortByNewest(rows);
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 10; guard += 1) {
      const page = applyCursor(ordered, cursor).slice(0, 1);
      if (page.length === 0) break;
      seen.push(page[0].id);
      cursor = encodeCursor(page[0]);
    }
    expect(seen).toEqual(['a', 'b', 'c']);
  });
});

describe('paging the whole set — the convergence property', () => {
  /**
   * The self-check for the whole feature: page through the ordered
   * set with a fixed page size and confirm that the pages cover
   * every row exactly once.
   */
  function pageThrough(rows: Row[], pageSize: number): string[] {
    const ordered = sortByNewest(rows);
    const seen: string[] = [];
    let cursor: string | null = null;

    for (let guard = 0; guard < 1000; guard += 1) {
      const remaining = applyCursor(ordered, cursor);
      const page = remaining.slice(0, pageSize);
      if (page.length === 0) break;
      seen.push(...page.map((r) => r.id));
      cursor = encodeCursor(page[page.length - 1]);
    }
    return seen;
  }

  test('a distinct-timestamp set pages through without loss or repeats', () => {
    const seen = pageThrough(ORDERED, 2);
    expect(seen).toEqual(['t3', 't2', 't1']);
    expect(new Set(seen).size).toBe(3);
  });

  test('a tied-timestamp set pages through without loss or repeats', () => {
    const rows: Row[] = [
      row('a', '2026-11-09T12:00:00.000Z'),
      row('b', '2026-11-09T12:00:00.000Z'),
      row('c', '2026-11-09T12:00:00.000Z'),
      row('d', '2026-11-08T12:00:00.000Z'),
      row('e', '2026-11-07T12:00:00.000Z'),
    ];
    const seen = pageThrough(rows, 2);
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
    for (const r of rows) expect(seen).toContain(r.id);
  });

  test('a page size of 1 visits every row once', () => {
    const seen = pageThrough(ORDERED, 1);
    expect(seen).toEqual(['t3', 't2', 't1']);
  });

  test('a mixed Date/string set pages through without loss or repeats', () => {
    // The real backends disagree on the timestamp type, so the
    // convergence property has to hold for a mixed set too.
    const rows = [
      { id: 'a', createdAt: new Date('2026-11-09T12:00:00.000Z') },
      { id: 'b', createdAt: '2026-11-09T12:00:00.000Z' },
      { id: 'c', createdAt: new Date('2026-11-08T12:00:00.000Z') },
      { id: 'd', createdAt: '2026-11-07T12:00:00.000Z' },
    ];
    const seen = pageThrough(rows as unknown as Row[], 2);
    expect(seen).toHaveLength(4);
    expect(new Set(seen).size).toBe(4);
    for (const r of rows) expect(seen).toContain(r.id);
  });

  test('a page size larger than the set returns everything at once', () => {
    const seen = pageThrough(ORDERED, 50);
    expect(seen).toEqual(['t3', 't2', 't1']);
  });

  test('the ordering and the cursor agree — no row is stranded', () => {
    // `sortByNewest` and `applyCursor` must implement the SAME
    // total order. If they disagreed, a row could sit before the
    // cursor in one and after it in the other, and paging would
    // loop forever or skip it.
    const rows: Row[] = [
      row('a', '2026-11-09T12:00:00.000Z'),
      row('b', '2026-11-09T12:00:00.000Z'),
      row('c', '2026-11-09T12:00:00.000Z'),
    ];
    const ordered = sortByNewest(rows);
    for (let i = 0; i < ordered.length; i += 1) {
      const cursor = encodeCursor(ordered[i]);
      const after = applyCursor(ordered, cursor);
      // Everything after the cursor is exactly the tail.
      expect(after.map((r) => r.id)).toEqual(
        ordered.slice(i + 1).map((r) => r.id),
      );
    }
  });
});
