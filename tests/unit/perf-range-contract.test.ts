/**
 * Regression guard for the seed-relative performance range.
 *
 * THE FAILURE THIS PREVENTS
 * --------------------------
 * `lib/dev-store.ts` seeds `ticket_seed_resolved_1` at
 * `now - 10 * day`, where `now` is WALL-CLOCK time. The
 * dispatcher performance snapshot filters tickets by `createdAt`
 * against the requested range, and the crew feedback aggregate
 * reads the CURRENT period only.
 *
 * A test that hard-codes a calendar window therefore rots
 * silently. On 2026-10-31 the seed landed on 2026-10-21, one
 * day past the hard-coded `to` of 2026-10-20, and two tests
 * failed with `expected +0 to be 1`:
 *
 *   - `tests/unit/citizen/feedback.test.ts`
 *     ("the admin funnel AND the dispatcher crew table read the
 *     same value")
 *   - `tests/unit/dispatcher/performance.test.ts`
 *     ("aggregates the persisted feedback into the crew table")
 *
 * The failure looked like a production bug in the feedback write
 * path. It was not — the write path was correct and the FIXTURE
 * was stale.
 *
 * THE RULE
 * --------
 * A test that reads a SEEDED ticket and then filters that ticket
 * by date MUST derive its window from the ticket's own
 * `createdAt`, never from a hard-coded date. A hard-coded window
 * is a latent failure that only announces itself once the
 * calendar moves past it.
 *
 * This guard scans the test suite for the anti-pattern. It is
 * deliberately narrow: it looks for a hard-coded October 2026
 * window used in a call that also touches a seeded ticket, and it
 * requires the seed-relative helper to be the mechanism instead.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { getStore, resetStore } from '@/lib/dev-store';
import { rangeContaining } from '../helpers/perf-range';

/** The dev-store seed that the performance suite reads. */
const SEEDED_TICKET_ID = 'ticket_seed_resolved_1';

describe('rangeContaining', () => {
  it('produces a window that contains the timestamp it was given', () => {
    const created = '2026-03-15T08:00:00.000Z';
    const range = rangeContaining(created);
    expect(created >= range.from).toBe(true);
    expect(created <= range.to).toBe(true);
  });

  it('contains the SEEDED ticket whatever the calendar says', () => {
    resetStore();
    const seeded = getStore().tickets.get(SEEDED_TICKET_ID)!;
    const range = rangeContaining(seeded.createdAt);
    // The window is inclusive on both ends (lib/dispatcher/
    // performance.ts `inPerfRange`).
    expect(seeded.createdAt >= range.from).toBe(true);
    expect(seeded.createdAt <= range.to).toBe(true);
  });

  it('stays inside the platform cap of PERFORMANCE_MAX_DAYS', () => {
    // The window must not be so wide that it could exceed the
    // 90-day report cap enforced by resolvePerfRange.
    const range = rangeContaining('2026-10-21T08:34:00.000Z', 5);
    const days =
      (Date.parse(range.to) - Date.parse(range.from)) / 86_400_000;
    expect(days).toBeLessThan(90);
  });

  it('rejects an unparseable timestamp loudly rather than silently', () => {
    expect(() => rangeContaining('not-a-date')).toThrow(/unparseable/i);
  });
});

/* ------------------------------------------------------------------ */
/* The anti-pattern scan                                               */
/* ------------------------------------------------------------------ */

const TESTS_DIR = join(process.cwd(), 'tests', 'unit');

/** The seed-relative helper — the sanctioned mechanism. */
const HELPER_MARKER = 'rangeContaining';

/**
 * Files that read a SEEDED ticket and then filter by date.
 *
 * These are the only places where a hard-coded window can silently
 * drop a wall-clock-seeded row out of the result set. Other suites
 * plant their own rows with an explicit `createdAt`, so their
 * dates are deterministic by construction and are NOT at risk.
 */
const SEED_DEPENDENT_FILES = [
  join(TESTS_DIR, 'citizen', 'feedback.test.ts'),
  join(TESTS_DIR, 'dispatcher', 'performance.test.ts'),
];

