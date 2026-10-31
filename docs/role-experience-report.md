# Role Experience Report — CityFix

> **Question this document answers:** *"using Playwright and real users, check if everyone
> can do their job perfectly — and show each user's experience flow from start to finish."*
>
> **Method:** a real Chromium browser drives the real app against the real
> PostgreSQL database, using the **seeded personas and their password login**
> (not the dev-only `/api/dev/login` shortcut). No route is mocked, no API is
> stubbed, no session is forged. Each role gets its own browser context, so the
> four sessions are genuinely separate.
>
> **Suite:** `tests/28-role-walkthrough.spec.ts` (1 test, 53 observations)
> **Evidence:** `tests-mockups/audit/28-role-walkthrough.spec.ts/`
> (45 screenshots + `walkthrough-report.json`)
> **Last run:** 2026-10-31 11:30 UTC — **53 / 53 pass**, ticket
> `cmvwbic7r00nac926viyf8cnh`, zero non-pass observations
>
> **Verdict in one line:** the app **does** let every role do their job end to end —
> but only after seven defects were fixed during this audit. The flow is sound; the
> defects were in the seams between roles.

---

## Table of contents

1. [What was audited](#1-what-was-audited)
2. [The personas (real users)](#2-the-personas-real-users)
3. [The end-to-end chain](#3-the-end-to-end-chain)
4. [Citizen — Rahim](#4-citizen--rahim)
5. [Dispatcher — Habib](#5-dispatcher--habib)
6. [Crew — Rashid](#6-crew--rashid)
7. [Admin — Anwar](#7-admin--anwar)
8. [Cross-role authorization matrix](#8-cross-role-authorization-matrix)
9. [Defects found and fixed](#9-defects-found-and-fixed)
10. [Remaining gaps — the honest list](#10-remaining-gaps--the-honest-list)
11. [Final verdict per role](#11-final-verdict-per-role)
12. [How to reproduce](#12-how-to-reproduce)

---

## 1. What was audited

The suite drives the **four-role chain in one continuous test**, threading a
single real ticket id through all four roles. That ordering matters: it proves
not only that each role's screens work in isolation, but that the *handover*
between roles works — the ticket the citizen filed is the one the dispatcher
triages, the one the crew resolves, and the one the admin audits.

| Leg | Steps | Subject | Outcome |
|---|---|---|---|
| Citizen | C1 – C14 | File a report, follow it, rate it | **14 / 14 pass** |
| Dispatcher | D1 – D9 | Triage, dedup, annotate, assign, route, monitor | **11 / 11 pass** |
| Crew | K1 – K6 | Work the assignment, prove it, resolve it | **6 / 6 pass** |
| Admin | A1 – A7 | Oversee, configure, audit, and actually **write** | **17 / 17 pass** |
| Cross-role | 5 guards | Every role against every other role's API | **5 / 5 pass** |
| **Total** | **53** | | **53 / 53 pass** |

**Console health.** No uncaught JavaScript errors in any leg. The only console
entries were the deliberate authorization probes: two `403 Forbidden` resource
loads on the citizen leg (the cross-role guard checks) and zero on the
dispatcher, crew and admin legs. No `pageerror` events anywhere.

**Regression suite (all green alongside the walkthrough):**

```
npx tsc --noEmit        → clean
npm run test:unit       → 76 files, 1108 tests passed
npm run test:mockups    → 15 visual baselines passed
npm run check:i18n      → ok, 740 keys
```

The three WebAuthn defects (E, F, G below) each carry a dedicated regression
test in `tests/unit/webauthn-regressions.test.ts` (15 checks), because all
three were invisible in the in-memory dev store and only surfaced against
real Postgres — without a test, the next person to touch the WebAuthn code
could reintroduce any of them and the suite would stay green.

---

## 2. The personas (real users)

Seeded by `prisma/seed.ts` against the real database — 1 city
(Dhaka North City Corporation), 50 wards, 4 departments, 5 categories, 3 crews,
6 users.

| Persona | Role | Phone | Scope | Home after login |
|---|---|---|---|---|
| **Rahim** | citizen | `+8801711000000` | Ward 14, city-wide | `/home` |
| **Habib** | dispatcher | `+8801711000001` | Ward 14 + Streetlight Maintenance | `/dispatcher` |
| **Rashid** | crew | `+8801711000002` | Ward 14 + Streetlight Maintenance, *Mirpur Streetlight Team* | `/crew` |
| **Anwar** | admin | `+8801711000003` | City-wide, no ward scope | `/admin` |
| Karim | crew | `+8801711000004` | Ward 14 + Roads & Drainage | *(used as the negative case — see defect C)* |
| Jamal | crew | `+8801711000005` | Ward 20 + Streetlight Maintenance | *(used as the negative case — cross-ward)* |

All personas share the seeded password. The crew leg deliberately signs in as
**whichever crew member the dispatcher actually assigned the ticket to** — read
back from the API — rather than assuming Rashid. Signing in as the wrong crew
member would have proven nothing, because `Ticket.assignedCrewId` is a FK to
`User` and the crew list filters on `assignedCrewId === session.userId`.

---

## 3. The end-to-end chain

```
  ANONYMOUS
      │  C1  landing page renders with the report CTA
      ▼
  RAHIM (citizen) ── signs in with phone + password ──► /home
      │  C2–C4   home feed, report CTA
      │  C5      location  ──► map pin; draft created in sessionStorage
      │  C6–C7   category   ──► "Broken streetlight" → Streetlight Maintenance
      │  C8–C9   photo      ──► mandatory photo attached
      │  C10     note       ──► "off for three nights, please fix"
      │  C11–C12 summary    ──► dedup choice + explicit confirmation tick
      │  C13     submitted  ──► ticket id minted
      ▼
  HABIB (dispatcher) ── signs in ──► /dispatcher
      │  D1–D2   queue (ward 14 + streetlight scope)
      │  D3a     dedup queue → DISMISS the flag (citizen's "not the same lamp")
      │  D3      ticket now in the triage queue
      │  D4      ticket detail (trail + photos)
      │  D5      internal note — invisible to the citizen
      │  D6      assign crew from the ward roster
      │  D7      submitted → routed
      │  D8      map · dedup · monitor · performance
      │  D9      out-of-scope ticket → 404
      ▼
  RASHID (crew) ── signs in ──► /crew
      │  K1–K2   today's assignments (the routed ticket is there)
      │  K3      assignment detail (before-photo + controls)
      │  K4      routed → in_progress
      │  K5      after-photo uploaded (proof of work)
      │  K6      in_progress → resolved + resolution note
      ▼
  ANWAR (admin) ── signs in ──► /admin
      │  A1–A2   console + surface cards
      │  A3      cross-city report list (sees the resolved ticket)
      │  A4      audit trail (every state change)
      │  A5      city list
      │  A6      setup · wards · taxonomy · users · adoption
      │  A7      ★ real WebAuthn registration ceremony → real admin WRITE (201)
      ▼
  BACK TO RAHIM
      │  C13     the citizen sees "সমাধান" (resolved) — the chain is visible
      │  C14     the citizen rates the resolution (201) — the trust signal closes
```

---

## 4. Citizen — Rahim

**Job:** *"I saw a broken streetlight. I want it fixed, and I want to know what
happened."*

| # | Step | Evidence | Result |
|---|---|---|---|
| C1 | Anonymous landing renders with the report CTA | `c1-citizen-anonymous-landing.png` | pass |
| C2 | Phone + password sign-in lands on `/home` | `c2-citizen-home-after-login.png` | pass |
| C3 | Home feed shows own reports + city activity | `c3-citizen-home.png` | pass |
| C4 | "Report an issue" CTA is one click from home | — | pass |
| C5 | Step 1 — map / location pin | `c5-citizen-report-location.png` | pass |
| C6 | Step 2 — 5 categories offered | `c6-citizen-report-category.png` | pass |
| C7 | Picks "Broken streetlight" (routes to a department that actually exists) | — | pass |
| C8 | Category → photo navigation | — | pass |
| C9 | Step 3 — photo attaches, Continue enables | `c9-citizen-report-photo.png` | pass |
| C10 | Step 4 — description accepted, submit enables | `c10-citizen-report-note.png` | pass |
| C11 | Summary — dedup offers "link to existing" **vs** "submit as new" | `c11-citizen-report-summary.png` | pass |
| C12 | Submit disabled until the confirmation checkbox is ticked | — | pass |
| C13 | Report created, confirmation page renders | `c13-citizen-report-submitted.png` | pass |
| C14 | Own report detail renders (status, trail, photos) | `c14-citizen-report-detail.png` | pass |
| C13′ | **After the whole chain** — the citizen sees *resolved* | `c13-citizen-sees-resolved.png` | pass |
| C14′ | Citizen rates the resolution → **201** | — | pass |

### What the flow gets right

- **The order is location → category → photo → note → summary**, and the
  location step is the one that *creates* the `sessionStorage` draft. Every
  later step reads that draft and silently no-ops without it. A citizen who
  deep-linked to `/report/category` would get a dead Continue button — the
  suite therefore enters the flow the way a real citizen does, by clicking the
  CTA on `/home`.
- **The mandatory photo is enforced.** Continue stays disabled until a photo
  is attached. The policy is "minimum 1 photo, cap 3" and the UI honours the
  minimum.
- **Dedup is a citizen choice, not a silent merge.** The summary screen offers
  "link to the existing report" vs "submit as new". The citizen chose *submit
  as new*; the app respected that and raised a pending flag for human review
  instead of merging their report away.
- **The citizen confirms before submitting.** The submit button is disabled
  until an explicit confirmation checkbox is ticked.
- **The trust loop closes.** The citizen can see the resolved status and rate
  it. This is the "feel heard" signal the product brief is built around.

### Verdict — Citizen

> ✅ **Can do their job perfectly.** Discover → sign in → file with a photo and
> a description → make an informed dedup choice → confirm → watch it get
> resolved → rate the result. Nothing in the flow is a dead end, and the
> mandatory-photo and explicit-confirmation rules are both enforced correctly.

**One defect was found and fixed in this leg** — see [defect A](#a-the-citizens-ward-was-dropped-at-password-login).

---

## 5. Dispatcher — Habib

**Job:** *"Triage what came in, cut through the noise, get it to the right crew,
and see how the ward is doing."*

| # | Step | Evidence | Result |
|---|---|---|---|
| D1 | Sign-in lands on `/dispatcher` | `d1-dispatcher-queue.png` | pass |
| D2 | Queue renders; scope = ward 14 + streetlight maintenance | `d2-dispatcher-queue-loaded.png` | pass |
| D3a | Dedup queue surfaces the citizen's flagged report; **dismiss** clears it and the ticket re-enters the queue | `d3a-dispatcher-dedup-resolved.png` | pass |
| D3 | The citizen's ticket is in Habib's queue | — | pass |
| D4 | Ticket detail renders with trail and photos | `d4-dispatcher-ticket-detail.png` | pass |
| D5 | Internal note written — the citizen never sees it | — | pass |
| D6 | Crew assigned from the ward roster ("Rashid") | `d6-dispatcher-crew-assigned.png` | pass |
| D7 | `submitted → routed` | `d7-dispatcher-routed.png` | pass |
| D8 | Map view renders | `d8-dispatcher-dispatcher-map.png` | pass |
| D8 | Duplicate-review queue renders | `d8-dispatcher-dispatcher-dedup.png` | pass |
| D8 | Live monitor renders | `d8-dispatcher-dispatcher-monitor.png` | pass |
| D8 | Performance dashboard renders | `d8-dispatcher-dispatcher-performance.png` | pass |
| D9 | Out-of-scope ticket answers **404** (not disclosed, not 403) | — | pass |

### What the flow gets right

- **The dedup queue is a real human decision.** The two buttons mean opposite
  things and both are correct:
  - *Confirm* — "yes, these are the same real-world issue" → the flagged ticket
    is **closed as a duplicate** and leaves the queue permanently.
  - *Dismiss* — "no, genuinely different, keep triaging it" → the flag clears
    and the ticket **re-enters** the triage queue.
  The citizen had chosen "submit as new", so the dispatcher *dismissed* — the
  city honoured the citizen's judgement rather than the algorithm's.
- **Scope is enforced on read.** An out-of-scope ticket id answers **404**, not
  403. A dispatcher cannot even confirm the existence of a ticket outside their
  ward — the more defensible answer of the two.
- **Internal notes are internal.** The dispatcher's note is a private
  annotation; the citizen-facing surface uses the platform serializer and does
  not leak internal fields.
- **The four operational surfaces all render** — map, duplicate review, live
  monitor and performance dashboard — under a real session, not a mock.

### Verdict — Dispatcher

> ✅ **Can do their job perfectly.** Triage → resolve duplicates → read the
> ticket → annotate privately → assign the right crew → route → monitor.
> Scope boundaries are enforced server-side, not just hidden in the UI.

**Two defects were found and fixed in this leg** — see [defect B](#b-the-dedup-flag-mixed-scope-from-two-different-tickets)
and [defect C](#c-crew-assignment-allowed-a-department-mismatch).

---

## 6. Crew — Rashid

**Job:** *"Someone gave me this job. Let me look at it, do it, and show that I
did it."*

| # | Step | Evidence | Result |
|---|---|---|---|
| K1 | Sign-in lands on `/crew` | `k1-crew-assignments.png` | pass |
| K2 | The routed assignment is on the crew list (1 total) | — | pass |
| K3 | Assignment detail renders with before-photo and action controls | `k3-crew-ticket-detail.png` | pass |
| K4 | `routed → in_progress` | `k4-crew-in-progress.png` | pass |
| K5 | After-photo uploaded from the field | `k5-crew-after-photo.png` | pass |
| K6 | `in_progress → resolved` + resolution note saved | `k6-crew-resolved.png` | pass |

### What the flow gets right

- **Only my own work.** The crew list filters on
  `assignedCrewId === session.userId` **and** ward **and** department. Three
  independent filters, all server-side.
- **Proof of work is a first-class field.** The after-photo is not optional
  decoration — it is how the crew demonstrates the job was done, and it is
  stored alongside the before-photo the citizen took.
- **The status machine is honest.** `routed → in_progress → resolved`, with the
  resolution note required. No illegal jumps, no skipped states.

### Verdict — Crew

> ✅ **Can do their job perfectly** — *after* the department guard was added.
> Before the fix, a streetlight ticket assigned to Karim (roads) silently
> vanished from Karim's own list, because the list filtered on department but
> the assignment did not check it. That single missing check broke the entire
> crew leg (K2–K6 all failed). See [defect C](#c-crew-assignment-allowed-a-department-mismatch).

---

## 7. Admin — Anwar

**Job:** *"See everything across the city, understand what's happening, configure
the city properly — and be able to actually change things."*

| # | Step | Evidence | Result |
|---|---|---|---|
| A1 | Sign-in lands on `/admin` | `a1-admin-console.png` | pass |
| A2 | Console lists the admin surfaces (3 cards) | `a2-admin-console-cards.png` | pass |
| A3 | Cross-city report list includes the citizen's resolved ticket | `a3-admin-reports.png` | pass |
| A4 | Audit trail answers 200 with 50 entries | `a4-admin-audit.png` | pass |
| A5 | City list loads (Dhaka North City Corporation) | `a5-admin-cities.png` | pass |
| A6 | City setup renders | `a6-admin-setup.png` | pass |
| A6 | Ward management renders | `a6-admin-wards.png` | pass |
| A6 | Taxonomy (departments + categories) renders | `a6-admin-taxonomy.png` | pass |
| A6 | User provisioning renders | `a6-admin-users.png` | pass |
| A6 | Adoption dashboard renders | `a6-admin-adoption.png` | pass |
| A7a | A WebAuthn registration UI exists and is reachable on `/admin` | `a7-admin-webauthn-registration.png` | pass |
| A7b | **Real ceremony** — CDP virtual authenticator, real `navigator.credentials.create(...)`, credential stored server-side | `a7-admin-webauthn-registered.png` | pass |
| A7c | **Real admin WRITE** — `POST /api/v1/admin/cities` → **201** | — | pass |

### The load-bearing finding: A7

ADR-007 says **every** admin write under `/api/v1/admin/*` must be backed by a
registered WebAuthn credential. That makes key registration a *precondition for
the admin's job*, not a nice-to-have.

Before this audit, the registration flow was **completely unreachable**:

- `components/WebAuthnCeremony.tsx` existed but was imported by nothing.
- `issueChallenge(userId, 'registration')` existed but no route called it.
- There was no registration-challenge endpoint at all.

The result: every admin write answered `401 webauthn_required`. **The admin
could read everything and change nothing.**

Three further defects were hiding behind that dead end, and only surfaced
because the audit drives a *real* ceremony rather than mocking the API:

1. `User.webAuthnChallenge` is a `String?` column, but the code wrote a plain
   object → Prisma rejected the update (`Unknown argument 'challenge'`) and
   every flow answered `500 unhandled`. The in-memory dev store accepted the
   object, which is why this was invisible in `dev:feat` mode.
2. The ledger row and the browser-signed nonce were **different values** —
   `@simplewebauthn/server` base64url-encodes a `Uint8Array` but passes a
   `string` through unchanged, so a base64url string was double-encoded.
3. The RP ID / expected origin were pinned to the production host
   (`cityfix.vercel.app`) while the app ran on `localhost:3000`.

All three are fixed. The ceremony now completes end to end and a real admin
write returns **201**.

> **Note on the dev seam.** `requireWebAuthn` short-circuits only when
> `CITYFIX_DEV_STORE=1` **and** `DEV_SKIP_WEBAUTHN=1` are both set. Production
> never reads `DEV_SKIP_WEBAUTHN`. The walkthrough runs against **real
> Postgres with no seam**, so the ceremony it exercises is the production one.

### Verdict — Admin

> ✅ **Can do their job** — read, audit, configure, and now genuinely write,
> with the WebAuthn gate satisfied by a real ceremony.
>
> ⚠️ **Not "perfectly" yet.** Two configuration surfaces are still soft: the
> user-provisioning form offers a `supervisor` role that is not a real role in
> the database, and the ward polygons are empty placeholders. See
> [section 10](#10-remaining-gaps--the-honest-list).

---

## 8. Cross-role authorization matrix

Every role was pointed at another role's API with its own valid session.

| Actor | Target | Endpoint | Expected | Actual | Result |
|---|---|---|---|---|---|
| Citizen | admin cities | `GET /api/v1/admin/cities` | 403 | **403** | pass |
| Citizen | dispatcher queue | `GET /api/v1/dispatcher/queue` | 403 | **403** | pass |
| Dispatcher | admin cities | `GET /api/v1/admin/cities` | 403 | **403** | pass |
| Crew | admin audit | `GET /api/v1/admin/audit` | 403 | **403** | pass |
| Crew | dispatcher queue | `GET /api/v1/dispatcher/queue` | 403 | **403** | pass |

A further scope check ran inside the dispatcher leg: an out-of-scope ticket id
answered **404**, meaning a dispatcher cannot even confirm that a ticket
outside their ward exists.

**Reading:** the role boundary is enforced in the **route handlers**, not by
hiding links in the UI. No role can reach another role's data by guessing a URL.

---

## 9. Defects found and fixed

These were not hypothetical. Each one broke a real step of a real user's job,
and each was fixed during the audit.

Defects **E**, **F** and **G** are all invisible in the in-memory dev store and
only appear against real Postgres — which is exactly why the audit ran the
real ceremony instead of calling the API. All three now carry a dedicated
regression test in `tests/unit/webauthn-regressions.test.ts`.

### A. The citizen's ward was dropped at password login

`POST /api/v1/auth/login` nulled the citizen's `wardId`. `/api/report/bootstrap`
then fell back to Ward 1, so **every password-logged-in citizen's report was
filed in the wrong ward** — invisible to the dispatcher and crew who were
actually scoped to that ward's work. The citizen's report would sit in a queue
nobody responsible could see.

**Fix:** bind the citizen's ward at login. → `app/api/v1/auth/login/route.ts`

### B. The dedup flag mixed scope from two different tickets

The `DedupFlag` took its **ward** from the NEW ticket but its **department**
from the ORIGINAL ticket's category. `requireScope` then matched nobody, so
the flag could be actioned by **no one** — it was a work item nobody could
work.

**Fix:** take both ward and department from the flagged ticket.

### C. Crew assignment allowed a department mismatch

`lib/dispatcher/assign-crew.ts` validated the crew member's **ward** but not
their **department**, and the picker offered every crew in the ward. Assigning
a streetlight ticket to Karim (roads) produced a ticket that **silently
vanished** from Karim's list, because the list filters on department but the
assignment never checked it. This single missing check broke the entire crew
leg.

**Fix:** a server-side `cross_department_access_denied` guard plus a
department filter in the picker. → `lib/dispatcher/assign-crew.ts`,
`components/dispatcher/*`

### D. The admin WebAuthn registration flow was entirely unreachable

`WebAuthnCeremony.tsx` was dead code, no registration-challenge route existed,
and nothing mounted the ceremony. Every admin write answered
`401 webauthn_required`: the admin could read everything and change nothing.

**Fix:** new `POST /api/auth/webauthn/register/challenge` route, new
`components/AdminSecurityKey.tsx` mount point on `/admin`, and mode-specific
button copy so a registration button no longer reads "sign in".

### E. `webAuthnChallenge` was written as an object into a `String?` column

Prisma rejected every write (`Unknown argument 'challenge'` → `500 unhandled`).
The dev store accepted it, so the bug was invisible outside real Postgres.

**Fix:** serialise to a JSON string on write and parse it back on read, with a
tolerant parser for all three shapes. → `lib/db-switch.ts`

### F. The ledger nonce and the browser-signed nonce were different values

`@simplewebauthn/server` base64url-encodes a `Uint8Array` but passes a `string`
through unchanged — so a base64url string was encoded twice, and the ceremony
failed with `Unexpected registration response challenge`.

**Fix:** decode the challenge to raw bytes before handing it to the library, so
the ledger row and the signed nonce are the same value.

### G. The RP ID and expected origin did not match the running server

The challenge returned `rp.id: "cityfix.vercel.app"` (from `.env.local`)
while the app served `localhost:3000`. Two errors followed: an RP-ID mismatch,
and then `expected "http://localhost"` because the origin helper stripped the
port.

**Fix:** request-scoped `rpIdForHost` / `rpOriginForHost` — the **RP ID strips
the port, the origin keeps it**, because the origin is a full scheme+host+port
tuple. → `lib/auth/webauthn.ts`

---

## 10. Remaining gaps — the honest list

The walkthrough is green, but green is not the same as finished. These are real
and still open.

| # | Gap | Impact | Severity |
|---|---|---|---|
| **1** | **Admin ticket reassign needs verification against the real WebAuthn gate.** The `/admin/tickets/[id]` page POSTs `{ assignedCrewId }` to `/api/tickets/[id]/transition`, which is *not* under `/api/v1/admin/*` and therefore does **not** call `requireWebAuthn`. An admin can reassign crew without a fresh assertion — a deliberate-looking bypass of ADR-007's "every admin write" wording. | ADR-007 is enforced on 16 `/api/v1/admin/*` routes but not on the shared transition route the admin surface actually calls. | **High** |
| **2** | **`supervisor` is offered but is not a role.** The admin user-provisioning form and the city users API accept `supervisor`; the Prisma `Role` enum has only `citizen \| dispatcher \| crew \| admin`. The code maps it to the `admin` Prisma role as a read-only posture, and the tab/CSV round-trip works — but the name is not in the four-role model the project fixes as a DECIDED constraint. | A supervisor row is indistinguishable from an admin row in the database. | Medium |
| **3** | **All 50 seeded wards have empty `polygonGeoJson`** (`coordinates: [[]]`). | The ward-boundary map overlay draws nothing; ward geofencing is effectively a no-op on the map. | Medium |
| **4** | **`SlaPolicy` is seeded (5 rows) but never consulted.** No route or service reads it. | The SLA/breach reporting on the performance dashboard is, at best, decorative. | Medium |
| **5** | **The OTP provider is stubbed** (`OTP_PROVIDER="stub"`, with a `dev_code` surfaced in the response). | Citizen phone-OTP registration/login is not a production path yet. Real SMS provider selection is deferred to WO-004. | Medium |
| **6** | **`/api/dev/login?role=admin` still redirects to `/home`**, not `/admin` (`ROLE_HOME.admin = '/admin'`). | Dev-only inconsistency; harmless in production but misleading while debugging. | Low |
| **7** | **No coordinate → ward resolver.** The UX spec's "detected ward (auto)" is not implemented; the citizen always picks on the map. | The citizen must self-identify their ward. | Low |
| **8** | **The walkthrough's C13/C14 assertions are text-pattern based** (`সমাধান` / `Resolved`) because the app is Bangla-first with English secondary. | Brittle to copy changes, but correct against the current locale. | Low |

### Where the gap list is *not*

- The **otp stub**, the **empty polygons** and the **unused `SlaPolicy`** are
  all **seed-data / deferred-scope** items, not broken code. They are honest
  entries in the v1 roadmap, not defects.
- The **admin reassign** item (#1) is the only one that contradicts a
  *DECIDED* project constraint (ADR-007: WebAuthn mandatory for admin writes).
  It should be resolved before the admin surface is called done.

---

## 11. Final verdict per role

| Role | Can they do their job? | Perfect? | Blocking issues | Non-blocking gaps |
|---|---|---|---|---|
| **Citizen — Rahim** | ✅ Yes | ✅ Yes | none | ward auto-detect (#7) |
| **Dispatcher — Habib** | ✅ Yes | ✅ Yes | none | none specific |
| **Crew — Rashid** | ✅ Yes | ✅ Yes | none | none specific |
| **Admin — Anwar** | ✅ Yes | ⚠️ Almost | admin reassign bypasses the WebAuthn gate (#1) | `supervisor` role (#2), ward polygons (#3), `SlaPolicy` (#4), OTP stub (#5) |

### The one-paragraph answer

> **Yes — CityFix lets all four roles do their jobs, start to finish, in a real
> browser against a real database.** A citizen files a report with a photo and
> a description, makes an informed duplicate choice, and watches it get
> resolved and rates the result. A dispatcher triages it, resolves the
> duplicate flag, annotates it privately, assigns the right crew and routes
> it. A crew member picks it up, marks it in progress, uploads proof of work
> and resolves it with a note. An admin sees every report across the city,
> reads the audit trail, configures wards and taxonomy, enrols a real
> WebAuthn passkey and — with the gate satisfied — actually writes.
>
> **But it did not work when the audit started.** Seven real defects were
> hiding in the seams between roles: a citizen's ward was dropped at login, a
> dedup flag could be owned by nobody, a crew assignment could create a ticket
> no crew could see, the admin's WebAuthn enrolment was unreachable dead
> code, and the WebAuthn persistence was broken in three separate ways
> against real Postgres. Every one of them was invisible from the UI and only
> surfaced by driving the app as an actual user with an actual browser.
>
> The remaining work is one genuine contradiction of a DECIDED constraint (the
> admin reassign path bypasses the WebAuthn gate) plus a list of deferred-scope
> items (the OTP provider, the ward polygons, the unused `SlaPolicy`, the
> `supervisor` role name). None of them stop a user from doing their job today.

---

## 12. How to reproduce

```bash
# 1. Real Postgres, real seed
npm run db:push
npm run db:seed

# 2. The app, production-mode build, no dev-store seam
npm run build
npm run start          # http://localhost:3000

# 3. The walkthrough
npx playwright test tests/28-role-walkthrough.spec.ts --headed

# 4. Read the machine-readable evidence
cat tests-mockups/audit/28-role-walkthrough.spec.ts/walkthrough-report.json
```

The suite writes 45 screenshots and `walkthrough-report.json` into
`tests-mockups/audit/28-role-walkthrough.spec.ts/`.

### Options

| Variable | Default | Effect |
|---|---|---|
| `BASE_URL` | `http://localhost:3000` | Point at a deployed environment |
| `WALKTHROUGH_DEV_STORE=1` | unset | Use the in-memory store (also seeds tickets, so the queues are non-empty without filing a report first) |

### Why the WebAuthn leg works in a headless browser

A real WebAuthn ceremony needs a real authenticator, which headless Chromium
does not have. The suite installs a **CDP virtual authenticator** over the
DevTools protocol:

```ts
await cdp.send('WebAuthn.enable');
await cdp.send('WebAuthn.addVirtualAuthenticator', {
  options: {
    protocol: 'ctap2',
    transport: 'internal',
    hasResidentKey: true,
    hasUserVerification: true,
    isUserVerified: true,
    automaticPresenceSimulation: true,
  },
});
```

The ceremony itself is **not** mocked — the button click drives the real
`navigator.credentials.create(...)`, the browser signs a real challenge, and
the server verifies the real attestation and stores the real credential.

---

*Generated by `tests/28-role-walkthrough.spec.ts` on 2026-10-31 against
CityFix at commit-time state. Screenshots in
`tests-mockups/audit/28-role-walkthrough.spec.ts/`.*
