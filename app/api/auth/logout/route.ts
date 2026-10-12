/**
 * POST /api/auth/logout — destroy the current session and clear the cookie.
 *
 * v1.1 launch-polish — paired with the UserMenu dropdown in the top bar of
 * every authenticated surface. The endpoint is idempotent: a missing or
 * already-expired session resolves cleanly (200, no side effects beyond
 * clearing the cookie). It accepts POST so accidental GETs (e.g. link
 * preflight) cannot log a user out.
 *
 * The handler is also defensive in the rare case where the cookie
 * is present but the DB row is gone (the destroySession call swallows
 * the lookup error and clears the cookie anyway).
 */

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getActiveSession } from '@/lib/db-switch';
import {
  SESSION_COOKIE,
  destroySession,
} from '@/lib/auth/session';

export async function POST() {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  const session = await getActiveSession();

  if (session) {
    // We have a valid Session row; delete it.
    await destroySession(session.sessionId);
  } else if (raw) {
    // Cookie present but the session is already gone or invalid.
    // Nothing to delete server-side; just clear the cookie.
  }

  // Always clear the cookie, even if we did not find a session row.
  // We match the path of the original setter (lib/auth/session.ts) and
  // set maxAge=0 so the browser drops it.
  jar.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });

  return NextResponse.json({ ok: true });
}
