/**
 * GET /api/auth/status — report the current session state.
 *
 * Used by the splash page (1.1) to decide where to route the citizen after
 * the splash visual renders:
 *   - not-authed → / (public landing)
 *   - authed     → /home
 *
 * Also consumed by the UserMenu dropdown (v1.1 launch-polish) to render
 * the user's name + role in the top-right avatar menu. The splash
 * consumer does not use the new `name` field, so the addition is
 * additive and safe.
 *
 * Lightweight: returns null session if the cookie is missing or expired.
 * Does NOT trigger any side effects.
 *
 * CALL DISCIPLINE (2026-11-06): the client used to call this endpoint
 * from FOUR independent places on a single page load (the header, the
 * role sidebar, the user menu and the page's own auth gate), each
 * costing up to six sequential DB round-trips. The client now shares a
 * single request via `components/SessionProvider.tsx`, and the three
 * independent lookups below run in parallel rather than in sequence.
 */

import { NextResponse } from 'next/server';
import { getActiveSession } from '@/lib/db-switch';
import { db } from '@/lib/db-switch';

export async function GET() {
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ authenticated: false, session: null });
  }
  // Look up the user row for the display name, and resolve the
  // dispatcher's / crew's scope labels ("Ward 14 — Mirpur" and the
  // department name rather than the raw `ward_14` /
  // `dept_streetlight` ids).
  //
  // These three reads are INDEPENDENT, so they run concurrently
  // rather than one after the other. Awaiting them in sequence made
  // the endpoint's latency the SUM of three round-trips; in parallel
  // it is the MAX. Both ward and department lookups are optional —
  // a city-wide admin has neither.
  const [user, ward, department] = await Promise.all([
    db.user.findUnique({ where: { id: session.userId } }),
    session.wardId
      ? db.ward.findUnique({ where: { id: session.wardId } })
      : Promise.resolve(null),
    session.departmentId
      ? db.department.findUnique({ where: { id: session.departmentId } })
      : Promise.resolve(null),
  ]);
  return NextResponse.json({
    authenticated: true,
    session: {
      sessionId: session.sessionId,
      userId: session.userId,
      role: session.role,
      cityId: session.cityId,
      wardId: session.wardId,
      wardName: ward?.name ?? null,
      wardNameBn: ward?.nameBn ?? null,
      departmentId: session.departmentId,
      departmentName: department?.name ?? null,
      departmentNameBn: department?.nameBn ?? null,
      name: user?.name ?? null,
      nameBn: user?.nameBn ?? null,
    },
  });
}
