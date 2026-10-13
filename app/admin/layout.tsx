/**
 * /admin/* layout — staff surface (cities, tickets, audit, taxonomy, wards).
 */

import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AppShell role="staff">{children}</AppShell>;
}
