/**
 * POST /api/v1/auth/login — authenticate a returning citizen.
 *
 * Per UX spec 1.5-login: phone + password. On success, mints a session
 * and sets the signed `cityfix_session` cookie. Returns 200 with
 * `{ ok, userId }`.
 *
 * Errors (deliberately vague to avoid leaking which field is wrong):
 *   - 400 invalid_input (malformed phone / missing password)
 *   - 401 wrong_credentials
 *   - 423 locked (too many attempts within the window)
 *   - 429 rate_limited (per-IP)
 *
 * The lockout counter lives in a small in-process map keyed by IP for
 * v1. A future Bolt can promote it to the OtpCode-like attempts column
 * on User or a dedicated FailedLogin model.
 *
 * Dev-mode note: works the same way — the dev store users table is
 * scanned for the (cityId, phone, role='citizen') triple.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { cookies } from 'next/headers';
import { db } from '@/lib/db-switch';
import { verifyPassword } from '@/lib/auth/password';
import { createSession, SESSION_COOKIE } from '@/lib/auth/session';
import { writeAudit } from '@/lib/platform/audit';
import { rateLimit } from '@/lib/platform/rate-limit';

const LoginInput = z.object({
  phone: z.string().min(11).max(20),
  password: z.string().min(1).max(200),
  citySlug: z.string().min(1).default('dhaka-north'),
});

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const LOCKOUT_MS = 10 * 60 * 1000;

interface AttemptRecord {
  failures: number;
  firstFailure: number;
  lockedUntil: number;
}

const attempts = new Map<string, AttemptRecord>();

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

function noteFailure(key: string): AttemptRecord {
  const now = Date.now();
  const cur = attempts.get(key);
  if (!cur || now - cur.firstFailure > WINDOW_MS) {
    const next: AttemptRecord = { failures: 1, firstFailure: now, lockedUntil: 0 };
    attempts.set(key, next);
    return next;
  }
  cur.failures += 1;
  if (cur.failures >= MAX_ATTEMPTS) {
    cur.lockedUntil = now + LOCKOUT_MS;
  }
  attempts.set(key, cur);
  return cur;
}

function noteSuccess(key: string): void {
  attempts.delete(key);
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const rl = rateLimit(`login:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', retryAfterMs: rl.retryAfterMs },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  const attemptKey = `login:${ip}`;
  const now = Date.now();
  const prior = attempts.get(attemptKey);
  if (prior && prior.lockedUntil > now) {
    return NextResponse.json(
      { error: 'locked', retryAfterMs: prior.lockedUntil - now },
      { status: 423 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = LoginInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const phone = normalizePhone(parsed.data.phone);
  if (!/^\+8801[0-9]{9}$/.test(phone)) {
    return NextResponse.json(
      { error: 'invalid_input', field: 'phone' },
      { status: 400 },
    );
  }
  if (!parsed.data.password) {
    return NextResponse.json(
      { error: 'invalid_input', field: 'password' },
      { status: 400 },
    );
  }

  // Resolve the city + user.
  const city = await db.city.findUniqueBySlug({ where: { slug: parsed.data.citySlug } });
  if (!city) {
    return NextResponse.json({ error: 'city_not_found' }, { status: 404 });
  }

  const user = await db.user.findFirst({
    where: { cityId: city.id, phone, role: 'citizen' },
  });
  if (!user || !user.passwordHash) {
    // Don't reveal which side is wrong. Count the failure for lockout.
    noteFailure(attemptKey);
    return NextResponse.json({ error: 'wrong_credentials' }, { status: 401 });
  }

  const ok = await verifyPassword(user.passwordHash, parsed.data.password);
  if (!ok) {
    const rec = noteFailure(attemptKey);
    if (rec.lockedUntil > 0) {
      return NextResponse.json(
        { error: 'locked', retryAfterMs: rec.lockedUntil - Date.now() },
        { status: 423 },
      );
    }
    return NextResponse.json({ error: 'wrong_credentials' }, { status: 401 });
  }

  // Success: clear failure tracking.
  noteSuccess(attemptKey);

  // Mint a session and set the cookie.
  const { cookieValue, expiresAt } = await createSession({
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
    expires: expiresAt,
  });

  await writeAudit({
    entityType: 'user',
    entityId: user.id,
    action: 'user.login',
    actorId: user.id,
    afterValue: { cityId: city.id },
  });

  return NextResponse.json({ ok: true, userId: user.id }, { status: 200 });
}
