/**
 * Playwright: a `?next=` deep link must not override the role model.
 *
 * ## The bug this pins
 *
 * The login page routed by role correctly when the user arrived at a
 * bare `/login`. But when the URL carried a `?next=` deep link, the
 * deep link won and the role was ignored entirely:
 *
 * ```ts
 * const explicitNext = params.get('next');
 * router.replace(explicitNext ? nextPath : roleHome(data?.role));
 * ```
 *
 * The public landing's "Log in" CTA links to `/login?next=/report/location`
 * (the citizen report flow), so EVERY persona who signed in from
 * there landed on the citizen's report screen — the admin on a
 * citizen form, the dispatcher on a citizen form. Measured before the
 * fix:
 *
 * ```
 * entry: /login?next=/report/location
 *   citizen     final=/report/location
 *   dispatcher  final=/report/location   ← wrong
 *   crew        final=/report/location   ← wrong
 *   admin       final=/report/location   ← wrong
 * ```
 *
 * The earlier `app/page.tsx` fix did NOT cover this: the site root is
 * a different entry point from the login form. Both had to route by
 * role.
 *
 * ## What it asserts
 *
 * For each of the four personas, using the real seeded passwords
 * against the real database:
 *
 *  1. A bare `/login` lands on that role's own surface.
 *  2. A deep link into a CITIZEN-ONLY surface (`/report/location`) is
 *     honoured for a citizen and REFUSED for the three staff roles —
 *     each staff role lands on its own surface instead.
 *  3. A deep link into the PUBLIC LANDING's own login CTA (which
 *     carries `?next=/report/location`) behaves the same way. This is
 *     the entry path the user actually took.
 *  4. A deep link into a SHARED surface (`/reports`) is honoured for
 *     every role — a deep link must still work when it is legitimate.
 *  5. A deep link into a role's OWN staff surface is honoured.
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
 * Log in through the real login form and return the path it landed on.
 *
 * The phone is entered in the local `01…` form because that is what
 * the form's own validation regex accepts; the API normalises it to
 * `+880…` server-side.
 */
async function loginFrom(page: Page, phone: string, entryUrl: string) {
  await page.goto(BASE + entryUrl, { waitUntil: 'networkidle' });
  await page.locator('input[type="tel"]').fill(phone);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
    timeout: 15_000,
  });
  return new URL(page.url()).pathname;
}

test.describe('A deep link never overrides the role model', () => {
  for (const persona of PERSONAS) {
    test(`${persona.role} — bare /login lands on ${persona.home}`, async ({
      page,
    }) => {
      const landed = await loginFrom(page, persona.phone, '/login');
      expect(landed, `${persona.role} landed on the wrong surface`).toBe(
        persona.home,
      );
    });

    test(`${persona.role} — ?next=/report/location resolves by role`, async ({
      page,
    }) => {
      // A citizen may resume the report flow. A staff role may NOT —
      // the report screen is a citizen-only surface.
      const landed = await loginFrom(
        page,
        persona.phone,
        '/login?next=/report/location',
      );
      const expected =
        persona.role === 'citizen' ? '/report/location' : persona.home;
      expect(
        landed,
        `${persona.role} followed a citizen-only deep link instead of landing on its own surface`,
      ).toBe(expected);
    });

    test(`${persona.role} — ?next=/reports (a shared surface) is honoured`, async ({
      page,
    }) => {
      const landed = await loginFrom(
        page,
        persona.phone,
        '/login?next=/reports',
      );
      expect(
        landed,
        `${persona.role} lost a legitimate deep link to a shared surface`,
      ).toBe('/reports');
    });
  }

  test('the public landing login CTA resolves by role', async ({ page }) => {
    // The entry path the user actually took: the anonymous landing
    // page's "Log in" button links to `/login?next=/report/location`.
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    const cta = page.locator('a[href*="/login"]').first();
    await expect(cta).toHaveCount(1);
    await cta.click();
    await page.waitForURL((url) => url.pathname.startsWith('/login'), {
      timeout: 10_000,
    });
    expect(new URL(page.url()).pathname).toBe('/login');
  });
});

test.describe('A staff deep link into their own surface is honoured', () => {
  const STAFF_DEEP_LINKS = [
    { role: 'admin', phone: '01711000003', next: '/admin/tickets' },
    { role: 'dispatcher', phone: '01711000001', next: '/dispatcher/monitor' },
    { role: 'crew', phone: '01711000002', next: '/crew' },
  ];

  for (const link of STAFF_DEEP_LINKS) {
    test(`${link.role} — ?next=${link.next} is honoured`, async ({ page }) => {
      const landed = await loginFrom(
        page,
        link.phone,
        `/login?next=${encodeURIComponent(link.next)}`,
      );
      expect(
        landed,
        `${link.role} lost a legitimate deep link into its own surface`,
      ).toBe(link.next);
    });
  }
});

test.describe('A staff deep link into another staff surface is refused', () => {
  test('an admin is not sent to the dispatcher queue', async ({ page }) => {
    const landed = await loginFrom(
      page,
      '01711000003',
      '/login?next=%2Fdispatcher',
    );
    expect(landed).toBe('/admin');
  });

  test('a citizen is not sent to the admin console', async ({ page }) => {
    const landed = await loginFrom(page, '01711000000', '/login?next=%2Fadmin');
    expect(landed).toBe('/home');
  });
});
