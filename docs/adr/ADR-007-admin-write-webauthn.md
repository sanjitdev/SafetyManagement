---
adr: ADR-007
slug: admin-write-webauthn
created: 2026-10-04T00:00:00Z
status: accepted
supersedes: null
superseded_by: null
relates_to:
  - 005-001-webauthn-and-auth
  - 005-002-admin-login
---

# ADR-007: Admin write paths require WebAuthn

## Context

CityFix has a four-role model — `citizen`, `dispatcher`, `crew`,
`admin` — and the admin role is the only one that can change city
configuration: create cities, provision users, edit categories,
adopt the Dhaka template, and so on. Bolt 005-001
(`005-001-webauthn-and-auth`) introduced the hardware-key
requirement for those writes.

The threat is credential theft. An admin session is a
password-derived cookie; a dispatcher or crew session is scoped to a
single `(city, ward, department)` by `requireScope`
(`lib/auth/guards.ts:53-68`), so a stolen staff session can do
damage but only inside one ward. An admin session is **city-wide**:
it bypasses both the ward and the department scope check
(`lib/auth/guards.ts:58`) and can act on every ticket in the city.
Password reuse, a shared admin account, a phished session cookie,
or an XSS on any admin-facing page therefore escalates directly to
"control of the whole city".

The WebAuthn ceremony raises that bar: a write requires a fresh
assertion from a registered authenticator, so a stolen cookie alone
is insufficient. The platform ships the whole mechanism:

- `lib/auth/webauthn.ts` — `issueChallenge`, `verifyAttestation`,
  `verifyAssertion`.
- `app/api/auth/webauthn/login/route.ts` — the assertion
  challenge (the admin's identifier is their email).
- `app/api/auth/webauthn/assertion/route.ts` — the assertion
  verify half.
- `app/api/auth/webauthn/register/route.ts` +
  `app/api/auth/webauthn/register/challenge/route.ts` — the
  registration ceremony.
- `components/WebAuthnCeremony.tsx` — the browser ceremony
  (`startRegistration` / `startAuthentication`).
- `components/AdminSecurityKey.tsx` — the mount point that makes
  the ceremony reachable from a page.
- `lib/auth/guards.ts` — `requireWebAuthn`, the enforcement point.

### The guard's contract

`requireWebAuthn(session)` (`lib/auth/guards.ts:95-127`) throws:

| Condition | Status | Code |
|---|---|---|
| No session | 401 | `not_authenticated` |
| Role is not `admin` | 403 | `forbidden_role` |
| No registered credential | 401 | `webauthn_required` |
| No challenge row | 401 | `webauthn_assertion_expired` |
| Challenge older than `WEBAUTHN_CHALLENGE_TTL_MS` (5 min) | 401 | `webauthn_assertion_expired` |

It has a **dev seam**: when `CITYFIX_DEV_STORE=1` AND
`DEV_SKIP_WEBAUTHN=1`, it short-circuits and returns the session
as-is (`lib/auth/guards.ts:98-102`). The seam is honoured only
when the dev store is active — `tests/unit/require-webauthn.test.ts`
pins that `DEV_SKIP_WEBAUTHN=1` alone does **not** bypass it in
production.

### Reads are exempt

The requirement is a **write** gate. The admin read surfaces —
`GET /api/v1/admin/tickets`, `GET /api/v1/admin/audit`,
`GET /api/v1/admin/tickets/[id]`,
`GET /api/v1/admin/cities/[id]/adoption` — are gated by
`requireRole('admin')` only. Bolt 005-004's ADR analysis recorded
the rationale: "WebAuthn is a write gate. Reads happen on the
admin's primary desktop." A read gate would mean a ceremony per
table navigation, which is ceremony fatigue — the exact pattern
that trains people to click through prompts.

### The gap this ADR closes

`requireWebAuthn` is enforced on every write handler under
`/api/v1/admin/*` — 16 handlers, zero gaps. But the platform has a
**shared** transition route outside that tree:

```
app/api/tickets/[id]/transition/route.ts
```

This route is an admin write path. It accepts:

1. A **pure reassign** — `{ assignedCrewId }` with no `toStatus`.
   The branch is admin-only (`route.ts`, the
   `!parsed.data.toStatus` guard rejects any non-admin role) and
   writes `assignedCrewId` straight onto the ticket row with
   `db.ticket.update(...)`, plus a `reassign.crew` audit row.
2. A **status transition** — the admin branch of
   `ALLOWED_BY_ROLE` may move a ticket through **any** status:
   `['routed', 'in_progress', 'resolved', 'cancelled']`.

The admin UI POSTs both shapes to this route
(`app/admin/tickets/[id]/page.tsx`, the `onTransition` and
`onReassign` handlers), so it was the live path for the exact
operations WebAuthn exists to protect.

The route's own header documented the omission as a deferral:
"admin: any transition (but admin writes still require WebAuthn in
v1.1)". The deferral was never closed, and in the meantime a stolen
admin session cookie was sufficient to reassign crews and move
tickets to `resolved` without a hardware key.

