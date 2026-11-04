'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { AppShell } from '@/components/AppShell';

export function AdminRouteChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === '/admin') return <>{children}</>;
  return <AppShell role="staff">{children}</AppShell>;
}
