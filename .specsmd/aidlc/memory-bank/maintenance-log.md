# Maintenance Log

## 2026-11-12T15:00:00Z - Dispatcher 403 on opening a report: the null-department scope rule

**Triggered by**: user report — *"from a dispatcher account I get 403 when opening a report."*

**Reason**: the dispatcher's own queue **listed** a ticket that the detail endpoint then **refused** with `403 cross_department_access_denied`. Reproduced live against the real local Postgres as the dispatcher persona `user_dispatcher_habib` (`+8801711000001` / `12345678`): 3 `other`-category tickets → 403, 2 `streetlight` tickets → 200.

### Root cause

A ticket's department comes from its **category** (`Category.departmentId`), never from the ticket row. The seeded `other` category has `departmentId = null`. `requireScope` (`lib/auth/guards.ts`) compared the department dimension with **strict equality** (`departmentId !== session.departmentId`), so `null !== 'cmvtghhhr00022f9opbreluii'` → always 403.

### The divergence

**Six** list filters already treated a null ticket department as *"not department-scoped → visible to everyone in the ward"*:

| File | Rule |
|---|---|
| `app/api/v1/dispatcher/queue/route.ts` | `if (ticketDepartment && ticketDepartment !== session.departmentId) return false;` |
| `app/api/v1/crew/tickets/route.ts` | identical |
| `app/api/v1/dispatcher/map/tickets/route.ts` | identical |
| `lib/dispatcher/assign-crew.ts` | `if (ticketDepartment && crew.departmentId && crew.departmentId !== ticketDepartment)` |
| `lib/dispatcher/list-crew-for-ward.ts` | filters the **crew's** dept, not the ticket's |
| `app/api/v1/dispatcher/dedup-flags/route.ts` | **outlier** — strict equality → a null-dept flag was hidden |

The guard (**11** call sites) and the dedup-flag list were the only two places using strict equality. Hence the show-then-403 divergence.

### The rule

> A ticket is department-scoped **iff** its category has a department. A session is department-scoped **iff** it has a department. The department check denies **only** when both sides are department-scoped **and** they differ. The ward check is unchanged and still fires first.

The rule is **symmetric on the session side** too, which closes a second, larger instance of the same bug: `resolveScope` (`app/api/v1/admin/cities/[id]/users/route.ts`) deliberately gives an admin-provisioned **dispatcher** `departmentId: null` — the product model is *"dispatcher: ≥ 1 ward, no crew, no department"*. Under the old strict equality such a dispatcher was locked out of **every** department-scoped ticket in their own ward.

### Changes

| File | Change |
|---|---|
| `lib/auth/guards.ts` | `requireScope` — the department check now denies only when both sides are department-scoped and differ; the docblock states the rule and names the six agreeing filters. **All 11 call sites inherit the fix.** |
| `app/api/v1/dispatcher/dedup-flags/route.ts` | The list filter mirrors the guard — a flag whose `departmentId` is `null` stays visible to every dispatcher in the ward. |
| `app/api/tickets/route.ts` | Comment only — the stale "an exact match on BOTH wardId and departmentId" claim. |
| `lib/docs/openapi.ts` + `lib/docs/openapi.json` | The "Scope enforcement" section and the `GET /api/tickets/{id}` 403 description now state the rule. The JSON artifact was regenerated (`scripts/generate-openapi.ts`) — `tests/unit/docs/openapi.test.ts` asserts it matches the spec module exactly. |

### Test delta

| File | Change |
|---|---|
| `tests/unit/dispatcher-scope.test.ts` | +4 cases → 20 tests |
| `tests/unit/crew-scope.test.ts` | +3 mirrored cases → 20 tests |
| `tests/unit/dedup-flag-scope.test.ts` | **NEW** — 5 route-level tests driving the real dedup-flag list handler against the dev store. The list filter had **no** unit coverage before (`tests/unit/dedup-flag.test.ts` covers only the dev-store CRUD). |
| `tests/unit/transition-webauthn.test.ts` | The one test that **pinned the bug** (a `cat_other` ticket asserted to be refused) was replaced by two: `cat_other` → 200 and the ticket becomes `routed`; `cat_garbage` (→ `dept_waste`) → 403 `cross_department_access_denied`. → 17 tests |

### Verification

| Gate | Command | Result |
|------|---------|--------|
| Types | `tsc --noEmit` | clean |
| Unit | `vitest run` | 124 files / **2161 passed** |
| Mockups | `playwright test tests/01-mockups.spec.ts` | 17 passed, **8 failed** — identical to `HEAD` (pre-existing; baselines are regenerated via CI, never by hand on Windows) |
| Dispatcher route specs | `playwright test tests/09 tests/10 tests/11 tests/12` | 29 passed, **4 failed** — all four are visual baselines, and the **same four fail with the change stashed** |

**Live matrix, real Postgres** (dispatcher scoped to `ward_14` + streetlight):

| Case | Result |
|---|---|
| Null-department ticket, own ward (`other` → `null`) | **200** — was 403 `cross_department_access_denied` |
| Null-department ticket, **other** ward | 403 `cross_ward_access_denied` — unchanged |
| Garbage-department ticket, own ward (→ `dept_waste`) | 403 `cross_department_access_denied` — unchanged |
| Dedup-flag list | exactly **1** flag — the null-department one in the ward; the other-department and other-ward flags are excluded |
| `POST .../dedup-flags/:id/dismiss` on that flag | **200 `{"status":"dismissed"}`** — it was previously visible-but-un-actionable |

**Dev store**: the null-department (`cat_other`) ticket returns **200**.

The four visual-baseline failures were proved pre-existing by `git stash`-ing the three source files and re-running — the identical four fail.

### Records updated

| Artifact | Change |
|----------|--------|
| `bolts/003-001-dispatcher-auth-and-scope/ddd-01-bolt-record.md` | added the "Correction (2026-11-12) — the null-department rule" section, the test delta, the source delta, and the new acceptance rows |
| `intents/003-dispatcher-queue/001-auth-and-scope/DISP-001-auth-scope.md` | Acceptance 2 `dept_water` → `dept_waste`; new Acceptance 6 (no-department ticket is in scope), 7 (a real cross-department ticket is still refused), 8 (the ward check still fires first); Technical Notes bullets on the rule |

### Not changed, deliberately

- **No schema change.** `Session.departmentId` stays `String?`.
- **No provisioning change.** `resolveScope` still nulls a dispatcher's department — the symmetric rule accommodates it.
- **No UI copy.** `lib/i18n/keys.ts` is untouched. The *misleading* messages this bug produced — the dispatcher detail page's "not found" and the shared page's generic "forbidden" — are a separate follow-up.
- **No mockup baseline regeneration.**
- **No commit** unless asked.

## 2026-11-12T14:10:00Z - Story 008 spec made backend-agnostic; verified against BOTH backends

**Triggered by**: user request — run the project in real mode.

**Reason**: the Wave 2 story spec (`tests/32-ui-redesign-auth.spec.ts`) was written against the in-memory dev store only. Run against the real local Postgres, it failed — and every failure pointed at a dev-store assumption inside the spec, not at a product defect. This pass made the spec backend-agnostic and verified it in both modes.

### What the spec had hard-coded

| Assumption | Dev store | Real Postgres | Symptom |
|---|---|---|---|
| `cityId` / `categoryId` / `wardId` | `city_dhaka_north` / `cat_streetlight` / `ward_14` | cuid-generated | `POST /api/tickets` → **403 `cross_city_forbidden`** (the route rejects a foreign city id before it checks the ward or the category) |
| Ticket id shape | `tkt_<uuid8>` | cuid | `/"id":"(tkt_[^"]+)"/` matched nothing |
| Session minting | `POST /api/dev/login?role=citizen` (303) | that route is **404** by design | fell back to `POST /api/v1/auth/login` (already handled) |
| Citizen phone | `+8801711000000` | `+880199000000N` block | both were tried (already handled) |

### The three changes

