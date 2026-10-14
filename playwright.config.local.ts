import { defineConfig, devices } from '@playwright/test';

/**
 * Local override config that points Playwright at an already-running
 * dev:feat server on port 3100 (Bolt 007-001 testing). The default
 * `playwright.config.ts` hardcodes port 3000, but Bolt 007-001 testing
 * runs against a dedicated dev:feat on 3100 to avoid clashing with
 * any external process on 3000.
 *
 * Mirrors all other settings from the default config; only `webServer`
 * + `use.baseURL` change.
 */
export default defineConfig({
  testDir: './tests',
  outputDir: './tests-mockups/artifacts',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  webServer: {
    // Use a long-running no-op so Playwright can attach the existing
    // dev:feat server on 3100. `reuseExistingServer: true` short-
    // circuits the spawn when the URL is already reachable.
    command: 'node -e "setInterval(()=>{}, 1000*60*60)"',
    url: 'http://localhost:3100',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
      animations: 'disabled',
      caret: 'hide',
    },
  },
  snapshotPathTemplate:
    '{testDir}/../tests-mockups/baselines/{testFilePath}/{arg}{ext}',
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
