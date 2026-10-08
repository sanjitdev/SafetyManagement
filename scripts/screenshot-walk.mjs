// Quick screenshot walk of the citizen report flow.
// Usage: node scripts/screenshot-walk.mjs
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const OUT = './tests-mockups/walkthrough';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const consoleLogs = [];
page.on('console', (msg) => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));

async function shot(name) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800); // give client-side fetches time to settle
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  console.log(`saved ${name}.png`);
}

console.log('--- 1. Home (dev landing) ---');
await page.goto('http://localhost:3000/');
await shot('01-home-dev');

console.log('--- 2. Sign in as Rahim (form post) ---');
await Promise.all([
  page.waitForNavigation({ waitUntil: 'networkidle' }),
  page.click('button[type=submit]'),
]);
await shot('02-after-login');

console.log('--- 3. /report/location (1.7) ---');
await page.goto('http://localhost:3000/report/location');
await shot('03-location');

console.log('--- 4. /report/photo (1.8) ---');
await page.goto('http://localhost:3000/report/photo');
await shot('04-photo');

console.log('--- 5. /report/category (1.9) ---');
await page.goto('http://localhost:3000/report/category');
await shot('05-category');

console.log('--- 6. /report/note (1.10) ---');
await page.goto('http://localhost:3000/report/note');
await shot('06-note');

console.log('--- 7. /report/summary (1.10b) without dedup ctx (will redirect) ---');
await page.goto('http://localhost:3000/report/summary');
await page.waitForTimeout(500);
await shot('07-summary-no-ctx');

console.log('--- 8. /reports/:id (1.12) my-reports detail ---');
// The dev store persists across requests in the same process, so a previous
// walk may have already created a ticket at these coordinates. Use a
// slightly different lat (≈55m further north) to avoid the dedup-match
// path, which returns existing_ticket_id instead of a fresh ticket.
const apiRes = await page.request.post('http://localhost:3000/api/tickets', {
  data: {
    cityId: 'city_dhaka_north',
    wardId: 'ward_14',
    categoryId: 'cat_streetlight',
    locationLat: 23.7895, // ~55m north of prior
    locationLng: 90.4075,
    note: 'Light out near pole 14B',
    photoUrls: [],
  },
});
console.log('create status', apiRes.status());
const body = await apiRes.json();
console.log('create body', JSON.stringify(body).slice(0, 200));
const tktId = body.ticket?.id ?? body.existing_ticket_id;
if (!tktId) {
  throw new Error('ticket creation failed: ' + JSON.stringify(body));
}
console.log(`using ${tktId} for detail screenshot (dedup_match=${body.dedup_match ?? false})`);

// Sanity-check the GET so we can see if 404 vs 403 is the issue.
const getProbe = await page.request.get(`http://localhost:3000/api/tickets/${tktId}`);
console.log('GET status', getProbe.status(), 'body', (await getProbe.text()).slice(0, 200));

await page.goto(`http://localhost:3000/reports/${tktId}`);
await page.waitForTimeout(3000);
const probeInPage = await page.evaluate(async (id) => {
  // 1) Verify the API still works
  const r = await fetch(`/api/tickets/${id}`, { credentials: 'include' });
  const apiText = await r.text();
  // 2) Look at every link/h1/p to see what the page actually rendered
  const rendered = {
    h1: [...document.querySelectorAll('h1')].map((h) => h.textContent),
    pills: [...document.querySelectorAll('[class*="pill"]')].map((p) => p.textContent).slice(0, 5),
    status: r.status,
    apiOk: apiText.startsWith('{"ticket"'),
  };
  return rendered;
}, tktId);
console.log('PAGE RENDER:', JSON.stringify(probeInPage, null, 2));
console.log('CONSOLE LOGS (last 20):', consoleLogs.slice(-20).join('\n  '));
await shot(`08-detail-${tktId}`);

console.log('--- 9. /report/:id/submitted (1.11) ---');
await page.goto(`http://localhost:3000/report/${tktId}/submitted`);
await shot(`09-submitted-${tktId}`);

await browser.close();
console.log(`\nDone — screenshots in ${OUT}/`);