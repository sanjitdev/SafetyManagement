/**
 * POST /api/auth/webauthn/register/challenge — start a WebAuthn
 * REGISTRATION ceremony.
 *
 * Bolt 005-001 (ADR-007) shipped the registration ceremony's
 * VERIFY half (`POST /api/auth/webauthn/register`) but never its
 * CHALLENGE half. `issueChallenge(userId, 'registration')` was
 * written, unit-tested, and then never called from a route — so
 * the admin write path was unreachable end-to-end: every write
 * under `/api/v1/admin/*` demands a registered credential
 * (`requireWebAuthn`), and there was no way to register one.
 *
 * The `WebAuthnCeremony` component (components/WebAuthnCeremony.tsx)
 * expects a two-step flow:
 *
 *   1. POST the challenge endpoint → `{ challengeId, options }`
 *      where `options` is the `@simplewebauthn/browser`
 *      `startRegistration(...)` argument.
 *   2. POST the signed attestation to
 *      `/api/auth/webauthn/register` → the credential is stored.
 *
 * This route is step 1.
 *
 * ADMIN-ONLY, SESSION-BOUND. Unlike the assertion flow (which is
 * anonymous — it IS the login), registration happens AFTER the
 * admin is already signed in. The route reads the active session
 * and requires `role = 'admin'`, so a credential can never be
 * registered against somebody else's account: the `userId` is
 * taken from the session, never from the request body.
 *
 * The `credentialName` in the body is only a LABEL for the
 * credential ("Yubikey", "MacBook Touch ID"). It carries no
 * authority.
 *
 * Zod schema (request body):
 *   { credentialName?: string (0..120) } — optional; defaults to
 *   "Passkey".
 *
 * Status codes:
 *   200 — challenge minted; body carries `{ challengeId, options }`.
 *   400 — invalid_input (Zod failure).
 *   401 — not_authenticated.
 *   403 — forbidden_role (signed in, but not an admin).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getActiveSession } from '@/lib/db-switch';
import { ApiError, requireRole } from '@/lib/auth/guards';
import { issueChallenge } from '@/lib/auth/webauthn';

const ChallengeBody = z.object({
  credentialName: z.string().max(120).optional(),
});

export async function POST(req: NextRequest) {
  let session;
  try {
    session = await getActiveSession();
    requireRole(session, 'admin');
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    return NextResponse.json({ error: 'unhandled' }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = ChallengeBody.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    // `issueChallenge(..., 'registration')` returns the
    // `RegisterChallengePayload` shape — `{ challengeId, options }` —
    // which is exactly what `WebAuthnCeremony` feeds to
    // `startRegistration(...)`.
    const payload = await issueChallenge(
      session!.userId,
      'registration',
      req.headers.get('host'),
    );
    return NextResponse.json(payload, { status: 200 });
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    return NextResponse.json({ error: 'unhandled' }, { status: 500 });
  }
}
