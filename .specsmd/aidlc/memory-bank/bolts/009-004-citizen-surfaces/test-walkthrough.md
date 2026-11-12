---
stage: test
bolt: 009-004-citizen-surfaces
created: 2026-11-12T23:00:00Z
---

## Test Report: citizen-surfaces

### Summary

- **Tests**: 2186/2186 unit tests passed (127 files); 24/24 route-spec scenarios passed (6 in the citizen spec, 18 in the auth spec); 25/33 mockup baselines passed.
- **Coverage**: 90.09% line coverage on the measured surface (`lib/`), above the 80% floor. `app/` and `components/` are not measured by Vitest — the coverage config includes `lib/**/*.ts` only, and the React surfaces are covered by the Playwright route specs instead.

The eight failing mockup baselines and the eight missing baselines for the
new mockups are both **environmental**, not product defects: the
failing eight are untouched mockups whose committed baselines were
captured on a different platform, and the missing eight are the new
mockups that must be captured on the CI platform rather than by hand.
Both are addressed by the same workflow.

### Test Files

- [x] `tests/33-ui-redesign-citizen.spec.ts` - the citizen route spec: the flow's progress and photo-cap indicators, the dedup prompt with both options, the report list and its live chip counts, the detail trail and its photo groups, the absence of any raw internal id, and the public code's derivation and consistency across surfaces.
- [x] `tests/32-ui-redesign-auth.spec.ts` - the auth and public route spec, run alongside the citizen spec because it shares the shell, the language handling and the report-flow chrome.
- [x] `tests/unit/format/ticket-id.test.ts` - the public code's shape, its determinism, its agreement across the dev store and real Postgres, and its refusal to leak the internal id.
- [x] `tests/unit/lib/report-status-group.test.ts` - the citizen status grouping, and the parity between the filter chips and the API's own filter and total.
- [x] `tests/unit/components/IconButton.test.tsx` - the accessible-name contract and the touch-target contract.
- [x] `tests/unit/ui/mockup-tokens.test.ts` - token purity across the mockups, the shared mockup stylesheet, the component library and the gallery.
- [x] `tests/unit/i18n.test.ts` - the key registry: every referenced key is registered, and every key carries both Bangla and English.

### Acceptance Criteria Validation

**Story 009 — the mockups**

- ✅ **The four mockups exist and are wired into the gallery and the baseline spec**: all four are present, the gallery shows 16 mockups, and `tests/01-mockups.spec.ts` registers each at the large and medium viewports.
- ✅ **Every `var(--token)` in every mockup is declared**: 82 distinct token references across the four mockups and the shared stylesheet, 0 undeclared, against 153 declared in `tokens.css`. The check is a test, so it holds on CI.
- ✅ **Every mockup uses inline SVG icons — zero emoji**: verified by audit; the only arrow character is a `→` inside an HTML comment.
- ✅ **Every mockup's copy is Bangla-first**: all four carry `<html lang="bn">` and Bangla body copy.
- ❌ **The four mockups are captured at 1440×900 and 1024×768; 8 committed baselines exist**: **NOT MET — the 8 baselines must be generated on the CI platform.** They do not exist on disk in any form. A Windows capture is not a valid substitute: Noto Sans Bengali rasterises differently per platform, so a Windows baseline fails on `ubuntu-latest` by roughly 2–3% of pixels, which is above the tolerance.
- ❌ **`npm run test:mockups` is green**: **NOT MET — 25 pass, 8 fail.** All eight failures are on mockups this wave did not touch (`06`, `07`, `10`, `11`, `12`), whose HTML and baselines are unmodified in this working tree. They are the same platform-rasterisation drift, and the baseline-regeneration workflow is the sanctioned remedy. **This is a pre-existing condition, not a regression from this wave.**
- ✅ **A human has approved the mockups**: recorded in `_progress/00-design-log.md` under the Wave 3 entry.

**Story 010 — the page implementation**

