/**
 * DELETE /api/auth/webauthn/revoke — revoke a registered WebAuthn
 * credential.
 *
 * Bolt 005-001 (ADR-007): the admin uses this route to drop a
 * security key that was lost, stolen, or retired. The route is
 * admin-only (the session is the calling admin) and the
 * no-last-credential rule is enforced by the domain service: an
 * admin must keep at least one registered credential at all
 * times (a v1 conservative policy; the alternative — silent
 * delete + require re-register — leaves a window where the
 * admin cannot log in).
 *
 * The route is intentionally NOT behind `requireWebAuthn` —
 * revoking a credential is an admin-side state change that
 * should not require a fresh assertion (otherwise the admin
 * could not rotate a compromised key without first proving
 * possession of a non-compromised key, which is the exact
 * scenario the route exists to handle). The
 * `requireRole(session, 'admin')` check is the only gate.
 *
 * Zod schema (request body):
 *   { credentialId: string }
 *
 * Status codes:
 *   204 — credential revoked.
 *   400 — invalid_input.
 *   401 — not_authenticated.
 *   403 — forbidden_role.
 *   404 — webauthn_credential_not_found.
 *   409 — webauthn_last_credential.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getActiveSession } from '@/lib/db-switch';
import { ApiError, requireRole } from '@/lib/auth/guards';
import { revokeCredential } from '@/lib/auth/webauthn';

const RevokeBody = z.object({
  credentialId: z.string().min(1),
});

export async function DELETE(req: NextRequest) {
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
  const parsed = RevokeBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    await revokeCredential(session!.userId, parsed.data.credentialId);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    return NextResponse.json({ error: 'unhandled' }, { status: 500 });
  }
}
