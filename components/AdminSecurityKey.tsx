/**
 * Admin security-key registration (components/AdminSecurityKey.tsx).
 *
 * WHY THIS EXISTS
 * ---------------
 * ADR-007 makes a WebAuthn assertion mandatory for EVERY write
 * under `/api/v1/admin/*`. `requireWebAuthn` (lib/auth/guards.ts)
 * rejects the write with 401 `webauthn_required` unless the
 * admin's user row carries a registered credential.
 *
 * The platform shipped every piece of that flow EXCEPT the one
 * the admin touches:
 *
 *   - `lib/auth/webauthn.ts` → `issueChallenge(userId,
 *     'registration')` and `verifyAttestation(...)` — written,
 *     unit-tested, and used by nothing.
 *   - `POST /api/auth/webauthn/register` → the VERIFY half,
 *     wired to `verifyAttestation`.
 *   - `components/WebAuthnCeremony.tsx` → a complete, working
 *     browser ceremony (it calls `startRegistration(...)` and
 *     `startAuthentication(...)` via `@simplewebauthn/browser`).
 *   - `POST /api/auth/webauthn/register/challenge` → the
 *     CHALLENGE half, added alongside this component.
 *
 * But no page ever IMPORTED `WebAuthnCeremony`. It was dead
 * code: a 285-line component with zero call sites. The admin
 * could therefore read everything and change nothing — the
 * Playwright role walkthrough caught this as a hard BLOCKER on
 * every admin write.
 *
 * This component is the missing mount point. It renders the
 * ceremony in `register` mode against the new challenge
 * endpoint, and reports the outcome so the parent can surface a
 * success/error line.
 *
 * The ceremony is OPTIONAL in the UI sense: the admin can dismiss
 * it, but until a key is registered every admin write will fail
 * with 401 `webauthn_required`. So the copy says why it matters.
 *
 * All user-facing copy routes through `t(...)` per team.md's
 * Forbidden rule (no hardcoded strings).
 */

'use client';

import { useState } from 'react';
import { WebAuthnCeremony } from '@/components/WebAuthnCeremony';
import { t, type Language } from '@/lib/i18n/keys';

export interface AdminSecurityKeyProps {
  /** The admin's display language. */
  lang: Language;
}

export function AdminSecurityKey({ lang }: AdminSecurityKeyProps) {
  const [done, setDone] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  return (
    <section
      data-testid="admin-security-key"
      className="rounded-lg border p-5"
      style={{
        borderColor: 'var(--color-border)',
        background: 'var(--color-surface-card)',
      }}
    >
      <h2
        className="text-base font-semibold"
        style={{ color: 'var(--color-ink)' }}
      >
        {t('admin.webauthn.register.heading', null, lang)}
      </h2>
      <p
        className="mt-2 text-sm"
        style={{ color: 'var(--color-ink-secondary)' }}
      >
        {t('admin.webauthn.register.body', null, lang)}
      </p>

      <div className="mt-4">
        {done ? (
          <p
            data-testid="admin-security-key-done"
            className="text-sm"
            style={{ color: 'var(--color-success)' }}
          >
            {t('admin.webauthn.register.done', null, lang)}
          </p>
        ) : (
          <WebAuthnCeremony
            mode="register"
            challengeEndpoint="/api/auth/webauthn/register/challenge"
            verifyEndpoint="/api/auth/webauthn/register"
            initialBody={{ credentialName: 'Passkey' }}
            lang={lang}
            onSuccess={() => {
              setErrorCode(null);
              setDone(true);
            }}
            onError={(code) => {
              setErrorCode(code);
              setDone(false);
            }}
          />
        )}
      </div>

      {errorCode ? (
        <p
          data-testid="admin-security-key-error"
          className="mt-3 text-sm"
          style={{ color: 'var(--color-danger)' }}
        >
          {t('admin.webauthn.register.error', null, lang)}
        </p>
      ) : null}
    </section>
  );
}

export default AdminSecurityKey;
