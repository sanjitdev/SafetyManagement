'use client';

/**
 * Appearance provider + useTheme hook (lib/theme/ThemeProvider.tsx).
 *
 * Responsibilities:
 *   1. Hydrate the saved preference from localStorage on mount.
 *   2. Apply the correct theme class to <html> whenever the
 *      preference or the OS `prefers-color-scheme` value changes.
 *   3. Persist preference changes back to localStorage.
 *   4. Expose `{ appearance, setAppearance, resolved }` to descendants
 *      via a small context.
 *
 * The AppearanceBoot inline script (`app/appearance-boot.tsx`) has
 * already set the correct class on <html> before first paint, so the
 * provider's first effect is a no-op when the user hasn't toggled
 * anything during the current session.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  ALL_THEME_CLASSES,
  APPEARANCE_DEFAULT,
  readAppearance,
  readSystemPrefersDark,
  resolveAppearance,
  THEME_CLASS,
  writeAppearance,
  type Appearance,
  type ResolvedAppearance,
} from '@/lib/theme/appearance';

interface ThemeContextValue {
  appearance: Appearance;
  resolved: ResolvedAppearance;
  setAppearance: (next: Appearance) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyClasses(appearance: Appearance, systemDark: boolean) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  for (const c of ALL_THEME_CLASSES) {
    root.classList.remove(c);
  }
  const resolved = resolveAppearance(appearance, systemDark);
  root.classList.add(resolved === 'dark' ? THEME_CLASS.dark : THEME_CLASS.light);
  if (appearance === 'system') {
    root.classList.add(THEME_CLASS.system);
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Start with the SSR default; the inline boot script will have
  // already applied the correct class to <html> so the first paint
  // matches. On mount we hydrate from localStorage.
  const [appearance, setAppearanceState] = useState<Appearance>(APPEARANCE_DEFAULT);
  const [systemDark, setSystemDark] = useState<boolean>(false);

  // Hydrate from localStorage on mount.
  useEffect(() => {
    const saved = readAppearance();
    if (saved) setAppearanceState(saved);
    setSystemDark(readSystemPrefersDark());
  }, []);

  // Re-apply classes whenever preference or system hint changes.
  useEffect(() => {
    applyClasses(appearance, systemDark);
  }, [appearance, systemDark]);

  // Listen for system changes while the user is on 'system'.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    // Older Safari uses `addListener`; modern uses `addEventListener`.
    if (mq.addEventListener) {
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
    mq.addListener(handler);
    return () => mq.removeListener(handler);
  }, []);

  const setAppearance = useCallback((next: Appearance) => {
    setAppearanceState(next);
    writeAppearance(next);
    // Re-apply immediately so the toggle is responsive even before
    // the next effect tick.
    applyClasses(next, readSystemPrefersDark());
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const resolved: ResolvedAppearance = resolveAppearance(appearance, systemDark);
    return { appearance, resolved, setAppearance };
  }, [appearance, systemDark, setAppearance]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Defaulting (rather than throwing) lets the toggle work even
    // if a consumer is rendered outside the provider tree during
    // incremental migration. Once the provider wraps the app, this
    // path is unreachable.
    return {
      appearance: APPEARANCE_DEFAULT,
      resolved: 'light',
      setAppearance: () => undefined,
    };
  }
  return ctx;
}
