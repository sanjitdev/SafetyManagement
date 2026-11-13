# Mockup baselines (Playwright visual regression)

This folder holds the **committed PNG baselines** for CityFix's design mockups. They are the source of truth that the future built application will be compared against.

## What's here

| Subfolder | Committed? | Purpose |
|---|---|---|
| `baselines/` | **Yes** | PNG baselines captured from the 21 design mockups (43 viewport combinations). |
| `artifacts/` | No (.gitignored) | Playwright diff artifacts, HTML report, temp files. |

## The 43 baselines

Captured at the web-first design canvases. Names map to the mockup HTML files in `design-artifacts/D-Design-System/01-Visual-Design/mockups/`.

| Baseline | Source mockup | Viewport | Persona / role |
|---|---|---|---|
| `01-mockups.spec.ts/01-welcome-1440x900.png` | `mockups/01-welcome.html` | 1440 × 900 | Rahim (citizen) — entry |
| `01-mockups.spec.ts/01-welcome-1024x768.png` | `mockups/01-welcome.html` | 1024 × 768 | Rahim — entry (medium) |
| `01-mockups.spec.ts/02-home-city-activity-1440x900.png` | `mockups/02-home-city-activity.html` | 1440 × 900 | Rahim — hub |
| `01-mockups.spec.ts/02-home-city-activity-1024x768.png` | `mockups/02-home-city-activity.html` | 1024 × 768 | Rahim — hub (medium) |
| `01-mockups.spec.ts/03-report-submitted-1440x900.png` | `mockups/03-report-submitted.html` | 1440 × 900 | Rahim — confirmation |
| `01-mockups.spec.ts/03-report-submitted-1024x768.png` | `mockups/03-report-submitted.html` | 1024 × 768 | Rahim — confirmation (medium) |
| `01-mockups.spec.ts/04-my-reports-detail-1440x900.png` | `mockups/04-my-reports-detail.html` | 1440 × 900 | Rahim — trust moment |
| `01-mockups.spec.ts/04-my-reports-detail-1024x768.png` | `mockups/04-my-reports-detail.html` | 1024 × 768 | Rahim — trust moment (medium) |
| `01-mockups.spec.ts/05-daily-queue-dashboard-1440x900.png` | `mockups/05-daily-queue-dashboard.html` | 1440 × 900 | Habib (dispatcher) — desktop work surface |
| `01-mockups.spec.ts/06-field-app-home-{1440x900,1024x768,390x844}.png` | `mockups/06-field-app-home.html` | 1440 / 1024 / 390 | Rashid (crew) — field app home |
| `01-mockups.spec.ts/07-status-in-progress-{1440x900,1024x768,390x844}.png` | `mockups/07-status-in-progress.html` | 1440 / 1024 / 390 | Rashid — status screen, hands-busy theme |
| `01-mockups.spec.ts/08-login-{1440x900,1024x768}.png` | `mockups/08-login.html` | 1440 / 1024 | Wave 2 — auth entry |
| `01-mockups.spec.ts/09-register-{1440x900,1024x768}.png` | `mockups/09-register.html` | 1440 / 1024 | Wave 2 — registration |
| `01-mockups.spec.ts/10-verify-otp-{1440x900,1024x768}.png` | `mockups/10-verify-otp.html` | 1440 / 1024 | Wave 2 — OTP verification |
| `01-mockups.spec.ts/11-public-landing-{1440x900,1024x768}.png` | `mockups/11-public-landing.html` | 1440 / 1024 | Wave 2 — public entry |
| `01-mockups.spec.ts/12-feed-{1440x900,1024x768}.png` | `mockups/12-feed.html` | 1440 / 1024 | Wave 2 — activity feed |
| `01-mockups.spec.ts/13-home-city-activity-{1440x900,1024x768}.png` | `mockups/13-home-city-activity.html` | 1440 / 1024 | Wave 3 — citizen hub (current) |
| `01-mockups.spec.ts/14-report-shell-{1440x900,1024x768}.png` | `mockups/14-report-shell.html` | 1440 / 1024 | Wave 3 — report flow shell |
| `01-mockups.spec.ts/15-my-reports-{1440x900,1024x768}.png` | `mockups/15-my-reports.html` | 1440 / 1024 | Wave 3 — citizen report list |
| `01-mockups.spec.ts/16-report-detail-trail-{1440x900,1024x768}.png` | `mockups/16-report-detail-trail.html` | 1440 / 1024 | Wave 3 — report detail + status trail |
| `01-mockups.spec.ts/17-triage-queue-{1440x900,1024x768}.png` | `mockups/17-triage-queue.html` | 1440 / 1024 | Wave 4 — dispatcher triage queue (current) |
| `01-mockups.spec.ts/18-dispatcher-ticket-detail-{1440x900,1024x768}.png` | `mockups/18-dispatcher-ticket-detail.html` | 1440 / 1024 | Wave 4 — dispatcher ticket detail |
| `01-mockups.spec.ts/19-dispatcher-map-{1440x900,1024x768}.png` | `mockups/19-dispatcher-map.html` | 1440 / 1024 | Wave 4 — dispatcher map |
| `01-mockups.spec.ts/20-dispatcher-monitor-{1440x900,1024x768}.png` | `mockups/20-dispatcher-monitor.html` | 1440 / 1024 | Wave 4 — dispatcher monitor board |
| `01-mockups.spec.ts/21-dispatcher-performance-{1440x900,1024x768}.png` | `mockups/21-dispatcher-performance.html` | 1440 / 1024 | Wave 4 — dispatcher performance |

(The `01-mockups.spec.ts/` subfolder is the spec-file folder. Future spec files (`02-*.spec.ts`, `03-*.spec.ts`) will produce sibling subfolders named after themselves.)

Mockups 01–04 are captured at **both** web viewports (large 1440 + medium 1024). Mockup 05 is desktop-only and captured at large only. Rashid's mockups 06–07 are captured at large, medium, and the 390 × 844 phone fallback (Feature #4). Mockups 08–16 are captured at large + medium. Mockups 17–21 (Wave 4, dispatcher console) are captured at large + medium.

### The Wave 3 + Wave 4 baselines are captured and committed

The eighteen PNGs for mockups `13`–`16` (Wave 3, citizen) and `17`–`21` (Wave 4, dispatcher) were captured on `ubuntu-latest` by CI run `43287756140` — **not** by hand on Windows, because Windows rasterises Noto Sans Bengali differently and would commit a platform-specific baseline that fails on CI. The workflow regenerated the full set, re-ran the suite as a stability check (the second pass was pixel-clean, so no mockup renders a live clock or an animation), and uploaded the result as the `refreshed-baselines` artifact.

The committed set is now **43 viewport combinations** — 21 mockups at large, 20 at medium, and 2 at the 390 × 844 phone fallback. All 43 were produced by the platform that asserts on them.

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