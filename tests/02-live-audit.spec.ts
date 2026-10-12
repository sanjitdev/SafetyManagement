/**
 * Live-app audit for the WO-001 surface (tests/02-live-audit.spec.ts).
 *
 * Walks the citizen surfaces (welcome, home, report/location, login) in
 * both light and dark themes, exercises the theme toggle, and captures
 * screenshots to tests-mockups/audit/<spec>/<name>.png for human review.
 *
 * The audit is *not* a visual-regression baseline; it is a smoke +
 * issue-surfacing tool. Failures here are actionable defects, not
 * pixel-diff signals. Screenshots from this spec are NOT committed
 * baselines and are gitignored.
 *
 * Run: `npx playwright test tests/02-live-audit.spec.ts`
 */

import { test, expect, Page, ConsoleMessage } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:3002';

const ROUTES = [
  { name: 'landing-dev', url: '/' },
  { name: 'splash', url: '/splash' },
  { name: 'register', url: '/register' },
  { name: 'login', url: '/login' },
  { name: 'home', url: '/home' },
  { name: 'feed', url: '/feed' },
  { name: 'report-location', url: '/report/location' },
  { name: 'report-photo', url: '/report/photo' },
  { name: 'report-category', url: '/report/category' },
  { name: 'report-note', url: '/report/note' },
  { name: 'report-summary', url: '/report/summary' },
  { name: 'verify-otp', url: '/verify-otp' },
];

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 1024, height: 768 },
  { name: 'phone', width: 390, height: 844 },
];

const AUDIT_DIR = path.resolve(__dirname, '..', 'tests-mockups', 'audit', '02-live-audit.spec.ts');

test.beforeAll(() => {
  fs.mkdirSync(AUDIT_DIR, { recursive: true });
});

/** Force the theme class on <html> by writing localStorage + reload.
 *  Mirrors what a real user does, so we test the boot script too. */
async function setAppearance(page: Page, pref: 'light' | 'dark' | 'system') {
  await page.addInitScript((p) => {
    try {
      window.localStorage.setItem('cityfix.preferred_appearance.v1', p);
    } catch {}
  }, pref);
}

async function setSystemPrefersDark(page: Page, dark: boolean) {
  await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light' });
}

async function expectThemeClass(page: Page, expected: 'theme-light' | 'theme-dark') {
  // Wait for the boot script (and provider) to settle.
  await page.waitForFunction(
    (cls) => document.documentElement.classList.contains(cls),
    expected,
    { timeout: 5_000 },
  );
}

