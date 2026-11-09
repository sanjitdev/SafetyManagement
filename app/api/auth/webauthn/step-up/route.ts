/**
 * POST /api/auth/webauthn/step-up — the session-authenticated
 * WebAuthn ceremony.
 *
 * ADR-007 ("admin write paths require WebAuthn") makes the admin's
 * ticket transition and crew reassignment require a fresh WebAuthn
 * assertion. The guard (`requireWebAuthn` in lib/auth/guards.ts)
 * enforces that by checking that the most-recent challenge row for
 * the session's user is unexpired, and then DELETING it — a
 * challenge is a one-shot nonce (SECURITY_AUDIT finding #6), so one
 * ceremony authorises exactly one write.
 *
 * **The gap this route closes.** Until now the only way to obtain a
 * fresh challenge was `POST /api/auth/webauthn/login`, which is
 * anonymous and email-keyed — it is the *login* ceremony, and its
 * sibling `/api/auth/webauthn/assertion` **mints a new session** on
 * success. So an admin who was already signed in with a password
 * session and then hit a gated write got a bare `401
 * webauthn_required` with no way to satisfy it except logging out
 * and back in through the login ceremony. That is a dead end for a
 * signed-in admin, and ADR-007 already flagged it: *"the admin
 * ticket page has no ceremony affordance, so an admin who has not
 * registered a key sees a bare error code with no path to fix it."*
 *
 * This route is the step-up counterpart: it is **behind the session
 * cookie**, it binds the challenge to **the session's own userId**
 * (never a client-supplied one), and it does **not** mint or replace
 * the session on success. The admin's existing cookie keeps working;
 * what changes is that the challenge ledger now holds a fresh,
 * unexpired row, so the next gated write passes `requireWebAuthn`.
 *
 * Two actions on one route (the browser must make two round-trips
 * regardless, because the authenticator interaction sits between
 * them):
 *
 *   { action: 'challenge' }
 *     → 200 with the `AssertionChallengePayload` the browser feeds
 *       into `navigator.credentials.get(...)`.
 *     → 401 `webauthn_required` if the admin has no registered
 *       credential at all.
 *     → 409 `webauthn_no_credential` (the domain service's code)
 *       when the credential list is empty.
 *
 *   { action: 'verify', challengeId, assertionResponse }
 *     → 200 `{ ok: true }` once the signature verifies.
 *     → 401 `webauthn_assertion_failed` / `webauthn_assertion_expired`
 *     → 404 `webauthn_challenge_not_found` / `webauthn_credential_not_found`
 *
 * **Why the challengeId is not the authority for the user.** The
 * challenge row IS the authority for which user the assertion is
 * bound to (that is how the existing assertion route works, and it
 * is the right design). But on THIS route the caller is already
 * authenticated, so the challenge must additionally belong to the
 * session's user — otherwise a signed-in admin could complete a
 * challenge that was issued for a *different* user and have it
 * count as their own step-up. The route checks
 * `challenge.userId === session.userId` and rejects with 403
 * `webauthn_challenge_owner_mismatch`. The check is the point of the
 * route, so it is not optional.
 *
 * Zod schema (request body) — one of:
 *   { action: 'challenge' }
 *   { action: 'verify', challengeId: string, assertionResponse: unknown }
 *
 * Status codes:
 *   200 — challenge issued, or assertion verified.
 *   400 — invalid_input.
 *   401 — not_authenticated / webauthn_required / assertion failures.
 *   403 — forbidden_role (a non-admin session), or the challenge
 *         belongs to another user.
 *   404 — challenge / credential not found.
 *   409 — webauthn_no_credential.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getActiveSession, db } from '@/lib/db-switch';
import { ApiError } from '@/lib/auth/guards';
import {
  issueChallenge,
  verifyAssertionSignature,
} from '@/lib/auth/webauthn';
import { writeAudit } from '@/lib/platform/audit';

const StepUpBody = z.discriminatedUnion('action', [
  z.object({ action: z.literal('challenge') }),
  z.object({
    action: z.literal('verify'),
    challengeId: z.string().min(1),
    assertionResponse: z.unknown(),
  }),
]);

export async function POST(req: NextRequest) {
  // The session is the authority for WHO is stepping up. The route is
  // behind the cookie precisely so the challenge can be bound to the
  // session's user rather than to a client-supplied identifier.
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden_role' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = StepUpBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    if (parsed.data.action === 'challenge') {
      // `issueChallenge` throws 409 `webauthn_no_credential` when the
      // admin has never registered an authenticator. That is the
      // signal the UI needs to point the admin at the registration
      // mount point (`AdminSecurityKey`) rather than at a retry.
      const payload = await issueChallenge(
        session.userId,
        'assertion',
        req.headers.get('host'),
      );
      return NextResponse.json(payload, { status: 200 });
    }

    // ── action: 'verify' ────────────────────────────────────────────
    const { challengeId, assertionResponse } = parsed.data;

    // The challenge must belong to THIS session's user. Without this
    // check, a signed-in admin could complete another user's
    // challenge and have it recorded as their own step-up — the
    // challenge row would be fresh, so `requireWebAuthn` would pass
    // on the next write. The check closes that hole.
    const challenge = await db.webAuthnChallenge.findById({
      id: challengeId,
      userId: '',
    });
    if (!challenge) {
      return NextResponse.json(
        { error: 'webauthn_challenge_not_found' },
        { status: 404 },
      );
    }
    if (challenge.userId !== session.userId) {
      return NextResponse.json(
        { error: 'webauthn_challenge_owner_mismatch' },
        { status: 403 },
      );
    }

    const verified = await verifyAssertionSignature(
      challengeId,
      assertionResponse,
      req.headers.get('host'),
    );

    // Refresh the challenge ledger. `requireWebAuthn` reads the
    // most-recent challenge row for the user, compares its
    // `expiresAt` against now, and then DELETES it — a challenge is
    // a one-shot nonce (SECURITY_AUDIT finding #6). The challenge
    // this assertion just proved IS fresh (it was minted seconds
    // ago and the signature verified against it), so the next gated
    // write passes and consumes it.
    //
    // The refresh is explicit rather than implicit so the ledger row
    // and the proof agree: we write a NEW row with a fresh
    // `expiresAt`, which is also what a second step-up in the same
    // session needs (the old row would still be the most-recent one
    // if we only mutated its timestamp, and `findLatest` orders by
    // `createdAt`).
    await issueChallenge(session.userId, 'assertion', req.headers.get('host'));

    await writeAudit({
      entityType: 'user',
      entityId: session.userId,
      action: 'webauthn.step_up',
      actorId: session.userId,
      beforeValue: { counter: verified.previousCounter },
      afterValue: { counter: verified.newCounter },
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    return NextResponse.json({ error: 'unhandled' }, { status: 500 });
  }
}
