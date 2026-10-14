---
story: 001-register-missing-i18n-keys-and-typos
unit: 001-i18n-copy-fixup
intent: 008-ux-polish-from-demo
status: ready
created: 2026-10-14T18:45:00Z
---

# Story 001 — Register Missing i18n Keys and Typos

## User Story

**As a** user (citizen / dispatcher / crew / admin) of the
CityFix surface
**I want** every label on every page to be translated
**So that** I never see a raw `key.path` string in front
of an input or button.

## Acceptance Criteria

- **Given** the slow-motion E2E demo captured 21 frames
  (2026-10-13) showing raw `key.path` strings in the
  chrome
- **When** Bolt 008-001 lands
- **Then** every key referenced by any `t('...',` call
  site in `app/**` is registered in `TRANSLATIONS`
  with both `bn` and `en` values

- **And** the `crew.detail.navigate.bn` value is
  `নেভিগেট করুন` (not `লেভেলগেট করুন`)
- **And** the `crew.detail.trail.bn` value is
  `অগ্রগতির ইতিহাস` (not `অনুগতির ইতিহাস`)

- **And** `scripts/check-i18n-keys.mjs` exists and exits
  0 on a clean tree (and non-zero if a future
  `t('some.new.key', ...)` call site references an
  unregistered key)
- **And** `npm run check:i18n` runs the script
- **And** `tests/unit/i18n/keys.test.ts` asserts every
  key in `TRANSLATIONS` has both `bn` and `en` values

- **And** a re-run of
  `tests/22-slow-motion-e2e-demo.spec.ts` shows zero
  raw `key.path` strings in any captured frame

## BDD Scenarios

### Scenario 1: All keys registered

```gherkin
Given the audit catalog lists 12 + 5 = 17 missing keys
When the bolt lands
Then all 17 keys are present in TRANSLATIONS
  And each has a non-empty bn value
  And each has a non-empty en value
```

### Scenario 2: Typos corrected

```gherkin
Given crew.detail.navigate.bn was "লেভেলগেট করুন"
When the bolt lands
Then crew.detail.navigate.bn === "নেভিগেট করুন"

Given crew.detail.trail.bn was "অনুগতির ইতিহাস"
When the bolt lands
Then crew.detail.trail.bn === "অগ্রগতির ইতিহাস"
```

### Scenario 3: Static-analysis guard catches future misses

```gherkin
Given a future commit adds t('report.future.key', null, lang)
  without registering 'report.future.key' in TRANSLATIONS
When npm run check:i18n runs
Then the script exits non-zero
  And the error message names the file + the missing key
```

### Scenario 4: Slow-motion demo re-run

```gherkin
Given the slow-motion demo captured 21 frames on 2026-10-13
When the bolt lands
  And the demo re-runs
Then every frame shows no raw key.path strings
```

## Out of Scope

- Visible chrome changes (header dedup, display names) —
  Bolt 008-002.
- The crew after-photo file upload — Bolt 008-003.
- New visual baselines (chrome is identical).

## Linked Files

- `lib/i18n/keys.ts`
- `scripts/check-i18n-keys.mjs` (new)
- `package.json` (`check:i18n` script)
- `tests/unit/i18n/keys.test.ts` (new)
