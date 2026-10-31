/**
 * Capture presentation screenshots of the most important CityFix pages.
 *
 * Writes PNGs to `presentation/screenshots/`. Every staff page is
 * captured AUTHENTICATED as its real persona, so the screenshots show
 * the real console with real seeded data — not an empty shell.
 *
 * The login helper waits for `window.next.router` before filling the
 * form. That is load-bearing: the login inputs are controlled React
 * inputs, and a `fill()` before hydration never reaches React state,
 * so the submit button stays disabled and no request is made.
 */

import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:3000';
const OUT = 'presentation/screenshots';
mkdirSync(OUT, { recursive: true });

const PASSWORD = '12345678';
const PERSONAS = {
  citizen: '01711000000',
  dispatcher: '01711000001',
  crew: '01711000002',
  admin: '01711000003',
};

const VIEWPORT = { width: 1440, height: 900 };

const browser = await chromium.launch();

/** Log in as `phone` and return the page, ready for capture. */
async function signedIn(phone) {
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const page = await ctx.newPage();
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  const submit = page.locator('button[type="submit"]');
  await submit.waitFor({ state: 'visible' });
  await page.waitForFunction(() => !!(window.next && window.next.router), undefined, {
    timeout: 20000,
  });
  await page.locator('input[type="tel"]').fill(phone);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await submit.click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 });
  return { ctx, page };
}

/** Wait for the page to settle, then shoot. */
async function shoot(page, name) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  captured ${name}.png  (${page.url().replace(BASE, '')})`);
}

// ---------------------------------------------------------------- anonymous
console.log('anonymous:');
{
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const page = await ctx.newPage();

  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await shoot(page, '01-public-landing');

  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await shoot(page, '02-login');

  await page.goto(BASE + '/splash', { waitUntil: 'domcontentloaded' });
  await shoot(page, '03-splash');

  await ctx.close();
}

// ------------------------------------------------------------------ citizen
console.log('citizen:');
{
  const { ctx, page } = await signedIn(PERSONAS.citizen);

  await page.goto(BASE + '/home', { waitUntil: 'domcontentloaded' });
  await shoot(page, '04-citizen-home');

  await page.goto(BASE + '/reports', { waitUntil: 'domcontentloaded' });
  await shoot(page, '05-citizen-my-reports');

  await page.goto(BASE + '/report/location', { waitUntil: 'domcontentloaded' });
  await shoot(page, '06-citizen-report-location');

  await page.goto(BASE + '/feed', { waitUntil: 'domcontentloaded' });
  await shoot(page, '07-city-activity-feed');

  await ctx.close();
}

// --------------------------------------------------------------- dispatcher
console.log('dispatcher:');
{
  const { ctx, page } = await signedIn(PERSONAS.dispatcher);

  await page.goto(BASE + '/dispatcher', { waitUntil: 'domcontentloaded' });
  await shoot(page, '08-dispatcher-triage-queue');

  await page.goto(BASE + '/dispatcher/monitor', { waitUntil: 'domcontentloaded' });
  await shoot(page, '09-dispatcher-monitor');

  await ctx.close();
}

// --------------------------------------------------------------------- crew
console.log('crew:');
{
  const { ctx, page } = await signedIn(PERSONAS.crew);

  await page.goto(BASE + '/crew', { waitUntil: 'domcontentloaded' });
  await shoot(page, '10-crew-assignments');

  // The crew list is deliberately sparse: the API returns only
  // `routed | in_progress`, so Rashid's one still-open assignment is the
  // only row. The denser surface is the ticket DETAIL page, which shows
  // the status trail, photo upload and resolve action — captured
  // separately by capture-crew-detail.mjs.
  //
  // The real tabs are "সব" / "শুধু রাউট" / "চলমান"; there is no
  // "সমাপ্ত" tab, so do not look for one here.

  await ctx.close();
}

// -------------------------------------------------------------------- admin
console.log('admin:');
{
  const { ctx, page } = await signedIn(PERSONAS.admin);

  await page.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' });
  await shoot(page, '11-admin-console');

  await page.goto(BASE + '/admin/tickets', { waitUntil: 'domcontentloaded' });
  await shoot(page, '12-admin-tickets');

  await page.goto(BASE + '/admin/cities', { waitUntil: 'domcontentloaded' });
  await shoot(page, '13-admin-cities');

  await page.goto(BASE + '/admin/audit', { waitUntil: 'domcontentloaded' });
  await shoot(page, '14-admin-audit');

  await ctx.close();
}

// -------------------------------------------------------------- dark theme
console.log('dark theme:');
{
  const { ctx, page } = await signedIn(PERSONAS.admin);

  // The theme toggle persists the choice in localStorage under
  // 'cityfix.preferred_appearance.v1' — set it before the app boots.
  await ctx.addInitScript(() => {
    window.localStorage.setItem('cityfix.preferred_appearance.v1', 'dark');
  });
  await page.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  // Force the class in case the boot script read the key before we set it.
  await page.evaluate(() => {
    document.documentElement.classList.remove('theme-light', 'theme-system');
    document.documentElement.classList.add('theme-dark');
  });
  await shoot(page, '15-admin-dark-theme');

  await ctx.close();
}

await browser.close();
console.log('\ndone →', OUT);