### Constraints

- **The four-role model is fixed** (`project.md` Forbidden). A
  WebAuthn requirement for admin writes adds no role and changes no
  role semantics — it strengthens the write gate on an existing
  role.
- **The dev seam must not widen.** The guard's
  `DEV_SKIP_WEBAUTHN` bypass is dev-store-only. Any new call site
  must call `requireWebAuthn` itself rather than re-implementing a
  check, so the seam stays in one place.
- **Guard ordering matters.** The ceremony must not fire before the
  cheap checks: a dispatcher out of scope must get
  `cross_ward_access_denied`, not a WebAuthn error, and a missing
  ticket must 404 rather than 401 — the caller should not be asked
  to complete a ceremony that cannot change anything.
- **Dispatcher and crew transitions are not admin writes.** They
  are bounded by `requireScope`, and adding a hardware-key
  requirement to a crew member marking work in progress would
  defeat the purpose of the ward-scoped session model. The guard
  must apply to the admin role only.
- **Testing posture.** Test-after, 80% line-coverage floor
  (`team.md`, `org.md`; ADR-008). `npx tsc --noEmit` must be
  clean; `npm run test:unit` must be re-run after editing `lib/`.

## Decision

**Every admin write path requires a fresh WebAuthn assertion.
This includes the shared transition route
`app/api/tickets/[id]/transition/route.ts`, which is gated for the
`admin` role only. Dispatcher and crew writes are not admin writes
and are not gated. Reads are exempt everywhere.**

Concretely, the transition route calls
`await requireWebAuthn(session)` when `session.role === 'admin'`,
placed **after** the ticket lookup, the city check, and the scope
check, and **before** any write.

### Why the guard is role-conditional rather than unconditional

Calling `requireWebAuthn` unconditionally would work for the admin
(who passes) but would return `403 forbidden_role` for a dispatcher
or crew caller — breaking a working path to enforce a rule that does
not apply to it. The route's `ALLOWED_BY_ROLE` table already
distinguishes the admin's broad powers from the staff roles'
narrow ones; the guard mirrors that distinction exactly.

### Why the guard is placed after the ticket load

Ordering the checks cheapest-first-and-most-specific-last gives:

1. `requireRole` → 401 for a non-staff caller. No I/O.
2. Zod parse → 400 for a malformed body.
3. Role-vs-`ALLOWED_BY_ROLE` → 403 `role_cannot_perform_transition`.
4. Ticket load → 404 for a ticket that does not exist.
5. `requireSameCity` → 403 for another city's ticket.
6. `requireScope` → 403 for a dispatcher/crew out of scope.
7. **`requireWebAuthn`** → 401 for an admin without a fresh assertion.

The WebAuthn ceremony is last because it is the only step that
involves the user's physical authenticator. Asking someone to
touch a hardware key for a request that was going to be rejected
anyway is both slow and a training problem — it teaches admins to
dismiss the prompt.

