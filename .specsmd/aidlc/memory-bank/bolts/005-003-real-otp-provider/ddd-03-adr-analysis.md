---
bolt: 005-003-real-otp-provider
unit: 003-real-otp-provider
intent: 005-admin-city-setup
phase: construction
type: ddd-construction-bolt
status: in-progress
created: 2026-10-12T18:30:00Z
updated: 2026-10-12T19:00:00Z
---

# Bolt 005-003 — Real OTP SMS Provider — Stage 3: ADR Analysis

## ADR register

| # | Title | Source | Status |
|---|-------|--------|--------|
| ADR-001 | Single full-stack Next.js 14+ App Router | tech-audit §1 | Accepted |
| ADR-002 | MapLibre GL JS + OSM raster tiles (dev) | tech-audit §2 | Accepted |
| ADR-003 | Web Push API (VAPID) for v1 | tech-audit §3 | Accepted |
| ADR-004 | Session-cookie auth + WebAuthn for admin writes | tech-audit §4 | Accepted |
| ADR-005 | Four-role auth model (citizen / dispatcher / crew / admin) | Inception 2026-09-18 | Accepted |
| ADR-006 | Spec-as-contract pattern (replaces wireframes) | Inception 2026-09-18 | Accepted |
| ADR-007 | WebAuthn mandatory for admin writes | tech-audit §4 / Bolt 005-001 | Accepted |
| ADR-008 | Testing posture (test-after, 80% floor, baselines gating) | team.md Testing Posture | Accepted |
| ADR-009 | Defer per-phone login throttle to v1.1 | Bolt 002-001 | Accepted |
| **ADR-012 (NEW)** | **OTP provider-agnostic facade (typed `OtpProvider` + factory keyed on `OTP_PROVIDER`)** | **Bolt 005-003** | **Proposed** |

> Note: ADR-010 and ADR-011 are referenced in source comments
> (`lib/admin/dhaka-template.ts:182` cites ADR-011, and
> `lib/auth/guards.ts:7` cites ADR-007 which is the canonical
> ADR-007 record). The decision-index.md file currently
> ends at ADR-009; ADR-010 and ADR-011 will be filed in a
> follow-up paperwork reconciliation. ADR-012 (this bolt)
> is the next number on the register and is **not**
> affected by the reconciliation.

## Bolt decision item analysis

Each item below is a decision the bolt had to make. For
each, we ask: (1) does an existing ADR already cover it?
(2) if not, is the decision large enough to warrant a
**new** ADR or small enough to be a local design choice?

