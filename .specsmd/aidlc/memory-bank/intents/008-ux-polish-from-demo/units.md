---
intent: 008-ux-polish-from-demo
phase: inception
status: in-progress
created: 2026-10-14T18:10:00Z
updated: 2026-10-14T18:10:00Z
---

# Units: 008-ux-polish-from-demo

## Decomposition Strategy

The audit catalog has 12 i18n misses, 2 Bangla typos, 2 chrome
deduplication issues, 4 display-name issues, 1 file-upload
issue, and 5 "other" UX issues. The cleanest decomposition is
along the *type* of work, not the surface, because the changes
have different review cadences:

1. **i18n copy fix-up** — pure data (no chrome change, no
   review-on-PR burden beyond a unit test).
2. **Chrome + display names** — visible UI changes that ship
   visual baselines.
3. **File upload** — the only route-shape change in the
   intent; deserves its own bolt for review clarity.

This yields **3 Units** and **3 Bolts**:

| # | Unit | FRs | Bolt |
|---|------|-----|------|
| 001 | i18n key registration + typos + static guard | FR-1, FR-2 | Bolt 008-001 (i18n copy fix-up) |
| 002 | Header chrome deduplication + display-name rendering | FR-3, FR-4, FR-6 (chrome parts) | Bolt 008-002 (visible chrome) |
| 003 | Crew after-photo file upload | FR-5 | Bolt 008-003 (file upload) |

## Requirement-to-Unit Mapping

- **FR-1**: Missing i18n keys registered → `001-i18n-copy-fixup`
- **FR-2**: Bangla typos corrected → `001-i18n-copy-fixup`
- **FR-3**: Single header chrome on ticket-detail pages → `002-visible-chrome`
- **FR-4**: Human-readable names instead of raw ids → `002-visible-chrome`
- **FR-5**: File upload for crew after-photo → `003-crew-after-photo-upload`
- **FR-6**: Other UX gaps → `002-visible-chrome` (chrome parts) + `001-i18n-copy-fixup` (i18n parts)

## Dependency Graph

```
001 (i18n copy fixup)       ── Bolt 008-001 ─┐
                                              │
002 (visible chrome)         ── Bolt 008-002 ─┤
                                              │
003 (crew after-photo upload) ── Bolt 008-003 ┘
```

- **001 ⊥ 002 ⊥ 003**: All three units are independent.
  001 is pure data, 002 is visible chrome, 003 is a route
  change. None of them touch each other's files.
- **No order requirement.** The bolts may land in any order.

## Units

### Unit 001 — i18n Copy Fix-up

- **Type**: Backend-foundation (data-only + static-analysis
  guard)
- **FRs covered**: FR-1, FR-2, plus the i18n half of FR-6
  (`dispatcher.assignCrew.none` key, the status-pill `submitted`
  label, the `photo.before` / `photo.after` labels).
- **Stories**: ~1
- **Complexity**: Small (12 + 5 = 17 new entries in
  `lib/i18n/keys.ts`, 2 corrections, 1 static-analysis script,
  1 unit test).
- **Description**: Register every missing i18n key in
  `lib/i18n/keys.ts` with both `bn` and `en` values, correct
  the two Bangla typos, and add a static-analysis guard
  (a small Node script that greps every `t('...',` call site
  in `app/**` and asserts the key is in `TRANSLATIONS`).
- **Acceptance**:
  - All 17 new keys are present in `TRANSLATIONS` with both
    `bn` and `en` values.
  - The two typo'd `bn` values are corrected.
  - The static-analysis script (`scripts/check-i18n-keys.mjs`)
    exits non-zero if any `t('...',` call site references a
    key not in the registry. Wired to `npm run lint` (or
    a dedicated `npm run check:i18n`).
  - A unit test (`tests/unit/i18n/keys.test.ts`) asserts
    every key in `TRANSLATIONS` has both `bn` and `en` values
    (no `undefined`).
  - A re-run of the slow-motion demo shows zero raw `key.path`
    strings in any captured frame.
- **File**: `units/001-i18n-copy-fixup/unit-brief.md`

### Unit 002 — Visible Chrome

- **Type**: Frontend feature (simple-construction bolt) —
  visible UI changes with visual baselines
- **FRs covered**: FR-3, FR-4, plus the chrome half of FR-6
  (status-pill empty state, `Not assigned` placeholder,
  category-specific icon, clearer button label, photo-card
  label).
