---
bolt: 005-003-real-otp-provider
unit: 003-real-otp-provider
intent: 005-admin-city-setup
phase: construction
type: ddd-construction-bolt
status: in-progress
created: 2026-10-12T18:30:00Z
updated: 2026-10-12T18:45:00Z
---

# Bolt 005-003 — Real OTP SMS Provider — Stage 2: Technical Design

## Module structure

```
lib/auth/otp-provider/
├── types.ts       — OtpProvider + OtpResult types
├── stub.ts        — StubProvider (dev / test)
├── twilio.ts      — TwilioProvider (real, prod)
└── index.ts       — getOtpProvider() factory
lib/auth/otp.ts    — + sendOtp(phone, code) public API
.env.example       — + TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
                     (OTP_FROM line renamed to TWILIO_FROM_NUMBER)
package.json       — + twilio@^4
tests/unit/otp-provider.test.ts  — new
app/api/v1/auth/send-otp/route.ts — + await sendOtp(phone, code) after OtpCode.create
```

## Type definitions

### `lib/auth/otp-provider/types.ts`

```ts
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
```

The discriminated union is the public contract. A consumer
narrows on `result.delivered`. `OtpError` is a string-literal
union (not a class hierarchy) because (a) the values map 1:1 to
`AuditEntry.afterValue.error` (a free-form string), (b) a future
provider adds its own value without touching the union, and
(c) it keeps the Vitest surface a flat `toBe(...)` matcher.

### `lib/auth/otp-provider/stub.ts`

```ts
import type { OtpProvider, OtpResult } from './types';

export class StubProvider implements OtpProvider {
  readonly name = 'stub';

  async send(phone: string, code: string): Promise<OtpResult> {
    // Dev visibility — never read the code from a real Twilio response
    console.info(`[otp:stub] code=${code} phone=${phone}`);
    return { delivered: true, providerMessageId: `stub-${code}` };
  }
}
```

The `providerMessageId` mirrors the Twilio shape so the consumer
can log the id uniformly. No env vars; no async work; no
side-effects beyond the single `console.info`.

### `lib/auth/otp-provider/twilio.ts`

```ts
import twilio, { type Twilio } from 'twilio';
import type { OtpProvider, OtpResult } from './types';

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [100, 200, 400]; // attempt 1, 2, 3 → wait 0/100/200ms before

export class TwilioProvider implements OtpProvider {
  readonly name = 'twilio';
  private readonly client: Twilio;
  private readonly from: string;

  constructor() {
    const accountSid = required('TWILIO_ACCOUNT_SID');
    const authToken  = required('TWILIO_AUTH_TOKEN');
    const from       = required('TWILIO_FROM_NUMBER');
    this.client = twilio(accountSid, authToken);
    this.from   = from;
  }

  async send(phone: string, code: string): Promise<OtpResult> {
    const body = `Your CityFix code is ${code}`;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt - 1]));
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
        // 5xx or network error: fall through to next attempt.
      }
    }
    // All attempts exhausted.
    void lastErr; // surfaced via console.error below; the audit row carries the
                  // provider name + error code, not the raw exception.
    console.error('[otp:twilio] exhausted retries', { phone });
    return { delivered: false, error: 'twilio_api_error' };
  }
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `OTP_PROVIDER=twilio requires ${name}`,
    );
  }
  return v;
}
```

The `required()` helper fires the constructor-time throw on
missing env vars (Stage 1 acceptance 5). The retry loop is
attempt 1 (no wait) → wait 100 ms → attempt 2 → wait 200 ms →
attempt 3 → wait 400 ms → attempt 4 if MAX_ATTEMPTS were 4; we
pin to 3 attempts total (per the unit-brief). The 4xx branch
returns immediately without a retry; the 5xx / unknown branch
falls through to the next attempt; exhaustion returns
`{ delivered: false, error: 'twilio_api_error' }`.

The `void lastErr;` is the deliberate audit posture: the
`AuditEntry.afterValue.error` is the structured code, not the
raw exception's message (which may contain PII from Twilio's
error response). The exception is logged to `console.error`
for ops follow-up; the audit row carries the structured
`OtpError` value.

### `lib/auth/otp-provider/index.ts`

```ts
import { StubProvider } from './stub';
import { TwilioProvider } from './twilio';
import type { OtpProvider } from './types';

let cached: OtpProvider | null = null;

export function getOtpProvider(): OtpProvider {
  if (cached) return cached;
  const name = process.env.OTP_PROVIDER ?? 'stub';
  switch (name) {
    case 'stub':   cached = new StubProvider();   break;
    case 'twilio': cached = new TwilioProvider(); break;
    default:
      throw new Error(`Unknown OTP_PROVIDER: ${name}`);
  }
  return cached;
}

/** Test seam — reset the cache between Vitest files. */
export function __resetOtpProviderForTests(): void {
  cached = null;
}
```

