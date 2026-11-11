/**
 * Language preference contract (lib/i18n/language-preference.ts).
 *
 * The storage key and the DOM event name that carry the user's language
 * choice between surfaces.
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
 * The values are a compatibility contract and must stay byte-identical
 * to what earlier surfaces used inline:
 *
 *   - `cityfix.preferred_language.v1` — the localStorage key.
 *   - `cityfix:language-updated` — the DOM event a change is published on.
 */

/** The localStorage key holding the user's language preference. */
export const LANGUAGE_STORAGE_KEY = 'cityfix.preferred_language.v1';

/**
 * The DOM event a language change is published on. Kept as-is: several
 * surfaces dispatch it directly and every surface must observe the same
 * name.
 */
export const LANGUAGE_UPDATED_EVENT = 'cityfix:language-updated';
