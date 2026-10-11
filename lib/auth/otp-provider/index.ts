/**
 * OTP provider factory (lib/auth/otp-provider/index.ts).
 *
 * Bolt 005-003 (Intent 005, Unit 003, Story ADM-006):
 * the single entry point for resolving an OtpProvider
 * implementation. Keyed on `process.env.OTP_PROVIDER`.
 *
 * ADR-012 contract:
 *   - `stub` (default)   — StubProvider
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

export function getOtpProvider(): OtpProvider {
  if (cached) return cached;
  const name = process.env.OTP_PROVIDER ?? 'stub';
  switch (name) {
    case 'stub':
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
