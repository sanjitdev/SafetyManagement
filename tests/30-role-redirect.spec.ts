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

declare global {
  interface Window {
    /** The Next.js App Router client runtime. Present once hydrated. */
    next?: { version?: string; appDir?: boolean; router?: unknown };
  }
}

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
  // `domcontentloaded`, NOT `networkidle` — the site root and the
  // splash page can redirect to the anonymous landing, which runs a
  // 30-second polling interval, so the network never reliably goes
  // idle under load.
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });

  // The login form is a React client component. `domcontentloaded`
  // means the HTML is PARSED, not that React has hydrated — and the
  // form's inputs are CONTROLLED. Filling a controlled input before
  // hydration writes to the DOM but never reaches React's state, so
  // `onChange` never fires and the submit button stays `disabled`.
  //
  // The signal that hydration is DONE is `window.next.router`: the
  // Next.js 14 App Router client runtime creates it once the router
  // is live. (`window.__NEXT_HYDRATED` does NOT exist in the App
  // Router — only in the Pages Router.)
  const submit = page.locator('button[type="submit"]');
  await submit.waitFor({ state: 'visible' });
  await page.waitForFunction(() => !!(window.next && window.next.router), undefined, {
    timeout: 15_000,
  });
  await page.locator('input[type="tel"]').fill(phone);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await expect(submit).toBeEnabled({ timeout: 15_000 });
  await submit.click();

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
      //
      // `domcontentloaded`, NOT `networkidle` — the anonymous landing
      // runs a 30-second polling interval, so the network never
      // reliably goes idle. The redirect is asserted by the
      // `waitForURL` below.
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      await page.waitForURL((url) => !url.pathname.endsWith('/'), {
        timeout: 15_000,
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

      // `domcontentloaded`, NOT `networkidle`. The splash page polls
      // (`/api/auth/status`) and the public landing it can redirect to
      // runs a 30-second `setInterval` poll of `/api/v1/activity/public`.
      // Under load the network never reaches an idle state, so
      // `networkidle` times out on the `goto` before the redirect we
      // actually care about has a chance to happen. The redirect is
      // asserted by the `waitForURL` below, which waits on the thing
      // under test rather than on incidental network quiet.
      await page.goto(BASE + '/splash', { waitUntil: 'domcontentloaded' });
      await page.waitForURL((url) => !url.pathname.startsWith('/splash'), {
        timeout: 15_000,
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
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      await page.waitForURL((url) => !url.pathname.endsWith('/'), {
        timeout: 15_000,
      });
      expect(new URL(page.url()).pathname).not.toBe('/home');
    });
  }
});
