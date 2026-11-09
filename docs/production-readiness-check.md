# Recommended AI execution workflow
1. Discovery and mapping
   
   AI reads the entire project and understands how everything connects. No code changes.
   Read-only
2. Gap analysis
   
   AI compares existing functionality against the checklist and identifies missing or broken features.
   Read-only
3. Prioritized implementation
   
   AI fixes critical issues first, then high, medium, and low-priority issues.
   Implementation
4. Independent verification
   
   AI runs tests, checks database state, verifies APIs, and executes actual user journeys.
   Testing
5. Production acceptance
   
   AI generates the final report and identifies anything preventing deployment.
   Final approval

## Verification commands (the project's actual gates)

Run these after every change. The first three are already green in the current tree.

```bash
npx tsc --noEmit      # typecheck — must be clean
npm run test:unit     # Vitest — 115 files / 2014 tests
npm run test:mockups  # Playwright visual regression baselines (needs the dev server)
npm run check:i18n    # i18n key registry consistency
npm run lint          # ESLint
npm run build         # prisma generate && next build
```

The full lifecycle requires a running app: `npm run dev` (or `npm run dev:feat` for the in-memory dev store), then `npx playwright test` for the 34 route-spec files (358 specs). The route specs are also run in CI — see `PRODUCTION_READINESS_CHECKLIST.md` row 9.7.

**Branching:** the team's trunk is `prd-development` per `aidlc/spaces/default/memory/team.md`; the current checkout is `main`. Reconcile before branching or opening a PR.

# CityFix – Production Readiness Audit & Completion Plan

## 1. Mission

You are acting as a Senior Software Architect, Full-Stack Engineer, QA Engineer, Security Engineer, and DevOps Engineer.

Your responsibility is to thoroughly inspect, test, complete, and prepare the existing CityFix application for real-world production deployment.

CityFix is a city service management platform that connects citizens reporting public infrastructure problems with dispatchers who verify reports and assign crews to resolve them. Administrators oversee the entire operation.

**Technology stack (as actually implemented — verify against the repo, this section is a starting point, not a substitute for discovery):**
- **Framework**: Next.js 14 (App Router) + React 18 + TypeScript (strict, `isolatedModules`)
- **Styling**: Tailwind CSS v3 + a design-token source of truth (`design-artifacts/D-Design-System/01-Visual-Design/tokens.css`)
- **Backend**: Next.js route handlers (`app/api/**/route.ts`) — there is no separate backend service; the "backend" is the route-handler layer inside the Next.js app
- **Database**: PostgreSQL 16 via Prisma 5.22 (`prisma/schema.prisma`); a backend-agnostic facade sits at `lib/db-switch.ts`, and an in-memory dev store (`lib/dev-store/`) is selected when `CITYFIX_DEV_STORE=1`
- **Auth**: HTTP-only signed session cookies (`lib/auth/session.ts`); Argon2 password hashing; SMS OTP (`lib/auth/otp.ts` + `lib/auth/otp-provider/`, Twilio selectable, `stub` default); WebAuthn via `@simplewebauthn/{server,browser}` for admin writes
- **Authorization**: four-role model (`citizen` / `dispatcher` / `crew` / `admin`) enforced server-side by `lib/auth/guards.ts` (`requireRole`, `requireSameCity`, `requireScope`, `requireWebAuthn`)
- **Map**: MapLibre GL JS + OpenStreetMap raster tiles
- **Push**: Web Push API (VAPID) — transport is wired but the send is currently a **v1 stub** (see Phase 11)
- **Validation**: Zod schemas at every `app/api/**/route.ts` boundary
- **i18n**: Bangla-first, English-secondary; typed key registry at `lib/i18n/keys.ts` (1000+ keys) — `t(key, vars)` is the only way to surface user copy
- **Testing**: Vitest (unit, under `tests/unit/`) + Playwright (32 route specs under `tests/`, plus mockup visual baselines)
- **Deployment**: Vercel (`.vercel/` present) with a local PostgreSQL for development
- **CI**: `.github/workflows/ci.yml` — lint, typecheck, unit, coverage, visual, build

The application has been developed primarily through AI-assisted agentic development. Therefore, the existing implementation may contain incomplete features, disconnected components, placeholder functionality, inconsistent business logic, missing validations, security vulnerabilities, or workflows that appear functional but are not fully implemented.

Do not assume anything is complete.

Your job is to discover what exists, understand how it works, identify what is missing, and bring the entire application to production-ready quality.

## 2. Critical Working Instructions

Follow these rules throughout the audit:

1. Do not start rewriting the application or replacing existing implementations without understanding them.
2. Inspect the entire repository, including frontend, backend, database, configuration, scripts, and documentation.
3. Never assume a feature works just because its UI exists.
4. Trace every important frontend action through its API, business logic, database operation, and resulting UI state.
5. Test actual workflows using different user roles.
6. Identify and fix incomplete implementations, TODOs, placeholders, mock data, hardcoded values, and fake API responses.
7. Never introduce breaking changes without understanding their impact on other modules.
8. Preserve the existing architecture and design system unless there is a concrete reason to change them.
9. Avoid unnecessary dependencies and unnecessary architectural complexity.
10. Never hide errors simply to make tests pass.
11. Never use production data for destructive testing.
12. Do not remove existing functionality to simplify implementation.
13. After every significant fix, run the relevant tests and verify that existing functionality still works.
14. If something cannot be verified, explicitly mark it as NOT VERIFIED rather than assuming it works.

Work incrementally. Do not attempt to fix everything in one massive change.

---

# PHASE 1: Understand the Entire Application

Before changing anything, build a complete understanding of the project.

### Repository inspection
- [ ] Inspect the complete project folder structure.
- [ ] Identify all frontend modules, pages, components, hooks, and services.
- [ ] Identify all backend modules, route handlers, service functions, guards, and middleware. *(In this codebase the "controllers" are the `app/api/**/route.ts` handlers; the "services" are the modules under `lib/`; there is no separate backend process.)*
- [ ] Identify database schemas, migrations, relationships, indexes, and constraints.
- [ ] Inspect package.json files and dependencies.
- [ ] Inspect environment variables and configuration.
- [ ] Identify authentication and authorization implementations.
- [ ] Identify file upload and storage implementations.
- [ ] Identify external integrations.
- [ ] Identify background jobs, queues, scheduled tasks, and notification systems.
- [ ] Identify existing testing frameworks and test coverage.
- [ ] Identify dead code, unused modules, duplicated implementations, and abandoned features.

### Known starting state (verify — do not assume, and do not rebuild what is already here)

The application is **substantially built**. Treat these as leads to verify, not as a gap list:

