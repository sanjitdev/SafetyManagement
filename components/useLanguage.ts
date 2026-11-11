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
 *   - The language is read from an EXTERNAL STORE (see
 *     `lib/i18n/language-store.ts`), not from component state. The hook
 *     subscribes to `cityfix:language-updated`, so a toggle reaches
 *     EVERY surface — header, sidebar and page body alike — on the
 *     same tick.
 *   - `setLang` persists the choice and publishes the event, so
 *     callers never have to touch localStorage or dispatch by hand.
 *
 * THE COOKIE MIRROR — WHY THE SERVER CAN AGREE WITH THE CLIENT
 * --------------------------------------------------------------
 * The preference used to live ONLY in localStorage, so the server had
 * no way to read it:
 *
 *   - server  → no localStorage → rendered the Bangla-first default
 *   - client  → localStorage   → rendered the stored language (English)
 *
 * React compares the server-rendered text against the client's first
 * render and finds they differ on EVERY translated string on the page.
 * It then throws "Text content does not match server-rendered HTML",
 * discards the server HTML, and re-renders the whole tree client-side.
 *
 * The preference is therefore mirrored into a COOKIE, which travels with
 * the request, so the server renders the same language the client will.
 * The cookie is what the client reads first; localStorage remains the
 * durable store (the cookie expires, localStorage does not).
 *
 * The two can disagree only in one case: the cookie is present and
 * stale while localStorage has a newer value (e.g. the user toggled
 * the language and the cookie write has not landed yet). The cookie
 * wins in that case, because matching the SERVER is what avoids the
 * mismatch — and `publishLanguage` writes both together, so they are
 * written on the same tick.
 *
 * WHY AN EXTERNAL STORE AND NOT `useState`
 * ----------------------------------------
 * An earlier version of this hook kept the language in `useState` and
 * reconciled the durable preference in a mount effect:
 *
 *   const [lang, setLangState] = useState(() => readStoredLanguage());
 *   useEffect(() => { if (cookie !== stored) setLangState(stored); }, []);
 *
 * That looks safe — the state change happens after the first render, so
 * it cannot change what the server sent. It is not safe, because
 * "after the first render" is NOT the same as "after hydration".
 *
 * React hydrates a Suspense subtree lazily. A page that wraps its
 * content in `<Suspense>` (because it calls `useSearchParams()`, as
 * `app/login/page.tsx` does) is NOT hydrated when the root layout's
 * effects run — its hydration is deferred. The mount effect therefore
 * fired while the subtree was still hydrating, and its `setLangState`
 * landed as a mid-hydration update, which React reported as:
 *
 *   Warning: Text content did not match. Server: "লগ ইন করুন"
 *   Client: "Log in"
 *
 * `useSyncExternalStore` removes the hazard by construction: React
 * uses the store's SERVER snapshot for the hydration render, and a
 * store notification raised during hydration is queued and applied once
 * hydration completes. The store's client snapshot is frozen at module
 * load, so a later subtree cannot observe a cookie that an earlier
 * effect wrote.
 *
 * The event name and the storage key are kept EXACTLY as they were —
 * they are a compatibility contract with any surface that still touches
 * them directly (and with the stored preference of an existing user).
 */

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { type Language } from '@/lib/i18n/keys';
import {
  isLanguage,
  LANGUAGE_COOKIE,
  LANGUAGE_STORAGE_KEY,
  LANGUAGE_UPDATED_EVENT,
} from '@/lib/i18n/language-preference';
import {
  getLanguageSnapshot,
  getServerLanguage,
  publishLanguage,
  reconcileLanguagePreference,
  setLanguageSnapshot,
  subscribeToLanguage,
} from '@/lib/i18n/language-store';

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
export {
  isLanguage,
  LANGUAGE_COOKIE,
  LANGUAGE_STORAGE_KEY,
  LANGUAGE_UPDATED_EVENT,
};

/**
 * Read the language the SERVER rendered this page in.
 *
 * On the SERVER it reads the request-scoped value the root layout
 * primed from the language cookie — that is the whole point: the server
 * must render the same language the client will render, or React
 * reports a hydration mismatch on every translated string.
 *
 * On the CLIENT it reads the `cityfix_lang` cookie — the SAME copy the
 * server read — and FREEZES it, so every surface that hydrates later
 * (a Suspense-deferred subtree, say) sees the same value the server
 * HTML contains.
 *
 * localStorage is deliberately NOT consulted here. A visitor whose
 * preference predates the cookie has localStorage but no cookie: the
 * server rendered the default, so reading localStorage now would make
 * the client render a DIFFERENT language from the server — the exact
 * hydration mismatch this whole mechanism exists to prevent. The
 * durable preference is applied after hydration instead (see
 * `reconcileLanguagePreference`).
 */
export function readStoredLanguage(): Language {
  return getServerLanguage();
}

/**
 * Persist a language choice and tell every other surface about it.
 *
 * Exported so a caller that owns its own language state (the public
 * landing page, the auth pages) can stay in step with the shared hook
 * without re-implementing the storage write.
 */
export { publishLanguage };

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
  // `useSyncExternalStore` is the whole reason this hook does not use
  // `useState`:
  //
  //   - `getServerSnapshot` is used for the server render AND for the
  //     hydration render, so the hydration render is byte-identical to
  //     the server HTML — no "Text content does not match" warning.
  //   - `getSnapshot` is used for every render after hydration.
  //   - A store notification that arrives DURING hydration is queued by
  //     React and applied once hydration completes. The previous
  //     `useState` + mount-effect version had no such guarantee, which
  //     is how a Suspense-deferred subtree (the login page) ended up
  //     receiving the durable preference mid-hydration and tripping the
  //     mismatch warning.
  const lang = useSyncExternalStore(
    subscribeToLanguage,
    getLanguageSnapshot,
    // The server snapshot must agree with the server render, so an
    // explicit `initial` wins over the store.
    () => initial ?? getServerLanguage(),
  );

  // RECONCILE AFTER HYDRATION
  // -------------------------
  // A visitor whose preference predates the cookie has a language in
  // localStorage but no cookie, so the server rendered the default. The
  // hydration render agrees with the server (no mismatch); now that the
  // tree is hydrated, the durable preference is applied and the cookie
  // is written so every later request renders it correctly.
  //
  // `reconcileLanguagePreference` publishes into the store rather than
  // calling a state setter, so React applies it as a store update —
  // which React defers until hydration is complete.
  useEffect(() => {
    reconcileLanguagePreference();
  }, []);

  // A surface that dispatches the DOM event directly (rather than
  // going through `publishLanguage`) must still reach the store, or
  // `useSyncExternalStore` would never re-render.
  useEffect(() => {
    const onLanguageUpdated = (event: Event) => {
      const value = (event as CustomEvent<Language>).detail;
      if (isLanguage(value)) {
        // Publish into the store so every subscriber re-renders. The
        // cookie/localStorage writes are skipped here — the surface that
        // dispatched the event owns persistence.
        setLanguageSnapshot(value);
      }
    };
    window.addEventListener(LANGUAGE_UPDATED_EVENT, onLanguageUpdated);
    return () => {
      window.removeEventListener(LANGUAGE_UPDATED_EVENT, onLanguageUpdated);
    };
  }, []);

  const setLang = useCallback((next: Language) => {
    publishLanguage(next);
  }, []);

  return { lang, setLang };
}