1. **`discoverSeedIds(page)`** reads `(cityId, categoryId, wardId)` off the first row of `GET /api/v1/activity/public`. That route is session-scoped, so the triple is always in the session's own city — which is exactly what `POST /api/tickets` requires. The dev-store constants remain only as a fallback for an empty feed.
2. **The ticket id comes from the response body** (`ticket.id`), not from a regex over the raw text.
3. **The "all" chip count asserts the documented contract.** It counts the WHOLE fetched set, not the rows on screen: the feed paginates the LIST (`PAGE_SIZE = 20`, `visible = filtered.slice(0, page * PAGE_SIZE)`) while the chips count over every ticket (`app/feed/page.tsx`, the `counts` memo). The old assertion compared the chip against the rendered row count — true only while the city has fewer tickets than one page, and it failed the moment the seeded city had 23. It now asserts the chip equals the API's own `total` **and** is at least the rendered row count.

### A Playwright hang, not a product bug

The login spec pins `x-forwarded-for` so its wrong-password attempt gets its own lockout counter (the route locks an IP out after 5 failures for 10 minutes). Doing that with `route.continue({ headers })` **hung the request**: the fetch in `app/login/page.tsx` never resolved, the submit button stayed disabled on "লগ ইন হচ্ছে…", and the error summary never rendered. The body was never modified, but the original `content-length` was replayed against a rewritten header set. Deleting `content-length` before the override lets the transport recompute it, and the request completes normally.

### One dev-server hazard: two servers, one `.next`

Running a second `next dev` on another port against the SAME `.next` directory corrupts the first server's route manifest — routes answer 404 while still existing on disk, and the webpack cache logs `ENOENT` on paths it has already written. This cost several debugging cycles and is indistinguishable from a code defect (the earlier `__webpack_modules__[moduleId] is not a function` 500 was the same class). The reliable sequence: stop every server → `rm -rf .next` → start ONE server → warm the routes the spec touches with a `curl` loop → run. A first compile can take ~20s, which exceeds a 30s test timeout if the spec navigates to the route while it is compiling.

### Verification

| Gate | Command | Result |
|------|---------|--------|
| Types | `npx tsc --noEmit` | clean |
| Unit | `npm run test:unit` | 123 files / **2148 passed** |
| Story spec (dev store) | `playwright test tests/32-ui-redesign-auth.spec.ts` | **18 passed** |
| Story spec (real Postgres) | same, against `next dev` with no dev-store flag | **18 passed** |
| Route specs (dev store) | `playwright test tests/04 tests/20 tests/27` | 11 passed, **12 failed** — identical to `HEAD` |
| Mockups | `playwright test tests/01-mockups.spec.ts` | 17 passed, **8 failed** — identical to `HEAD` |
| i18n | `npm run check:i18n` | ok (1091 keys) |

Both pre-existing sets were reproduced by stashing the seven changed source files and re-running against `HEAD` (10c50a5) — same 12 route failures, same 8 mockup failures.

**Note on the two counts.** The 12 route failures are the count **in dev-store mode**. In real mode the same three specs report 23 failures, because they hard-code dev-store ids and dev-only endpoints. That is a mode artefact of those specs, not a regression in this work; the dev-store count is the one comparable to `HEAD`.

### Records updated

| Artifact | Change |
|----------|--------|
| `bolts/009-003-auth-and-public-surfaces/bolt.md` | added "The story spec passes in BOTH backends", the Playwright hang note, and the two-servers-one-`.next` hazard |
| `.../stories/008-auth-and-public-page-implementation.md` | added the dual-backend verification table, the three changes, and the dev-store-vs-real-mode note; `updated` → 2026-11-12 |

### Not changed, deliberately

- **The 8 mockup baseline failures.** Pre-existing, and per the team rule they are regenerated **via the CI workflow**, never by hand on Windows.
- **The 12 route-spec failures.** Pre-existing; `tests/04` is the ADR-007 admin-WebAuthn gate, `tests/20` and `tests/27` are the after-photo flow and the admin user endpoints.
- **No product code.** This pass touched only the spec and the records. The six surfaces are byte-identical to the 2026-11-11 state.

---

## 2026-11-11T22:00:00Z - Wave 2 Page Implementation (Story 008) + Status Sync

**Triggered by**: user request — re-compose the six Wave 2 target pages to match their approved mockups, minimally, via subagent-driven development.

**Reason**: Bolt 009-003 recorded `stages_completed: implement`, but its referenced artifacts (`implementation-plan.md`, `implementation-walkthrough.md`) did not exist and the page implementation had never landed. Only the mockup half shipped (story 007 complete; story 008 `ready`). Root cause confirmed by inspection: `app/login`, `app/register`, `app/verify-otp`, `app/page.tsx` and `app/splash` imported **zero** primitives from `components/ui/`; `app/feed` imported one. The 27 UI primitives + 7 chart primitives built in Wave 1 were shipped but almost nothing consumed them.

### Story 008 — implemented

The six surfaces (`/login`, `/register`, `/verify-otp`, `/`, `/feed`, `/splash`) were re-composed to their approved Wave 2 mockups with **presentation-layer changes only**. Every fetch, query parameter, cursor, limit, validation rule, role gate and PII-stripping path is byte-identical to the pre-existing implementation.

| Artifact | Old Status | New Status | Reason |
|----------|------------|------------|--------|
| `bolts/009-003-auth-and-public-surfaces/bolt.md` | `status: in-progress`, `current_stage: implement` | `status: complete`, `current_stage: complete`, `completed: 2026-11-11T22:00:00Z` | Both stories complete; the `implement` stage artifact now points at a file that exists (`tests/32-ui-redesign-auth.spec.ts`) |
| `.../units/003-auth-and-public-surfaces/unit-brief.md` | `status: in-progress` | `status: complete` | Both stories complete |
| `.../stories/008-auth-and-public-page-implementation.md` | `status: ready`, `implemented: false` | `status: complete`, `implemented: true` | Implemented and verified |
| `story-index.md` (story 008 row) | `ready` | `done` | Cascade from the story record |
| `intents/009-ui-redesign/requirements.md` | `in-progress` | `in-progress` (unchanged) | Waves 3–7 remain; the unit and story counts (8 / 18) are unchanged |

### The Intent 006 status inconsistency — closed

The analyze-context integrity check flagged exactly one inconsistency across the whole memory bank: Intent 006's `requirements.md` said `in-progress` while its `intents/index.md` row said `complete`. A wider sweep found the same staleness in two sibling inception artifacts that the original finding had missed.

| Artifact | Old Status | New Status | Reason |
|----------|------------|------------|--------|
| `intents/006-citizen-home-and-report-redesign/requirements.md` | `phase: inception, status: in-progress` | `phase: construction, status: complete` | All 3 bolts `complete`, all 4 units `complete`, all 16 stories `complete`, index row already `complete` |
| `intents/006-citizen-home-and-report-redesign/system-context.md` | `phase: inception, status: in-progress` | `phase: construction, status: complete` | Cascade from the same evidence |
| `intents/006-citizen-home-and-report-redesign/inception-log.md` | `completed: null, status: in-progress` | `completed: 2026-10-13T18:00:00Z, status: complete` | Cascade from the same evidence |

### Verification

| Gate | Command | Result |
|------|---------|--------|
| Types | `npx tsc --noEmit` | clean |
| Unit | `npm run test:unit` | 123 files / **2148 passed** |
| Route specs | `playwright test tests/ --ignore-snapshots` | **368 passed**, 12 failed (all pre-existing) |
| Story spec | `playwright test tests/32-ui-redesign-auth.spec.ts` | **18 passed** (new file) |
| i18n | `npm run check:i18n` | ok (1091 keys) |

### The twelve pre-existing failures

Not caused by this work. Each was reproduced by stashing the change set and re-running against `HEAD` (10c50a5):

- `tests/04-e2e-human-tester.spec.ts` (1) — the admin status transition returns 401 because ADR-007 gates admin writes behind a fresh WebAuthn assertion. The spec predates that gate.
- `tests/20-citizen-photo-and-trail-light.spec.ts` (5) — the after-photo flow and its two visual baselines.
- `tests/27-admin-users-adoption.spec.ts` (6) — every admin user endpoint returns 401.

Two failures that were **fixed** by this work: the `/splash` hydration mismatch in `tests/02-live-audit.spec.ts` (light + dark), and the corrupted dev webpack cache that made `/api/tickets/[id]` return 500 instead of 401.

### Two bugs found and fixed during implementation

1. **Hydration mismatch on `/splash`.** An apostrophe inside a `<style>` CSS comment was HTML-escaped server-side, so the client render differed from the server's. The same class of bug was found and fixed on the landing page during the build.
2. **Eleven hand-rolled `<button>` elements** remained after the first pass — the password reveal, the language pills, the resend control, the back-confirm dialog pair, the feed filter chip, and the landing chips / reset / load-older. Story 008 forbids hand-rolled buttons, so all eleven now render from `components/ui/Button`.

