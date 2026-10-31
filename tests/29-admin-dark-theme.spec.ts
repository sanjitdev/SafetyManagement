/**
 * Playwright: dark-theme rendering gate for the ROLE surfaces
 * (tests/29-admin-dark-theme.spec.ts).
 *
 * ## The bug this pins
 *
 * The admin console did not respond to the theme toggle. The user
 * saw a correctly-dark global `AppHeader` sitting on top of a
 * stubbornly light admin body — hardcoded white cards, slate text,
 * amber banners — with no way to read the page in dark mode.
 *
 * The theme machinery was correct and shared by every role. The
 * defect was that `app/admin/**` was the ONLY part of the codebase
 * written with hardcoded Tailwind palette utilities (`bg-slate-50`,
 * `bg-white`, `text-slate-900`, …), which are static CSS classes
 * that cannot respond to the `.theme-dark` class.
 *
 * ## Why this spec exists at all
 *
 * Every EXISTING theme test visited only `/home` or `/` — none
 * navigated to `/admin`, `/dispatcher` or `/crew`. That coverage gap
 * is precisely why the admin regression shipped unnoticed.
 *
 * This spec closes it. It asserts **computed styles**, not pixels:
 * a new visual baseline captured mid-migration is a liability, not a
 * guard, but a computed-background assertion catches "dark header,
 * light body" directly and is stable across font/zoom changes.
 *
 * ## What it asserts, per role surface
 *
 *  1. `document.documentElement` carries `theme-dark` after the
 *     appearance preference is set to `dark`.
 *  2. The page's background is DARK (relative luminance below a
 *     threshold).
 *  3. The page's foreground text is LIGHT (luminance above a
 *     threshold) — i.e. text is readable against that background.
 *  4. No element on the page carries a near-white opaque background
 *     (the "light rectangle" symptom).
 *
 * The thresholds are deliberately loose: the assertion is
 * "dark vs light", not "this exact shade". A hue shift must not
 * break this gate.
 */

import { test, expect, Page } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const VIEWPORT = { width: 1440, height: 900 };

/**
 * The theme surfaces that must follow the toggle. `/admin` is the
 * one that regressed; `/dispatcher` and `/crew` are included
 * because NO existing theme test ever visited them.
 */
const ROLE_SURFACES: Array<{ name: string; url: string; role: string }> = [
  { name: 'admin', url: '/admin', role: 'admin' },
  { name: 'dispatcher', url: '/dispatcher', role: 'dispatcher' },
  { name: 'crew', url: '/crew', role: 'crew' },
];

/**
 * The admin sub-pages. The admin console is a multi-page surface;
 * the console landing page alone would not catch a page that was
 * missed by the migration.
 */
const ADMIN_SUBPAGES: Array<{ name: string; url: string }> = [
  { name: 'admin-cities', url: '/admin/cities' },
  { name: 'admin-tickets', url: '/admin/tickets' },
  { name: 'admin-audit', url: '/admin/audit' },
  {
    name: 'admin-city-setup',
    url: '/admin/cities/city_dhaka_north/setup',
  },
  {
    name: 'admin-city-taxonomy',
    url: '/admin/cities/city_dhaka_north/taxonomy',
  },
  {
    name: 'admin-city-wards',
    url: '/admin/cities/city_dhaka_north/wards',
  },
  {
    name: 'admin-city-users',
    url: '/admin/cities/city_dhaka_north/users',
  },
  {
    name: 'admin-city-adoption',
    url: '/admin/cities/city_dhaka_north/adoption',
  },
];

/**
 * Force the appearance preference, exactly as a real user would:
 * write localStorage, then let the pre-paint boot script apply it.
 * We also emulate a dark OS so `system` would resolve dark too.
 */
async function forceDarkTheme(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('cityfix.preferred_appearance.v1', 'dark');
      window.localStorage.setItem('cityfix.preferred_language.v1', 'en');
    } catch {}
  });
  await page.emulateMedia({ colorScheme: 'dark' });
}

async function forceLightTheme(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('cityfix.preferred_appearance.v1', 'light');
      window.localStorage.setItem('cityfix.preferred_language.v1', 'en');
    } catch {}
  });
  await page.emulateMedia({ colorScheme: 'light' });
}

/**
 * Relative luminance of a CSS colour string.
 *
 * `getComputedStyle` resolves `var(--x)` to a literal `rgb()`, which
 * is why a DOM scan CANNOT distinguish token-sourced colour from
 * hardcoded colour — but it is perfectly adequate for the question
 * this spec asks: "is this pixel light or dark?"
 */
