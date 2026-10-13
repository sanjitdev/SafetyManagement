---
standard: bolt-instance
phase: construction
status: complete
current_stage: done
stages_completed:
  - name: model
    completed: 2026-10-11T18:00:00Z
    artifact: ddd-01-domain-model.md
  - name: design
    completed: 2026-10-11T18:00:00Z
    artifact: ddd-02-technical-design.md
  - name: adr-analysis
    completed: 2026-10-11T18:00:00Z
    artifacts:
      - adr-009-login-throttle.md
  - name: implement
    completed: 2026-10-11T18:00:00Z
    artifacts:
      - app/api/v1/auth/register/route.ts (refactored: removed direct prisma import, uses db.user.findFirst)
      - app/api/v1/auth/send-otp/route.ts (added writeAudit for user.otp_issued)
      - lib/auth/password.ts (added hashSecret for short secrets)
      - lib/auth/otp.ts (routed hashOtp through hashSecret)
      - tests/05-auth-funnel-light.spec.ts (new light-theme visual baselines)
      - tests-mockups/baselines/05-auth-funnel-light.spec.ts/*.png (5 committed baselines)
  - name: test
    completed: 2026-10-11T18:00:00Z
    artifact: ddd-03-test-report.md
created: 2026-10-11T18:00:00Z
updated: 2026-10-11T18:00:00Z
bolt_id: 002-001-auth-and-profile
unit: 002-citizen-report-flow/001-auth-and-profile
intent: 002-citizen-report-flow
bolt_type: ddd-construction-bolt
---

# Bolt 002-001 — Auth and Profile

The citizen auth funnel: splash → welcome → register →
verify-OTP → login. The funnel handles the **identity
boundary** for the entire citizen surface area; everything
downstream (home / report / reports / settings) trusts
that a citizen who reaches those pages has a fresh signed
session cookie.

## Scope (in)

- `app/splash/page.tsx` (1.1)
- `app/welcome/page.tsx` (1.2)
- `app/register/page.tsx` (1.3)
- `app/verify-otp/page.tsx` (1.3b)
- `app/login/page.tsx` (1.5)
- `app/api/v1/auth/{register,send-otp,verify-otp,login}/route.ts`
- `app/api/auth/status/route.ts`
- `lib/auth/{password,otp,session,guards}.ts`
- Per-story DDD artifacts (`ddd-01-domain-model.md`,
  `ddd-02-technical-design.md`, `ddd-03-test-report.md`).
- Per-route Playwright visual baselines (light theme).

## Scope (out)

- Push subscribe (deferred to v1.1 → Bolt
  `002-005-theme-and-i18n` records the deferral).
- Dispatcher / crew / admin sign-in (Intents 003, 004, 005 —
  separate surfaces, not in v1 of this Bolt).
- `requireSameWard` / `requireSameDepartment` (deferred —
  Gap G3; lands when Intent 003 unblocks).
- Login throttle (deferred — Gap G2; security review may
  pull it forward).

## Bolt Decision

The decisions made in Stage 3 (ADR Analysis):

1. **Gap G2 — Login throttle: DEFERRED to v1.1**
   (captured in `adr-009-login-throttle.md`,
   registered in `standards/decision-index.md` as
   ADR-009, and tracked in `bolt-001-followup.md`).
   v1 ships the existing per-IP rate limit + per-IP
   lockout. The per-phone `(phone, 'login')` throttle
   lands alongside the Redis-backed rate-limit
   primitive in v1.1.
2. **OTP audit events — `user.otp_verified` is ALREADY
   emitted** by `app/api/v1/auth/verify-otp/route.ts`
   (line 138-144 of the existing source, with action
   `user.verify_otp`). `user.otp_issued` is NOT yet
   emitted from `app/api/v1/auth/send-otp/route.ts`.
   **Decision**: add the `user.otp_issued` audit
   emission in this Bolt's implement stage — one
   `writeAudit` call after the OtpCode row is
   created, before the response. The ddd-01 event
   table will be updated to reflect the actual
   action names (`user.otp_issued` for issuance;
   `user.verify_otp` for verification, not
   `user.otp_verified` as the ddd-01 first named it).
3. **Direct `prisma` import in register route —
   CONSOLIDATE through `db.user.findFirst`**. The
   facade `lib/db-switch.ts` already exposes
   `db.user.findFirst({ where: { cityId, phone, role } })`
   for both the dev store and Prisma. The route's
   `if (isDevStore()) { ... } else { prisma.user.findFirst(...) }`
   branch is the only auth route that bypasses the
   facade. The implement stage replaces the branch
   with a single `db.user.findFirst(...)` call. This
   closes the only remaining direct-Prisma import in
   the auth surface and aligns the register route with
   `app/api/v1/auth/send-otp/route.ts` and
   `app/api/v1/auth/verify-otp/route.ts`, which already
   use the facade.
4. **Dark-theme baselines** for these routes. The
   specsmd mandate is to capture at least light-theme
   baselines here; dark-theme falls to Bolt
   `002-005-theme-and-i18n` (Gap G5).
5. **The dev OTP fixture `"000000"`**. Keep it — the
   PRD pins the dev test path explicitly. Record in the
   Bolt Decision that the **real provider** lives in
   Intent 005 / `ADM-006-real-otp-provider`.

## Stories owned

| Story slug | Path | Status target | Final status |
|-----------|------|---------------|--------------|
| 001-splash-welcome | `../../intents/002-citizen-report-flow/001-auth-and-profile/001-splash-welcome.md` | `done` | **done** (verified by Stage 4 smoke + light baseline) |
| 002-registration-otp | `../../intents/002-citizen-report-flow/001-auth-and-profile/002-registration-otp.md` | `done` | **done** (register / send-otp / verify-otp smoke 201/200/200) |
| 003-login | `../../intents/002-citizen-report-flow/001-auth-and-profile/003-login.md` | `done` | **done** (login 200 correct / 401 wrong) |

## Per-bolt exit criteria

(from `bolts/plan.md`)

- `npx tsc --noEmit` is clean.
- `npm run test:unit` is green (Vitest unit tests; new
  tests for any `lib/auth/*` or `lib/platform/rate-limit.ts`
  change).
- `npm run test:mockups` is green (new Playwright
  baselines for the 5 routes + light theme).
- `curl -fs http://localhost:3000/` returns 200.
- `ddd-03-test-report.md` is committed and links every
  story above to its unit-test + visual-baseline evidence.
- Story files in `intents/002-citizen-report-flow/001-auth-and-profile/`
  flip to `done`.

## Stage checklist

The 5-stage DDD process (per
`../../templates/construction/bolt-types/ddd-construction-bolt.md`):

1. [x] **Domain Model** — `ddd-01-domain-model.md`.
   Identity bounded context, ubiquitous language,
   `User`/`Session`/`OtpCode` aggregates with
   invariants, value objects, domain services,
   domain events.
2. [x] **Technical Design** — `ddd-02-technical-design.md`.
   Layered architecture, per-route flow, data
   persistence, security (cookie + password + OTP
   + rate limit + audit), NFRs, API contracts,
   frontend contracts, layer-by-layer checklist.
3. [x] **ADR Analysis** — `adr-009-login-throttle.md`
   (defer Gap G2 to v1.1). Decision index
   `standards/decision-index.md` updated; `total_decisions`
   → 9.
4. [x] **Implement** — small refinements in
   `app/api/v1/auth/{register,send-otp}/route.ts`,
   `lib/auth/{password,otp}.ts`, plus the WO-000
   `hashOtp → hashSecret` bugfix. Light-theme
   visual baselines captured (5 PNGs).
5. [x] **Test** — `ddd-03-test-report.md`. Per-bolt
   exit gate green: `npx tsc --noEmit` clean;
   `npm run test:unit` 57/57; `npm run test:mockups`
   15/15; new light baselines 5/5; live API smoke
   6/6; `curl -fs http://localhost:3000/` 200.

## Cross-references

- **Active intent**: `../../intents/002-citizen-report-flow/`.
- **Unit brief**:
  `../../intents/002-citizen-report-flow/001-auth-and-profile/unit-brief.md`.
- **Bolt plan**: `../plan.md`.
- **Refinement gaps owned**: G2 (login throttle), and a
  share of G3 (`requireSameWard` / `requireSameDepartment`
  — narrow scope to keep ticket-related guards in the
  report-flow bolts).
- **Standards consumed**: `tech-stack.md`, `coding-standards.md`,
  `api-conventions.md`, `decision-index.md`
  (ADR-002 four-role model, ADR-004 spec-as-contract,
  ADR-008 OTP SMS provider stubbed in WO-000).
