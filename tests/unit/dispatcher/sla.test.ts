/**
 * Unit tests for the dispatcher's SLA countdown
 * (lib/dispatcher/sla.ts) and its dev-store mirror.
 *
 * ── Why the clock is injected ──────────────────────────────────
 *
 * `computeSlaState` takes `now` as a parameter rather than reading
 * the wall clock. A countdown chip is a time-window assertion, and a
 * wall-clock read cannot be asserted without a fake timer or a
 * tolerance window wide enough to hide a real defect. Injecting the
 * instant makes every case exact.
 *
 * ── Why the dev-store mirror is tested here ────────────────────
 *
 * `SlaPolicy` exists in the Prisma schema and is seeded for five
 * categories in `prisma/seed.ts`, but the in-memory dev store did
 * not carry the entity at all — so `db.slaPolicy.findMany(...)` in
 * dev mode was `undefined.findMany`, a TypeError rather than an
 * empty result. The dev store is what the Playwright suite runs
 * against, so a read path written without the mirror could never
 * pass its own route spec. These cases pin both the values and the
 * shape.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import {
  computeMetSlaState,
  computeSlaState,
  formatRemainingHours,
  slaStartedAt,
} from '@/lib/dispatcher/sla';
import {
  loadSlaPoliciesByCategory,
  slaStateFor,
  slaStateForResolved,
} from '@/lib/dispatcher/sla-resolve';
import { db } from '@/lib/db-switch';
import { getStore, resetStore } from '@/lib/dev-store';

const HOUR = 60 * 60 * 1000;
const NOW = new Date('2026-11-13T12:00:00Z').getTime();

beforeEach(() => {
  resetStore();
});

describe('slaStartedAt', () => {
  it('returns null when the ticket was never routed', () => {
    expect(
      slaStartedAt([
        { toStatus: 'submitted', timestamp: '2026-11-13T10:00:00Z' },
      ]),
    ).toBeNull();
  });

  it('returns the instant of the routed transition', () => {
    expect(
      slaStartedAt([
        { toStatus: 'submitted', timestamp: '2026-11-13T10:00:00Z' },
        { toStatus: 'routed', timestamp: '2026-11-13T10:30:00Z' },
      ]),
    ).toBe('2026-11-13T10:30:00Z');
  });

  it('normalises a Date timestamp to ISO', () => {
    expect(
      slaStartedAt([
        { toStatus: 'routed', timestamp: new Date('2026-11-13T10:30:00Z') },
      ]),
    ).toBe('2026-11-13T10:30:00.000Z');
  });

  it('skips an unparseable timestamp rather than returning it', () => {
    // A malformed entry must not become the clock start — the chip
    // would then count down from a moment that never happened.
    expect(
      slaStartedAt([
        { toStatus: 'routed', timestamp: 'not-a-date' },
        { toStatus: 'routed', timestamp: '2026-11-13T10:30:00Z' },
      ]),
    ).toBe('2026-11-13T10:30:00Z');
  });
});

describe('computeSlaState', () => {
  it('reports "no target" when the category has no policy', () => {
    const state = computeSlaState('2026-11-13T10:00:00Z', null, NOW);
    expect(state.tone).toBe('not_started');
    expect(state.targetHours).toBeNull();
    expect(state.remainingHours).toBe(0);
  });

  it('reports "not started" when the ticket has not been routed', () => {
    const state = computeSlaState(null, 48, NOW);
    expect(state.tone).toBe('not_started');
    expect(state.targetHours).toBe(48);
    // The full target is still owed — the clock has not started.
    expect(state.remainingHours).toBe(48);
    expect(state.dueAt).toBeNull();
  });

  it('counts down the REMAINING time, not the elapsed time', () => {
    // Routed 2 hours ago against a 48-hour target: 46 hours left.
    const state = computeSlaState('2026-11-13T10:00:00Z', 48, NOW);
    expect(state.remainingHours).toBeCloseTo(46, 5);
    expect(state.tone).toBe('on_track');
  });

  it('computes the due instant from the routed instant', () => {
    const state = computeSlaState('2026-11-13T10:00:00Z', 48, NOW);
    expect(state.dueAt).toBe('2026-11-15T10:00:00.000Z');
  });

  it('turns at_risk once half the target is gone', () => {
    const state = computeSlaState(
      new Date(NOW - 30 * HOUR).toISOString(),
      48,
      NOW,
    );
    expect(state.remainingHours).toBeCloseTo(18, 5);
    expect(state.tone).toBe('at_risk');
  });

  it('turns at_risk once a quarter of the target is gone', () => {
    const state = computeSlaState(
      new Date(NOW - 40 * HOUR).toISOString(),
      48,
      NOW,
    );
    expect(state.remainingHours).toBeCloseTo(8, 5);
    expect(state.tone).toBe('at_risk');
  });

  it('turns breached once the target passes', () => {
    const state = computeSlaState(
      new Date(NOW - 50 * HOUR).toISOString(),
      48,
      NOW,
    );
    expect(state.remainingHours).toBeCloseTo(-2, 5);
    expect(state.tone).toBe('breached');
  });

  it('scales the warning band to the target length', () => {
    // A 168-hour policy warns at 84 hours left, not at the 24 hours
    // a 48-hour policy warns at — the band is a fraction of the
    // target, so both policies get the same three stages.
    const longTarget = computeSlaState(
      new Date(NOW - 90 * HOUR).toISOString(),
      168,
      NOW,
    );
    expect(longTarget.remainingHours).toBeCloseTo(78, 5);
    expect(longTarget.tone).toBe('at_risk');

    const shortTarget = computeSlaState(
      new Date(NOW - 30 * HOUR).toISOString(),
      48,
      NOW,
    );
    expect(shortTarget.remainingHours).toBeCloseTo(18, 5);
    expect(shortTarget.tone).toBe('at_risk');
  });
});

describe('computeMetSlaState', () => {
  it('reports "met" when the ticket was resolved before the target', () => {
    const state = computeMetSlaState(
      48,
      '2026-11-13T10:00:00Z',
      '2026-11-13T20:00:00Z',
    );
    expect(state.tone).toBe('met');
    expect(state.remainingHours).toBeCloseTo(38, 5);
  });

  it('reports "breached" when the ticket was resolved after the target', () => {
    const state = computeMetSlaState(
      48,
      '2026-11-13T10:00:00Z',
      '2026-11-15T20:00:00Z',
    );
    expect(state.tone).toBe('breached');
    expect(state.remainingHours).toBeLessThan(0);
  });

  it('falls back to "no target" when there is no policy', () => {
    expect(
      computeMetSlaState(null, '2026-11-13T10:00:00Z', '2026-11-13T20:00:00Z')
        .tone,
    ).toBe('not_started');
  });
});

describe('formatRemainingHours', () => {
  it('shows minutes under an hour', () => {
    expect(formatRemainingHours(0.75)).toEqual({
      value: 45,
      unit: 'minutes',
    });
  });

  it('shows hours between an hour and two days', () => {
    expect(formatRemainingHours(46)).toEqual({ value: 46, unit: 'hours' });
  });

  it('shows days beyond two days', () => {
    expect(formatRemainingHours(78)).toEqual({ value: 4, unit: 'days' });
  });

  it('rounds UP a positive remaining time', () => {
    // 12.4 hours left must not read as "12h" — that reads as LESS
    // time than there is. "13h" is the honest reading.
    expect(formatRemainingHours(12.4)).toEqual({ value: 13, unit: 'hours' });
  });

  it('shows the OVERDUE amount for a breached ticket', () => {
    expect(formatRemainingHours(-2)).toEqual({ value: 2, unit: 'hours' });
    expect(formatRemainingHours(-50)).toEqual({ value: 3, unit: 'days' });
  });
});

describe('the dev-store SLA mirror', () => {
  it('seeds one policy per category', () => {
    const policies = getStore().slaPolicies;
    expect(policies.size).toBe(5);
  });

  it('carries the same target hours as prisma/seed.ts', () => {
    const byCategory = new Map(
      [...getStore().slaPolicies.values()].map((p) => [
        p.categoryId,
        p.resolveHours,
      ]),
    );
    // DHAKA_SLA_POLICIES in prisma/seed.ts.
    expect(byCategory.get('cat_streetlight')).toBe(72);
    expect(byCategory.get('cat_pothole')).toBe(168);
    expect(byCategory.get('cat_drainage')).toBe(120);
    expect(byCategory.get('cat_garbage')).toBe(48);
    expect(byCategory.get('cat_other')).toBe(168);
  });

  it('resolves a policy by category id', async () => {
    const policy = await db.slaPolicy.findUnique({
      where: { categoryId: 'cat_garbage' },
    });
    expect(policy?.resolveHours).toBe(48);
  });

  it('resolves the city policies into a category-keyed map', async () => {
    const map = await loadSlaPoliciesByCategory('city_dhaka_north');
    expect(map.size).toBe(5);
    expect(map.get('cat_streetlight')).toBe(72);
  });

  it('returns an empty map for a city with no policies', async () => {
    const map = await loadSlaPoliciesByCategory('city_nonexistent');
    expect(map.size).toBe(0);
  });
});

describe('slaStateFor', () => {
  it('answers a routed ticket with the remaining time', async () => {
    const policies = await loadSlaPoliciesByCategory('city_dhaka_north');
    const { resolved } = slaStateFor(
      'cat_garbage',
      [{ toStatus: 'routed', timestamp: new Date(NOW - 2 * HOUR).toISOString() }],
      policies,
      NOW,
    );
    expect(resolved.slaTargetHours).toBe(48);
    expect(resolved.slaRemainingHours).toBeCloseTo(46, 5);
    expect(resolved.slaStartedAt).toBe(new Date(NOW - 2 * HOUR).toISOString());
    expect(resolved.slaDueAt).toBe(
      new Date(NOW - 2 * HOUR + 48 * HOUR).toISOString(),
    );
  });

  it('answers an unrouted ticket with null remaining hours', async () => {
    const policies = await loadSlaPoliciesByCategory('city_dhaka_north');
    const { resolved } = slaStateFor(
      'cat_garbage',
      [{ toStatus: 'submitted', timestamp: new Date(NOW - 2 * HOUR).toISOString() }],
      policies,
      NOW,
    );
    expect(resolved.slaTargetHours).toBe(48);
    expect(resolved.slaRemainingHours).toBeNull();
    expect(resolved.slaStartedAt).toBeNull();
  });

  it('answers a category with no policy with nulls, not zeros', async () => {
    const policies = await loadSlaPoliciesByCategory('city_dhaka_north');
    const { resolved } = slaStateFor(
      'cat_unknown',
      [{ toStatus: 'routed', timestamp: new Date(NOW).toISOString() }],
      policies,
      NOW,
    );
    expect(resolved.slaTargetHours).toBeNull();
    expect(resolved.slaRemainingHours).toBeNull();
  });
});

describe('slaStateForResolved', () => {
  it('reports a met SLA for a resolved ticket', async () => {
    const policies = await loadSlaPoliciesByCategory('city_dhaka_north');
    const { state, resolved } = slaStateForResolved(
      'cat_garbage',
      [{ toStatus: 'routed', timestamp: new Date(NOW - 10 * HOUR).toISOString() }],
      policies,
      new Date(NOW - 2 * HOUR).toISOString(),
    );
    expect(state.tone).toBe('met');
    // Routed 10 hours ago, resolved 8 hours after that — 8 hours of
    // the 48-hour target were consumed, 40 were left over.
    expect(resolved.slaRemainingHours).toBeCloseTo(40, 5);
  });

  it('reports a breached SLA for a late ticket', async () => {
    const policies = await loadSlaPoliciesByCategory('city_dhaka_north');
    const { state } = slaStateForResolved(
      'cat_garbage',
      [{ toStatus: 'routed', timestamp: new Date(NOW - 100 * HOUR).toISOString() }],
      policies,
      new Date(NOW).toISOString(),
    );
    expect(state.tone).toBe('breached');
  });
});
