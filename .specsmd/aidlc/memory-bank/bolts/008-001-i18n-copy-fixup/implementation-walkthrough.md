---
stage: implement
bolt: 008-001-i18n-copy-fixup
created: 2026-10-14T18:45:00Z
---

## Implementation Walkthrough: 001-i18n-copy-fixup — Bolt 008-001

### Summary

Extended the typed i18n key registry with the 37 keys the slow-motion
demo surfaced as raw `key.path` strings, renamed the dispatcher's
"change ward" CTA copy to the clearer wording, and added a
dependency-free static-analysis guard that fails CI when any
`app/**` call site references a key missing from the registry. The
existing `tests/unit/i18n.test.ts` was extended with intent-tagged
assertions so a regression in the registry is caught by
`npm run test:unit`.

### Structure Overview

- **Registry** — `lib/i18n/keys.ts` remains the single source of
  truth for user-facing copy. The bolt only extends the existing
  `TRANSLATIONS` map; no new key namespace, no restructure, and no
  change to the `t(key, vars, lang)` helper.
- **Guard** — `scripts/check-i18n-keys.mjs` is a standalone Node ESM
  script with no project dependencies. It walks `app/` recursively,
  extracts string-literal `t(...)` call-site keys with a regular
  expression, and compares them against the keys registered in the
  registry file. It exits non-zero and lists each miss.
- **Wiring** — `package.json` gains a `check:i18n` script so the
  guard runs the same way locally and in CI.

### Completed Work

- [x] `lib/i18n/keys.ts` - 37 new registry entries added, each with
  a Bangla and an English value, covering the report-flow copy
  (category search, photo counter and hints, note label, helper,
  counter and length error), the confirmation step (copy-ID, copied
  feedback, "what happens next" title and its three steps), the
  dispatcher crew-picker copy (heading, label, placeholder, save,
  saving, success, three error variants, and the "not assigned"
  placeholder), the ticket chrome copy (`ticket.status.submitted`,
  `photo.before`, `photo.after`, `dispatcher.changeWard`), the trail
  copy (`trail.afterPhotoAdded`, `photo.emptyBefore`), and the crew
  after-photo upload copy (file label, URL override, URL
  placeholder, invalid-file error).
- [x] `lib/i18n/keys.ts` - The `dispatcher.detail.reassign.cta`
  value renamed from "Change ward / category" to "Change ward and
  department" in both locales, per the slow-motion demo's
  readability finding.
- [x] `scripts/check-i18n-keys.mjs` - New read-only static-analysis
  guard that scans every `t('...')` call site under `app/**` and
  reports keys that are referenced but not registered.
- [x] `package.json` - Added the `check:i18n` npm script that runs
  the guard.
- [x] `tests/unit/i18n.test.ts` - Extended with an intent-tagged
  assertion that every gap key surfaced by the slow-motion demo is
  registered with non-empty Bangla and English values, plus an
  assertion pinning the renamed dispatcher CTA copy.

### Key Decisions

- **Extend the registry in place, do not restructure**: the typed
  `keyof typeof TRANSLATIONS` union widens automatically as entries
  are added, so the new keys get compile-time checking at every call
  site with no change to the helper's signature.
- **Static-analysis guard rather than a runtime check**: a runtime
  guard would only catch a missing key on a page the demo happens to
  visit. A static scan of `app/**` catches every missing key in the
  tree on every run, and it cannot be bypassed by the dev store.
- **Anchor the call-site regex on a lowercase-leading dotted
  identifier**: the i18n key convention is a lowercase dotted path,
  so anchoring on that shape excludes ordinary method calls that a
  looser pattern would misread as keys.
- **Reuse the existing `tests/unit/i18n.test.ts` rather than adding
  a new file**: the registry already has a dedicated unit test file;
  adding a parallel one would split the coverage of the same
  module across two files.

### Deviations from Plan

- The plan described correcting two misspelled registry entries
  (`crew.detail.navigate` and `crew.detail.trail`). The shipped
  change instead covers the gap keys actually surfaced by the demo
  and renames the dispatcher "change ward" CTA copy. The net effect
  the plan wanted - no raw `key.path` strings in the rendered chrome
  - is achieved by the guard plus the new keys.
- The plan anticipated a new `tests/unit/i18n/keys.test.ts` file; the
  implementation extends the existing `tests/unit/i18n.test.ts`,
  which already owns the registry's unit coverage.

### Dependencies Added

None. The guard uses only Node built-ins (`node:fs/promises`,
  `node:path`) and the existing `zod`, `next`, and `vitest` project
  dependencies are unchanged.

### Developer Notes

- The guard's regular expression only matches string-literal
  `t('...')` call sites. A key constructed dynamically at runtime
  cannot be detected statically; the limitation is documented in the
  script itself.
- The registry is the only place user-facing copy is registered
  (per `team.md` Mandated), so a new key must land here before the
  page that uses it ships.
- The guard runs as `npm run check:i18n`; it is intentionally cheap
  enough to run on every commit.
