/**
 * Playwright: each persona lands on THEIR OWN surface after login.
 *
 * ## The bug this pins
 *
 * The login page routed by role correctly, but the SITE ROOT did not:
 * `app/page.tsx` redirected every authenticated user with a hard-coded
 * `redirect('/home')`. So an admin who hit `/` with a live session —
 * a bookmark, a refreshed tab, a link shared in chat — landed on the
 * citizen feed instead of the admin console. Dispatcher and crew hit
 * the same wall. The role→surface mapping in `lib/role-home.ts` was
 * never wrong; the CALL SITE was.
 *
 * ## What it asserts
 *
 * For each of the four personas, using the REAL seeded passwords
 * against the real database:
 *
 *  1. Logging in through `/login` lands on that role's own surface.
 *  2. Navigating to `/` while already signed in ALSO lands on that
 *     role's surface — not on the citizen feed. This is the
 *     regression: the site root was the broken entry point.
 *  3. The same holds for `/splash`, the other entry point that
 *     decides where a signed-in user lands.
 *
 * It asserts the URL, not the pixels, so it is stable across
 * font/zoom/theme changes.
 */

import { test, expect, Page } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';

interface Persona {
  role: string;
  /** The seeded phone, in the local `01…` format the login form expects. */
  phone: string;
  /** Where this role belongs. */
  home: string;
}

const PERSONAS: Persona[] = [
  { role: 'citizen', phone: '01711000000', home: '/home' },
  { role: 'dispatcher', phone: '01711000001', home: '/dispatcher' },
  { role: 'crew', phone: '01711000002', home: '/crew' },
  { role: 'admin', phone: '01711000003', home: '/admin' },
];

const PASSWORD = '12345678';

/**
 * Log in through the real login form and return the URL it landed on.
 *
 * The phone is entered in the local `01…` form because that is what
 * the form's own validation regex accepts; the API normalises it to
 * `+880…` server-side.
 */
async function loginAs(page: Page, phone: string): Promise<string> {
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.locator('input[type="tel"]').fill(phone);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
    timeout: 15_000,
  });
  return new URL(page.url()).pathname;
}

test.describe('Each persona lands on their own surface', () => {
  for (const persona of PERSONAS) {
    test(`${persona.role} — login lands on ${persona.home}`, async ({ page }) => {
      const landed = await loginAs(page, persona.phone);
      expect(landed, `${persona.role} landed on the wrong surface after login`).toBe(
        persona.home,
      );
    });

    test(`${persona.role} — the site root lands on ${persona.home}`, async ({
      page,
    }) => {
      await loginAs(page, persona.phone);

      // The regression: `/` used to redirect EVERY authenticated user
      // to `/home`, dumping the admin, dispatcher and crew onto the
      // citizen feed.
      await page.goto(BASE + '/', { waitUntil: 'networkidle' });
      await page.waitForURL((url) => !url.pathname.endsWith('/'), {
        timeout: 10_000,
      });

      expect(
        new URL(page.url()).pathname,
        `${persona.role} visited "/" and was sent to the wrong surface`,
      ).toBe(persona.home);
    });

    test(`${persona.role} — the splash lands on ${persona.home}`, async ({
      page,
    }) => {
      await loginAs(page, persona.phone);

      await page.goto(BASE + '/splash', { waitUntil: 'networkidle' });
      await page.waitForURL((url) => !url.pathname.startsWith('/splash'), {
        timeout: 10_000,
      });

      expect(
        new URL(page.url()).pathname,
        `${persona.role} visited "/splash" and was sent to the wrong surface`,
      ).toBe(persona.home);
    });
  }
});

test.describe('The citizen home is never a staff landing', () => {
  for (const persona of PERSONAS.filter((p) => p.role !== 'citizen')) {
    test(`${persona.role} is never sent to /home from /`, async ({ page }) => {
      await loginAs(page, persona.phone);
      await page.goto(BASE + '/', { waitUntil: 'networkidle' });
      await page.waitForURL((url) => !url.pathname.endsWith('/'), {
        timeout: 10_000,
      });
      expect(new URL(page.url()).pathname).not.toBe('/home');
    });
  }
});
