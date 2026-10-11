/**
 * OTP (one-time password) helpers (lib/auth/otp.ts).
 *
 * PLAT-REQ-002 acceptance: SMS-based, ≤ 5 min TTL, single-use, retry-cap.
 *
 * We store the HASH of the OTP, not the plaintext (same posture as passwords).
 * The library `otpauth` handles TOTP generation/verification — but for SMS we
 * generate a 6-digit random code and store its argon2 hash, then verify by
 * re-hashing the user-supplied code and constant-time comparing.
 *
 * Hashing goes through `hashSecret` (not `hashPassword`) — OTPs are short
 * and do not need to satisfy the password policy guard.
 *
 * Bolt 005-003 (Intent 005, Unit 003, Story ADM-006): adds
 * the public `sendOtp(phone, code, actorId)` which delegates
 * to the provider-agnostic factory at `lib/auth/otp-provider/`.
 * On a `{ delivered: false }` result the helper writes an
 * `AuditEntry` with `entityType: 'user'`, `action:
 * 'otp_send_failed'`, `afterValue: { phone, provider,
 * error }` (per ADR-012). The `actorId` is the citizen's
 * `userId` from the registration flow.
 */

import { hashSecret, verifyPassword } from './password';
import { getOtpProvider } from './otp-provider';
import type { OtpResult } from './otp-provider/types';
import { writeAudit } from '@/lib/platform/audit';

export type { OtpResult } from './otp-provider/types';

export const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_LENGTH = 6;

export function generateOtp(): string {
  // Generate a 6-digit code (leading zeros allowed).
  const n = Math.floor(Math.random() * 1_000_000);
  return n.toString().padStart(OTP_LENGTH, '0');
}

export async function hashOtp(code: string): Promise<string> {
  return hashSecret(code);
}

export async function verifyOtp(
  hash: string,
  candidate: string,
): Promise<boolean> {
  return verifyPassword(hash, candidate);
}

/**
 * Send the OTP code to the citizen's phone via the
 * configured provider (ADR-012). On failure (delivered:
 * false OR a thrown error from a misconfigured provider),
 * records an `AuditEntry` with
 * `action: 'otp_send_failed'`.
 *
 * The `actorId` is the citizen's `userId` — used as the
 * audit row's `entityId` (entityType `user`).
 *
 * Never throws: a thrown error (missing env vars, unknown
 * provider, network failure) is caught and surfaced as
 * `{ delivered: false, error: 'provider_misconfigured' }`
 * so the route handler can return a clean 502 without a
 * try/catch ladder.
 */
export async function sendOtp(
  phone: string,
  code: string,
  actorId: string,
): Promise<OtpResult> {
  // Resolve the provider once and reuse its `name` for
  // the audit row. Calling `getOtpProvider()` twice in a
  // failure path would re-throw the constructor error
  // when the provider is misconfigured.
  let providerName: string;
  let result: OtpResult;
  try {
    const provider = getOtpProvider();
    providerName = provider.name;
    result = await provider.send(phone, code);
  } catch (e) {
    // TwilioProvider throws on missing env vars; the
    // factory throws on unknown OTP_PROVIDER. Both are
    // programmer errors at boot, but a runtime
    // misconfiguration surfaces here. The audit row
    // records the structured code; the exception is
    // logged for ops follow-up.
    console.error('[otp:send] provider threw', e);
    providerName = 'unknown';
    result = { delivered: false, error: 'provider_misconfigured' };
  }
  if (!result.delivered) {
    try {
      await writeAudit({
        entityType: 'user',
        entityId: actorId,
        action: 'otp_send_failed',
        actorId,
        afterValue: {
          phone,
          provider: providerName,
          error: result.error,
        },
      });
    } catch (auditErr) {
      // The audit write must not mask the OTP failure
      // surfacing to the caller. Log + continue.
      console.error('[otp:send] audit write failed', auditErr);
    }
  }
  return result;
}