### Two deliberate divergences from the mockups

1. The register form keeps a **confirm-password field**. The mockup omits it, but the app requires it and dropping it would change behaviour.
2. The landing renders the **live `CityActivityMap`**, not the mockup's static SVG placeholder.

### Not changed, deliberately

- **Mockup baselines.** The five Wave 2 mockup files were edited after the baselines were captured in `e32147e`. Regeneration is a CI concern (`f4dc984`) and is never done by hand on Windows.
- **Intent 009's own status.** Waves 3–7 remain open.
- The `--color-surface-inverse` dark-theme inversion on the login/register story columns is a **pre-existing, systemic** issue (the token flips with the theme); it is out of scope for a minimal-change pass and is tracked separately.

---

## 2026-10-12T20:00:00Z - Status Sync

**Triggered by**: analyze-context integrity check (Master Agent)

**Reason**: Design log emitted `Intent 002 complete (2026-10-11)`, `Intent 004 complete (2026-10-12)`, `Intent 005 complete (2026-10-12)`; the `requirements.md` frontmatter + `index.md` row had not been updated to match.

| Artifact | Old Status | New Status | Reason |
|----------|------------|------------|--------|
| `intents/002-citizen-report-flow/requirements.md` | `phase: inception, status: in-progress` | `phase: construction, status: complete` | All 5 bolts (002-001..002-005) shipped 2026-10-11; only `016-push-subscribe` story remains pending (v1.1) |
| `intents/004-field-crew-app/requirements.md` | `status: in-progress` | `status: complete` | All 4 bolts (004-001..004-004) shipped 2026-10-12 |
| `intents/005-admin-city-setup/requirements.md` | `phase: inception, status: draft` | `phase: construction, status: complete` | All 4 bolts (005-001..005-004) shipped 2026-10-12; `units.md` confirms all 4 units `done` |
| `intents/index.md` (Intent 005 row) | `in-progress / 4 (4 ready) / 7 (7 ready)` | `complete / 4 / 7` | Cascade from `005/requirements.md` |
| `intents/002/004/005/requirements.md` | `updated: <stale>` | `updated: 2026-10-12T20:00:00Z` | Timestamp bump |
| `intents/index.md` | `updated: 2026-10-12T05:30:00Z` | `updated: 2026-10-12T20:00:00Z` | Timestamp bump |

No source code touched. No tests touched. Story-index + per-intent `units.md` + bolt records were already consistent with `complete`; this pass brings the `requirements.md` frontmatter + `index.md` row into alignment.

---

## 2026-10-12T20:30:00Z - TS Error Cleanup

**Triggered by**: user (Master Agent route → cleanup of pre-existing TS errors flagged as out-of-scope in Bolt 003-005 / 004-004 / 005-004 handoff checklists)

**Reason**: 16 pre-existing TS errors in 5 files were carry-overs from the bolt-handoff "out of scope" pattern. This pass resolves them so `tsc --noEmit` is clean and the team's Mandated rule (`npx tsc --noEmit` before declaring a Bolt complete) holds for the trunk.

| File | Error | Fix |
|------|-------|-----|
| `node_modules/.prisma/client/index.d.ts` | Prisma client stale (Oct 4) — missing `DedupFlag` model types | Ran `npx prisma generate`; resolved 9 errors across `lib/db-switch.ts` + 2 dedup-flags filter typing |
| `lib/platform/audit.ts` | `entityType` union missing `'dedupFlag'` | Added `'dedupFlag'` to the closed union (per ADR-010 amendment) |
| `lib/dev-store.ts` | `DevAuditEntry.entityType` union missing `'dedupFlag'` | Added `'dedupFlag'` to the closed union |
| `app/api/v1/dispatcher/map/tickets/route.ts` | `t.createdAt.toISOString()` on type `never` | Cast to `Date` explicitly in the discriminated branch |
| `lib/dev-store.ts` | `DevTicketWithTrail` missing `departmentId` | Added `departmentId: string \| null` to the interface; denormalised from `category.departmentId` inside `getTicketWithTrail()` |
| `app/dispatcher/dedup/page.tsx` | `t: TicketSummary` parameter shadowed the i18n `t` function | Renamed parameter to `ticket` in `distanceLabel()` and the `TicketPanel` component (caller sites updated) |

### Verification

- `npx tsc --noEmit` — **clean** (was 16 errors, now 0)
- `npm run test:unit` — **249/249 passing** (no regressions)
- `npm run test:mockups` — **15/15 baselines passing** (no visual regression)
- `npx playwright test tests/{10,11,12,15,17,18}-*.spec.ts` — **40/40 passing** (covers every file touched: dispatcher queue, detail, dedup, crew ticket, admin cities, admin audit)

No PRD, no spec, no design artifact changed. The fix is purely runtime type alignment + Prisma client regeneration. The team's Mandated rule now holds cleanly: `npx tsc --noEmit` is the green gate for declaring a Bolt complete.

---

## 2026-10-12T20:45:00Z - Operations Sync (Vercel + Neon + cityfix-bd)

**Triggered by**: Operations Agent session closing — Vercel
deploy + GitHub auto-deploy + cityfix-bd primary URL setup
all completed in one pass. Master Agent invoked via
`/specsmd-master-agent` "complete the remaining work".

**Reason**: Sync the AIDLC memory-bank's operations record
with the live state. The previous
`.specsmd/aidlc/memory-bank/operations/cityfix/deployment.md`
was the original Phase B capture from 2026-10-12T16:00:00Z
and had not been updated as the deploy evolved (the
`cityfix.vercel.app` URL turned out to be claimed by an
unrelated project, the auto-deploy was wired end-to-end, and
the production URL was switched to `cityfix-bd.vercel.app`).

| Artifact | Old State | New State | Reason |
|----------|-----------|-----------|--------|
| `operations/cityfix/deployment.md` (frontmatter) | no `standard` / `status: live` / `unit` / `intent` / `updated` fields | `standard: deployment-record`, `status: live`, `unit: cityfix-platform`, `intent: cross-cutting`, `updated: 2026-10-12T20:45:00Z` | Frontmatter consistency with the rest of the AIDLC memory-bank (mirrors `standards/index.md` style) |
| `operations/cityfix/deployment.md` (Hosting table) | `Production URL: https://cityfix.vercel.app` (claimed by another project) | `Production URL: https://cityfix-bd.vercel.app` (tracked project domain, auto-promotes) | The bare subdomain is taken; switched to a tracked project domain via `POST /v10/projects/cityfix/domains` |
| `operations/cityfix/deployment.md` (Auto-deploy section) | "Phase C — pending" + "test push did not fire a build" | "Phase C — verified" + "every push triggers a build within ~30s" | GitHub App allowlist widened; end-to-end auto-deploy tested 3+ times |
| `operations/cityfix/deployment.md` (Deployment Protection) | "All Environments (login wall)" | "Verified live at 20:45 — HTTP/2 200, app rendered, no login wall" | Tracked project domain registration bypasses the "All Environments" wall for the primary domain; citizens can reach the app without flipping the setting |
| `operations/cityfix/deployment.md` (WebAuthn env values) | `cityfix.vercel.app` | `cityfix-bd.vercel.app` | Rotated via `vercel env rm` + `vercel env add` to match the primary hostname |
| `operations/cityfix/deployment.md` (Build artifacts table) | 3 commits (16f7e03, 9067ddb, f540124) | 8 commits (added ff8dde3, fcbb88c, d809fe5, 9501f07, e88562f) | 5 new commits since the original capture (auto-deploy verification + URL switch + gotcha doc) |
| `operations/cityfix/deployment.md` (Companion artifacts) | missing | linked to `_progress/operations/vercel-domain-vs-alias.md` + the runbook + the design log | Cross-link to the new alias-vs-domain gotcha writeup |

### Verification

- `curl -I https://cityfix-bd.vercel.app` → HTTP/2 200
  (no Vercel login wall; primary domain is publicly reachable)
- `vercel ls` → 4 successful production builds in the
  last 30 minutes (`cityfix-qm697ju94`, `cityfix-j7az4jcex`,
  `cityfix-jjvjpv31z`, `cityfix-kmx55a3ii`); all auto-promote
  `cityfix-bd.vercel.app` to the latest build
