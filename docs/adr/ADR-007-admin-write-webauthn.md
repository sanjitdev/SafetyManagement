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
- `npm run test:unit` — 102 files / 1851 tests pass.
- `npm run test:unit:coverage` — 92.59% lines / 82.79% branches /
  93.76% functions, all above the 80% floor.
- `npm run lint` — 0 errors.

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
