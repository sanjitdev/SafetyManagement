---
intent: 008-ux-polish-from-demo
phase: inception
status: in-progress
created: 2026-10-14T18:00:00Z
updated: 2026-10-14T18:00:00Z
---

# Requirements: 008-ux-polish-from-demo

## Intent Overview

Close every UX gap surfaced by the slow-motion citizen →
dispatcher → crew → citizen demo (`tests/22-slow-motion-e2e-demo.spec.ts`).
The end-to-end mechanics all work; the surface is leaking
internal IDs, untranslated i18n keys, duplicate chrome, and a
handful of Bangla typos that make the experience feel unfinished.

The audit catalog is the source of truth. Each requirement is
backed by at least one frame of the audit and one or more
`lib/i18n/keys.ts` / page / route file changes.

**Type**: brown-field (defect-fix / enhancement on the existing
v1 surface). Scope is tight: no new roles, no new endpoints, no
real-time push, no new pages. The objective is to make the
existing flow honest for the citizen, the dispatcher, the crew,
and the demo viewer without expanding the surface area.

## Business Goals

| Goal | Success Metric | Priority |
|------|----------------|----------|
| No raw i18n key is ever visible to a user | A non-technical user inspecting any page never sees a string matching `^[a-z_]+\.[a-z_]+$` | Must |
| No raw internal id is ever shown to a human on a ticket surface | A non-technical user inspecting any ticket never sees `tkt_*`, `ward_*`, `cat_*`, `user_*`, `city_*` | Must |
| No Bangla typo remains on a user-facing surface | A native Bangla reader inspecting any rendered page finds zero typos in chrome (typos below the body content of citizen notes are out of scope) | Must |
| Every page has a single, clean header — no duplicate nav rows | A reviewer inspecting any chrome finds exactly one brand row, one locale toggle, one theme toggle, one breadcrumb / back link | Must |
| The crew can upload an after-photo as a real file, not a URL | A field crew member on a 3G phone can attach a photo with one tap (no URL typing) | Must |
| The existing v1 surfaces (push, "Resolved!" celebration, real-time polling) remain untouched | No new endpoints added for push/polling; no celebratory animation introduced | Should |

## Source-of-Truth Audit Catalog

The audit was conducted by reviewing every screenshot in
`tests-mockups/audit/22-slow-motion-e2e-demo.spec.ts/` and the
page/route code that produced each frame. Every requirement
below is grounded in at least one frame.

### A. Missing translation keys (raw `key.path` rendered)

The `t(...)` helper in `lib/i18n/keys.ts:1583` returns the key
itself when the entry is missing (`if (!entry) return key`).
The following keys are referenced in pages but never registered:

| Key | Surface | Audit frame |
|-----|---------|-------------|
| `report.category.search_placeholder` | category search input | 03-citizen-report-category.png |
| `report.photo.empty_hint` | photo page subtitle | 05-citizen-report-photo-empty.png |
| `report.photo.counter` | photo counter pill | 05, 06 |
| `report.photo.add_primary` | "Add primary photo" button | 05, 06 |
| `report.note.label` | note page heading | 07-citizen-report-note.png |
| `report.note.helper` | note helper | 07 |
| `report.note.counter` | note counter | 07 |
| `confirmation.copy_id` | copy-id button | 08-citizen-report-submitted.png |
| `confirmation.next_title` | "What happens next" card | 08 |
| `confirmation.next_step1` | next-step 1 | 08 |
| `confirmation.next_step2` | next-step 2 | 08 |
| `confirmation.next_step3` | next-step 3 | 08 |

### B. Bangla typos (registered keys with the wrong Bangla)

| Key | Current bn | Correct bn | Surface | Audit frame |
|-----|-----------|-----------|---------|-------------|
| `crew.detail.navigate` | `লেভেলগেট করুন` | `নেভিগেট করুন` | crew ticket detail (navigate-to-pin button) | 19-crew-resolved.png |
| `crew.detail.trail` | `অনুগতির ইতিহাস` | `অগ্রগতির ইতিহাস` | crew/dispatcher trail heading | 14-crew-ticket-routed.png, 19 |

The English value of `crew.detail.navigate` is also wrong
(`Levelgate` instead of `Navigate to pin`). Both are fixed.

### C. Duplicate header chrome

