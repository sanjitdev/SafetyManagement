/**
 * Language preference contract (lib/i18n/language-preference.ts).
 *
 * The storage key, the cookie name and the DOM event name that carry the
 * user's language choice between surfaces.
 *
 * WHY THIS IS A SEPARATE MODULE
 * ------------------------------
 * `components/useLanguage.ts` is a `'use client'` module. Importing it
 * from a server component (like `app/language-boot.tsx`) yields a
 * CLIENT REFERENCE, not the actual value — so `JSON.stringify(KEY)`
 * interpolated into an inline <script> produced the literal text `{}`
 * and the boot script could never find the stored preference.
 *
 * `app/appearance-boot.tsx` avoids this by importing its constants from
 * a plain server-safe module (`lib/theme/appearance`). This file is
 * that equivalent for the language preference: no `'use client'`
 * directive, no React import, no side effects — so both the server
 * boot script and the client hook can share the exact same literals.
 *
 * WHY THERE IS A COOKIE
 * ---------------------
 * The preference used to live ONLY in localStorage, which meant the
 * server had no way to know it. The server therefore always rendered
 * the Bangla-first default, while the client — reading localStorage in
 * the `useLanguage` state initialiser — rendered the stored language
 * (English) on its very first paint.
 *
 * That is a guaranteed hydration mismatch: React compares the
 * server-rendered text against the client's first render and finds
 * they differ, on EVERY translated string on the page. React then
 * throws "Text content does not match server-rendered HTML" and
 * discards the server HTML, re-rendering the whole tree client-side.
 * The first symptom a user sees is usually one isolated string — the
 * admin brand tagline — but the underlying mismatch is page-wide.
 *
 * The fix is to make the preference readable by the server. A cookie
 * travels with the request, so the server can render the SAME language
 * the client will render, and the two agree from the first byte.
 *
 * The cookie is deliberately NOT httpOnly: the client has to read it
 * synchronously when the language store resolves its first snapshot
 * (before any effect runs) so the first client render matches the
 * server's. It carries no secret — only 'bn' or 'en'.
 *
 * The values are a compatibility contract and must stay byte-identical
 * to what earlier surfaces used inline:
 *
 *   - `cityfix.preferred_language.v1` — the localStorage key.
 *   - `cityfix:language-updated` — the DOM event a change is published on.
 *   - `cityfix_lang` — the cookie that lets the server read the choice.
 */

import type { Language } from './keys';

/** The localStorage key holding the user's language preference. */
export const LANGUAGE_STORAGE_KEY = 'cityfix.preferred_language.v1';

/**
 * The DOM event a language change is published on. Kept as-is: several
 * surfaces dispatch it directly and every surface must observe the same
 * name.
 */
export const LANGUAGE_UPDATED_EVENT = 'cityfix:language-updated';

/**
 * The cookie that mirrors the language preference so the SERVER can read
 * it during the render.
 *
 * Not httpOnly — the client reads it synchronously when the language
 * store resolves its first snapshot. It holds only 'bn' or 'en', so it
 * carries no secret. It is SameSite=Lax and scoped to the whole site,
 * because the language is a site-wide preference, not a session one.
 */
export const LANGUAGE_COOKIE = 'cityfix_lang';

/** How long the language cookie lives. Matches the session cookie. */
export const LANGUAGE_COOKIE_MAX_AGE_SECONDS = 14 * 24 * 60 * 60;

/** True for any string that is a valid language value. */
export function isLanguage(value: unknown): value is Language {
  return value === 'bn' || value === 'en';
}
