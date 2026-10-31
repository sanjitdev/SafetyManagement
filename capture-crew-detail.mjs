/**
 * Capture the crew ticket DETAIL page.
 *
 * The crew LIST is correctly sparse: the API returns only `routed |
 * in_progress`, and Rashid has exactly one such ticket (the other 13
 * assignments he completed are terminal and deliberately excluded).
 * The list page therefore shows one row on an otherwise empty page.
 *
 * The DETAIL page is the richer artifact — it shows the ticket, its
 * status trail, the photo upload and the resolve action. That is the
 * surface worth putting in front of an audience.
 */

import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3000';
const OUT = 'presentation/screenshots';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!(window.next && window.next.router), undefined, {
  timeout: 20000,
});
await page.locator('input[type="tel"]').fill('01711000002');
await page.locator('input[type="password"]').fill('12345678');
await page.locator('button[type="submit"]').click();
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 });

await page.goto(BASE + '/crew', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

// Click the ticket row's title link to reach the detail surface.
const link = page.locator('a[href*="/crew/"]').first();
if (await link.count()) {
  await link.click();
  await page.waitForLoadState('domcontentloaded');
  // The detail surface fetches the ticket client-side; wait for the
  // loading placeholder to actually go away, not just for a fixed delay.
  await page
    .waitForFunction(
      () => !document.body.innerText.includes('টিকিট লোড হচ্ছে'),
      undefined,
      { timeout: 20000 },
    )
    .catch(() => console.log('  (loading placeholder still present)'));
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/10b-crew-ticket-detail.png` });
  console.log('captured 10b-crew-ticket-detail.png  (' + page.url().replace(BASE, '') + ')');
} else {
  console.log('no crew ticket link found');
}

await ctx.close();
await browser.close();