describe('seed-relative range discipline', () => {
  for (const file of SEED_DEPENDENT_FILES) {
    const relative = file.replace(process.cwd() + '\\', '').replace(/\\/g, '/');

    it(`${relative} derives its window from the seed, not the calendar`, () => {
      const source = readFileSync(file, 'utf8');

      // The file must use the seed-relative helper at least once.
      expect(source).toContain(HELPER_MARKER);

      // It must NOT still pass a hard-coded calendar window to the
      // performance snapshot. The old anti-pattern was exactly:
      //   getPerformanceSnapshot(SESSION, {
      //     from: '2026-10-01T00:00:00.000Z',
      //     to:   '2026-10-20T00:00:00.000Z',
      //   });
      // The remaining hard-coded windows in the suite are range-SHAPE
      // assertions (echo-back, daily-series span, before-range
      // exclusion) that do not depend on the seed's position in time —
      // so the guard only forbids a hard-coded window on the SAME call
      // that filters the seeded ticket.
      const snapshotCalls = source.match(
        /getPerformanceSnapshot\([\s\S]{0,220}?\)/g,
      );
      expect(snapshotCalls).not.toBeNull();

      for (const call of snapshotCalls ?? []) {
        const hardCodedWindow =
          /from:\s*'2026-\d\d-\d\dT/.test(call) &&
          /to:\s*'2026-\d\d-\d\dT/.test(call);
        if (hardCodedWindow) {
          // A hard-coded window is only acceptable when it is not
          // filtering the seeded ticket — i.e. the assertion is
          // about the range shape itself.
          const isShapeAssertion =
            /echoes the requested range|spans the requested range|excludes tickets created before/i.test(
              source.slice(
                Math.max(0, source.indexOf(call) - 400),
                source.indexOf(call),
              ),
            );
          expect(
            isShapeAssertion,
            `${relative}: a hard-coded date window is passed to ` +
              `getPerformanceSnapshot:\n${call}\n\n` +
              `Use rangeContaining(<ticket>.createdAt) instead — a ` +
              `hard-coded window drops the wall-clock-seeded ticket ` +
              `out of the current period once the calendar moves.`,
          ).toBe(true);
        }
      }
    });
  }

  it('the guard is non-vacuous — a hard-coded window IS detected', () => {
    // Re-create the original bug's shape and prove the scanner
    // rejects it. Without this, the guard could pass for the wrong
    // reason (e.g. a regex that never matches).
    const buggy = `
      const snapshot = await getPerformanceSnapshot(DISPATCHER_SESSION, {
        from: '2026-10-01T00:00:00.000Z',
        to: '2026-10-20T00:00:00.000Z',
      });
    `;
    const calls = buggy.match(/getPerformanceSnapshot\([\s\S]{0,220}?\)/g);
    expect(calls).not.toBeNull();
    const hasHardCoded =
      (calls ?? []).some(
        (c) =>
          /from:\s*'2026-\d\d-\d\dT/.test(c) &&
          /to:\s*'2026-\d\d-\d\dT/.test(c),
      );
    expect(hasHardCoded).toBe(true);
  });

  it('the seeded ticket really is wall-clock relative', () => {
    // Pins the premise of the whole guard: if the seed ever became
    // date-fixed, the seed-relative helper would become unnecessary
    // and this guard would need to be revisited.
    resetStore();
    const seeded = getStore().tickets.get(SEEDED_TICKET_ID)!;
    const ageMs = Date.now() - Date.parse(seeded.createdAt);
    const ageDays = ageMs / 86_400_000;
    expect(ageDays).toBeGreaterThan(9);
    expect(ageDays).toBeLessThan(11);
  });
});

/* ------------------------------------------------------------------ */
/* Guard against the scan itself going stale                           */
/* ------------------------------------------------------------------ */

describe('the scan sees the real test files', () => {
  it('finds the seed-dependent suites on disk', () => {
    for (const file of SEED_DEPENDENT_FILES) {
      expect(() => statSync(file)).not.toThrow();
      expect(readFileSync(file, 'utf8')).toContain(SEEDED_TICKET_ID);
    }
  });

  it('walks the unit test tree without throwing', () => {
    // A cheap smoke check that the directory walk used above is
    // sound — a future rename that breaks it should fail here
    // rather than silently narrowing the scan.
    let count = 0;
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
        } else if (entry.endsWith('.test.ts')) {
          count += 1;
        }
      }
    };
    walk(TESTS_DIR);
    expect(count).toBeGreaterThan(50);
  });
});
