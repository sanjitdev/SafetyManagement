/**
 * Tests for the pinned clock (lib/format/clock.ts).
 *
 * The clock is what makes a visual baseline reproducible. If it
 * regresses — back to the wall clock, or to the runtime's timezone —
 * every route-spec screenshot starts failing again, and the failure
 * looks like a flaky baseline rather than a broken clock. So the
 * behaviour is pinned here explicitly.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

const PINNED = '2026-11-06T09:44:00.000Z';

/**
 * Load the clock module with a controlled environment.
 *
 * ── Why BOTH variables are set ────────────────────────────────
 *
 * The clock reads `NEXT_PUBLIC_CITYFIX_SEED_NOW` FIRST and
 * `CITYFIX_SEED_NOW` second — the public name is the one inlined
 * into the client bundle, so the server and the browser cannot
 * disagree about "now". They are two names for ONE pin.
 *
 * So the harness must control both. Setting only the server-only
 * name would leave the ambient public name in place, and since the
 * public one wins, the module would read whatever the CI workflow
 * happens to export — and the "falls back to the wall clock" test
 * would fail on a pinned runner, and the "calendar day" test would
 * read the CI pin instead of the one it asked for.
 *
 * `env` names the pin; both variables are set from it (or both
 * removed, when it is `undefined`).
 */
async function loadClock(env: {
  pin?: string;
  /** Set to a malformed value to exercise the warning path. */
  malformed?: string;
}) {
  vi.resetModules();
  const previous: Record<string, string | undefined> = {};
  const values: Record<string, string | undefined> = {
    NEXT_PUBLIC_CITYFIX_SEED_NOW: env.pin,
    CITYFIX_SEED_NOW: env.pin,
  };
  if (env.malformed !== undefined) {
    values.NEXT_PUBLIC_CITYFIX_SEED_NOW = env.malformed;
    values.CITYFIX_SEED_NOW = env.malformed;
  }
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const mod = await import('@/lib/format/clock');
  return {
    mod,
    restore: () => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      vi.resetModules();
    },
  };
}

