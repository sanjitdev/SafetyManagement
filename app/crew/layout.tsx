/**
 * /crew/* layout — staff surface (today's assignments + detail).
 */

import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';

export default function CrewLayout({ children }: { children: ReactNode }) {
  return <AppShell role="staff">{children}</AppShell>;
}
