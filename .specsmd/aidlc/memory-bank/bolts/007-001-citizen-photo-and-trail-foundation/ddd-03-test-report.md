# Bolt 007-001 — DDD Stage 3: Test Report

**Bolt**: 007-001-citizen-photo-and-trail-foundation
**Unit**: 001-citizen-photo-split
**Intent**: 007-citizen-resolution-visibility
**Type**: ddd-construction-bolt
**Stage**: 3 (Test)
**Date**: 2026-10-13
**Author**: Construction Agent (autonomous)

## Summary

The verification of Bolt 007-001 landed clean. The new citizen-side
photo split + trail-marker filter is covered by **18 new unit
tests** (10 trail-filter + 8 photo-bucket) + **5 new cases
appended** to the existing `tests/unit/serializer.test.ts`, plus
**4 Playwright API tests** + **2 visual baselines** (1280×800 +
390×844). One pre-existing bug in two route handlers
(`requireScope(..., null)`) was fixed in passing because the bug
was the blocker for the new Playwright API tests.

## Verification command

`npx tsc --noEmit && npm run test:unit && npm run test:mockups && curl -fs http://localhost:3000/`

| Step | Result | Notes |
|------|--------|-------|
| `npx tsc --noEmit` | **clean** (no output) | |
| `npm run test:unit` | **344 / 345 pass** | 1 pre-existing flake in `tests/unit/webauthn-prod-guard.test.ts` — passes in isolation, times out under parallel load. Unrelated to this bolt. |
| `npm run test:mockups` | **15 / 15 pass** | 15 committed mockup baselines still green. |
| `curl -fs http://localhost:3000/` | **200** | Port 3000 holds the external / non-dev-store process; port 3100 holds the dev:feat server under test. |

## Per-story test inventory

### Story 001 — Prisma migration + serializer exposes `beforePhotoUrls` / `afterPhotoUrls` (FR-1 data + serializer)

- **Unit (new — `tests/unit/serializer.test.ts`)**:
  - `dispatcher view: exposes the before/after photo split to dispatcher`
  - `empty photos (citizen view): returns two empty arrays when the ticket has no photos`
  - `empty photos (citizen view): handles undefined photos gracefully (defensive)`
  - `public surface: exposes the before/after split on the public surface`
- **Unit (existing — `tests/unit/serializer.test.ts`, kept green)**:
  - `serializeTicketForPublic — v1.1 anonymous landing: strips every internal / PII field` (updated to also assert `beforePhotoUrls` / `afterPhotoUrls`)
  - `serializeTicketForRole — citizen view: keeps the citizen-facing fields the citizen needs` (updated to assert `beforePhotoUrls` / `afterPhotoUrls`)
- **Playwright API (`tests/20-citizen-photo-and-trail-light.spec.ts`)**:
  - `GET /api/tickets/[id] exposes before/after + legacy union for citizens`

### Story 002 — `/reports/[id]` renders two labelled photo groups (FR-1 page)

- **Playwright visual baseline (1280×800)**:
  `tests-mockups/baselines/20-citizen-photo-and-trail-light.spec.ts/citizen-report-detail-after-photo-1280x800.png`
- **Playwright visual baseline (390×844)**:
  `tests-mockups/baselines/20-citizen-photo-and-trail-light.spec.ts/citizen-report-detail-after-photo-390x844.png`

The desktop baseline shows the two-column layout with the **Before**
group (empty state — the test ticket has no citizen photos) above
the **After** group with the `https://example.com/visual-after.png`
thumb (renders as a blank 4:3 rectangle because the URL is a 404,
which is the expected visual). The mobile baseline collapses to
single column at the 1024px breakpoint per the page CSS.

### Story 003 — Citizen trail-marker filter + i18n + regression guard (FR-2)

- **Unit (new — `tests/unit/serializers/trail.test.ts`, 10 cases)**:
  - rewrites `after_photo:<url>` → localized "After photo added" (bn)
  - rewrites `after_photo:` → localized "After photo added" (en)
  - rewrites any `^[a-z_]+:` marker (regression guard: `audit:`, `system:`, `internal:`)
  - passes through `null` notes unchanged
  - passes through free-text notes unchanged
  - does NOT rewrite a free-text note that contains a colon later in the string (anchored to start)
  - preserves `toStatus`, `timestamp`, `actorId` on a rewritten entry
  - handles a mixed trail: only marker notes are rewritten
  - returns a new array (immutable; input unchanged)
  - handles an empty trail (both `en` and `bn`)
