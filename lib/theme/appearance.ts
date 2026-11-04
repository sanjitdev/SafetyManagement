/**
 * Appearance preference (lib/theme/appearance.ts).
 *
 * Three-state citizen-selectable appearance:
 *   - 'light'  → force light theme
 *   - 'dark'   → force dark theme
 *   - 'system' → follow `prefers-color-scheme`
 *
 * The preference is stored in localStorage so it survives reloads and
 * is honored on first paint by a synchronous inline boot script
 * (`app/appearance-boot.tsx`) — no React required to flip the theme,
 * so there's no FOUC on initial render.
 *
 * Server-side rendering: this module is pure data and safe to import
 * in either client or server components. The DOM-touching parts
 * (`applyAppearanceToDocument`, `subscribeSystemChanges`) live in
 * the React provider (`lib/theme/ThemeProvider.tsx`).
 */

export type Appearance = 'light' | 'dark' | 'system';

export type ResolvedAppearance = 'light' | 'dark';

export const APPEARANCE_STORAGE_KEY = 'cityfix.preferred_appearance.v1';

export const APPEARANCE_DEFAULT: Appearance = 'dark';

export const APPEARANCES: readonly Appearance[] = ['light', 'dark', 'system'] as const;

/** Resolved dark/light class names applied to <html> by the boot script and provider. */
export const THEME_CLASS = {
  light: 'theme-light',
  dark: 'theme-dark',
  system: 'theme-system',
} as const;

/** True for any string that is a valid appearance value. */
export function isAppearance(value: unknown): value is Appearance {
  return (
    typeof value === 'string' &&
    (APPEARANCES as readonly string[]).includes(value)
  );
}

/**
 * Read the raw preference from localStorage. Returns `null` when
 * localStorage is unavailable (SSR / privacy mode) or the stored
 * value is not a valid Appearance.
 */
export function readAppearance(): Appearance | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (!raw) return null;
    return isAppearance(raw) ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Persist the preference. No-op outside the browser. Swallows
 * `QuotaExceededError` and `SecurityError` so a failed write never
 * breaks the toggle UI.
 */
export function writeAppearance(value: Appearance): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, value);
  } catch {
    // ignore — private mode / quota
  }
}

/**
 * Resolve a preference to the concrete light/dark value the UI
 * should render, using the supplied system-dark hint.
 */
export function resolveAppearance(
  pref: Appearance,
  systemPrefersDark: boolean,
): ResolvedAppearance {
  if (pref === 'dark') return 'dark';
  if (pref === 'light') return 'light';
  return systemPrefersDark ? 'dark' : 'light';
}

/** Read the live system preference. Returns false on the server / unsupported browsers. */
export function readSystemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * The full set of class names the appearance system owns. Use this
 * when adding/removing classes so we never accidentally leave a
 * stale `.theme-dark` while `.theme-light` is active.
 */
export const ALL_THEME_CLASSES: readonly string[] = [
  THEME_CLASS.light,
  THEME_CLASS.dark,
  THEME_CLASS.system,
];
