---
id: 003-trail-marker-filter-with-i18n-and-regression-guard
unit: 002-trail-marker-filter
intent: 007-citizen-resolution-visibility
status: ready
priority: must
created: 2026-10-13T20:15:00Z
assigned_bolt: 007-001-citizen-photo-and-trail-foundation
implemented: false
---

# Story: Citizen trail filter + i18n key + regression-guard test

## User Story

**As a** citizen reading my own report on `/reports/[id]`
**I want** the status trail to read as natural prose
**So that** I never see a literal `after_photo:https://...`
URL in the trail, and I still get the "After photo added"
trust signal that a photo was attached.

## Acceptance Criteria

- [ ] **Given** a ticket whose trail contains one entry with `note: "after_photo:https://blob/abc.jpg"`, **When** the ticket is serialized for a citizen, **Then** the serialized trail's entry for that row has `note: "After photo added"` (English) or its Bangla equivalent — NOT a string that starts with `after_photo:`.
- [ ] **Given** a ticket whose trail contains a normal free-text note like "Submitted", **When** the ticket is serialized for a citizen, **Then** the entry is passed through verbatim (no replacement).
- [ ] **Given** the non-citizen branches (dispatcher, crew, admin) and the public branch of the serializer, **When** the same trail is serialized, **Then** the raw `after_photo:https://...` marker is still present (the filter is citizen-only per the intent's decision log).
- [ ] **Given** a new i18n key `trail.afterPhotoAdded` in `lib/i18n/keys.ts`, **When** the typed i18n registry check runs, **Then** both English ("After photo added") and Bangla ("ছবি যোগ হয়েছে") strings are present and typechecked.
- [ ] **Given** a new unit test in `tests/unit/serializers/ticket.test.ts` (or a dedicated trail-marker test), **When** the test runs, **Then** the following pass:
  - Given a synthetic `after_photo:https://blob/abc.jpg` entry, the citizen output's `note` is the localized string.
  - Given a synthetic `route_note:foo` entry, the regression-guard regex test would fail if such an entry appeared without an explicit allowlist (it asserts that the citizen branch contains NO `note` whose value matches `^[a-z_]+:`).
  - Given a normal "Submitted" note, no match, no replacement.
- [ ] **Given** a TypeScript compile, **When** `npx tsc --noEmit` runs, **Then** the build is clean.
- [ ] **Given** the existing trail tests under `tests/unit/serializers/`, **When** they run, **Then** they continue to pass.

## Technical Notes

- The marker `after_photo:<url>` was introduced in Bolt 004-003 (Intent 004) and is the audit pipeline's grep anchor (per Bolt 004-003 line 113-117). The fix is at the citizen serializer, NOT a marker rename.
- Two acceptable filter strategies:
  - **Replace (recommended):** the citizen branch replaces `note` with the localized string. The entry is kept, so the citizen still sees a trail entry at the moment the photo was added.
  - **Omit:** the citizen branch omits the entry entirely. The trail simply doesn't mention the photo upload.
- The Construction Agent picks one and records the choice in the bolt record. Both pass all acceptance criteria. **Recommendation: replace** — the citizen benefits from the "feel heard" trust signal.
- The regression-guard regex `^[a-z_]+:` is narrow enough to avoid false positives on free-text notes. The test runs on existing trail fixtures first to confirm no false positives.
- This story is unit-only on the test pyramid (per Checkpoint 1, Q5): no new user-visible control means no new E2E or visual baseline.

## Dependencies

### Requires
- None (serializer-only change). Co-located in Bolt 007-001 with Unit 001 because both touch `lib/serializers/ticket.ts`.

### Enables
- None.

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Trail has both `after_photo:` and a normal entry | Only the `after_photo:` entry has its `note` replaced; the normal entry is passed through. |
| Trail has a note like `submitted:by_hand` (no colon-shaped marker) | The regex `^[a-z_]+:` does NOT match `submitted:by_hand` if there's no space — but the regex matches the prefix regardless of the colon. The regression-guard test asserts the citizen output's `note` does NOT match `^[a-z_]+:` so a `submitted:by_hand` would be caught and require an explicit allowlist decision. |
| Trail has a `note` of just `:` (empty marker) | The regex requires at least one `[a-z_]` before the colon, so `:` alone does not match — the entry is passed through. |
| Non-citizen (dispatcher / crew / admin) trail | Raw marker still visible (no replacement). |
| Bangla locale | The replacement is the Bangla string from `trail.afterPhotoAdded`. |

## Out of Scope

- A new render layout for the trail — only the `note` string changes.
- Filtering the marker for non-citizen surfaces — explicit Won't per the intent's decision log.
- Renaming the marker itself (the audit pipeline depends on the format).
- Other trail-note markers — `after_photo:` is the only one per Checkpoint 1, Q2.
