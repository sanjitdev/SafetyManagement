/**
 * Stub OTP provider (lib/auth/otp-provider/stub.ts).
 *
 * Bolt 005-003 (Intent 005, Unit 003, Story ADM-006):
 * the dev / test OTP provider. Always returns
 * `{ delivered: true, providerMessageId: 'stub-{code}' }`
 * and logs the code to `console.info` for dev visibility.
 *
 * No env vars. No async work. No side-effects beyond
 * the single `console.info`. The v1 dev persona's path;
 * the audit row's `afterValue.provider` is `"stub"` so
 * the Bolt 005-004 dashboard can filter test traffic.
 */

import type { OtpProvider, OtpResult } from './types';

export class StubProvider implements OtpProvider {
  readonly name = 'stub';

  async send(phone: string, code: string): Promise<OtpResult> {
    console.info(`[otp:stub] code=${code} phone=${phone}`);
    return { delivered: true, providerMessageId: `stub-${code}` };
  }
}
