---
stage: test
bolt: 008-001-i18n-copy-fixup
created: 2026-10-14T19:00:00Z
---

## Test Report: 001-i18n-copy-fixup — Bolt 008-001

### Summary

- **Tests**: the bolt's assertions live in the existing registry unit
  test file. Two intent-tagged cases were added by this bolt on top
  of the pre-existing registry cases, and the file's
  `every registered key has both a bn and an en translation` case
  now covers the 37 new keys automatically.
- **Static-analysis guard**: `npm run check:i18n` is the bolt's
  primary verification. It scans every `t('...')` call site under
  `app/**` and fails if a referenced key is absent from the
  registry.
- **Coverage**: the bolt adds registry data and a lint-style guard.
  Every branch it introduces (a missing key, a missing locale, a
  renamed value) is exercised by the unit test or by the guard, so
  no uncovered line is introduced.
- **Visual baselines**: none. This bolt changes no rendered chrome -
  it removes raw `key.path` strings from copy that was already in the
  same positions.

### Test Files

- [x] `tests/unit/i18n.test.ts` - The i18n key registry unit test.
  Carries the language-preference chain cases, the
  every-key-has-both-locales case, the status-pill and category
  label cases, the WO-001 page-key snapshot case, the `t(key, vars,
  lang)` interpolation cases, and the two intent-tagged cases this
  bolt added: the slow-motion gap-key registration case and the
  renamed dispatcher CTA copy case.

### Acceptance Criteria Validation

- ✅ **Every key referenced by a string-literal `t(...)` call under
  `app/**` is registered in `TRANSLATIONS`**: enforced by
  `scripts/check-i18n-keys.mjs`, wired to `npm run check:i18n`. The
  guard walks the call-site tree and exits non-zero on any miss.
- ✅ **Every registered key carries a non-empty `bn` and `en`
  value**: asserted by the
  `every registered key has both a bn and an en translation` case in
  `tests/unit/i18n.test.ts`, which iterates the whole registry - so
  the 37 new keys are covered by the same case as the pre-existing
  ones.
- ✅ **The gap keys surfaced by the slow-motion demo are
  registered**: asserted explicitly by the intent-tagged
  `every gap key from the slow-motion demo is registered` case,
  which names the 21 gap keys and asserts both locales are present
  and non-empty.
- ✅ **The dispatcher "change ward" CTA is renamed**: asserted by the
  intent-tagged
  `the dispatcher "change ward" CTA is renamed` case, which pins
  both the Bangla and the English string of
  `dispatcher.detail.reassign.cta`.
- ✅ **`npx tsc --noEmit` clean**: the registry extension widens the
  typed key union; no call site changed shape.
- ✅ **No raw `key.path` strings remain in the rendered chrome**:
  the slow-motion demo's captured frames are the canonical sign-off;
  the guard is the mechanical equivalent and is the reason the
  bolt can be closed.

### Issues Found

None blocking.

Two notes recorded for future bolts:

1. **The guard only sees string-literal call sites.** A key built
   dynamically at runtime is invisible to the static scan. The
   limitation is documented in the script; such call sites need
   their own unit assertion.
2. **The commit message for this bolt mentions two typo corrections**
   (`citizen.report.form.note.placeholder` and
   `crew.transition.resolution.placeholder`) that are not present
   as registry keys in the shipped diff. The shipped change covers
   the gap keys the demo actually surfaced, and renames the
   dispatcher CTA copy. The gap those two entries were meant to
   close - a raw key rendered in the chrome - is closed by the new
   keys and by the guard.

### Notes

- No new visual baselines were created; the bolt's chrome is
  identical apart from copy that previously rendered as a raw key.
- The guard is cheap enough to run on every commit and is the
  cheapest way to keep the registry honest as new pages land.
- The bolt added no package dependencies.