| Surface | Issue | Audit frame |
|---------|-------|-------------|
| `app/crew/tickets/[id]/page.tsx` | Two `←` back links (one in `HeaderBar`, one inline above the ticket card) | 14, 19 |
| `app/crew/tickets/[id]/page.tsx` | Two EN / dark-mode toggle rows (one in `HeaderBar`, one in the ticket page's local sub-header) | 14, 19 |
| `app/dispatcher/tickets/[id]/page.tsx` | Same duplicate back link + duplicate EN / dark-mode toggle | 09-dispatcher-ticket-detail.png, 10-13 |

The fix: ticket-detail pages (crew + dispatcher) render the
existing `HeaderBar` (with its single back link, single
language toggle, single theme toggle) and stop rendering the
local sub-header row.

### D. Raw internal ids on ticket surfaces

| Surface | Field | Audit frame |
|---------|-------|-------------|
| dispatcher detail | H1 = `tkt_dc31c87c` | 09-13 |
| dispatcher detail | metadata: `city_dhaka_north`, `ward_14`, `cat_streetlight` | 09-13 |
| dispatcher detail | reporter: `user_citizen_rahim` | 09-13 |
| dispatcher detail | actor in trail: `user_citizen_rahim`, `user_dispatcher_habib` | 09-13 |
| crew detail | `ward_14 · cat_streetlight` (H1) | 14-19 |
| crew detail | `tkt_dc31c87c` (subtitle) | 14-19 |
| crew detail | `user_citizen_rahim` | 14-19 |
| citizen detail | `tkt_dc31c87c` (id pill) | 20-citizen-detail-resolved.png |

The fix:

1. **Ticket H1** — render the human-readable title
   (e.g., `রাস্তার আলো নেই` / "Broken streetlight" — the
   category's display name) plus a small id badge
   (e.g., `#tkt_dc31c87c`) below the title. Both are visible
   in the citizen detail page already.
2. **Metadata fields** — render the display name
   (`ঢাকা উত্তর` / "Dhaka North") and a small id in a
   tooltip. The serializer already returns both the id and
   the display name in the public branch; the page was
   rendering the id directly.
3. **Reporter** — render the citizen's display name
   (already on the model), not the user id.
4. **Actor in trail** — render the display name where the
   role is `citizen` / `dispatcher` / `crew`. The `admin`
   role stays as the role label (admin names are
   intentionally hidden in v1).

### E. Other UX issues

| Issue | Surface | Audit frame | Fix |
|-------|---------|-------------|-----|
| `<input type="url">` for after-photo only — no file upload | crew detail | 16, 17 | Add a real file upload. URL input stays as a power-user override (collapsible "Or paste a URL"). |
| Empty status pill (black bar no text) | dispatcher detail | 09, 10 | Status pill has no label when status is `submitted` (no badge text in the i18n table). Add the missing label. |
| `—` em-dash for empty `assignedCrewId` | dispatcher detail | 09, 10 | Replace with localized `Not assigned` (bn: `কোনো কর্মী নিযুক্ত নয়`) — key `dispatcher.assignCrew.none` |
| Generic `?` icon for category | crew + dispatcher | 14, 19, 09-13 | Render a category-specific icon (the same icons used in the citizen category picker). |
| Vague `ওয়ার্ড / বিভাগ পরিবর্তন` (Change ward / department) button | dispatcher detail | 09-13 | Rename to `ওয়ার্ড ও বিভাগ পরিবর্তন` (ward and department change) — clearer scope. |
| `photo 2` alt text when no after-photo | crew detail | 19 | Add a "Before / After" label on the photo cards; alt text uses the localized label, not a numeric index. |

## Functional Requirements

### FR-1: Missing translation keys registered in `lib/i18n/keys.ts`

- **Description**: All twelve keys listed in section A above
  MUST be added to `TRANSLATIONS` with both `bn` and `en`
  values. The `t(...)` helper already returns the key on a
  miss; the fix is to register the entries, not to change
  the helper.
- **Acceptance**:
  - All twelve keys are present in `TRANSLATIONS` with both
    `bn` and `en` values.
  - `npm run test:unit` continues to pass; a new unit test
    under `tests/unit/i18n/keys.test.ts` asserts every key
    referenced by any page under `app/**/page.tsx` is
    registered (regression guard for future
    `t('some.key', ...)` calls that miss the registry).
  - A re-run of the slow-motion demo
    (`tests/22-slow-motion-e2e-demo.spec.ts`) shows zero
    raw `key.path` strings in any captured frame.
- **Priority**: Must
- **Related Stories**: TBD (defined in units stage)

### FR-2: Bangla typos corrected in `lib/i18n/keys.ts`

- **Description**: The two keys listed in section B above
  MUST have their `bn` values corrected. The `en` value of
  `crew.detail.navigate` is also corrected.
- **Acceptance**:
  - `crew.detail.navigate.bn === 'নেভিগেট করুন'`
  - `crew.detail.navigate.en === 'Navigate to pin'`
  - `crew.detail.trail.bn === 'অগ্রগতির ইতিহাস'`
  - A re-run of the slow-motion demo shows the corrected
    strings in the captured frames.
- **Priority**: Must
- **Related Stories**: TBD

### FR-3: Single header chrome on ticket-detail pages

- **Description**: `app/crew/tickets/[id]/page.tsx` and
  `app/dispatcher/tickets/[id]/page.tsx` MUST render exactly
  one `HeaderBar` (with one back link, one language toggle,
  one theme toggle) and no local sub-header row.
- **Acceptance**:
  - The crew ticket-detail page has exactly one back link,
    one language toggle, and one theme toggle in the visible
    chrome.
  - The dispatcher ticket-detail page has the same.
  - The existing `tests-mockups/baselines/01-mockups.spec.ts/`
    baselines for these pages are updated to reflect the
    new chrome (per `team.md` Mandated — baselines reviewed
    in PR).
  - A re-run of the slow-motion demo shows one back link
    per page.
- **Priority**: Must
- **Related Stories**: TBD

### FR-4: Human-readable names instead of raw ids on ticket surfaces

- **Description**: The dispatcher and crew ticket-detail
  pages MUST render display names (city, ward, category,
  reporter, dispatcher / crew actor) instead of the raw
  internal ids. The raw ids remain visible as small
  `data-testid`-only badges (or via a tooltip) for debugging
  but are not the primary text.
- **Acceptance**:
  - H1 on both pages is the category display name, not
    `tkt_*` (the `tkt_*` value moves to a small id badge
    below the title).
  - Metadata fields show the display name (`ঢাকা উত্তর`)
    and `cat_streetlight` is no longer visible in the
    chrome.
  - The trail `actor` field shows the display name
    (`Rahim`, `Habib`, `Rashid`) when the actor role is
    `citizen` / `dispatcher` / `crew`. `admin` role still
    shows the role label.
  - The citizen detail page's `tkt_*` pill stays
    (intentional — citizens need the id to reference in
    support chats).
  - A new unit test asserts the
    `serializeTicketForRole` returns the display name where
    required, OR the page maps the id to the name via a
    small helper (the unit is decided in the bolt's
    technical-design stage).
- **Priority**: Must
- **Related Stories**: TBD

### FR-5: File upload for crew after-photo (URL input stays as override)

- **Description**: The crew ticket-detail page's after-photo
  control MUST accept a real file upload. The existing URL
  input stays available as a "Power user: paste a URL"
  collapsible section.
- **Acceptance**:
  - The crew member can pick a file from the device file
    picker; the file is uploaded via the existing
    `POST /api/v1/crew/tickets/[id]/photos` endpoint.
  - The URL input is collapsed by default under a
    "Power user: paste a URL" disclosure.
  - The unit test for the upload route covers a real
    multipart form-data body.
  - The slow-motion demo re-run drives the file upload via
    `setInputFiles(...)` (no URL typing) and the after-photo
    appears on the crew and citizen surfaces.
- **Priority**: Must
- **Related Stories**: TBD

### FR-6: Other UX gaps closed

- **Description**: The five issues listed in section E above
  (status-pill empty state, `Not assigned` placeholder,
  category-specific icon, clearer button label, photo-card
  label) are fixed.
- **Acceptance**:
  - The dispatcher's status pill is always labelled
    (English + Bangla), including the `submitted` state.
  - The empty `assignedCrewId` placeholder reads
    `Not assigned` (bn: `কোনো কর্মী নিযুক্ত নয়`).
  - The category icon in the ticket-detail H1 area uses the
    same icon set as the citizen category picker.
  - The "Change ward / department" button is renamed to
    `ওয়ার্ড ও বিভাগ পরিবর্তন` (and the matching English).
  - Photo cards on the crew detail page have a
    "Before" / "After" label and a localized alt text
    (not `photo 2`).
- **Priority**: Must
- **Related Stories**: TBD

## Non-Functional Requirements

### Performance
| Requirement | Metric | Target |
|-------------|--------|--------|
| No regression on the existing 1.12 My Reports render time | Time to first paint of the citizen detail page | < 200ms p95 unchanged |
| No regression on the dispatcher detail render | Time to first paint | < 300ms p95 unchanged |

### Security
| Requirement | Standard | Notes |
|-------------|----------|-------|
| After-photo file upload is bounds-checked | Same MIME + size limits as the citizen photo upload | The existing `crew-photo-input` route handler must accept multipart; the fix does not loosen the existing validation. |
| Admin names are still hidden in the trail | The actor-name fallback for `admin` role stays as the role label | Matches the v1 privacy posture. |
| Raw ids remain accessible to staff via `data-testid` and tooltips | The id is rendered in a way that does not break a11y (e.g., `<span aria-label>`) | The page passes axe-core with no serious / critical issues. |

### Reliability
| Requirement | Standard | Notes |
|-------------|----------|-------|
| `t(...)` regression guard | A unit test asserts every key referenced by any page is registered | Catches future `t('some.new.key', ...)` calls that miss the registry. |
| Visual baseline updates | New baselines are captured for the chrome change on both ticket-detail pages | Per `team.md` Mandated — baselines reviewed in PR. |

### Compliance
| Requirement | Standard | Notes |
|-------------|----------|-------|
| Bilingual parity | Every new key ships in English and Bangla at the same time | Per `team.md` Mandated. |
| Test pyramid (locked at Checkpoint 1, Q5) | FR-1: unit only (no E2E / no visual change) · FR-2: unit only · FR-3: visual baseline only · FR-4: unit + visual · FR-5: unit + E2E · FR-6: visual baseline | All visible-chrome changes ship a visual baseline. |

## Constraints

- **No new endpoints** except as required by FR-5 (the existing
  upload route already exists; this bolt only widens its input
  shape).
- **No new roles / no new pages / no new transports.**
- **Visual baselines are gating** (per `team.md` Forbidden) —
  every chrome change ships a new baseline in
  `tests-mockups/baselines/01-mockups.spec.ts/`.
- **The serializer is the load-bearing trust boundary** for
  citizen surfaces (per `team.md` Mandated). The chrome change
  on dispatcher / crew surfaces does not relax any citizen-side
  invariant.
- **The slow-motion demo (`tests/22-slow-motion-e2e-demo.spec.ts`)
  is the regression suite.** A re-run of the demo must show the
  fix in every captured frame.

## Assumptions

| Assumption | Risk if Invalid | Mitigation |
|------------|-----------------|------------|
| The category display name is already on the model (`Category.nameBn` / `nameEn`) and on the public serializer. | If not, the bolt must add the field to the serializer. | The bolt's technical-design stage verifies the field shape and updates the serializer if needed. |
| The citizen's display name is on the `User` model (`firstName` / `lastName` or a `displayName` field). | If not, the bolt uses a small id-to-name lookup helper backed by the user directory. | Same — verified in the bolt's technical-design stage. |
| The file-upload route already accepts multipart (the citizen photo route does). | If not, FR-5 is a small route-shape extension. | Verified in the bolt's technical-design stage. |
| The page maps the actor id to a name via a helper that's available in the dispatcher / crew contexts (not the citizen context, where names are hidden). | If not, the bolt adds the helper. | Verified in the bolt's technical-design stage. |

## Out of Scope (Won't)

- **Push notifications on status changes** — Bolt 007-001
  already shipped the push scaffold; this intent does not wire
  it.
- **"Resolved!" celebration surface** — deferred per
  Bolt 004-003 line 463-471.
- **Real-time polling / SSE / WebSocket** — no new live-update
  transport.
- **Bulk photo upload, photo editing, photo annotations** —
  single-image upload only.
- **Admin-name visibility in the trail** — `admin` role still
  hides the name; the actor label stays as the role.
- **The translation typos in the citizen-supplied `note`
  field** — out of scope (citizen input is opaque).
- **A new "Settings" page for language / theme** — out of
  scope; the existing header toggles stay where they are.

## Open Questions

| Question | Resolution |
|----------|------------|
| Does the `t(...)` regression guard live as a static-analysis check (preferred) or a runtime test? | **Static analysis** — a small script that greps every `t('...',` call site in `app/**` and asserts the key is in `TRANSLATIONS`. Faster and catches misses at lint time. |
| Where does the actor-name helper live? | Decided in the FR-4 unit-brief (likely `lib/identity/display-name.ts`, mirrored on `lib/identity/` if it doesn't exist). |
| Are visual baselines updated for FR-1 / FR-2? | **No** — those are pure copy fixes; the chrome is identical. Baselines are only updated where the chrome changes (FR-3, FR-4, FR-6) and where a new input shape appears (FR-5). |

## Next Stage

Units + stories + bolt plan.
