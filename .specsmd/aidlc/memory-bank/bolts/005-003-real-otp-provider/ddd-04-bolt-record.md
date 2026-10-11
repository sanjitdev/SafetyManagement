---
bolt: 005-003-real-otp-provider
unit: 003-real-otp-provider
intent: 005-admin-city-setup
phase: construction
type: ddd-construction-bolt
status: done
created: 2026-10-12T18:30:00Z
updated: 2026-10-12T19:15:00Z
---

# Bolt 005-003 — Real OTP SMS Provider — Stage 5: Bolt Record

## Scope shipped

- `lib/auth/otp-provider/types.ts` — `OtpProvider` interface
  + `OtpResult` discriminated union + `OtpError`
  string-literal union.
- `lib/auth/otp-provider/stub.ts` — `StubProvider` (dev /
  test). Always returns
  `{ delivered: true, providerMessageId: 'stub-{code}' }`;
  logs the code to `console.info`.
- `lib/auth/otp-provider/twilio.ts` — `TwilioProvider` (real,
  prod). Reads the three env vars at construction; throws on
  missing creds. 3-attempt retry on 5xx with `[100, 200, 400]`
  ms backoff; immediate fail on 4xx. Constructor takes an
  optional `factory` + `sleep` for Vitest injection.
- `lib/auth/otp-provider/index.ts` — `getOtpProvider()` factory
  keyed on `process.env.OTP_PROVIDER`; caches the singleton
  for the process lifetime; throws on unknown values.
  `__resetOtpProviderForTests` clears the cache (test seam).
- `lib/auth/otp.ts` — public `sendOtp(phone, code, actorId)`
  added. Never throws; on failure writes an `AuditEntry` with
  `entityType: 'user'`, `action: 'otp_send_failed'`,
  `afterValue: { phone, provider, error }`. The `actorId`
  is the citizen's `userId` (third arg).
- `app/api/v1/auth/send-otp/route.ts` — wires
  `await sendOtp(phone, code, user.id)` after the `OtpCode`
  row is persisted. A `{ delivered: false }` result returns
  `502 sms_provider_failure`; the existing
  `user.otp_issued` audit row is preserved.
- `.env.example` — replaced the `OTP_FROM="CityFix"` placeholder
  with the four-line Twilio block (`TWILIO_ACCOUNT_SID`,
  `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`) + the rewritten
  `OTP_PROVIDER` comment.
- `package.json` — `twilio@^4.23.0` dependency added.
- `standards/decision-index.md` — ADR-012 filed (Context,
  Decision, Consequences, Alternatives rejected, Deferred).
- `lib/platform/audit.ts` — unchanged. The closed
  `entityType` union is preserved; the failure audit row uses
  `'user'` per Stage 1's decision.

## Tests added

| File | Count | What it pins |
|------|-------|---------------|
| `tests/unit/otp-provider.test.ts` | 18 | StubProvider (3): always-delivered, console.info, name. TwilioProvider env validation (4): throws on each missing env var, calls `messages.create` with the right shape. TwilioProvider retry policy (3): 5xx × 2 then 200 → 3 attempts; 5xx exhausted → `twilio_api_error`; 4xx → no retry. Factory (5): unset / `stub` / `twilio` / unknown throws / caches. `sendOtp` public helper (3): success path; provider_misconfigured on constructor throw; failure-audit shape. |

## Verification

```
npx tsc --noEmit     → clean for the bolt's own code
                        (the 16 pre-existing errors in
                        dispatcher/dedupFlag/crew remain
                        out of scope and did not regress)
npm run test:unit    → 235/235 (was 217/217; +18 new
                        from `otp-provider.test.ts`)
npm run test:mockups → 15/15 (no UI changes; bolt is
                        library-level)
curl -fs /            → 200 (no new routes)
```

