# Team-Level Rules — CityFix

> This team's affirmed practices and corrections. Loaded after `org.md` as
> strict-additive guidance; contradictions with broader policy are rejected.
> Populated by the practices-discovery affirmation gate.
>
> Sections marked `(inherits)` defer to `org.md` and are listed only so the
> team-level file shows the full set at a glance.

## Way of Working  (specialises org.md)

- Trunk branch is **`prd-development`** (not `main`) — CityFix is an active
  build on a feature-branch workflow; the trunk name is the only deviation
  from the org default.
- All design artifacts under `design-artifacts/` are committed alongside
  code; they are the contract Mimir builds against and are the source of
  truth for UI/UX requirements.

## Walking Skeleton  (specialises org.md)

- **We DO run a walking skeleton** (org.md leaves this scope-dependent).
  At greenfield / new-platform-stage, the smallest end-to-end slice must
  demonstrate the deployment pipeline is alive.
- First Construction Unit of any WO is the smallest working integrated
  slice (data → API → UI smoke). WO-000 was the first skeleton in this
  space and is now code-complete.
- The recorded Construction Verification Command for this space is
  `npx tsc --noEmit && npm run test:unit && npm run test:mockups && curl -fs http://localhost:3000/`.

## Testing Posture  (affirms org.md defaults)

- **Methodology**: test-after — affirmed; project is greenfield, fast
  iteration outweighs TDD ceremony for first-pass Bolts.
- **Coverage floor**: 80% line coverage (inherited from org.md via the
  active scope; applies to mvp / enterprise / feature / infra / classic).
- **Visual regression**: Playwright baselines are gating in this team.
  New mockup → new baseline. Tolerance `0.005`. Baselines live under
  `tests-mockups/baselines/01-mockups.spec.ts/`.

## Guard Policy

<!-- Mode: strict, relaxed, or off. Strict here holds for every intent in this space and cannot be changed from chat. -->

Mode: strict

Additional team notes on guards (operational, not policy):
- For relaxed/off guard requests, the human runs
  `/aidlc --guard-policy relaxed` or `/aidlc --guard-policy off`
  explicitly; we never relax guards on agent initiative.

## Deployment  (specialises org.md)

- Hosting target is deferred to WO-001 PRD (Cloudflare vs Vercel vs
  Railway) — the audit pinned the stack but not the host. Until WO-001
  PRD lands, treat hosting as `localhost` for verification.
- Continuous deployment to production is NOT a default — graduation
  to CD requires an explicit team decision and observability investment.

## Code Style  (additive to org.md's project-deferral)

- **Named exports over default exports** for all modules under `lib/`.
  React components may use default exports for `app/**/page.tsx`
  (Next.js convention) but named exports for everything else.
- **All async functions in the service layer return Result<T, E>** —
  they never throw (see Forbidden below).
- **Type-safe boundary**: Zod schemas at every external API boundary
  (`app/api/**/route.ts`). Validated inputs become typed objects inside
  the handler.
- **Database access**: only through Prisma client from `lib/db.ts`;
  raw queries forbidden in app code.
- **i18n**: typed key registry from `lib/i18n/keys.ts`;
  `t(key, vars)` is the only way to surface user copy.

## Forbidden

- NEVER throw exceptions across service-layer boundaries — return Result
  types or use the established `ApiError` class from `lib/auth/guards.ts`.
  (affirmed 2026-10-04)
- NEVER use raw SQL or Prisma client from app routes — always go through
  service functions in `lib/`.
- NEVER hard-code user-facing copy in components — always go through
  `t(...)` from `lib/i18n/keys.ts`. (affirmed 2026-10-04)
- NEVER merge Bolts with failing visual regression tests — Playwright
  baselines are gating.
- NEVER edit `aidlc-state.md` directly — only the engine's state-transition
  hooks write state.
- NEVER relax guards from chat without an explicit
  `/aidlc --guard-policy ...` invocation.

## Mandated

- ALWAYS run `npx tsc --noEmit` before declaring a Bolt complete.
- ALWAYS run `npm run test:unit` after editing any file under `lib/`.
- ALWAYS run `npm run test:mockups` after editing any mockup HTML or
  `tokens.css`.
- ALWAYS write audit log entries via `writeAudit(...)` from
  `lib/platform/audit.ts` for any state-changing operation.
- ALWAYS use the platform serializer `lib/serializers/ticket.ts` when
  exposing tickets to citizens — internal fields must be stripped.
- ALWAYS update `_progress/00-design-log.md` when transitioning between
  AIDLC phases — it is the project's single source of truth for progress
  outside `aidlc-state.md`.

## Corrections

<!-- Self-learning loop appends here. -->
<!-- Format: NEVER/ALWAYS [behavior] (learned [date]) -->

- ALWAYS use `.puku-cli/tools/aidlc.ts` as the AIDLC CLI launcher in
  this workspace (learned 2026-10-04) — Bun-runtime shebang scripts;
  `bun` v1.4.0+ is required and confirmed installed.
- NEVER invoke the AIDLC framework files with Node directly — they use
  Bun-specific runtime features (learned 2026-10-04).
- ALWAYS prefix AIDLC engine invocations with
  `AWS_AIDLC_DEFAULT_SCOPE=feature` (learned 2026-10-04) — the project
  default scope is `feature`; org.md does not pre-set this for puku-cli
  sessions, so the env var must be supplied on each invocation until the
  team configures it via `aidlc config flags`.