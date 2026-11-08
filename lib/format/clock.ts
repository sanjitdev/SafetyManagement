/**
 * The pinned clock (lib/format/clock.ts).
 *
 * WHY A PINNED CLOCK EXISTS
 * -------------------------
 * Every surface in this product renders absolute times: a ticket's
 * `createdAt`, an audit row's timestamp, the "today" a chart axis
 * starts from. Those renderings are the difference between a visual
 * baseline that passes and one that fails forever.
 *
 * A screenshot taken at 09:44 shows "০৬ নভে, ২০২৬, ০৯:৪৪ PM"; one
 * taken an hour later shows "১০:৪৪ PM". The page is identical — the
 * CLOCK moved. So a baseline captured at one moment can never be
 * asserted at another, and "regenerate the baseline" fixes it for
 * exactly as long as nobody looks at it again.
 *
 * This was not hypothetical. The route-spec suite hit exactly this:
 * `18-admin-audit-light` and `19-admin-tickets-light` failed because
 * every row's timestamp differed, and the pixel diff grew and shrank
 * with the wall clock.
 *
 * THE PIN
 * -------
 * `CITYFIX_SEED_NOW` freezes the clock at a fixed epoch. Set it to an
 * ISO timestamp and every timestamp this platform renders is
 * identical on every run, on every machine, in every timezone — so
 * the rendered page is byte-identical and the baseline is stable.
 *
 * The Playwright config passes it to the dev server, and the
 * baseline-regeneration workflow passes the same value, so both sides
 * agree by construction rather than by luck.
 *
 * WHEN IT IS NOT SET
 * ------------------
 * The clock falls back to `Date.now()` and the platform behaves
 * exactly as it always has. The demo keeps its live timestamps; only
 * the test harness gets a frozen clock.
 *
 * A MALFORMED VALUE MUST NOT SILENTLY PRODUCE A DIFFERENT CLOCK
 * --------------------------------------------------------------
 * Falling back quietly would defeat the entire point — the run would
 * look pinned but render live times, and the failure would look like
 * a flaky baseline rather than a misconfiguration. So the fallback
 * warns loudly on stderr.
 */

let cached: number | null = null;

/**
 * The pinned epoch, as a PUBLIC environment variable.
 *
 * WHY THE PUBLIC PREFIX
 * ---------------------
 * `process.env.CITYFIX_SEED_NOW` is only readable on the SERVER. A
 * client component that renders on the server AND in the browser —
 * which every chart axis is — would read the pinned clock on the
 * server and the wall clock in the browser. The two would disagree,
 * and React would fail the hydration with "Text content did not match"
 * because the server-rendered HTML said one day and the client
 * rendered another.
 *
 * That is not hypothetical. The `/home` trend chart rendered its axis
 * from the clock, and the server said "৩১ অক্টো … ৬ নভে" while the
 * client said "১ নভে … ৯ নভে" — three days apart, because the
 * browser had no access to the pin.
 *
 * `NEXT_PUBLIC_` is inlined into the client bundle at build time, so
 * both sides read the SAME value. The variable is a test-harness
 * setting, not a secret, and it is only set when the clock is pinned
 * (i.e. in CI and the container), so the production bundle never
 * carries it.
 *
 * `CITYFIX_SEED_NOW` is still read as the fallback, because the SERVER
 * sees the un-prefixed name and the variable is set once for both.
 */
const PUBLIC_PIN =
  typeof process !== 'undefined'
    ? process.env.NEXT_PUBLIC_CITYFIX_SEED_NOW
    : undefined;

/**
 * The pinned epoch in milliseconds, or `null` when the clock is live.
 *
 * Resolved once per process: the value cannot change mid-run (it is
 * an environment variable), and re-reading it on every call would
 * make the cost of a formatter visible in a hot path.
 */
function pinnedEpoch(): number | null {
  if (cached !== null) return cached === -1 ? null : cached;
  // The public variable wins: it is the one the browser sees, so using
  // it on the server too guarantees the two agree.
  const pinned =
    PUBLIC_PIN ??
    (typeof process !== 'undefined' ? process.env.CITYFIX_SEED_NOW : undefined);
  if (!pinned) {
    cached = -1;
    return null;
  }
  const parsed = Date.parse(pinned);
  if (Number.isNaN(parsed)) {
    console.warn(
      `[clock] CITYFIX_SEED_NOW="${pinned}" is not a valid ISO timestamp; ` +
        'falling back to the wall clock. Timestamps will NOT be reproducible.',
    );
    cached = -1;
    return null;
  }
  cached = parsed;
  return parsed;
}

