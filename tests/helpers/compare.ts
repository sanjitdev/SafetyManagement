import { test, expect, Page } from '@playwright/test';

/**
 * Reusable helper for visual regression: mockup vs. build.
 *
 * Today: captures the 12 design mockups as committed PNG baselines.
 * Tomorrow: once the build phase exists, also captures the built route
 * and pixel-diffs the two. The build phase just fills in `buildUrl`.
 *
 * Snapshot output is controlled by `snapshotPathTemplate` in
 * playwright.config.ts. Every `toHaveScreenshot()` call writes to
 * tests-mockups/baselines/<spec file>/<name>.png (committed).
 * Diff artifacts land under tests-mockups/artifacts/ (gitignored).
 */

export type Viewport = { width: number; height: number };

export type CompareArgs = {
  /** Stable identifier for the screenshot set. e.g. "01-welcome" */
  name: string;
  /** Absolute path to a mockup .html file under design-artifacts/. */
  mockupPath?: string;
  /** URL of the built route. Omit until the app exists. */
  buildUrl?: string;
  /** Viewport to render at. Should match the design canvas. */
  viewport: Viewport;
  /**
   * Pixel-diff tolerance for the build-vs-mockup comparison, as a ratio of
   * total pixels. Defaults to 0.01 (1%). Tighten when the design is locked.
   */
  tolerance?: number;
};

/** Convert a Windows path to a file:// URL that Chromium can load. */
function toFileUrl(absPath: string): string {
  const normalised = absPath.replace(/\\/g, '/');
  return normalised.startsWith('/') ? `file://${normalised}` : `file:///${normalised}`;
}

/**
 * Loads a mockup HTML file at a given viewport and asserts the rendered
 * pixels match the named PNG under tests-mockups/baselines/.
 */
export async function captureMockup(args: Required<Pick<CompareArgs, 'name' | 'mockupPath' | 'viewport'>>) {
  test(`${args.name} mockup baseline`, async ({ page }: { page: Page }) => {
    await page.setViewportSize(args.viewport);
    await page.goto(toFileUrl(args.mockupPath));
    // `.png` is required in the name argument — Playwright validates it.
    await expect(page).toHaveScreenshot(`${args.name}.png`, { fullPage: true });
  });
}

/**
 * Loads a built route at a given viewport and asserts it pixel-matches the
 * mockup baseline (same `name`). Dormant until the build phase provides buildUrl.
 */
export async function captureBuild(args: Required<Pick<CompareArgs, 'name' | 'buildUrl' | 'viewport'>> & { tolerance?: number }) {
  test(`${args.name} build matches mockup`, async ({ page }: { page: Page }) => {
    await page.setViewportSize(args.viewport);
    await page.goto(args.buildUrl);
    await expect(page).toHaveScreenshot(`${args.name}.png`, {
      fullPage: true,
      maxDiffPixelRatio: args.tolerance ?? 0.01,
    });
  });
}

/**
 * One-call entry point used by the build-phase test files. Today it captures
 * only the mockup side; once buildUrl is provided, it adds the build-side test.
 */
export async function compareMockupVsBuild(args: CompareArgs) {
  if (args.mockupPath) {
    await captureMockup({
      name: args.name,
      mockupPath: args.mockupPath,
      viewport: args.viewport,
    });
  }
  if (args.buildUrl) {
    await captureBuild({
      name: args.name,
      buildUrl: args.buildUrl,
      viewport: args.viewport,
      tolerance: args.tolerance,
    });
  }
}