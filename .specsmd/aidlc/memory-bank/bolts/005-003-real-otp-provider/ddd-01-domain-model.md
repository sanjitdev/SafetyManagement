---
bolt: 005-003-real-otp-provider
unit: 003-real-otp-provider
intent: 005-admin-city-setup
phase: construction
type: ddd-construction-bolt
status: in-progress
created: 2026-10-12T18:30:00Z
updated: 2026-10-12T18:30:00Z
---

# Bolt 005-003 — Real OTP SMS Provider — Stage 1: Domain Model

## Refinement over the unit-brief

The unit-brief's `lib/auth/otp.ts:53 sendOtp(phone, code)` reference
implies a pre-existing public helper to preserve. Inspection of
`lib/auth/otp.ts` (2026-10-12) shows that helper **does not exist** yet
— the file ships only `generateOtp` / `hashOtp` / `verifyOtp` and
`OTP_TTL_MS` / `OTP_MAX_ATTEMPTS` / `OTP_LENGTH` constants. The brief's
"public API preserved" framing is therefore forward-looking; this bolt
**introduces** the public `sendOtp(phone, code)` API in
`lib/auth/otp.ts` and **adds** the provider-factory plumbing underneath.

The downstream impact is small: the citizen registration flow in
`app/api/v1/auth/register/route.ts` will need one new call site for
`sendOtp(...)` (acceptance will be re-verified end-to-end in Stage 4);
no other call site exists today. Bolt 003-001's dispatcher auth + Bolt
004-001's crew auth use the **session** path, not the OTP path, so they
are unaffected.

## Domain vocabulary (new)

| Term | Type | Notes |
|------|------|-------|
| `OtpProvider` | interface | `name: string` + `send(phone, code): Promise<OtpResult>`. Provider-agnostic; Twilio is v1's recommended concrete impl. |
| `OtpResult` | discriminated union | `{ delivered: true, providerMessageId: string }` \| `{ delivered: false, error: 'twilio_api_error' \| 'provider_misconfigured' \| 'unknown_phone' \| 'network_error' }`. Discriminator = `delivered`. |
| `StubProvider` | class implements `OtpProvider` | Always returns `{ delivered: true, providerMessageId: 'stub-{code}' }`; logs the code to `console.info` for dev visibility. The v1 dev persona's default. |
| `TwilioProvider` | class implements `OtpProvider` | Reads `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` at construction. Calls Twilio `messages.create` with `to: phone, from: TWILIO_FROM_NUMBER, body: 'Your CityFix code is {code}'`. Retries 3 times (100/200/400 ms) on 5xx; immediate fail on 4xx. |
| `getOtpProvider()` | factory function | Keyed on `process.env.OTP_PROVIDER` (`stub` \| `twilio` \| …). Throws `Error: Unknown OTP_PROVIDER: <name>` on unknown values — no silent fallback. The dev persona must opt in to stub explicitly. |
| `sendOtp(phone, code)` | public API in `lib/auth/otp.ts` | `async (phone: string, code: string): Promise<OtpResult>`. Body: `const result = await getOtpProvider().send(phone, code); if (!result.delivered) { writeAudit({ action: 'otp_send_failed', ... }) } return result;`. Preserves the public signature; flips the implementation to the factory. |

## Audit-row decision

