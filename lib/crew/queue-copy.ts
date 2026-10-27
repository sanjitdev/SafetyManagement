/**
 * Pending-sync copy for the crew app (lib/crew/queue-copy.ts).
 *
 * ── Why this module exists ─────────────────────────────────────
 *
 * The "Pending sync" indicator is a NEW user-facing string
 * introduced by the WO-003 offline write queue. The canonical
 * i18n registry (`lib/i18n/keys.ts`) is owned by a different
 * agent in this build, so the key
 *
 *   `crew.queue.pending_sync`
 *
 * is NOT yet in the registry. `t()` returns the raw key for an
 * unknown entry, which would leak `crew.queue.pending_sync` to
 * the crew member on screen — technically functional, but not
 * shippable copy.
 *
 * This module is the temporary, lane-safe home for that copy:
 *
 *   1. It tries the registry first. Once the owning agent adds
 *      the key, the registry string wins and nothing changes.
 *   2. Until then, it falls back to the Bangla/English strings
 *      declared below, so the banner reads correctly in both
 *      languages.
 *
 * When the key lands in `lib/i18n/keys.ts`, this module can be
 * deleted outright — `t('crew.queue.pending_sync', …)` becomes
 * the whole implementation.
 *
 * The strings here are user-facing copy, so they are NOT
 * hard-coded in the page component; the page calls
 * `pendingSyncLabel(...)` instead.
 */

import { t, type Language } from '@/lib/i18n/keys';

/**
 * The registry key the owning agent should add. Exported so
 * the page and the tests can assert the same key.
 */
export const PENDING_SYNC_KEY = 'crew.queue.pending_sync';

/**
 * The interim copy, used only while the registry entry is
 * missing.
 */
const FALLBACK: Record<Language, string> = {
  bn: '{count}টি পরিবর্তন সিঙ্ক হওয়ার অপেক্ষায় আছে',
  en: '{count} change(s) waiting to sync',
};

/**
 * The "Pending sync" banner copy.
 *
 * Uses the registry entry when it exists; otherwise interpolates
 * the fallback string. The count is always shown so the crew
 * knows how many changes are still queued.
 */
export function pendingSyncLabel(count: number, lang: Language): string {
  const resolved = t(PENDING_SYNC_KEY, { count }, lang);
  if (resolved !== PENDING_SYNC_KEY) return resolved;
  return FALLBACK[lang].replace('{count}', String(count));
}