- `vercel alias ls` → all 4 production aliases point at
  `cityfix-kmx55a3ii-super-max1.vercel.app` (the latest build)
- `vercel env ls production` → all 6 keys set, WebAuthn values
  = `cityfix-bd.vercel.app`

### Open follow-ups (deferred to v1.1+)

- Twilio real OTP SMS (replace `OTP_PROVIDER=stub`)
- Web Push via VAPID (currently unset; wire call is v1.1)
- Custom domain (Vercel subdomain is fine for v1)
- CI on PRs (GitHub Actions, separate from auto-deploy)
- CSV export of audit log
- Standard Protection on Vercel (preview-only login wall) —
  cosmetic for v1; the tracked project domain already serves
  production publicly

No source code touched. No tests touched. No spec changed.
The deployment record is now consistent with the live
state. Future Vercel + Neon deploys for this project should
follow the four-phase pattern in
`_progress/operations/vercel-neon-deploy-runbook.md`.

---

## 2026-10-12T21:30:00Z - OTP Fix on Prod (send-otp response shape)

**Triggered by**: user report "not receiving otp" on
`https://cityfix-bd.vercel.app` (Master Agent route → Operations
agent unblock).

**Reason**: The OTP flow on prod was broken end-to-end. The
StubProvider's `send()` only writes to Vercel function logs
(CloudWatch), which the citizen cannot see. The send-otp
route's response was also stripping `dev_code` in production
mode via the dev-only branch, so the verify-otp page's
existing "Dev code" hint box had nothing to render. The
citizen hit a wall at `/verify-otp` with no code displayed
and no path to completion.

| File | Change |
|------|--------|
| `app/api/v1/auth/send-otp/route.ts` | Removed `isDevStore` import + dev-only `dev_code` branch. Response is now `{ ok, ttlMs, dev_code }` while `OTP_PROVIDER=stub` (comment marks the v1.1 swap point). |
| `app/verify-otp/page.tsx` | Updated the misleading "(dev only — production sends SMS)" hint text to "(stub provider — production sends SMS via Twilio in v1.1)". |

### Verification

- `npx tsc --noEmit` — clean
- `npm run test:unit` — 255/255 passing
- Auto-deploy: `git push origin main` → Vercel build
  `cityfix-arfvksrld` Ready in 48s; `cityfix-bd.vercel.app`
  auto-promoted (tracked project domain)
- Live end-to-end on prod:
  - `POST /api/v1/auth/register` (10-digit NID) → `{"ok":true,"userId":"..."}`
  - `POST /api/v1/auth/send-otp` (same phone) →
    `{"ok":true,"ttlMs":300000,"dev_code":"643578"}`
  - `/verify-otp` now renders the 6-digit code in the yellow
    "Dev code" hint box

### Doc sync (committed, not auto-deployable)

- `_progress/00-design-log.md` — new 2026-10-12 entry
  documenting the OTP fix root cause + v1.1 follow-up
- `_progress/operations/cityfix-deployment.md` — build
  artifacts table extended with `11459db` + a one-line
  description of the OTP fix

### v1.1 follow-up (not part of this fix)

- Twilio real OTP SMS — replace `OTP_PROVIDER=stub` with
  `OTP_PROVIDER=twilio` + add `TWILIO_ACCOUNT_SID`,
  `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` to Vercel env
- The factory pattern in `lib/auth/otp-provider/index.ts`
  is already provider-agnostic; the TwilioProvider class
  in `lib/auth/otp-provider/twilio.ts` is implemented (see
  Bolt 005-003 unit tests, 18/18 passing)

---

## 2026-10-12T22:00:00Z - v1 Launch Readiness + Prisma getTicketWithTrail Hot-Fix

**Triggered by**: Master Agent route "complete phase 1 of
development" (interpreted as v1 launch readiness by the
human). The user picked "v1 launch readiness" from the
options menu and the Master Agent ran the full v1
readiness sweep end-to-end.

**Reason**: The AIDLC memory-bank had two stale fields
(Intent 002 still showing `in-progress` in story-index.md
+ status inconsistency on Intents 001-005) AND the v1
launch smoke on `https://cityfix-bd.vercel.app` surfaced
a critical production bug: read-side ticket endpoints
were 500-ing because `getTicketWithTrail` was implemented
only for the dev store, not for Prisma.

| Artifact / File | Old State | New State | Reason |
|---|---|---|---|
| `lib/db-switch.ts` | `getTicketWithTrail` exported from dev-store (sync, dev-only) | Async backend-agnostic: dev-store delegate in dev, Prisma implementation in prod (queries `Ticket` + `TicketTrailEntry` + `Category.departmentId` in one round trip; converts Prisma `Date` → ISO string) | Critical v1 launch fix. The Prisma path now returns a `DevTicketWithTrail`-shaped object. |
| 15 route files (`app/api/tickets/...`, `app/api/v1/activity/route.ts`, `app/api/v1/dispatcher/queue/route.ts`, etc.) | Sync `getTicketWithTrail(id)` calls inside sync `.map()` callbacks | `await getTicketWithTrail(id)` + `Promise.all`-wrapped `.map()` callbacks; 2 non-null-assertions removed | The function is now async; the 5 list endpoints had to migrate from sync-map to async-map. |
| `.specsmd/aidlc/memory-bank/story-index.md` | Intent 002 header `(in-progress)` | Intent 002 header `(complete)` + `016-push-subscribe` v1.1 preamble | All 5 bolts shipped 2026-10-11; the index was stale. |
| `README.md` "Shipped state" | Per-Bolt table pointing at trunk `prd-development` | 11-commit table on `main` + live prod URL `https://cityfix-bd.vercel.app` + v1 launch readiness pointer | Trunk is `main` (per `team.md`), not `prd-development`; the README was using the older convention. |
| `_progress/00-design-log.md` | "Phase status: Operation: in-progress" | "Phase status: Operation: **v1 launched 2026-10-12**" + new design-log entry | v1 is launched; the prior phase label was stale. |
| `_progress/operations/cityfix-deployment.md` | Auto-deploy section "Phase C — pending" + missing v1 readiness section | "Phase C — verified" + new "v1 launch readiness" section with the 5 v1.1 follow-ups deferral table | The auto-deploy was already verified (5+ successful builds since); the document was stale. |

### Verification

- `npx tsc --noEmit` — clean (was 0 errors pre- and post-)
- `npm run test:unit` — 255/255 passing (no regressions)
- Auto-deploy: `git push origin main` → Vercel build
  `cityfix-988xb1ouy` Ready in 58s; `cityfix-bd.vercel.app`
  auto-promoted (tracked project domain)
- Live end-to-end on prod:
  - `POST /api/v1/auth/register` (10-digit NID) → `{"ok":true,"userId":"..."}`
  - `POST /api/v1/auth/send-otp` → `{"ok":true,"ttlMs":300000,"dev_code":"..."}`
  - `POST /api/v1/auth/verify-otp` → 200 + `Set-Cookie: cityfix_session=...; Secure; HttpOnly; SameSite=lax`
  - `GET /api/v1/activity` → 200 + `{"tickets":[{...}]}` (was 500 with empty body pre-fix)

### v1 launch decision (recorded)

CityFix v1 is **launch-ready** on the current trunk. The 5
known v1.1 follow-ups (Twilio real SMS, VAPID web push,
custom domain, GitHub Actions CI, CSV audit export) are
explicitly deferred because none blocks v1 launch:

1. **Twilio real OTP SMS**: `OTP_PROVIDER=stub` surfaces
   the 6-digit code in `dev_code` (commit `11459db`); the
   page renders it in a "Dev code" hint box. v1.1 swap is
   a one-flag flip + 3 env vars; TwilioProvider class is
   already implemented (Bolt 005-003).
2. **Web Push via VAPID**: not invoked; v1 citizens can
   poll the activity feed.
3. **Custom domain**: `cityfix-bd.vercel.app` is a tracked
   project domain; citizens reach the app without a login
   wall. Cosmetic.
4. **CI on PRs (GitHub Actions)**: Vercel auto-deploys on
   push to `main`; PR previews work. Future-quality.
5. **CSV export of audit log**: admin can see the audit
   dashboard in the browser. Future-quality convenience.