The unit-brief's `OtpResult.error` + `writeAudit({ action:
'otp_send_failed' })` extension requires a row in `AuditEntry`. The
existing `AuditWriteInput.entityType` union in
`lib/platform/audit.ts` is:

```
'ticket' | 'city' | 'category' | 'department' | 'ward' | 'user'
```

The cleanest fit is **`entityType: 'user'`** + `entityId: <citizen
userId>`. The semantic is "this user failed to receive an OTP at this
phone" — a user-attached event, not a per-OTP row (the OTP hash lives
in `OtpCode`; once it's expired and consumed, the failure is historical
context, not a state change on the OTP itself). `action: 'otp_send_failed'`
plus `afterValue: { phone, provider: 'twilio' | 'stub', error,
providerMessageId? }` gives the Bolt 005-004 audit dashboard enough
shape to filter on the new action.

This avoids widening the `entityType` union for a one-off event type
and reuses the existing union. **Accepted**, recorded as a Stage 1
decision; not a Stage 2 ADR (the union widening was never ratified
and the closed union is a deliberate design choice).

## Boundary contracts

- `lib/auth/otp.ts: sendOtp(phone, code): Promise<OtpResult>` —
  the only outward-facing change. `phone` is E.164 (`+880…`); callers
  must format before calling (no `libphonenumber-js` in v1 per the
  unit-brief's out-of-scope list). `code` is the 6-digit plaintext the
  caller has just generated via `generateOtp()`; the helper does NOT
  hash (the hash goes to `OtpCode` storage, separate concern).
- `lib/auth/otp-provider/types.ts: OtpProvider` — the
  provider contract. `send(phone, code)` is the only method. `name` is
  a free-form string (used by the audit row's `afterValue.provider`
  and by `console.error` in failure paths).
- `lib/auth/otp-provider/index.ts: getOtpProvider()` — the factory.
  Caches the instance for the lifetime of the process (Node module
  cache; the env vars are read once at first call, then never again
  — Twilio's constructor reads the env vars at `messages.create` time
  per the SDK's contract, so a runtime env-var change would require
  a process restart, which is the prod posture).

## Pre-existing surface to leave alone

- `lib/auth/otp.ts: generateOtp` / `hashOtp` / `verifyOtp` —
  unchanged. The `OtpCode` row write path in the registration route
  hashes the code via `hashOtp`; the verify path uses `verifyOtp`. The
  bolt adds `sendOtp` as a sibling; it does not touch these three.
- `lib/platform/audit.ts` — unchanged (the union is preserved per
  the decision above).
- `app/api/v1/auth/register/route.ts` — Stage 4 will add a single
  `await sendOtp(phone, code)` call site (post-`OtpCode.create`,
  pre-`201 Created`). The route's `Zod` validation, the `OtpCode`
  table write, and the session mint are unchanged.

## Behavioural acceptance (mirroring ADM-006, restated for the v1 source)

| # | Criterion | Implementation |
|---|-----------|----------------|
| 1 | `OTP_PROVIDER=stub` (or unset) → `{ delivered: true, providerMessageId: 'stub-{code}' }`; logs to `console.info` | `StubProvider.send` |
| 2 | `OTP_PROVIDER=twilio` + creds → calls `messages.create({ to, from, body: 'Your CityFix code is {code}' })`, returns `{ delivered: true, providerMessageId: message.sid }` | `TwilioProvider.send` |
| 3 | 5xx × 2 then 200 → retry 3 times (100/200/400 ms), 3rd succeeds | `TwilioProvider.send` retry loop |
| 4 | 4xx → no retry, `{ delivered: false, error: 'twilio_api_error' }` + audit `otp_send_failed` (entityType `user`) | `TwilioProvider.send` 4xx branch + `sendOtp` failure audit |
| 5 | `OTP_PROVIDER=twilio` but `TWILIO_AUTH_TOKEN` missing → constructor throws `Error: OTP_PROVIDER=twilio requires TWILIO_AUTH_TOKEN`; the caller sees the error and writes `action: 'otp_send_failed', error: 'provider_misconfigured'` | `TwilioProvider` constructor + `sendOtp` catch |

## Risks

- **Twilio SDK's env-var read at `messages.create` time** (not at
  constructor time) is undocumented in the public typings; the
  Stage 2 design will assert it via the test mock's call order
  before Stage 3 implements the constructor.
- **Audit row churn**: every OTP retry logs no audit row (only the
  terminal failure or success does), so the audit dashboard's
  per-city OTP-failure count is a true O(1) signal.
- **Provider-agnostic `name` field**: a future Bulk24 / SSL Wireless
  provider will be a one-line `case` in the factory; no further
  changes to `OtpProvider` or `OtpResult` are required.

## Ready-for-checklist (Stage 1 → Stage 2)

- [x] Public API shape: `sendOtp(phone, code): Promise<OtpResult>`
- [x] Provider interface: `OtpProvider` with `name` + `send`
- [x] Stub + Twilio concrete providers identified
- [x] Factory + cache decision: module-singleton, env-read once
- [x] Audit row decision: `entityType: 'user'` + `action: 'otp_send_failed'`
- [x] Pre-existing surface preserved: `generateOtp` / `hashOtp` / `verifyOtp` / `OtpCode` schema / `AuditWriteInput` union
- [x] All 5 ADM-006 acceptance criteria traced to a module + a path
- [ ] Stage 2 will confirm the Twilio SDK call signature + the
      `libphonenumber-js` deferral note in `.env.example`