### Scope of the requirement

| Path | Admin write? | WebAuthn? |
|---|---|---|
| `/api/v1/admin/**` (16 write handlers) | yes | yes — already enforced |
| `/api/tickets/[id]/transition` (transition + reassign) | yes | **yes — this ADR** |
| `/api/v1/dispatcher/**` | no (dispatcher only) | no |
| `/api/v1/crew/**` | no (crew only) | no |
| any `GET` | no (read) | no |

## Consequences

### Positive

- A stolen admin session cookie is no longer sufficient to move
  tickets, reassign crews, or resolve reports. The attacker needs
  the physical authenticator.
- The decision is written down in one place. Previously the rule
  was implicit in the *path layout* (`/api/v1/admin/*` — a new
  admin write route outside that tree silently skipped the gate),
  which is exactly the kind of convention that fails quietly.
- The deferral recorded in the route header ("in v1.1") is closed.
- The admin UI's error handling already works: the pages surface
  the API's error code and the admin surfaces
  `webauthn_required` / `webauthn_assertion_expired` as a
  translated message (`app/admin/cities/[id]/users/page.tsx`, the
  `admin.users.webauthn.required` key). No new UI is required for
  the gate itself.

### Negative

- An admin write now requires a physical authenticator interaction.
  That is the point of the decision, but it is a real friction
  cost on every admin mutation.
- The admin ticket page's transition and reassign buttons will
  surface `webauthn_required` until the admin registers a key via
  `AdminSecurityKey`. That is the correct behaviour (the admin can
  see but not write), but it changes the shape of the surface a
  reviewer sees.

### Risks

- **Risk**: the admin ticket page has no ceremony affordance, so an
  admin who has not registered a key sees a bare error code with no
  path to fix it. **Mitigation**: the error is translated and the
  registration mount point (`AdminSecurityKey`) exists. Wiring the
  ceremony into the ticket page's write actions is a UI Bolt, not
  a gate change — the API is the enforcement point either way.
  **CLOSED 2026-11-09** — the ceremony affordance now exists. See
  the amendment below.
- **Risk**: a future admin write route added outside
  `/api/v1/admin/*` skips the gate. **Mitigation**: the rule is now
  stated as a property of the **role**, not of the path. The
  regression test in `tests/unit/transition-webauthn.test.ts` pins
  the transition route specifically; a route-level audit should be
  part of any new admin Bolt's checklist.
- **Risk**: the dev seam (`DEV_SKIP_WEBAUTHN=1`) could be set in a
  production environment by mistake. **Mitigation**: the seam is
  already gated on `CITYFIX_DEV_STORE=1` and
  `tests/unit/require-webauthn.test.ts` pins that the env var
  alone does not bypass the guard.

## Alternatives Considered

### Alternative 1: Gate every write regardless of role — **REJECTED**

- **Description**: call `requireWebAuthn` unconditionally on the
  transition route, so a dispatcher or crew caller is rejected with
  `403 forbidden_role`.
- **Pros**: one rule, no branching; impossible for a future edit to
  accidentally skip the check.
- **Cons**: it breaks a working path to enforce a rule that does
  not apply to it. Crew members marking a repair `in_progress` from
  a phone in the field would be asked for a hardware key they do
  not carry. The ward-scoped session model exists precisely so
  that field staff do not need city-wide authority — re-imposing
  it on the write path would undo it. Rejected on correctness.

### Alternative 2: Gate only the reassign branch — **REJECTED**

- **Description**: require WebAuthn for the admin-only
  `assignedCrewId` write, but leave the status transition ungated.
- **Pros**: narrower; a smaller behavioural change for admins.
- **Cons**: the status transition is the higher-impact write. The
  admin branch of `ALLOWED_BY_ROLE` can move a ticket straight to
  `resolved` or `cancelled` — which suppresses the report and stops
  the citizen's status trail. Gating the reassign and not the
  transition protects the less consequential of the two writes.
  Rejected on threat coverage.

