---
unit: 001-i18n-copy-fixup
intent: 008-ux-polish-from-demo
created: 2026-10-14T18:30:00Z
---

# Unit 001 — i18n Copy Fix-up (unit-brief)

## Goal

Land Bolt 008-001. The bolt.md is the canonical plan; this
brief is the unit-level context the bolt inherits.

## Files (canonical list — confirmed against the bolt.md)

- `lib/i18n/keys.ts` — 17 new entries + 3 typo corrections.
- `scripts/check-i18n-keys.mjs` — static-analysis guard
  (new file).
- `package.json` — `check:i18n` script wired.
- `tests/unit/i18n/keys.test.ts` — new unit test.

## Story

### 001-register-missing-i18n-keys-and-typos

**As a** user (citizen / dispatcher / crew / admin) of
the CityFix surface
**I want** every label on every page to be translated
**so that** I never see a raw `key.path` string in
front of an input or button.

**Given** the slow-motion E2E demo captured 21 frames
(2026-10-13)
**When** I review any frame
**Then** I see zero raw `^[a-z_]+\.[a-z_]+$` strings
(zero `key.path` shape).

And **Given** the registered keys `crew.detail.navigate`
and `crew.detail.trail` had Bangla typos
**When** I view the crew ticket-detail page
**Then** the navigate button reads `নেভিগেট করুন` (not
`লেভেলগেট`) and the trail heading reads `অগ্রগতির ইতিহাস`
(not `অনুগতির`).

## Acceptance

See `bolt.md` for the canonical acceptance criteria.

## Notes

The static-analysis script lives at
`scripts/check-i18n-keys.mjs` (top-level `scripts/`, no
sub-dir). The script is wired to `npm run check:i18n`
which is added to the recommended pre-PR script chain.

The story's `bn` values for the 12 missing keys are
drafted in the bolt.md; the bolt's technical-design
stage freezes them.