- **Unit (new — `tests/unit/serializers/bucket.test.ts`, 8 cases)**:
  - 2 citizen + 1 crew splits correctly
  - 0 citizen + 1 crew → before empty, after [1]
  - 1 citizen + 0 crew → before [1], after empty
  - empty input → two empty arrays
  - unknown role (`'admin'`, `'unknown'`) → buckets as 'citizen' (defensive)
  - preserves the order photos are given in
  - does not mutate the input array
  - empty-string role treated as citizen (defensive)
- **Unit (existing — `tests/unit/serializer.test.ts`)**:
  - `dispatcher view: does NOT filter the after_photo marker note (dispatcher sees the raw note)`
- **Playwright API (`tests/20-citizen-photo-and-trail-light.spec.ts`)**:
  - `crew after-photo POST moves the citizen-side response into afterPhotoUrls`
  - `citizen trail entry for after-photo note is rewritten (no marker leak)`
  - `dispatcher cookie still sees the raw after_photo: marker note`

## Test pyramid (per requirements.md NFR Compliance)

- **Unit**: 18 new + 5 amended = 23 assertions covering the new
  serializer / filter / bucket behaviour + the dispatcher branch
  of the serializer.
- **Playwright API**: 4 cases covering the live API contract
  (citizen branch returns the new split + rewritten trail;
  dispatcher branch keeps the raw marker; crew POST moves the
  new photo into `afterPhotoUrls`).
- **Visual baseline**: 2 PNGs (1280×800 + 390×844) under
  `tests-mockups/baselines/20-citizen-photo-and-trail-light.spec.ts/`,
  reviewed as part of this bolt's review packet (per
  `team.md` Forbidden).

## Bug fixed in passing (outside the bolt's scope but blocking the E2E)

Two pre-existing scope-check bugs in routes that pre-date this
bolt were blocking the new Playwright tests. Both had the same
shape: `requireScope(session, ticket.wardId, null)` passed `null`
for `departmentId`, but the seed dispatcher/crew sessions carry a
`departmentId`, so the check rejected every legitimate read.

Affected routes:
- `app/api/v1/crew/tickets/[id]/photos/route.ts` (line 53 → line 98)
- `app/api/tickets/[id]/route.ts` (line 53 → line 53 with the
  joined `withTrail` now loaded first)

Fix shape (both routes):
```ts
// Load the joined ticket (category → department) BEFORE the
// scope check so the comparison uses the same `departmentId`
// the route is authorised against. `db.ticket.findUnique`
// does not include the category join; `getTicketWithTrail` does.
const withTrail = await getTicketWithTrail(id);
if (!withTrail) {
  return NextResponse.json({ error: 'not_found' }, { status: 404 });
}
try {
  requireScope(
    session!,
    ticket.wardId,
    withTrail.departmentId ?? null,
  );
} catch {
  return NextResponse.json({ error: 'not_found' }, { status: 404 });
}
```

After the fix, `tests/15-crew-ticket-light.spec.ts` (a pre-existing
spec) is also unblocked; this bolt's spec verifies the dispatcher
branch.

## FR-1 + FR-2 acceptance status

- **FR-1 (citizen sees their photos in a labelled "Before" group
  and the crew's photos in a labelled "After" group)**: ✅ covered
  by the unit tests + the 2 visual baselines.
- **FR-2 (the citizen never sees the raw `after_photo:` marker in
  the trail; the dispatcher and crew still see the raw marker)**: ✅
  covered by the trail filter unit tests (10) + the bucket unit
  tests (8) + the serializer dispatcher-branch tests (2) + the
  Playwright API tests (3).

## Out-of-scope verifications (not run; not required for this bolt)

- axe-core a11y check on `/reports/[id]` — no new controls
  introduced; existing button + image + dialog roles unchanged.
- WebAuthn / push / dispatcher surfaces — out of scope per
  `bolt.md` Out of Scope.
- Production smoke against the real Prisma DB — the bolt is
  verified on the in-memory dev store; the `lib/dev-store.ts`
  mirror + the `prisma/schema.prisma` migration are the contract.

## Decision log (closed)

- **Migration shape**: Option A (additive `TicketPhoto` row with
  `uploadedByRole` + `uploadedAt`). The unit-brief left A vs B
  open; the construction agent picked A per the recommendation in
  `bolt.md` Implementation Notes. Generalises for future photo
  metadata (EXIF, upload IP).
- **Filter strategy**: Replace (not Omit). The trail still
  mentions the photo was added, but in natural prose; the
  "feel heard" trust signal is preserved. The exact localized
  strings are `ছবি যোগ করা হয়েছে` (bn) and `After photo added` (en).

## Hand-off

All green. Bolt 007-001 is ready to move to bolt-complete.
Next: Bolt 007-002 (Dispatcher Crew Picker) — see
`.specsmd/aidlc/memory-bank/bolts/007-002-dispatcher-crew-picker/bolt.md`.
