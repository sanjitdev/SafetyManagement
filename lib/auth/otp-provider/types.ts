/**
 * OTP provider types (lib/auth/otp-provider/types.ts).
 *
 * Bolt 005-003 (Intent 005, Unit 003, Story ADM-006):
 * the provider-agnostic contract for SMS delivery of
 * a 6-digit OTP code. The citizen auth path calls
 * `sendOtp(phone, code, actorId)` (lib/auth/otp.ts),
 * which delegates to `getOtpProvider().send(phone, code)`
 * (lib/auth/otp-provider/index.ts).
 *
 * The `OtpResult` is a discriminated union on `delivered`.
 * `OtpError` is a string-literal union — a new provider
 * adds its own value without breaking existing callers.
 * The audit row's `afterValue.error` carries the same
 * string verbatim (lib/platform/audit.ts).
 *
 * `OtpProvider` is the only method surface: `send`. The
 * `name` is used for the audit row's `afterValue.provider`
 * and for `console.error` breadcrumbs in failure paths.
 */

export type OtpError =
  | 'twilio_api_error'
  | 'provider_misconfigured'
  | 'unknown_phone'
  | 'network_error';

export type OtpResult =
  | { delivered: true; providerMessageId: string }
  | { delivered: false; error: OtpError };

export interface OtpProvider {
  readonly name: string;
  send(phone: string, code: string): Promise<OtpResult>;
}
