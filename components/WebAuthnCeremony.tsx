/**
 * WebAuthn ceremony shell (components/WebAuthnCeremony.tsx).
 *
 * Bolt 005-001 (ADR-007): the client-only component that drives
 * the browser's `navigator.credentials.create(...)` (register)
 * or `navigator.credentials.get(...)` (login) WebAuthn
 * ceremonies. The component is structurally simple:
 *
 *   1. A button that, when clicked, kicks off the ceremony.
 *   2. The ceremony is two-step:
 *      - `mode: 'register'` — POSTs `{ credentialName }` to
 *        the register endpoint, takes the returned options,
 *        runs `startRegistration(options)`, and POSTs the
 *        result + the original body back to the register
 *        endpoint.
 *      - `mode: 'login'` — POSTs `{ email }` to the login
 *        endpoint, takes the returned challenge + options,
 *        runs `startAuthentication(options)`, and POSTs the
 *        result + the challengeId back to the assertion
 *        endpoint.
 *   3. On success, calls `onSuccess(response)`. On failure,
 *      calls `onError(code)`. The 3-state UI (idle /
 *      in_progress / done) renders the 5 i18n keys.
 *
 * The component is `'use client'`; the parent page is
 * responsible for the page-level layout (the admin's full
 * login form — Bolt 005-002).
 *
 * The component is presentation-only: it does NOT call any
 * of the platform's `requireRole` / `requireWebAuthn` guards,
 * and it does NOT mint or read cookies. The route handlers
 * own the cookie + session state. The component is a thin
 * browser-side wrapper over `@simplewebauthn/browser`.
 *
 * In the dev environment, the browser does not have a real
 * WebAuthn authenticator (the OSM dev tunnel cannot supply a
 * virtual authenticator). The Playwright spec exercises the
 * route handlers via the API directly; the component is
 * covered by the visual baseline (idle state rendered at
 * 1440x900 with the i18n keys visible).
 */

'use client';

import { useState } from 'react';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import type { AuthenticatorTransportFuture } from '@simplewebauthn/types';
import { t } from '@/lib/i18n/keys';

export type CeremonyMode = 'register' | 'login';

export interface WebAuthnCeremonyProps {
  mode: CeremonyMode;
  /**
   * The route the ceremony posts to. The shape of `body`
   * depends on `mode`:
   *   - mode: 'register' → { credentialName: string, attestationResponse: unknown }
   *     → two-step: first GET the options, then POST the
   *     signed attestation.
   *   - mode: 'login'    → { email: string, assertionResponse: unknown }
   *     → two-step: first GET the options, then POST the
   *     signed assertion.
   * The `endpoint` is the SECOND step's URL (the one that
   * verifies and persists). The first step is the
   * mode-specific options route (register-challenge /
   * login-challenge).
   */
  challengeEndpoint: string;
  verifyEndpoint: string;
  /**
   * The body sent to `challengeEndpoint` to start the
   * ceremony:
   *   - mode: 'register' → { credentialName: string }
   *   - mode: 'login'    → { email: string }
   */
  initialBody: Record<string, unknown>;
  /**
   * The body's lang. The component renders the 5 i18n keys
   * via `t(key, vars, lang)`.
   */
  lang: 'bn' | 'en';
  /**
   * Called on a successful ceremony with the verify
   * endpoint's JSON body. The parent page typically uses
   * this to navigate (e.g. to /home after a login).
   */
  onSuccess: (response: unknown) => void;
  /**
   * Called on a failed ceremony with the machine-readable
   * error code. The parent page renders the matching
   * `admin.webauthn.error.*` key.
   */
  onError: (code: string) => void;
}

type CeremonyState = 'idle' | 'in_progress' | 'done';

interface RegisterChallengeResponse {
  challengeId: string;
  options: unknown;
}
interface LoginChallengeResponse {
  challengeId: string;
  challenge: string;
  rpId: string;
  allowCredentials: Array<{ id: string; transports?: string[] }>;
  userVerification: 'preferred' | 'required' | 'discouraged';
  timeout: number;
}
type ChallengeResponse = RegisterChallengeResponse | LoginChallengeResponse;

