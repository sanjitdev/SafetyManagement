# Mockup baselines (Playwright visual regression)

This folder holds the **committed PNG baselines** for CityFix's design mockups. They are the source of truth that the future built application will be compared against.

## What's here

| Subfolder | Committed? | Purpose |
|---|---|---|
| `baselines/` | **Yes** | PNG baselines captured from the 5 design mockups. |
| `artifacts/` | No (.gitignored) | Playwright diff artifacts, HTML report, temp files. |

## The 9 baselines

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

(The `01-mockups.spec.ts/` subfolder is the spec-file folder. Future spec files (`02-*.spec.ts`, `03-*.spec.ts`) will produce sibling subfolders named after themselves.)

Mockups 01–04 are captured at **both** web viewports (large 1440 + medium 1024). Mockup 05 is desktop-only and captured at large only. Rashid's 5 pages don't have hero mockups in this set; his responsiveness is verified when his specs are reworked in Phase B.

## Why web-first

The platform switched from mobile-first to web-first on 2026-10-04. The previous 4 mobile baselines (390 × 844) were retired; Rashid's field-crew pages will remain responsive to phone use when his specs are reworked (Phase B — see `_progress/00-design-log.md`).

## Running the suite

```bash
# Install (first time)
npm install
npx playwright install chromium

# Run the baseline-capture test (creates PNGs on first run, pixel-diffs on subsequent runs)
npm run test:mockups

# Refresh baselines after an intentional design change
npm run test:update-baselines

# Open the HTML report (failures, screenshots, traces)
npm run test:report
```

`npm test` runs the full Playwright suite (just `tests/01-mockups.spec.ts` today — 9 web-viewport tests).

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
- **Updating baselines is a deliberate act.** Run `npm run test:update-baselines`, eyeball the diff in `artifacts/`, commit only after review.
- **Animations and caret blink are disabled** in `playwright.config.ts` — they cause flaky pixel diffs. Don't enable them in spec files.
- **New mockups added** → add a corresponding baseline with the same `name` + viewport suffix convention.
- **A mockup that uses a web font may drift between runs.** The Noto Sans Bengali web font loads at different metrics on different runs, which moves the page height. Before assuming a layout regression, re-run the suite; if it is a font-metric drift, `npm run test:update-baselines` settles it. The durable fix is to self-host the font (tracked in the Intent 009 inception log).