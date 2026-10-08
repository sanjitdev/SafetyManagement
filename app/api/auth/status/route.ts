/**
 * GET /api/auth/status — report the current session state.
 *
 * Used by the splash page (1.1) to decide where to route the citizen after
 * the splash visual renders:
 *   - not-authed → /welcome (first-run) or /login
 *   - authed     → /home
 *
 * Lightweight: returns null session if the cookie is missing or expired.
 * Does NOT trigger any side effects.
 */

import { NextResponse } from 'next/server';
import { getActiveSession } from '@/lib/db-switch';

export async function GET() {
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ authenticated: false, session: null });
  }
  return NextResponse.json({
    authenticated: true,
    session: {
      sessionId: session.sessionId,
      userId: session.userId,
      role: session.role,
      cityId: session.cityId,
      wardId: session.wardId,
    },
  });
}