The module-singleton cache means a TwilioProvider is constructed
once per Node process; the env-var read happens once. The
`__resetOtpProviderForTests` is a documented test-only seam
(file-scoped prefix `__` to flag it as internal). Production
never calls it.

### `lib/auth/otp.ts` — the public API

The existing `generateOtp` / `hashOtp` / `verifyOtp` and the
three constants are preserved verbatim. The new `sendOtp`
sits at the bottom of the file:

```ts
import { writeAudit } from '@/lib/platform/audit';
import { getOtpProvider } from './otp-provider';
import type { OtpResult } from './otp-provider/types';

export type { OtpResult } from './otp-provider/types';

export async function sendOtp(
  phone: string,
  code: string,
  actorId: string,
): Promise<OtpResult> {
  let result: OtpResult;
  try {
    result = await getOtpProvider().send(phone, code);
  } catch (e) {
    // The TwilioProvider constructor throws on missing env vars.
    // The factory throws on unknown OTP_PROVIDER. Both are programmer
    // errors at boot time, but a misconfiguration at runtime surfaces
    // here and we record the failure for the audit dashboard.
    console.error('[otp:send] provider threw', e);
    result = { delivered: false, error: 'provider_misconfigured' };
  }
  if (!result.delivered) {
    await writeAudit({
      entityType: 'user',
      entityId: actorId,
      action: 'otp_send_failed',
      actorId,
      afterValue: {
        phone,
        provider: getOtpProvider().name,
        error: result.error,
      },
    });
  }
  return result;
}
```

**Signature change:** the public `sendOtp(phone, code, actorId)`
takes a third arg — the citizen's userId — so the audit row
can attach to the user (Stage 1 decision). The call site in
`app/api/v1/auth/send-otp/route.ts` already has `user.id` in
scope (line 79-84), so the wiring is one line. The bolt
preserves the brief's "preserved public API" intent in spirit
(OTP delivery is still async, returns a result, no throw) but
the function did not exist before this bolt; the third
`actorId` arg is a deliberate, minimum-surface addition that
keeps the audit row's `entityId` meaningful.

If a future caller is genuinely outside the user context (e.g.
a system-level smoke test), the actorId can be a synthetic
`'system'`. The audit row's `entityId` becomes a sentinel;
the Bolt 005-004 dashboard can filter `entityType: 'user'`
out the `system` row with a single `WHERE actorId != 'system'`
clause. The Vitest covers both paths.

## `.env.example` delta

Replace:

```
# --- OTP SMS provider (PLAT-REQ-002; deferred-to-PRD per audit) ---
# Stubbed in v1; real provider chosen in WO-004 admin config.
OTP_PROVIDER="stub"
OTP_FROM="CityFix"
```

with:

```
# --- OTP SMS provider (PLAT-REQ-002; Bolt 005-003) ---
# Choose 'stub' (dev) or 'twilio' (prod). Default 'stub'.
#   stub   — logs the code to console.info; the dev persona's path
#   twilio — real Twilio SMS; the three TWILIO_* vars below are required
OTP_PROVIDER="stub"

# Twilio (only when OTP_PROVIDER=twilio). Generate at https://console.twilio.com/
TWILIO_ACCOUNT_SID=""
TWILIO_AUTH_TOKEN=""
# E.164-formatted from-number, e.g. +15555550100
TWILIO_FROM_NUMBER=""
```

The `OTP_FROM` line is removed (it was a placeholder; the real
"from" is `TWILIO_FROM_NUMBER`). The comment block is rewritten
to point at the Bolt 005-003 paperwork.

## `package.json` delta

```
"dependencies": {
  ...,
  "twilio": "^4.23.0"
}
```

`twilio@4` is the current major; it's tree-shakable, has no
native deps, and the official Node SDK. The version pin
(`^4.23.0`) is the v4 line as of 2026-10-12; the Vitest
in Stage 4 will not assert a specific version, only that the
SDK exposes `messages.create({ to, from, body })`.

## Call-site delta

`app/api/v1/auth/send-otp/route.ts` — after line 117
(`db.otp.create({...})`) and before the existing
`writeAudit({...})` call (line 119-125), insert:

```ts
const sendResult = await sendOtp(phone, code, user.id);
if (!sendResult.delivered) {
  // The OTP is persisted (the hash is in the OtpCode row); the citizen
  // can still try to verify, but the SMS leg failed. Returning 502 here
  // matches the route's documented "5xx SMS provider failure" error.
  return NextResponse.json(
    { error: 'sms_provider_failure', detail: sendResult.error },
    { status: 502 },
  );
}
```