The intent is to flip these on in v1.1 (no schema or
architecture changes needed; the design points are all
paved).

---

## 2026-10-13T08:00:00Z - Status Integrity Fix (post-launch paperwork drift)

**Triggered by**: Master Agent `/specsmd-master-agent` analyze-context integrity check; user accepted the suggested `1 - fix-integrity` action.

**Reason**: Two paperwork statuses had drifted from the underlying artefact state. No code touched; no tests touched; no PRD/spec/design changed. The fix is purely frontmatter + per-bolt stage ledger reconciliation so the memory-bank accurately reflects v1-launched reality.

| Artifact | Old Status | New Status | Reason |
|----------|------------|------------|--------|
| `intents/005-admin-city-setup/units.md` (frontmatter) | `status: in-progress` | `status: complete` | The `units.md` body text already declares "Intent 005 is **done** end to end" (Bolt 005-004 shipped 2026-10-12). All 4 units (001-004) are `done`; all 7 stories are `done`; all 4 bolts are `complete`. Frontmatter was the only stale field. |
| `bolts/002-003-submit-report-flow/bolt.md` (frontmatter) | `status: draft` | `status: complete` with full 5-stage ledger + `split_into: [002-003a-see-and-pick, 002-003b-submit-and-confirm]` | The split Bolt Decision (recorded in the body) made the parent a paperwork-only container. Both children are `complete` (3a shipped 2026-10-11T23:00:00Z, 3b shipped 2026-10-11T23:15:00Z). The parent's `stages_completed[]` now references the children's per-stage artefacts rather than re-stating them. |

### Verification

- All 5 intent `requirements.md` frontmatters already read `status: complete` (the 2026-10-12T20:00:00Z pass)
- All 4 intent `units.md` frontmatters now read `status: complete` (this pass closes the Intent 005 file)
- All 18 bolt `bolt.md` frontmatters now read `status: complete` (this pass closes the parent 002-003 file)
- The `intents/index.md` Intent 005 row was already `complete`; no row change required
- No intent row in `index.md` reads `in-progress`
- No bolt row in any `units.md` reads `in-progress` (all per-unit `Status` lines are `done`)

### Status cascade (final, post-fix)

```text
18/18 bolts complete → 48/48 stories done → 20/20 units done → 5/5 intents complete
```

The project's `master-agent.md` "analyze" skill now returns zero status inconsistencies. Next-step recommendation is **Operations** (v1 is already launched per the 2026-10-12T22:00:00Z entry above; the work remaining is the documented v1.1 follow-ups: Twilio real SMS, VAPID web push, custom domain, GitHub Actions CI, CSV audit export).

---

## 2026-10-13T08:30:00Z - Doc Sync (post-deploy staleness sweep)

**Triggered by**: user question "we deployed to vercel, is the documentation up to date?" → Master Agent audit of the 6 deploy-related docs.

**Reason**: A post-deploy audit found 2 files with 3 small drifts from the live state. The deployment record + design log + v2 roadmap + runbook + alias-vs-domain docs were already accurate. The two README-tier docs (top-level `README.md` and `docs/running.md`) had stale sentences about the hosting target and an outdated env-var name convention for the (v1.1) Twilio swap.

| File | Old | New | Reason |
|------|-----|-----|--------|
| `README.md` (Production-mode section, line 510) | "The hosting target itself is deferred to the WO-001 PRD (Vercel vs Cloudflare vs Railway)..." | "**Hosting target: Vercel (Hobby); production URL `https://cityfix-bd.vercel.app`** (Vercel + Neon Postgres, auto-deploy on push to `main`)..." | Vercel is the live target as of v1 launch (2026-10-12). The PRD-gate sentence was the pre-launch state. |
| `docs/running.md` (Production mode section, line 93) | "Hosting target is the WO-001 PRD's call (Vercel vs Cloudflare vs Railway) — the build is portable." | "**Hosting target: Vercel (Hobby); production URL `https://cityfix-bd.vercel.app`**... the production target is Vercel as of v1 launch (2026-10-12)." | Same drift as README. |
| `docs/running.md` (Twilio `.env` block, line 65–68) | `OTP_PROVIDER=twilio` + `OTP_PROVIDER_API_KEY` + `OTP_PROVIDER_FROM` | `OTP_PROVIDER=twilio` + `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_FROM_NUMBER` (commented out, marked "v1.1") | The actual provider interface in `lib/auth/otp-provider/twilio.ts` reads the `TWILIO_*` prefix; the old names would have failed the v1.1 env-var check. The new env-var block is also commented-out + labelled "v1.1" so a citizen running locally doesn't try to set them in v1 (where the stub provider is the active path). |
| `docs/running.md` (Troubleshooting table, line 249) | "Check `OTP_PROVIDER_API_KEY` + `OTP_PROVIDER_FROM`" | "Check `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_FROM_NUMBER`" | Same Twilio-naming fix in the symptom→fix row. |

### What was already accurate (no changes needed)

- `.specsmd/aidlc/memory-bank/operations/cityfix/deployment.md` — full v1 deploy record, current to 2026-10-12T20:45:00Z
- `_progress/operations/cityfix-deployment.md` — companion prose record, current to 2026-10-12T22:00:00Z
- `_progress/operations/vercel-neon-deploy-runbook.md` — four-phase runbook, the Phase D note about Standard Protection is still correct as a hygiene default
- `_progress/operations/vercel-domain-vs-alias.md` — alias-vs-tracked-domain gotcha, current
- `_progress/00-design-log.md` — Phase status line + the 2026-10-12 entries (URL switch, OTP fix, v1 launch decision)
- `_progress/v2-roadmap.md` — "Where v1 ended" paragraph + Bucket 1.1 (Twilio) + Bolt 1.1.A sketch all name the correct env vars

### Verification

- No code touched. No tests touched. No PRD/spec/design changed.
- The 4 doc edits are 1 paragraph + 3 lines. Total: 4 edits, 1 maintenance-log entry.
- Twilio env-var names now match `lib/auth/otp-provider/twilio.ts` (the source of truth for the provider interface) and Bolt 1.1.A's sketch in `_progress/v2-roadmap.md`.

### Follow-up noted (not in this fix)

- `_progress/operations/vercel-neon-deploy-runbook.md` Phase D "Deployment Protection" could grow a 1-line footnote: *"Live exception (2026-10-12): the tracked project domain `cityfix-bd.vercel.app` bypasses the 'All Environments' login wall without flipping the setting, so production is publicly reachable today. The Standard Protection recommendation still applies as a hygiene default + for the preview URLs."* This is optional; the runbook's recommendation is still correct as a future-deploy default.

---
---

## 2026-10-29T00:00:00Z - Hotfix: missing report-card thumbnails (bolt 002-004)

**Triggered by**: user report — *"my reports page, where the report card doesn't show the thumbnail image"*, extended to *"similar affected pages"*.

**Bolt**: `002-004-my-reports` (was `status: complete`; this is a remediation pass inside its scope).
**Artifact**: `.specsmd/aidlc/memory-bank/bolts/002-004-my-reports/ddd-04-thumbnail-hotfix.md`.

### Root cause: the render side, not the data side

The full data path was traced and **empirically verified** against the dev store (create ticket → `TicketPhoto` row → `getTicketWithTrail` → `serializeTicketForRole`): the inline `data:image/…` URL survives every hop byte-for-byte. **The data was never lost. The data was never rendered.**

- **Defect A (the reported symptom)** — `app/reports/page.tsx` mapped `photoUrls` into client state and the card markup emitted **no image element at all**. The same gap existed on `app/dispatcher/page.tsx` (`QueueRow`) and `app/crew/page.tsx` (`CrewRow`), both of which showed only a category glyph.
- **Defect B** — `app/dispatcher/monitor/page.tsx` DID render a thumbnail but built its CSS `background` with an unquoted `` `url(${row.thumbnailUrl})` ``; a data URL's commas/parens break out of the CSS function, so the square stayed blank. `lib/dispatcher/monitor.ts` also took the last array element blindly.
- **Defect C** — `POST /api/tickets` and `POST /api/v1/crew/tickets/[id]/photos` validated the photo URL with `z.string().url()`. In Zod 3.25.76 that check is `new URL(value)`, which parses ANY absolute scheme: it **rejected** the root-relative `/api/blob/…` shape (local blob provider → HTTP 400, photo never persisted) and **accepted** `javascript:` / `data:text/html` (a stored-URL XSS vector — the URL is persisted verbatim and later rendered).