- **~68,800 LOC** across `app/`, `lib/`, `components/`.
- **40 Next.js pages** under `app/` covering all four roles (citizen, dispatcher, crew, admin) plus public/auth surfaces.
- **65 API route handlers** under `app/api/**/route.ts`.
- **17 Prisma models** + 3 enums: `City`, `Ward`, `Department`, `Crew`, `SlaPolicy`, `Category`, `User`, `OtpCode`, `WebAuthnChallenge`, `Session`, `PushSubscription`, `Ticket`, `TicketTrailEntry`, `TicketPhoto`, `AuditEntry`, `DedupFlag`; enums `Role`, `TicketStatus`, `DedupFlagStatus`.
- **3 migrations** in `prisma/migrations/`.
- **Vitest**: 115 test files / 2014 tests under `tests/unit/`.
- **Playwright**: 34 route-spec files / 358 specs under `tests/` plus mockup visual baselines.
- **CI**: `.github/workflows/ci.yml` runs lint, typecheck, unit, coverage, visual, build, and the route specs.
- **Security headers** (CSP, HSTS, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`) are configured in `next.config.js`.
- **Platform services already exist** in `lib/platform/`: `audit.ts`, `dedup.ts`, `rate-limit.ts`, `transitions.ts`, `push.ts`, `db-guard.ts`; serializers in `lib/serializers/`.

**The gap is most likely in verification, hardening, and documentation — not in missing features.** Confirm this rather than assuming it.

### Known incomplete or stubbed areas (starting leads)

- [ ] **Push notifications are a stub.** `lib/platform/push.ts` `sendTicketPush()` logs the intended fan-out and returns the subscription count; the real `web-push.sendNotification()` wire call is deferred to v1.1. Every "citizen/dispatcher/crew receives a notification" checklist item that depends on push cannot PASS on evidence until this is resolved or the item is explicitly scoped to another channel.
- [ ] **OTP defaults to the `stub` provider.** `OTP_PROVIDER="stub"` ships in `.env.example`. Twilio is implemented and selectable. Production must set `OTP_PROVIDER=twilio` with the three `TWILIO_*` variables, or registration silently logs codes to the server console.
- [ ] **No centralized `middleware.ts`.** There is no root `middleware.ts`; route protection is implemented per-page and per-route-handler rather than at the edge. Assess whether that is adequate or whether a shared middleware layer is needed for auth, CSRF, and rate limiting.
- [ ] **No backup/restore script, no health-check endpoint, no deployment guide.** Confirm and document the real state of each.
- [ ] **Nine required documentation deliverables do not yet exist** (see "Required Final Deliverables"). `docs/` currently contains only `adr/`, `idea.md`, `running.md`, `role-experience-report.md`.
- [ ] **A Swagger/OpenAPI surface already exists** at `app/api/docs/route.ts` (served with a Swagger UI). Reuse it as the basis for `docs/API_DOCUMENTATION.md` rather than writing the API reference from scratch.

### Architecture documentation
- [ ] Document the application's architecture.
- [ ] Document the complete database entity relationship structure.
- [ ] Document all API endpoints and their responsibilities.
- [ ] Document frontend routing and protected routes.
- [ ] Document role-based permissions.
- [ ] Document the relationship between each user action and its backend implementation.
- [ ] Identify architectural inconsistencies and technical debt.

**Deliverable:** Create `docs/PROJECT_AUDIT.md` documenting the actual implementation, architecture, findings, and known gaps.

# PHASE 2: Authentication, Authorization & User Management

### Authentication
- [ ] User registration works correctly.
- [ ] Login works correctly.
- [ ] Logout invalidates the session/token correctly.
- [ ] Password hashing uses a secure algorithm.
- [ ] Password reset works end to end.
- [ ] Email verification works if implemented.
- [ ] Expired tokens are rejected.
- [ ] Refresh token rotation and invalidation work if applicable. *(This app uses server-side `Session` rows with a signed cookie, not JWTs — verify session expiry, cookie re-issuance, and server-side revocation instead of refresh-token rotation.)*
- [ ] Protected pages cannot be accessed without authentication.
- [ ] Authentication persists correctly after browser refresh.
- [ ] Multiple login sessions behave as intended.
- [ ] Brute-force protection and login rate limiting exist.
- [ ] Sensitive authentication errors do not expose internal details.

**Implementation-specific auth notes:**
- Sessions are **server-side rows** in the `Session` model; the cookie carries the session id plus an HMAC signature (`<id>.<hmac>`) in production. A **tampered cookie must be rejected** — verify the HMAC check actually runs and that a forged id cannot be swapped in.
- `SESSION_SECRET` must be at least 32 bytes; `lib/auth/session.ts` is documented to throw otherwise. **Verify production boot fails on a short/placeholder secret** rather than silently signing with it. `.env.example` ships `dev-session-secret-change-me-in-production-min-32-bytes` — confirm that value is absent from production.
- The cookie must set `httpOnly`, `secure` (in production), and an appropriate `sameSite`. Verify the actual `cookies().set(...)` call in the route handlers rather than assuming.
- **WebAuthn is mandatory for admin writes** (`requireWebAuthn` in `lib/auth/guards.ts` gates `/api/v1/admin/*`). Verify every admin write path calls it, and that a valid admin session without a registered WebAuthn credential is rejected. Check `WEBAUTHN_RP_ID` / `WEBAUTHN_RP_ORIGIN` are set to the real production origin (not `localhost`).
- The **dev store** (`CITYFIX_DEV_STORE=1`) bypasses the signed-cookie path and exposes `/api/dev/*` routes. Verify that `CITYFIX_DEV_STORE` is **unset in production** and that every `/api/dev/*` route returns 404 when it is. A production instance with the dev store enabled is a full authentication bypass — treat it as a critical finding if found.
- The **OTP provider** must be `twilio` in production; the `stub` provider logs codes to the server console. Verify the boot-time provider selection.

### Role-based access control

Verify that the system enforces permissions on the backend, not just by hiding frontend buttons. Guards live in `lib/auth/guards.ts`: `requireRole`, `requireSameCity`, `requireScope` (which enforces the dispatcher's/crew's `(wardId, departmentId)` pair and lets admins through), and the async `requireWebAuthn`. Verify each route handler under `app/api/v1/**` actually calls the right guard — an endpoint that simply reads `session.role` without a scope guard is a likely IDOR.

- [ ] Citizen can only access their permitted resources.
- [ ] Citizen cannot modify another citizen's reports.
- [ ] Dispatcher can access reports within their assigned operational scope.
- [ ] Dispatcher can verify and dispatch reports.
- [ ] Dispatcher cannot perform administrator-only operations.
- [ ] Crew can access only their assigned jobs and permitted information.
- [ ] Crew cannot assign jobs to themselves or other crews without authorization.
- [ ] Crew cannot modify reports belonging to unrelated assignments.
- [ ] Admin has appropriate system-wide access.
- [ ] Admin-only endpoints are protected.
- [ ] Unauthorized API requests return appropriate 401/403 responses.
- [ ] Direct API calls cannot bypass frontend permissions.
- [ ] Role changes take effect correctly.
- [ ] Privilege escalation is prevented.
- [ ] **Cross-city isolation holds** — `requireSameCity` is enforced on every multi-tenant read and write; one city's dispatcher cannot read another city's ticket by guessing an id.
- [ ] **Cross-ward / cross-department isolation holds** for dispatcher and crew scope.
- [ ] **The citizen-facing serializer (`lib/serializers/ticket.ts`) strips internal fields** on every citizen-reachable endpoint — no `reporterId` phone, no internal notes, no crew internal fields leaked. Verify by inspecting actual responses, not by reading the serializer alone.
- [ ] The `/api/dev/*` routes are unreachable in production.

### User management
- [ ] Admin can view users.
- [ ] Admin can search, filter, and paginate users.
- [ ] Admin can create and edit users if supported.
- [ ] Admin can activate/deactivate accounts.
- [ ] Role assignment works correctly.
- [ ] User profile updates work.
- [ ] Password changes work.
- [ ] Invalid and duplicate user information is rejected.
- [ ] User deletion or deactivation preserves required historical records.

# PHASE 3: Citizen Module

The citizen module must provide a complete reporting and tracking experience.

### Report creation
- [ ] Citizen can create a new report.
- [ ] Report title and description are validated.
- [ ] Category selection works.
- [ ] Location selection works.
- [ ] Map-based location selection works if implemented.
- [ ] Latitude and longitude are validated.
- [ ] Address information is stored correctly.
- [ ] Citizens can upload supporting images.
- [ ] File type and file size restrictions are enforced.
- [ ] Multiple image uploads work if supported.
- [ ] Upload failures are handled gracefully.
- [ ] Duplicate or repeated submissions are handled appropriately.
- [ ] Successful submission generates a unique report reference.
- [ ] Report status is initialized correctly.
- [ ] Submission confirmation is displayed.

### Report tracking
- [ ] Citizens can view their own reports.
- [ ] Citizens cannot view private information belonging to other citizens.
- [ ] Report details display correctly.
- [ ] Current report status is accurate.
- [ ] Status history is visible.
- [ ] Assigned crew information is exposed only when appropriate.
- [ ] Citizens can see progress updates.
- [ ] Citizens receive notifications for relevant status changes.
- [ ] Citizens can add comments or additional information if supported.
- [ ] Citizens can edit or withdraw reports only when business rules permit.
- [ ] Resolved reports display resolution information.
- [ ] Pagination, sorting, and filtering work.

### Citizen dashboard
- [ ] Total reports count is accurate.
- [ ] Pending reports count is accurate.
- [ ] In-progress reports count is accurate.
- [ ] Resolved reports count is accurate.
- [ ] Recent activity is accurate.
- [ ] Dashboard data reflects actual database records.
- [ ] Empty states are handled.
- [ ] Loading and error states are handled.
- [ ] **The citizen dashboard reads from the database, not from a local counter.** *(An earlier hotfix was named `ddd-05-counter-placeholder-hotfix` in the `002-004-my-reports` bolt — verify the placeholder was actually removed and the count is derived server-side.)*

# PHASE 4: Dispatcher Module

The dispatcher is responsible for validating incoming reports and coordinating field operations.

**Surfaces:** `app/dispatcher/` (queue, map, monitor, performance, dedup, tickets/[id]) and `app/api/v1/dispatcher/**`.

### Report management
- [ ] Dispatcher can view incoming reports.
- [ ] Reports are displayed with correct information.
- [ ] Dispatcher can search and filter reports.
- [ ] Dispatcher can filter by category, location, priority, and status.
- [ ] Dispatcher can inspect report details.
- [ ] Dispatcher can view uploaded images.
- [ ] Dispatcher can view report locations on a map.
- [ ] Dispatcher can identify duplicate reports.
- [ ] Dispatcher can prioritize reports.
- [ ] Dispatcher can reject invalid reports.
- [ ] Dispatcher must provide a rejection reason.
- [ ] Dispatcher can request additional information if supported.
- [ ] Verified reports transition to the correct status.
- [ ] All decisions are recorded in the report history.
- [ ] **The dispatcher's scope is enforced server-side** — `requireScope` from `lib/auth/guards.ts` must gate the queue and detail queries, not just the map viewport.
- [ ] **Dedup flags can be confirmed or dismissed** (`app/api/v1/dispatcher/dedup-flags/[id]/confirm|dismiss`) and both decisions are recorded in the audit trail.

### Crew dispatching
- [ ] Dispatcher can view available crews.
- [ ] Crew availability is accurate.
- [ ] Crew skills and service categories are considered where applicable.
- [ ] Crew service areas are considered where applicable.
- [ ] Dispatcher can assign a report to a crew.
- [ ] Dispatcher can assign priority and deadlines.
- [ ] Dispatcher can add instructions.
- [ ] Assignment is persisted correctly.
- [ ] Assigned crew receives notification.
- [ ] Report status changes appropriately.
- [ ] Dispatcher can reassign work when necessary.
- [ ] Previous assignments are retained in history.
- [ ] Double assignment and conflicting assignments are prevented where prohibited.
- [ ] Dispatcher can cancel assignments with a recorded reason.
- [ ] Dispatcher can track assignment progress.
- [ ] Dispatcher can identify overdue work.

### Dispatcher dashboard
- [ ] Incoming reports count is accurate.
- [ ] Reports awaiting verification count is accurate.
- [ ] Verified reports count is accurate.
- [ ] Active assignments count is accurate.
- [ ] Available crews count is accurate.
- [ ] Overdue assignments count is accurate.
- [ ] Charts and statistics use real data.
- [ ] Filters affect all relevant dashboard widgets consistently.
- [ ] Dashboard reflects updated operational data.

# PHASE 5: Crew Module

The crew module must work efficiently on mobile devices because field personnel will primarily use it while working outdoors.

### Crew dashboard
- [ ] Crew can view assigned jobs.
- [ ] Crew can distinguish new, accepted, active, and completed assignments.
- [ ] Crew can view job priority.
- [ ] Crew can view job deadlines.
- [ ] Crew can view report location.
- [ ] Crew can view citizen-provided descriptions and images.
- [ ] Crew can view dispatcher instructions.
- [ ] Crew can access navigation to the job location.
- [ ] Crew can see relevant assignment history.

### Job execution
- [ ] Crew can accept an assignment.
- [ ] Crew can reject or report an inability to perform an assignment when permitted.
- [ ] Rejection requires a reason.
- [ ] Crew can start a job.
- [ ] Starting a job updates its status.
- [ ] Crew can add progress updates.
- [ ] Crew can upload before-and-after images.
- [ ] Crew can report issues encountered.
- [ ] Crew can mark work as completed.
- [ ] Completion requires necessary information.
- [ ] Completion evidence is stored correctly.
- [ ] Completion time is recorded.
- [ ] Dispatcher is notified about completion.
- [ ] Citizen is notified about relevant progress.
- [ ] Crew cannot complete unrelated assignments.
- [ ] Crew cannot arbitrarily modify report priority or ownership.
- [ ] Completed work cannot be silently modified.
- [ ] **Crew scope is enforced server-side** — `requireScope` gates the crew ticket list and detail, so a crew member cannot read another crew's assignment by guessing a ticket id.
- [ ] **Crew transitions use the same `transitionTicket()` matrix** as the dispatcher — a crew member cannot perform a dispatcher-only transition.

### Field usability
- [ ] Responsive layout works on mobile.
- [ ] Touch targets are appropriately sized.
- [ ] Forms are usable on small screens.
- [ ] Image uploads work on mobile browsers.
- [ ] Loading and upload progress are visible.
- [ ] Network failures do not silently lose work.
- [ ] Appropriate retry mechanisms exist.
- [ ] Important actions require confirmation.
- [ ] The interface remains usable on slower connections.
- [ ] **The offline write queue works and drains correctly.** *(A crew offline-read capability and a service worker exist — `tests/32-crew-service-worker-staleness.spec.ts` covers stale-cache behaviour, and a crew offline write queue landed in the 2026-10-27 batch. Verify queued writes replay without duplication and that the service worker does not serve a stale dashboard.)*
- [ ] **The client-side photo downscale actually runs before upload** (`lib/photo/downscale.ts` — 1600px long edge, JPEG q80). The server-side defence is the size cap, but the downscale is what makes mobile uploads succeed; verify it is wired into the upload path.
- [ ] **Photo uploads are stored in blob storage, not on the local filesystem.** *(`@aws-sdk/client-s3` is a dependency and `lib/storage/` exists — verify the production path uses the configured bucket, and that no upload silently writes to a local path that will not exist on Vercel.)*

# PHASE 6: Administrator Module

Admin oversees the entire CityFix ecosystem.

**Surfaces:** `app/admin/` (dashboard, cities, cities/[id]/{setup,taxonomy,users,wards,adoption}, tickets, tickets/[id], audit) and `app/api/v1/admin/**`. **Every admin write requires a WebAuthn assertion** (`requireWebAuthn`).

*Current state (verify, don't assume):* a scan of `app/api/v1/admin/**` shows `requireWebAuthn` on the write handlers. Three routes do **not** call it — `cities/[id]/adoption` (GET), `cities/[id]/adoption/export` (GET), and `tickets/[id]` (GET). All three are read-only, which is consistent with the "WebAuthn mandatory for **writes**" rule. **Confirm this is deliberate**, and confirm that no route that mutates state is missing the gate — in particular any `POST`/`PUT`/`PATCH`/`DELETE` handler that changes a ticket's priority, ownership, or status.

### System overview
- [ ] Admin dashboard shows total citizens.
- [ ] Total dispatchers are accurate.
- [ ] Total crews are accurate.
- [ ] Total reports are accurate.
- [ ] Pending reports are accurate.
- [ ] Active assignments are accurate.
- [ ] Resolved reports are accurate.
- [ ] Rejected reports are accurate.
- [ ] Overdue reports and assignments are visible.
- [ ] Resolution statistics are accurate.
- [ ] All metrics are calculated from real data.
- [ ] Date filters work correctly.
- [ ] Geographic filters work if supported.
- [ ] **Admin metrics come from real aggregates** — the adoption and performance routes must query the database, not return a fixed shape with placeholder values. *(The `lib/admin/adoption.ts` file carries `TODO(migration)` notes about the citizen count definition and a staging distinction — resolve or document those rather than leaving the metric ambiguous.)*

### Administrative management
- [ ] Manage citizens.
- [ ] Manage dispatchers.
- [ ] Manage crews.
- [ ] Manage roles and permissions.
- [ ] Manage report categories.
- [ ] Manage priorities.
- [ ] Manage service zones and operational areas.
- [ ] Manage system configuration.
- [ ] Manage notification settings.
- [ ] Review report and assignment history.
- [ ] Monitor dispatcher workload.
- [ ] Monitor crew workload.
- [ ] Identify bottlenecks and operational inefficiencies.

### Monitoring and reporting
- [ ] Reports by category.
- [ ] Reports by location.
- [ ] Reports by status.
- [ ] Reports by date range.
- [ ] Average verification time.
- [ ] Average dispatch time.
- [ ] Average resolution time.
- [ ] SLA compliance.
- [ ] Crew performance.
- [ ] Dispatcher performance.
- [ ] Repeated problem locations.
- [ ] Export reports to CSV/Excel/PDF if supported.
- [ ] Exported data respects user permissions and filters.

# PHASE 7: Complete Business Workflow Verification

This is one of the most important phases.

Test the complete lifecycle of a report instead of testing individual screens independently.

### Standard workflow

- [ ] Citizen submits a report.
- [ ] Report is saved in PostgreSQL.
- [ ] Report appears in dispatcher dashboard.
- [ ] Dispatcher opens and verifies the report.
- [ ] Dispatcher assigns an appropriate crew.
- [ ] Crew receives the assignment.
- [ ] Crew accepts the assignment.
- [ ] Crew starts the job.
- [ ] Crew updates progress.
- [ ] Citizen sees the updated status.
- [ ] Crew completes the work.
- [ ] Crew submits completion evidence.
- [ ] Dispatcher reviews the completion if required.
- [ ] Report transitions to resolved.
- [ ] Citizen receives resolution notification.
- [ ] Admin sees updated statistics.
- [ ] Complete activity history is preserved.

### Alternative and failure workflows

- [ ] Dispatcher rejects a report.
- [ ] Citizen receives rejection notification and reason.
- [ ] Dispatcher requests additional information.
- [ ] Citizen provides additional information.
- [ ] Dispatcher reopens verification.
- [ ] Crew rejects an assignment.
- [ ] Dispatcher reassigns the job.
- [ ] Crew reports an operational issue.
- [ ] Crew cannot complete a job.
- [ ] Dispatcher cancels an assignment.
- [ ] Dispatcher reopens a resolved report when permitted.
- [ ] Citizen submits a duplicate or similar report.
- [ ] Two dispatchers attempt to process the same report simultaneously.
- [ ] Crew attempts to update an assignment after reassignment.
- [ ] Unauthorized users attempt to change report status.
- [ ] Notifications fail while the main business operation succeeds.
- [ ] Network connection is interrupted during an important operation.

For every scenario, verify database state, API responses, permissions, notifications, and activity history.

**Implementation notes for this workflow:**
- The canonical status trail is `Submitted → Routed → In progress → Resolved`, enforced by `lib/platform/transitions.ts` (`transitionTicket()`, which throws `InvalidTransitionError` on an illegal move). **Verify the transition matrix itself** — an endpoint that bypasses `transitionTicket()` and writes `status` directly is a defect.
- **Dedup**: `lib/platform/dedup.ts` applies a 50m default radius (per-city overridable). A duplicate submit must surface the dedup prompt to the citizen (the `009-dedup-prompt` story) and must **not** create a second `Ticket` without consent. A dedup *decline* must be logged as a structured event and flagged for dispatcher review (`DedupFlag` + `app/api/v1/dispatcher/dedup-flags/*`).
- **Geofence**: `lib/report-geofence.ts` rejects reports outside the city boundary at submit time. Verify the boundary comes from the real `Ward.polygonGeoJson` in the bootstrap payload (`app/api/report/bootstrap/route.ts`) and is not a hard-coded stub.
- **Photos**: cap is 3 per report, 2 for narrow categories, minimum 1 (`lib/report-photo-cap.ts`). Before/after crew photos are a separate surface (`app/api/v1/crew/tickets/[id]/photos`). Verify the caps are enforced **server-side**.
- **Completion evidence** must be stored on `TicketPhoto` with the trail entry written in the same operation.
- **Admin statistics** come from `app/api/v1/admin/tickets` and the adoption/performance routes — verify they read real aggregates, not a cached or seeded summary.

# PHASE 8: Database & Data Integrity

### PostgreSQL / Prisma
- [ ] Review every database table (17 models: `City`, `Ward`, `Department`, `Crew`, `SlaPolicy`, `Category`, `User`, `OtpCode`, `WebAuthnChallenge`, `Session`, `PushSubscription`, `Ticket`, `TicketTrailEntry`, `TicketPhoto`, `AuditEntry`, `DedupFlag`).
- [ ] Verify foreign key relationships.
- [ ] Verify appropriate primary keys.
- [ ] Verify unique constraints.
- [ ] Verify NOT NULL constraints.
- [ ] Verify appropriate CHECK constraints.
- [ ] Verify indexes for frequently queried fields.
- [ ] Review slow and inefficient queries.
- [ ] Check for N+1 query problems.
- [ ] Verify transaction boundaries.
- [ ] Verify rollback behavior.
- [ ] Prevent orphaned records.
- [ ] Prevent inconsistent report and assignment states.
- [ ] Verify timestamp handling and timezone consistency.
- [ ] Verify soft deletion behavior if implemented.
- [ ] Verify migrations work from an empty database.
- [ ] Verify migrations work against an existing database.
- [ ] Ensure sensitive data is not unnecessarily stored.
- [ ] Verify backup and restoration procedures.

**Implementation-specific database notes:**
- Three migrations exist: `20261012102438_init`, `20261013000000_add_ticket_photo`, `20261027140000_platform_gaps`. The third was previously authored but unapplied (the Neon instance was unreachable with `P1001`); it now reports as applied against the local database. **Verify against the production database too** — the local `migrate status` result does not prove the production database is current. Run `npm run db:migrate:deploy` against production and record the output.
- `lib/platform/db-guard.ts` refuses to start production against a loopback `DATABASE_URL`. **Verify that guard actually fires** — a production instance pointed at a local database is a serious data-loss and data-isolation risk.
- Verify the migration **rollback/recovery strategy**. A forward-only migration set with no `down` path means a failed production migration has no automated recovery.
- Verify `Session` rows are expired and purged — an unbounded session table is a slow leak and a revocation-latency risk.
- Verify `PushSubscription` rows are not orphaned when a user is deactivated or a subscription 410s.

### Data consistency
- [ ] Every report has a valid owner.
- [ ] Every assignment references a valid report and crew.
- [ ] Assignment history is preserved.
- [ ] Report history is preserved.
- [ ] Status transitions are valid.
- [ ] Deactivated users cannot continue performing unauthorized actions.
- [ ] Deleting users does not break historical records.
- [ ] Concurrent updates cannot silently overwrite critical changes.
- [ ] Critical multi-step operations use database transactions.
- [ ] Business invariants are enforced on the server.

### Concurrency (explicit priority — do not skip)

This is one of the three areas the business has called out as a differentiator. It needs a dedicated test, not a code reading.

- [ ] **Two dispatchers assign the same crew to the same ticket concurrently** — exactly one assignment must win; the other must get a clear conflict error, not a silent double-booking.
- [ ] **Two crew members update the same ticket concurrently** — the second update must not overwrite the first silently. Look for an optimistic-locking version column or an equivalent guard; if neither exists, that is a finding.
- [ ] **Crew updates a ticket after it has been reassigned** — the stale write must be rejected, not applied.
- [ ] **Two dispatchers transition the same ticket to different statuses simultaneously** — `lib/platform/transitions.ts` must enforce the legal transition set atomically, and exactly one transition may commit.
- [ ] **Ticket assignment + status transition + trail entry happen in one transaction** — a crash between them must not leave a ticket in an inconsistent state with no trail entry.
- [ ] **The dedup check and the ticket insert are race-safe** — two identical reports submitted concurrently must not both bypass the dedup window.
- [ ] **The in-process rate limiter's cross-instance limitation is documented** — on Vercel, two concurrent requests may land on different instances and both be allowed. Determine whether that is acceptable for the operations in question or whether a shared store is required.
- [ ] **Concurrent updates use an appropriate isolation level** — verify `prisma.$transaction(...)` is used with the right options and that read-modify-write sequences are not vulnerable to lost updates.

# PHASE 9: Backend API Quality

### API implementation
- [ ] Every frontend API integration points to an implemented endpoint.
- [ ] No important endpoint returns hardcoded or mock data.
- [ ] HTTP methods are used appropriately.
- [ ] HTTP status codes are correct.
- [ ] Request validation exists.
- [ ] Response structures are consistent.
- [ ] Error responses are consistent.
- [ ] Pagination is implemented for large datasets.
- [ ] Sorting and filtering are validated.
- [ ] API versioning is considered. *(Routes are already namespaced under `/api/v1/**` for the role-scoped surface; verify the unversioned `/api/tickets`, `/api/profile`, `/api/report/*`, `/api/auth/*` and `/api/docs` routes are intentional and documented — they are not a versioning inconsistency if they are the public/bootstrap surface.)*
- [ ] Request timeouts are configured appropriately.
- [ ] Database errors are handled safely.
- [ ] Unexpected exceptions are handled centrally.
- [ ] API documentation is accurate. *(An OpenAPI spec is already generated — see `npm run docs:generate`, `app/api/docs/route.ts`, and `app/api/docs/spec/route.ts`. Verify it matches the live routes rather than regenerating from scratch.)*
- [ ] CORS is configured correctly.
- [ ] Rate limiting is implemented. *(Note: `lib/platform/rate-limit.ts` is an **in-process token bucket** keyed by `(actor, ticket)`. In-process state does not survive a cold start and is **not shared across serverless instances** — on Vercel it provides per-instance throttling only. Assess whether that is sufficient for the sensitive operations the checklist calls out, and document the limitation.)*
- [ ] Request payload sizes are restricted.
- [ ] Sensitive information is never exposed in responses.

### Code quality
- [ ] Business logic is not unnecessarily duplicated.
- [ ] Route handlers are not overloaded with business logic. *(There is no controller layer — business logic belongs in `lib/`, and a `route.ts` that reaches into Prisma directly instead of calling a service is a finding.)*
- [ ] Database access is structured consistently.
- [ ] Services have clear responsibilities.
- [ ] No circular dependencies.
- [ ] No unused or abandoned API endpoints.
- [ ] No swallowed exceptions.
- [ ] No empty catch blocks.
- [ ] No unsafe dynamic SQL. *(Prisma parameterizes by default — the risk is raw `$queryRawUnsafe` / `$executeRawUnsafe`, which must not appear in app code.)*
- [ ] No hardcoded secrets or credentials.
- [ ] No debugging code in production paths.
- [ ] **Service-layer functions return `Result<T, E>` and never throw** across boundaries; `ApiError` from `lib/auth/guards.ts` is the sanctioned error type. Verify no `throw` escapes a service function into a route handler without being converted.
- [ ] **All DB access goes through the `lib/db-switch.ts` facade** — no direct Prisma client instantiation in app code, so the dev-store seam stays intact.
- [ ] **No user-facing copy is hard-coded in components** — all strings resolve through `lib/i18n/keys.ts` via `t(key, vars)`. Run `npm run check:i18n` and report its output.
- [ ] **Typecheck is clean**: `npx tsc --noEmit` passes with zero errors.

# PHASE 10: Frontend Quality & UX

**Design system:** the source of truth is `design-artifacts/D-Design-System/01-Visual-Design/tokens.css` plus the primitive library in `components/ui/`. The app is Bangla-first with a typed i18n registry at `lib/i18n/keys.ts` (1000+ keys). Iconography is the Phosphor registry (`@phosphor-icons/react`). **Do not introduce a competing design system** — the project deliberately declined to run the `ui-ux-pro-max` skill's `--persist` output so there would be exactly one source of truth.

### General UI
- [ ] All routes work.
- [ ] All navigation links work.
- [ ] All buttons perform their intended actions.
- [ ] All forms submit correctly.
- [ ] All dropdowns and filters work.
- [ ] Modals open and close correctly.
- [ ] Tables support expected sorting and pagination.
- [ ] Search works correctly.
- [ ] Loading states exist.
- [ ] Empty states exist.
- [ ] Error states exist.
- [ ] Success feedback exists.
- [ ] Destructive actions require confirmation.
- [ ] Form validation messages are understandable.
- [ ] No broken images or missing assets.
- [ ] No placeholder text or unfinished UI.
- [ ] No console errors or unexpected warnings.
- [ ] No broken responsive layouts.
- [ ] No inconsistent visual components.

### React / Next.js-specific checks
- [ ] Components have appropriate responsibilities.
- [ ] State management is consistent.
- [ ] No unnecessary re-renders in critical views.
- [ ] Effects have correct dependencies and cleanup.
- [ ] No memory leaks from subscriptions or event listeners.
- [ ] API requests handle cancellation where appropriate.
- [ ] Race conditions are prevented.
- [ ] Stale data is handled correctly.
- [ ] Form state does not unexpectedly reset.
- [ ] Error boundaries are implemented (`app/**/error.tsx`, `not-found.tsx`, `global-error.tsx`).
- [ ] Authentication state is consistent across tabs.
- [ ] Protected routes behave correctly — both server components and client components.
- [ ] Large lists are optimized where necessary.
- [ ] No unnecessary state duplication.
- [ ] Server Components do not leak secrets or Prisma objects to the client payload.
- [ ] `use client` boundaries are minimal and intentional (not applied blanket-wide).
- [ ] Route Handlers return correct status codes for every branch, including auth failures and validation errors.
- [ ] Server Actions, if any are used, are authorized server-side (a client-only guard is not sufficient).
- [ ] Dynamic routes (`[id]`, `[catId]`, etc.) validate and scope their parameters.
- [ ] No `next/image` misconfiguration or unoptimized remote-image domains leaking into production.
- [ ] Metadata / i18n `lang` attribute is set correctly for the Bangla-first surfaces.

### Accessibility
- [ ] Semantic HTML is used.
- [ ] Keyboard navigation works.
- [ ] Forms have accessible labels.
- [ ] Focus management works in dialogs.
- [ ] Color contrast is sufficient.
- [ ] Status indicators are not dependent on color alone.
- [ ] Images have appropriate alternative text.
- [ ] Screen readers can interpret important actions.

### Localization & Bangla-first surfaces

The product is Bangla-first with English secondary. This is a product requirement, not a nicety.

- [ ] **No user-facing string is hard-coded** — every visible string resolves through `t(key, vars)` from `lib/i18n/keys.ts`. Run `npm run check:i18n` and report its output.
- [ ] **Every key has both `bn` and `en` values** — a missing translation is a broken citizen-facing surface, not a cosmetic issue.
- [ ] **`<html lang="bn">` is set** (`app/layout.tsx` sets it on the root layout) and any page with explicit Bangla content sets it correctly. Verify no page ships with `lang="en"` by accident.
- [ ] **The Bangla webfont actually loads.** `Noto Sans Bengali` is loaded from `fonts.googleapis.com` with the `woff2` files from `fonts.gstatic.com`; both hosts must be in the CSP `style-src` and `font-src`. If either is missing, the browser silently falls back to a system font and the entire UI loses its typography — this was a real app-wide defect once, so verify it renders.
- [ ] **Interpolation variables resolve** — a key with an unmatched `{var}` renders the literal placeholder to the user. There is an existing contract test (`tests/unit/i18n-placeholder-contract.test.ts`); keep it passing.
- [ ] **The bilingual toggle** switches locale across all surfaces, including the auth flow, the report flow, and the dashboards.
- [ ] **Text expands correctly in Bangla** — verify no clipping, overflow, or truncation on the longest citizen-facing strings in both locales, at the 390px mobile width.
- [ ] **Numerals, dates, and currency format correctly for the locale** — verify date formatting in the ticket trail and dashboard metrics.
- [ ] **Bangla is used in the MapLibre `text-field` layers** — glyph ranges must be fetched; the CSP already allows `demotiles.maplibre.org`, and a failure renders invisible map pins.

# PHASE 11: Notifications & Communication

Verify all notification channels that exist in the project.

**Channels in this codebase:** (a) **Web Push** via `lib/platform/push.ts` + `PushSubscription` model + `app/api/push/subscribe/route.ts`; (b) **OTP SMS** via `lib/auth/otp.ts` + `lib/auth/otp-provider/`; (c) **In-app** surfaces (`app/feed`, `app/reports/[id]`, activity feeds); (d) **Audit trail** (`AuditEntry`) for the admin audit console at `app/admin/audit`.

**Known blocker:** the Web Push *transport* is wired but the *send* is a v1 stub (`sendTicketPush()` logs and returns a count; no `web-push.sendNotification()` call). Establish first whether a channel is real, in-app only, or stubbed — then verify each notification item against the channel that actually exists. Do not mark a notification item PASS on the basis of a stub or a log line.

- [ ] Citizen receives report submission confirmation.
- [ ] Citizen receives report verification updates.
- [ ] Citizen receives rejection information.
- [ ] Citizen receives assignment/progress updates where appropriate.
- [ ] Citizen receives resolution notification.
- [ ] Dispatcher receives new report notifications.
- [ ] Dispatcher receives crew progress notifications.
- [ ] Dispatcher receives completion notifications.
- [ ] Crew receives new assignment notifications.
- [ ] Crew receives reassignment notifications.
- [ ] Admin receives important system alerts if implemented.
- [ ] Notification preferences are respected.
- [ ] Failed notifications can be retried.
- [ ] Duplicate notifications are prevented.
- [ ] Notification delivery does not corrupt the main business transaction.
- [ ] Notification history is stored if required.
- [ ] Read/unread status works if implemented.
- [ ] **Push send is a real wire call, not a stub** — or the stub is explicitly accepted as a documented v1.1 limitation in `KNOWN_ISSUES.md` and the affected checklist items are marked NOT VERIFIED (not PASS).
- [ ] **OTP provider in production is `twilio`, not `stub`** — verify the deployment environment variable, not just `.env.example`.
- [ ] Push subscription records are cleaned up when a subscription expires or a user is deactivated (stale `PushSubscription` rows would otherwise accumulate).

# PHASE 12: Security Audit

Perform a security review based on OWASP Top 10 and relevant API security risks.

- [ ] SQL injection protection.
- [ ] Cross-site scripting (XSS) protection.
- [ ] Cross-site request forgery (CSRF) protection where applicable.
- [ ] Broken access control prevention.
- [ ] IDOR protection.
- [ ] Secure password storage.
- [ ] Secure token management.
- [ ] Secure cookie configuration if cookies are used.
- [ ] Input validation and sanitization.
- [ ] File upload security.
- [ ] File type verification beyond file extensions.
- [ ] File storage access control.
- [ ] Rate limiting for sensitive operations.
- [ ] Brute-force protection.
- [ ] Security headers.
- [ ] HTTPS enforcement in production.
- [ ] Secrets stored in environment variables or a secret manager.
- [ ] No secrets committed to Git.
- [ ] Dependency vulnerability scanning.
- [ ] Sensitive information excluded from logs.
- [ ] Error responses do not expose stack traces.
- [ ] Audit logs cannot be modified by unauthorized users.
- [ ] Administrative actions are auditable.
- [ ] User enumeration is prevented where relevant.

**Implementation-specific security notes:**
- **Security headers are already configured** in `next.config.js`: CSP, HSTS (production only), `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`. **Verify they are actually served** in production (curl the response headers), not merely present in source.
- **The CSP is deliberately permissive in two places** — `'unsafe-inline'` and `'unsafe-eval'` are in `script-src`, and `'unsafe-inline'` is in `style-src`. Assess whether the inline-script relaxation is still required by Next.js's own runtime, and whether `unsafe-eval` can be removed in production. Both are findings if they can be tightened without breaking the app.
- **The CSP allowlist is load-bearing, not decorative.** Removing `tile.openstreetmap.org` yields a silent blank map; removing `fonts.gstatic.com` yields a silent font fallback; removing `demotiles.maplibre.org` yields invisible map pins; removing `unpkg.com` yields a blank Swagger page. **Any change to the CSP must be verified against all four surfaces**, not just the page you were looking at.
- **The session cookie must be `httpOnly` + `secure` (prod) + `sameSite`.** Verify the actual `cookies().set(...)` call.
- **Login brute-force protection is in-process** (`lib/auth/login-lockout.ts` — an in-memory `Map` of failed attempts, documented as promotable to a persistent column on `User`). On Vercel this is per-instance and resets on a cold start. Assess whether that satisfies the brute-force requirement, and document the limitation if not.
- **Uploaded photos**: verify the type is checked by content (magic bytes), not by extension or client-declared MIME; verify the size cap is enforced server-side; verify the blob key is not guessable and that reads are authorized.
- **The dev store is a full auth bypass.** `CITYFIX_DEV_STORE=1` skips the signed-cookie path and enables `/api/dev/*` (including `bootstrap-admin` and `promote-admin`). Verify those routes 404 in production and that the flag is unset there.
- **Audit rows must be append-only** — verify no endpoint allows an `AuditEntry` to be updated or deleted.
- **Prisma `$queryRawUnsafe` / `$executeRawUnsafe` must not appear in app code.**
- **No secret is committed to Git.** `.env.local` exists in the working tree — verify it is gitignored and never staged, and that `git log` contains no credentials.

# PHASE 13: Performance & Scalability

Think beyond a small demo dataset.

Evaluate the application with realistic growth assumptions.

Test with:
- 10,000+ citizen accounts.
- 1,000+ crews and dispatchers combined.
- 100,000+ reports.
- Large report histories and uploaded images.
- Multiple users operating simultaneously.

### Backend performance
- [ ] Identify slow database queries.
- [ ] Review query execution plans.
- [ ] Add missing indexes.
- [ ] Avoid unnecessary database round trips.
- [ ] Optimize expensive aggregations.
- [ ] Implement pagination rather than loading entire datasets.
- [ ] Prevent N+1 queries.
- [ ] Review connection pool configuration. *(Serverless reality: on Vercel each instance opens its own pool — verify the pool size is sized for that, or that a pooled connection string (e.g. Neon PgBouncer / Supabase pooler) is used, or that connection exhaustion under concurrency is not a live risk.)*
- [ ] Review memory consumption.
- [ ] Review CPU-intensive operations.
- [ ] Evaluate caching opportunities.
- [ ] Avoid premature optimization.
- [ ] **Verify the serverless timeout budget.** The default Vercel function timeout may be shorter than the app's slowest operation. Check the slowest routes (photo upload, adoption export, map queries, dedup scans) against the limit.
- [ ] **Verify serverless cold-start behavior.** The in-process rate limiter and login lockout are cold-start-reset on Vercel; check what else lives in module scope that would be lost or reset.

### Frontend performance
- [ ] Review initial bundle size.
- [ ] Implement code splitting where useful.
- [ ] Lazy-load heavy pages. *(MapLibre is the heavy one — verify it is dynamically imported and not in the initial bundle for citizen routes that do not show a map.)*
- [ ] Optimize image loading. *(Recharts is also heavy — verify chart primitives are code-split out of the dashboard bundles.)*
- [ ] Avoid unnecessary API requests.
- [ ] Prevent excessive component re-rendering.
- [ ] Optimize dashboards and data tables.
- [ ] Review Core Web Vitals.
- [ ] Test on slower mobile devices and networks. *(Field crews on 3G/4G in Dhaka are the primary mobile audience — this is a real product constraint, not a synthetic one.)*

### Load testing
- [ ] Test concurrent citizen submissions.
- [ ] Test concurrent dispatcher operations.
- [ ] Test multiple crews updating assignments.
- [ ] Test dashboard queries under load.
- [ ] Test file uploads under load.
- [ ] Verify system behavior under resource pressure.
- [ ] Identify bottlenecks and document capacity limits.
- [ ] **Document the connection-pool ceiling.** With serverless functions each holding a pool, the maximum sustainable concurrency against PostgreSQL is a hard capacity number. Compute it, then state it in `KNOWN_ISSUES.md` — the business needs to know the ceiling before a city-scale incident, not after.

# PHASE 14: Testing & Quality Assurance

**Existing infrastructure:** Vitest unit suite under `tests/unit/` (115 files / 2014 tests, currently green). Playwright route specs under `tests/` (34 spec files / 358 specs, `testMatch: '*.spec.ts'` so the Vitest files are not swept in). Visual baselines for the design mockups. CI in `.github/workflows/ci.yml`.

**Audit the tests themselves** — a green suite that asserts nothing is a false PASS. Check that assertions are meaningful, that they would fail on a regression, and that no test is a tautology.

### Unit testing
- [ ] Test backend business logic.
- [ ] Test validation rules.
- [ ] Test authorization rules.
- [ ] Test status transitions.
- [ ] Test assignment logic.
- [ ] Test important React components and hooks.
- [ ] Test utility functions.
- [ ] **Verify the 80% line-coverage floor is met** (`npm run test:unit:coverage`) and that CI enforces it.
- [ ] **Verify no test asserts a tautology** (`expect(true)`, `assert True`, or a snapshot that was regenerated to match broken output).

### Integration testing
- [ ] Test API endpoints against a real test database. *(Note: the unit suite and CI run against the in-memory dev store via `CITYFIX_DEV_STORE=1`. That is a useful seam but it is **not** PostgreSQL — the Prisma path is only exercised by the Playwright specs and by manual runs against a real database. **Verify that the Prisma path is actually covered somewhere**, and treat "the unit tests pass" as insufficient evidence for database-level behaviour.)*
- [ ] Test authentication flows.
- [ ] Test role permissions.
- [ ] Test report creation and retrieval.
- [ ] Test verification and dispatching.
- [ ] Test crew assignment and completion.
- [ ] Test notifications.
- [ ] Test file uploads.
- [ ] Test database transactions.

### End-to-end testing
Use Playwright — it is already the project's E2E framework with 32 route specs. Extend it rather than introducing a second runner.

Create separate test users for:
- Citizen.
- Dispatcher.
- Crew.
- Admin.

Test the complete workflow from report creation to resolution.

### Negative testing
- [ ] Invalid input.
- [ ] Missing required fields.
- [ ] Invalid authentication.
- [ ] Expired authentication.
- [ ] Unauthorized role.
- [ ] Invalid report IDs.
- [ ] Missing database records.
- [ ] Duplicate submissions.
- [ ] Concurrent operations.
- [ ] Oversized uploads.
- [ ] Unsupported file formats.
- [ ] Database unavailable.
- [ ] External service unavailable.
- [ ] Network interruption.
- [ ] Unexpected server errors.

### Regression testing
- [ ] Existing functionality continues working after fixes.
- [ ] No existing routes break.
- [ ] No role permissions regress.
- [ ] No database migration breaks existing records.
- [ ] No visual regressions in major pages.

# PHASE 15: Production Deployment & DevOps

### Environment configuration
- [ ] Separate development, testing, staging, and production configurations.
- [ ] No development secrets in production.
- [ ] Environment variables are documented.
- [ ] Production build works. *(Verify `npm run build` succeeds — it runs `prisma generate && next build`.)*
- [ ] Production startup works. *(Verify `npm start`, which runs `scripts/start-next.mjs`.)*
- [ ] Database connection configuration is correct.
- [ ] Production CORS configuration is restricted.
- [ ] HTTPS is configured.
- [ ] Frontend and backend deployment configuration is documented.
- [ ] **`CITYFIX_DEV_STORE` is unset in production** — the dev store bypasses signed-cookie auth and exposes `/api/dev/*`.
- [ ] **`SESSION_SECRET` in production is a real high-entropy value**, not the `.env.example` placeholder.
- [ ] **`OTP_PROVIDER=twilio` in production** with all three `TWILIO_*` variables set.
- [ ] **`WEBAUTHN_RP_ID` / `WEBAUTHN_RP_ORIGIN` point at the real production origin**, not `localhost`.
- [ ] **`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` are set in production**, or the push limitation is documented as accepted.
- [ ] **Blob storage credentials (`@aws-sdk/client-s3` is a dependency) are configured in production** — verify the R2/S3/S3-compatible bucket and the path prefix used by `lib/storage/`.

### Database operations
- [ ] Production migration process is documented.
- [ ] Database backup is configured.
- [ ] Backup restoration has been tested.
- [ ] Connection pooling is configured.
- [ ] Database monitoring is available.
- [ ] Migration rollback or recovery strategy exists.

### Reliability
- [ ] Health check endpoint exists. *(Currently absent — no `/api/health` route was found. This is a real gap.)*
- [ ] Readiness checks verify required dependencies.
- [ ] Application restarts safely after crashes.
- [ ] Graceful shutdown is implemented.
- [ ] Logs are structured.
- [ ] Critical errors are monitored.
- [ ] API availability can be monitored.
- [ ] Disk and database storage usage can be monitored.
- [ ] External integration failures are observable.
- [ ] Background jobs can recover from failures.
- [ ] Deployment rollback strategy exists.

### CI/CD
- [ ] Automated linting. *(Exists: `npm run lint`.)*
- [ ] Automated type checking. *(Exists: `npx tsc --noEmit`.)*
- [ ] Automated unit tests. *(Exists: `npm run test:unit`.)*
- [ ] Automated integration tests. *(No dedicated integration job — verify whether the Playwright route specs count as integration and are run in CI.)*
- [ ] Production build validation. *(Exists.)*
- [ ] Dependency security scanning. *(Verify — `npm audit` / Dependabot are not obviously configured.)*
- [ ] Environment-specific deployment.
- [ ] Deployment verification.
- [ ] Database migration execution is controlled.
- [ ] **The 80% line-coverage floor is enforced in CI**, not merely aspirational. *(The team policy requires it; verify the CI workflow actually fails below the floor.)*
- [ ] **The trunk branch in CI matches the team's actual trunk.** *(`team.md` sets the trunk to `prd-development`; `ci.yml` triggers on both `prd-development` and `main`. The repository's current checked-out branch is `main` — reconcile this before trusting the CI status.)*
- [ ] **Visual regression baselines are gating** — verify a deliberately-broken mockup fails the CI job.

# PHASE 16: Documentation & Handover

- [ ] Complete README.md.
- [ ] Architecture documentation.
- [ ] Database schema documentation.
- [ ] API documentation. *(An OpenAPI spec generator already exists — `npm run docs:generate`, with a Swagger UI at `/api/docs`. Build the document from that rather than from scratch.)*
- [ ] Authentication documentation. *(Sessions, Argon2, OTP, WebAuthn — the four mechanisms, plus which operations require WebAuthn.)*
- [ ] Role and permission documentation. *(The guard matrix: `requireRole` / `requireSameCity` / `requireScope` / `requireWebAuthn` against every route.)*
- [ ] Business workflow documentation.
- [ ] Environment variable reference.
- [ ] Local development setup guide. *(See the existing `docs/running.md`.)*
- [ ] Database setup and migration guide.
- [ ] Testing guide.
- [ ] Deployment guide.
- [ ] Backup and recovery guide.
- [ ] Troubleshooting guide.
- [ ] Known limitations documented.
- [ ] **i18n contribution guide** — the app is Bangla-first with a 1000+ key registry in `lib/i18n/keys.ts`; a new contributor must know to add keys there, never inline copy. Document `npm run check:i18n`.
- [ ] **Design-system reference** — the token system (`design-artifacts/D-Design-System/01-Visual-Design/tokens.css`) and the `components/ui/` primitive library are the design source of truth; document how to use them rather than inventing new patterns.

A developer unfamiliar with the project should be able to clone it, configure it, run it, test it, and deploy it using the documentation.

---

# PHASE 17: Final Production Acceptance Criteria

The project cannot be declared production-ready until all critical requirements are satisfied.

### Mandatory conditions

- [ ] All four roles work correctly.
- [ ] All primary business workflows work end to end.
- [ ] No critical or high-severity security vulnerabilities remain.
- [ ] No critical business logic defects remain.
- [ ] No broken primary functionality.
- [ ] No fake/mock data in production paths.
- [ ] No unauthorized data access.
- [ ] No known data integrity issues.
- [ ] Database migrations work.
- [ ] Production build succeeds.
- [ ] Automated tests pass.
- [ ] E2E tests pass for critical workflows.
- [ ] Backup and recovery have been verified.
- [ ] Application logging and monitoring work.
- [ ] Deployment procedure is documented.
- [ ] Known limitations are explicitly documented.
- [ ] **The production environment has no dev-store, stub-OTP, or placeholder-secret exposure** — these are the three settings that turn a "working" app into an unsafe one.
- [ ] **Concurrency behaviour is demonstrated, not assumed** — the conflicting-write scenarios above were actually executed and the outcome recorded.
- [ ] **The audit trail demonstrably answers "who did what, when"** for verify / assign / re-prioritize / resolve.
- [ ] **Operational metrics are computed from real data** — pending duration, verification time, dispatch time, resolution time, SLA compliance, repeated problem locations.

Do not claim 100% completeness merely because the checklist has been reviewed. Only mark an item PASS when there is verifiable evidence.

---

# PHASE 18: Execution Strategy

Do not execute the entire audit as one enormous task.

Follow this order:

**Stage 1 – Discovery**
1. Inspect the repository.
2. Understand the architecture.
3. Map existing features.
4. Generate the initial audit report.
5. Identify missing functionality and risks.

**Stage 2 – Functional completion**
1. Fix authentication and authorization.
2. Complete citizen functionality.
3. Complete dispatcher functionality.
4. Complete crew functionality.
5. Complete admin functionality.
6. Fix cross-role workflows.
7. Verify notifications.

**Stage 3 – Technical quality**
1. Fix database issues.
2. Fix API issues.
3. Fix frontend issues.
4. Address security vulnerabilities.
5. Optimize performance.

**Stage 4 – Quality assurance**
1. Implement missing tests.
2. Execute unit tests.
3. Execute integration tests.
4. Execute E2E tests.
5. Perform regression testing.
6. Perform load testing.

**Stage 5 – Production readiness**
1. Configure production environments.
2. Configure monitoring and logging.
3. Verify backups and recovery.
4. Verify CI/CD.
5. Complete documentation.
6. Perform final production acceptance audit.

For each stage:
- Maintain a checklist of completed, pending, blocked, and failed items.
- Record the actual evidence supporting each completion.
- Fix discovered issues before proceeding when they affect the next stage.
- Rerun affected tests after fixes.
- Keep changes small enough to review and debug.

# Required Final Deliverables

Create and maintain these files:

1. `docs/PROJECT_AUDIT.md` – Complete understanding of the existing project.
2. `docs/PRODUCTION_READINESS_CHECKLIST.md` – Master checklist with PASS, FAIL, NOT VERIFIED, and NOT APPLICABLE statuses.
3. `docs/ARCHITECTURE.md` – Application architecture and system design.
4. `docs/API_DOCUMENTATION.md` – API endpoints, contracts, and permissions.
5. `docs/TESTING_REPORT.md` – Test scenarios, results, and coverage.
6. `docs/SECURITY_AUDIT.md` – Security findings and remediation.
7. `docs/DEPLOYMENT_GUIDE.md` – Production deployment instructions.
8. `docs/KNOWN_ISSUES.md` – Remaining defects, limitations, and technical debt.
9. `docs/CHANGELOG.md` – Changes introduced during this audit.

**None of these exist yet** — `docs/` currently holds only `adr/`, `idea.md`, `running.md`, and `role-experience-report.md`. Sources you can build from rather than starting cold:

| Deliverable | Build from |
|---|---|
| `ARCHITECTURE.md` | `design-artifacts/E-Development/000-tech-audit.md`, `.specsmd/aidlc/memory-bank/standards/*`, `aidlc/spaces/default/memory/{org,team,project}.md`, `prisma/schema.prisma`, `next.config.js` |
| `API_DOCUMENTATION.md` | `npm run docs:generate` → `app/api/docs/spec/route.ts` (OpenAPI) + the Swagger UI at `/api/docs`; cross-check against the 65 live route handlers |
| `TESTING_REPORT.md` | `npm run test:unit:coverage`, the 32 Playwright specs, and `.github/workflows/ci.yml` |
| `DEPLOYMENT_GUIDE.md` | `docs/running.md`, `.env.example`, `.vercel/`, `scripts/` |
| `SECURITY_AUDIT.md` | `next.config.js` headers, `lib/auth/*`, `lib/platform/*`, `lib/serializers/*` |
| `KNOWN_ISSUES.md` | The known-stub list in Phase 1 above, plus everything the audit itself finds |

## Final Report Format

At the end, provide:

- Overall completion percentage.
- Total checklist items.
- Passed items.
- Failed items.
- Not verified items.
- Not applicable items.
- Critical issues.
- High-priority issues.
- Medium-priority issues.
- Low-priority issues.
- Features completed during the audit.
- Tests executed and results.
- Security assessment.
- Performance assessment.
- Production deployment readiness.
- Remaining blockers.
- **Explicit list of items that could not be verified** and why (missing infrastructure, credentials, human approval, or real-world validation) — this is required, not optional.

**Final instruction:**

Be skeptical of the existing implementation. Your goal is not to make the code look clean or to produce impressive documentation. Your goal is to establish that CityFix actually works as a complete, secure, reliable, maintainable, and deployable city service management system.

Prioritize correctness, data integrity, security, and real-world usability over cosmetic improvements.

If something is already implemented correctly, do not rewrite it just for the sake of changing code. Verify it, document the evidence, and move on.

Do not stop after producing an audit report. Continue through implementation, testing, and verification until all feasible production-readiness requirements are satisfied. Clearly report anything that requires external infrastructure, credentials, human approval, or real-world validation.

# Three additional things I'd prioritize for CityFix
These are particularly important for a real-world municipal service platform:

1. Audit trail: Every important action should be traceable. Who verified a report? Who assigned a crew? Who changed its priority? When was it resolved? Preserve the history.
   *Already partly built — verify, don't rebuild:* the `AuditEntry` model with `writeAudit()` (`lib/platform/audit.ts`) records actor, action, entity, before/after values; `TicketTrailEntry` is the per-ticket history; `lib/serializers/trail.ts` shapes it for display; `app/admin/audit` is the admin console. **Verify coverage of the four questions above — in particular priority changes and cancellations — and confirm the audit rows are immutable to non-admin actors.**

2. Concurrency: Imagine two dispatchers trying to assign the same crew or two crew members updating the same job simultaneously. Your backend must prevent inconsistent state, not just rely on frontend checks.
   *See the dedicated Concurrency block in Phase 8.* This is the highest-value technical risk in the codebase and the one item where "the UI prevents it" is most likely to be masking a real backend gap. Test it by actually issuing concurrent requests, not by reading the code.

3. Operational accountability: Measure how long reports remain pending, how quickly dispatchers verify them, how long crews take to resolve them, and which areas repeatedly generate complaints. This is what turns CityFix from a CRUD application into a useful city management platform.
   *Already partly built — verify, don't rebuild:* the `SlaPolicy` model, `app/api/v1/dispatcher/performance/route.ts`, `app/api/v1/admin/cities/[id]/adoption/route.ts` (with an export route), and the `app/dispatcher/performance` + `app/admin/cities/[id]/adoption` surfaces. **Verify the metrics are computed from real ticket timestamps rather than from seeded or placeholder data — this is exactly the "fake data in a production path" failure mode the acceptance criteria forbid.**

One final suggestion: Once the audit is complete, don't just ask the agent whether CityFix is production-ready. Ask it to demonstrate the complete lifecycle using four separate test accounts, with actual database records and automated browser tests. That evidence is much more valuable than an AI-generated claim that everything works.
*The Playwright suite under `tests/` already covers all four roles (32 specs), and `app/api/dev/login` provides persona sign-in. Use those as the substrate for the demonstration rather than building new scaffolding.*