/**
 * POST /api/dev/bootstrap-admin — single-call admin bootstrap.
 *
 * v1.1-launch (2026-10-13) — emergency fallback for the live
 * production admin pages. Replaces the two-step dance
 * (promote-admin, then issue-session) with a single call.
 *
 * Behaviour:
 *   1. Find the user with `(citySlug, phone, role='citizen')` —
 *      matches the same lookup the citizen login path uses.
 *   2. Promote them to `role='admin'` (no-op + audit if
 *      already admin).
 *   3. Mint a session for them and set the `cityfix_session`
 *      cookie. The response is enough to be authenticated
 *      on the very next request from the same browser.
 *
 * Gated by CITYFIX_DEV_PROMOTE_SECRET. Returns 404 if the
 * env var is unset.
 *
 * Body: { phone: string, citySlug?: string }
 *   - `phone` is required and is matched against the
 *     `+8801XXXXXXXXX` shape.
 *   - `citySlug` defaults to `dhaka-north`, which is the
 *     seed city for the v1.1-launch deployment.
 *
 * Response: { ok: true, userId, role, name, sessionId, expiresAt }
 *
 * Side effects:
 *   - Writes one `AuditEntry` with action `user.promote_admin`
 *     (only if the role was actually changed).
 *   - Sets the `cityfix_session` cookie.
 *
 * The whole endpoint should be deleted (and
 * CITYFIX_DEV_PROMOTE_SECRET removed from the Vercel env)
 * once a real admin user exists in the system.
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { db } from '@/lib/db-switch';
import { createSession, SESSION_COOKIE } from '@/lib/auth/session';
import { writeAudit } from '@/lib/platform/audit';

function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits.startsWith('8801') && digits.length === 13) return `+${digits}`;
  if (digits.startsWith('01') && digits.length === 11) return `+880${digits.slice(1)}`;
  return raw;
}

export async function POST(req: NextRequest) {
  const expected = process.env.CITYFIX_DEV_PROMOTE_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const supplied = req.headers.get('x-cityfix-promote-secret');
  if (supplied !== expected) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: { phone?: string; citySlug?: string } = {};
  try {
    body = (await req.json()) as { phone?: string; citySlug?: string };
  } catch {
    // empty body
  }
  if (!body.phone) {
    return NextResponse.json(
      { error: 'invalid_input', field: 'phone' },
      { status: 400 },
    );
  }
  const phone = normalizePhone(body.phone);
  if (!/^\+8801[0-9]{9}$/.test(phone)) {
    return NextResponse.json(
      { error: 'invalid_input', field: 'phone' },
      { status: 400 },
    );
  }
  const citySlug = body.citySlug ?? 'dhaka-north';

  const city = await db.city.findUniqueBySlug({ where: { slug: citySlug } });
  if (!city) {
    return NextResponse.json({ error: 'city_not_found' }, { status: 404 });
  }

  // Look up the user. Try citizen first (the normal case —
  // the SM user was a citizen before promotion). If not
  // found, fall back to any role with that phone in the
  // city (covers the case where a previous promote-admin
  // call already flipped the role).
  let user = await db.user.findFirst({
    where: { cityId: city.id, phone, role: 'citizen' },
  });
  if (!user) {
    // The user may have already been promoted. Look up by
    // (cityId, phone) without the role filter. The db.user
    // abstraction does not expose that query shape, so we
    // walk the roles explicitly.
    for (const role of ['dispatcher', 'crew', 'admin'] as const) {
      const candidate = await db.user.findFirst({
        where: { cityId: city.id, phone, role },
      });
      if (candidate) {
        user = candidate;
        break;
      }
    }
  }
  if (!user) {
    return NextResponse.json({ error: 'user_not_found' }, { status: 404 });
  }

  // Promote if needed.
  if (user.role !== 'admin') {
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
    user = { ...user, role: 'admin' };
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
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });

  return NextResponse.json({
    ok: true,
    userId: user.id,
    role: user.role,
    name: user.name,
    sessionId,
    expiresAt: expiresAt.toISOString(),
  });
}
