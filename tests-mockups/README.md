# Mockup baselines (Playwright visual regression)

This folder holds the **committed PNG baselines** for CityFix's design mockups. They are the source of truth that the future built application will be compared against.

## What's here

| Subfolder | Committed? | Purpose |
|---|---|---|
| `baselines/` | **Yes** | PNG baselines in two families: the 4 static role dashboards (8 viewport combinations) under `01-mockups.spec.ts/`, and the per-WO route-spec PNGs that assert the **real app** under the other spec-file folders. |
| `artifacts/` | No (.gitignored) | Playwright diff artifacts, HTML report, temp files. |

## The 8 static-mockup baselines

Captured at the web-first design canvases. Names map to the mockup HTML files in `design-artifacts/D-Design-System/01-Visual-Design/mockups/`.

| Baseline | Source mockup | Viewport | Role |
|---|---|---|---|
| `01-mockups.spec.ts/01-citizen-dashboard-{1440x900,1024x768}.png` | `mockups/01-citizen-dashboard.html` | 1440 / 1024 | Citizen — home dashboard |
| `01-mockups.spec.ts/02-dispatcher-dashboard-{1440x900,1024x768}.png` | `mockups/02-dispatcher-dashboard.html` | 1440 / 1024 | Dispatcher — operations dashboard |
| `01-mockups.spec.ts/03-crew-dashboard-{1440x900,1024x768}.png` | `mockups/03-crew-dashboard.html` | 1440 / 1024 | Crew — field dashboard |
| `01-mockups.spec.ts/04-admin-dashboard-{1440x900,1024x768}.png` | `mockups/04-admin-dashboard.html` | 1440 / 1024 | Admin — city-wide dashboard |

(The `01-mockups.spec.ts/` subfolder is the spec-file folder. Future spec files (`02-*.spec.ts`, `03-*.spec.ts`) will produce sibling subfolders named after themselves.)

All four dashboards are captured at **both** web viewports (large 1440 × 900 + medium 1024 × 768) — 8 viewport combinations in total.

### The dashboard baselines are captured and committed

The four dashboards replace the 21 page-per-page mockups that preceded them (login, register, OTP, report flow, ticket detail, dispatcher console). They were rebuilt from the reference images in `ui-design/` on 2026-11-13 and their baselines were captured on `ubuntu-latest` by CI — **not** by hand on Windows, because Windows rasterises Noto Sans Bengali differently and would commit a platform-specific baseline that fails on CI. The workflow regenerated the full set, re-ran the suite as a stability check, and uploaded the result as the `refreshed-baselines` artifact.

### The route-spec baselines are a second family, and they were refreshed too

This folder holds **two** baseline families, and only the first one is the static mockups:

| Family | Location | Asserted by | What it renders |
|---|---|---|---|
| Static mockups | `01-mockups.spec.ts/` | `npm run test:mockups` | Pure HTML + CSS from `design-artifacts/` |
| Route specs | `05-…`, `06-…`, `17-…`, `19-…`, `20-…`, and the rest | `npm test` (Playwright) | The **real app**, through a live dev server |

The route-spec family was last refreshed at `ebdba41` (2026-11-08) and **42 commits** landed after it — including Waves 2 and 3, which re-composed the auth, public and citizen surfaces. Those baselines asserted screens that no longer existed, and the route-spec step failed on CI.

CI run `43381371631` (`scope=route-specs`) regenerated the family against HEAD and uploaded all 81 PNGs. **20 of them changed** — the auth, home-feed, report, map, admin and citizen surfaces that Waves 2 and 3 re-composed. The static mockup family was byte-identical between the artifact and the repo, and so was **every dispatcher route-spec baseline** (`10`, `11`, `12`, `13`, `21`), so Wave 4's dispatcher surfaces were untouched by the refresh.

**A refreshed baseline that *looks* older is not evidence of a stale refresh.** The refreshed route-spec PNGs showed English nav and a blue pin mark, while the committed ones showed Bangla nav and a newer-looking green mark — and the committed ones turned out to be the impossible ones. The decisive evidence was the ticket code: the committed baseline showed `#d26edaaa` (the bare internal id), which is exactly what `lib/format/ticket-id.ts` produced on **2026-11-08**, whereas the base-36 public code `#TIX-Z8UQ` only arrived with `84a8f58` in Wave 3. The committed pixels were rendering an application four commits and five days older than they claimed.

The whole set now matches the CI artifact exactly. The full reasoning, with the commit-by-commit attribution table, is in `_progress/00-design-log.md`.

## ⚠️ The baselines are platform-specific — refresh them in CI, not on your machine

**The committed baselines are rendered by `ubuntu-latest`, the platform CI asserts them on. Do not regenerate them on a dev machine.**

