---
stage: plan
bolt: 008-001-i18n-copy-fixup
created: 2026-10-14T18:15:00Z
---

## Implementation Plan: 001-i18n-copy-fixup — Bolt 008-001

### Objective

Land the i18n half of Intent 008: register the i18n keys that the
slow-motion demo surfaces as raw `key.path` strings, correct the
typo'd entries, and add a static-analysis guard that fails CI when
an `app/**` call site references a key missing from the typed
registry.

### Deliverables

- Missing and FR-6 chrome-half keys registered in `lib/i18n/keys.ts`
  with both `bn` and `en` values.
- Typo corrections applied to the affected registry entries.
- A read-only static-analysis script that scans every `t('...')`
  call site under `app/**` and reports keys absent from
  `TRANSLATIONS`.
- A `check:i18n` npm script wiring the guard into the local and CI
  verification path.
- A unit test that asserts registry completeness and the new /
  corrected key values.

### Dependencies

- `lib/i18n/keys.ts` — the typed key registry is the single source of
  truth for user-facing copy; the bolt only extends it.
- `app/**` — the call-site tree the guard scans.
- `scripts/` — the project already hosts Node maintenance scripts
  here.
- `package.json` — carries the `check:i18n` script entry.

### Technical Approach

The registry is extended in place rather than restructured. Each new
key is added to the `TRANSLATIONS` map with a Bangla and an English
value, matching the existing entry shape so the typed key union
widens automatically. The guard is a dependency-free Node ESM script
that walks `app/` recursively, extracts string-literal `t(...)` keys
with a regular expression, and exits non-zero when a referenced key
is not present in the registry file. The regex anchors on a
lowercase-leading dotted identifier so ordinary method calls are not
mistaken for i18n keys.

### Acceptance Criteria

- [x] Every key referenced by a string-literal `t(...)` call under
      `app/**` is registered in `TRANSLATIONS`.
- [x] Every registered key carries a non-empty `bn` and `en` value.
- [x] The typo'd registry entries are corrected.
- [x] `npm run check:i18n` exits zero on the current tree.
- [x] `npm run test:unit` stays green with the new registry assertions.
