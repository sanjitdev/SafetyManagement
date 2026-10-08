/**
 * Synchronous appearance boot (app/appearance-boot.tsx).
 *
 * Renders a tiny inline <script> in <body> that resolves the
 * citizen's saved appearance preference and applies the appropriate
 * theme class to <html> BEFORE first paint. This prevents the
 * flash-of-wrong-theme that would otherwise happen while the React
 * provider hydrates.
 *
 * Mirrors the `app/language-boot.tsx` pattern (no React state, no
 * hydration, just a deterministic inline IIFE that reads the same
 * localStorage key the rest of the app uses).
 *
 * Renders nothing visible — it produces only a <script> tag.
 */

import {
  ALL_THEME_CLASSES,
  APPEARANCE_STORAGE_KEY,
  APPEARANCE_DEFAULT,
  isAppearance,
  resolveAppearance,
  THEME_CLASS,
} from '@/lib/theme/appearance';

export function AppearanceBoot() {
  // The script is built as a string so it can be inlined verbatim.
  // We deliberately avoid React interpolation here: anything else
  // would either be slower or risk a hydration mismatch.
  const script = `
(function () {
  try {
    var KEY = ${JSON.stringify(APPEARANCE_STORAGE_KEY)};
    var DEF = ${JSON.stringify(APPEARANCE_DEFAULT)};
    var ALL = ${JSON.stringify(ALL_THEME_CLASSES)};
    var LIGHT = ${JSON.stringify(THEME_CLASS.light)};
    var DARK = ${JSON.stringify(THEME_CLASS.dark)};
    var SYS = ${JSON.stringify(THEME_CLASS.system)};

    var raw = null;
    try { raw = window.localStorage.getItem(KEY); } catch (_) { raw = null; }
    var pref = (raw === 'light' || raw === 'dark' || raw === 'system') ? raw : DEF;

    var systemDark = false;
    try {
      systemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch (_) { systemDark = false; }

    var resolved = pref === 'dark' ? DARK : (pref === 'light' ? LIGHT : (systemDark ? DARK : LIGHT));

    var root = document.documentElement;
    for (var i = 0; i < ALL.length; i++) { root.classList.remove(ALL[i]); }
    root.classList.add(resolved);
    if (pref === 'system') root.classList.add(SYS);
  } catch (_) {
    // Boot is best-effort; the React provider will set the correct class on mount.
  }
})();
`.trim();

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
