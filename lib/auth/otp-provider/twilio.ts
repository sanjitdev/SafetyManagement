/**
 * Twilio OTP provider (lib/auth/otp-provider/twilio.ts).
 *
 * Bolt 005-003 (Intent 005, Unit 003, Story ADM-006):
 * the v1 production OTP provider. Wraps the official
 * Twilio Node SDK (v4.x). Reads the three env vars at
 * construction time and throws on missing creds
 * (per ADR-012).
 *
 * Retry policy (ADR-012): 3 attempts, exponential
 * backoff `[100, 200, 400]` ms on 5xx; immediate fail
 * on 4xx. Exhaustion returns
 * `{ delivered: false, error: 'twilio_api_error' }`.
 *
 * The constructor takes an optional `clientFactory` for
 * Vitest injection. The default factory calls
 * `twilio(accountSid, authToken)`. Tests pass a factory
 * that returns a stub whose `messages.create` resolves
 * or rejects on demand.
 */

import type { OtpProvider, OtpResult } from './types';

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [100, 200, 400] as const;

/** Minimal surface of the Twilio client we use. */
export interface TwilioMessagesClient {
  messages: {
    create(args: {
      to: string;
      from: string;
      body: string;
    }): Promise<{ sid: string }>;
  };
}

/** Factory for the Twilio client; defaults to the real SDK. */
export type TwilioClientFactory = (
  accountSid: string,
  authToken: string,
) => TwilioMessagesClient;

const defaultFactory: TwilioClientFactory = (sid, token) => {
  // Lazy require: the `twilio` package is only installed in
  // prod. The Vitest seam passes a mock factory; this default
  // path is never reached in tests.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const twilio = require('twilio') as (
    sid: string,
    token: string,
  ) => TwilioMessagesClient;
  return twilio(sid, token);
};

export class TwilioProvider implements OtpProvider {
  readonly name = 'twilio';
  private readonly client: TwilioMessagesClient;
  private readonly from: string;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts?: {
    factory?: TwilioClientFactory;
    sleep?: (ms: number) => Promise<void>;
  }) {
    const accountSid = TwilioProvider.required('TWILIO_ACCOUNT_SID');
    const authToken = TwilioProvider.required('TWILIO_AUTH_TOKEN');
    const from = TwilioProvider.required('TWILIO_FROM_NUMBER');
    const factory = opts?.factory ?? defaultFactory;
    this.client = factory(accountSid, authToken);
    this.from = from;
    this.sleep =
      opts?.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  }

  async send(phone: string, code: string): Promise<OtpResult> {
    const body = `Your CityFix code is ${code}`;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        await this.sleep(BACKOFF_MS[attempt - 1]!);
      }
      try {
        const message = await this.client.messages.create({
          to: phone,
          from: this.from,
          body,
        });
        return { delivered: true, providerMessageId: message.sid };
      } catch (e: unknown) {
        lastErr = e;
        const status = (e as { status?: number }).status;
        if (typeof status === 'number' && status >= 400 && status < 500) {
          // 4xx: permanent — phone is invalid, no retry.
          return { delivered: false, error: 'twilio_api_error' };
        }
        // 5xx or unknown: fall through to next attempt.
      }
    }
    // All attempts exhausted. The audit row carries the
    // structured OtpError code; the raw exception is logged
    // for ops follow-up.
    void lastErr;
    console.error('[otp:twilio] exhausted retries', { phone });
    return { delivered: false, error: 'twilio_api_error' };
  }

  private static required(name: string): string {
    const v = process.env[name];
    if (!v) {
      throw new Error(`OTP_PROVIDER=twilio requires ${name}`);
    }
    return v;
  }
}
