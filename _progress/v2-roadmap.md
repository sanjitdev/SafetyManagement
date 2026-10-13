# CityFix v2 — Roadmap Deck

> **Status**: Roadmap deck (not AIDLC intents yet).
> **Authored**: 2026-10-12, post-v1 launch.
> **Owner**: Inception Agent (per `/specsmd-inception-agent plan the v2`).
> **Audience**: Sanjit (founder/eng-lead). Review this before any new intent is created.

This is a **planning artifact**, not a contract. No AIDLC intents are
created from it; the four buckets below are the candidate v2 *themes*
and each one will become a separate intent once the human picks
which bucket to start. The single-source-of-truth for v1 work is
`_progress/00-design-log.md` and `.specsmd/aidlc/memory-bank/`; this
document is the v2 *handshake* that the human reviews before
Inception begins a new intent.

---

## Where v1 ended (one paragraph)

CityFix v1 is live at **`https://cityfix-bd.vercel.app`** (Vercel +
Neon Postgres, auto-deploy on `main` from the Vercel GitHub App).
All 5 AIDLC intents are `complete` (3 units in 001-platform-foundation,
5 in 002-citizen-report-flow, 5 in 003-dispatcher-queue, 4 in
004-field-crew-app, 4 in 005-admin-city-setup); 255/255 unit tests +
15/15 Playwright mockup baselines + the 19/19 per-WO route specs are
green; the Construction Verification Command
(`npx tsc --noEmit && npm run test:unit && npm run test:mockups &&
curl -fs http://localhost:3000/`) is the documented gate. The Dhaka
pilot city is seeded; citizens can register, verify via OTP, file
tickets with the location/photo/category/note flow, see them on the
home activity feed, and follow them through the status trail;
dispatchers can see the queue + map, triage, route to crew, and
review dedup-flagged reports; field crew can see today's assignments,
transition status, and capture before/after photos; admin (Aamir) can
sign in via WebAuthn, manage wards/categories/departments, configure
the dedup radius, and review the audit dashboard. The five
explicitly-deferred v1.1 follow-ups are recorded below.

The v2 question is: **what do we build next, and in what order, to
grow from one pilot city to a multi-city platform with engaged
citizens and operational leverage for city-corp staff?**

---

## The four v2 buckets (the menu)

| # | Bucket | Headline question it answers |
|---|--------|------------------------------|
| 1 | **v1.1 follow-ups** | What is the cheapest, lowest-risk way to retire the 5 v1.1 deferrals without reopening shipped code? |
| 2 | **Multi-city + multi-tenant platform** | How do we go from the single Dhaka pilot to N cities without rebuilding the platform? |
| 3 | **New citizen engagement features** | How do we deepen the citizen loop (push, comments, up-vote, public maps, comparison) so Rahim comes back 10×/day? |
| 4 | **Internal tooling + admin ops** | How do we run this thing in production with confidence (observability, rate limits, SLOs, runbooks, canary, GDPR, SLA tracking)? |

Each bucket below carries: **scope / out-of-scope / priority / size /
risk / dependencies / NFRs / acceptance / first-bolt sketch**.

### How to read the priority / size / risk columns

- **Priority**: `P0` (revenue / safety / blocking), `P1` (high leverage
  on the platform mission), `P2` (real but deferrable), `P3` (nice
  to have / speculative).
- **Size**: `S` (≤ 1 day, 1 bolt), `M` (1–3 days, 1–2 bolts),
  `L` (1–2 weeks, 3–5 bolts), `XL` (≥ 2 weeks, multi-intent).
- **Risk**: `Low` (well-trodden, no schema break, no perf cliff),
  `Med` (touches the platform, needs migration plan, performance
  contract needed), `High` (cross-tenant data isolation, schema
  reshape, security review, or vendor lock-in).
- **Dependencies**: lists AIDLC intents, design artifacts, or
  external services (e.g., Twilio, Mapbox, Sentry) the bucket
  needs in place before its first bolt.

---

## Bucket 1 — v1.1 follow-ups (the cheap wins)

> Retire the 5 explicit v1 launch deferrals. They are well-scoped
> because the design points were paved in v1 (per
> `_progress/operations/cityfix-deployment.md` → v1 launch readiness
> table). This is the lowest-risk, highest-velocity bucket.

### Scope

