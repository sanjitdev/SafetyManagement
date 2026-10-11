/**
 * POST /api/v1/auth/send-otp — issue a 6-digit code and (in prod) send it
 * via the SMS provider.
 *
 * Per UX spec 1.4-verification-otp: 60s resend cooldown, single-active
 * code per (user, scope), 5-min TTL.
 *
 * In dev mode the SMS provider is stubbed: the code is generated, hashed,
 * stored, and surfaced in the response as `dev_code` so the QA can type
 * it in without an SMS gateway. **Never** include the code in the prod
 * response.
 *
 * Bolt 005-003 (Intent 005, Unit 003, Story ADM-006):
 * the SMS delivery goes through the provider-agnostic
 * `sendOtp(...)` helper (lib/auth/otp.ts), which delegates
 * to the `OtpProvider` resolved by `getOtpProvider()`
 * (lib/auth/otp-provider). When the configured provider
 * cannot deliver (Twilio 5xx exhausted retries, 4xx, or
 * a misconfiguration throw), `sendOtp` writes an
 * `AuditEntry` (`action: 'otp_send_failed'`) and the
 * route returns 502 `sms_provider_failure`.
 *
 * Errors:
 *   - 400 invalid_input
 *   - 404 no_pending_user (no user with that phone in this city)
 *   - 429 resend_cooldown (less than 60s since the last send)
 *   - 502 sms_provider_failure (Bolt 005-003)
 *   - 5xx SMS provider failure (legacy wording; the same path)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isDevStore } from '@/lib/dev-store';
import { db } from '@/lib/db-switch';
import { generateOtp, hashOtp, OTP_TTL_MS, sendOtp } from '@/lib/auth/otp';
import { rateLimit } from '@/lib/platform/rate-limit';
import { writeAudit } from '@/lib/platform/audit';

const SendInput = z.object({
  phone: z.string().min(11).max(20),
  citySlug: z.string().min(1).default('dhaka-north'),
  scope: z.enum(['registration', 'login', 'password-reset']).default('registration'),
});

const RESEND_COOLDOWN_MS = 60_000;

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
  const rl = rateLimit(`send-otp:${ip}`);
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
  const parsed = SendInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const phone = normalizePhone(parsed.data.phone);
  const { scope } = parsed.data;

  // Resolve the city + user.
  const city = await db.city.findUniqueBySlug({ where: { slug: parsed.data.citySlug } });
  if (!city) {
    return NextResponse.json({ error: 'city_not_found' }, { status: 404 });
  }
  const user = await db.user.findFirst({
    where: { cityId: city.id, phone, role: 'citizen' },
  });
  if (!user) {
    return NextResponse.json({ error: 'no_pending_user' }, { status: 404 });
  }

  // Resend cooldown: refuse if the latest code for this (user, scope) is
  // less than 60s old.
  const since = new Date(Date.now() - RESEND_COOLDOWN_MS).toISOString();
  const recent = await db.otp.findFirst({
    where: { userId: user.id, scope },
    orderBy: { createdAt: 'desc' },
  });
  if (recent) {
    const createdAt = recent.createdAt instanceof Date
      ? recent.createdAt
      : new Date(recent.createdAt);
    if (createdAt >= new Date(since)) {
      const retryAfterMs = RESEND_COOLDOWN_MS - (Date.now() - createdAt.getTime());
      return NextResponse.json(
        { error: 'resend_cooldown', retryAfterMs },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } },
      );
    }
  }

  // Generate + hash + persist.
  const code = generateOtp();
  const codeHash = await hashOtp(code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  await db.otp.create({
    data: {
      userId: user.id,
      codeHash,
      scope,
      expiresAt,
    },
  });

  await writeAudit({
    entityType: 'user',
    entityId: user.id,
    action: 'user.otp_issued',
    actorId: user.id,
    afterValue: { scope, ttlMs: OTP_TTL_MS },
  });

  // Bolt 005-003 (ADR-012): SMS delivery via the
  // provider-agnostic factory. The OtpCode row is already
  // persisted (the citizen can still try to verify the
  // code from another channel), but a 502 here tells the
  // client to surface a "try again later" CTA. `sendOtp`
  // itself writes the `otp_send_failed` audit row on
  // failure.
  const sendResult = await sendOtp(phone, code, user.id);
  if (!sendResult.delivered) {
    return NextResponse.json(
      { error: 'sms_provider_failure', detail: sendResult.error },
      { status: 502 },
    );
  }

  // In dev mode we surface the code in the response so the
  // QA flow can complete. The StubProvider's `console.info`
  // adds a second dev-visible breadcrumb; the JSON response
  // still carries `dev_code` for the QA persona.
  const isDev = process.env.NODE_ENV !== 'production' || isDevStore();
  return NextResponse.json(
    {
      ok: true,
      ttlMs: OTP_TTL_MS,
      ...(isDev ? { dev_code: code } : {}),
    },
    { status: 200 },
  );
}
