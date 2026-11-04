import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { getActiveSession } from '@/lib/db-switch';

export default async function ProfileLayout({ children }: { children: ReactNode }) {
  const session = await getActiveSession();
  if (!session) redirect('/login?next=%2Fprofile');

  return (
    <AppShell role={session.role === 'citizen' ? 'citizen' : 'staff'} signedIn>
      {children}
    </AppShell>
  );
}
