/**
 * /admin/* layout — staff surface (cities, tickets, audit, taxonomy, wards).
 */

import type { ReactNode } from 'react';
import { AdminRouteChrome } from '@/components/AdminRouteChrome';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminRouteChrome>{children}</AdminRouteChrome>;
}