describe('pinned clock', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the pinned epoch when CITYFIX_SEED_NOW is set', async () => {
    const { mod, restore } = await loadClock({ pin: PINNED });
    try {
      expect(mod.nowMs()).toBe(Date.parse(PINNED));
      expect(mod.nowIso()).toBe(PINNED);
    } finally {
      restore();
    }
  });

  it('returns the SAME value on every call — the clock does not tick', async () => {
    const { mod, restore } = await loadClock({ pin: PINNED });
    try {
      const first = mod.nowMs();
      const second = mod.nowMs();
      expect(second).toBe(first);
    } finally {
      restore();
    }
  });

  it('falls back to the wall clock when CITYFIX_SEED_NOW is unset', async () => {
    const { mod, restore } = await loadClock({ pin: undefined });
    try {
      const before = Date.now();
      const value = mod.nowMs();
      const after = Date.now();
      expect(value).toBeGreaterThanOrEqual(before);
      expect(value).toBeLessThanOrEqual(after);
    } finally {
      restore();
    }
  });

  it('warns and falls back to the wall clock for a malformed pin', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { mod, restore } = await loadClock({ malformed: 'not-a-timestamp' });
    try {
      const before = Date.now();
      const value = mod.nowMs();
      const after = Date.now();
      expect(value).toBeGreaterThanOrEqual(before);
      expect(value).toBeLessThanOrEqual(after);
      // A malformed pin must NOT silently produce a different clock
      // than the one that was asked for — that would defeat the point.
      expect(warn).toHaveBeenCalled();
      expect(warn.mock.calls[0]?.[0]).toMatch(/CITYFIX_SEED_NOW/);
    } finally {
      restore();
    }
  });

  it('reads the calendar day in Asia/Dhaka, not in the runtime zone', async () => {
    // 2026-11-06T18:30:00Z is 2026-11-07 00:30 in Dhaka (UTC+6).
    // A UTC server would call this "06 Nov"; a Dhaka server "07 Nov".
    // The product's frame of reference is Dhaka.
    const { mod, restore } = await loadClock({ pin: '2026-11-06T18:30:00.000Z' });
    try {
      expect(mod.todayInProductZone()).toEqual({
        year: 2026,
        month: 10,
        day: 7,
      });
    } finally {
      restore();
    }
  });

  it('computes the product zone offset as +06:00', async () => {
    const { mod, restore } = await loadClock({ pin: PINNED });
    try {
      expect(mod.productZoneOffsetMinutes(new Date(PINNED))).toBe(360);
    } finally {
      restore();
    }
  });

  it('builds a slot at the product-zone wall clock time', async () => {
    const { mod, restore } = await loadClock({ pin: PINNED });
    try {
      // The reference instant is 15:44 Dhaka on 06 Nov. A 10:00 slot
      // on that Dhaka day is 04:00Z — NOT 10:00Z, which is what
      // `setHours` would have produced on a UTC server.
      const reference = new Date('2026-11-06T09:44:00.000Z');
      const slot = mod.slotInProductZone(reference, 10, 0);
      expect(slot.toISOString()).toBe('2026-11-06T04:00:00.000Z');
      expect(
        slot.toLocaleString('en-US', {
          timeZone: 'Asia/Dhaka',
          hour: 'numeric',
          minute: '2-digit',
        }),
      ).toContain('10:00');
    } finally {
      restore();
    }
  });

  it('rolls a slot that has already passed back one day', async () => {
    const { mod, restore } = await loadClock({ pin: PINNED });
    try {
      // The reference instant is 15:44 Dhaka on 06 Nov. A 16:00 slot
      // on that Dhaka day is 10:00Z — which is AFTER the reference, so
      // it rolls back to 05 Nov 16:00 (09:00Z).
      const reference = new Date('2026-11-06T09:44:00.000Z');
      const slot = mod.slotInProductZone(reference, 16, 0);
      expect(slot.toISOString()).toBe('2026-11-05T10:00:00.000Z');
      expect(slot.getTime()).toBeLessThan(reference.getTime());
    } finally {
      restore();
    }
  });

  it('keeps a slot that is still ahead today', async () => {
    const { mod, restore } = await loadClock({ pin: PINNED });
    try {
      // 15:00 Dhaka is 09:00Z — still ahead of the 09:44Z reference
      // on the SAME Dhaka day, so it does not roll back.
      const reference = new Date('2026-11-06T09:44:00.000Z');
      const slot = mod.slotInProductZone(reference, 15, 0);
      expect(slot.toISOString()).toBe('2026-11-06T09:00:00.000Z');
    } finally {
      restore();
    }
  });

  it('buckets an instant by its product-zone calendar day', async () => {
    const { mod, restore } = await loadClock({ pin: PINNED });
    try {
      // 18:30Z is already 07 Nov in Dhaka — bucketing by the raw UTC
      // date would file it under 06 Nov.
      expect(mod.calendarDayInProductZone('2026-11-06T18:30:00.000Z')).toBe(
        '2026-11-07',
      );
      expect(mod.calendarDayInProductZone('2026-11-06T09:44:00.000Z')).toBe(
        '2026-11-06',
      );
    } finally {
      restore();
    }
  });

  it('prefers the PUBLIC pin over the server-only pin', async () => {
    // The public name is the one inlined into the client bundle, so
    // using it on the server too is what guarantees the server and
    // the browser agree. If the server-only name won instead, the
    // browser would fall back to the wall clock and React would fail
    // the hydration with "Text content did not match".
    //
    // This is the defect that broke CI when the public variable was
    // added: the ambient public pin overrode the server-only one.
    vi.resetModules();
    const previousPublic = process.env.NEXT_PUBLIC_CITYFIX_SEED_NOW;
    const previousPrivate = process.env.CITYFIX_SEED_NOW;
    process.env.NEXT_PUBLIC_CITYFIX_SEED_NOW = PINNED;
    process.env.CITYFIX_SEED_NOW = '2020-01-01T00:00:00.000Z';
    try {
      const mod = await import('@/lib/format/clock');
      expect(mod.nowIso()).toBe(PINNED);
    } finally {
      if (previousPublic === undefined) {
        delete process.env.NEXT_PUBLIC_CITYFIX_SEED_NOW;
      } else {
        process.env.NEXT_PUBLIC_CITYFIX_SEED_NOW = previousPublic;
      }
      if (previousPrivate === undefined) {
        delete process.env.CITYFIX_SEED_NOW;
      } else {
        process.env.CITYFIX_SEED_NOW = previousPrivate;
      }
      vi.resetModules();
    }
  });
});
