'use client';

/**
 * useLanguage (components/useLanguage.ts).
 *
 * The single source of truth for the UI language.
 *
 * WHY THIS EXISTS
 * ---------------
 * Before this hook, every surface owned its own language state with the
 * same three lines:
 *
 *   const [lang, setLang] = useState<Language>('bn');
 *   useEffect(() => {
 *     const stored = window.localStorage.getItem(LANG_KEY);
 *     if (stored === 'en' || stored === 'bn') setLang(stored);
 *   }, []);
 *
 * That pattern had TWO defects, both visible to a user:
 *
 *   1. NO LISTENER. Only five components in the whole app subscribed to
 *      the `cityfix:language-updated` event (AppHeader, RoleSidebar,
 *      ProfilePage, AdminPage and the report-wizard layout). The other
 *      twenty-six pages read the stored preference ONCE, on mount. So
 *      toggling the language updated the header and sidebar instantly but
 *      left the page body in the old language until a full page reload —
 *      and a client-side <Link> navigation does NOT remount the layout
 *      that owns the shared state, so the mismatch persisted.
 *
 *   2. WRONG FIRST PAINT. The initial state was hard-coded to 'bn', so
 *      every page rendered its Bangla copy first and then flipped to the
 *      stored language once the mount effect ran. On a slow device that
 *      flash is visible; on a fast one it still means the server-rendered
 *      HTML is Bangla while the client immediately re-renders as English.
 *
 * THE FIX
 * -------
 * One hook, one source of truth:
 *
 *   - The stored preference is read during the initialiser (not in an
 *     effect) so the very first render already uses the right language.
 *     `typeof window` guards the server render, where the hook falls back
 *     to the Bangla-first default.
 *   - The hook subscribes to `cityfix:language-updated`, so a toggle
 *     reaches EVERY surface — header, sidebar and page body alike — on
 *     the same tick.
 *   - `setLanguage` persists the choice and publishes the event, so
 *     callers never have to touch localStorage or dispatch by hand.
 *
 * The event name and the storage key are kept EXACTLY as they were —
 * they are a compatibility contract with any surface that still touches
 * them directly (and with the stored preference of an existing user).
 */

import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_LANGUAGE, type Language } from '@/lib/i18n/keys';
import {
  LANGUAGE_STORAGE_KEY,
  LANGUAGE_UPDATED_EVENT,
} from '@/lib/i18n/language-preference';

/**
 * Re-exported for convenience so client surfaces can import the contract
 * from the hook's own module.
 *
 * The canonical home is `lib/i18n/language-preference.ts` — a
 * server-safe module. It MUST stay there: `app/language-boot.tsx` is a
 * server component, and importing a `'use client'` module from one
 * yields a client reference rather than the real value (which silently
 * broke the boot script's `JSON.stringify` interpolation).
 */
export { LANGUAGE_STORAGE_KEY, LANGUAGE_UPDATED_EVENT };

function isLanguage(value: unknown): value is Language {
  return value === 'bn' || value === 'en';
}

/**
 * Read the persisted preference. Safe to call during a server render —
 * `localStorage` does not exist there, so it returns the default.
 */
export function readStoredLanguage(): Language {
  if (typeof window === 'undefined') return DEFAULT_LANGUAGE;
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguage(stored) ? stored : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

/**
 * Persist a language choice and tell every other surface about it.
 *
 * Exported so a caller that owns its own language state (the public
 * landing page, the auth pages) can stay in step with the shared hook
 * without re-implementing the storage write.
 */
export function publishLanguage(next: Language): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
  } catch {
    // A storage failure (private mode, quota) must not break the toggle —
    // the in-memory state still changes for this session.
  }
  window.dispatchEvent(new CustomEvent(LANGUAGE_UPDATED_EVENT, { detail: next }));
}

/**
 * The current UI language plus a setter that persists and broadcasts it.
 *
 * @param initial The language to use before the stored preference is
 *   known. Defaults to the stored preference when running in the browser
 *   and to the Bangla-first default on the server.
 */
export function useLanguage(initial?: Language): {
  lang: Language;
  setLang: (next: Language) => void;
} {
  // The initialiser runs once, on the first render. Reading localStorage
  // here (rather than in an effect) means the first paint already uses
  // the user's language — no Bangla flash on an English page.
  const [lang, setLangState] = useState<Language>(() =>
    initial ?? readStoredLanguage(),
  );

  useEffect(() => {
    const onLanguageUpdated = (event: Event) => {
      const value = (event as CustomEvent<Language>).detail;
      if (isLanguage(value)) setLangState(value);
    };
    window.addEventListener(LANGUAGE_UPDATED_EVENT, onLanguageUpdated);
    return () => {
      window.removeEventListener(LANGUAGE_UPDATED_EVENT, onLanguageUpdated);
    };
  }, []);

  const setLang = useCallback((next: Language) => {
    setLangState(next);
    publishLanguage(next);
  }, []);

  return { lang, setLang };
}