function luminance(cssColor: string): number {
  const m = cssColor.match(/rgba?\(([^)]+)\)/);
  if (!m) return -1;
  const parts = m[1].split(',').map((p) => Number.parseFloat(p.trim()));
  const r = parts[0] ?? 0;
  const g = parts[1] ?? 0;
  const b = parts[2] ?? 0;
  const a = parts.length > 3 ? (parts[3] ?? 1) : 1;
  if (a === 0) return -1; // fully transparent — not a visible surface
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
  );
}

/**
 * A surface is "dark" when its luminance is below 0.2; "light" when
 * above 0.5. The gap is the tolerance band — a mid-tone surface
 * satisfies neither, so the assertion below reports it as
 * ambiguous rather than silently passing.
 */
const DARK_MAX_LUMINANCE = 0.2;
const LIGHT_MIN_LUMINANCE = 0.5;

interface SurfaceProbe {
  bodyBackground: string;
  bodyColor: string;
  /** Opaque near-white backgrounds found anywhere on the page. */
  lightRectangles: Array<{ tag: string; cls: string; value: string }>;
}

async function probeSurfaces(page: Page): Promise<SurfaceProbe> {
  return page.evaluate(() => {
    const cs = getComputedStyle(document.body);
    const lightRectangles: Array<{
      tag: string;
      cls: string;
      value: string;
    }> = [];
    const skip = new Set(['html', 'head', 'meta', 'link', 'script', 'style']);
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      const tag = el.tagName.toLowerCase();
      if (skip.has(tag)) continue;
      const style = getComputedStyle(el);
      const bg = style.backgroundColor;
      if (!bg || bg === 'transparent') continue;
      const alphaMatch = bg.match(/rgba?\(([^)]+)\)/);
      if (!alphaMatch) continue;
      const parts = alphaMatch[1].split(',').map((p) => Number.parseFloat(p.trim()));
      const alpha = parts.length > 3 ? (parts[3] ?? 1) : 1;
      // Only opaque backgrounds are visible surfaces.
      if (alpha < 0.5) continue;
      const r = parts[0] ?? 0;
      const g = parts[1] ?? 0;
      const b = parts[2] ?? 0;
      const channel = (c: number) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      const lum =
        0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
      // Near-white: brighter than 0.85 relative luminance.
      if (lum > 0.85) {
        lightRectangles.push({
          tag,
          cls: el.className?.toString().slice(0, 80) ?? '',
          value: bg,
        });
      }
    }
    return {
      bodyBackground: cs.backgroundColor,
      bodyColor: cs.color,
      lightRectangles,
    };
  });
}

/**
 * Log in via the dev-store seam when it is available, otherwise
 * fall back to the persona's real credentials.
 *
 * The dev store is the seam the whole route-spec suite uses; when
 * it is off (real-database mode) the admin/dispatcher/crew personas
 * still log in with their seeded passwords.
 */
async function loginAsRole(page: Page, role: string) {
  const devLogin = await page.request.post(
    `${BASE}/api/dev/login?role=${role}`,
    { maxRedirects: 0, failOnStatusCode: false },
  );
  if (devLogin.status() !== 404) return;

  // Real-database fallback: the seeded persona passwords.
  const PERSONAS: Record<string, { phone: string; password: string }> = {
    admin: { phone: '+8801711000003', password: '12345678' },
    dispatcher: { phone: '+8801711000001', password: '12345678' },
    crew: { phone: '+8801711000002', password: '12345678' },
  };
  const persona = PERSONAS[role];
  if (!persona) return;

  const res = await page.request.post(`${BASE}/api/v1/auth/login`, {
    data: { phone: persona.phone, password: persona.password },
    failOnStatusCode: false,
  });
  if (res.status() >= 400) {
    throw new Error(
      `login as ${role} failed: ${res.status()} — ${await res.text()}`,
    );
  }
}

