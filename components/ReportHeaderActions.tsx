'use client';

/**
 * Tiny client wrapper so the report sticky header (a server component)
 * can host the theme toggle. The actual logic lives in
 * `components/ThemeToggle.tsx`.
 *
 * The toggle's aria-label follows the shared language hook, so an
 * English-preference user hears "Switch to light theme" rather than
 * the Bangla label.
 */

import { ThemeToggle } from './ThemeToggle';
import { useLanguage } from './useLanguage';

export function ReportHeaderActions() {
  const { lang } = useLanguage();
  return <ThemeToggle lang={lang} />;
}
