/**
 * Admin WebAuthn step-up (components/AdminWebAuthnStepUp.tsx).
 *
 * ADR-007 ("admin write paths require WebAuthn") gates the admin's
 * ticket transition and crew reassignment behind a fresh WebAuthn
 * assertion. The guard is enforced server-side by
 * `requireWebAuthn` — this component is the **client half**: the
 * affordance that lets a signed-in admin satisfy the gate.
 *
 * **Why a separate component rather than reusing `WebAuthnCeremony`.**
 * `WebAuthnCeremony` drives the *login* ceremony: it POSTs to the
 * anonymous, email-keyed `/api/auth/webauthn/login` endpoint and
 * its verify step (`/api/auth/webauthn/assertion`) MINTS A NEW
 * SESSION. For a signed-in admin doing one gated write, minting a
 * second session would rotate the cookie under their feet and leave
 * the old session row dangling. The step-up flow therefore talks to
 * `/api/auth/webauthn/step-up`, which is behind the session cookie,
 * binds the challenge to the session's own user, and mints nothing.
 *
 * The two components share the browser-side ceremony mechanics
 * (`navigator.credentials.get`), so the interesting difference is
 * the *protocol*, not the WebAuthn API.
 *
 * **The interaction contract with the page.** The page calls
 * `runStepUp()` when a gated write comes back 401 `webauthn_required`
 * (or `webauthn_assertion_expired`). `runStepUp()` returns:
 *
 *   - `'verified'` — the assertion succeeded; the page should RETRY
 *     the write. The retry will pass, because the step-up route
 *     refreshed the challenge ledger row that `requireWebAuthn`
 *     reads.
 *   - `'no_credential'` — the admin has never registered an
 *     authenticator. The page should point them at the registration
 *     mount point (`AdminSecurityKey`, on `/admin`). No retry will
 *     help.
 *   - `'failed'` / `'cancelled'` — the ceremony did not complete.
 *     The page should surface the error and NOT retry.
 *
 * The component renders the button + the 3-state progress UI. The
 * page owns the layout.
 */

'use client';

import { useCallback, useState } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import type { AuthenticatorTransportFuture } from '@simplewebauthn/types';
import { t } from '@/lib/i18n/keys';

export type StepUpOutcome = 'verified' | 'no_credential' | 'failed' | 'cancelled';

interface AssertionChallengeResponse {
  challengeId: string;
  challenge: string;
  rpId: string;
  allowCredentials: Array<{ id: string; transports?: string[] }>;
  userVerification: 'preferred' | 'required' | 'discouraged';
  timeout: number;
}

const STEP_UP_ENDPOINT = '/api/auth/webauthn/step-up';

export interface AdminWebAuthnStepUpProps {
  lang: 'bn' | 'en';
  /**
   * Called when the admin starts the ceremony. The page uses this to
   * know a ceremony is in flight (so it can disable the write
   * buttons).
   */
  onStateChange?: (inProgress: boolean) => void;
  /**
   * Called with the outcome when the ceremony completes. The page
   * retries the write on `'verified'`.
   */
  onOutcome?: (outcome: StepUpOutcome) => void;
}

