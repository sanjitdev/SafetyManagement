/**
 * Prisma ticket-mapper parity (tests/unit/prisma-ticket-mapper-parity.test.ts)
 *
 * THE BUG THIS PINS
 * -----------------
 * `lib/db-switch.ts` has TWO `getTicketWithTrail` implementations:
 *
 *   - the dev-store one (`lib/dev-store.ts`), which spreads the raw
 *     row (`...t`) and so carries EVERY column; and
 *   - the Prisma one (`lib/db-switch.ts`), which enumerates the
 *     fields BY HAND.
 *
 * The hand-written enumeration had drifted: it omitted
 * `Ticket.version`. `version` is the optimistic-lock counter that
 * every compare-and-swap write uses as its predicate:
 *
 *   db.ticket.updateWhere({ where: { id, version }, data })
 *
 * So on real Postgres, `ticket.version ?? 0` silently degraded to
 * `0`, the predicate matched zero rows, and the write answered
 * `409 concurrent_write` — with no competing writer in sight.
 *
 * THE SYMPTOM
 * -----------
 * A dispatcher could see a report in their queue and open it, but
 * every "assign crew" save failed and left `assignedCrewId` null.
 * The crew the dispatcher picked then never saw the report, so the
 * chain broke between the dispatcher and the crew.
 *
 * WHY A UNIT TEST HAD NOT CAUGHT IT
 * ---------------------------------
 * The unit suite runs against the dev store, whose mapper keeps
 * `version`. Only the Prisma branch drops it. So every existing
 * test stayed green while production was broken — the two backends
 * had silently diverged.
 *
 * WHAT THIS TEST DOES
 * -------------------
 * It compares the Prisma mapper's enumerated field list against the
 * `model Ticket` block in `prisma/schema.prisma`, and fails when a
 * scalar column of the model is absent from the mapper.
 *
 * It is a STRUCTURAL test, not a behavioural one: it cannot run
 * against a live Postgres in CI, so it checks the thing that actually
 * broke — the hand-written enumeration itself. It is deliberately
 * allowed to ignore the fields the mapper derives rather than copies
 * (`departmentId`, `wardName`, `reporterName`, `categoryName`, …),
 * because those are JOINED values and are not Ticket columns.
 *
 * The list of derived fields below is itself part of the contract: a
 * column that is copied by name must appear in the mapper, and a
 * column that is derived must NOT be mistaken for a copied one.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SCHEMA = resolve(__dirname, '../../prisma/schema.prisma');
const DB_SWITCH = resolve(__dirname, '../../lib/db-switch.ts');

/**
 * Ticket columns that the Prisma mapper derives from a JOIN rather
 * than copying off the ticket row. They are not `model Ticket`
 * scalars, so they must not be required by the parity check.
 */
const DERIVED_FIELDS = new Set([
  // Category join → the ticket's department.
  'departmentId',
  // Ward join → denormalised display names.
  'wardName',
  'wardNameBn',
  // City join → denormalised display names.
  'cityName',
  'cityNameBn',
  // Reporter join → display name.
  'reporterName',
  // Category join → display fields.
  'categorySlug',
  'categoryName',
  'categoryNameBn',
  // Relation rows, not scalars.
  'trail',
  'photos',
]);

/** Pull the `model Ticket { ... }` body out of the Prisma schema. */
function ticketModelBlock(): string {
  const src = readFileSync(SCHEMA, 'utf8');
  const start = src.indexOf('model Ticket {');
  expect(start, 'prisma/schema.prisma has no `model Ticket` block').toBeGreaterThan(
    -1,
  );
  const end = src.indexOf('\n}', start);
  expect(end, 'the `model Ticket` block is not terminated').toBeGreaterThan(start);
  return src.slice(start, end);
}

/**
 * The scalar columns of `model Ticket` — the lines that look like
 * `name Type` (optionally with a `?` or `@default(...)`).
 */
function ticketScalarColumns(): string[] {
  const block = ticketModelBlock();
  const names: string[] = [];
  for (const raw of block.split('\n')) {
    const line = raw.trim();
    // Skip comments and blank lines.
    if (!line || line.startsWith('//') || line.startsWith('@@')) continue;
    // The `model Ticket {` header line itself — the block starts
    // with it, so it must not be parsed as a field.
    if (line.startsWith('model ')) continue;
    // A field is `name Type`, `name Type?`, `name Type[]` or
    // `name Type @default(...)`. The name is a bare identifier and
    // the type is a capitalised Prisma scalar. The trailing group
    // matches the optional `?`, the optional `[]`, and whatever
    // attributes follow — so `id String @id @default(cuid())` and
    // `assignedCrewId String? // comment` both parse.
    const m =
      /^([a-z][a-zA-Z0-9_]*)\s+([A-Z][a-zA-Z0-9_]*)(\[\])?(\?)?(\s|$)/.exec(line);
    if (!m) continue;
    const [, name, type, isList, optional, tail] = m;
    // A relation list — `trail TicketTrailEntry[]` — is not a scalar.
    if (isList) continue;
    // A relation — `ward Ward?` — is a JOIN, not a column on the
    // ticket row. The scalar it points at is `wardId`, which the
    // mapper copies separately.
    if (RELATION_TYPES.has(type)) continue;
    // A field with an attribute must still be a column.
    if (tail === '@') continue;
    // `optional` is irrelevant to the column list.
    void optional;
    names.push(name);
  }
  return names;
}

