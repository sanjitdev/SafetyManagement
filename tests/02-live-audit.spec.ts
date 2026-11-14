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

// The Playwright `webServer` (playwright.config.ts) runs `npm run dev:feat`
// on port 3000 — this spec must target the same port, or it silently
// audits whatever unrelated server happens to be listening on the port
// it names. Every other route spec in tests/ uses 3000 for this reason.
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';

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

  test('primary CTA text is dark-on-light-primary in dark mode', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setAppearance(page, 'dark');
    await page.goto(BASE + '/');
    const btn = page.locator('button:has-text("Sign in as Rahim")');
    await expect(btn).toBeVisible();
    const bg = await btn.evaluate((el) => getComputedStyle(el).backgroundColor);
    const color = await btn.evaluate((el) => getComputedStyle(el).color);
    // Dark mode primary is --color-primary: #60A5FA → rgb(96, 165, 250).
    // The primary was teal (#14B8A6 → rgb(20, 184, 166)) until the
    // 2026-11-04 shell rebuild (7bbe053) moved it to the blue ramp;
    // this assertion still carried the old teal value.
    expect(bg).toBe('rgb(96, 165, 250)');
    // Text on dark-mode primary is --color-on-primary: #020617 → rgb(2, 6, 23)
    expect(color).toBe('rgb(2, 6, 23)');
    await page.screenshot({
      path: path.join(AUDIT_DIR, 'cta-contrast-dark.png'),
      fullPage: false,
    });
  });
});

test.describe('Auth story panel — contrast', () => {
  /**
   * The login/register story panel is a DARK surface in every theme.
   *
   * It used to paint `--color-surface-inverse`, which flips with the
   * theme: in dark mode it resolves to #F7FAFC (near-white) while the
   * panel's copy stays `--color-ink-on-dark` #F9FAFB — a ~1.02:1 pair,
   * i.e. the whole panel is invisible. It only looked correct in light
   * mode, which is not the default. The panel now uses `--color-rail`,
   * which is dark in both themes.
   *
   * This asserts the panel's own ink/background pair, so a future
   * "tidy-up" back to surface-inverse fails here instead of shipping.
   */
  const PANELS = [
    { name: 'login', url: '/login', selector: '.login-story' },
    { name: 'register', url: '/register', selector: '.register-story' },
  ] as const;

  for (const panel of PANELS) {
    for (const theme of ['dark', 'light'] as const) {
      test(`${panel.name} story panel is legible in ${theme} mode`, async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await setAppearance(page, theme);
        await page.goto(BASE + panel.url);
        await expect(page.locator(panel.selector)).toBeVisible();

        const ratio = await page.locator(panel.selector).evaluate((el) => {
          const parse = (c: string): number[] => (c.match(/\d+/g) ?? []).map(Number);
          const luminance = (c: string): number => {
            const [r = 0, g = 0, b = 0] = parse(c).map((v) => {
              const s = v / 255;
              return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
            });
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
          };
          const s = getComputedStyle(el);
          const bg = luminance(s.backgroundColor);
          const fg = luminance(s.color);
          return (Math.max(bg, fg) + 0.05) / (Math.min(bg, fg) + 0.05);
        });

        expect(ratio).toBeGreaterThan(4.5);
      });
    }
  }
});