export function WebAuthnCeremony(props: WebAuthnCeremonyProps) {
  const { mode, challengeEndpoint, verifyEndpoint, initialBody, lang, onSuccess, onError } = props;
  const [state, setState] = useState<CeremonyState>('idle');
  const [errorCode, setErrorCode] = useState<string | null>(null);

  async function run() {
    setState('in_progress');
    setErrorCode(null);
    try {
      // Step 1: GET the challenge options. The challenge
      // endpoint returns either a `RegisterChallengePayload`
      // (`{ challengeId, options }`) or an
      // `AssertionChallengePayload` (`{ challengeId, ... }`).
      const challengeRes = await fetch(challengeEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(initialBody),
      });
      if (!challengeRes.ok) {
        const body = (await challengeRes.json().catch(() => ({}))) as {
          error?: string;
        };
        const code = body.error ?? 'unhandled';
        setErrorCode(code);
        setState('done');
        onError(code);
        return;
      }
      const challenge = (await challengeRes.json()) as ChallengeResponse;

      // Step 2: drive the browser's WebAuthn API. The
      // @simplewebauthn/browser helper takes a JSON shape
      // and returns the signed JSON the server expects.
      let signed: unknown;
      if (mode === 'register') {
        const reg = challenge as RegisterChallengeResponse;
        signed = await startRegistration(
          reg.options as Parameters<typeof startRegistration>[0],
        );
      } else {
        const log = challenge as LoginChallengeResponse;
        // The assertion ceremony is the special case: the
        // server returns the bare `PublicKeyCredentialRequestOptions`
        // (challenge + rpId + allowCredentials + timeout +
        // userVerification). The browser helper expects that
        // exact shape.
        const options: Parameters<typeof startAuthentication>[0] = {
          challenge: log.challenge,
          rpId: log.rpId,
          // The @simplewebauthn/browser `PublicKeyCredentialDescriptorJSON`
          // type requires `type: 'public-key'` for every entry.
          // The server's payload omits it (it is the only valid
          // value in v1) so we hydrate it here. The transports
          // list is filtered to the AuthenticatorTransportFuture
          // union so TypeScript's strict assignability check
          // passes.
          allowCredentials: log.allowCredentials.map((c) => ({
            id: c.id,
            type: 'public-key' as const,
            ...(c.transports
              ? {
                  transports: c.transports.filter(
                    (t): t is AuthenticatorTransportFuture =>
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
                      ).includes(t),
                  ),
                }
              : {}),
          })),
          userVerification: log.userVerification,
          timeout: log.timeout,
        };
        signed = await startAuthentication(options);
      }

      // Step 3: POST the signed result to the verify
      // endpoint. The challengeId is the link between the
      // challenge row and the verify request.
      const verifyRes = await fetch(verifyEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          challengeId: challenge.challengeId,
          attestationResponse: mode === 'register' ? signed : undefined,
          assertionResponse: mode === 'login' ? signed : undefined,
        }),
      });
      if (!verifyRes.ok) {
        const body = (await verifyRes.json().catch(() => ({}))) as {
          error?: string;
        };
        const code = body.error ?? 'unhandled';
        setErrorCode(code);
        setState('done');
        onError(code);
        return;
      }
      const verifyBody = await verifyRes.json();
      setState('done');
      onSuccess(verifyBody);
    } catch (err) {
      // The browser helper throws on user-cancel (the
      // common case). Map to a stable machine code so the
      // page can render a translated message.
      const code = 'webauthn_user_cancel';
      setErrorCode(code);
      setState('done');
      onError(code);
    }
  }

  // The 3-state UI. The button is disabled in `in_progress`
  // and `done` so the user cannot double-fire the ceremony.
  return (
    <div data-testid="webauthn-ceremony" data-mode={mode} data-state={state}>
      {state === 'idle' && (
        <button
          type="button"
          onClick={run}
          data-testid="webauthn-ceremony-start"
          className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {t('admin.webauthn.title', null, lang)}
        </button>
      )}
      {state === 'in_progress' && (
        <div data-testid="webauthn-ceremony-progress" className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600"
          />
          <p className="text-sm text-gray-700">
            {t('admin.webauthn.instruction', null, lang)}
          </p>
        </div>
      )}
      {state === 'done' && (
        <div data-testid="webauthn-ceremony-done">
          {errorCode ? (
            <p
              data-testid="webauthn-ceremony-error"
              className="text-sm text-red-600"
            >
              {errorCode === 'webauthn_no_credential'
                ? t('admin.webauthn.error.no_credential', null, lang)
                : errorCode === 'webauthn_assertion_expired' ||
                    errorCode === 'webauthn_user_cancel'
                  ? t('admin.webauthn.error.expired', null, lang)
                  : t('admin.webauthn.error.expired', null, lang)}
            </p>
          ) : (
            <p
              data-testid="webauthn-ceremony-success"
              className="text-sm text-green-700"
            >
              {t('admin.webauthn.success', null, lang)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default WebAuthnCeremony;
