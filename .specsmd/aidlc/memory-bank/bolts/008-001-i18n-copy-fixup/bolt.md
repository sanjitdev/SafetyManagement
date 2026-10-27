---
id: 008-001-i18n-copy-fixup
unit: 001-i18n-copy-fixup
intent: 008-ux-polish-from-demo
type: simple-construction-bolt
status: complete
stories:
  - 001-register-missing-i18n-keys-and-typos
created: 2026-10-14T18:15:00Z
started: 2026-10-14T18:15:00Z
completed: 2026-10-27T00:00:00Z
updated: 2026-10-27T00:00:00Z
current_stage: null
stages_completed:
  - name: plan
    completed: 2026-10-14T18:15:00Z
    artifact: implementation-plan.md
  - name: implement
    completed: 2026-10-14T18:45:00Z
    artifact: implementation-walkthrough.md
  - name: test
    completed: 2026-10-14T19:00:00Z
    artifact: test-walkthrough.md
requires_bolts: []
enables_bolts:
  - 008-002-visible-chrome
requires_units: []
blocks: false
complexity:
  avg_complexity: 1
  avg_uncertainty: 1
  max_dependencies: 0
  testing_scope: 2
  estimated_files: 4
---

# Bolt 008-001 — i18n Copy Fix-up

## Purpose

Land the i18n half of Intent 008 in one bolt:

1. Register the 12 keys called by pages but missing from
   `TRANSLATIONS` (which is why the slow-motion demo shows
   raw `key.path` strings in the chrome).
2. Correct the 2 Bangla typos in registered keys
   (`crew.detail.navigate`, `crew.detail.trail`).
3. Register the 5 chrome-half keys for FR-6
   (`dispatcher.assignCrew.none`, `ticket.status.submitted`,
   `photo.before`, `photo.after`, `dispatcher.changeWard`).
4. Add a static-analysis guard
   (`scripts/check-i18n-keys.mjs`) that greps every
   `t('...',` call site in `app/**` and asserts the key
   is in the registry.
5. Wire the guard to `npm run check:i18n` (and add it to
   `package.json`).

This is a pure data + lint-script bolt. No chrome changes.
No route changes. No visual baselines. The slow-motion
demo is the canonical sign-off — a re-run must show zero
raw `key.path` strings in any captured frame.

## Stories

### From Unit 001 (i18n copy fixup)
| Story ID | Title | FR |
|----|-------|----|
| 001-register-missing-i18n-keys-and-typos | Register 12 missing keys, correct 2 typos, add 5 FR-6 keys, add static-analysis guard | FR-1, FR-2, FR-6 (i18n half) |

## Files Modified

- `lib/i18n/keys.ts` — add 17 new entries; correct the
  `bn` value of `crew.detail.navigate` and the `en` value
  of `crew.detail.navigate` and the `bn` value of
  `crew.detail.trail`.
- `scripts/check-i18n-keys.mjs` — new script (read-only,
  exits non-zero on miss).
- `package.json` — add `check:i18n` script.
- `tests/unit/i18n/keys.test.ts` — new unit test (Vitest)
  asserting every key in `TRANSLATIONS` has both `bn` and
  `en` values, and that the new keys are present.

## Implementation Notes

### New keys to register

| Key | bn | en |
|-----|----|----|
| `report.category.search_placeholder` | `ক্যাটেগরি খুঁজুন…` | `Search categories…` |
| `report.photo.empty_hint` | `ছবি যোগ করুন — একটি প্রাথমিক ছবি বাধ্যতামূলক, বাকি ২টি ঐচ্ছিক` | `Add photos — 1 primary is required, up to 2 more are optional` |
| `report.photo.counter` | `0 / 3 ছবি` | `0 / 3 photos` |
| `report.photo.add_primary` | `প্রাথমিক ছবি যোগ করুন` | `Add primary photo` |
| `report.note.label` | `কিছু লিখুন` | `Add a note` |
| `report.note.helper` | `আপনার নোট ডিসপ্যাচারকে দ্রুত বুঝতে সাহায্য করে` | `A short note helps the dispatcher understand quickly` |
| `report.note.counter` | `report.note.counter` | `report.note.counter` |
| `confirmation.copy_id` | `আইডি কপি করুন` | `Copy ID` |
| `confirmation.next_title` | `পরবর্তী কী হবে` | `What happens next` |
| `confirmation.next_step1` | `আপনার রিপোর্ট এখনো সারিতে আছে` | `Your report is now in the queue` |
| `confirmation.next_step2` | `১ দিনের মধ্যে ডিসপ্যাচার সাড়া দেবেন` | `A dispatcher will respond within 1 day` |
| `confirmation.next_step3` | `আপডেটের জন্য আপনার ফোনে নোটিফিকেশন পাঠানো হবে` | `You'll get a push notification when the status changes` |
| `dispatcher.assignCrew.none` | `কোনো কর্মী নিযুক্ত নয়` | `Not assigned` |
| `ticket.status.submitted` | `জমা দেওয়া হয়েছে` | `Submitted` |
| `photo.before` | `আগের ছবি` | `Before photo` |
| `photo.after` | `পরের ছবি` | `After photo` |
| `dispatcher.changeWard` | `ওয়ার্ড ও বিভাগ পরিবর্তন` | `Change ward and department` |

