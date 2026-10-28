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
 */

import type { Language } from '@/lib/i18n/keys';

const LOCALE: Record<Language, string> = {
  bn: 'bn-BD',
  en: 'en-US',
};

const OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
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
    });
  } catch {
    return iso;
  }
}
