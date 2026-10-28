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
 */

import { NextResponse } from 'next/server';
import { getActiveSession } from '@/lib/db-switch';
import { db } from '@/lib/db-switch';

export async function GET() {
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ authenticated: false, session: null });
  }
  // Look up the user row for the display name. The User row is a
  // small cached hit on the active session; not a perf concern.
  // The db-switch abstraction returns the full row — the User
  // model is small (id, name, role, contact fields) so a
  // full-row fetch is fine for a polling endpoint.
  const user = await db.user.findUnique({
    where: { id: session.userId },
  });
  // Resolve the dispatcher's / crew's scope labels. The staff
  // sub-headers render "Ward 14 — Mirpur" and the department name
  // rather than the raw `ward_14` / `dept_streetlight` ids. Both
  // joins are optional — a city-wide admin has neither.
  const ward = session.wardId
    ? await db.ward.findUnique({ where: { id: session.wardId } })
    : null;
  const department = session.departmentId
    ? await db.department.findUnique({ where: { id: session.departmentId } })
    : null;
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
    },
  });
}
