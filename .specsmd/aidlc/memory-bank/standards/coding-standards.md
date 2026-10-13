---
standard: coding-standards
phase: standards
status: complete
created: 2026-10-11T18:00:00Z
updated: 2026-10-11T18:00:00Z
---

# Coding Standards

## Overview

Code style, patterns, and quality standards for CityFix. The team's
affirmed posture is **test-after** (greenfield) with an **80% line
coverage floor** on `feature` scope. The `app/` and `lib/` trees are
the only places product code lives; everything under those trees must
follow these rules.

## Decisions

### Formatting

- **TypeScript-formatted** through `tsc --noEmit` and the linter /
  formatter bundled with the project's IDE config. v1 ships no
  `.prettierrc` / `.eslintrc`; v1.1 hardening adds them.
- **One named export per file by convention** for `lib/` modules
  (so `import { db } from '@/lib/db'` is the only surface).
  React components may use default exports for `app/**/page.tsx`
  (Next.js convention) but named exports for everything else.
- **No semicolons at the start of a line** (no leading-statement
  hoisting hacks; the existing code does not have any).

### Linting

- **`tsc --noEmit` is the gate**, not ESLint. A Bolt that breaks
  `tsc --noEmit` cannot merge.
- v1.1 will add an ESLint flat config + Prettier. v1 keeps the
  surface small enough that the linter is not yet load-bearing.

### Naming

- **camelCase** for variables, functions, and TypeScript types.
- **PascalCase** for React components, Prisma models, and Prisma
  enum values.
- **snake_case** for DB column names (Prisma `@@map` / `@map`).
- **kebab-case** for file names (`report-draft.ts`,
  `theme-toggle.tsx`).
- **Test files**: `*.test.ts` colocated under `tests/unit/`.
- **Spec-as-contract** for UI work — page specs live under
  `design-artifacts/C-UX-Scenarios/` and are the implementation
  contract; the page file in `app/` mirrors them. No wireframes.

### File & folder organization

- `app/` — Next.js App Router routes and layout. One page per file
  (`app/<route>/page.tsx`). API routes under `app/api/`.
- `components/` — shared client + server components.
- `lib/` — service layer, utilities, platform helpers. The only
  place business logic lives.
  - `lib/auth/` — auth (password, OTP, session, guards).
  - `lib/platform/` — cross-cutting (dedup, transitions, audit,
    rate-limit, push).
  - `lib/serializers/` — role-aware serializers (citizen vs
    dispatcher vs crew).
  - `lib/i18n/` — typed key registry.
  - `lib/geo/` — geographic constants.
  - `lib/theme/` — appearance provider.
  - `lib/dev-store.ts` and `lib/dev-session.ts` — in-memory dev
    store (active only when `CITYFIX_DEV_STORE=1`).
- `prisma/` — schema + seed.
- `tests/` — Vitest unit tests + Playwright specs.
- `tests-mockups/baselines/` — committed Playwright PNG baselines.
- `design-artifacts/` — the **source of truth** for product
  decisions. Every spec, mockup, and decision is here.
- `.specsmd/aidlc/memory-bank/` — specsmd's planning artifacts.
- `_progress/` — the running design log + outline.

### Testing strategy

- **Methodology**: test-after (affirmed 2026-10-04, see
  `aidlc/spaces/default/memory/team.md`).
- **Coverage floor**: 80% line coverage on `feature` scope.
- **Visual regression**: Playwright baselines are gating. New
  mockup → new baseline. Tolerance `0.005`. Baselines under
  `tests-mockups/baselines/01-mockups.spec.ts/`.
- **Per-Bolt gate**: `npx tsc --noEmit` MUST be clean; new
  files under `lib/` MUST add a Vitest test.
- **Test commands**:
  - `npm run test:unit` — Vitest.
  - `npm run test:mockups` — Playwright (visual regression only).
  - `npm run test:update-baselines` — re-capture baselines after
    an intentional design change.
  - `npm test` — full Playwright suite (visual + route specs).

### Error handling

- **Service-layer functions in `lib/` return `Result<T, E>`** OR
  throw the `ApiError` class from `lib/auth/guards.ts`. They
  **never throw raw `Error` across a service boundary**.
- **API route handlers** in `app/api/**/route.ts` catch errors
  and convert to `NextResponse.json({ error }, { status })`.
- **Client pages** show translated error keys via `t(...)` from
  `lib/i18n/keys.ts`; never hardcode user-facing error copy.
- **Silent failures are forbidden** — the v1 dev store logs
  fallback paths so QA can see when a path was missed.

### Logging

- **Audit log** for any state-changing operation
  (`lib/platform/audit.ts → writeAudit(...)`).
- **Structured console** for the dev-store demo so the user can
  see what is happening without a real logger.
- v1.1 swaps to `pino` or `winston` for production logging.

### i18n

- **All user-facing copy goes through `t(key, vars, lang)`** from
  `lib/i18n/keys.ts`. Hardcoded strings in components are forbidden.
- **Bangla first** (canonical), English secondary. Both locales
  fully authored in the registry; the surface is the key, not
  the language.
- **Per-user override → city default → DEFAULT_LANGUAGE**
  (`'bn'`).

### Type-safety boundary

- **Zod** schemas at every external API boundary
  (`app/api/**/route.ts`). Validated inputs become typed objects
  inside the handler.
- **Prisma** generates the DB row types; the service layer
  functions are typed against the Prisma client.
- **i18n** key registry is typed (`keyof typeof TRANSLATIONS`) so
  the TypeScript compiler catches missing keys at build time.

### Security

- **No hard-coded secrets** — `.env.example` documents
  `DATABASE_URL`, `SESSION_SECRET`, `OTP_PROVIDER`, `VAPID_*`.
- **All inputs validated** at the API boundary with Zod.
- **No raw SQL** in app routes.
- **WebAuthn mandatory for admin writes** — `lib/auth/guards.ts`
  `requireRole('admin')` plus a future `requireWebAuthn` guard
  that the four `/api/auth/webauthn/*` handlers will implement.
- **Citizen-facing serializer** (`lib/serializers/ticket.ts`)
  **hides internal fields** (`assignedCrewId`, `internalNote`) and
  maps `actorId` → "City corporation" / "সিটি কর্পোরেশন".

## Cross-References

- **Team rules** (additive): `aidlc/spaces/default/memory/team.md` —
  the per-team affirmed practices (testing posture, deploy policy,
  code style specialization).
- **Project rules** (additive): `aidlc/spaces/default/memory/project.md` —
  the per-project specialisation (TypeScript strict, path alias,
  tech-stack pinning).
