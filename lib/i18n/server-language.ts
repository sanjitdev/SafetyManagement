/**
 * Server-side language resolution (lib/i18n/server-language.ts).
 *
 * Resolves the language the SERVER should render a page in.
 *
 * WHY THIS EXISTS
 * ---------------
 * The language preference used to live only in localStorage, so the
 * server had no way to read it and always rendered the Bangla-first
 * default. The client read localStorage in the `useLanguage` state
 * initialiser and rendered the stored language on its first paint.
 * The two disagreed on every translated string, which React reports as
 * "Text content does not match server-rendered HTML" — it discards the
 * server HTML and re-renders the whole tree client-side.
 *
 * The preference is now mirrored into a cookie (see
 * `lib/i18n/language-preference.ts`), which the server CAN read. This
 * module is the single place that does the reading.
 *
 * WHY THE READ IS LAZY
 * --------------------
 * `readStoredLanguage()` in `components/useLanguage.ts` is SYNCHRONOUS,
 * because a React state initialiser cannot await. In Next 14,
 * `cookies()` from `next/headers` is ALSO synchronous — it returns the
 * `ReadonlyRequestCookies` object directly rather than a promise.
 * That makes a lazy read possible, and a lazy read is REQUIRED here:
 *
 * In the App Router, a layout's `children` is a PRE-RENDERED element.
 * The child pages are rendered BEFORE the layout's own function body
 * runs, so anything the layout does before returning — reading the
 * cookie, priming a store — happens too late. A layout that awaited the
 * cookie and published it would publish it after the children had
 * already rendered.
 *
 * So the read happens on FIRST ACCESS instead, which is during the
 * child render, while the request is still in flight and
 * `next/headers` still resolves the right request. The value is then
 * memoised for the rest of the request.
 *
 * WHY AsyncLocalStorage
 * ---------------------
 * A module-level variable would be simpler but WRONG: a Node server
 * process handles many requests concurrently, so one shared variable
 * would leak one visitor's language into another visitor's render.
 * `AsyncLocalStorage` scopes the value to the request that created it,
 * and the context is discarded when the request ends.
 *
 * This module is SERVER-ONLY: it imports `next/headers` and
 * `node:async_hooks`, neither of which is available in the browser.
 * Client code must use `useLanguage()` from `components/useLanguage.ts`.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { cookies } from 'next/headers';
import { DEFAULT_LANGUAGE, type Language } from './keys';
import { isLanguage, LANGUAGE_COOKIE } from './language-preference';
import { setRequestLanguageResolver } from './language-request-store';

/**
 * The language resolved for the CURRENT request.
 *
 * The store holds a `Language | null`: null means "not resolved yet".
 */
const requestLanguageStore = new AsyncLocalStorage<Language | null>();

/**
 * Read the language cookie for the current request.
 *
 * Returns the Bangla-first default when there is no cookie or when the
 * cookie holds an unrecognised value.
 */
export function getRequestLanguage(): Language {
  try {
    // `cookies()` is synchronous in Next 14 — it returns the cookie
    // store for the request in flight, not a promise.
    const raw = cookies().get(LANGUAGE_COOKIE)?.value;
    return isLanguage(raw) ? raw : DEFAULT_LANGUAGE;
  } catch {
    // A store that cannot be read (e.g. a static render) falls back to
    // the Bangla-first default, which is the documented no-preference
    // behaviour.
    return DEFAULT_LANGUAGE;
  }
}

/**
 * The language resolved for the current request.
 *
 * Resolved on FIRST ACCESS and then memoised for the request, so the
 * cookie is read once per request no matter how many components ask.
 */
export function getPrimedLanguage(): Language | null {
  const store = requestLanguageStore.getStore();
  if (store !== undefined) return store;
  // First access in this request: resolve it and remember it.
  const language = getRequestLanguage();
  requestLanguageStore.enterWith(language);
  return language;
}

// Publish the resolver onto the global bridge so the client-safe module
// (`lib/i18n/language-request-store.ts`) can reach it without importing
// `node:async_hooks` itself. This runs once, when the module loads.
setRequestLanguageResolver({
  resolve: () => getPrimedLanguage(),
});
