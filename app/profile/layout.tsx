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
      // NOTE: do NOT pass `signedIn` here. It disables the
      // SessionProvider, and the provider is what carries the user's
      // NAME — `getActiveSession()` returns a SessionContext (ids and
      // role only), so with the probe off the header's UserMenu has no
      // name to show and falls back to the generic "ব্যবহারকারী মেনু"
      // label on a page where every other surface shows the avatar +
      // name. The one extra `/api/auth/status` request is the same one
      // every other authenticated page already makes.
      //
      // `surface` is still passed as a fallback for the sidebar: a
      // staff member who navigated here from the crew portal should not
      // see the citizen nav if the session has not resolved yet.
      surface={session.role === 'citizen' ? undefined : session.role}
    >
      {children}
    </AppShell>
  );
}
