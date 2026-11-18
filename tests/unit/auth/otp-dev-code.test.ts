/**
 * Vitest: the send-otp route must NOT hand out the plaintext SMS
 * code outside the dev store.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 *
 * `app/api/v1/auth/send-otp/route.ts` used to return
 * `{ ok, ttlMs, dev_code: code }` with **no environment guard** —
 * the plaintext SMS code, on every request, in every environment.
 *
 * The file's own header comment said "**Never** include the code
 * in the prod response", and a later comment claimed the leak was
 * conditional on the stub provider. Neither was true: the response
 * was unconditional. That is a complete account takeover — request
 * an OTP for any phone number, read the code out of the response,
 * verify it, and you are that user.
 *
 * The discriminator is `isDevStore()`, NOT the OTP provider. The
 * provider is `stub` in the deployed app too
 * (`_progress/operations/cityfix-deployment.md`), so a
 * provider-conditional check would leak the code in exactly the
 * environment where leaking it matters most.
 *
 * ── The assertion that pins the fix ────────────────────────
 *
 * The response must NOT carry `dev_code` when the app is not on
 * the dev store — asserted by the ABSENCE of the key, not by its
 * presence. A test that asserted "dev_code is present in the dev
 * store" alone would still pass with the leak in place, because
 * the leak is unconditional. The absence assertion is the one
 * that fails on the buggy code.
 *
 * The dev-store case is asserted too: the guard must not have
 * broken the QA flow, where the code has to be typed in by hand.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * The `db` facade is MOCKED rather than run against the dev store.
 *
 * The reason is the shape of the test: the production case must
 * exercise the route on the NON-dev-store path, and the real
 * facade would branch straight into Prisma — which has no
 * database in a unit-test process and throws on the first query.
 *
 * The mock keeps both branches honest: it serves a city and a
 * citizen for BOTH store modes, so the route reaches the response
 * in either case and the ONLY thing that differs is whether
 * `dev_code` is attached. That is exactly the variable under test.
 */
const city = { id: 'city_dhaka_north', slug: 'dhaka-north' };
const citizen = {
  id: 'user_citizen_rahim',
  name: 'Rahim Uddin',
  role: 'citizen',
  phone: '+8801711000000',
  cityId: 'city_dhaka_north',
  wardId: 'ward_14',
  departmentId: null,
};

vi.mock('@/lib/db-switch', () => ({
  db: {
    city: {
      findUniqueBySlug: async () => city,
    },
    user: {
      findFirst: async () => citizen,
    },
    otp: {
      create: async () => ({ id: 'otp_test' }),
      // No prior code → no resend cooldown.
      findFirst: async () => null,
    },
    audit: {
      create: async () => ({ id: 'audit_test' }),
    },
  },
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: () => undefined,
    set: () => {},
    delete: () => {},
  }),
}));

const { POST: sendOtp } = await import('@/app/api/v1/auth/send-otp/route');

const ORIGINAL_ENV = { ...process.env };

/** The seeded dev-store citizen whose phone is `+8801711000000`. */
const CITIZEN_PHONE = '+8801711000000';

function post(body: unknown): Promise<Response> {
  return sendOtp(
    new NextRequest('http://localhost/api/v1/auth/send-otp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  // The OTP provider must resolve to the stub, otherwise the
  // send would attempt a real SMS call.
  process.env.OTP_PROVIDER = 'stub';
  process.env.DEV_SKIP_WEBAUTHN = '1';
});

afterEach(() => {
  for (const k of Object.keys(process.env)) {
    if (!(k in ORIGINAL_ENV)) delete process.env[k];
  }
  for (const [k, v] of Object.entries(ORIGINAL_ENV)) {
    if (typeof v === 'string') process.env[k] = v;
  }
});

describe('POST /api/v1/auth/send-otp — the dev_code guard', () => {
  it('does NOT include dev_code outside the dev store', async () => {
    // The production shape: the app is NOT on the dev store, so
    // the real database (Prisma) would be in play.
    delete process.env.CITYFIX_DEV_STORE;
    const res = await post({ phone: CITIZEN_PHONE });
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;

    // The key must be ABSENT. `not.toHaveProperty` is the point:
    // an unconditional leak would put it here.
    expect(json).not.toHaveProperty('dev_code');
    // And the body must not smuggle the code under any other
    // name — the plaintext must not appear anywhere in the
    // serialized response.
    expect(JSON.stringify(json)).not.toMatch(/"\d{6}"/);
  });

  it('includes dev_code inside the dev store (the QA flow must keep working)', async () => {
    process.env.CITYFIX_DEV_STORE = '1';
    const res = await post({ phone: CITIZEN_PHONE });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok?: boolean; dev_code?: string };
    expect(json.ok).toBe(true);
    // The whole point of the dev hint: a 6-digit code the QA can
    // type in without an SMS gateway.
    expect(json.dev_code).toMatch(/^\d{6}$/);
  });

  it('includes dev_code inside the dev store even when OTP_PROVIDER is stub', async () => {
    // The guard is on `isDevStore()`, NOT on the provider. This
    // asserts the two are independent: the deployed app also runs
    // the stub provider, so a provider-conditional guard would
    // leak the code in production.
    process.env.CITYFIX_DEV_STORE = '1';
    process.env.OTP_PROVIDER = 'stub';
    const res = await post({ phone: CITIZEN_PHONE });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { dev_code?: string };
    expect(json.dev_code).toMatch(/^\d{6}$/);
  });
});
