---
intent: 008-ux-polish-from-demo
phase: inception
status: complete
created: 2026-10-14T18:00:00Z
updated: 2026-10-14T18:00:00Z
---

# System Context: 008-ux-polish-from-demo

## Boundary

In-scope surfaces:

- `lib/i18n/keys.ts` — the typed translation registry.
- `app/crew/tickets/[id]/page.tsx` — crew ticket-detail page.
- `app/dispatcher/tickets/[id]/page.tsx` — dispatcher
  ticket-detail page.
- `app/citizen/reports/[id]/page.tsx` — citizen detail
  (header chrome only; the body content is unchanged).
- `app/report/(create)/category/page.tsx`,
  `app/report/(create)/photo/page.tsx`,
  `app/report/(create)/note/page.tsx`,
  `app/report/(create)/summary/page.tsx` — citizen report
  flow (i18n only; no chrome change).
- `app/api/v1/crew/tickets/[id]/photos/route.ts` — the
  existing after-photo upload route (FR-5).
- `lib/identity/` — a new `displayNameFor(role, userId)`
  helper (FR-4). Mirrors the existing `lib/identity/` if
  it exists, else creates it.
- `tests-mockups/baselines/01-mockups.spec.ts/` — new
  visual baselines for the chrome change (FR-3, FR-4, FR-6).

Out-of-scope surfaces:

- The push-notification scaffold (`lib/platform/push.ts`).
- The admin ticket-detail page (chrome unchanged; admin
  has a different header).
- The dispatcher / crew queue pages (no chrome change).
- The map page (no chrome change).

## External Surfaces (Read-Only)

- `lib/serializers/ticket.ts` — already exposes
  `beforePhotoUrls` and `afterPhotoUrls` after
  Bolt 007-001; no change.
- `lib/dev-store.ts` — backend-agnostic; both Prisma and
  in-memory implementations are unchanged.
- `tests/04-e2e-human-tester.spec.ts`,
  `tests/22-slow-motion-e2e-demo.spec.ts` — the
  regression suite. A re-run of the slow-motion demo
  after each bolt is the canonical sign-off.

## Trust Boundary

The serializer (`lib/serializers/ticket.ts`) remains the
load-bearing trust boundary for citizen surfaces. The
chrome change on the dispatcher and crew surfaces does
not relax any citizen-side invariant — the citizen
detail page is rendered from the same `SerializedTicket`
it was before.

## Source-of-Truth Audit

The audit catalog is in
`.specsmd/aidlc/memory-bank/intents/008-ux-polish-from-demo/requirements.md`
section "Source-of-Truth Audit Catalog". Every
requirement traces to at least one frame in
`tests-mockups/audit/22-slow-motion-e2e-demo.spec.ts/`.

## NFR Constraints

- **Performance** — no regression on the existing
  citizen / dispatcher / crew page render times.
- **Security** — admin names stay hidden in the trail;
  raw ids stay in `data-testid` only.
- **Reliability** — `t(...)` regression guard catches
  future misses.
- **Compliance** — bilingual parity on every new key;
  visual baselines are gating for every chrome change.
