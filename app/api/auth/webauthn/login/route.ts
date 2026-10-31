/**
 * POST /api/auth/webauthn/login — start a WebAuthn assertion ceremony.
 *
 * Bolt 005-001 (ADR-007): the admin's pre-session entry point.
 * The route is anonymous — the caller is the browser before any
 * session cookie is set. The admin's identifier is their email
 * (the only stable identifier that maps to a `User` before a
 * session is minted).
 *
 * Flow:
 *   1. The browser posts `{ email }`.
 *   2. We look up the user by `email + role = 'admin'`. A
 *      non-admin user OR a missing user is `404 admin_not_found`
 *      (the same status for both, to avoid leaking which emails
 *      are admin accounts).
 *   3. If the admin has zero registered credentials we return
 *      `409 webauthn_no_credential` so the client can prompt the
 *      admin to complete a register ceremony first.
 *   4. Otherwise we mint a fresh challenge via
 *      `issueChallenge(userId, 'assertion')` and return the
 *      `allowCredentials` list + the `challenge` (base64url) +
 *      the ceremony timeout.
 *
 * The route is intentionally NOT behind `requireRole` — the
 * caller is unauthenticated by design. The dev seam
 * (`DEV_SKIP_WEBAUTHN`) is honored here ONLY for the "no admin
 * has registered yet" case: in v1, the dev admin starts with
 * `webAuthnCredentials: null`, so a `login` call in dev mode
 * would 409 `webauthn_no_credential`. That is the correct v1
 * behavior (the dev admin must complete a register ceremony
 * first; the next Bolt 005-002 ships the `/admin/login` page
 * that drives the full flow).
 *
 * Zod schema (request body):
 *   { email: string (RFC 5322) }
 *
 * Status codes:
 *   200 — challenge minted; the response carries the assertion
 *         ceremony options the browser will feed into
 *         `navigator.credentials.get(...)`.
 *   400 — invalid_input (Zod failure).
 *   404 — admin_not_found.
 *   409 — webauthn_no_credential.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db-switch';
import { ApiError } from '@/lib/auth/guards';
import { issueChallenge } from '@/lib/auth/webauthn';

const LoginBody = z.object({
  email: z.string().email(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = LoginBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // The dev store + Prisma both support an email+role lookup on
  // the User model via the dedicated `findFirstByEmail` switch
  // (the `findFirst` method is locked to the citizen's
  // { cityId, phone, role } shape — see db-switch.ts). We use the
  // switch facade so the route is backend-agnostic.
  const admin = await db.user.findFirstByEmail({
    where: { email: parsed.data.email, role: 'admin' },
  });
  if (!admin) {
    return NextResponse.json({ error: 'admin_not_found' }, { status: 404 });
  }

  try {
    const payload = await issueChallenge(
      admin.id,
      'assertion',
      req.headers.get('host'),
    );
    // The assertion payload is exactly the `AssertionChallengePayload`
    // shape documented in lib/auth/webauthn.ts.
    return NextResponse.json(payload, { status: 200 });
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    return NextResponse.json({ error: 'unhandled' }, { status: 500 });
  }
}
