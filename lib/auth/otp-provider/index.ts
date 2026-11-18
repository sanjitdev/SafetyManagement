/**
 * OTP provider factory (lib/auth/otp-provider/index.ts).
 *
 * Bolt 005-003 (Intent 005, Unit 003, Story ADM-006):
 * the single entry point for resolving an OtpProvider
 * implementation. Keyed on `process.env.OTP_PROVIDER`.
 *
 * ADR-012 contract:
 *   - `stub` (default)   — StubProvider. REJECTED in a production
 *     build — see `assertProviderAllowedInProduction` below.
 *   - `twilio`           — TwilioProvider
 *   - unknown → throw `Error: Unknown OTP_PROVIDER: <name>`
 *
 * The provider is constructed once per Node process
 * (module-singleton cache). Env-var changes after the
 * first call require a process restart (documented in
 * the runbook note in
 * `bolts/005-003-real-otp-provider/ddd-02-technical-design.md`).
 *
 * `__resetOtpProviderForTests` is the documented test
 * seam; production code MUST NOT call it.
 */

import { StubProvider } from './stub';
import { TwilioProvider } from './twilio';
import type { OtpProvider } from './types';

let cached: OtpProvider | null = null;

/**
 * The stub provider is a DEVELOPMENT tool.
 *
 * `StubProvider.send()` reports `delivered: true` and `console.info`s
 * the code — it never sends an SMS. A production deployment running
 * it therefore looks like it is working while every login fails for
 * real users, and (before the `dev_code` guard in the send-otp route)
 * handed the plaintext code to whoever asked for it.
 *
 * So the stub is rejected in a production build. The failure is
 * deliberately LOUD: a missing `OTP_PROVIDER` env var should stop
 * the deployment, not silently downgrade it to a no-op provider.
 *
 * The check lives INSIDE `getOtpProvider()` rather than at module
 * load, for the same reason `lib/platform/db-guard.ts` is lazy:
 * Vercel runs `next build` in a separate process, and a
 * module-load throw would fail the build instead of the request.
 * `getOtpProvider()` is only ever called on a request.
 */
function assertProviderAllowedInProduction(name: string): void {
  if (name !== 'stub') return;
  if (process.env.NODE_ENV !== 'production') return;
  throw new Error(
    'OTP_PROVIDER=stub is not allowed in production — set OTP_PROVIDER=twilio ' +
      'with TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER.',
  );
}

export function getOtpProvider(): OtpProvider {
  if (cached) return cached;
  const name = process.env.OTP_PROVIDER ?? 'stub';
  switch (name) {
    case 'stub':
      assertProviderAllowedInProduction(name);
      cached = new StubProvider();
      break;
    case 'twilio':
      cached = new TwilioProvider();
      break;
    default:
      throw new Error(`Unknown OTP_PROVIDER: ${name}`);
  }
  return cached;
}

/**
 * Test-only seam: clear the cached provider so the next
 * `getOtpProvider()` call re-reads `process.env.OTP_PROVIDER`
 * and reconstructs. Production code MUST NOT call this.
 */
export function __resetOtpProviderForTests(): void {
  cached = null;
}