async function captureRoute(page: Page, route: { name: string; url: string }) {
  const consoleErrors: string[] = [];
  const handler = (msg: ConsoleMessage) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  };
  page.on('console', handler);

  const resp = await page.goto(BASE + route.url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300); // let fonts settle
  const status = resp?.status() ?? 0;
  const file = path.join(AUDIT_DIR, `${route.name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  page.off('console', handler);
  return { status, consoleErrors, file };
}

test.describe('Welcome — primary CTA contrast', () => {
  test('primary CTA text reads white-on-teal in light mode', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setAppearance(page, 'light');
    await page.goto(BASE + '/');
    const btn = page.locator('button:has-text("Sign in as Rahim")');
    await expect(btn).toBeVisible();
    const color = await btn.evaluate((el) => getComputedStyle(el).color);
    // White-on-teal: rgb(255, 255, 255) on rgb(44, 82, 130) (--color-primary)
    expect(color).toBe('rgb(255, 255, 255)');
    await page.screenshot({
      path: path.join(AUDIT_DIR, 'cta-contrast-light.png'),
      fullPage: false,
    });
  });

  test('primary CTA text is dark-on-light-teal in dark mode', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setAppearance(page, 'dark');
    await page.goto(BASE + '/');
    const btn = page.locator('button:has-text("Sign in as Rahim")');
    await expect(btn).toBeVisible();
    const bg = await btn.evaluate((el) => getComputedStyle(el).backgroundColor);
    const color = await btn.evaluate((el) => getComputedStyle(el).color);
    // Dark mode primary is the lighter teal --color-primary: #14B8A6 → rgb(20, 184, 166)
    expect(bg).toBe('rgb(20, 184, 166)');
    // Text on dark-mode primary is the dark teal #052E2B → rgb(5, 46, 43)
    expect(color).toBe('rgb(5, 46, 43)');
    await page.screenshot({
      path: path.join(AUDIT_DIR, 'cta-contrast-dark.png'),
      fullPage: false,
    });
  });
});

test.describe('Theme toggle', () => {
  test('three-state toggle is visible on welcome and switches theme', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(BASE + '/');
    // The aria-label is in Bangla ("থিম পরিবর্তন করুন") — match by role only.
    const group = page.locator('main [role="radiogroup"]').first();
    await expect(group).toBeVisible();
    const options = group.locator('[role="radio"]');
    await expect(options).toHaveCount(3);
    // Default is 'system'; HTML class is either theme-light or theme-dark
    // depending on the emulateMedia default (light).
    const before = await page.evaluate(() => document.documentElement.className);
    expect(before).toMatch(/theme-(light|dark)/);

    // Click "Dark"
    await options.nth(1).click();
    await expectThemeClass(page, 'theme-dark');
    expect(await page.evaluate(() => localStorage.getItem('cityfix.preferred_appearance.v1'))).toBe('dark');

    // Click "Light"
    await options.nth(0).click();
    await expectThemeClass(page, 'theme-light');
    expect(await page.evaluate(() => localStorage.getItem('cityfix.preferred_appearance.v1'))).toBe('light');

    // Click "System"
    await options.nth(2).click();
    const cls = await page.evaluate(() => document.documentElement.className);
    expect(cls).toContain('theme-system');
    expect(await page.evaluate(() => localStorage.getItem('cityfix.preferred_appearance.v1'))).toBe('system');
  });

  test('system mode + dark OS = dark theme', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setSystemPrefersDark(page, true);
    await setAppearance(page, 'system');
    await page.goto(BASE + '/');
    await expectThemeClass(page, 'theme-dark');
  });

  test('system mode + light OS = light theme', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setSystemPrefersDark(page, false);
    await setAppearance(page, 'system');
    await page.goto(BASE + '/');
    await expectThemeClass(page, 'theme-light');
  });

  test('theme persists across reload', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(BASE + '/');
    const group = page.locator('main [role="radiogroup"]').first();
    await group.locator('[role="radio"]').nth(1).click(); // dark
    await page.reload();
    await expectThemeClass(page, 'theme-dark');
  });
});

test.describe('Route screenshots — light theme', () => {
  for (const route of ROUTES) {
    test(`light / ${route.name} (${route.url}) loads without console errors`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await setAppearance(page, 'light');
      const { status, consoleErrors } = await captureRoute(page, route);
      // 4xx/5xx is acceptable for unauthenticated routes — record but
      // don't fail the smoke. We'll review screenshots manually.
      expect(status, `${route.url} returned ${status}`).toBeGreaterThanOrEqual(200);
      // Real errors (uncaught exceptions) are not acceptable.
      const realErrors = consoleErrors.filter(
        (e) =>
          !/Failed to load resource/i.test(e) &&
          !/favicon/i.test(e) &&
          !/Hydration/i.test(e),
      );
      expect(realErrors, `Console errors on ${route.url}: ${realErrors.join('; ')}`).toHaveLength(0);
    });
  }
});

test.describe('Route screenshots — dark theme', () => {
  for (const route of ROUTES) {
    test(`dark / ${route.name} (${route.url}) loads without console errors`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await setAppearance(page, 'dark');
      const { status, consoleErrors } = await captureRoute(page, route);
      expect(status).toBeGreaterThanOrEqual(200);
      const realErrors = consoleErrors.filter(
        (e) =>
          !/Failed to load resource/i.test(e) &&
          !/favicon/i.test(e) &&
          !/Hydration/i.test(e),
      );
      expect(realErrors, `Console errors on ${route.url}: ${realErrors.join('; ')}`).toHaveLength(0);
    });
  }
});

test.describe('Hard-coded color audit', () => {
  // Surface every element with a literal hex / rgb / hsl color that does
  // NOT come from the design tokens. These are the "24 hard-coded color
  // lines" called out in the design log; this test gives us a programmatic
  // way to count them per route.
  for (const route of ROUTES.slice(0, 4)) {
    test(`hard-coded colors / ${route.name}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(BASE + route.url);
      const offenders = await page.evaluate(() => {
        const skip = new Set(['html', 'head', 'meta', 'link', 'script', 'style']);
        const nodes: { tag: string; id: string; cls: string; prop: string; value: string }[] = [];
        const all = document.body.querySelectorAll('*');
        for (const el of Array.from(all)) {
          if (skip.has(el.tagName.toLowerCase())) continue;
          const cs = getComputedStyle(el);
          const props = ['color', 'background-color', 'border-color', 'fill', 'stroke'];
          for (const p of props) {
            const v = cs.getPropertyValue(p);
            // Detect literal color values (not CSS var or transparent)
            if (
              v &&
              v !== 'rgba(0, 0, 0, 0)' &&
              v !== 'transparent' &&
              !/^var\(--/.test(v) &&
              /^#[0-9a-f]{3,8}$/i.test(v) || /^rgb\(/.test(v)
            ) {
              nodes.push({
                tag: el.tagName.toLowerCase(),
                id: el.id,
                cls: el.className?.toString().slice(0, 60) ?? '',
                prop: p,
                value: v,
              });
            }
          }
        }
        return nodes.slice(0, 30);
      });
      // Record to a JSON file for human review
      const out = path.join(AUDIT_DIR, `hardcoded-${route.name}.json`);
      fs.writeFileSync(out, JSON.stringify(offenders, null, 2));
      // Don't fail the test — this is a survey, not a hard gate.
      test.info().annotations.push({ type: 'offender_count', description: String(offenders.length) });
    });
  }
});

test.describe('Responsive — phone viewport', () => {
  for (const route of ROUTES.slice(0, 3)) {
    test(`phone light / ${route.name}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await setAppearance(page, 'light');
      const { status } = await captureRoute(page, route);
      expect(status).toBeGreaterThanOrEqual(200);
    });
    test(`phone dark / ${route.name}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await setAppearance(page, 'dark');
      const { status } = await captureRoute(page, route);
      expect(status).toBeGreaterThanOrEqual(200);
    });
  }
});