| # | Decision | Existing ADR? | New ADR? |
|---|----------|---------------|----------|
| 1 | Public `sendOtp(phone, code, actorId): Promise<OtpResult>` lives in `lib/auth/otp.ts`; preserves `generateOtp` / `hashOtp` / `verifyOtp` | Partial — tech-audit §4 names "SMS via provider abstraction" but does not name the function signature or audit shape | No — local design choice (Stage 2 documents it) |
| 2 | `OtpProvider` interface + `StubProvider` / `TwilioProvider` impls | **No** — the audit says "abstraction" but never names the interface, the provider list, or the env-var key | **Yes** — this is the canonical "provider-agnostic facade" decision the framework will need every time a new provider is added. **ADR-012.** |
| 3 | `getOtpProvider()` factory keyed on `process.env.OTP_PROVIDER`; throws on unknown values; caches the singleton for the process lifetime | No | Subsumed by ADR-012 |
| 4 | Twilio retry policy: 3 attempts, exponential backoff `[100, 200, 400]` ms; 5xx retry, 4xx immediate fail | No | Subsumed by ADR-012 (the retry policy is named inside the ADR as the v1 policy) |
| 5 | Constructor-time `required(env-var)` throw on missing Twilio creds | No | Subsumed by ADR-012 |
| 6 | Failure audit row: `entityType: 'user'`, `action: 'otp_send_failed'`, `afterValue: { phone, provider, error }` | Partial — tech-audit §4 says "OTP: SMS via provider abstraction"; ADR-007 names the audit shape for WebAuthn but not for OTP failures | No — the decision is local; the union-typed `entityType` is a deliberate Stage 1 choice, not a new ADR |
| 7 | Audit row includes `phone` PII | No (no prior audit row records PII; the existing `user.otp_issued` audit on `app/api/v1/auth/send-otp/route.ts:119-125` does NOT record the phone) | No — local design choice (Stage 2 documents the PII reasoning; Bolt 005-004's audit dashboard will gate display) |
| 8 | `OTP_PROVIDER=stub` is the dev default; production must set `OTP_PROVIDER=twilio` | No | Subsumed by ADR-012 (the prod-safety guardrail) |
| 9 | Vitest uses `vi.useFakeTimers()` to skip the 100/200/400 ms backoff in the retry test | No (testing posture is ADR-008 but the faketimer choice is implementation) | No — local |
| 10 | Twilio SDK env-var read at `messages.create` time → we read at `TwilioProvider` constructor time via `required()` and pass to `twilio(sid, token)` | No | Subsumed by ADR-012 (hardening note) |
| 11 | No new HTTP routes; no new page; no new Playwright spec (the unit test + the existing citizen registration flow cover the surface) | No — this is a library-level bolt by design | No |
| 12 | `libphonenumber-js` validation deferred to v1.1 | No | **Cross-reference only** — the unit-brief already defers it; no ADR needed. |

**Conclusion**: exactly **one** new ADR (ADR-012) lands in
this bolt. The rest are local design choices documented in
Stage 1 / Stage 2.

## ADR-012 — OTP provider-agnostic facade

### Context

The CityFix citizen auth path (PLAT-REQ-002) requires SMS
delivery of a 6-digit OTP code. The pilot city is Dhaka;
Bangladesh SMS pricing and carrier reliability make Twilio
the v1 default, but the same code path will need to talk
to bulk24 (BD-local), SSL Wireless, or Meta's Cloud API as
the pilot grows or as the v1.1 cities (Chittagong, Khulna)
pick their providers. Hard-coding the Twilio SDK in
`lib/auth/otp.ts` would (a) make every future provider
swap a code change, (b) force the test suite to mock the
Twilio SDK directly, and (c) leave no place to put a
provider-agnostic retry policy or audit shape.

The `lib/auth/otp.ts` module ships in WO-000 with
`generateOtp` / `hashOtp` / `verifyOtp` but no SMS-send
helper. The citizen registration flow in
`app/api/v1/auth/send-otp/route.ts` currently surfaces
`dev_code` in the dev response and calls no provider
explicitly (the comment on line 127 names this as
"deferred to WO-004"). Bolt 005-003 is the WO-004 unit
that closes the deferral.

### Decision

Ship a typed `OtpProvider` interface in
`lib/auth/otp-provider/types.ts`:

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

Ship two concrete providers:

- `StubProvider` (`lib/auth/otp-provider/stub.ts`) — always
  returns `{ delivered: true, providerMessageId: 'stub-{code}' }`;
  logs the code to `console.info` for dev visibility.
- `TwilioProvider` (`lib/auth/otp-provider/twilio.ts`) —
  reads `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` /
  `TWILIO_FROM_NUMBER` at construction; calls
  `messages.create({ to, from, body: 'Your CityFix code is {code}' })`;
  retries 3 times with `[100, 200, 400]` ms backoff on 5xx;
  fails immediately on 4xx.

Ship a factory in `lib/auth/otp-provider/index.ts`:

```ts
export function getOtpProvider(): OtpProvider
```

Keyed on `process.env.OTP_PROVIDER` (`stub` | `twilio` |
…); throws `Error: Unknown OTP_PROVIDER: <name>` on
unknown values; caches the singleton for the process
lifetime; test seam `__resetOtpProviderForTests` clears
the cache.

Extend `lib/auth/otp.ts` with the public `sendOtp(phone,
code, actorId): Promise<OtpResult>`. The function delegates
to `getOtpProvider().send(...)`; on `{ delivered: false }`
it writes an `AuditEntry` with `entityType: 'user'`,
`entityId: actorId`, `action: 'otp_send_failed'`,
`afterValue: { phone, provider, error }`.

Wire the call site in
`app/api/v1/auth/send-otp/route.ts` to call
`sendOtp(phone, code, user.id)` after the `OtpCode` row is
persisted. A `{ delivered: false }` result returns
`502 sms_provider_failure`; a thrown error (provider
misconfiguration) is caught by `sendOtp` and surfaces as
`{ delivered: false, error: 'provider_misconfigured' }`.

Add `twilio@^4.23.0` to `package.json`. Add
`OTP_PROVIDER` (replace existing placeholder), and the
three `TWILIO_*` vars to `.env.example`.

### Consequences

- **Positive**: a future provider (bulk24, SSL Wireless,
  Meta) is a one-line `case` in the factory; no other
  module changes. The Vitest suite mocks the
  `OtpProvider` interface, not the Twilio SDK directly.
  The retry policy is named once and centrally maintained.
  The failure audit row is uniform across providers
  (the `provider` field names the source).
- **Positive**: the `OtpResult` discriminated union gives
  every caller a single, narrowable result type. The
  `OtpError` string-literal union is forward-compatible —
  a new provider adds its own value without breaking
  existing callers (TypeScript flags the missing branch
  in any `switch` on `result.error`).
- **Positive**: the dev persona stays self-contained — the
  `StubProvider` requires no env vars and is the dev
  default. Production deploys MUST set
  `OTP_PROVIDER=twilio`; the prod-safety guardrail is
  documented in the Stage 2 runbook note and lands in
  Bolt 005-004's audit dashboard filter UI as a
  "provider is stub" alert.
- **Negative**: the public `sendOtp` signature takes a
  third `actorId` arg that the unit-brief did not name
  (the brief implied a 2-arg signature). The third arg
  is the minimum-surface addition that lets the audit
  row attach to a user; an alternative would be to
  widen `AuditWriteInput.entityType` to include `'otp'`,
  but that would weaken the closed union and was
  rejected in Stage 1.
- **Negative**: the failure audit row records `phone`
  (PII). This is gated in Bolt 005-004's audit
  dashboard UI behind an admin-only "include PII"
  toggle. The PII delta is documented in
  `bolts/005-003-real-otp-provider/ddd-02-technical-design.md`
  under "Risks + design notes."
- **Negative**: the Twilio SDK is the v1 default; a
  second real provider requires a separate
  `lib/auth/otp-provider/{name}.ts` file. This is the
  cost of provider-agnostic design and is accepted as
  the v1.1 path.

### Alternatives rejected

- **A. Hard-code Twilio in `lib/auth/otp.ts`**.
  Rejected: locks the citizen auth path to one provider;
  a future city that picks bulk24 would need a code
  change in the citizen's registration flow. The
  tech-audit's "abstraction" line in §4 explicitly
  rules this out.
- **B. Make `OtpResult` a class hierarchy
  (`OtpSuccess` / `OtpFailure` extends `OtpResult`)**.
  Rejected: the discriminated union is simpler, gives
  the same TypeScript narrowing, and serializes
  uniformly to JSON (no `instanceof` checks at the
  boundary). The flat string-literal `OtpError` union
  maps 1:1 to `AuditEntry.afterValue.error` (a free-form
  string) without a translation layer.
- **C. Use a third-party "multi-SMS" SDK
  (e.g. `smsgateway`, `messagebird`)**.
  Rejected: another dependency to vet; the pilot city's
  Twilio contract is a 1-page setup; the abstraction
  cost is low enough to own. A v1.1 can revisit if the
  second city picks a different provider.
- **D. Defer the `OtpProvider` interface and inline
  Twilio in the route handler**.
  Rejected: every future provider swap is a route
  handler edit; the test surface is doubled. The
  interface is 8 lines; the abstraction cost is the
  smallest viable unit.
- **E. Widen `AuditWriteInput.entityType` to include
  `'otp'`**.
  Rejected: the closed union is a deliberate design
  choice (it constrains the audit-dashboard filter UI
  to a known set of entity types; widening it
  introduces a one-off event type that doesn't
  represent a real row). The `entityType: 'user'` +
  `action: 'otp_send_failed'` shape is the minimum-
  surface way to record the failure without widening
  the union.
- **F. Use `libphonenumber-js` for phone validation in
  the Twilio provider**.
  Rejected (per the unit-brief's out-of-scope list):
  v1 trusts the citizen's input (the registration
  route already normalizes to E.164 with
  `+8801XXXXXXXXX`); a v1.1 bolt can add the
  validation step.

### Deferred (v1.1+)

- **Bulk24 / SSL Wireless / Meta Cloud API providers** —
  one-line `case` in the factory; the interface is
  ready.
- **`libphonenumber-js` phone validation** — v1.1 bolt.
- **OTP delivery rate monitoring (CloudWatch alarm on
  `OtpResult.delivered === false`)** — v1.1 ops
  enhancement; the audit log already records the
  failure.
- **Per-message cost accounting** — Twilio's
  `price` / `priceUnit` response fields; v1 ignores
  them; v1.1 bolt may add a per-city cost report.

### Read when

- Adding a new SMS provider to CityFix.
- Debugging OTP delivery failures (the audit row's
  `provider` + `error` fields are the first stop).
- Reviewing the prod-safety guardrail that
  `OTP_PROVIDER=stub` must never reach production.
- Wiring the v1.1 ops alarms.

## Ready-for-checklist (Stage 3 → Stage 4)

- [x] Decision register walked: 12 items, 1 new ADR
- [x] ADR-012 drafted (Context, Decision, Consequences,
      Alternatives rejected, Deferred)
- [x] All 5 ADM-006 acceptance criteria traced to ADR-012
- [x] PII / audit-row decision documented (Stage 2
      cross-reference)
- [x] Prod-safety guardrail (`OTP_PROVIDER=stub` must not
      ship to prod) documented in ADR-012 + runbook note
- [x] No existing ADR is contradicted; the bolt extends
      tech-audit §4's "SMS via provider abstraction" line
      with the concrete interface, factory, retry policy,
      and audit shape
- [ ] Stage 4 (Implement) will land the 5 new files +
      the call-site wire + the `.env.example` + the
      Vitest suite per Stage 2's specification
- [ ] Stage 5 (Tests + commit) will run the full
      verification command and confirm 12 new Vitest
      checks pass
