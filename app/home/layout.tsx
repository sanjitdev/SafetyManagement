/**
 * /home/* layout — citizen Home / City Activity surface.
 *
 * Bolt 006-004: wrap children in `<AppShell role="citizen">` so the
 * page inherits the global header (brand + inline nav + Report CTA
 * + lang/theme/user-menu). The page itself owns its two-region
 * (map | side panel) grid; the shell only owns the chrome.
 */

import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';

export default function HomeLayout({ children }: { children: ReactNode }) {
  return <AppShell role="citizen">{children}</AppShell>;
}
