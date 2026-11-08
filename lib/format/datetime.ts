/**
 * Locale-aware date/time formatting (lib/format/datetime.ts).
 *
 * A bare `new Date(iso).toLocaleString()` formats against the RUNTIME
 * default, not the reader's chosen language. On the Bangla-first
 * surfaces that rendered US-format timestamps ("10/26/2026, 3:32:11 PM")
 * next to Bangla copy.
 *
 * `formatTimestamp(iso, 'bn')` pins the locale to `bn-BD`, so the
 * output matches the page's language regardless of the browser's
 * locale setting.
 *
 * THE TIMEZONE IS PINNED TOO
 * --------------------------
 * `toLocaleString` also resolves the TIMEZONE from the runtime, so the
 * same instant renders as a different clock time on a server in Dhaka
 * than on one in UTC — six hours apart for this product.
 *
 * Two things were wrong with that:
 *
 *   1. It is a product bug. A ticket filed at 15:00 Dhaka time showing
 *      "09:00 AM" to a Dhaka resident is simply wrong. The city's time
 *      is the only sensible frame of reference for a city-services
 *      platform, and a visitor from another timezone should still see
 *      the city's clock rather than the server's.
 *
 *   2. It made the visual baselines unreproducible. The baselines are
 *      asserted on `ubuntu-latest`, which runs in UTC; the dev machine
 *      runs in `Asia/Dhaka`. The same seed rendered two different
 *      pages on the two machines, so a baseline could never pass on
 *      both — and the timestamp column was the difference.
 *
 * `timeZone: 'Asia/Dhaka'` is pinned here so the rendered clock is the
 * city's clock everywhere: in CI, in the container, on the dev
 * machine, and in production.
 */

import type { Language } from '@/lib/i18n/keys';

const LOCALE: Record<Language, string> = {
  bn: 'bn-BD',
  en: 'en-US',
};

/**
 * The timezone every timestamp is rendered in.
 *
 * Dhaka is the city this platform serves, so it is the frame of
 * reference for every surface — a citizen reading "১২:৩০ PM" on a
 * ticket must mean 12:30 in Dhaka, not 12:30 wherever the server
 * happens to be running.
 */
const TIME_ZONE = 'Asia/Dhaka';

/**
 * The product's timezone, exported so a caller that must format a date
 * itself can pin the same zone rather than resolving the runtime's.
 */
export const PRODUCT_TIME_ZONE = TIME_ZONE;

const OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: TIME_ZONE,
};

/**
 * Format an ISO timestamp for the given language.
 *
 * Falls back to the raw string when the input is unparseable — a
 * malformed date should degrade to something readable, never throw
 * during render.
 */
export function formatTimestamp(iso: string, lang: Language): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(LOCALE[lang], OPTIONS);
  } catch {
    return iso;
  }
}

/**
 * Format an ISO timestamp in the shorter `en-GB` / `bn-BD` style.
 *
 * Several dispatcher surfaces want the compact "06 Nov 2026, 15:04" form
 * rather than the long `en-US` form used by the shared helper. Each of
 * those surfaces used to carry its own local copy of this function —
 * which is how four copies of a formatter, four different timezone
 * behaviours, and four opportunities to drift came to exist.
 */
export function formatTimestampShort(iso: string, lang: Language): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-GB', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: TIME_ZONE,
    });
  } catch {
    return iso;
  }
}

/**
 * Format an ISO timestamp as a date only (no time).
 */
export function formatDate(iso: string, lang: Language): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(LOCALE[lang], {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      timeZone: TIME_ZONE,
    });
  } catch {
    return iso;
  }
}

/**
 * Format a CALENDAR DAY as a short label ("06 Nov").
 *
 * A chart axis label is a day, not an instant, so it must be built in
 * the product's timezone. `new Date(y, m, d)` uses the runtime's local
 * calendar, so on a UTC server a label meant to be "today in Dhaka"
 * could fall on the previous day. `formatDayLabel` takes the day
 * components in the product's zone and formats them there.
 */
export function formatDayLabel(
  year: number,
  month: number,
  day: number,
  lang: Language,
): string {
  try {
    // Build the day as an instant in the product's zone, then read the
    // day back in that same zone.
    const utcGuess = Date.UTC(year, month, day, 12, 0, 0);
    const d = new Date(utcGuess);
    return d.toLocaleDateString(LOCALE[lang], {
      month: 'short',
      day: 'numeric',
      timeZone: TIME_ZONE,
    });
  } catch {
    return `${day}`;
  }
}

/**
 * Format an ISO timestamp as a WEEKDAY label ("Sun", "রবি").
 *
 * The dispatcher's trend axis shows one point per day of the week, and
 * the label is the weekday that day falls on. The day is read in the
 * product's timezone, not the runtime's — a UTC server resolving a
 * Dhaka calendar day in UTC can land on the previous day and label
 * the axis with the wrong weekday.
 */
export function formatWeekday(iso: string, lang: Language): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(LOCALE[lang], {
      weekday: 'short',
      timeZone: TIME_ZONE,
    });
  } catch {
    return '';
  }
}

/**
 * Format a calendar day as a WEEKDAY label ("Sun", "রবি").
 *
 * Same rule as `formatDayLabel`: the day must be read in the product's
 * timezone, or a UTC server labels the wrong day.
 */
export function formatWeekdayForDay(
  year: number,
  month: number,
  day: number,
  lang: Language,
): string {
  try {
    const utcGuess = Date.UTC(year, month, day, 12, 0, 0);
    const d = new Date(utcGuess);
    return d.toLocaleDateString(LOCALE[lang], {
      weekday: 'short',
      timeZone: TIME_ZONE,
    });
  } catch {
    return '';
  }
}
