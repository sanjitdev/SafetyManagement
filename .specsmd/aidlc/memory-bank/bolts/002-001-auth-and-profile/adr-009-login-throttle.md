---
bolt: 002-001-auth-and-profile
created: 2026-10-11T18:00:00Z
status: accepted
---

# ADR-009: Defer per-phone login throttle to v1.1

## Context

`POST /api/v1/auth/login` rate-limits per IP (5/min in
`lib/platform/rate-limit.ts`) and the route handler
maintains a per-IP lockout map keyed by
`login:${ip}`: 5 wrong attempts within 10 min → 423
locked for 10 min. The IP-keyed limits stop single-IP
brute force but **do not survive IP rotation**: an
attacker with an IP-rotating botnet can enumerate
passwords against `(cityId, phone)` at the cost of
1 attempt per IP per minute.

The Bolt 002-001 Bolt Decision asked whether to
close this hole by adding a `(phone, 'login')` rate
limit on top of the existing IP lockout. A
phone-keyed throttle is the standard defense; the
question was scope.

## Decision

**Defer the per-phone login throttle to v1.1.**

v1 ships the existing per-IP rate limit + per-IP
lockout. A future v1.1 Bolt adds the phone-keyed
throttle in `lib/platform/rate-limit.ts` and routes
the login flow through it. A tracked follow-up
issue `bolt-001-followup.md → login-throttle` records
the rationale and the exact change to make.

## Rationale

- **v1 is a single-instance Next.js process**. The
  in-process token bucket in
  `lib/platform/rate-limit.ts` does not enforce a
  cross-process limit. A phone-keyed throttle on the
  same primitive inherits the single-process
  correctness ceiling — at pilot scale it adds a
  false sense of safety.
- **v1.1 is the right moment**: the platform layer
  is migrating to a Redis-backed limiter (per the
  `tech-stack.md` Deferred section) for cross-process
  correctness. Adding the phone-keyed throttle at the
  same time means the rate-limit primitive is correct
  when the policy lands.
- **The pilot's threat model does not warrant it**:
  the WO-001 PRD's gate is a 50k loads/month pilot,
  not a high-value phishing target. The IP lockout is
  sufficient for the v1 pilot; the production hardening
  belongs in v1.1.
- **Closing it now costs more than it saves**: the
  implementation is one extra `rateLimit(...)` call,
  but it would be the only phone-keyed limit in the
  codebase, and the asymmetry invites future bugs
  (a future Bolt will copy-paste the IP pattern and
  forget the phone key). v1.1 ships both the Redis
  primitive and the per-phone policy in one Bolt.

### Alternatives Considered

- **Add `(phone, 'login')` throttle in this Bolt** —
  closes the hole today. Rejected: same-process
  primitive gives a false sense of safety at v1 scale;
  cleanest to ship with the Redis primitive in v1.1.
- **Add a hard phone lockout (10-min on 5 wrong) in
  addition to the IP lockout** — stronger policy, same
  reasoning as above; rejected.
- **Move rate-limit primitive to Redis now** — out of
  scope for a citizen-auth Bolt; affects every route
  handler; tracked for the platform-hardening Bolt.

## Consequences

### Positive

- v1 ships the simplest rate-limit surface that the
  PRD requires.
- v1.1 Bolt inherits a clear scope: ship the Redis
  primitive + per-phone policy in one place.
- The deferral is explicit (recorded in this ADR
  and in `bolts/002-001-auth-and-profile/bolt.md`),
  not a silent omission.

### Negative

- A motivated attacker with an IP-rotating botnet
  can enumerate passwords at 1 attempt per IP per
  minute during the v1 pilot.
- The login page must surface the existing 423
  IP-lockout countdown so a legitimate citizen who
  fat-fingered their password is not confused.

### Risks

- **Risk**: a v1 pilot incident motivates pulling
  the phone-throttle forward. **Mitigation**: the
  deferral is one follow-up Bolt (about 1 hour of
  work) and can be hot-fixed without a schema
  change.

## Follow-up

- `bolts/002-001-auth-and-profile/bolt-001-followup.md`
  records the open work item so the platform-hardening
  Bolt picks it up.

## Related

- **Stories**: `003-login` (story slug for Bolt 003
  → Bolt 002-001 in the WO-001 intent tree).
- **Standards**: `standards/tech-stack.md` (deferred
  Redis-backed limiter), `standards/api-conventions.md`
  (rate-limit convention).
- **Previous ADRs**: ADR-004 (in-memory dev store +
  backend-agnostic facade; same in-process constraint
  applies to rate-limit).
- **Next ADRs**: ADR-011 (planned for v1.1 platform
  hardening — Redis-backed rate limit + per-phone
  login throttle).