### Typo corrections

| Key | Old | New |
|-----|-----|-----|
| `crew.detail.navigate.bn` | `লেভেলগেট করুন` | `নেভিগেট করুন` |
| `crew.detail.navigate.en` | `Levelgate` (or whatever is current) | `Navigate to pin` |
| `crew.detail.trail.bn` | `অনুগতির ইতিহাস` | `অগ্রগতির ইতিহাস` |

### Static-analysis script

`scripts/check-i18n-keys.mjs` (Node, no deps):

```js
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const APP_DIR = join(ROOT, 'app');
const KEYS_FILE = join(ROOT, 'lib/i18n/keys.ts');
const PATTERN = /t\(\s*['"]([a-z][a-z0-9_]*\.[a-z0-9_.]+)['"]/g;

async function* walk(dir) {
  for (const entry of await readdir(dir)) {
    const full = join(dir, entry);
    const s = await stat(full);
    if (s.isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/.test(entry)) yield full;
  }
}

const keysFile = await readFile(KEYS_FILE, 'utf8');
const registered = new Set([...keysFile.matchAll(PATTERN)].map((m) => m[1]));

const misses = [];
for await (const file of walk(APP_DIR)) {
  const src = await readFile(file, 'utf8');
  for (const m of src.matchAll(PATTERN)) {
    if (!registered.has(m[1])) {
      misses.push({ file: relative(ROOT, file), key: m[1] });
    }
  }
}

if (misses.length) {
  console.error('i18n: keys referenced but not in TRANSLATIONS:');
  for (const m of misses) console.error(`  ${m.file}: ${m.key}`);
  process.exit(1);
}
console.log(`i18n: all ${registered.size} keys registered.`);
```

### Test strategy

- **Unit test** (`tests/unit/i18n/keys.test.ts`):
  - For every key in `TRANSLATIONS`, assert `bn` and `en`
    are non-empty strings.
  - Assert the 17 new keys are present.
  - Assert the typo'd keys have the corrected values.
- **Manual sign-off**: re-run
  `tests/22-slow-motion-e2e-demo.spec.ts`, diff every
  captured frame, confirm zero raw `key.path` strings.
- **No new visual baselines** — chrome is identical.

## Verification

- `npx tsc --noEmit` — clean.
- `npm run test:unit` — passes (the new unit test
  included).
- `node scripts/check-i18n-keys.mjs` — exits 0.
- Re-run `tests/22-slow-motion-e2e-demo.spec.ts`; diff the
  21 captured frames against the audit baseline; expect
  zero raw `key.path` strings.

## Out of Scope

- Visible chrome changes (header dedup, display names,
  status pill, photo card labels) — Bolt 008-002.
- The crew after-photo file upload — Bolt 008-003.
- New visual baselines (chrome is identical).
- Any change to the `t(...)` helper itself.

## Risk Posture

| Risk | Mitigation |
|------|-----------|
| A page references a key that the static-analysis script doesn't pick up (e.g., via dynamic key construction) | The script only greps string-literal `t('...',` calls. Dynamic keys are an existing pattern; a comment in the script documents the limitation. |
| A new key ships in `bn` but not `en` (or vice versa) | The unit test asserts both are present. |
| The script's regex mis-matches an unrelated `t(...)` call | The regex is `[a-z][a-z0-9_]*\.[a-z0-9_.]+` — must start with a lowercase letter (the i18n-key convention). A false positive on a method call is excluded by the lowercase-leading constraint. |
| The slow-motion demo still shows a raw key (e.g., from a key we missed) | The static-analysis script catches it on `npm run check:i18n`; the bolt is not complete until the script is green. |
