/**
 * /dispatcher/* layout — staff surface (triage queue, map, dedup, ticket detail).
 *
 * Bolt 006-004: wrap in AppShell as a `staff` surface (no Report CTA
 * — the staff role does not file reports; their work is reviewing
 * and routing them).
 */

import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';

export default function DispatcherLayout({ children }: { children: ReactNode }) {
  return <AppShell role="staff">{children}</AppShell>;
}
