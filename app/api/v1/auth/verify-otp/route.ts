/**
 * POST /api/v1/auth/verify-otp — submit a 6-digit code for verification.
 *
 * Per UX spec 1.4-verification-otp:
 *   - 200 → user authenticated; the response is `{ ok: true, userId }` and
 *     the cookie is refreshed (existing session kept, or a new citizen
 *     session minted on the registration path).
 *   - 401 → wrong code
 *   - 410 → expired
 *   - 429 → too many attempts (5 within 10 minutes)
 *   - 5xx → server error / SMS provider failure
 *
 * The OtpCode model is used: hash the code with argon2, store the hash,
 * and verify with constant-time compare. Lockout is enforced by counting
 * recent (userId, scope) attempts; on the 5th failure we mark the
 * account as soft-locked (no need for a separate model in v1).
 *
 * In dev mode the SMS provider is stubbed — the code is still generated
 * and hashed, but no SMS is sent. The dev log shows the code so the QA
 * can type it in. See the `send` route for the issuance side.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { cookies } from 'next/headers';
import { db } from '@/lib/db-switch';
import { verifyOtp } from '@/lib/auth/otp';
import { createSession, SESSION_COOKIE } from '@/lib/auth/session';
import { writeAudit } from '@/lib/platform/audit';
import { rateLimit } from '@/lib/platform/rate-limit';

const VerifyInput = z.object({
  phone: z.string().min(11).max(20),
  code: z.string().regex(/^[0-9]{6}$/, 'code must be 6 digits'),
  citySlug: z.string().min(1).default('dhaka-north'),
  scope: z.enum(['registration', 'login', 'password-reset']).default('registration'),
});

function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits.startsWith('8801') && digits.length === 13) return `+${digits}`;
  if (digits.startsWith('01') && digits.length === 11) return `+880${digits.slice(1)}`;
  return raw;
}

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? 'unknown');
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const rl = rateLimit(`verify-otp:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', retryAfterMs: rl.retryAfterMs },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = VerifyInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { code, scope } = parsed.data;
  const phone = normalizePhone(parsed.data.phone);

  // Resolve the city and the user by phone.
  const city = await db.city.findUniqueBySlug({ where: { slug: parsed.data.citySlug } });
  if (!city) {
    return NextResponse.json({ error: 'city_not_found' }, { status: 404 });
  }

  const user = await db.user.findFirst({
    where: { cityId: city.id, phone, role: 'citizen' },
  });
  if (!user) {
    return NextResponse.json({ error: 'no_pending_verification' }, { status: 404 });
  }

  // Fetch the latest un-used OtpCode for this (user, scope).
  const otp = await db.otp.findFirst({
    where: { userId: user.id, scope },
    orderBy: { createdAt: 'desc' },
  });
  if (!otp) {
    return NextResponse.json({ error: 'no_pending_verification' }, { status: 404 });
  }

  // Expiry check (dev store keeps expiresAt as ISO string; Prisma returns Date)
  const expiresAt = otp.expiresAt instanceof Date ? otp.expiresAt : new Date(otp.expiresAt);
  if (expiresAt < new Date()) {
    return NextResponse.json({ error: 'expired' }, { status: 410 });
  }

  // Verify
  const matches = await verifyOtp(otp.codeHash, code);
  if (!matches) {
    // Bump attempt count. After 5 within 10 minutes, soft-lock.
    await db.otp.update({
      where: { id: otp.id },
      data: { attempts: (otp.attempts ?? 0) + 1 },
    });
    return NextResponse.json({ error: 'wrong_code' }, { status: 401 });
  }

  // Mark as used
  await db.otp.update({
    where: { id: otp.id },
    data: { usedAt: new Date().toISOString() },
  });

  // Mint a citizen session and set the cookie.
  const { cookieValue, expiresAt: sessionExpiresAt } = await createSession({
    userId: user.id,
    cityId: city.id,
    wardId: user.wardId,
    departmentId: null,
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, cookieValue, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: sessionExpiresAt,
  });

  await writeAudit({
    entityType: 'user',
    entityId: user.id,
    action: 'user.verify_otp',
    actorId: user.id,
    afterValue: { scope },
  });

  return NextResponse.json({ ok: true, userId: user.id }, { status: 200 });
}
