/**
 * Authentication helpers for Playwright route specs
 * (tests/helpers/auth.ts).
 *
 * ── Why this exists ────────────────────────────────────────────
 *
 * The Playwright suite historically assumed the **dev store** was
 * running: `POST /api/dev/login?role=citizen` mints a session
 * directly, with no ceremony. That endpoint returns **404** when the
 * dev store is off (`CITYFIX_DEV_STORE` unset) — which is exactly
 * how `npm run dev` runs now that development targets the real
 * local PostgreSQL.
 *
 * So a spec that only knows the dev-store path silently stops
 * working the moment someone runs the suite against the real
 * database: the login 404s, the session cookie is never set, and
 * the next authenticated POST comes back **401** — a failure that
 * looks like an application bug but is a harness mismatch.
 *
 * `loginAsCitizen` handles BOTH backends:
 *
 *   - dev store on  → `POST /api/dev/login?role=citizen`
 *   - dev store off → register → send OTP → verify OTP
 *
 * The OTP path uses the stub provider (`OTP_PROVIDER=stub`), which
 * returns the code as `dev_code` in the send-otp response — no SMS
 * gateway and no human involved.
 *
 * `page.request` shares the BrowserContext's cookie jar, so the
 * session established here is carried by the subsequent `page.goto`.
 * A detached `request.newContext()` would seed the data but leave
 * the BROWSER anonymous — and both `/feed` and `/home` gate on an
 * authenticated session.
 */

import type { APIRequestContext, Page } from '@playwright/test';

export type Role = 'citizen' | 'dispatcher' | 'crew' | 'admin';

const DEFAULT_BASE = 'http://localhost:3000';

function base(): string {
  return process.env.BASE_URL ?? DEFAULT_BASE;
}

/**
 * True when the dev store is running (i.e. `/api/dev/login` exists).
 *
 * Probed rather than assumed, because `CITYFIX_DEV_STORE` is a
 * server-side setting the test process cannot read.
 */
export async function devStoreAvailable(
  ctx: APIRequestContext,
): Promise<boolean> {
  const res = await ctx.post(`${base()}/api/dev/login?role=citizen`, {
    maxRedirects: 0,
    failOnStatusCode: false,
  });
  // The dev-store route answers 200/303 when on, 404 when off.
  return res.status() !== 404;
}

/**
 * Establish an authenticated session as `role`.
 *
 * Returns the kind of session that was created, so a spec can skip
 * (or assert differently on) a backend-specific step.
 */
export async function loginAs(
  page: Page,
  role: Role = 'citizen',
): Promise<'dev-store' | 'otp'> {
  const ctx = page.request;

  if (await devStoreAvailable(ctx)) {
    const res = await ctx.post(`${base()}/api/dev/login?role=${role}`, {
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    if (res.status() !== 404) return 'dev-store';
  }

  // Real-database path: register a fresh citizen, then verify an OTP.
  //
  // The phone number is unique per call so repeated runs against a
  // persistent database (the local Postgres does NOT reset between
  // runs) don't collide on the unique phone constraint.
  //
  // The shapes must satisfy the register schema exactly:
  //   phone → E.164, max 14 characters ("+880" + 9 digits = 13)
  //   nid   → exactly 10 or 17 digits
  const phone = `+8801${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
  const nid = `19${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;

  const reg = await ctx.post(`${base()}/api/v1/auth/register`, {
    data: { phone, nid, password: 'Passw0rd!2026', name: 'Probe Citizen' },
  });
  // 201 = created. 409 = the phone/nid was already taken (a
  // re-registration after a partial run) — the account exists
  // either way, so the OTP path still works.
  if (reg.status() !== 201 && reg.status() !== 409) {
    throw new Error(
      `register failed: expected 201/409, got ${reg.status()} — ${await reg.text()}`,
    );
  }

  const otp = await ctx.post(`${base()}/api/v1/auth/send-otp`, {
    data: { phone },
  });
  if (otp.status() !== 200) {
    throw new Error(
      `send-otp failed: expected 200, got ${otp.status()} — ${await otp.text()}`,
    );
  }
  const body = (await otp.json().catch(() => ({}))) as {
    dev_code?: string;
    code?: string;
  };
  const code = body.dev_code ?? body.code;
  if (!code) {
    throw new Error(
      'send-otp returned no dev_code — the stub OTP provider is required ' +
        '(OTP_PROVIDER=stub). A real provider cannot be exercised ' +
        'without a phone number.',
    );
  }

  const ver = await ctx.post(`${base()}/api/v1/auth/verify-otp`, {
    data: { phone, code },
  });
  if (ver.status() !== 200) {
    throw new Error(
      `verify-otp failed: expected 200, got ${ver.status()} — ${await ver.text()}`,
    );
  }

  return 'otp';
}

/** Convenience wrapper for the citizen role. */
export async function loginAsCitizen(page: Page): Promise<'dev-store' | 'otp'> {
  return loginAs(page, 'citizen');
}