| # | Item | Where it lives today | v1.1 swap |
|---|------|----------------------|-----------|
| 1.1 | Twilio real OTP SMS | `OTP_PROVIDER=stub` (logs to Vercel function logs) | Flip to `OTP_PROVIDER=twilio`; the TwilioProvider class is already implemented (Bolt 005-003, 18/18 unit tests) and the factory in `lib/auth/otp-provider/index.ts` is provider-agnostic |
| 1.2 | Web Push via VAPID | `lib/platform/push.ts` stubbed; `PushSubscription` model in place; VAPID env vars empty in Vercel | Generate VAPID keypair, add to Vercel env, wire `subscription` endpoint, fire on every status transition |
| 1.3 | Custom domain | `cityfix-bd.vercel.app` is a tracked project domain | Optional; Vercel subdomain is fine for v1, custom domain is cosmetic. Defer until pilot city has traction |
| 1.4 | CI on PRs (GitHub Actions) | Vercel auto-deploys on push to `main`; no PR-time checks | Add `.github/workflows/ci.yml` running `tsc --noEmit + npm run test:unit + npm run test:mockups` on every PR |
| 1.5 | CSV export of audit log | Audit dashboard exists (`/admin/audit`) | Add "Export CSV" button on the audit page; streams from `AuditEntry.findMany` with role-scoped filters |
| 1.6 | Postgres migration history | v1 used `prisma db push` (single migration) | Adopt `prisma migrate dev` going forward; document the policy in `_progress/operations/vercel-neon-deploy-runbook.md` |
| 1.7 | Standard Protection on Vercel | Tracked project domain already bypasses the login wall for prod | Cosmetic; set Vercel to "Standard Protection" so PR preview URLs get the login wall |

### Priority / Size / Risk

| Item | Priority | Size | Risk | Notes |
|------|----------|------|------|-------|
| 1.1 Twilio SMS | **P0** | S | Low | Required for citizens who don't see the dev_code hint. TwilioProvider class + 18/18 unit tests already exist. 1 bolt. |
| 1.2 Web Push via VAPID | **P1** | M | Low | The wire call is the only missing piece. Service worker + PushSubscription model are in place. 1–2 bolts. |
| 1.3 Custom domain | P3 | S | Low | Pure DNS + Vercel alias. No code. |
| 1.4 CI on PRs (GH Actions) | **P1** | S | Low | `.github/workflows/ci.yml` running the 3 gates. PRs get a status check. |
| 1.5 CSV audit export | P2 | S | Low | Adds a button + streaming handler. AuditEntry model is already in place. |
| 1.6 Postgres migration history | **P1** | S | Low | Document the policy; no code change. |
| 1.7 Standard Protection on Vercel | P3 | XS | Low | One toggle in Vercel dashboard. |

### Dependencies

- **None** for 1.1, 1.2, 1.3, 1.5, 1.6, 1.7 (all are well-scoped single
  bolts or one-time config).
- 1.4 (CI on PRs) needs a `.github/workflows/` directory and a
  service-account secret if we want to block merges on failed
  checks (optional).

### NFRs

- 1.1: SMS delivery < 30 s p95 in Bangladesh region. Failure mode is
  graceful fallback to "call support" with a human-readable error.
- 1.2: Push delivery is best-effort; we never block a state change on
  push send. Use a fire-and-forget queue.
- 1.5: CSV stream under 10 MB / 100k rows. No PII leakage (audit
  log already strips secrets per `lib/platform/audit.ts`).

### Acceptance

- 1.1: a citizen in the Dhaka pilot who registers with a real phone
  number receives the OTP via SMS within 30 s; the dev_code
  hint box is no longer rendered in production UI.
- 1.2: a citizen who grants notification permission receives a
  web-push notification within 5 s of a status transition on
  their own ticket; the `PushSubscription` row is recorded in
  the audit log.
- 1.4: a PR that breaks `tsc --noEmit` cannot be merged; status
  check is green on `main`.

### First-bolt sketch

- **Bolt 1.1.A** — Twilio SMS: `vercel env add TWILIO_ACCOUNT_SID`,
  `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`; flip
  `OTP_PROVIDER=twilio`; revert the v1 OTP `dev_code` change in
  `app/api/v1/auth/send-otp/route.ts`; remove the "Dev code" hint
  box on the verify-otp page (or repurpose it to "Resend").
- **Bolt 1.2.A** — VAPID web push: `web-push` npm package; generate
  keypair; add `VAPID_*` to Vercel; implement
  `app/api/v1/push/subscribe/route.ts` (already scaffolded in v1
  Intent 002 story 016); fire `lib/platform/push.ts` from
  `lib/platform/transitions.ts`.