### Alternative 3: Move the admin write paths under `/api/v1/admin/*` — **REJECTED**

- **Description**: relocate the transition route to
  `/api/v1/admin/tickets/[id]/transition` so the existing
  path-convention holds, and delete the shared route.
- **Pros**: makes the path convention load-bearing again.
- **Cons**: a breaking API change for every caller — the admin
  page, the dispatcher page, the crew page, and the Playwright
  route specs — and it does not actually fix anything: the
  convention was never the enforcement mechanism, the guard call
  was. A path convention is a weak control that a single new
  directory can bypass. Rejected as ineffective at real cost.

### Alternative 4: Rely on the admin session cookie alone — **REJECTED (status quo)**

- **Description**: leave the transition route ungated, as it was.
- **Pros**: no friction for admins; no ceremony on the field path.
- **Cons**: this is the gap. A stolen admin cookie is
  city-wide authority — it bypasses both the ward and the
  department scope checks (`lib/auth/guards.ts:58`) — and it was
  sufficient to reassign crews and resolve tickets. That is the
  exact escalation the WebAuthn requirement exists to prevent, and
  every other admin write path already prevents it. Rejected.

## Test plan

`tests/unit/transition-webauthn.test.ts` pins the gate. The route
handler is exercised through its **real dependency graph** (dev
store + guards + transition engine) rather than by mocking the db,
because the contract under test is precisely "the guard is called
on the admin write path" — a mock would only re-assert the mock.

- **Admin, no credential** → 401 `webauthn_required`; the ticket's
  status is **not** changed.
- **Admin, no credential, pure reassign** → 401
  `webauthn_required`; `assignedCrewId` is **not** written.
- **Admin, credential but no challenge** → 401
  `webauthn_assertion_expired`.
- **Admin, credential, expired challenge** → 401
  `webauthn_assertion_expired`.
- **Admin, credential, fresh challenge** → 200; the transition is
  written.
- **Admin, credential, fresh challenge, pure reassign** → 200; the
  assignment is written.
- **Dispatcher, no credential** → 200. Dispatcher writes are not
  admin writes.
- **Crew, no credential** → 200. Same reason.
- **Citizen** → 401; the role gate fires first.
- **Admin, missing ticket** → 404, not 401 — the guard ordering
  must not demand a ceremony for a ticket that does not exist.
- **Dispatcher, out-of-ward ticket** → 403 with a scope error, not
  a WebAuthn error — the scope checks precede the ceremony.
- **Dispatcher, out-of-department ticket** → 403
  `cross_department_access_denied`.

`tests/unit/require-webauthn.test.ts` already pins the guard's own
contract (the four rejection codes, the TTL, and the dev seam's
production posture).

**Verification gates** (per `team.md` Mandated):

- `npx tsc --noEmit` — clean, 0 errors.
- `npm run test:unit` — 117 files / 2035 tests pass.
- `npm run test:unit:coverage` — 94.01% lines / 83.03% branches /
  94.86% functions, all above the 80% floor.
- `npm run lint` — 0 errors.

## Amendment 2026-11-09 — the ceremony affordance (step-up route)

**Status:** the "no ceremony affordance" risk above is **CLOSED**.

### What was missing

This ADR made the *enforcement* correct but left the *path to
satisfaction* missing. `requireWebAuthn` accepts a fresh, unexpired
challenge row as the proof — but until 2026-11-09 the only route that
could mint one for an already-signed-in admin was
`POST /api/auth/webauthn/login`, which is **anonymous and
email-keyed** (it is the login ceremony), and whose sibling
`/api/auth/webauthn/assertion` **mints a new session** on success.

So an admin who was already signed in with a password session and
hit a gated write received a bare `401 webauthn_required` and had
exactly one way to satisfy it: log out and back in through the login
ceremony. For a signed-in admin that is a dead end, not a workflow.

### The amendment

`POST /api/auth/webauthn/step-up` is the session-authenticated
ceremony:

