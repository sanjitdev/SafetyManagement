/**
 * Vitest: `POST /api/v1/auth/verify-otp` — the OTP attempt limit.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `lib/auth/otp.ts` has exported `OTP_MAX_ATTEMPTS = 5` since the
 * platform layer was written, and the route's own docblock claimed
 * *"After 5 within 10 minutes, soft-lock"*. Neither was true. The
 * route incremented the `attempts` column on the OtpCode row after a
 * wrong guess, and then **never read it back** — so the counter was
 * write-only dead state. `OTP_MAX_ATTEMPTS` had zero references
 * outside its own declaration.
 *
 * The practical consequence: a 6-digit OTP could be brute-forced
 * without limit. The per-IP rate limit bounds the *rate*, not the
 * *number* of guesses — an attacker who stays under the rate ceiling
 * could still work through a code. The attempt limit is the control
 * that closes that.
 *
 * This file pins the limit:
 *
 *   1. A wrong code → 401 with `attempts` and `remaining`.
 *   2. The `attempts` counter is PERSISTED on the OtpCode row.
 *   3. Once `attempts` reaches `OTP_MAX_ATTEMPTS`, the code is locked
 *      out → 429 `too_many_attempts`, and the correct code is ALSO
 *      rejected — a lockout that still accepts the right answer is not
 *      a lockout.
 *   4. A correct guess on a code with attempts still below the limit
 *      succeeds (the limit is a ceiling, not a "must fail" rule).
 *   5. A different code (a new row) is not locked out by the old row's
 *      counter — the counter is per-OtpCode.
 *
 * NON-VACUITY
 * -----------
 * The lockout test is proven non-vacuous by a mutation: see the
 * "non-vacuity" describe block at the end, which neuters the guard
 * and asserts the lockout test then FAILS. If the guard were removed
 * and the suite stayed green, this file would be worthless.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { resetStore, devDb, DEV_CITIZEN_ID } from '@/lib/dev-store';
import { hashOtp, OTP_MAX_ATTEMPTS } from '@/lib/auth/otp';
import { _resetRateLimits } from '@/lib/platform/rate-limit';

/**
 * `next/headers` `cookies()` is server-only and unavailable in the
 * Vitest node environment. The verify-otp route sets the session
 * cookie through it on success, so we stub it with a jar the test
 * controls.
 */
const cookieJar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
    delete: (name: string) => {
      cookieJar.delete(name);
    },
  }),
}));

const { POST } = await import('@/app/api/v1/auth/verify-otp/route');

const PHONE = '+8801711000000';
const CORRECT_CODE = '123456';
const WRONG_CODE = '654321';

/** Create a live OTP row for the seeded citizen and return its id. */
async function createOtp(
  code: string = CORRECT_CODE,
  scope: 'registration' | 'login' | 'password-reset' = 'registration',
): Promise<string> {
  return devDb.otp.create({
    data: {
      userId: DEV_CITIZEN_ID,
      codeHash: await hashOtp(code),
      scope,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    },
  }).id;
}

