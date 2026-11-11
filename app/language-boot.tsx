/**
 * Synchronous language boot (app/language-boot.tsx).
 *
 * Owns the `<html lang>` attribute — the document-level language
 * declaration that drives font selection, hyphenation and screen-reader
 * announcement.
 *
 * WHY THIS EXISTS
 * ---------------
 * The root layout is a SERVER component, so it cannot read
 * localStorage. It therefore always server-renders `<html lang="bn">`.
 * That attribute is not cosmetic — the browser uses it to choose the
 * font's script-specific glyphs and to hyphenate. An English-preference
 * user therefore got Bangla line-breaking rules and the Bangla font's
 * metrics on an English page.
 *
 * WHY IT TAKES TWO FORMS
 * ----------------------
 * React's hydration treats a server-rendered attribute on `<html>` as
 * authoritative and WRITES IT BACK over whatever the DOM currently holds.
 * There is no way to opt out: `suppressHydrationWarning` silences the
 * console warning, not the attribute reconciliation. Measured on this
 * app:
 *
 *   - server renders `lang="bn"`
 *   - boot script sets `lang="en"` at ~0ms (before first paint — correct)
 *   - React hydrates at ~570ms and writes `lang="bn"` back
 *
 * Removing the attribute from the server render does not help either:
 * React then *removes* the attribute during hydration (measured: `en` ->
 * `null` at ~520ms).
 *
 * So the attribute is set in BOTH phases:
 *
 *   1. A tiny inline <script> sets it BEFORE first paint. This is what
 *      the user actually sees; without it there is a visible flash of
 *      Bangla line-breaking on an English page.
 *   2. A `useEffect` re-asserts it AFTER hydration, to undo React's
 *      reconciliation. This runs in the same tick React finished
 *      hydrating, so the window in which the attribute is wrong is not
 *      observable in practice.
 *
 * The listener keeps the attribute in step with a live language toggle:
 * `useLanguage()`'s setter publishes the `cityfix:language-updated`
 * event, and both this component and the inline script react to it.
 *
 * Mirrors the `app/appearance-boot.tsx` pattern (no React state driving
 * the initial value, just a deterministic inline IIFE that reads the same
 * localStorage key the rest of the app uses).
 *
 * Renders nothing visible — it produces only a <script> tag.
 */

'use client';

import { useEffect } from 'react';
import {
  LANGUAGE_COOKIE,
  LANGUAGE_UPDATED_EVENT,
} from '@/lib/i18n/language-preference';
import {
  readLanguageCookie,
  reconcileLanguagePreference,
} from '@/lib/i18n/language-store';

const SCRIPT = `
(function () {
  try {
    var COOKIE = ${JSON.stringify(LANGUAGE_COOKIE)};
    var EVENT = ${JSON.stringify(LANGUAGE_UPDATED_EVENT)};
    var root = document.documentElement;

    function apply(next) {
      if (next === 'bn' || next === 'en') root.setAttribute('lang', next);
    }

    // The COOKIE is read first, because it is the copy the SERVER used
    // to render this page. Reading localStorage first could disagree
    // with the server when the two stores drift apart (the cookie
    // expires, localStorage does not), which is exactly the mismatch
    // this script exists to prevent.
    var fromCookie = null;
    try {
      var match = document.cookie.match(new RegExp('(?:^|;\\\\s*)' + COOKIE + '=([^;]*)'));
      if (match) {
        var decoded = decodeURIComponent(match[1]);
        if (decoded === 'bn' || decoded === 'en') fromCookie = decoded;
      }
    } catch (_) { fromCookie = null; }

    // The attribute is set from the COOKIE — the same copy the server
    // read to render this page — so the DOM and the server agree.
    //
    // localStorage is deliberately NOT consulted here: a visitor whose
    // preference predates the cookie has localStorage but no cookie,
    // and reading it now would set an attribute the server did not
    // render with. The durable preference is applied after hydration
    // (see reconcileLanguagePreference), which also writes the cookie
    // so later requests render it correctly.
    apply(fromCookie);

    // Keep <html lang> in step with a live toggle.
    window.addEventListener(EVENT, function (event) {
      apply(event && event.detail);
    });
  } catch (_) {
    // Boot is best-effort; the attribute keeps its server-rendered value.
  }
})();
`.trim();

export function LanguageBoot() {
  // Phase 2: re-assert the attribute after React's hydration has
  // reconciled it back to the server-rendered default, and make sure
  // the cookie the server reads agrees with the stored preference.
  useEffect(() => {
    const root = document.documentElement;
    const apply = (next: unknown) => {
      if (next === 'bn' || next === 'en') root.setAttribute('lang', next);
    };
    let fromCookie: string | null = null;
    try {
      fromCookie = readLanguageCookie();
    } catch {
      fromCookie = null;
    }

    // The COOKIE wins when both exist: it is the copy the server used
    // to render this page, so keeping the attribute aligned with it is
    // what avoids a mismatch.
    //
    // When the cookie is MISSING but localStorage has a valid value,
    // the visitor's preference predates the cookie. The server rendered
    // the default language, so the attribute must stay on the default
    // for this page — but the cookie is written so every request AFTER
    // this one renders in the visitor's language.
    //
    // `reconcileLanguagePreference` does the write and publishes the
    // change into the language store; the event listener below then
    // applies the new language to the attribute.
    if (!fromCookie) {
      reconcileLanguagePreference();
      apply(readLanguageCookie());
    } else {
      apply(fromCookie);
    }

    const onLanguageUpdated = (event: Event) => {
      apply((event as CustomEvent<string>).detail);
    };
    window.addEventListener(LANGUAGE_UPDATED_EVENT, onLanguageUpdated);
    return () => {
      window.removeEventListener(LANGUAGE_UPDATED_EVENT, onLanguageUpdated);
    };
  }, []);

  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