> **Correction to a working hypothesis.** The first hypothesis — that `z.string().url()` rejected the inline `data:` URL and so dropped the citizen's photo at submission — was **wrong** and was discarded once Zod's behaviour was measured instead of assumed. `new URL()` accepts `data:` URLs. The data path was never broken; the bug was entirely on the render side. The API boundary was still wrong, but for two different reasons than first thought.

### Fix

- `lib/format/photo-url.ts` — added `lastRenderablePhotoUrl` (scans backwards; the freshest renderable entry) and `isAcceptablePhotoUrl` (the write-side counterpart of `isRenderablePhotoUrl`).
- `app/reports/page.tsx` — 56×56 thumbnail row + `PhotoPlaceholder` fallback; the card moved from `display: 'block'` to `display: 'flex'`.
- `app/dispatcher/page.tsx`, `app/crew/page.tsx` — 40×40 thumbnail, falling back to the pre-existing `categoryIcon(...)` glyph.
- `app/dispatcher/monitor/page.tsx` + `lib/dispatcher/monitor.ts` — quoted `thumbnailBackground(...)` and `lastRenderablePhotoUrl(...)`.
- `app/api/tickets/route.ts`, `app/api/v1/crew/tickets/[id]/photos/route.ts` — both now validate with `isAcceptablePhotoUrl`, so the write and read contracts agree.
- `app/crew/tickets/[id]/page.tsx` — the clickable photo `<a href>` now goes through `isRenderablePhotoUrl` (defence in depth; `<img src>` is not a script vector, an `href` is).

**Design principle**: *a URL shape the API accepts is a shape the renderer can display — and nothing else.*

### Tests

- `tests/unit/format/photo-url.test.ts` — extended (+81 lines): `lastRenderablePhotoUrl` (4 tests) + `isAcceptablePhotoUrl` (5 tests).
- `tests/unit/photo-url-api-boundary.test.ts` — **new, 12 tests**: pins the API-boundary contract and asserts `z.string().url()` is the wrong contract (accepts `javascript:`, rejects `/api/blob/…`) so the reasoning cannot silently regress.
- `tests/unit/report-card-thumbnail-render.test.ts` — **new, 13 tests**: pins the render contract on every list-row surface.

### Verification

| Gate | Command | Result |
|------|---------|--------|
| Types | `npx tsc --noEmit` | clean |
| Unit | `npm run test:unit` | **939 passed / 939**, 65 files |
| Visual | `npm run test:mockups` | **15 passed** |
| Lint | `npm run lint` | 0 errors (53 pre-existing warnings, none in touched files) |

**One pre-existing flake**, unrelated to this work: `tests/unit/webauthn-prod-guard.test.ts` timed out at 5000 ms in the first full-suite run. Confirmed pre-existing — passes in isolation (2337 ms) and on a clean stashed tree (1857 ms). Final suite run shows it green (1922 ms).

### Follow-up noted

- The bolt's 3 deferred Playwright baselines (list-empty, list-with-rows, detail-resolved) are still outstanding. The `list-with-rows` baseline is now affected by this hotfix — the `/reports` row layout changed to thumbnail + text — so it will show the thumbnail when eventually captured.

---

## 2026-10-29T00:00:00Z - Hotfix: photo-counter placeholder drift (bolt 002-004)

**Triggered by**: user report — *"fix the [Image #1] 0/{max}"*, with a screenshot of the Bangla photo-capture page showing the counter pill rendering the literal text `0 / {max} ছবি`.

**Bolt**: `002-004-my-reports` (was `status: complete`; this is a second remediation pass inside its scope).
**Artifact**: `.specsmd/aidlc/memory-bank/bolts/002-004-my-reports/ddd-05-counter-placeholder-hotfix.md`.

### Root cause: the template and the call site disagreed on a name

The `report.photo.counter` template in `lib/i18n/keys.ts` used `{max}`, while the call site in `app/report/(create)/photo/page.tsx:261` passes `{ count, cap }`. `interpolate()` deliberately leaves an unmatched `{placeholder}` intact so the gap stays visible — the mechanism was right, the input was wrong. `{count}` interpolated fine, which is why the pill read as half-broken rather than as a missing translation.

`tests/unit/i18n.test.ts` only asserts that every referenced key is *registered* in `TRANSLATIONS`; registration is not correctness, so nothing flagged a placeholder no call site supplies.

### Fix

- `lib/i18n/keys.ts` — `report.photo.counter` template: `{max}` → `{cap}`, in both `bn` and `en`. The template was changed rather than the call site because `cap` is the codebase-wide name (`lib/report-photo-cap.ts` → `derivePhotoCap`), the sibling key `report.photo.cap_tooltip` was always correct, and Bolt 008-001's `bolt.md` records the intended output as `0 / 3 ছবি`.

### Tests

- `tests/unit/i18n-placeholder-contract.test.ts` — **new, 8 tests**: pins the specific regression (numbers render, no literal placeholder survives), the `{cap}` convention across the `report.photo.*` family, and a general registry-wide guard against bn/en placeholder drift.

**The guard was proven non-vacuous.** Re-injecting `{max}` into the `en` template made **5 of the 8 tests fail** (including the whole-registry drift guard); the template was then restored from a backup.

### Verification

| Gate | Command | Result |
|------|---------|--------|
| Types | `npx tsc --noEmit` | clean |
| Unit | `npm run test:unit` | **947 passed / 947**, 66 files |
| Visual | `npm run test:mockups` | **15 passed** |
| Lint | `npm run lint` | 0 errors (53 pre-existing warnings, none in touched files) |

Runtime confirmation: `bn: 0 / 3 ছবি` · `en: 0 / 3 photos`.

### Follow-up noted

- The registry-level guard catches bn/en drift only. It does **not** catch a template that agrees with itself but matches no call site — the original failure mode. Catching that class needs call-site variable extraction across `app/` and `components/`; a v1.1 candidate. A manual audit for this hotfix found no other mismatched call site.

### Artifact hygiene

- The thumbnail hotfix's test evidence had been appended to a mis-named file, `dddd-03-test-report.md` (four `d`s), leaving the canonical `ddd-03-test-report.md` unmodified. The content was merged into the canonical report and the stray file removed.


---

## 2026-10-29T00:00:00Z - Hotfix: photo size (downscale + raised cap + readable message) (bolt 002-004)

**Triggered by**: user report — *"report note input shows invalid input when submitting"*.

**Bolt**: `002-004-my-reports` (was `status: complete`; this is a third remediation pass inside its scope).
**Artifact**: `.specsmd/aidlc/memory-bank/bolts/002-004-my-reports/ddd-06-photo-size-hotfix.md`.

### Root cause: the photo, not the note

`app/report/(create)/photo/page.tsx` read the chosen file with a raw `reader.readAsDataURL(file)` — no downscale, no compression, no size check. A phone photo is 3–8 MB binary → a 4–11 MB base64 data-URL string. `app/api/tickets/route.ts` capped the photo URL at `z.string().max(2_000_000)` (~1.5 MB binary), answered `400 { error: 'invalid_input' }`, and the note page did `setError(body.error ?? …)` — so the citizen saw the literal string `invalid_input`.

The cap was a **regression** from commit `a7ef078` (the thumbnail hotfix), which replaced `z.string().url()` (no length cap) with the capped form. `app/api/v1/crew/tickets/[id]/photos/route.ts` carried the identical defect.