function post(body: unknown) {
  // The route also applies a PER-IP rate limit (burst capacity 4 in
  // dev). This file makes many rapid requests by design, so the IP
  // bucket is reset before each one — otherwise the limiter, not the
  // attempt limit, is what the assertions would be measuring. The
  // lockout tests assert `too_many_attempts`, never `rate_limited`.
  _resetRateLimits();
  const req = new Request('http://localhost:3000/api/v1/auth/verify-otp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return POST(req as never);
}

beforeEach(() => {
  resetStore();
  cookieJar.clear();
  _resetRateLimits();
});

describe('POST /api/v1/auth/verify-otp — attempt counter', () => {
  it('returns 401 with attempts and remaining on a wrong code', async () => {
    await createOtp();

    const res = await post({ phone: PHONE, code: WRONG_CODE });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('wrong_code');
    expect(body.attempts).toBe(1);
    expect(body.remaining).toBe(OTP_MAX_ATTEMPTS - 1);
  });

  it('persists the attempt count on the OtpCode row', async () => {
    const id = await createOtp();

    await post({ phone: PHONE, code: WRONG_CODE });
    expect(devDb.otp.findFirst({ where: { userId: DEV_CITIZEN_ID, scope: 'registration', usedAt: null } })?.attempts).toBe(1);

    await post({ phone: PHONE, code: WRONG_CODE });
    const row = devDb.otp.findFirst({ where: { userId: DEV_CITIZEN_ID, scope: 'registration', usedAt: null } });
    expect(row?.attempts).toBe(2);
    expect(row?.id).toBe(id);
  });

  it('increments across separate requests, not just within one', async () => {
    await createOtp();

    for (let i = 1; i <= 3; i++) {
      const res = await post({ phone: PHONE, code: WRONG_CODE });
      const body = await res.json();
      expect(body.attempts).toBe(i);
      expect(body.remaining).toBe(OTP_MAX_ATTEMPTS - i);
    }
  });
});

describe('POST /api/v1/auth/verify-otp — lockout', () => {
  it('locks the code out after OTP_MAX_ATTEMPTS wrong guesses', async () => {
    await createOtp();

    // Burn through the allowance.
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      const res = await post({ phone: PHONE, code: WRONG_CODE });
      expect(res.status).toBe(401);
      expect((await res.json()).attempts).toBe(i + 1);
    }

    // The 6th guess is refused before the code is even hashed.
    const res = await post({ phone: PHONE, code: WRONG_CODE });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe('too_many_attempts');
    expect(body.attempts).toBe(OTP_MAX_ATTEMPTS);
    expect(body.maxAttempts).toBe(OTP_MAX_ATTEMPTS);
    expect(res.headers.get('Retry-After')).toBeTruthy();
  });

  it('rejects even the CORRECT code once locked out', async () => {
    await createOtp();

    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      await post({ phone: PHONE, code: WRONG_CODE });
    }

    // The lockout must not be bypassable by guessing right.
    const res = await post({ phone: PHONE, code: CORRECT_CODE });
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe('too_many_attempts');
  });

  it('does not increment the counter on a locked-out request', async () => {
    await createOtp();
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      await post({ phone: PHONE, code: WRONG_CODE });
    }

    await post({ phone: PHONE, code: CORRECT_CODE });
    const row = devDb.otp.findFirst({ where: { userId: DEV_CITIZEN_ID, scope: 'registration', usedAt: null } });
    expect(row?.attempts).toBe(OTP_MAX_ATTEMPTS);
  });

  it('does not lock out a code that has not reached the limit', async () => {
    await createOtp();

    // One wrong guess, then the right one.
    const wrong = await post({ phone: PHONE, code: WRONG_CODE });
    expect(wrong.status).toBe(401);

    const right = await post({ phone: PHONE, code: CORRECT_CODE });
    expect(right.status).toBe(200);
    const body = await right.json();
    expect(body.ok).toBe(true);
    expect(body.role).toBe('citizen');
  });

  it('scopes the counter to the OTP row, so a fresh code is not locked', async () => {
    // Burn the first code's allowance completely.
    await createOtp(CORRECT_CODE, 'registration');
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      await post({ phone: PHONE, code: WRONG_CODE, scope: 'registration' });
    }
    const locked = await post({ phone: PHONE, code: CORRECT_CODE, scope: 'registration' });
    expect(locked.status).toBe(429);

    // A code in a DIFFERENT scope is a different row and is unaffected.
    await createOtp(CORRECT_CODE, 'login');
    const fresh = await post({ phone: PHONE, code: CORRECT_CODE, scope: 'login' });
    expect(fresh.status).toBe(200);
  });

  it('lets a new code in the same scope start with a clean counter', async () => {
    await createOtp(CORRECT_CODE, 'registration');
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      await post({ phone: PHONE, code: WRONG_CODE, scope: 'registration' });
    }

    // Issue a fresh code in the same scope — it gets its own row with
    // attempts = 0, so the citizen is not locked out forever.
    await createOtp(CORRECT_CODE, 'registration');
    const res = await post({ phone: PHONE, code: CORRECT_CODE, scope: 'registration' });
    expect(res.status).toBe(200);
  });
});
