/**
 * POST /api/dev/issue-session — mint a session for an arbitrary user.
 *
 * v1.1-launch (2026-10-13) — emergency fallback for the live
 * production admin pages. After the /api/dev/promote-admin
 * call promotes the SM user to role='admin', the citizen
 * login path (`/api/v1/auth/login`) refuses to mint a new
 * session for them (the citizen login only finds users with
 * `role: 'citizen'`). So if the user signed out after the
 * promote, they have no way back in.
 *
 * This endpoint bypasses the password check entirely and
 * mints a session for a supplied userId. The caller must
 * know the target userId — most easily obtained by
 * inspecting a previous `/api/auth/status` response body.
 *
 * Gated by CITYFIX_DEV_PROMOTE_SECRET **and** a non-production
 * build. Returns 404 if the env var is unset, and 404 if
 * `NODE_ENV === 'production'`.
 *
 * The production half of the gate is what makes this safe to
 * leave in the tree. Without it the route reaches REAL Prisma
 * in production and mints a real, persistent session for any
 * userId — including an admin's — with no password, no OTP and
 * no WebAuthn. A leaked shared secret would then be a complete
 * privilege escalation.
 *
 * The gate is on `NODE_ENV`, NOT on `isDevStore()`: this endpoint
 * is inherently PRODUCTION-shaped. It exists so an operator can
 * get back into the deployed admin pages, where the session must
 * be minted against real Prisma. A dev-store gate would make the
 * route 404 in the one environment it was written for, while a
 * production gate removes exactly the deployment it must never
 * run in.
 *
 * Body: { userId: string }   // required
 * Response: { ok: true, sessionId, userId, role, name, expiresAt }
 *
 * The endpoint sets the `cityfix_session` cookie directly,
 * so a successful call is enough to authenticate the next
 * request from the same browser.
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { db } from '@/lib/db-switch';
import { createSession, SESSION_COOKIE } from '@/lib/auth/session';

export async function POST(req: NextRequest) {
  // Read the flag ONCE. Next's ambient types narrow
  // `process.env.NODE_ENV` to `'development' | 'test'`, so a second
  // `=== 'production'` comparison further down the function would
  // be flagged as an impossible overlap (TS2367).
  const isProduction = process.env.NODE_ENV === 'production';

  const expected = process.env.CITYFIX_DEV_PROMOTE_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  // The dev routes must not run in a PRODUCTION BUILD — see the
  // route's docblock. Without this check a leaked secret on the
  // deployed environment mints a real admin session against real
  // Prisma. The 404 (not 403) also tells a production caller
  // nothing about whether the secret exists.
  if (isProduction) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const supplied = req.headers.get('x-cityfix-promote-secret');
  if (supplied !== expected) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: { userId?: string } = {};
  try {
    body = (await req.json()) as { userId?: string };
  } catch {
    // empty body is fine
  }
  if (!body.userId || typeof body.userId !== 'string') {
    return NextResponse.json(
      { error: 'invalid_input', field: 'userId' },
      { status: 400 },
    );
  }

  const user = await db.user.findUnique({ where: { id: body.userId } });
  if (!user) {
    return NextResponse.json({ error: 'user_not_found' }, { status: 404 });
  }

  // Mint a session.
  const { cookieValue, expiresAt, sessionId } = await createSession({
    userId: user.id,
    cityId: user.cityId,
    wardId: user.wardId,
    departmentId: user.departmentId,
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, cookieValue, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
    expires: expiresAt,
  });

  return NextResponse.json({
    ok: true,
    sessionId,
    userId: user.id,
    role: user.role,
    name: user.name,
    expiresAt: expiresAt.toISOString(),
  });
}