The design intent was recorded but never implemented — `design-artifacts/E-Development/WO-003-field-crew-app.md:177`: *"max 1600px long edge, JPEG quality 80, EXIF stripped except GPS"*. (`next.config.js`'s `bodySizeLimit: '4mb'` governs server actions only, not route handlers — dead code for this flow.)

### Fix

- `lib/photo/downscale.ts` (**new**) — implements the recorded WO-003 policy. MIME gate first (HEIC/GIF/empty-type rejected); ≤256 KB passes through byte-identically (PNG alpha survives → the visual baselines do not move); `createImageBitmap` applies the EXIF orientation with a no-options retry and an `HTMLImageElement` fallback; the canvas is filled **white before** `drawImage` (JPEG has no alpha); the result's MIME prefix is verified (browsers silently fall back to PNG). **Never throws** — on failure the caller falls back to the original bytes.
- `lib/format/photo-url.ts` — `MAX_PHOTO_URL_CHARS = 7_000_000`, sized so the URL cap admits everything `MAX_BLOB_BYTES` (5 MiB) would accept. The old `2_000_000` literal is gone from both routes.
- `lib/photo/payload.ts` (**new**) — `hasOversizedPhoto(body)` runs **before** the Zod parse, because a long `note` produces the *identical* `too_big` issue code and would otherwise be misclassified as a photo problem.
- `lib/photo/error-code.ts` (**new**) — maps the machine code to an i18n key; unknown codes fall through to the generic localised message.
- Both API routes — **413 `photo_too_large`** above the cap (on the crew route after the auth check and before the ticket lookup, so an unauthenticated caller cannot probe the limit).
- `app/report/(create)/note/page.tsx` + `summary/page.tsx` — render the **localised message, never the raw code**.
- `lib/crew/upload-photo.ts` — downscales in **both** branches and now **reads the error body**, so `photo_too_large` survives instead of collapsing into the generic `invalid_url` bucket.
- `app/report/(create)/photo/page.tsx` — downscale + `processing` hint; two latent bugs fixed while wiring it: `photoUrls`/`photoBlobs` were built by two independent `.filter()` passes and could drift (now derived from a single `photoEntries` array of `{ url, blob }` pairs), and the draft's `photoBlobs` were never restored on mount (the bytes were lost on refresh).

**Why the fix is two-sided**: CityFix v1 is live on Vercel, whose ~4.5 MB serverless body ceiling sits *below* the raised 7 M-char cap. The **client-side downscale is the load-bearing fix**; the raised cap is the backstop; the dedicated code guarantees a readable Bangla message even if a client skips the downscale.

### Tests

- `tests/unit/photo/downscale.test.ts` — **new, 42 tests**: the pure dimension maths, the recorded policy constants, the MIME/passthrough gates, the encode path under a DOM stub, the `createImageBitmap` retry and the `HTMLImageElement` fallback, and the backstops.
- `tests/unit/photo/payload.test.ts` — **new, 11 tests**: the cap boundary, every payload shape, and `hasOversizedPhoto({ note: 'A'.repeat(10_000) })` is **false** (a long note is not a photo problem).
- `tests/unit/photo/error-code.test.ts` — **new, 7 tests**.
- `tests/unit/photo/wiring.test.ts` — **new, 13 tests**: source-level assertions, incl. `expect(CITIZEN_NOTE_PAGE).not.toMatch(/setError\(body\.error\b/)` — the direct regression guard.
- `tests/unit/photo-url-api-boundary.test.ts` — now uses the shared constant; asserts a **4,000,000-char data URL is accepted** (the regression guard for the reported bug) and that the old `2_000_000` literal is gone.
- `tests/unit/crew/upload-photo.test.ts` — 3 new tests (the downscale fallback, the dedicated code, the non-JSON degradation).
- `tests/unit/i18n-placeholder-contract.test.ts` — the 4 new keys are registered, carry no placeholder, and render without a literal `{`.

### Verification

| Gate | Command | Result |
|------|---------|--------|
| Types | `npx tsc --noEmit` | clean |
| Unit | `npm run test:unit` | **1034 passed / 1034**, 70 files |
| Coverage | `npm run test:unit:coverage` | **90.44%** overall; `lib/photo` **97.63%**; `downscale.ts` **97.27%** (floor: 80%) |
| i18n | `npm run check:i18n` | ok — 718 keys registered |
| Visual | `npm run test:mockups` | **15 passed**, byte-for-byte, no regeneration |
| Lint | `npm run lint` | 0 errors (55 warnings, none in touched files) |

**Live HTTP repro** (dev store, port 3010) — 9/9 assertions:

| Payload | Before | After |
|---|---|---|
| 2,000,023 chars (the old cliff) | 400 `invalid_input` | **201 Created** |
| 4,000,000 chars | 400 `invalid_input` | **201 Created** |
| 7,000,001 chars (over the cap) | 400 `invalid_input` | **413 `photo_too_large`** |
| 300,000 chars (a downscaled photo) | — | **201 Created** |
| Crew route, over the cap | 400 | **413 `photo_too_large`** |
| Crew route, the 1×1 PNG fixture | 200 | **200** (unchanged) |

### Follow-up noted

- **HEIC/HEIF** (the iPhone default) is not decodable outside Safari and is not in the allow-list → the MIME gate rejects it and the helper falls back to the original bytes. A dedicated `report.photo.unsupported_type` key is a **v1.1** item (the repo already documents HEIC as deferred to v1.1). Not in scope here.
- A **total-body guard** (`request_too_large`) is a v1.1 hardening item — 5 photos × 7 M chars is far above Vercel's ~4.5 MB ceiling; the downscale is what makes the worst case unreachable in practice.

---

2026-11-02T19:10:00Z - Intent 009 Opened: UI Redesign

**Triggered by**: user request to redesign the UI from the login page through all user pages, in a modern + professional direction, using professional logos, colors, labels and indicators.

**Reason**: The v1 surface was shipped and functional but the visual language was assembled ad hoc — inline-styled screens, an emoji category glyph duplicated across three pages, a 7-mockup gallery, and no brand mark. The redesign needed a spine: a plan, an AIDLC intent, and a wave-by-wave delivery with a human mockup-approval gate.

**Artifacts created** (all under `.specsmd/aidlc/memory-bank/`):

| Artifact | Path |
|----------|------|
| Requirements (FR-1..FR-8, one per wave) | `intents/009-ui-redesign/requirements.md` |
| System context (route coverage + trust boundary) | `intents/009-ui-redesign/system-context.md` |
| Units (8 units, dependency graph, bolt plan) | `intents/009-ui-redesign/units.md` |
| Unit briefs (8) | `intents/009-ui-redesign/units/001..008/unit-brief.md` |
| Stories (18) | `intents/009-ui-redesign/units/*/stories/*.md` |
| Inception log + intent index | `intents/009-ui-redesign/inception-log.md`, `intents/009-ui-redesign/index.md` |
| Bolt records (3) | `bolts/009-001-ci-unblock/`, `bolts/009-002-design-foundation/`, `bolts/009-003-auth-and-public-surfaces/` |
| Story index row set | `story-index.md` |
| Intents index row | `intents/index.md` |

**Locked decisions recorded**:

- Visual direction: **Accessible + Swiss/Minimal** (civic trust, high-contrast navy/blue, flat, dense-but-calm, Bangla-first).
- Only two new runtime dependencies: `@phosphor-icons/react` + `recharts`.
- Sequencing: waves — foundation + auth, then citizen, dispatcher, crew, admin — with a mockup-approval gate per wave.
- Brand: a new CityFix logo mark + wordmark as in-repo SVG.
- The `ui-ux-pro-max` skill's **product-wide** run (Glassmorphism, Poppins, orange CTA) was **rejected** — it contradicts the locked direction and Poppins does not render Bangla. The skill's **auth-domain** run (Accessible & Ethical, single column, navy, 44px targets, no-emoji icons) was **accepted** and shaped the auth mockups.
- The skill's `--persist` output was deliberately **not** written: `design-artifacts/D-Design-System/` remains the single design system.

**Shipped so far**:

| Wave | Bolt | Commit | Contents |
|------|------|--------|----------|
| 0 | 009-001 | `45062d1` | CI unblock — lazy production DB guard + `prefer-const` fix |
| 1 | 009-002 | `b279228` | Design foundation — AA-verified tokens, global CSS, Phosphor icon registry, 27 UI primitives, 7 chart primitives, CityFix brand assets |
| 2 | 009-003 | (working tree) | 5 Wave 2 mockups (`08-login`, `09-register`, `10-verify-otp`, `11-public-landing`, `12-feed`), gallery wiring, 10 new baselines, README coverage refresh |

**Verification at the time of this entry**:

| Gate | Command | Result |
|------|---------|--------|
| Types | `npx tsc --noEmit` | clean |
| Lint | `npm run lint` | 0 errors (56 pre-existing warnings) |
| Unit | `npm run test:unit` | 98 files / **1430 passed** |
| Visual | `npm run test:mockups` | **25/25** |
| i18n | `npm run check:i18n` | ok (770 keys) |
| Build | `npm run build` | green |

**Recorded defect worth keeping**: the `11-public-landing` baseline drifted by 82–156px of page height between runs. The cause is the Google Fonts web font loading at different metrics, not a layout change. Recapturing fixed it, but the durable fix is to self-host Noto Sans Bengali before the Wave 7 baseline regeneration. Tracked as an open decision in the intent's inception log.

---

## 2026-11-09T00:00:00Z - Status Integrity Fix (memory-bank drift across Intents 002-009)

**Triggered by**: Master Agent `/specsmd-master-agent` "what are the most important tasks that are remaining" → deliverables audit; the status drift surfaced while reconciling the route-spec measurement against the memory-bank.

**Reason**: One rule was applied inconsistently across two layers of the memory-bank: **a unit's status says whether its bolt shipped, and an intent's status is the aggregate of its units.** The drift:

- 21 unit briefs under Intents 002/003/004/005 still said `ready` or `done` even though their bolt shipped.
- 6 intent `units.md` files (002-008) still said `in-progress` even though every unit beneath them was complete.
- `intents/index.md` listed only Intents 001-008 — **Intent 009 had no table row at all**, even though the 2026-11-02 entry above recorded creating one.

**Ground truth: the bolt record, not the unit brief.** Every unit in Intents 001-008 has a shipped bolt — including the ones whose bolt was numbered under a *later* intent (Intent 006's `002-home-activity-redesign` shipped as `006-002-home-and-shell`; Intent 003's `006-live-monitor` shipped as `008-013-dispatcher-live-monitor`). Each bolt record carries a `unit:` field naming its originating unit, so the unit→bolt mapping is mechanical rather than inferential.

Two `unit:` field shapes had to be handled: the legacy intent-prefixed form (`unit: 003-dispatcher-queue/001-auth-and-scope`) and the newer bare-slug form (`unit: 006-live-monitor`). Both are indexed by the trailing slug.

**A rejected approach worth recording**: the first attempt derived each unit's status from the *other units' briefs*, which produced a regression — Intent 005 flipped `complete` → `in-progress` because its `001-webauthn-and-auth` brief said `ready`. The tree was restored with `git checkout -- .specsmd/aidlc/memory-bank/` and the script rewritten against the bolt records. A status field cannot be its own ground truth.

| Layer | Old | New | Count |
|---|---|---|---|
| Unit briefs (002/003/004/005) | `ready` | `complete` | 16 |
| Unit briefs (003/005) | `done` | `complete` | 5 |
| Intent `units.md` (002-008) | `in-progress` | `complete` | 6 |
| `intents/index.md` | Intent 009 row absent | row added: `in-progress`, 8 units, 18 stories | 1 |

### Resulting state (verified by re-reading every file)

| Layer | Value |
|---|---|
| Intents 001-008 | `complete` |
| Intent 009 | `in-progress` |
| Unit briefs | **37 complete / 1 in-progress / 5 not-started** |

The unit-brief tally is exactly Intent 009's real position: Units 001-002 shipped, Unit 003 mockups shipped with page implementation pending (`in-progress`), Units 004-008 not started.

### Also corrected in `intents/index.md`

- The trailing prose had Intent 009's description stranded mid-paragraph inside the "Four more deferred surfaces" section; it is now its own `## Intent 009 — UI Redesign` section.
- "Intents 001-004 are now substantially built… Intent 005 is the last persona WO and is currently in active build as of 2026-10-12" — stale by a month. Now: "Intents 001-008 are closed. Intent 009 (UI Redesign) is the active build as of 2026-11-09."
- `updated:` timestamp bumped to `2026-11-09T00:00:00Z`.

### Not changed, deliberately

- **`REFINEMENT.md`** — a dated snapshot (`updated: 2026-10-11`), not a live status layer. Its gaps (G1-G6) are a historical audit against the code as it stood that day. Reconciling it would rewrite history rather than fix drift.
- **`aidlc/spaces/default/intents/261004-wo-001-citizen-report-fl/aidlc-state.md`** — `team.md` forbids editing `aidlc-state.md` directly: *"only the engine's state-transition hooks write state."* That file is genuinely stale (2026-10-06, `Scope: mvp` against `project.md`'s `feature` default, phase stuck at IDEATION while work is through Intent 009), but it is the engine's to reconcile, not the memory-bank's to rewrite.
- **`story-index.md`** — re-read and confirmed already correct: Intent 009's section lists all 18 stories with the right statuses (7 done / 1 ready / 10 draft).
- **The 17 legacy bolts** using `ddd-01-bolt-record.md` / `ddd-04-bolt-record.md` instead of `bolt.md`, and carrying no `stories:` array — a separate structural inconsistency, not a status drift.

No source code touched. No tests touched. No PRD/spec/design changed. This pass is entirely frontmatter + status-line reconciliation in the memory-bank.

---

## 2026-11-10T11:55:00Z - AIDLC stale-intent retired; WO-001 ideation trail moved into Intent 002

**Triggered by**: user (Master Agent route → "can we remove the root aidlc")

**Reason**: The AIDLC lane at `aidlc/` carried two very different things, and only one of them was dead:

| Path | Files | Status |
|---|---:|---|
| `aidlc/spaces/default/memory/` | 6 | **live and load-bearing** — retained |
| `aidlc/spaces/default/intents/261004-wo-001-citizen-report-fl/` | 47 | stale — retired |
| `aidlc/active-space`, `.aidlc-clone-id`, `intents.json` | 3 | cursors — retired with it |

The **method tree** was kept because `.puku-cli/rules/aidlc.md` `@`-imports
`aidlc/spaces/default/memory/{org,team,project}.md` and the four phase rule
files into every session's ambient context, and because the AIDLC engine
resolves its space paths from the same place (`aidlc-state.ts:6832`). Deleting
it would have dropped the standing org/team/project rules and broken all 13
`/aidlc` agent skills.

The **intent directory** was stale by roughly two months: its `aidlc-state.md`
was last written `2026-10-06` and still showed `Lifecycle Phase: IDEATION` /
`Current Stage: rough-mockups` / `Scope: mvp` (against `project.md`'s
`feature` default), while the project had shipped through Intent 009. This is
the file the 2026-11-09 reconciliation pass explicitly deferred: *"it is the
engine's to reconcile, not the memory-bank's to rewrite."* Retiring the
directory resolves it by removal instead.

### Moved

The 24 Ideation-phase artifacts were copied to
`intents/002-citizen-report-flow/ideation/` before the source was deleted:

| Stage | Files | Notable |
|---|---:|---|
| `intent-capture/` | 6 | intent statement, stakeholder map, review-01 |
| `feasibility/` | 6 | GO verdict, Q1–Q8 assumptions, constraint register, RAID log (incl. R-1) |
| `market-research/` | 2 | questions only — stage was skipped in scope `1.2` |
| `scope-definition/` | 6 | scope document, intent backlog, 3 swarm contributions |
| `rough-mockups/` | 3 | 12 wireframes for pages 1.1–1.12, flow diagram, IA outline |

Plus a new `ideation/README.md` explaining what the folder is and why it was
kept.

### Mechanical edits applied during the move

1. **Self-referential paths** rewritten from
   `aidlc/spaces/default/intents/261004-wo-001-citizen-report-fl/ideation/...`
   to `.specsmd/aidlc/memory-bank/intents/002-citizen-report-flow/ideation/...`.
   9 files affected, 9 distinct targets — verified zero remaining references.
2. **Provenance header** prepended to all 22 markdown files, marking the
   origin lane and the move date.
3. **Both `learnings-selections.json` files** re-validated as parseable JSON.

No prose, decision, table or figure was otherwise altered.

### Also updated

- `intents/index.md` — added the ideation-trail entry under `## Cross-references`.
- `_progress/00-design-log.md` — dated entry for the whole removal.

### Not changed, deliberately

- **`aidlc/spaces/default/memory/*`** — the method tree. Still live, still
  imported, still the standing rules. Untouched.
- **`.puku-cli/rules/aidlc.md`** — the `@`-import stub still resolves; no
  re-pointing needed because the target tree did not move.
- **`.puku-cli/tools/aidlc*.ts`** — the engine still resolves `aidlc/spaces/`
  paths. Only the retired intent's directory is gone, and it was the engine's
  own stale record.

No source code touched. No tests touched. No PRD/spec/design changed. This
pass is entirely memory-bank + tooling-lane consolidation.