---

## Bucket 2 — Multi-city + multi-tenant platform

> The hardest v2 problem. The current data model binds every ticket,
> audit entry, and dedup flag to a single `cityId` (foreign key into
> `City`); the only seeded city is Dhaka. To onboard Chattogram,
> Sylhet, Rajshahi, or any other city, we need: data isolation,
> per-city config inheritance, per-city roles, and an onboarding
> runbook for Aamir to spin up a new city in < 1 day. The Trigger
> Map (Feature #11, #19, #20, #22) frames this as a high-leverage
> axis; Goal 3 (operate leanly across cities) gates on it.

### Scope

| # | Item | What changes |
|---|------|--------------|
| 2.1 | **City-as-tenant data model** | `City` is already a first-class row; extend `User` so admins/dispatchers/crew are bound to a single `cityId` (already true for citizen; needs scoping for staff) |
| 2.2 | **Per-city routing rules** | Category → Department mappings are city-scoped (already true in schema); surface the admin UI to edit them per city |
| 2.3 | **Cross-city isolation** | Every query must include `cityId` in `where`; add a Prisma middleware that asserts the active session's `cityId` matches the row's `cityId` (defense in depth) |
| 2.4 | **City onboarding runbook** | "From zero to a live city" — admin creates city → applies Dhaka template → draws wards → creates staff → starts accepting reports. Documented in `_progress/operations/multi-city-runbook.md` |
| 2.5 | **Per-city subdomain (or sub-path)** | `dhaka.cityfix.bd` / `chattogram.cityfix.bd` (subdomain, requires custom domain) **or** `cityfix.bd/dhaka` / `cityfix.bd/chattogram` (path, no DNS work) — the simpler v2 is path; subdomain is v3+ |
| 2.6 | **City switching for super-admin** | A user with multiple `cityId` bindings (super-admin role) sees a city switcher in the top bar |
| 2.7 | **Cross-city analytics** | Optional; super-admin sees "all cities" dashboard with adoption metrics per city |
| 2.8 | **Aamir-as-platform-admin role** | Distinguish "city admin" (scoped to one city) from "platform admin" (no city binding, can manage any city). WebAuthn mandatory for both. |

### Out of scope (deferred)

- **Data residency per country** (v3+) — Bangladesh-only for v2.
- **Custom domain per city** (v3+) — subpath is enough for v2.
- **Multi-language beyond Bangla + English** (v3+) — additional
  locales are content-only once the i18n key registry is in place
  (it already is).
- **Cross-city ticket forwarding** (v3+) — a Chattogram citizen
  reporting a Dhaka problem is out of scope.

### Priority / Size / Risk

| Item | Priority | Size | Risk | Notes |
|------|----------|------|------|-------|
| 2.1 City-as-tenant data model | **P1** | M | Med | Mostly exists; the staff-side scoping is the new piece. 1–2 bolts. |
| 2.2 Per-city routing rules | P1 | M | Low | Categories and departments are city-scoped already; need the admin UI to edit them. 1 bolt. |
| 2.3 Cross-city isolation | **P0** | M | **High** | Defense-in-depth. A single `cityId` bypass leaks data across tenants. Needs a security review. 1 bolt + tests. |
| 2.4 City onboarding runbook | **P1** | S | Low | Documentation + diagram; no code. |
| 2.5 Per-city subpath | **P1** | M | Med | Middleware that reads the subpath, sets a request-scoped `cityId` cookie; every page routes through `/[city]/...`. Schema shape decision. 2–3 bolts. |
| 2.6 City switcher for super-admin | P2 | S | Low | Top-bar dropdown for super-admin. 1 bolt. |
| 2.7 Cross-city analytics | P3 | L | Med | Reuses the audit dashboard; aggregates by city. v2.1+. |
| 2.8 Platform admin role | **P1** | S | Med | New role enum value; new guard helpers; WebAuthn mandatory. 1 bolt. |

### Dependencies

- Bucket 4 (observability + runbooks) should land first or in
  parallel — every multi-city query needs metrics.
- A security review of 2.3 is gating.
- The Dhaka template (Feature #11 from the Trigger Map) is the
  foundation of 2.4; Aamir's "apply Dhaka template" button
  already exists in v1.

### NFRs

- 2.3: 100% of read paths must include `cityId` in the where clause.
  A Prisma middleware asserts the row's `cityId` matches the
  active session's `cityId`; mismatch is a hard error.
- 2.5: subpath middleware must run before any data fetch. The
  middleware reads the path's first segment and sets
  `req.headers['x-city-id']` from the route param.
- 2.5: `cityId` cannot be set via query string; only via the
  URL path or a server-set header.

### Acceptance

- 2.3: a unit test creates two cities, opens a session in city A,
  and tries to read a ticket from city B → 403 (or 404). 100%
  test coverage on read paths.
- 2.4: a new admin can follow the runbook end-to-end and have a
  second city accepting reports in < 1 working day.
- 2.5: a citizen visiting `cityfix.bd/dhaka` sees the Dhaka
  activity feed; visiting `cityfix.bd/chattogram` sees the
  Chattogram feed; no cross-contamination.

### First-bolt sketch

- **Bolt 2.3.A** — Cross-city isolation middleware in
  `lib/db-switch.ts` + every `findUnique` / `findMany` call gets
  a `cityId` guard; tests cover citizen/dispatcher/crew/admin
  roles.
- **Bolt 2.5.A** — `/[city]/...` route segment + middleware that
  resolves `cityId` from the path and binds it to the session.
  Existing `/` route becomes a redirect to `/<default-city>/`.

---

## Bucket 3 — New citizen engagement features

> The Trigger Map calls these "the civic engagement loop" (Feature
> #7: city activity feed + map; Feature #9: push notifications;
> Feature #13: citizen feedback after close; Feature #6: public
> ward-level dashboard). v1 delivered the *first* level: citizens
> can file tickets and see them on a static activity feed. v2
> turns the feed into a *two-way* surface and deepens the
> "feel heard" trust signal (Feature #2).

### Scope

| # | Item | What it adds |
|---|------|--------------|
| 3.1 | **Public ticket map** (anonymous) | Read-only map of all open + recent-resolved tickets in the city. No PII (no name, no phone); just the pin + category + status + age. The "silence is visible" surface (Feature #6, FIA 13 on Rahim +3 +4) |
| 3.2 | **Citizen up-vote on existing tickets** | A citizen can +1 an existing ticket near them. +1 weight, no down-vote. De-duplicates "I see this too" reports (a soft dedup). v1 already has the dedup engine; this is the *explicit* consent version of it |
| 3.3 | **Citizen comments thread** | Threaded comments under any ticket. Citizen (owner of ticket), dispatcher, crew, and admin can post. One-way (no edit, no delete in v2). Visible to anyone with the ticket URL |
| 3.4 | **Real-time push on transitions** | When a ticket transitions Submitted → Routed → In progress → Resolved, the owner gets a web-push (Bucket 1.2 wires the channel; this is the *fire on every transition* behavior) |
| 3.5 | **Citizen feedback after close** | 5-star rating + optional comment. One per ticket. Required to mark the ticket "fully closed" from the citizen's POV (city-corp closure is independent). Rahim's +3 (FIA 14, "feel heard") and Habib's P5 (FIA 12, "build a record") both addressed |
| 3.6 | **City comparison dashboard** | "How does my ward compare to other wards?" — overdue rate, median time-to-resolution, top categories. Public, anonymous, aggregated. Feature #6 deep-dive |
| 3.7 | **Anonymous mode (opt-in)** | Citizens can mark a ticket as "anonymous" — name and phone suppressed from the dispatcher / crew view; the citizen still gets the push / trail. Edge case for sensitive reports |
| 3.8 | **Share ticket publicly** | A citizen can generate a public read-only link to their ticket (similar to a Google Docs "anyone with the link can view"). Forwards the social-loop mechanic |

### Out of scope (deferred)

- **End-to-end messaging (citizen ↔ dispatcher)** (v3+) — a free-form
  chat opens moderation, abuse, and SLA accounting surfaces that
  v2 doesn't need.
- **In-app social feed** (v3+) — "citizens who reported X also
  reported Y" is a recommendation engine; defer until v2.5 when we
  have signal.
- **Photo moderation** (v2.1) — needed if 3.7 (anonymous) ships;
  defer until then.

### Priority / Size / Risk

| Item | Priority | Size | Risk | Notes |
|------|----------|------|------|-------|
| 3.1 Public ticket map | **P1** | M | Low | MapLibre + existing GeoJSON; strip PII in serializer. 1 bolt. |
| 3.2 Up-vote | **P1** | M | Med | New model `TicketUpvote`; needs rate limit per citizen per ticket. 1–2 bolts. |
| 3.3 Comments thread | **P1** | L | Med | New model `TicketComment`; threading depth = 1 (no reply-to-reply); requires moderation hooks. 2–3 bolts. |
| 3.4 Real-time push on transitions | **P1** | S | Low | Hooks into the existing transition pipeline; Bucket 1.2 is the channel. 1 bolt. |
| 3.5 Feedback after close | **P1** | M | Low | New model `TicketFeedback` (1:1 with ticket); 5-star + optional comment. 1 bolt. |
| 3.6 City comparison dashboard | P2 | L | Med | Aggregation queries + chart; risk is on the perf side at scale. 2 bolts. |
| 3.7 Anonymous mode | P3 | M | Med | New flag on ticket; serializer strips PII conditionally. 1 bolt. |
| 3.8 Share ticket publicly | P2 | M | Low | Signed URL with `readOnlyToken`; new route `/t/[token]`. 1 bolt. |

### Dependencies

- **3.4 requires Bucket 1.2 (VAPID web push)** as the channel.
- **3.6 requires Bucket 4.1 (observability + query metrics)** so we
  know what "median time-to-resolution" costs in compute.
- **3.1, 3.2, 3.6** benefit from the public ticket map's index,
  which the v1 map endpoint already partially serves; extend.
- **3.5** needs the close flow to be reachable from the citizen's
  app (v1 already shows a "Resolved" state in the trail).

### NFRs

- 3.1: 95th-percentile map render < 1.5 s on a 3G connection.
  Tile loading is the existing concern (Mapbox paid tiles per
  `000-tech-audit.md`).
- 3.2: rate limit 1 up-vote per citizen per ticket per 24 h.
- 3.3: comments are append-only; no edit; admin can hide but not
  delete. 500-char cap; auto-moderate URLs + phone numbers.
- 3.5: feedback is one per ticket; submitting it changes the
  citizen's "My Reports" view from "Resolved" to "Closed (with
  your rating)".

### Acceptance

- 3.1: an anonymous visitor to `/map` (no session) sees a
  city-wide map of all open and recently-resolved tickets with
  no PII fields. Geo-fence to the city boundary.
- 3.2: a citizen can up-vote a ticket within 50m of their current
  location; the up-vote is recorded; the ticket's up-vote count
  is visible to the dispatcher.
- 3.5: a citizen whose ticket is Resolved for > 24 h sees a
  "Rate this fix" CTA on `My Reports`; submitting a rating marks
  the ticket as fully closed in the citizen's UI.

### First-bolt sketch

- **Bolt 3.1.A** — Public ticket map: new route `/map` (no
  session required); serializer variant `serializeTicketForMap`
  that strips PII + `reporterPhone`; map renders MapLibre + OSM
  tiles (same source as v1's home page).
- **Bolt 3.2.A** — Up-vote: new model `TicketUpvote`; new route
  `POST /api/v1/tickets/[id]/upvote`; the dispatcher queue shows
  the up-vote count as a column.

---

## Bucket 4 — Internal tooling + admin ops

> The boring but load-bearing bucket. v1 ships with the minimum
> observability a single-city launch needs; v2 needs the
> *operational* maturity to run with confidence. The Trigger Map
> frames these as Aamir's "+6 audit trail / defend decisions" (FIA
> 12) and "stop being on the hook for every glitch" (N4, FIA 12),
> plus a wider "we cannot keep this in our heads" argument.

### Scope

| # | Item | What it adds |
|---|------|--------------|
| 4.1 | **Sentry (or equivalent) error tracking** | Server-side exception capture; release tracking; per-route transaction traces. The current v1 stack has zero error visibility beyond Vercel function logs. |
| 4.2 | **Structured logging** | Replace `console.log` with `pino` or `winston`; every log line is JSON with `requestId`, `cityId`, `userId`, `route`. Log drain to a single source (Logflare / Better Stack / Datadog free tier) |
| 4.3 | **Rate limiting, per-IP + per-user** | v1 has an in-process token bucket (`lib/platform/rate-limit.ts`) but it's a single-Vercel-instance thing and resets on cold start. v2: edge middleware (Vercel KV or Upstash Redis) for per-IP + per-user limits. |
| 4.4 | **SLOs + alerts** | Define SLOs: 99.5% availability on `/api/v1/*` over 30 days, p95 < 1 s on ticket submission, < 5 s push delivery. Alerts on burn rate. |
| 4.5 | **Runbooks** | `_progress/operations/runbooks/` — for every prod incident class (Neon DB down, Vercel deploy failed, OTP provider outage, push provider outage, map tile provider outage), one markdown runbook with: detection, root cause hypothesis, mitigation, escalation, postmortem template |
| 4.6 | **Canary deploys (or blue/green)** | Vercel supports preview-per-PR for free; v2 gates production deploys on a canary step (deploy to 5% traffic for 5 min, then promote). Vercel Pro tier for traffic splitting; defer if Hobby |
| 4.7 | **GDPR / data retention** | 365-day unread-photo lifecycle policy (per `project.md` Corrections). Citizen-initiated delete. Data export (citizen asks "give me everything you have on me"). |
| 4.8 | **SLA tracking** | Per-category SLA (e.g., streetlight = 7 days, water leak = 24 h, garbage = 48 h). Overdue tickets surface in the dispatcher queue and the public ward dashboard. Trigger Map Feature #14 (FIA 9, Medium). |
| 4.9 | **Per-city adoption dashboard** | Aamir sees the 4.2 adoption dashboard (Trigger Map Feature #21): active dispatchers, active crews, citizen reports/day, time-to-resolution trends. v1 has the audit dashboard; v2 adds the *adoption* dashboard. |
| 4.10 | **Backup + restore** | Neon has automatic daily backups; v2 documents the restore procedure + tests it quarterly. |
| 4.11 | **Status page** | `status.cityfix.bd` (or a third-party: Better Uptime / Instatus free tier) showing `/`, `/api/health`, `/api/v1/dispatcher/queue` up/down for the last 90 days. |
| 4.12 | **Security review of all admin endpoints** | One-time security review of every `/api/v1/admin/*` endpoint; cross-city isolation check; CSRF + session-fixation review. |

### Out of scope (deferred)

- **SOC 2 / ISO 27001** (v3+) — useful for enterprise sales; v2
  is single-tenant Bangladesh pilot.
- **Penetration test** (v3+) — defer until pilot has > 100
  active citizens.

### Priority / Size / Risk

| Item | Priority | Size | Risk | Notes |
|------|----------|------|------|-------|
| 4.1 Sentry | **P0** | S | Low | One env var + `Sentry.init` at app boot. Free tier. 1 bolt. |
| 4.2 Structured logging | **P0** | M | Low | `pino` setup; JSON formatter; ship to Vercel logs (free). 1 bolt. |
| 4.3 Rate limiting, edge | **P1** | M | Med | Upstash Redis free tier; per-IP + per-user counters. 1–2 bolts. |
| 4.4 SLOs + alerts | **P1** | M | Low | SLOs in `_progress/operations/slos.md`; alerts in Sentry / Better Stack. 1 bolt. |
| 4.5 Runbooks | **P1** | S | Low | 5–7 markdown files. Documentation only. |
| 4.6 Canary deploys | P3 | L | Med | Requires Vercel Pro ($20/mo). Defer until traffic justifies. |
| 4.7 GDPR / data retention | **P1** | M | Med | Auto-delete unread photos after 365 d; citizen-initiated delete; data export. 2 bolts. |
| 4.8 SLA tracking | **P1** | L | Med | Per-category SLA config; queue + dashboard surface. 2–3 bolts. |
| 4.9 Per-city adoption dashboard | P2 | L | Low | Reuses the audit dashboard; aggregates by city. 2 bolts. |
| 4.10 Backup + restore | P2 | S | Low | Quarterly restore drill. Documentation. |
| 4.11 Status page | P2 | S | Low | Better Uptime free tier. 1 bolt. |
| 4.12 Security review | **P0** | M | **High** | One-time; cross-city isolation, CSRF, session-fixation. Gate Bucket 2 (multi-city). |

### Dependencies

- **4.1, 4.2, 4.4** are pre-conditions for 4.5 (runbooks need
  observed metrics to act on).
- **4.12 (security review) gates Bucket 2 (multi-city)** — we
  cannot ship multi-tenant without a security review.
- **4.7 (GDPR) is a legal requirement** for any EU-resident
  citizens. v1 is Bangladesh-only but the policy should exist
  before citizens from other regions join.

### NFRs

- 4.1: 100% of unhandled exceptions captured; 0 silent failures
  in prod.
- 4.3: per-IP limit 60 req/min on auth routes, 600 req/min on
  reads. Per-user limit 30 req/min on writes.
- 4.4: SLOs reviewed monthly. Burn rate alerts at 2x the
  30-day budget.
- 4.7: data export returns within 24 h of request; deletion
  completes within 7 days; deletion is irreversible.

### Acceptance

- 4.1: a `throw new Error('test')` in any `/api/v1/*` route
  appears in Sentry within 5 s.
- 4.2: every prod log line is valid JSON with the four required
  fields.
- 4.5: a new admin can read `_progress/operations/runbooks/`
  and resolve a simulated `Neon DB down` incident in < 30 min.
- 4.7: a citizen can request "delete my account" → 7 days
  later, no row in `User`, `Ticket`, `Photo`, `AuditEntry`
  contains their `userId` or `phone`.

### First-bolt sketch

- **Bolt 4.1.A** — Sentry: `npm i @sentry/nextjs`; add
  `SENTRY_DSN` to Vercel env; `sentry.client.config.ts` +
  `sentry.server.config.ts`; capture unhandled + capture
  `ApiError` instances.
- **Bolt 4.12.A** — Security review: read every
  `/api/v1/admin/*` route; produce a findings list in
  `_progress/security/admin-review.md`; fix any P0/P1 in the
  same bolt.

---

## Cross-bucket decisions needed before starting

These three questions shape which bucket becomes the first intent.
None blocks the roadmap; all three can be answered *after* you
pick a bucket and before the first bolt of that bucket starts.

1. **Are we opening the platform to a second city in v2, or
   staying Dhaka-only for the first 3–6 months of v2?** If the
   former, Bucket 2 (multi-city) becomes P0; if the latter,
   Bucket 2 stays P1 and Bucket 1 (v1.1 follow-ups) becomes
   the first v2 work.
2. **Is the pilot's user base a Bangla-only audience, or are
   we already getting English-speaking users from outside
   Dhaka?** The answer shapes the relative priority of Bucket
   3.6 (city comparison, which is most useful at scale) vs
   Bucket 3.1 (public map, which is useful even at 50 users).
3. **What's the operational bar for "we trust v2 enough to
   bring on investors / partners"?** That bar is what Bucket
   4 priorities should be measured against.

The Inception workflow's `intent-create` skill will turn the
chosen bucket into an AIDLC intent (requirements → context → units
→ stories → bolt-plan → review). Each bucket is sized for
**one intent** (not multiple); if a bucket is too big, the
Inception Agent will surface a "split this into two intents"
recommendation at the requirements-review checkpoint.

---

## Recommended first v2 intent (advisory, not binding)

> This is *advisory only*. The human picks.

**Bucket 1.1 — Twilio real OTP SMS** is the cheapest, highest-trust
first v2 bolt. It's the one v1.1 follow-up that *regular citizens
will notice*; a citizen who tries to register today sees a "Dev
code" hint box, which is correct in dev but unprofessional in prod.
The TwilioProvider class is implemented and tested (18/18 unit
tests, Bolt 005-003). The bolt is one flag flip + three env vars.

If you want to start with something more substantive, **Bucket 2.3
(cross-city isolation)** is the next-best first bolt because it
unblocks the entire multi-tenant story and has the highest
defense-in-depth payoff. It needs a security review (Bucket 4.12)
in the same intent.

---

## Out of scope (v2 deferred)

These are *not* in v2. They are recorded so the human doesn't
have to re-derive them:

- **Native mobile apps** (iOS / Android) — PWA is the v1/v2 path
  for field crew.
- **AI-assisted report triage** (categorization suggestions, dedup
  suggestions) — defer until we have 10k+ tickets in prod.
- **Public reporting API for journalists / researchers** — needs a
  separate auth model + abuse controls.
- **Multi-region deployment** — Bangladesh-only for v2; Singapore
  failover is v3+.
- **Voice-to-text report submission** (Trigger Map Feature #17,
  FIA 9, Medium) — defer until 3G voice models are proven in this
  region.
- **In-app payments / fines / fees** — no money in the v2 loop.

---

## Change log

- **2026-10-12** — Initial roadmap deck authored post-v1 launch.
  Authored by the Inception Agent per
  `/specsmd-inception-agent plan the v2`. No AIDLC intents created
  from this document; awaiting human review of the four buckets
  and selection of the first intent.
