---
unit: 002-trail-marker-filter
intent: 007-citizen-resolution-visibility
phase: inception
status: draft
created: 2026-10-13T20:10:00Z
updated: 2026-10-13T20:10:00Z
priority: must
---

# Unit 002 — Trail Marker Filter

## Purpose

Stop the raw `after_photo:<url>` marker from appearing in the
citizen-visible status trail. The marker is an internal audit
signal — the citizen serializer either omits `TicketTrailEntry`
rows whose `note` starts with `after_photo:`, or replaces the
`note` value with the localized "After photo added" string. The
marker stays in the underlying rows so the audit pipeline (Bolt
004-003 line 113-117) keeps working unchanged.

## Scope

### In Scope
- Citizen branch of `lib/serializers/ticket.ts` filters or
  rewrites `TicketTrailEntry` rows whose `note` matches
  `^after_photo:`.
- `lib/i18n/keys.ts` gains the "After photo added" label in both
  locales.
- Regression-guard unit test: a `^[a-z_]+:` marker-shaped string
  on the citizen branch fails the build unless explicitly
  handled.
- Existing trail tests under `tests/unit/serializers/` continue
  to pass.

### Out of Scope
- Internal surfaces (dispatcher, crew, admin) — they continue to
  see the raw marker; this requirement is citizen-only.
- Any change to the crew photo-upload write path. The marker
  format stays stable.
- A new render layout for the trail — only the `note` string
  changes.

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| FR-2 | Filter `after_photo:` marker from the citizen-visible status trail | Must |

## Domain Concepts

### Key Entities

| Entity | Description | Attributes |
|--------|-------------|------------|
| `TicketTrailEntry` | Internal audit row | `id`, `ticketId`, `actor`, `note`, `createdAt` |
| `after_photo:` marker | `note: 'after_photo:<url>'` written by the crew photo-upload endpoint (Bolt 004-003) | string prefix |
| `SerializedTicketTrail` | Citizen-facing trail shape | `actor`, `note` (localized), `createdAt` |

### Key Operations

| Operation | Description | Inputs | Outputs |
|-----------|-------------|--------|---------|
| `serializeTrailForCitizen(trail)` | Citizen branch rewrites or filters `after_photo:` rows | `TicketTrailEntry[]` | `SerializedTicketTrail[]` |
| `i18n.t('trail.afterPhotoAdded')` | Localized replacement | none | string |

## Story Summary

| Metric | Count |
|--------|-------|
| Total Stories | 1 |
| Must Have | 1 |
| Should Have | 0 |
| Could Have | 0 |

### Stories

| Story ID | Title | Priority | Status |
|----------|-------|----------|--------|
| S-002.1 | Citizen trail filter + i18n key + regression-guard test | Must | Planned |

## Dependencies

### Depends On
- None — Unit 002 is serializer-only.
- **Co-located with Unit 001** in Bolt 007-001 because both
  units touch `lib/serializers/ticket.ts`. The serializer commits
  in one PR.

### Depended By
- None.

### External Dependencies
- None. Pure serializer change + i18n + test.

## Technical Context

### Suggested Technology
- Vitest unit tests for the serializer + the regression-guard
  test.
- No new dependencies; uses the existing i18n registry and
  serializer patterns.

### Integration Points

| Integration | Type | Protocol |
|-------------|------|----------|
| `GET /api/tickets/[id]` | Read | HTTP — returns the serialized ticket; the trail's `note` field changes for citizen consumers |
| `lib/i18n/keys.ts` | Read | In-process — `t(...)` retrieves the localized string |

### Data Storage
No data-model change.

## Implementation Notes

### Filter Strategy

The citizen branch replaces any `TicketTrailEntry.note` whose
value matches `^after_photo:` with the localized "After photo
added" string. The entry is **kept** in the trail (with the new
`note`) so the citizen still sees a trail entry at the moment
the photo was added — the difference is they no longer see a raw
URL.

Alternative (simpler): omit the entry entirely. Both
alternatives pass all FR-2 acceptance criteria.

The Construction Agent chooses one and records the choice in the
bolt record. If the entry is kept (with the localized note), the
`createdAt` and the actor remain; if the entry is omitted, the
trail simply doesn't mention the photo upload.

**Recommendation:** keep the entry with the localized note. The
citizen benefits from knowing a photo was added — that is the
"feel heard" trust signal. The localized note keeps that signal
without leaking the URL.

### Regression Guard

A new unit test asserts that for any `TicketTrailEntry` whose
`note` matches `^[a-z_]+:`, the citizen branch either omits the
entry or replaces the `note`. The regex is narrow enough to
avoid false positives on free-text notes.

The test runs:
1. With a synthetic `after_photo:https://blob/abc.jpg` entry →
   asserts the citizen output's `note` is the localized string.
2. With a synthetic `^route_note:foo` entry → asserts the
   regex-test would fail if such an entry appeared without an
   explicit decision (a follow-up story would be required).
3. With a normal free-text note like "Submitted" → asserts no
   match, no replacement.

### Files Touched

- `lib/serializers/ticket.ts` — citizen branch rewrites the
  trail.
- `lib/i18n/keys.ts` — new key `trail.afterPhotoAdded` (English
  + Bangla).
- `tests/unit/serializers/ticket.test.ts` — new tests:
  - "filter `after_photo:` marker from citizen trail"
  - "regression-guard: any `^[a-z_]+:` marker reaches citizen
    branch only via an explicit allowlist"

### Constraints

- The marker format `after_photo:` on `TicketTrailEntry.note`
  MUST stay stable (audit pipeline greps on it per Bolt 004-003
  line 113-117). The fix is at the citizen serializer, not a
  marker rename.
- Internal surfaces (dispatcher, crew, admin) continue to see
  the raw marker. The serialization function for those surfaces
  (non-citizen / public branches) is unchanged.
- Bilingual parity: both English and Bangla replacements ship
  at the same time.

## Success Criteria

### Functional
- [ ] Given a trail with one `after_photo:<url>` entry, the
      citizen-serialized trail contains no `note` field whose
      value starts with `after_photo:`.
- [ ] Internal (non-citizen / public) branches continue to
      surface the raw marker.

### Non-Functional
- [ ] No measurable performance impact on `/api/tickets/[id]`
      (the trail filter is O(n) over ≤ 50 trail entries).

### Quality
- [ ] Coverage ≥ 80% (org.md scope default for `feature`
      scope).
- [ ] `npx tsc --noEmit` clean.
- [ ] All existing trail tests pass.
- [ ] Regression-guard unit test passes on synthetic inputs.
- [ ] Bilingual typed-registry check passes.

## Bolt Suggestions

| Bolt | Type | Stories | Objective |
|------|------|---------|-----------|
| Bolt 007-001 | DDD | S-002.1 (+ S-001.1, S-001.2 from Unit 001) | Trail marker filter in the same PR as the photo split |

## Notes

- Unit 002 is small, focused, and lands in the same bolt as
  Unit 001. It exists as a separate Unit so the requirement
  audit trail (Checkpoints 1–3) shows the trail-marker fix as a
  distinct piece of work.
- If the Construction Agent prefers to omit `after_photo:`
  entries entirely (alternative filter strategy), the unit-brief
  remains valid — only the implementation changes.