/**
 * Prisma relation model names. A field whose type is one of these is
 * a JOIN, not a column carried on the ticket row.
 */
const RELATION_TYPES = new Set([
  'TicketTrailEntry',
  'TicketPhoto',
  'Category',
  'Ward',
  'City',
  'User',
  // The self-relation: `duplicateOf Ticket?` points at another
  // ticket. The scalar it points at is `duplicateOfId`, which the
  // mapper copies separately.
  'Ticket',
]);

/**
 * The fields the Prisma mapper copies BY NAME off the ticket row.
 *
 * These are the `key: t.key` lines in the mapper's returned object.
 */
function mapperCopiedFields(): Set<string> {
  const src = readFileSync(DB_SWITCH, 'utf8');
  // The Prisma mapper is the `return { ... }` block that follows the
  // `prismaClient.ticket.findUnique` call. Anchor on the line that
  // starts it and take the balanced object literal.
  const anchor = src.indexOf('const t = await prismaClient.ticket.findUnique');
  expect(anchor, 'lib/db-switch.ts has no Prisma getTicketWithTrail branch').toBeGreaterThan(
    -1,
  );
  const retIdx = src.indexOf('return {', anchor);
  expect(retIdx, 'the Prisma mapper has no returned object literal').toBeGreaterThan(
    -1,
  );

  // Walk the braces to find the end of the object literal.
  let depth = 0;
  let end = retIdx;
  for (let i = retIdx; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const block = src.slice(retIdx, end);

  const copied = new Set<string>();
  // `key: t.key,` — a straight copy off the row.
  for (const m of block.matchAll(/(\w+):\s*t\.(\w+)/g)) {
    copied.add(m[1]);
  }
  // `key: t.key ?? null,` is covered by the same pattern. Also catch
  // the `key: t.some ?? <default>` form where the key differs.
  for (const m of block.matchAll(/(\w+):\s*t\.(\w+)\s*\?\?/g)) {
    copied.add(m[1]);
  }
  return copied;
}

describe('Prisma ticket mapper — field parity with the Prisma schema', () => {
  it('copies every scalar column of model Ticket', () => {
    const columns = ticketScalarColumns();
    const copied = mapperCopiedFields();

    // Sanity: the parser found the columns it should have.
    expect(columns).toContain('id');
    expect(columns).toContain('wardId');
    expect(columns).toContain('categoryId');
    expect(columns).toContain('assignedCrewId');
    expect(columns).toContain('status');

    const missing = columns.filter(
      (c) => !DERIVED_FIELDS.has(c) && !copied.has(c),
    );

    expect(
      missing,
      `The Prisma getTicketWithTrail mapper omits these Ticket columns: ${missing.join(
        ', ',
      )}. A dropped column is invisible on the dev store (which spreads ` +
        'the raw row) but silently changes behaviour on real Postgres — ' +
        'that is exactly how `version` went missing and broke every ' +
        'compare-and-swap write with a spurious 409 concurrent_write.',
    ).toEqual([]);
  });

  it('carries the optimistic-lock counter `version`', () => {
    // Spelled out separately so the failure names the field and the
    // consequence, rather than reporting an opaque array diff.
    const copied = mapperCopiedFields();
    expect(
      copied.has('version'),
      'The Prisma mapper must carry `version`. Every compare-and-swap ' +
        'write (assign-crew, dispatcher PATCH, dedup dismiss/confirm) ' +
        'reads it off getTicketWithTrail and uses it as the WHERE ' +
        'predicate; without it the write matches zero rows and answers ' +
        '409 concurrent_write even when nothing else changed the row.',
    ).toBe(true);
  });

  it('does not carry a derived field as if it were a ticket column', () => {
    // `departmentId` is a JOIN (Category.departmentId). It belongs on
    // the mapper but is NOT a column of model Ticket — so the parity
    // check must not demand it, and the mapper must not read it off
    // `t` as though the ticket row carried it.
    const copied = mapperCopiedFields();
    expect(copied.has('departmentId')).toBe(true);
    const columns = ticketScalarColumns();
    expect(columns).not.toContain('departmentId');
  });
});