Chromium rasterizes the Noto Sans Bengali webfont (loaded from Google Fonts) differently on Windows and Linux. The glyph antialiasing differs, and on `11-public-landing` at 1024 × 768 the whole page renders **40px shorter on Linux** (1526px) than on Windows (1566px). So a Windows-generated baseline drifts past the 1% tolerance on CI, and a Linux-generated one drifts past it on a Windows dev machine. There is no baseline that satisfies both.

**The supported refresh path:**

```bash
# 1. Regenerate on ubuntu-latest (also re-runs the suite as a stability check)
gh workflow run regenerate-baselines.yml

# 2. Download the refreshed PNGs
gh run download            # artifact: refreshed-baselines

# 3. Copy them over the committed set and commit
cp refreshed-baselines/*.png tests-mockups/baselines/01-mockups.spec.ts/
git add tests-mockups/baselines/
```

Do **not** use `npm run test:update-baselines` for the committed set — that renders on your machine's platform and reintroduces the drift. It is fine for a scratch check.

**When the local suite fails with the CI-generated baselines**, that is expected on Windows and macOS. Trust CI. Before assuming a real regression, compare the CI "actual" PNG against the baseline PNG in the uploaded `mockup-diffs` artifact — the diff image shows exactly which pixels moved.

### Stale baselines are the more common cause

A mockup edit without a baseline refresh fails the gate just as hard as platform drift, and the two stack. Commit `1f8c386` (the MetricStrip redesign) edited 7 mockups — swapping concentric-circle map pins for teardrop paths, rewording Bangla copy, adding `min-width: 0` to fix a grid overflow — but refreshed only 2 of the 25 PNGs. The other 23 were stale, and the gate had been red on every CI run since 2026-10-29.

**When you edit a mockup, refresh its baselines in the same change.** The long-term fix — self-hosting Noto Sans Bengali so the font is a local file rather than a Google Fonts network fetch — is tracked in the Intent 009 inception log.

## Why web-first

The platform switched from mobile-first to web-first on 2026-10-04. The previous 4 mobile baselines (390 × 844) were retired; Rashid's field-crew pages will remain responsive to phone use when his specs are reworked (Phase B — see `_progress/00-design-log.md`).

## Running the suite

```bash
# Install (first time)
npm install
npx playwright install chromium

# Run the baseline-capture test (creates PNGs on first run, pixel-diffs on subsequent runs)
npm run test:mockups

# Refresh baselines after an intentional design change — IN CI, see above
gh workflow run regenerate-baselines.yml

# Open the HTML report (failures, screenshots, traces)
npm run test:report
```

`npm test` runs the full Playwright suite (just `tests/01-mockups.spec.ts` today — 43 viewport baselines).

On Windows and macOS the suite fails against the CI-generated baselines; that is the platform difference described above, not a regression. CI is the source of truth.

## How the build phase uses this

When Mimir's build produces routes, add a second test file per feature area:

```ts
// tests/02-report-flow.spec.ts
import { compareMockupVsBuild } from './helpers/compare';

test.describe('Report submission — Rahim', () => {
  compareMockupVsBuild({
    name: '03-report-submitted-1440x900',
    mockupPath: '<abs path>/03-report-submitted.html',
    buildUrl: '/reports/:id/submitted',  // relative; Playwright resolves via baseURL
    viewport: { width: 1440, height: 900 },
    tolerance: 0.005, // tighten once the design system is locked
  });

  // Add medium-viewport build comparison when ready
  compareMockupVsBuild({
    name: '03-report-submitted-1024x768',
    mockupPath: '<abs path>/03-report-submitted.html',
    buildUrl: '/reports/:id/submitted',
    viewport: { width: 1024, height: 768 },
    tolerance: 0.005,
  });
});
```

Then in `playwright.config.ts`:
- Set `use.baseURL` to the dev server origin.
- Set `webServer` so `npm test` boots the app before tests run.

The helper (`tests/helpers/compare.ts`) takes a screenshot of both the mockup and the built route, then asserts the build matches the baseline. If pixels differ beyond `tolerance`, the test fails and the diff lands under `tests-mockups/artifacts/`.

## Conventions

- **Names include viewport suffix** — `01-welcome-1440x900`, `01-welcome-1024x768`, etc. Don't rename.
- **Tolerance defaults to 1%** (`maxDiffPixelRatio: 0.01`). Lower it as the design system stabilizes.
- **Updating baselines is a deliberate act**, and it happens in CI — see the warning above.
- **Playwright's reported diff ratio is rounded UP** (`Math.ceil(ratio * 100) / 100`), so a true ratio of 0.0104 prints as "0.02". Don't read the printed number as the actual percentage.
- **Animations and caret blink are disabled** in `playwright.config.ts` — they cause flaky pixel diffs. Don't enable them in spec files.
- **New mockups added** → add a corresponding baseline with the same `name` + viewport suffix convention, and refresh in CI.
- **Editing a mockup means refreshing its baselines in the same change.** A stale baseline fails the gate exactly as hard as a real regression, and the two are indistinguishable from the error message alone.