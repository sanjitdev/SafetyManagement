/**
 * POST /api/auth/webauthn/assertion — complete a WebAuthn assertion
 * ceremony and mint a session.
 *
 * Bolt 005-001 (ADR-007): the second half of the admin login
 * flow. The browser POSTs the result of
 * `navigator.credentials.get(...)` (the signed challenge) here.
 * We hand off to `verifyAssertion(challengeId, assertionResponse)`
 * which:
 *   1. Looks up the `WebAuthnChallenge` row by `challengeId` (the
 *      `id` the `login` response returned). The row carries the
 *      `userId` the assertion is bound to — the body's
 *      `challengeId` is the only authority.
 *   2. Verifies the signature via
 *      `@simplewebauthn/server` →
 *      `verifyAuthenticationResponse`.
 *   3. Bumps the credential's `counter`.
 *   4. Mints a `Session` via `createSession(...)`.
 *   5. Emits the `webauthn.assertion` audit row.
 *
 * The route sets the `cityfix_session` cookie (HMAC-signed,
 * 14-day TTL, `HttpOnly`, `SameSite=Lax`) on success.
 *
 * The route is anonymous — the cookie is the proof-of-session
 * the caller is about to receive. A future Bolt may add a
 * rate-limit guard (defense-in-depth against an attacker
 * brute-forcing the cookie jar); v1 documents this as
 * acceptable risk because the route is gated by the
 * cryptographic signature check.
 *
 * Zod schema (request body):
 *   { challengeId: string, assertionResponse: unknown }
 *
 * Status codes:
 *   200 — assertion verified, session cookie set.
 *   400 — invalid_input.
 *   401 — webauthn_assertion_failed (signature mismatch).
 *   401 — webauthn_assertion_expired (challenge row's expiresAt
 *         is in the past).
 *   404 — webauthn_challenge_not_found (the challengeId does
 *         not match any row).
 *   404 — webauthn_credential_not_found (the assertion's
 *         credentialId is not in the user's
 *         `webAuthnCredentials`).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { cookies } from 'next/headers';
import { ApiError } from '@/lib/auth/guards';
import { verifyAssertion } from '@/lib/auth/webauthn';
import { SESSION_COOKIE } from '@/lib/auth/session';

const AssertionBody = z.object({
  // The `challengeId` the `login` route returned. The
  // `verifyAssertion` domain service resolves the userId from
  // the challenge row itself (it does not trust the body's
  // `userId` — that field is not part of the contract).
  challengeId: z.string().min(1),
  // The base64url-encoded assertion response from
  // navigator.credentials.get(...).
  assertionResponse: z.unknown(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = AssertionBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await verifyAssertion(
      parsed.data.challengeId,
      parsed.data.assertionResponse,
    );

    // Set the session cookie. Same flags as the citizen
    // registration / login routes (see
    // app/api/dev/login/route.ts for the dev-mode shape
    // and lib/auth/session.ts for the prod HMAC).
    const jar = await cookies();
    jar.set(SESSION_COOKIE, result.cookieValue, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      expires: result.expiresAt,
    });

    return NextResponse.json(
      {
        authenticated: true,
        session: {
          sessionId: result.sessionId,
          userId: result.userId,
          role: result.role,
          cityId: result.cityId,
        },
      },
      { status: 200 },
    );
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    return NextResponse.json({ error: 'unhandled' }, { status: 500 });
  }
}