test.describe('Role surfaces follow the dark theme', () => {
  for (const surface of ROLE_SURFACES) {
    test(`${surface.name} — page is dark and readable in dark mode`, async ({
      page,
    }) => {
      await page.setViewportSize(VIEWPORT);
      await forceDarkTheme(page);
      await loginAsRole(page, surface.role);

      await page.goto(BASE + surface.url, { waitUntil: 'networkidle' });

      // 1. The theme class is applied.
      await page.waitForFunction(
        () => document.documentElement.classList.contains('theme-dark'),
        undefined,
        { timeout: 5_000 },
      );

      // 2 + 3. The background is dark and the text is light.
      const probe = await probeSurfaces(page);
      const bodyLum = luminance(probe.bodyBackground);
      const textLum = luminance(probe.bodyColor);

      expect(
        bodyLum,
        `${surface.url} body background "${probe.bodyBackground}" is not dark (luminance ${bodyLum.toFixed(3)})`,
      ).toBeLessThan(DARK_MAX_LUMINANCE);
      expect(
        textLum,
        `${surface.url} body text "${probe.bodyColor}" is not light (luminance ${textLum.toFixed(3)})`,
      ).toBeGreaterThan(LIGHT_MIN_LUMINANCE);

      // 4. No near-white rectangle survives on the page.
      expect(
        probe.lightRectangles,
        `${surface.url} still has light rectangles in dark mode:\n${probe.lightRectangles
          .map((r) => `  <${r.tag} class="${r.cls}"> ${r.value}`)
          .join('\n')}`,
      ).toEqual([]);
    });
  }
});

test.describe('Admin sub-pages follow the dark theme', () => {
  for (const sub of ADMIN_SUBPAGES) {
    test(`${sub.name} — page is dark and readable in dark mode`, async ({
      page,
    }) => {
      await page.setViewportSize(VIEWPORT);
      await forceDarkTheme(page);
      await loginAsRole(page, 'admin');

      await page.goto(BASE + sub.url, { waitUntil: 'networkidle' });

      await page.waitForFunction(
        () => document.documentElement.classList.contains('theme-dark'),
        undefined,
        { timeout: 5_000 },
      );

      const probe = await probeSurfaces(page);
      const bodyLum = luminance(probe.bodyBackground);
      const textLum = luminance(probe.bodyColor);

      expect(
        bodyLum,
        `${sub.url} body background "${probe.bodyBackground}" is not dark (luminance ${bodyLum.toFixed(3)})`,
      ).toBeLessThan(DARK_MAX_LUMINANCE);
      expect(
        textLum,
        `${sub.url} body text "${probe.bodyColor}" is not light (luminance ${textLum.toFixed(3)})`,
      ).toBeGreaterThan(LIGHT_MIN_LUMINANCE);

      expect(
        probe.lightRectangles,
        `${sub.url} still has light rectangles in dark mode:\n${probe.lightRectangles
          .map((r) => `  <${r.tag} class="${r.cls}"> ${r.value}`)
          .join('\n')}`,
      ).toEqual([]);
    });
  }
});

test.describe('The theme toggle switches the admin body, not just the header', () => {
  test('clicking the toggle on /admin flips the whole page', async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORT);
    await forceLightTheme(page);
    await loginAsRole(page, 'admin');

    await page.goto(BASE + '/admin', { waitUntil: 'networkidle' });
    await page.waitForFunction(
      () => document.documentElement.classList.contains('theme-light'),
      undefined,
      { timeout: 5_000 },
    );

    const before = await probeSurfaces(page);
    expect(luminance(before.bodyBackground)).toBeGreaterThan(
      LIGHT_MIN_LUMINANCE,
    );

    // The toggle lives in the shared AppHeader. Its aria-label is the
    // localized TARGET state ("Dark" while light is active), and the
    // header renders in Bangla by default — so match both locales.
    const toggle = page
      .locator(
        'header button[aria-label="Dark"], header button[aria-label="গাঢ়"]',
      )
      .first();
    await expect(toggle).toBeVisible();
    await toggle.click();

    await page.waitForFunction(
      () => document.documentElement.classList.contains('theme-dark'),
      undefined,
      { timeout: 5_000 },
    );

    // The theme flip is ANIMATED (`transition-colors` on the cards).
    // The class lands instantly, but the PAINTED colours animate over
    // ~150ms — sampling immediately catches a mid-transition colour
    // (e.g. `rgb(228, 229, 231)` on a card that is heading to
    // `rgb(17, 24, 39)`) and reports a false "light rectangle".
    //
    // Wait for the transition to settle before sampling.
    await page.waitForTimeout(400);

    const after = await probeSurfaces(page);
    expect(
      luminance(after.bodyBackground),
      `/admin body did not follow the toggle into dark mode (background "${after.bodyBackground}")`,
    ).toBeLessThan(DARK_MAX_LUMINANCE);
    expect(
      after.lightRectangles,
      `/admin kept light rectangles after the toggle:\n${after.lightRectangles
        .map((r) => `  <${r.tag} class="${r.cls}"> ${r.value}`)
        .join('\n')}`,
    ).toEqual([]);
  });
});
