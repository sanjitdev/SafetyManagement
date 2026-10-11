/**
 * POST /api/v1/auth/register — citizen creates a new account.
 *
 * Per UX spec 1.3-registration: phone + NID + name + password + confirm.
 * Phone is unique per city (Prisma @@unique([cityId, phone])); NID is
 * not a DB unique — the spec allows multiple citizens to share an NID
 * (e.g. family phones), so we only enforce uniqueness on phone.
 *
 * On success, mints a citizen session via createSession() and sets the
 * signed `cityfix_session` cookie. Returns 201 with `{ userId }`.
 *
 * Validation:
 *   - phone:    11 digits after stripping the +880 prefix
 *   - nid:      10 or 17 digits
 *   - name:     ≥ 2 chars
 *   - password: ≥ 8 chars and at least one digit (re-validated by hashPassword)
 *
 * Errors:
 *   - 400 invalid_input
 *   - 409 phone_already_registered
 *   - 429 rate_limited
 *   - 500 server_error
 *
 * Rate limit: 5/min per IP. Citizens are unlikely to legitimately hit this,
 * but a script hammer should not be able to enumerate or DOS the endpoint.
 *
 * Dev-mode note: CITYFIX_DEV_STORE=1 routes through the in-memory store.
 * Phone uniqueness is checked in the store before the create call; the
 * create path is symmetric so the prod Prisma path looks the same.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { cookies } from 'next/headers';
import { db } from '@/lib/db-switch';
import { hashPassword } from '@/lib/auth/password';
import { createSession, SESSION_COOKIE } from '@/lib/auth/session';
import { writeAudit } from '@/lib/platform/audit';
import { rateLimit } from '@/lib/platform/rate-limit';
import { randomUUID } from 'node:crypto';

const RegisterInput = z.object({
  // The form submits a 11-digit local number; we normalize and prefix +880.
  phone: z
    .string()
    .min(11)
    .max(14)
    .regex(/^[0-9+\-]+$/, 'phone must be digits'),
  nid: z.string().regex(/^[0-9]{10}$|^[0-9]{17}$/, 'NID must be 10 or 17 digits'),
  name: z.string().min(2).max(120),
  password: z.string().min(8).max(200),
  // cityId is taken from the form's selected city in the future; for v1
  // we hard-bind to the citizen's city via the city slug (Dhaka North).
  citySlug: z.string().min(1).default('dhaka-north'),
});

function normalizePhone(raw: string): string {
  // Accept "+8801XXXXXXXXX", "8801XXXXXXXXX", or "01XXXXXXXXX" → "+8801XXXXXXXXX"
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits.startsWith('8801') && digits.length === 13) return `+${digits}`;
  if (digits.startsWith('01') && digits.length === 11) return `+880${digits.slice(1)}`;
  return raw;
}

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim() ?? 'unknown';
  return req.headers.get('x-real-ip') ?? 'unknown';
}

export async function POST(req: NextRequest) {
  // Per-IP rate limit
  const ip = clientIp(req);
  const rl = rateLimit(`register:${ip}`);
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
  const parsed = RegisterInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const input = parsed.data;
  const phone = normalizePhone(input.phone);

  // Re-validate the normalized phone is a valid +880 11-digit number
  if (!/^\+8801[0-9]{9}$/.test(phone)) {
    return NextResponse.json(
      { error: 'invalid_input', field: 'phone' },
      { status: 400 },
    );
  }

  // Resolve the city by slug
  const city = await db.city.findUniqueBySlug({ where: { slug: input.citySlug } });
  if (!city) {
    return NextResponse.json({ error: 'city_not_found' }, { status: 404 });
  }

  // Hash the password. hashPassword enforces min length and a digit; we
  // already checked the schema, but the second line of defense is here.
  let passwordHash: string;
  try {
    passwordHash = await hashPassword(input.password);
  } catch (e) {
    return NextResponse.json(
      { error: 'invalid_input', field: 'password', message: (e as Error).message },
      { status: 400 },
    );
  }

  // Check phone uniqueness in this city before we try to create.
  // Goes through the `db` facade so the dev store's user scan and the
  // prod Prisma findFirst are reached from the same call site.
  const existing = await db.user.findFirst({
    where: { cityId: city.id, phone, role: 'citizen' },
  });
  if (existing) {
    return NextResponse.json(
      { error: 'phone_already_registered' },
      { status: 409 },
    );
  }

  // Pick a default ward for the citizen's first session. For v1 we use
  // the first ward in the city by number (Mirpur 14 in Dhaka North).
  const ward = await db.ward.findFirst({
    where: { cityId: city.id },
    orderBy: { number: 'asc' },
  });
  if (!ward) {
    return NextResponse.json({ error: 'ward_not_found' }, { status: 500 });
  }

  // Create the user.
  const userId = `user_${randomUUID().slice(0, 12)}`;
  await db.user.create({
    data: {
      id: userId,
      cityId: city.id,
      role: 'citizen',
      phone,
      nid: input.nid,
      name: input.name,
      passwordHash,
      wardId: ward.id,
    },
  });

  // Mint a session and set the cookie.
  const { cookieValue, expiresAt } = await createSession({
    userId,
    cityId: city.id,
    wardId: ward.id,
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
    entityId: userId,
    action: 'user.register',
    actorId: userId,
    afterValue: { cityId: city.id, role: 'citizen' },
  });

  return NextResponse.json({ ok: true, userId }, { status: 201 });
}
