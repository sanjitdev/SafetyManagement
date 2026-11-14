/**
 * Duration formatting.
 *
 * One formatter for "how long did this take", because two pages had
 * two copies and the monitor page reached into the performance
 * page's i18n namespace for its labels — so the performance page was
 * silently the owner of a key three other surfaces needed.
 *
 * The formatter is coarse on purpose. A dispatcher reads "2 d 3 h",
 * not "51 h 12 m". The unit is the largest one that fits, so a
 * one-minute duration reads "1 m" and a three-day duration reads
 * "3 d" — never "3 d 0 h".
 *
 * A duration of zero or less is NOT "0 m". It means "there is no
 * duration here" (a crew with no resolved jobs, a ticket with no
 * clock yet), and it renders as an em dash. Writing "0 m" would
 * claim a measurement that was never taken.
 */

import { t, type Language } from '@/lib/i18n/keys';

/**
 * Format a duration in milliseconds as a compact "2 d" / "3 h" / "5 m"
 * string.
 *
 * @param ms    The duration in milliseconds.
 * @param lang  The document language.
 * @returns The formatted duration, or an em dash when there is none.
 */
export function formatDuration(ms: number, lang: Language): string {
  if (ms <= 0) return '—';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) {
    return t('ui.duration.minutes', { n: minutes }, lang);
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return t('ui.duration.hours', { n: hours }, lang);
  }
  const days = Math.floor(hours / 24);
  return t('ui.duration.days', { n: days }, lang);
}
