# DDD-05 — Photo-counter placeholder hotfix

**Bolt**: 002-004-my-reports
**Unit**: 002-citizen-report-flow/004-my-reports
**Intent**: 002-citizen-report-flow
**Date**: 2026-10-29
**Type**: Remediation pass inside a completed bolt's scope
**Trigger**: User report — *"fix the [Image #1] 0/{max}"*, with a
screenshot of the Bangla photo-capture page showing the counter pill
rendering the literal text **`0 / {max} ছবি`**.

---

## 1. The report

The citizen's photo-capture step (`app/report/(create)/photo/page.tsx`)
renders a live counter pill. The user saw:

```text
0 / {max} ছবি
```

instead of:

```text
0 / 3 ছবি
```

The `{count}` half interpolated correctly, which is why the pill read
as *half*-broken rather than as a missing translation — the visible
symptom was a raw placeholder sitting next to a real number.

---

## 2. Root cause

### 2.1 The template and the call site disagreed on a name

The call site (`app/report/(create)/photo/page.tsx:261`):

```tsx
{t('report.photo.counter', { count: photoUrls.length, cap }, LANG)}
```

The template in `lib/i18n/keys.ts` said `{max}`:

```ts
'report.photo.counter': {
  bn: '{count} / {max} ছবি',
  en: '{count} / {max} photos',
},
```

### 2.2 `interpolate()` leaves unmatched placeholders intact — by design

`lib/i18n/keys.ts` defines `interpolate()` so that a `{placeholder}`
with no matching variable is **left in place**. This is deliberate:
a missing variable should leave a visible gap in the UI rather than
silently render an empty string (see the "falls back when the
placeholder is missing" test in `tests/unit/i18n.test.ts`).

That deliberate behaviour is exactly what turned a naming typo into
a user-facing defect. The mechanism is correct; the input was wrong.

### 2.3 `cap` is the codebase-wide name

The photo cap is `derivePhotoCap` in `lib/report-photo-cap.ts`. The
sibling key on the same screen, `report.photo.cap_tooltip`, was
always correct:

```ts
'report.photo.cap_tooltip': {
  bn: 'সর্বোচ্চ {cap}টি ছবি যোগ করা যাবে',
  en: 'You can add up to {cap} photos',
},
```

So `report.photo.counter` was the outlier within its own key family.

### 2.4 Why nothing flagged it

`tests/unit/i18n.test.ts` asserts that every referenced key is
**REGISTERED** in `TRANSLATIONS`. Registration is not correctness — a
key can be present with a placeholder no call site ever supplies,
and nothing flagged it. There was no assertion anywhere that the
placeholder names in a template match the variables passed at the
call site.

---

## 3. The fix

### 3.1 Design principle

> **A template's placeholder names are part of its contract.**
> The registry, the call sites and the domain vocabulary must use
> the same word — and a test must hold them to it.

### 3.2 `lib/i18n/keys.ts`

The template was corrected to use `cap`, matching the call sites and
the domain vocabulary:

```ts
'report.photo.counter': {
  bn: '{count} / {cap} ছবি',
  en: '{count} / {cap} photos',
},
```

The template was changed rather than the call site because `cap` is
the codebase-wide name (`derivePhotoCap`, `report.photo.cap_tooltip`),
and Bolt 008-001's `bolt.md` records the intended output as
`0 / 3 ছবি` / `0 / 3 photos` — i.e. the spec always meant `cap`.

---

## 4. Test coverage

### 4.1 `tests/unit/i18n-placeholder-contract.test.ts` (new — 8 tests)

Pins three things:

1. **The specific regression.** `t('report.photo.counter', { count, cap })`
   renders `0 / 3 ছবি` / `0 / 3 photos`; no literal `{max}`,
   `{cap}` or `{count}` survives. Also asserts the live count tracks
   (`1 / 3`, `3 / 3`) and that a narrowed cap renders `0 / 2 ছবি`.
2. **The convention.** Every `report.photo.*` key uses `{cap}`; no
   photo-flow key mentions `{max}`.
3. **A general guard.** No template in the registry may spell a
   placeholder differently between its `bn` and `en` forms. The two
   forms are authored together, so a mismatch between them is a
   cheap, zero-cost proxy for exactly this drift class.

### 4.2 The guard was proven non-vacuous

A passing test that cannot fail proves nothing. `{max}` was
re-injected into the `en` template and the suite was re-run:

- **5 of the 8 tests failed**, including the whole-registry
  bn/en drift guard.

The template was then restored from a backup and the suite returned
to green. The guard demonstrably detects the bug class it claims to.

---

## 5. Verification evidence

| Gate | Command | Result |
|------|---------|--------|
| Types | `npx tsc --noEmit` | **clean** |
| Unit | `npm run test:unit` | **947 passed / 947**, 66 files |
| Visual | `npm run test:mockups` | **15 passed** |
| Lint | `npm run lint` | **0 errors** (53 pre-existing warnings) |

Unit count moved from 939 → 947 (65 → 66 files); the delta is exactly
the 8 new tests in `tests/unit/i18n-placeholder-contract.test.ts`.

Runtime confirmation:

```text
bn: 0 / 3 ছবি
en: 0 / 3 photos
```

---

## 6. Residual / follow-up

- The registry-level guard only catches **bn/en** placeholder drift.
  It does **not** catch a template whose placeholder matches between
  `bn` and `en` but matches **no call site** — the original failure
  mode, where both templates agreed on `{max}` and both disagreed
  with the call site. Catching that class requires extracting
  call-site variables from `t(...)` invocations across `app/` and
  `components/`, which is a source-analysis problem rather than a
  registry problem. That is a v1.1 candidate, not a v1 fix; the
  manual audit performed for this hotfix found no other mismatched
  call site.
- The bolt's **3 deferred Playwright baselines** remain outstanding
  (see `ddd-04-thumbnail-hotfix.md` § 7). The photo-capture page is
  not one of them.

---

## 7. File manifest

**Modified (source)**

- `lib/i18n/keys.ts` — `report.photo.counter` template: `{max}` → `{cap}`

**New (tests)**

- `tests/unit/i18n-placeholder-contract.test.ts` — 8 tests

**Modified (artifacts)**

- `ddd-03-test-report.md` — addendum with the counter-fix evidence
- `bolt.md` — hotfix stage + section
- `maintenance-log.md` — entry
- `_progress/00-design-log.md` — entry
