'use client';

/**
 * Tiny client wrapper so the report sticky header (a server component)
 * can host the theme toggle. The actual logic lives in
 * `components/ThemeToggle.tsx`.
 */

import { ThemeToggle } from './ThemeToggle';

export function ReportHeaderActions() {
  return <ThemeToggle lang="bn" />;
}
