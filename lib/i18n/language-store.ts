/**
 * The live language store (lib/i18n/language-store.ts).
 *
 * A single external store that every surface reads the UI language from.
 *
 * WHY AN EXTERNAL STORE INSTEAD OF `useState` + `useEffect`
 * ---------------------------------------------------------
 * The previous implementation kept the language in a `useState` and
 * reconciled the cookie against the durable localStorage preference in a
 * mount effect:
 *
 *   const [lang, setLangState] = useState(() => readStoredLanguage());
 *   useEffect(() => {
 *     const stored = readStoredPreference();
 *     if (cookie !== stored) setLangState(stored);
 *   }, []);
 *
 * That looked safe — the state change happens after the first render, so
 * it cannot change what the server sent. It is not safe, because
 * "after the first render" is NOT the same as "after hydration".
 *
 * React hydrates a Suspense subtree lazily. A page that wraps its
 * content in `<Suspense>` (because it calls `useSearchParams()`, as
 * `app/login/page.tsx` does) is NOT hydrated when the root layout's
 * effects run — its hydration is deferred. The mount effect therefore
 * fires while the subtree is still hydrating, and its `setLangState`
 * lands as a mid-hydration update. React compares that update against
 * the server HTML it is still hydrating and reports:
 *
 *   Warning: Text content did not match. Server: "লগ ইন করুন"
 *   Client: "Log in"
 *
 * The tree then falls back to client rendering, which is the expensive,
 * visibly-janky path the whole cookie mechanism exists to avoid.
 *
 * THE FIX: `useSyncExternalStore`
 * -------------------------------
 * `useSyncExternalStore` is React's built-in answer to "this value
 * comes from outside React and the server may disagree with the
 * client":
 *
 *   - `getServerSnapshot()` is used for the server render AND for the
 *     hydration render. Returning the server's language here is what
 *     makes the hydration render byte-identical to the server HTML.
 *   - `getSnapshot()` is used for every render AFTER hydration.
 *   - React re-renders when the store notifies it, and a store
 *     notification that arrives during hydration is queued and applied
 *     once hydration completes — it is never applied mid-hydration.
 *
 * That last property is the whole point: it removes the ordering
 * hazard that the `useEffect` version had. There is no window in which
 * the durable preference can be written into a not-yet-hydrated tree.
 *
 * THE SNAPSHOT MUST BE STABLE
 * ---------------------------
 * `getSnapshot` is called on every render and its result is compared
 * with `Object.is`. If it recomputed a fresh string each time, React
 * would see a changed value on every call and loop forever. So the
 * client snapshot is CACHED and only recomputed when the store is
 * actually told to change. That is what `cachedSnapshot` below is for.
 *
 * THE SERVER SNAPSHOT
 * --------------------
 * On the server there is no document and no cookie API, so the server
 * snapshot comes from the request-scoped resolver
 * (`lib/i18n/language-request-store.ts`), which reads the same
 * `cityfix_lang` cookie the client reads. Both sides therefore agree by
 * construction.
 *
 * ON THE CLIENT
 * -------------
 * The client's live snapshot is the COOKIE, because the cookie is the
 * copy the server used. localStorage is consulted by
 * `reconcileLanguagePreference()`, which runs once the tree is
 * hydrated — it publishes the durable preference into the store and
 * writes the cookie so the NEXT server render agrees too.
 *
 * This module is client-safe: no `'use client'` directive, no React
 * import, no Node built-ins. It is imported by both the client hook and
 * the server components that need the request language.
 */

import { DEFAULT_LANGUAGE, type Language } from './keys';
import {
  isLanguage,
  LANGUAGE_COOKIE,
  LANGUAGE_COOKIE_MAX_AGE_SECONDS,
  LANGUAGE_STORAGE_KEY,
  LANGUAGE_UPDATED_EVENT,
} from './language-preference';
import { resolveRequestLanguage } from './language-request-store';

/* ------------------------------------------------------------------ *
 * Cookie / localStorage readers and writers
 * ------------------------------------------------------------------ */

/**
 * Read the `cityfix_lang` cookie. Safe on the server — `document` does
 * not exist there, so it returns null.
 */
