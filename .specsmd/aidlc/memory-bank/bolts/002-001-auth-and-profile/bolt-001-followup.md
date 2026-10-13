---
standard: bolt-followup
bolt: 002-001-auth-and-profile
created: 2026-10-11T18:00:00Z
status: open
---

# Follow-up: v1.1 platform hardening — per-phone login throttle

Tracked open work item for the v1.1 platform-hardening
Bolt. Picked up from ADR-009 (Bolt Decision item G2 for
Bolt 002-001-auth-and-profile).

## Scope

1. **Replace `lib/platform/rate-limit.ts` with a
   Redis-backed token bucket** (the deferred item from
   `standards/tech-stack.md`). The key shape is unchanged
   — call sites keep the `rateLimit(key)` signature; the
   primitive just moves state out-of-process so the limit
   is correct across instances.
2. **Add `(phone, 'login')` key to the login flow**:
   - 5 attempts per phone per 10 min (matches the IP
     lockout).
   - Lockout: 10 min, returns 423.
   - On the happy path, the phone-keyed limit coexists
     with the per-IP limit; either can 429/423.
3. **Add a Vitest unit test for the new key** under
   `tests/unit/rate-limit.test.ts` (currently exercises
   only the in-process bucket; the v1.1 test will
   exercise the Redis primitive + the per-phone key).
4. **Update `Bolt 002-001 ddd-02-technical-design.md`**
   with the v1.1 final posture (the current document
   already calls out the deferral).
5. **Reopen or close ADR-009** depending on whether
   the v1.1 implementation matched the deferral rationale.

## Acceptance criteria

- [ ] The Redis-backed rate-limit primitive is in
      `lib/platform/rate-limit.ts` and is the default
      when `REDIS_URL` is set; the in-process bucket
      remains the dev fallback.
- [ ] `POST /api/v1/auth/login` rate-limits per IP
      (5/min) AND per phone (5 in 10 min, 10-min lockout).
- [ ] `npm run test:unit` is green; new test cases
      cover the per-phone key under load.
- [ ] `npx tsc --noEmit` is clean.
- [ ] The login page surfaces either 423 with a
      countdown (per-IP or per-phone; same UX).

## Why this is a follow-up, not in v1

Per ADR-009: the in-process bucket's single-process
correctness ceiling makes a per-phone throttle a false
sense of safety at v1 pilot scale. v1.1 ships the Redis
primitive and the per-phone policy in one place.

## Cross-references

- **Bolt**: 002-001-auth-and-profile.
- **ADR**: `bolts/002-001-auth-and-profile/adr-009-login-throttle.md`.
- **Standards**: `standards/tech-stack.md` (deferred
  Redis-backed limiter).
- **v1.1 Bolt**: not yet scheduled; the platform
  hardening Bolt is the natural owner.