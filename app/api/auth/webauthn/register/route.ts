/**
 * POST /api/auth/webauthn/register — complete a WebAuthn register ceremony.
 *
 * Bolt 005-001 (ADR-007): every admin write under `/api/v1/admin/*`
 * must be backed by a registered WebAuthn credential. This route
 * is the second half of the register flow:
 *
 *   1. Client calls `POST /api/auth/webauthn/login` (the pre-session
 *      entry point) with the admin's email → receives
 *      `{ challengeId, options }` from `issueChallenge(userId,
 *      'registration')`.
 *   2. The browser runs `navigator.credentials.create(options)` and
 *      POSTs the resulting attestation back here.
 *   3. We verify the attestation via
 *      `@simplewebauthn/server` → `verifyRegistrationResponse`,
 *      append the credential to the user's
 *      `webAuthnCredentials`, and emit the
 *      `webauthn.register` audit row.
 *
 * The route is admin-only AFTER login: the route reads
 * `getActiveSession()` and requires `role = 'admin'`. In dev mode
 * with `DEV_SKIP_WEBAUTHN=1`, the route's session lookup still
 * runs (the dev seam is on the WRITE side, not this route).
 *
 * Zod schema (request body):
 *   { credentialName: string (1..120), attestationResponse: unknown }
 *
 * Status codes:
 *   201 — credential stored.
 *   400 — invalid_input (Zod failure).
 *   401 — not_authenticated (no session).
 *   403 — forbidden_role (non-admin).
 *   404 — admin_not_found (race: the user was deleted between
 *         login and register; extremely unlikely in v1).
 *   409 — webauthn_duplicate_credential (the same credentialId is
 *         already registered for this user).
 *   401 — webauthn_attestation_failed (signature mismatch or
 *         malformed payload).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getActiveSession } from '@/lib/db-switch';
import { ApiError, requireRole } from '@/lib/auth/guards';
import { verifyAttestation } from '@/lib/auth/webauthn';

const RegisterBody = z.object({
  credentialName: z.string().min(1).max(120),
  // The base64url-encoded attestation response from
  // navigator.credentials.create(...). Accepted as `unknown`
  // because the @simplewebauthn/browser type is a strict alias
  // we do not want to re-derive at the API boundary.
  attestationResponse: z.unknown(),
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

  const body = await req.json().catch(() => null);
  const parsed = RegisterBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const credential = await verifyAttestation(
      session!.userId,
      parsed.data.attestationResponse,
      parsed.data.credentialName,
      req.headers.get('host'),
    );
    return NextResponse.json(
      {
        credential: {
          id: credential.credentialID,
          name: credential.name,
          registeredAt: credential.registeredAt,
        },
      },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    return NextResponse.json({ error: 'unhandled' }, { status: 500 });
  }
}
