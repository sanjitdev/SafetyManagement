import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config — CityFix.
 *
 * Purpose:
 *   1. Visual regression on the design mockups (file:// loads of static HTML
 *      under design-artifacts/D-Design-System/01-Visual-Design/mockups/).
 *      15 committed baselines; see tests-mockups/README.md.
 *   2. Future: per-WO route tests (`tests/02-*.spec.ts`) that hit the live
 *      Next.js dev server and diff the built page against the same mockup
 *      baseline via `compareMockupVsBuild({ buildUrl, ... })` in
 *      `tests/helpers/compare.ts`.
 *
 * The dev server is started automatically by Playwright before the test
 * suite runs; `npm run test:mockups` exercises (1) only — those tests use
 * file:// URLs and don't touch the web server.
 */
export default defineConfig({
  testDir: './tests',
  // Output directory for diff artifacts and the HTML report's data.
  // Committed baselines live at tests-mockups/baselines/ (separate folder).
  outputDir: './tests-mockups/artifacts',

  // Run serially — we're rendering static HTML and full-page screenshots;
  // parallelism gains are minimal and ordering keeps reports stable.
  fullyParallel: false,
  workers: 1,

  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: './tests-mockups/html-report' }],
  ],

  // Per tech-audit.md §6 (Testing) and tests-mockups/README.md "How the build
  // phase uses this": spin up the Next.js dev server before tests. The mockup
  // tests under tests/01-mockups.spec.ts use file:// URLs and don't need it,
  // but the per-WO route tests (future tests/02-*.spec.ts) do. Setting
  // reuseExistingServer means `next dev` from a manual `npm run dev` will
  // be reused instead of restarted.
  //
  // `dev:feat` sets `CITYFIX_DEV_STORE=1` via cross-env, which flips the
  // in-memory dev-store on. Without it, /api/dev/login returns 404 and
  // every authenticated-flow test fails on its first request. The
  // mockup-only suite (tests/01-mockups.spec.ts) doesn't care, so we
  // always set the flag here.
  webServer: {
    command: 'npm run dev:feat',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      CITYFIX_DEV_STORE: '1',
    },
  },

  use: {
    // Set when the web server is running. The mockup suite overrides per-test
    // via `page.goto('file://...')` directly, so an empty default is fine.
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  // Screenshot defaults — used by toHaveScreenshot() in our helper.
  expect: {
    toHaveScreenshot: {
      // The mockups use varied padding/rounding. Allow modest pixel diff
      // for font rendering differences across machines.
      maxDiffPixelRatio: 0.01,
      // Hide animations and caret blink — they cause flaky pixel diffs.
      animations: 'disabled',
      caret: 'hide',
    },
  },

  // Direct all snapshots to tests-mockups/baselines/ so they're committed
  // alongside the design artifacts. Each spec file's snapshots live in a
  // folder named after that spec file:
  //   tests-mockups/baselines/01-mockups.spec.ts/01-welcome.png
  //   tests-mockups/baselines/01-mockups.spec.ts/05-daily-queue-dashboard.png
  //
  // Mechanics: the helper passes names WITH `.png` (so Playwright knows the
  // mime type). Playwright then strips the extension to compute `{arg}` and
  // re-appends it via `{ext}`. Both must be present.
  snapshotPathTemplate: '{testDir}/../tests-mockups/baselines/{testFilePath}/{arg}{ext}',

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Per-test viewport overrides (phone 390x844 / large 1440x900) are
    // applied via page.setViewportSize() inside the helper, so a single
    // Chromium project is enough.
  ],
});