- it is **behind the session cookie**, and the challenge is bound to
  **the session's own `userId`** — never to a client-supplied
  identifier;
- it **does not mint or replace the session**. The admin's existing
  cookie keeps working; what changes is that the challenge ledger
  holds a fresh, unexpired row, so the next gated write passes
  `requireWebAuthn`;
- it rejects a challenge belonging to another user with 403
  `webauthn_challenge_owner_mismatch`. Without that check, a signed-in
  admin could complete a *different* user's challenge and have it
  recorded as their own step-up. The check is the point of the
  route.

The service layer was split to make this possible: `verifyAssertion`
was factored into `verifyAssertionSignature` (all the verification —
challenge lookup, expiry, credential lookup, signature check, counter
bump — and no session minting) and `verifyAssertion` (the signature
check plus session minting plus the `webauthn.assertion` audit row).
The login path is unchanged; the step-up path mints nothing.

### UI

`components/AdminWebAuthnStepUp.tsx` drives the ceremony in the
browser. It deliberately does **not** reuse `WebAuthnCeremony`: that
component drives the *login* ceremony and mints a session, which is
the wrong shape for a step-up.

On the admin ticket detail page (`app/admin/tickets/[id]/page.tsx`),
a gated write no longer surfaces a bare error code. The transition /
reassign handler detects `webauthn_required` or
`webauthn_assertion_expired`, stashes the pending write, and opens
the step-up panel. On a verified assertion the pending write is
retried automatically. If the admin has no registered credential the
panel points at the registration mount point (`AdminSecurityKey`)
instead of asking for a retry.

### Test plan (the amendment)

`tests/unit/webauthn-step-up.test.ts` (12 tests) pins the step-up
contract: anonymous → 401; non-admin → 403; challenge → 200 and bound
to the session's user; no credential → 409; **a challenge belonging to
another user → 403**; unknown challenge → 404; malformed assertion →
400; a forged signature → 401 and no ledger refresh; plus body
validation.

The ownership check is proven non-vacuous: disabling it makes the
cross-user test fail (the forged path 404s rather than 403s).

### What is unchanged

- The guard still accepts a fresh unexpired challenge row. (It also now
  **consumes** it — see the amendment below.)
- The dev seam is unchanged.
- The login ceremony is unchanged and still mints a session.
- The rule remains a property of the **role**, not of a path.

## Amendment 2026-11-09 — the predicted miss, closed

**Status:** the risk recorded above as *"a future admin write route
added outside `/api/v1/admin/*` skips the gate"* is **CLOSED** for
the one route it had already happened to.

### What was missing

