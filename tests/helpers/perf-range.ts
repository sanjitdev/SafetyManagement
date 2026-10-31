/**
 * Test helpers for building a performance-report range that
 * provably contains a given ticket.
 *
 * WHY THIS EXISTS
 * ---------------
 * `lib/dev-store.ts` seeds `ticket_seed_resolved_1` at
 * `now - 10 * day`, where `now` is wall-clock time. The
 * dispatcher performance snapshot filters tickets by `createdAt`
 * against the requested range, and the crew feedback aggregate
 * reads the CURRENT period only.
 *
 * A test that hard-codes an October date window therefore rots:
 * once the wall clock passes the end of that window, the seeded
 * ticket silently falls out of `current` and the crew tally
 * drops to 0 — a failure that looks like a production bug but is
 * a stale fixture. That is exactly how
 * `tests/unit/citizen/feedback.test.ts` and
 * `tests/unit/dispatcher/performance.test.ts` began failing on
 * 2026-10-31 (the seed landed on 2026-10-21, one day past the
 * hard-coded `to` of 2026-10-20).
 *
 * The fix is to derive the window from the ticket's OWN
 * `createdAt` rather than from the calendar. The window then
 * always contains the ticket, on any day, forever — and it stays
 * deterministic, because it is a pure function of the seed.
 */

/**
 * Build a `{ from, to }` window guaranteed to contain `createdAt`.
 *
 * The window is centred on the ticket's creation instant, padded
 * by `padDays` on each side. `to` is pushed to the end of that
 * padded day so a ticket created late in the day is still inside
 * the window.
 *
 * @param createdAt - The ticket's `createdAt` ISO timestamp.
 * @param padDays   - Days of slack on each side (default 5).
 * @returns An ISO pair suitable for `getPerformanceSnapshot`.
 */
export function rangeContaining(
  createdAt: string,
  padDays = 5,
): { from: string; to: string } {
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) {
    throw new Error(
      `rangeContaining: unparseable createdAt "${createdAt}" — ` +
        'the dev-store seed should always carry a valid ISO timestamp.',
    );
  }

  const padMs = padDays * 86_400_000;
  const from = new Date(created - padMs);
  // End-of-day on the padded `to` day, so a ticket created at
  // 23:59 local-ish time still compares as inside the range.
  const to = new Date(created + padMs);
  to.setUTCHours(23, 59, 59, 999);

  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}