export function AdminWebAuthnStepUp(props: AdminWebAuthnStepUpProps) {
  const { lang, onStateChange, onOutcome } = props;
  const [inProgress, setInProgress] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const finish = useCallback(
    (outcome: StepUpOutcome, code?: string) => {
      setInProgress(false);
      setErrorCode(code ?? null);
      onStateChange?.(false);
      onOutcome?.(outcome);
    },
    [onOutcome, onStateChange],
  );

  /**
   * Run the two-step step-up ceremony.
   *
   * Step 1: POST `{ action: 'challenge' }` → the server mints a
   * challenge bound to the session's user and returns the browser
   * ceremony options.
   *
   * Step 2: drive `navigator.credentials.get(...)`, then POST
   * `{ action: 'verify', challengeId, assertionResponse }`.
   */
  const runStepUp = useCallback(async (): Promise<StepUpOutcome> => {
    setInProgress(true);
    setErrorCode(null);
    onStateChange?.(true);

    try {
      // ── Step 1: challenge ──────────────────────────────────────
      const challengeRes = await fetch(STEP_UP_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'challenge' }),
      });
      if (!challengeRes.ok) {
        const body = (await challengeRes.json().catch(() => ({}))) as {
          error?: string;
        };
        const code = body.error ?? 'unhandled';
        if (code === 'webauthn_no_credential' || code === 'webauthn_required') {
          finish('no_credential', code);
          return 'no_credential';
        }
        finish('failed', code);
        return 'failed';
      }
      const challenge = (await challengeRes.json()) as AssertionChallengeResponse;

      // ── Step 2: the browser's authenticator ────────────────────
      //
      // The server returns the bare
      // `PublicKeyCredentialRequestOptions` (challenge + rpId +
      // allowCredentials + timeout + userVerification). The
      // @simplewebauthn/browser helper expects exactly that shape,
      // with one difference: each `allowCredentials` entry needs an
      // explicit `type: 'public-key'`, which the server omits (it is
      // the only valid value in v1).
      const options: Parameters<typeof startAuthentication>[0] = {
        challenge: challenge.challenge,
        rpId: challenge.rpId,
        allowCredentials: challenge.allowCredentials.map((c) => ({
          id: c.id,
          type: 'public-key' as const,
          ...(c.transports
            ? {
                transports: c.transports.filter(
                  (tr): tr is AuthenticatorTransportFuture =>
                    (
                      [
                        'ble',
                        'cable',
                        'hybrid',
                        'internal',
                        'nfc',
                        'smart-card',
                        'usb',
                      ] as string[]
                    ).includes(tr),
                ),
              }
            : {}),
        })),
        userVerification: challenge.userVerification,
        timeout: challenge.timeout,
      };

      let signed: unknown;
      try {
        signed = await startAuthentication(options);
      } catch {
        // The browser helper throws on user-cancel — the common
        // case. That is a cancel, not a failure.
        finish('cancelled', 'webauthn_user_cancel');
        return 'cancelled';
      }

      // ── Step 3: verify ────────────────────────────────────────
      const verifyRes = await fetch(STEP_UP_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'verify',
          challengeId: challenge.challengeId,
          assertionResponse: signed,
        }),
      });
      if (!verifyRes.ok) {
        const body = (await verifyRes.json().catch(() => ({}))) as {
          error?: string;
        };
        const code = body.error ?? 'unhandled';
        finish(
          code === 'webauthn_assertion_expired' ? 'failed' : 'failed',
          code,
        );
        return 'failed';
      }

      finish('verified');
      return 'verified';
    } catch {
      // A network failure is a failure, not a cancel — but either
      // way the page must NOT retry the write.
      finish('failed', 'unhandled');
      return 'failed';
    }
  }, [finish, onStateChange]);

  return (
    <div
      data-testid="admin-webauthn-step-up"
      data-state={inProgress ? 'in_progress' : errorCode ? 'error' : 'idle'}
    >
      {inProgress ? (
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-4 w-4 animate-spin rounded-full border-2"
            style={{
              borderColor: 'var(--color-primary-soft)',
              borderTopColor: 'var(--color-primary)',
            }}
          />
          <p className="text-sm" style={{ color: 'var(--color-ink-secondary)' }}>
            {t('admin.webauthn.step_up.instruction', null, lang)}
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            void runStepUp();
          }}
          data-testid="admin-webauthn-step-up-start"
          className="admin-btn-primary px-4 py-2 rounded-md focus:outline-none"
        >
          {t('admin.webauthn.step_up.title', null, lang)}
        </button>
      )}

      {errorCode && !inProgress && (
        <p
          data-testid="admin-webauthn-step-up-error"
          className="mt-2 text-sm"
          style={{ color: 'var(--color-danger)' }}
        >
          {errorCode === 'webauthn_no_credential' ||
          errorCode === 'webauthn_required'
            ? t('admin.webauthn.step_up.error.no_credential', null, lang)
            : errorCode === 'webauthn_assertion_expired' ||
                errorCode === 'webauthn_user_cancel'
              ? t('admin.webauthn.step_up.error.expired', null, lang)
              : t('admin.webauthn.step_up.error.failed', null, lang)}
        </p>
      )}
    </div>
  );
}

export default AdminWebAuthnStepUp;
