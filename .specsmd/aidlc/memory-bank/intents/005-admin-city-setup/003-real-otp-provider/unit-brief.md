---
unit: 003-real-otp-provider
intent: 005-admin-city-setup
phase: construction
status: complete
created: 2026-10-12T05:30:00Z
updated: 2026-10-12T19:15:00Z
---

# Unit 003 — Real OTP SMS Provider (Intent 005)

## Scope

Replace the v1 OTP stub (`lib/auth/otp.ts →
sendOtp(phone, code)` returns immediately in
dev) with a real provider wired through env
vars. The bolt is library-level — no new
pages, no new API routes, no new
Playwright spec. The end-to-end behaviour
is already covered by the citizen's
registration flow (Intent 002 Unit 001);
this unit's bolt is the secrets + the
provider switch.

The choice between providers (Twilio vs
SSL Wireless vs bulk24 vs Meta's Cloud
API) is the pilot city's call, not a
framework decision. The unit's design is
provider-agnostic: a typed `OtpProvider`
interface + a factory keyed on the
`OTP_PROVIDER` env var. v1 ships
`twilio` as the recommended real
provider (the v1.1 path keeps the same
factory pattern; swapping providers is
an env-var change).

## Stories owned

| Slug | Title | Status |
|------|-------|--------|
| ADM-006 | real-otp | ready |

## Bolt candidate

`005-003-real-otp-provider` (one
`ddd-construction-bolt`).

## Reuse references

- `lib/auth/otp.ts:53` `sendOtp(phone, code)`
  — the existing `sendOtp` is preserved
  as the public API. The new bolt wraps
  the implementation in a provider
  factory.
- `lib/auth/otp.ts:88` `OtpResult` —
  the return type (`{ delivered: boolean,
  providerMessageId?: string, error? }`).
  Preserved.
- `.env.example` — the env-var
  additions land here.
- `tests/unit/otp.test.ts` (existing
  in Intent 001) — the existing test
  continues to pass with the new
  provider under the hood.

## Lib (delta)

- **New**: `lib/auth/otp-provider/types.ts` —
  ```
  export interface OtpProvider {
    readonly name: string;
    send(phone: string, code: string): Promise<OtpResult>;
  }
  ```
- **New**: `lib/auth/otp-provider/stub.ts` —
  the dev / test provider. Always
  returns `{ delivered: true,
  providerMessageId: 'stub-{code}' }`.
  Logs the code to `console.info` for
  dev visibility (the v1 behaviour).
- **New**: `lib/auth/otp-provider/twilio.ts` —
  the real provider. Wraps
  `twilio` (the official Node SDK).
  Reads `TWILIO_ACCOUNT_SID`,
  `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`
  from env. Calls
  `client.messages.create({ to: phone,
  from: TWILIO_FROM_NUMBER, body:
  "Your CityFix code is {code}" })`.
  Returns `{ delivered: true,
  providerMessageId: message.sid }` on
  success; `{ delivered: false, error:
  'twilio_api_error' }` on failure.
  Exponential backoff (3 attempts,
  100ms / 200ms / 400ms) on transient
  errors (5xx); immediate fail on
  4xx (the phone is invalid; no retry).
- **New**: `lib/auth/otp-provider/index.ts` —
  the factory:
  ```
  export function getOtpProvider(): OtpProvider {
    const name = process.env.OTP_PROVIDER ?? 'stub';
    switch (name) {
      case 'stub': return new StubProvider();
      case 'twilio': return new TwilioProvider();
      default:
        throw new Error(`Unknown OTP_PROVIDER: ${name}`);
    }
  }
  ```
- **Modified**: `lib/auth/otp.ts` —
  the body of `sendOtp(phone, code)`
  becomes:
  ```
  const provider = getOtpProvider();
  const result = await provider.send(phone, code);
  if (!result.delivered) {
    writeAudit({ action: 'otp_send_failed', ... });
  }
  return result;
  ```
  The public signature is unchanged.

## Env vars (delta)

- **New** in `.env.example`:
  - `OTP_PROVIDER=stub` — `stub |
    twilio`. Default `stub` for dev.
  - `TWILIO_ACCOUNT_SID=` — only read
    when `OTP_PROVIDER=twilio`.
  - `TWILIO_AUTH_TOKEN=` — only read
    when `OTP_PROVIDER=twilio`.
  - `TWILIO_FROM_NUMBER=` — the
    E.164-formatted from-number (e.g.,
    `+15555550100`).
- **No hard-coded secrets** in the
  repo (per `team.md` + the tech
  audit's "no hard-coded secrets"
  rule). The Twilio SDK reads from
  `process.env` at construction time.

## Dependencies (delta)

- **New**: `twilio` (the official
  Node SDK). v4.x; tree-shakable; no
  native deps.

## Tests (delta)

- **Vitest**: `tests/unit/otp-provider.test.ts`
  (new). ~12 checks:
  - `getOtpProvider()` returns the
    stub when `OTP_PROVIDER` is
    unset / `stub`.
  - `getOtpProvider()` returns Twilio
    when `OTP_PROVIDER=twilio`.
  - `getOtpProvider()` throws on
    unknown values.
  - `StubProvider.send(...)` always
    returns `delivered: true`.
  - `TwilioProvider.send(...)` reads
    the env vars at construction time
    and throws on missing
    `TWILIO_AUTH_TOKEN`.
  - `TwilioProvider.send(...)` retries
    3 times on 5xx (the test uses an
    in-memory `fetch` mock that
    returns 503 twice then 200).
  - `TwilioProvider.send(...)` does
    not retry on 4xx.
  - `TwilioProvider.send(...)` calls
    `messages.create` with the right
    `from` / `to` / `body` shape (the
    test uses the Twilio SDK's
    `MockTwilio` helper).
- **Modified**: `tests/unit/otp.test.ts`
  (Intent 001) — continues to pass;
  the existing test stubs
  `getOtpProvider` to verify the
  public `sendOtp` contract end-to-end.

## Verification

- `npx tsc --noEmit` clean.
- `npm run test:unit` green (the
  existing `otp.test.ts` +
  `otp-provider.test.ts`).
- `npm run test:mockups` green (no UI
  changes; mockup baselines unaffected).
- `curl -fs http://localhost:3000/`
  200 (no new top-level routes).

## Out of scope (deferred)

- Bulk24 / SSL Wireless / Meta
  Cloud API providers. The factory
  pattern is ready to add them; the
  v1 pilot ships Twilio. Adding a
  second real provider is a
  one-line `case` in the factory.
- Phone-number format validation +
  carrier lookup. v1 trusts the
  citizen's input; v1.1 may add a
  `libphonenumber-js` validation
  step.
- OTP delivery rate monitoring (a
  CloudWatch alarm on
  `OtpResult.delivered === false`).
  The audit log already records the
  failure; the alarm is a v1.1
  observability enhancement.
- Cost / per-message accounting.
  The Twilio SDK returns `price` /
  `priceUnit` in the response; v1
  ignores them. A v1.1 bolt may add
  a per-city cost report.
