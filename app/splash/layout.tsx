/**
 * /splash/* layout — landing surface.
 */

import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';

export default function SplashLayout({ children }: { children: ReactNode }) {
  return <AppShell role="public">{children}</AppShell>;
}
