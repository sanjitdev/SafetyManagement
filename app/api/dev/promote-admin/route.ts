/**
 * POST /api/dev/promote-admin — promote the current session's user to role='admin'.
 *
 * v1.1-launch (2026-10-13) — emergency one-shot for the live
 * production admin pages. The CityFix app is gated by 4 roles
 * (citizen / dispatcher / crew / admin); the admin pages require
 * `session.role === 'admin'`. If the only signed-in user on
 * production happens to be a citizen/dispatcher/crew member, the
 * admin role-gate (added in the Bolt admin-tickets fix) redirects
 * them to /, and there is no other way to acquire the admin role
 * without going through full phone+NID+OTP+WebAuthn onboarding.
 *
 * This endpoint is gated by CITYFIX_DEV_PROMOTE_SECRET — a known
 * shared secret that must be present in the Vercel env. If it
 * isn't set, the endpoint returns 404 (the same gating pattern
 * the rest of the dev tree uses for `CITYFIX_DEV_STORE`).
 *
 * On success, this endpoint:
 *   1. Reads the current session via `getActiveSession()`.
 *   2. Promotes the user (`db.user.update({ where: { id }, data: { role: 'admin' } })`).
 *   3. Writes an `AuditEntry` with action `user.promote_admin`,
 *      entityType='user', beforeValue/afterValue capturing the
 *      old + new role.
 *   4. Returns `{ ok: true, userId, before: role, after: 'admin' }`.
 *
 * The next /api/auth/status call will reflect role='admin' and
 * the client gate will let the user through to /admin/cities.
 *
 * After Aamir (the admin persona) is promoted, this endpoint can
 * be deleted (and CITYFIX_DEV_PROMOTE_SECRET removed from the
 * Vercel env) — it's a one-shot bootstrap, not a permanent
 * surface.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, getActiveSession } from '@/lib/db-switch';
import { writeAudit } from '@/lib/platform/audit';

export async function POST(req: NextRequest) {
  // Gate: the env var must be set, AND the caller must supply
  // the matching secret in the X-Cityfix-Promote-Secret header.
  // Two layers so a leaked env var alone is not enough.
  const expected = process.env.CITYFIX_DEV_PROMOTE_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const supplied = req.headers.get('x-cityfix-promote-secret');
  if (supplied !== expected) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Must be signed in.
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  // Idempotent: if already admin, no-op + skip the audit row.
  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user) {
    return NextResponse.json({ error: 'user_not_found' }, { status: 404 });
  }
  if (user.role === 'admin') {
    return NextResponse.json({
      ok: true,
      userId: user.id,
      before: user.role,
      after: 'admin',
      alreadyAdmin: true,
    });
  }

  const before = user.role;
  await db.user.update({
    where: { id: user.id },
    data: { role: 'admin' },
  });
  await writeAudit({
    entityType: 'user',
    entityId: user.id,
    action: 'user.promote_admin',
    actorId: user.id,
    beforeValue: { role: before },
    afterValue: { role: 'admin' },
  });

  return NextResponse.json({
    ok: true,
    userId: user.id,
    before,
    after: 'admin',
  });
}
