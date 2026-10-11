---
story: ADM-006-real-otp
unit: 003-real-otp-provider
intent: 005-admin-city-setup
phase: construction
status: ready
created: 2026-10-12T05:30:00Z
updated: 2026-10-12T05:30:00Z
---

# Story: ADM-006 — Real OTP SMS Provider

> Replace the v1 OTP stub
> (`lib/auth/otp.ts → sendOtp(phone,
> code)` returns immediately in dev)
> with a real provider wired through
> env vars. Provider-agnostic: a typed
> `OtpProvider` interface + a factory
> keyed on the `OTP_PROVIDER` env var.
> v1 ships `twilio` as the recommended
> real provider.

## Given / When / Then

### Acceptance 1 — Stub provider

**Given** `OTP_PROVIDER=stub` (or
unset, the dev default)
**When** the citizen's registration
flow calls `sendOtp(phone, code)`
**Then** the stub provider is used
(the code is logged to `console.info`
for dev visibility; the result is
`{ delivered: true, providerMessageId:
'stub-{code}' }`).

### Acceptance 2 — Twilio provider

**Given** `OTP_PROVIDER=twilio` AND
`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
`TWILIO_FROM_NUMBER` are all set
**When** `sendOtp('+8801712345678',
'123456')` is called
**Then** the Twilio SDK's
`messages.create({ to: '+8801712345678',
from: <from>, body: 'Your CityFix code
is 123456' })` is invoked and the
result is `{ delivered: true,
providerMessageId: <message.sid> }`.

### Acceptance 3 — Twilio retry on 5xx

**Given** the Twilio API returns 503
on the first two attempts and 200 on
the third
**When** `sendOtp(...)` is called
**Then** the implementation retries 3
times (100ms / 200ms / 400ms backoff)
and the third attempt succeeds; the
result is `delivered: true`.

### Acceptance 4 — Twilio fail on 4xx

**Given** the Twilio API returns 400
(invalid phone)
**When** `sendOtp(...)` is called
**Then** the implementation does NOT
retry (4xx is permanent), the result
is `{ delivered: false, error:
'twilio_api_error' }`, and an
`AuditEntry` is written with
`action: 'otp_send_failed'`.

### Acceptance 5 — Missing env vars

**Given** `OTP_PROVIDER=twilio` but
`TWILIO_AUTH_TOKEN` is unset
**When** the provider is constructed
**Then** the constructor throws
`Error: OTP_PROVIDER=twilio requires
TWILIO_AUTH_TOKEN`. The `sendOtp`
caller sees the error and the
`AuditEntry` records
`action: 'otp_send_failed', error:
'provider_misconfigured'`.

## Technical Notes

- The provider interface is:
  ```
  interface OtpProvider {
    readonly name: string;
    send(phone: string, code: string):
      Promise<OtpResult>;
  }
  ```
- The factory is keyed on
  `process.env.OTP_PROVIDER` and
  throws on unknown values (no
  silent fallback — the dev persona
  must opt in to the stub
  explicitly).
- Twilio's free tier is $15 trial
  credit; the v1 pilot's per-message
  cost is well within the trial
  budget. v1.1 may add bulk24 or
  SSL Wireless as a cheaper
  alternative for high-volume
  cities.
- No hard-coded secrets in the
  repo (per `team.md`). The
  Twilio SDK reads from
  `process.env` at construction
  time.
- The existing `lib/auth/otp.ts`
  test (`tests/unit/otp.test.ts`,
  inherited from Intent 001) is
  unchanged; the new test
  `tests/unit/otp-provider.test.ts`
  covers the provider-specific
  surface.

## Cross-references

- `lib/auth/otp-provider/{types,stub,twilio,index}.ts` —
  4 new files.
- `lib/auth/otp.ts` — the public
  `sendOtp` wrapper is the only
  change (delegate to
  `getOtpProvider().send(...)`).
- `.env.example` — 4 new env vars
  (`OTP_PROVIDER`, `TWILIO_ACCOUNT_SID`,
  `TWILIO_AUTH_TOKEN`,
  `TWILIO_FROM_NUMBER`).
- `tests/unit/otp-provider.test.ts` —
  Vitest unit test (new).
- `package.json` — `twilio` v4.x
  dependency.
- `decision-index.md` ADR-005 —
  four-role model + auth
  contracts (the OTP path is
  the citizen's auth path;
  WebAuthn is the admin's).