The `writeAudit` on line 119 (the `user.otp_issued` row) is
preserved — it records the code issuance regardless of the
SMS outcome. The `sendOtp` failure audit (entityType `user`,
action `otp_send_failed`) is written inside `sendOtp` itself,
not at the route layer, so every future call site is auditable
uniformly. The `dev_code` surface (lines 129-137) is unchanged;
the StubProvider's `console.info` adds a second dev-visible
breadcrumb but the JSON response still carries `dev_code` in
dev mode for the QA persona.

The `isDev` branch on line 129 is now slightly redundant (the
stub provider's `console.info` is the same dev breadcrumb),
but it stays because the QA persona's UI displays `dev_code`
inline and removing it would break the registration flow. The
redundancy is acceptable; both are dev-only conveniences.

## Verification (Stage 2)

- `npx tsc --noEmit` — must be clean for the bolt's own code.
  Pre-existing 16 errors in dispatcher/dedupFlag/crew are
  out of scope (carried from Bolt 005-002).
- `npm run test:unit` — 217/217 baseline + the new
  `otp-provider.test.ts` (12 checks).
- `npm run test:mockups` — 15/15 (no UI changes).
- `curl -fs http://localhost:3000/` — 200 (no new routes).
- A manual smoke: `OTP_PROVIDER=twilio` (no creds set) +
  POST `/api/v1/auth/send-otp` → 500 from the missing-env
  throw caught by the route handler; the audit row records
  `action: 'otp_send_failed', error: 'provider_misconfigured'`.

## Risks + design notes

- **Twilio SDK env-var read timing**: the official Twilio v4
  Node SDK reads `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` at
  `messages.create` time if not passed to the constructor. Our
  `TwilioProvider` constructor reads them explicitly via the
  `required()` helper and passes them to `twilio(sid, token)`,
  so the env-var read happens at the factory's first call
  (after the `__resetOtpProviderForTests` reset, or at first
  import in production). This is a documented hardening — the
  Twilio SDK's default behaviour would otherwise silently
  read from `process.env` at message-send time and miss our
  `required()` throw.
- **Audit-row PII**: the audit row's `afterValue.phone` is
  written. This is consistent with the existing
  `user.otp_issued` audit row (line 119-125 of
  `app/api/v1/auth/send-otp/route.ts`), which does not record
  the phone either. Decision: `sendOtp`'s audit row DOES
  record the phone (it is the failure context the dispatcher
  needs to see when reviewing a failed registration), and we
  accept the small PII delta. The Bolt 005-004 audit
  dashboard's filter UI will offer an
  "include PII (admin only)" toggle so the PII is gated.
- **Retry timing in tests**: the backoff is `[100, 200, 400]`
  ms; a Vitest that exercises the retry path will sleep
  ≥ 300 ms (the wait between attempts 1 and 2 + 2 and 3).
  The Vitest uses `vi.useFakeTimers()` to skip the real
  waits, then `vi.runAllTimers()` between attempts; this
  keeps the test suite fast (< 50 ms for the retry test).
- **Stub provider in prod**: the `OTP_PROVIDER=stub` default
  is a dev safety; production MUST set `OTP_PROVIDER=twilio`
  in the env. A small Ops checklist item lands in Bolt
  005-004's runbook (not blocking this bolt).

## Ready-for-checklist (Stage 2 → Stage 3)

- [x] Module structure + file boundaries confirmed
- [x] `OtpResult` discriminated union + `OtpError` string-literal
- [x] `StubProvider` + `TwilioProvider` impls drafted
- [x] Factory + module-singleton cache + test reset
- [x] `sendOtp(phone, code, actorId)` signature (3-arg)
- [x] Audit row shape (`entityType: 'user'`, `action: 'otp_send_failed'`,
      `afterValue: { phone, provider, error }`)
- [x] `.env.example` delta (4 new vars, 1 line removed)
- [x] `package.json` delta (`twilio@^4.23.0`)
- [x] Call-site delta (`app/api/v1/auth/send-otp/route.ts` 1-line + 502 branch)
- [x] All 5 ADM-006 acceptance criteria traced to module + line
- [x] Pre-existing surface preserved: `generateOtp` / `hashOtp` /
      `verifyOtp` / `OTP_TTL_MS` / `OTP_MAX_ATTEMPTS` / `OTP_LENGTH` /
      `OtpCode` schema / `AuditWriteInput.entityType` union
- [ ] Stage 3 (ADR) will record the `audit-row PII` decision
      + the `OTP_PROVIDER=stub` default as a v1 production
      safety guardrail
