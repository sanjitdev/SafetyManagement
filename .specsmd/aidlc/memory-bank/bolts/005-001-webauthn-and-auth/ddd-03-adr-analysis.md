---
standard: ddd-03-adr-analysis
bolt: 005-001-webauthn-and-auth
unit: 005-admin-city-setup/001-webauthn-and-auth
phase: construction
status: complete
created: 2026-10-12T05:45:00Z
updated: 2026-10-12T05:45:00Z
---

# Bolt 005-001 — ADR Analysis (skip-with-rationale)

Per the `ddd-construction-bolt`
template's Stage 3 description:
"ADR Analysis (optional) — only
when an ADR-worthy decision is
identified." This artifact is the
Stage 3 outcome for Bolt 005-001.
The conclusion is **no new ADRs
are required for this bolt**.
The rationale follows.

## Decision: Stage 3 skipped (no new ADRs)

The decisions Bolt 005-001 makes
are either already in
`standards/decision-index.md`
or are tactical
implementation details that
do not rise to project-wide
policy. The Stage 4
implementation follows the
existing ADR-007 verbatim.

## Inventory of decisions the bolt makes

The four route handlers +
`requireWebAuthn` guard +
`WebAuthnCeremony` component
collectively make these
decisions:

| # | Decision | Already in a registered ADR? | New ADR-worthy? |
|---|----------|-------------------------------|-----------------|
| 1 | WebAuthn is mandatory for admin writes | **ADR-007** (affirmed 2026-10-04; the four `/api/auth/webauthn/*` handlers were explicitly deferred to WO-005). | No. ADR-007 is the contract. |
| 2 | The four-route-handler shape: `register / login / assertion / revoke` | **ADR-007** explicitly names these four handlers. | No. ADR-007 is the contract. |
| 3 | The 5-minute `WebAuthnChallenge` TTL | Implicit in ADR-007 ("schema + challenge table ships in WO-000; ... route handlers deferred to WO-005"); the `tech-stack.md` standards document also names 5 minutes as the OTP TTL. | No. The TTL is platform-consistent with the existing OTP TTL. |
| 4 | `@simplewebauthn/{server,browser}` v10 (already in `package.json`) | **tech-stack.md** (pinned by `000-tech-audit.md` 2026-10-04). | No. Library pinning is a standards-layer decision, not a per-Bolt ADR. |
| 5 | The four specific audit events (`webauthn.register`, `webauthn.login_challenge`, `webauthn.assertion`, `webauthn.revoke`) | Fits within the existing PLAT-REQ-007 audit log model; the action vocabulary is captured in `lib/platform/audit.ts`. | No. The vocabulary is a per-entity extension of the existing audit pattern. |
| 6 | Dev seam (`DEV_SKIP_WEBAUTHN=1` honoured only when `CITYFIX_DEV_STORE=1`) | Consistent with `ADR-004` (in-memory dev store + backend-agnostic facade) + `lib/dev-session.ts`'s `isDevStore()` pattern. | No. The seam is the established dev-bypass shape. |
| 7 | `requireWebAuthn` only gates `/api/v1/admin/*` writes; not `/api/auth/*` reads, not `/api/v1/admin/audit` (the read surface) | Implicit in ADR-007's "admin write paths" wording; the audit dashboard is a read surface and explicitly outside the gate (Unit 004's paperwork notes this). | No. The route scope follows directly from ADR-007. |
| 8 | `WebAuthnCredential.counter` (the `signCount` replay-protection field) as part of the credential value object | Required by the WebAuthn spec itself; the `@simplewebauthn/server` library enforces it. | No. Standard WebAuthn contract. |
| 9 | Per-credential revoke; no-last-credential rule (the revoke route returns 409 if the revoke would leave zero credentials) | A v1 conservative policy. The alternative (silent delete + require re-register) is worse UX. | No. The rule is an implementation detail of the `revoke` route. |

Every row in the table
either pins an existing ADR,
follows a registered standard,
or is a tactical
implementation choice with no
project-wide blast radius.

## Why no new ADR

`ADR-007` is the canonical
record for this bolt's
decision space. The ADR's
"Consequences" section
explicitly anticipates the
`requireWebAuthn` guard + the
four route handlers. If the
bolt deviates from ADR-007,
the deviation would force a
revision of the ADR — not
the authoring of a new one.
The bolt does NOT deviate.

The `devMintSession` /
`DEV_SKIP_WEBAUTHN` seam
follows the same shape as the
existing dev-bypass surfaces
(`lib/dev-session.ts`'s
`isDevStore()` guard). It is
not new architecture; it is
the established pattern.

## What Stage 4 must NOT deviate from

To preserve ADR-007's
contract, the Implementation
stage must:

1. **Not change the public
   route surface** — the
   four
   `/api/auth/webauthn/{register,login,assertion,revoke}`
   routes are the contract.
2. **Not change the guard's
   role** — `requireWebAuthn`
   gates `/api/v1/admin/*`
   writes, not `/api/auth/*`
   reads.
3. **Not change the error
   codes** — the four
   `webauthn_*` codes + the
   standard `not_authenticated` /
   `forbidden_role` /
   `invalid_input` codes are
   the contract the v1
   client integrates against.
4. **Not change the dev
   seam's reach** — the
   seam is honoured only when
   the dev store is active.

If a Stage 4 implementation
choice collides with these
constraints, the bolt pauses
and asks the human — the
guardrail is registered
policy, not a per-Bolt
preference.

## Deferred decisions (not raised as ADRs)

Two near-ADR decisions were
considered and explicitly
deferred to a v1.1 hardening
Bolt (not this Bolt):

1. **HMAC-signing the
   `WebAuthnChallenge.challenge`
   string** — a v1.1
   hardening pass to
   protect against a forged
   DB read. v1 stores the
   challenge in plaintext
   (the same row the browser
   received); the
   `@simplewebauthn/server`
   verifier + the
   `requireWebAuthn`
   short-circuit are v1's
   protection. Documented
   in the Tech Design's
   "Risk + design notes"
   section.
2. **Soft-delete on the
   consumed
   `WebAuthnChallenge` row**
   — to detect a replay even
   with a `counter` roll
   (an authenticator
   counter reset). v1's
   `counter` monotonicity
   check is sufficient at
   v1 pilot scale.
   Documented in the Tech
   Design's "Risk + design
   notes" section.

Both are filed for the v1.1
hardening pass; neither rises
to v1 architecture policy.

## Cross-references

- **Decision index**:
  `standards/decision-index.md`
  (especially ADR-007).
- **Domain Model**:
  `ddd-01-domain-model.md` in
  this folder.
- **Technical Design**:
  `ddd-02-technical-design.md`
  in this folder.
- **Tech audit** (source for
  ADR-007):
  `design-artifacts/E-Development/000-tech-audit.md`.
- **Stage 4 (Implement)**:
  the source code the
  Implementation stage
  produces, validated
  against this analysis.
