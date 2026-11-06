import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { getActiveSession } from '@/lib/db-switch';

export default async function ProfileLayout({ children }: { children: ReactNode }) {
  const session = await getActiveSession();
  if (!session) redirect('/login?next=%2Fprofile');

  return (
    <AppShell
      role={session.role === 'citizen' ? 'citizen' : 'staff'}
      signedIn
      // `signedIn` disables the SessionProvider, so the sidebar has no
      // session to read the role from — it needs to be told which
      // staff surface to render, or a crew member who navigated here
      // from the crew portal would see the citizen nav.
      surface={session.role === 'citizen' ? undefined : session.role}
    >
      {children}
    </AppShell>
  );
}