export function readLanguageCookie(): Language | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${LANGUAGE_COOKIE}=([^;]*)`),
  );
  if (!match) return null;
  const value = decodeURIComponent(match[1]);
  return isLanguage(value) ? value : null;
}

/**
 * Read the durable localStorage copy of the preference, if it is valid.
 *
 * Used by the post-hydration reconcile step.
 */
export function readStoredPreference(): Language | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguage(stored) ? stored : null;
  } catch {
    return null;
  }
}

/**
 * Mirror the preference into the cookie the server reads.
 *
 * Not httpOnly on purpose: the client reads it synchronously during
 * the store snapshot, before any effect runs, so the first client render
 * matches the server's.
 */
export function writeLanguageCookie(next: Language): void {
  if (typeof document === 'undefined') return;
  try {
    document.cookie = [
      `${LANGUAGE_COOKIE}=${encodeURIComponent(next)}`,
      'path=/',
      `max-age=${LANGUAGE_COOKIE_MAX_AGE_SECONDS}`,
      'samesite=lax',
    ].join('; ');
  } catch {
    // A blocked cookie (privacy mode) must not break the toggle — the
    // localStorage write below still carries the preference.
  }
}

/* ------------------------------------------------------------------ *
 * The store
 * ------------------------------------------------------------------ */

/** Notified whenever the live language changes. */
const listeners = new Set<() => void>();

/**
 * The live client language.
 *
 * `null` means "not resolved yet" — the client has not yet read the
 * cookie. It resolves to the cookie's value (or the default) on the
 * first read, and thereafter only changes when the store is notified.
 */
let liveLanguage: Language | null = null;

/**
 * The cached snapshot handed to `useSyncExternalStore`.
 *
 * `getSnapshot` MUST return a referentially stable value between
 * notifications, or React re-renders in a loop. The cache is what
 * guarantees that.
 */
let cachedSnapshot: Language = DEFAULT_LANGUAGE;

/** True once `liveLanguage` has been resolved from the cookie. */
let resolved = false;

/**
 * The language the server rendered THIS page in, frozen at first read.
 *
 * WHY IT IS FROZEN
 * ----------------
 * The value has to be the one the SERVER used, and the server's value
 * is whatever was in the cookie when the request went out. If this
 * function re-read `document.cookie` on every call, it would pick up a
 * cookie that a post-hydration effect had written in the meantime — and
 * a Suspense-deferred subtree that hydrates LATER than the layout would
 * then hydrate against a different language than the server HTML it is
 * supposed to match. That is precisely the mismatch this whole
 * mechanism exists to prevent.
 *
 * So the value is captured ONCE, on the first read, and never again.
 * Everything that changes the language afterwards goes through
 * `setLanguageSnapshot`, which is an explicit, ordered transition.
 */
let frozenServerLanguage: Language | null = null;

/**
 * Freeze the server language at MODULE LOAD on the client.
 *
 * This module is evaluated when the client bundle loads — before React
 * renders anything, and therefore before any effect can run. Freezing
 * here removes the last ordering hazard: a Suspense-deferred subtree
 * that hydrates after the layout's effects have already written the
 * cookie cannot pick up the new value, because the frozen value was
 * captured long before that write.
 *
 * On the server there is no `document`, so nothing is frozen here; the
 * server resolves the language per request instead.
 */
if (typeof window !== 'undefined') {
  frozenServerLanguage = readLanguageCookie() ?? DEFAULT_LANGUAGE;
}

/**
 * The language the server rendered this page in.
 *
 * On the server this is the request-scoped value resolved from the
 * `cityfix_lang` cookie. On the client it is the same cookie's value,
 * captured once, so the hydration render matches the server HTML
 * exactly.
 */
export function getServerLanguage(): Language {
  if (typeof window === 'undefined') {
    const fromRequest = resolveRequestLanguage();
    return isLanguage(fromRequest) ? fromRequest : DEFAULT_LANGUAGE;
  }
  if (frozenServerLanguage === null) {
    frozenServerLanguage = readLanguageCookie() ?? DEFAULT_LANGUAGE;
  }
  return frozenServerLanguage;
}

/**
 * The live client snapshot. Referentially stable between notifications.
 *
 * The cookie is read ONCE, the first time the store is consulted, and
 * the result is cached for the life of the page. Reading it lazily is
 * safe only because nothing can write the cookie before the first
 * render: the reconcile step runs in an effect, and effects run after
 * the first render. Once the value is cached, the reconcile step
 * publishes the new language through `setLanguageSnapshot` — an
 * explicit, ordered transition — rather than by mutating the cookie
 * out from under the snapshot.
 */
export function getLanguageSnapshot(): Language {
  if (!resolved) {
    liveLanguage = getServerLanguage();
    cachedSnapshot = liveLanguage;
    resolved = true;
  }
  return cachedSnapshot;
}

/**
 * Subscribe to language changes. Returns the unsubscribe function.
 *
 * This is the `subscribe` argument of `useSyncExternalStore`.
 */
export function subscribeToLanguage(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

/**
 * Publish a language change to the store.
 *
 * Updates the cached snapshot and wakes every subscriber. Called by
 * `publishLanguage` (the user-facing setter) and by the post-hydration
 * reconcile step.
 */
export function setLanguageSnapshot(next: Language): void {
  if (!isLanguage(next)) return;
  liveLanguage = next;
  cachedSnapshot = next;
  resolved = true;
  for (const listener of [...listeners]) listener();
}

/**
 * Persist a language choice and tell every other surface about it.
 *
 * Exported so a caller that owns its own language state (the public
 * landing page, the auth pages) can stay in step with the shared hook
 * without re-implementing the storage write.
 *
 * The cookie is written FIRST: it is what the server reads on the next
 * request, and it is what makes the next server render agree with the
 * client. The localStorage write is the durable store behind it.
 */
export function publishLanguage(next: Language): void {
  if (typeof window === 'undefined') return;
  writeLanguageCookie(next);
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
  } catch {
    // A storage failure (private mode, quota) must not break the toggle —
    // the in-memory state still changes for this session.
  }
  setLanguageSnapshot(next);
  window.dispatchEvent(new CustomEvent(LANGUAGE_UPDATED_EVENT, { detail: next }));
}

/**
 * Apply the durable localStorage preference once the tree is hydrated.
 *
 * A visitor whose preference predates the cookie has a language in
 * localStorage but no cookie, so the server rendered the default. The
 * hydration render agrees with the server (no mismatch); now that the
 * tree is hydrated, the durable preference is applied and the cookie is
 * written so every later request renders it correctly.
 *
 * Called from an effect — i.e. AFTER hydration — which is what makes it
 * safe. React guarantees that a `useSyncExternalStore` notification
 * raised during hydration is applied once hydration completes.
 */
export function reconcileLanguagePreference(): void {
  if (typeof window === 'undefined') return;
  const stored = readStoredPreference();
  if (!stored) return;
  const cookie = readLanguageCookie();
  if (cookie === stored) return;
  // Write the cookie so the NEXT server render uses this language.
  writeLanguageCookie(stored);
  publishLanguage(stored);
}