- **Stories**: ~3
- **Complexity**: Medium (2 page refactors, 1 new identity
  helper, 3 new visual baselines, 1 unit test for the
  helper).
- **Description**: Render exactly one `HeaderBar` on the
  crew and dispatcher ticket-detail pages, and replace raw
  internal ids with display names on those same pages
  (H1 = category name + small id badge; metadata = display
  name; reporter + dispatcher / crew actor in the trail =
  display name). Status-pill always labelled; empty
  `assignedCrewId` shows `Not assigned`; category icon
  rendered from the same icon set as the citizen picker;
  the "Change ward / department" button renamed for clarity;
  photo cards on the crew detail page labelled "Before" /
  "After" with a localized alt.
- **Acceptance**:
  - All FR-3, FR-4, FR-6 (chrome) acceptance criteria met.
  - One back link, one language toggle, one theme toggle on
    every ticket-detail page.
  - H1 + metadata on every ticket-detail page is the display
    name; raw ids are only in `data-testid` or a tooltip.
  - 3 new visual baselines captured (crew detail, dispatcher
    detail, citizen detail header area).
  - A new unit test for the `displayNameFor(role, userId)`
    helper.
- **File**: `units/002-visible-chrome/unit-brief.md`

### Unit 003 — Crew After-photo File Upload

- **Type**: Backend + frontend (simple-construction bolt) —
  route-shape change + UI
- **FRs covered**: FR-5
- **Stories**: ~1
- **Complexity**: Small-to-Medium (one route-shape change
  on `POST /api/v1/crew/tickets/[id]/photos` to accept
  multipart, one UI change on
  `app/crew/tickets/[id]/page.tsx` to swap the URL input
  for a file input with a power-user URL override, 1 unit
  test, 1 Playwright E2E).
- **Description**: Allow crew members to upload the
  after-photo as a real file (the existing citizen photo
  upload already accepts multipart; the same shape is added
  to the crew route). The URL input is preserved as a
  collapsible "Power user: paste a URL" disclosure so the
  existing dev-store demo path keeps working.
- **Acceptance**:
  - All FR-5 acceptance criteria met.
  - The crew route accepts `multipart/form-data` with a
    `photo` file part AND a `photoUrl` field for the
    override path.
  - The existing URL-only demo path (dev store) keeps
    working; the slow-motion demo can drive either path.
  - The slow-motion demo re-run drives the file upload via
    `setInputFiles(...)`.
  - 1 new unit test (multipart path), 1 new Playwright E2E
    (file path on the crew surface).
- **File**: `units/003-crew-after-photo-upload/unit-brief.md`

## Stories Per Unit (Summary)

| Unit | Stories |
|------|---------|
| 001 | S-001.1: Register 17 missing keys, correct 2 typos, add static-analysis guard + unit test |
| 002 | S-002.1: Header chrome deduplication (crew + dispatcher)<br>S-002.2: Display-name rendering on ticket surfaces (H1, metadata, trail actor)<br>S-002.3: Chrome polish (status pill, empty assignedCrew, category icon, button label, photo card label) |
| 003 | S-003.1: Crew after-photo accepts multipart; URL input stays as collapsible override |

**Total: 5 stories** across 3 units → **3 bolts** (one per
unit; the units are independent enough that one bolt per unit
is the right grain).

## Bolt Plan (Summary)

| Bolt | Type | Stories | Unit IDs | Complexity |
|------|------|---------|----------|------------|
| 008-001 | simple-construction-bolt | 1 | 001 | Small |
| 008-002 | simple-construction-bolt | 3 | 002 | Medium |
| 008-003 | simple-construction-bolt | 1 | 003 | Small-to-Medium |

Sequence: any order. 001 is the easiest review (pure data +
one new test); 003 has the broadest review surface (route
change). The team may land 001 first to clear the i18n noise
and then tackle 002 and 003 in either order.

## Open Items

- The static-analysis script location
  (`scripts/check-i18n-keys.mjs` vs `tools/`) is finalized in
  Unit 001's unit-brief.
- The `displayNameFor(role, userId)` helper location
  (`lib/identity/display-name.ts` vs an existing module) is
  finalized in Unit 002's unit-brief.
- The exact MIME / size limits on the multipart upload match
  the existing citizen photo route; the bolt verifies the
  values in its technical-design stage.