/**
 * The current time in milliseconds — pinned when `CITYFIX_SEED_NOW`
 * is set, the wall clock otherwise.
 *
 * Use this anywhere a timestamp is meant to be RENDERED (stored rows
 * that appear in a screenshot, "today" on a chart axis). Do NOT use it
 * for security or liveness decisions — session expiry, rate limiting
 * and lockouts must run on the real clock even under a pinned test
 * harness, or a frozen clock would freeze those too.
 */
export function nowMs(): number {
  const pinned = pinnedEpoch();
  return pinned === null ? Date.now() : pinned;
}

/**
 * The current time as an ISO-8601 string — pinned when
 * `CITYFIX_SEED_NOW` is set, the wall clock otherwise.
 */
export function nowIso(): string {
  return new Date(nowMs()).toISOString();
}

/**
 * The calendar day components of "now", in the PRODUCT TIMEZONE.
 *
 * A chart axis labelled "06 Nov" is a CALENDAR DAY, not an instant.
 * Reading the day in the runtime's timezone is how a "today in
 * Dhaka" label lands on the previous day for a UTC server — so this
 * helper reads the day back in the product's zone, the same zone the
 * formatters render in.
 */
export function todayInProductZone(): {
  year: number;
  month: number;
  day: number;
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    timeZone: 'Asia/Dhaka',
  }).formatToParts(new Date(nowMs()));
  const pick = (type: 'year' | 'month' | 'day'): number => {
    const found = parts.find((part) => part.type === type);
    return found ? Number(found.value) : 0;
  };
  return { year: pick('year'), month: pick('month') - 1, day: pick('day') };
}

/**
 * The PRODUCT-TIMEZONE calendar day of an instant, as `YYYY-MM-DD`.
 *
 * A ticket filed at 18:30Z is already the NEXT day in Dhaka. Bucketing
 * it by its raw UTC date would put it in the wrong bucket on any chart
 * whose axis is a Dhaka calendar day.
 */
export function calendarDayInProductZone(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Dhaka',
  }).format(d);
  // `en-CA` renders ISO-style YYYY-MM-DD.
  return parts;
}

/**
 * The product timezone's UTC offset, in minutes, at a given instant.
 *
 * Dhaka observes no daylight saving, so the offset is a constant
 * +06:00 — but it is COMPUTED rather than hard-coded, so the helper
 * stays correct if the product timezone ever changes.
 *
 * This is what lets a caller say "10:00 Dhaka time" and get the right
 * INSTANT, rather than "10:00 whatever the server thinks local time
 * is".
 */
export function productZoneOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(at);
  const get = (type: string): number => {
    const found = parts.find((part) => part.type === type);
    return found ? Number(found.value) : 0;
  };
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second'),
  );
  // The difference between the wall clock in the product zone and the
  // same wall clock read as UTC, in minutes.
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/**
 * The product timezone's UTC offset, in minutes, at the current instant.
 */
export function dhakaOffsetMinutes(at: Date): number {
  return productZoneOffsetMinutes(at);
}

/**
 * The instant whose PRODUCT-ZONE wall clock is `hour:minute` on the
 * product-zone calendar day that `reference` falls on.
 *
 * If that slot has already passed, the result rolls back one day — a
 * slot in the past is still a valid dispatch record.
 *
 * WHY NOT `date.setHours(hour, minute)`
 * -------------------------------
 * `setHours` sets the hour in the RUNTIME's timezone. On a UTC server
 * "10:00" became 16:00 Dhaka time, so the seeded crew-dashboard rows
 * showed a different slot on every machine and the visual baseline
 * could never hold. This helper computes the slot in the product's
 * zone and converts back to an instant — the same instant on every
 * machine.
 */
export function slotInProductZone(
  reference: Date,
  hour: number,
  minute: number,
): Date {
  const offset = productZoneOffsetMinutes(reference);
  // The product-zone calendar day of `reference`, as a wall-clock
  // timestamp (day boundaries, midnight).
  const wall = new Date(
    reference.getTime() + offset * 60_000,
  );
  const dayStartWall = Date.UTC(
    wall.getUTCFullYear(),
    wall.getUTCMonth(),
    wall.getUTCDate(),
  );
  const targetWall = dayStartWall + hour * 3_600_000 + minute * 60_000;
  let instant = new Date(targetWall - offset * 60_000);
  if (instant.getTime() > reference.getTime()) {
    instant = new Date(instant.getTime() - 24 * 3_600_000);
  }
  return instant;
}
