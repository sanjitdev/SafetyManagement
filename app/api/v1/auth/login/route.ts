/**
 * POST /api/v1/auth/login — authenticate a returning user (any role).
 *
 * Per UX spec 1.5-login: phone + password. On success, mints a session
 * and sets the signed `cityfix_session` cookie. Returns 200 with
 * `{ ok, userId, role }`.
 *
 * ALL FOUR ROLES CAN LOG IN HERE
 * ------------------------------
 * This route originally looked the user up with `role: 'citizen'` hard-
 * coded, which meant only citizens could sign in — dispatcher, crew and
 * admin had no password path at all and had to be issued a session by
 * the dev-only `/api/dev/issue-session` route. That made the seeded
 * staff passwords unusable and left the three staff surfaces
 * unreachable without a dev tool.
 *
 * The lookup now omits the role filter, so `(cityId, phone)` resolves
 * the account whatever role it holds. The response carries the role so
 * the client can route to the right home surface:
 *
 *   - citizen    → /home
 *   - dispatcher → /dispatcher
 *   - crew       → /crew
 *   - admin      → /admin/tickets
 *
 * SECURITY NOTES
 * --------------
 * - The admin's WebAuthn requirement is unchanged and still load-bearing
 *   for WRITES: `requireWebAuthn` (ADR-007) still gates every mutating
 *   route under `/api/v1/admin/*`. A password login lets an admin *see*
 *   the admin surfaces; it does not let them change anything. The
 *   WebAuthn assertion ceremony is still required at the point of write.
 * - The session is bound to the user's own (wardId, departmentId) scope,
 *   so a dispatcher/crew session is scoped exactly like a
 *   dev-issued one. `requireScope` enforces it downstream.
 * - Errors stay deliberately vague so a wrong phone and a wrong
 *   password are indistinguishable.
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
 * scanned for the (cityId, phone) pair across all roles.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { cookies } from 'next/headers';
import { db } from '@/lib/db-switch';
import { verifyPassword } from '@/lib/auth/password';
import { createSession, SESSION_COOKIE } from '@/lib/auth/session';
import { writeAudit } from '@/lib/platform/audit';
import { rateLimit } from '@/lib/platform/rate-limit';
import {
  lockedForMs,
  noteFailure,
  noteSuccess,
} from '@/lib/auth/login-lockout';

const LoginInput = z.object({
  phone: z.string().min(11).max(20),
  password: z.string().min(1).max(200),
  citySlug: z.string().min(1).default('dhaka-north'),
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
  const rl = rateLimit(`login:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', retryAfterMs: rl.retryAfterMs },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  const attemptKey = `login:${ip}`;
  const lockedRemaining = lockedForMs(attemptKey);
  if (lockedRemaining > 0) {
    return NextResponse.json(
      { error: 'locked', retryAfterMs: lockedRemaining },
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
    where: { cityId: city.id, phone },
  });
  if (!user || !user.passwordHash) {
    // Don't reveal which side is wrong. Count the failure for lockout.
    noteFailure(attemptKey);
    return NextResponse.json({ error: 'wrong_credentials' }, { status: 401 });
  }

  const ok = await verifyPassword(user.passwordHash, parsed.data.password);
  if (!ok) {
    noteFailure(attemptKey);
    const lockedRemaining = lockedForMs(attemptKey);
    if (lockedRemaining > 0) {
      return NextResponse.json(
        { error: 'locked', retryAfterMs: lockedRemaining },
        { status: 423 },
      );
    }
    return NextResponse.json({ error: 'wrong_credentials' }, { status: 401 });
  }

  // Success: clear failure tracking.
  noteSuccess(attemptKey);

  // Mint a session and set the cookie.
  //
  // The session binds to the user's OWN scope. A dispatcher/crew
  // session carries their wardId + departmentId so `requireScope`
  // (lib/auth/guards.ts) can deny cross-ward / cross-department
  // access downstream. The admin is city-wide — no ward, no
  // department — which is why both are null for that role.
  //
  // A CITIZEN also carries their own ward. The citizen's `wardId` is
  // their registered home ward (prisma/seed.ts gives Rahim Ward 14,
  // the ward the persona spec says he lives in), and the report flow
  // reads it from `/api/report/bootstrap` to file the ticket under
  // the right ward. Dropping it here — as this route used to — made
  // bootstrap fall through to "the first ward by number" (Ward 1),
  // so every password-logged-in citizen's report landed in Ward 1
  // and never reached the dispatcher/crew scoped to their actual
  // ward. The OTP path (`verify-otp`), the register path, and the
  // dev-session paths all bind `user.wardId`; this route is now
  // consistent with them.
  //
  // The citizen's `departmentId` stays null: a citizen is not part
  // of any department's roster.
  const { cookieValue, expiresAt } = await createSession({
    userId: user.id,
    cityId: city.id,
    wardId: user.role === 'admin' ? null : user.wardId,
    departmentId:
      user.role === 'citizen' || user.role === 'admin' ? null : user.departmentId,
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
    afterValue: { cityId: city.id, role: user.role },
  });

  return NextResponse.json(
    { ok: true, userId: user.id, role: user.role },
    { status: 200 },
  );
}