Manual smoke (per Stage 2): `OTP_PROVIDER=twilio` with no
creds set + POST `/api/v1/auth/send-otp` → the
`TwilioProvider` constructor throws; `sendOtp` catches
and returns `provider_misconfigured`; the audit row
records `action: 'otp_send_failed', error:
'provider_misconfigured'`; the route returns
`502 sms_provider_failure`.

## Acceptance mapping (ADM-006 → evidence)

| # | Criterion | Evidence |
|---|-----------|----------|
| 1 | `OTP_PROVIDER=stub` (or unset) → `{ delivered: true, providerMessageId: 'stub-{code}' }`; logs to `console.info` | `StubProvider.send` (`tests/unit/otp-provider.test.ts` "always returns delivered: true" + "logs the code") |
| 2 | `OTP_PROVIDER=twilio` + creds → calls `messages.create({ to, from, body: 'Your CityFix code is {code}' })`; returns `{ delivered: true, providerMessageId: message.sid }` | `TwilioProvider.send` (`tests/unit/otp-provider.test.ts` "calls messages.create with to / from / body when env is complete") |
| 3 | 5xx × 2 then 200 → retry 3 times (100/200/400 ms backoff), 3rd succeeds | `tests/unit/otp-provider.test.ts` "retries 3 times on 5xx then succeeds on the 3rd attempt" — asserts `create` called 3×, `sleeps === [100, 200]`, result `delivered: true` |
| 4 | 4xx → no retry, `{ delivered: false, error: 'twilio_api_error' }` + audit `otp_send_failed` (entityType `user`) | `tests/unit/otp-provider.test.ts` "does NOT retry on 4xx" + "returns delivered:false with twilio_api_error when retries are exhausted" + the `sendOtp` helper's audit-on-failure path |
| 5 | `OTP_PROVIDER=twilio` but `TWILIO_AUTH_TOKEN` missing → constructor throws `Error: OTP_PROVIDER=twilio requires TWILIO_AUTH_TOKEN`; the caller sees the error and writes `action: 'otp_send_failed', error: 'provider_misconfigured'` | `tests/unit/otp-provider.test.ts` "throws on missing TWILIO_AUTH_TOKEN at construction" + "records provider_misconfigured when the provider constructor throws" |

## Refinements over the unit-brief

- The unit-brief referenced `lib/auth/otp.ts:53 sendOtp(phone, code)`
  as a pre-existing public API to preserve. The file shipped
  with only `generateOtp` / `hashOtp` / `verifyOtp`; the
  `sendOtp` helper is **new** in this bolt. The downstream
  cost is a single new call site in
  `app/api/v1/auth/send-otp/route.ts`.
- The public `sendOtp` takes a third `actorId` arg (not in
  the unit-brief). The third arg is the citizen's `userId`,
  used as the audit row's `entityId`. This is the
  minimum-surface addition that keeps the
  `AuditWriteInput.entityType` union closed (Stage 1
  decision; ADR-012 Alternatives Rejected, item E).
- The Twilio SDK is loaded via `require('twilio')` inside
  a `defaultFactory` so the package is only evaluated when
  a `TwilioProvider` is actually constructed. The
  `StubProvider` path has no Twilio dependency at runtime.

## Out-of-scope follow-ups

- Bulk24 / SSL Wireless / Meta Cloud API providers — the
  factory's `case` statement is the integration point
  (one line per provider).
- `libphonenumber-js` phone validation in the Twilio
  provider — v1.1 (per the unit-brief's out-of-scope list).
- OTP delivery rate monitoring (CloudWatch alarm on
  `OtpResult.delivered === false`) — v1.1 ops enhancement;
  the audit log already records the failure.
- Per-message cost accounting (Twilio's `price` /
  `priceUnit`) — v1.1 bolt.
- Ops runbook checklist: production MUST set
  `OTP_PROVIDER=twilio`; the `OTP_PROVIDER=stub` default is
  a dev safety only. Lands in Bolt 005-004's audit dashboard
  filter UI as a "provider is stub" alert.