- ✅ **The nine citizen routes are composed from the primitives; zero hand-rolled buttons**: every interactive element comes from `Button`, `IconButton`, `StatusPill`, `Timeline`, `MetricStrip`, `FilterChipGroup`, `StepIndicator`, `ReportStepAside` or `ReportStepPrimary`.
- ✅ **The report flow keeps its progress indicator, the photo cap indicator and the dedup prompt**: Scenario A reads `1 / 3 ছবি` and step 2 of 5; Scenario B finds both dedup options with their explanations.
- ✅ **The citizen detail page keeps the vertical trail, the labelled before/after photo groups and the public reference pill**: Scenario D finds four trail steps, each with an icon and a timestamp, and the labelled photo groups.
- ✅ **No raw internal id is visible on any citizen surface**: Scenario E asserts it across the list, the detail and the confirmation.
- ✅ **Every new user-facing string is in the key registry with both Bangla and English**: the registry check passes at 1162 keys; the unit suite asserts both locales for every key.
- ✅ **`tests/33-ui-redesign-citizen.spec.ts` is green**: 6/6. It is backend-agnostic by construction — the city, category and ward are discovered off the public activity feed, the ticket id is read from the response body, and the chip counts are asserted against the API's own total.
- ✅ **`npx tsc --noEmit` is clean; `npm run test:unit` is green; `npm run check:i18n` is ok**: clean; 2186/2186; ok.

**Wave exit gate**

- ✅ **The Unit 003 exit gate**: met.
- ✅ **`tests/33-ui-redesign-citizen.spec.ts` green**: 6/6.

### Issues Found

**1. The icon button's touch target — three attempts, all caught by measurement.**

The 32px `sm` button was below the 44px floor. Getting the hit area to
44 without changing the visible control took three attempts, and each
failure was found by measuring the render rather than by reasoning:

- `box-sizing: content-box` plus padding on the button: padding and border
  add to the declared width, so a 44px control became 58px, and
  `background-clip: content-box` clips only the fill, so the border still
  painted around the full padding box.
- A transparent `::before` overlay on the button: `inset` resolves against
  the padding box, so every overlay came up 2px short of its target.
- The same overlay on a wrapper span: the overlay is a sibling of the
  button, so it painted on top and swallowed every pointer event — a
  click at the button's exact centre fired nothing.

**What shipped:** the button's own box is the 44×44 target and the
smaller visual is drawn by an inner span; the call-site `style` prop is
forwarded to that inner span. Measured at all three call sites: the
button is 44×44, real mouse clicks at ±21px from the centre all fire the
handler, ±23px misses, and the layout does not shift by a pixel. The old
markup had also broken three citizen-surface scenarios at HEAD, because
the trail and code elements did not exist; this change fixes them.

**2. The summary step's pill had diverged from the other four.** It
rendered `ধাপ ৫/৫ — পর্যালোচনা` where the other four render `ধাপ N / 5`:
Bangla numerals instead of ASCII, no spaces around the slash, an
em-dash, a step name the others do not carry, and no `data-testid` for
the spec to hook. It now uses the shared aside like every other step,
and the divergent key was deleted from the registry.

**3. The error message was announced twice on the summary step.** The
restructure initially passed the error to the aside *and* kept the
card's own `role="alert"`. It was also the only one of the five steps
that passed the prop at all. Fixed by dropping the prop.

**4. A JSX escape marker leaked into the summary page.** A close tag was
replaced with a literal marker, which broke the build. Found by an
independent audit pass, fixed, and the whole tree was swept for the same
pattern class.

**5. The token-purity test did not cover the shared stylesheet.** The
check globbed only `*.html`, so the new `citizen-surfaces.css` and its 57
token references were invisible to CI. The glob now covers `.css` too.

**6. The language cookie arrived too late for the server render.** The
auth spec wrote `document.cookie` from an init script, which runs after
the document request — so the server rendered Bangla while the client
rendered English, and the hydration mismatch surfaced as a test failure
that looked like a product defect. The cookie is now set on the context,
so it travels as a request header on the first navigation.

### Notes

**The eight failing baselines are pre-existing and environmental.** The
mockups they cover — `06`, `07`, `10`, `11`, `12` — are not modified in
this working tree, and their committed baselines are unmodified. The
diffs are 2–3% of pixels, with one height delta on `11-public-landing`.
The cause is platform font rasterisation. The remedy is the
`regenerate-baselines.yml` workflow, which captures on `ubuntu-latest`:

```bash
gh workflow run regenerate-baselines.yml -f update=true -f scope=mockups
```

**The eight baselines for the new mockups must be captured the same
way.** They were generated on a Windows machine during verification and
deleted rather than committed — Playwright silently writes a missing
baseline on its first run, so leaving them would have committed a
platform-specific baseline that fails on CI.

**Two hazards cost time and will cost time again.** Two dev servers
sharing one `.next` directory corrupt each other's route manifest:
routes 404 while still existing on disk, static chunks 404, and the
symptom is indistinguishable from a code defect. And the root
`playwright.config.ts` hardcodes the server URL to port 3000, so a
run against any other port starts a second server and triggers the same
corruption. An environment override for the server URL would remove the
footgun permanently; it is a follow-up, not a Wave 3 change.
