/**
 * /reports/* layout — citizen's own reports list + detail.
 *
 * Bolt 006-004: wrap in AppShell so the header is consistent with
 * the rest of the citizen surface.
 */

import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';

export default function ReportsLayout({ children }: { children: ReactNode }) {
  return <AppShell role="citizen">{children}</AppShell>;
}