`PUT /api/profile` was an admin write route outside
`/api/v1/admin/*`. It had no `requireRole`, no `requireWebAuthn`, a
hand-rolled body check instead of the Zod boundary, and wrote no
audit row. An admin could change their display name — an admin
write — with no ceremony and no trace. It was found by the
[SECURITY_AUDIT.md](../SECURITY_AUDIT.md) audit (finding #5), not by
the test suite, because the suite asserted what the code *did* rather
than what this ADR said it *should*.

### The amendment

The route now applies the canonical admin-write pattern, and applies
it **conditionally on the role**, which is what this ADR actually
requires:

- the body is validated with Zod **before** the ceremony, so a
  malformed request gets a `400` rather than a hardware-key prompt it
  could never satisfy;
- if and only if `session.role === 'admin'`, `await
  requireWebAuthn(session)` runs;
- the write is scoped to `session.userId` — the caller's own row;
- the change lands a `user.update_profile` audit row with before and
  after values.

A citizen, dispatcher or crew member editing **their own** profile is
**not** an admin write and stays ungated. The rule is a property of
the role, so the gate follows the role.

On the client (`app/profile/page.tsx`), a gated write no longer
surfaces a bare error code: a `401` carrying `webauthn_required` or
`webauthn_assertion_expired` stashes the pending save and opens the
`AdminWebAuthnStepUp` panel, retrying the write on a verified
assertion. Any other `401` still redirects to login.

### Test plan (the amendment)

`tests/unit/profile-webauthn-gate.test.ts` (18 tests) pins the
contract: an admin write with no credential → `401
webauthn_required` and **the name is not changed**; no challenge → `401
webauthn_assertion_expired`; an expired challenge → `401`; credential
plus a fresh challenge → `200`. Citizen / dispatcher / crew writes to
their own row → `200`, ungated. The admin's row is untouched when the
gate refuses. The body is rejected before the ceremony. `nameBn: null`
is accepted. An audit row is written on success and **none** on a
gate rejection. `GET /api/profile` is unaffected — reads are exempt.

The gate is proven non-vacuous: neutering it (`if (session.role ===
'admin' && false)`) turns exactly the 5 gate assertions red.

### What is unchanged

- The guard, the dev seam and the challenge TTL are unchanged.
- The step-up ceremony is unchanged.
- The rule remains a property of the **role**, not of a path.

## Amendment 2026-11-09 — the challenge is a one-shot nonce

**Status:** [SECURITY_AUDIT.md finding #6](../SECURITY_AUDIT.md) (High) is **CLOSED**.

### What was missing

This ADR's Decision says *"Every admin write path requires a fresh
WebAuthn assertion."* The guard enforced *fresh* — it checked that the
most-recent challenge row for the session's user existed and had not
expired — but it did not enforce **one-shot**. The row survived for its
full five-minute TTL, so **a single ceremony authorised every admin
write in that window**.

The threat model this ADR assumes — *"a write requires a fresh
assertion from a registered authenticator"* — was therefore not what
the code enforced. A stolen session cookie plus one observed ceremony
was enough to satisfy the gate for many subsequent mutations. The
audit called this the highest-leverage fix to the platform's core
threat model.

### The amendment

`requireWebAuthn` now **consumes** the challenge it accepts:

- The row is **deleted** via `db.webAuthnChallenge.consume({ id,
  userId })` — in production a `deleteMany({ where: { id, userId } })`,
  in the dev store a scoped delete that mirrors it.
- The delete is **scoped to the owning user**. A challenge belonging to
  somebody else cannot be consumed by this session, and the owner can
  still use their own row.
- A **failed consume is a refusal, not a pass**. If the row vanished
  between the read and the delete — a concurrent write won the race —
  the guard throws `401 webauthn_assertion_expired`. Two concurrent
  writes must not both be authorised by one challenge.
- A **rejected** guard call (expired challenge, no credential)
  **consumes nothing**. A failed attempt must not burn a challenge the
  admin could still use.

One ceremony now authorises **exactly one** write, and the next write
needs a fresh assertion.

### Test plan (the amendment)

`tests/unit/webauthn-challenge-consumption.test.ts` (9 tests) pins the
contract: a successful guard call removes the row; a **second** admin
write with the same session is refused `webauthn_assertion_expired`;
a fresh ceremony authorises the next write again; a rejected call on an
expired challenge does **not** consume it; a rejected call with no
credential does **not** consume it; a consume scoped to another user
does not touch the row; the owner can consume their own row; consuming
twice reports `false` the second time; and **two concurrent guard calls
authorise exactly one write**.

Non-vacuity is proven by mutation: removing the delete from the consume
path turns 6 of the 9 tests red.

### Consequence

Because the challenge is now one-shot, every admin write needs its own
ceremony. A page that triggers a gated write must therefore surface the
`AdminWebAuthnStepUp` affordance — otherwise the admin dead-ends on a
bare `401 webauthn_assertion_expired`. The pages that carried the
affordance when this amendment was written were `app/admin/tickets/[id]/
page.tsx` and `app/profile/page.tsx`; the admin city-configuration pages
did not, and were recorded as an open known issue.

**Closed by the following amendment.** All five of those pages now carry
the affordance, through a shared hook.

## Amendment 2026-11-09 — the affordance, on every gated admin page

**Status:** [KNOWN_ISSUES.md #32](../KNOWN_ISSUES.md) (Medium) is **CLOSED**.

### What was missing

Making the challenge one-shot turned a previously-cosmetic gap into a
dead end. Five admin pages perform gated writes — `/admin/cities` and
`/admin/cities/[id]/{setup,taxonomy,wards,users}` — and none of them
rendered the ceremony. The admin clicked "save", the server answered
`401 webauthn_assertion_expired` correctly, and the page offered no way
to satisfy the gate: the write was gone and the ceremony was never
offered.

Nothing caught it. `tsc --noEmit` cannot see it — the missing affordance
is a runtime behaviour, not a type error. The Playwright visual
baselines cannot see it either — the panel renders only after a write is
*refused*, and no baseline drives a refused write.

### The amendment

**A shared hook, `components/useWebAuthnStepUp.ts`.** The retry
bookkeeping is not rendering, so it does not belong in a component — it
belongs in a hook. The hook holds the state and the callbacks; the page
already owns the layout where the panel appears, so the panel component
stays where it was. Every gated page answers two questions:

- *"is this error a gate error?"* — `isWebAuthnGateError(code)`
- *"what should I retry?"* — `retryOnGateError(code, pending, ...args)`

`retryOnGateError` returns `true` for a gate error (the ceremony is now
open and the write is stashed, so the caller must **not** also surface it
as a plain failure) and `false` for anything else (the caller handles it
as usual).

**The retry contract.** On `verified` the stashed write runs exactly
once. On `no_credential` nothing is retried — no amount of retrying
helps if the admin has no registered key, and the page is told to point
at the registration mount point. On `failed` and `cancelled` nothing is
retried either: a retry without a valid assertion would fail the same
way.

**Two details the hook exists to get right**, both of which a
copy-paste into each page would have got wrong at least once:

- *A write that takes an argument retries with the same argument.* A
  DELETE carries the id of the row being removed; the stashed retry
  re-issues it with that id, so the admin's click deletes the row they
  clicked and not some other row.
- *A ref is resolved at retry time.* The retry invokes the **current**
  handler rather than the closure captured when the error was raised.

**The guard ordering is preserved.** ADR-007's ordering rule — *"the
ceremony must not fire before the cheap checks"* — still holds: the
panel is opened by the *response* to a refusal, never before the request
is sent.

### Test plan (the amendment)

`tests/unit/components/useWebAuthnStepUp.test.tsx` (17 tests) pins the
retry contract: a gate error opens the ceremony and reports "handled"; a
non-gate error reports "not handled" and opens nothing; `verified`
retries exactly once; a second `verified` retries nothing (the write is
spent); a write with an argument retries with the same argument; a ref
is resolved at retry time, so the current handler runs; the registered
write is the fallback; `no_credential`, `failed` and `cancelled` all
retry nothing; and the in-progress flag is reported.

`tests/unit/admin/webauthn-step-up-parity.test.ts` (4 tests) makes the
fix durable. It compares the **gated admin routes** — the route files
that call `requireWebAuthn` — against the **admin pages that write to
them**, and fails if any such page lacks the affordance or the retry. The
route file is the source of truth: the test reads it from disk and never
imports a handler, because the contract under test is *which routes are
gated*, which is a property of the source text. A non-vacuity block
proves the detector is not vacuously passing.

**The parity test found a fifth page.** The issue was originally
written against four, because four was what a hand-count over
`/admin/cities/[id]/` produced. The test scans the whole admin page
tree against the whole gated-route tree and found `/admin/cities` — the
page that *creates* the city the other four configure, and the one an
admin hits first.

### What is unchanged

- The dev seam is unchanged — `DEV_SKIP_WEBAUTHN` still short-circuits
  the whole guard, consumption included.
- The challenge TTL is unchanged (5 minutes).
- The step-up ceremony is unchanged.
- The rule remains a property of the **role**, not of a path.

## References

- `lib/auth/guards.ts` — `requireWebAuthn` (`:95-127`); the
  challenge TTL (`:82`); the dev seam (`:98-102`); the admin
  scope bypass (`:58`); `requireScope` (`:53-68`); `ApiError`
  (`:70-75`).
- `app/api/tickets/[id]/transition/route.ts` — the shared route;
  `ALLOWED_BY_ROLE` (the admin branch); the pure-reassign branch;
  the ticket load; the `requireSameCity` / `requireScope` checks;
  the `requireWebAuthn` call.
- `app/api/v1/admin/cities/route.ts` — the canonical write
  pattern: `requireRole` + `await requireWebAuthn(session)` +
  `writeAudit(...)`.
- `app/api/v1/admin/tickets/route.ts` — a read surface, gated by
  `requireRole('admin')` only.
- `app/api/auth/webauthn/login/route.ts` — the assertion challenge.
- `app/api/auth/webauthn/assertion/route.ts` — the assertion
  verify half.
- `app/api/auth/webauthn/register/route.ts` +
  `app/api/auth/webauthn/register/challenge/route.ts` — the
  registration ceremony.
- `app/api/auth/webauthn/revoke/route.ts` — the deliberate
  exception to the write gate (revoking a credential must not
  require proving possession of a possibly-compromised key).
- `components/WebAuthnCeremony.tsx` — the browser ceremony.
- `components/AdminSecurityKey.tsx` — the registration mount point.
- `app/api/auth/webauthn/step-up/route.ts` — the session-authenticated
  step-up ceremony (the 2026-11-09 amendment).
- `components/AdminWebAuthnStepUp.tsx` — the step-up browser
  ceremony.
- `tests/unit/webauthn-step-up.test.ts` — the step-up regression
  suite.
- `app/admin/tickets/[id]/page.tsx` — the admin UI's `onTransition`
  and `onReassign` handlers, which POST to the shared route.
- `app/admin/cities/[id]/users/page.tsx` — the page that surfaces
  `webauthn_required` as a translated message.
- `lib/auth/webauthn.ts` — `issueChallenge`, `verifyAttestation`,
  `verifyAssertion`.
- `tests/unit/require-webauthn.test.ts` — the guard's own contract
  and the dev-seam production-posture pin.
- `tests/unit/transition-webauthn.test.ts` — this ADR's regression
  suite.
- `app/api/profile/route.ts` — the role-conditional admin gate
  (the 2026-11-09 amendment closing the predicted miss).
- `tests/unit/profile-webauthn-gate.test.ts` — the profile gate's
  regression suite (18 tests).
- `app/profile/page.tsx` — the profile page's step-up affordance.
- `tests/unit/webauthn-challenge-consumption.test.ts` — the
  challenge-consumption regression suite (9 tests, the 2026-11-09
  amendment closing finding #6).
- `lib/db-switch.ts` — the `webAuthnChallenge.consume` facade
  (`deleteMany({ where: { id, userId } })` in production).
- `lib/dev-store.ts` — the dev store's scoped delete, mirroring the
  production facade.
- `.specsmd/aidlc/memory-bank/standards/decision-index.md` — the
  ADR register; ADR-007's canonical entry ("Admin write paths
  require WebAuthn").
- `.specsmd/aidlc/memory-bank/bolts/005-001-webauthn-and-auth/ddd-01-domain-model.md`
  — the original ADR-007 analysis.
- `aidlc/spaces/default/memory/org.md` — testing posture, the 80%
  coverage floor, architecture standards.
- `aidlc/spaces/default/memory/team.md` — service-layer
  `Result<T, E>`, Zod at every API boundary, the `tsc --noEmit`
  and `test:unit` mandates.
- `aidlc/spaces/default/memory/project.md` — the Tech Stack (auth
  model) and the Forbidden section (the four-role model is fixed).
- `aidlc/spaces/default/memory/phases/inception.md` — the
  architecture standards this ADR is written against (Context,
  Decision, Consequences, Alternatives Rejected).
