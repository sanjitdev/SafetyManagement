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
  LANGUAGE_STORAGE_KEY,
  LANGUAGE_UPDATED_EVENT,
} from '@/lib/i18n/language-preference';

const SCRIPT = `
(function () {
  try {
    var KEY = ${JSON.stringify(LANGUAGE_STORAGE_KEY)};
    var EVENT = ${JSON.stringify(LANGUAGE_UPDATED_EVENT)};
    var root = document.documentElement;

    function apply(next) {
      if (next === 'bn' || next === 'en') root.setAttribute('lang', next);
    }

    var raw = null;
    try { raw = window.localStorage.getItem(KEY); } catch (_) { raw = null; }
    apply(raw);

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
  // reconciled it back to the server-rendered default.
  useEffect(() => {
    const root = document.documentElement;
    const apply = (next: unknown) => {
      if (next === 'bn' || next === 'en') root.setAttribute('lang', next);
    };
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    } catch {
      stored = null;
    }
    apply(stored);
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