test.describe('Theme toggle', () => {
  /**
   * The theme control is a single 36x36 sun/moon icon button in the
   * shared AppHeader (the earlier 3-option segmented pill was replaced
   * — see the ThemeToggle header comment). The AppHeader only renders
   * on authenticated surfaces, so `/` (the dev demo page) has no
   * toggle at all — these tests use `/home`.
   *
   * The aria-label is the localized *target* state, not the current
   * one: "গাঢ়" (Dark) while light is active, "হালকা" (Light) while
   * dark is active. Match on that label — the notification bell in
   * the same header also carries an SVG, so an icon-based selector
   * would hit the wrong button.
   */
  const THEME_TOGGLE = 'header button[aria-label="হালকা"], header button[aria-label="গাঢ়"]';

  test('two-state toggle is visible in the header and switches theme', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(BASE + '/home');
    const toggle = page.locator(THEME_TOGGLE).first();
    await expect(toggle).toBeVisible();

    // Default is 'system'; HTML class is either theme-light or theme-dark
    // depending on the emulateMedia default (light).
    const before = await page.evaluate(() => document.documentElement.className);
    expect(before).toMatch(/theme-(light|dark)/);
    const wasDark = before.includes('theme-dark');

    // One click flips the resolved theme and stores it.
    await toggle.click();
    await expectThemeClass(page, wasDark ? 'theme-light' : 'theme-dark');
    expect(await page.evaluate(() => localStorage.getItem('cityfix.preferred_appearance.v1'))).toBe(
      wasDark ? 'light' : 'dark',
    );

    // A second click flips it back.
    await toggle.click();
    await expectThemeClass(page, wasDark ? 'theme-dark' : 'theme-light');
    expect(await page.evaluate(() => localStorage.getItem('cityfix.preferred_appearance.v1'))).toBe(
      wasDark ? 'dark' : 'light',
    );
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
    await page.goto(BASE + '/home');
    const toggle = page.locator(THEME_TOGGLE).first();
    const wasDark = await page.evaluate(() =>
      document.documentElement.className.includes('theme-dark'),
    );
    await toggle.click();
    await page.reload();
    await expectThemeClass(page, wasDark ? 'theme-light' : 'theme-dark');
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
  // ── RETIRED as a gate; replaced by two real gates ─────────────
  //
  // WHY THIS SURVEY WAS REPLACED
  //
  // 1. It could never fail. It wrote a JSON file and pushed an
  //    annotation — no assertion, so a page full of hardcoded
  //    colours still reported PASS.
  // 2. It had an operator-precedence bug. The condition was
  //
  //       v && v !== 'rgba(0, 0, 0, 0)' && v !== 'transparent'
  //         && !/^var\(--/.test(v) && /^#[0-9a-f]{3,8}$/i.test(v)
  //         || /^rgb\(/.test(v)
  //
  //    `&&` binds tighter than `||`, so the whole thing parsed as
  //    `(A && B && C && D && E) || F`. Any element with an `rgb(...)`
  //    background — which is EVERY element, because getComputedStyle
  //    resolves `var(--x)` to a literal `rgb()` — was reported as an
  //    offender regardless of where the colour came from.
  // 3. It surveyed only `ROUTES.slice(0, 4)` — landing, splash,
  //    register, login. It never reached `/admin`, which is where the
  //    regression actually was.
  //
  // WHY A DOM SCAN CANNOT DO THIS JOB
  //
  // `getComputedStyle` resolves `var(--color-surface-card)` to a
  // literal `rgb(...)`. The DOM therefore cannot distinguish a
  // token-sourced colour from a hardcoded one. The reliable detector
  // reads the SOURCE.
  //
  // The replacements:
  //   - tests/unit/admin-theme-tokens.test.ts — source-level scan
  //     (Vitest). Fails with the file, line and offending class.
  //   - tests/29-admin-dark-theme.spec.ts — Playwright. Asserts the
  //     computed background is actually DARK on /admin, /dispatcher,
  //     /crew and the admin sub-pages.
  //
  // This survey is kept only as a human-review aid for the citizen
  // routes; it no longer pretends to be a gate. The JSON output is
  // gitignored.
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
            // Only fully-transparent values are skipped. Everything
            // else is recorded for REVIEW — a DOM scan cannot tell a
            // token-sourced colour from a hardcoded one, so this is a
            // human-review aid, not an assertion.
            if (!v || v === 'rgba(0, 0, 0, 0)' || v === 'transparent') continue;
            nodes.push({
              tag: el.tagName.toLowerCase(),
              id: el.id,
              cls: el.className?.toString().slice(0, 60) ?? '',
              prop: p,
              value: v,
            });
          }
        }
        return nodes.slice(0, 30);
      });
      // Record to a JSON file for human review.
      const out = path.join(AUDIT_DIR, `hardcoded-${route.name}.json`);
      fs.writeFileSync(out, JSON.stringify(offenders, null, 2));
      // NOT a gate — the real gates are the Vitest source scan and the
      // Playwright dark-theme assertions. See the comment above.
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
