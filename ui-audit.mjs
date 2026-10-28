/**
 * UI audit harness — walks every user flow, screenshots each screen.
 *
 * Usage:
 *   node ui-audit.mjs <role> [viewport]
 *   node ui-audit.mjs citizen mobile
 *
 * Logs in via the dev-store persona endpoint, then visits every page
 * for that role, saving a full-page screenshot into ui-audit-shots/.
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:3000';
const OUT = 'ui-audit-shots';
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 1024, height: 768 },
  desktop: { width: 1440, height: 900 },
};

const role = process.argv[2] || 'citizen';
const vpName = process.argv[3] || 'desktop';
const viewport = VIEWPORTS[vpName] || VIEWPORTS.desktop;

// Pages per role. "anon" pages are visited before login.
const ANON_PAGES = [
  ['splash', '/splash'],
  ['login', '/login'],
  ['register', '/register'],
  ['verify-otp', '/verify-otp'],
  ['root', '/'],
];

const PAGES = {
  citizen: [
    ['home', '/home'],
    ['report-category', '/report/category'],
    ['report-location', '/report/location'],
    ['report-photo', '/report/photo'],
    ['report-note', '/report/note'],
    ['report-summary', '/report/summary'],
    ['reports-list', '/reports'],
    ['reports-detail', '/reports/ticket_seed_routed_1'],
    ['report-submitted', '/report/ticket_seed_routed_1/submitted'],
    ['feed', '/feed'],
  ],
  dispatcher: [
    ['dispatcher-queue', '/dispatcher'],
    ['dispatcher-map', '/dispatcher/map'],
    ['dispatcher-monitor', '/dispatcher/monitor'],
    ['dispatcher-dedup', '/dispatcher/dedup'],
    ['dispatcher-performance', '/dispatcher/performance'],
    ['dispatcher-ticket', '/dispatcher/tickets/ticket_seed_routed_1'],
  ],
  crew: [
    ['crew-home', '/crew'],
    ['crew-ticket', '/crew/tickets/ticket_seed_routed_1'],
  ],
  admin: [
    ['admin-cities', '/admin/cities'],
    ['admin-audit', '/admin/audit'],
    ['admin-tickets', '/admin/tickets'],
    ['admin-ticket-detail', '/admin/tickets/ticket_seed_routed_1'],
    ['admin-city-users', '/admin/cities/city_dhaka_north/users'],
    ['admin-city-wards', '/admin/cities/city_dhaka_north/wards'],
    ['admin-city-taxonomy', '/admin/cities/city_dhaka_north/taxonomy'],
    ['admin-city-setup', '/admin/cities/city_dhaka_north/setup'],
    ['admin-city-adoption', '/admin/cities/city_dhaka_north/adoption'],
  ],
};

const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
const page = await ctx.newPage();

page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(`[${page.url()}] ${m.text()}`);
});
page.on('pageerror', (e) => pageErrors.push(`[${page.url()}] ${e.message}`));
page.on('requestfailed', (r) => {
  const u = r.url();
  if (!u.includes('_next/static') && !u.includes('favicon')) {
    failedRequests.push(`[${page.url()}] ${u} — ${r.failure()?.errorText}`);
  }
});
page.on('response', (r) => {
  if (r.status() >= 400 && !r.url().includes('_next/static')) {
    failedRequests.push(`[${page.url()}] ${r.status()} ${r.url()}`);
  }
});

async function go(path) {
  // `networkidle` never settles on map pages (tile requests stay open),
  // so wait for DOM + a fixed settle window instead.
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 45000 });
  // Data-driven pages (queue, performance, monitor) fetch their
  // payload after mount. A flat 1.5s was too short on a cold dev
  // server and captured the loading skeleton instead of the data —
  // which is how a real page defect can hide behind a spinner.
  // Wait for the XHR to settle, then a short paint buffer.
  await page
    .waitForLoadState('networkidle', { timeout: 8000 })
    .catch(() => undefined);
  await page.waitForTimeout(1200);
}

async function shot(name) {
  const file = `${OUT}/${role}-${vpName}-${name}.png`;
  await page.screenshot({ path: file, fullPage: true });
  const title = await page.title();
  const h1 = await page
    .locator('h1, h2')
    .first()
    .textContent()
    .catch(() => null);
  console.log(`SHOT ${file} | title="${title}" | h1="${(h1 || '').trim().slice(0, 60)}"`);
}

/**
 * Dump the visible text of a page (or a testid-scoped region) so the
 * audit can assert on COPY — hardcoded English, raw ids, blank
 * labels — without eyeballing a screenshot.
 */
async function dumpText(path, selector) {
  await go(path);
  const text = await page
    .locator(selector)
    .first()
    .innerText()
    .catch(() => null);
  console.log(`\n--- TEXT ${path} ${selector} ---`);
  console.log(text ?? '(not found)');
}

// ── Anonymous pages ────────────────────────────────────────────────
for (const [name, path] of ANON_PAGES) {
  await go(path);
  await shot(name);
}

// ── Login as the role ──────────────────────────────────────────────
await go('/dev/login');
await page.evaluate(async (r) => {
  const res = await fetch('/api/dev/login?role=' + r, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return res.status;
}, role);
await page.waitForTimeout(500);

// ── Seed a report draft ────────────────────────────────────────────
// The report flow's later steps (note, summary) redirect to
// /report/location without a draft in sessionStorage. Seed one so
// the audit can actually reach (and screenshot) those steps.
// /report/summary is the dedup-DECLINE screen — it additionally
// requires the dedup context the location step would have written.
await page.evaluate(() => {
  window.sessionStorage.setItem(
    'cityfix.reportDraft.v1',
    JSON.stringify({
      cityId: 'city_dhaka_north',
      wardId: 'ward_14',
      locationLat: 23.8042,
      locationLng: 90.4151,
      locationLabel: 'Mirpur, Dhaka',
      locationLabelBn: 'মিরপুর, ঢাকা',
      categoryId: 'cat_streetlight',
      photoUrls: [],
      note: 'রাস্তার আলো ৩ দিন ধরে বন্ধ আছে।',
      step: 'summary',
    }),
  );
  window.sessionStorage.setItem(
    'cityfix.reportDedup.v1',
    JSON.stringify({
      existingTicketId: 'ticket_seed_routed_1',
      distanceMeters: 12,
      existingStatus: 'routed',
    }),
  );
});

// ── Role pages ─────────────────────────────────────────────────────
for (const [name, path] of PAGES[role] || []) {
  await go(path);
  await shot(name);
}

// ── Report findings ────────────────────────────────────────────────
if (process.env.AUDIT_TEXT) {
  // `AUDIT_TEXT="path::selector,path::selector"` — dump copy for
  // assertion instead of eyeballing pixels.
  for (const spec of process.env.AUDIT_TEXT.split(',')) {
    const [p, sel] = spec.split('::');
    if (p && sel) await dumpText(p, sel);
  }
}

console.log('\n===== CONSOLE ERRORS =====');
console.log(consoleErrors.length ? consoleErrors.join('\n') : '(none)');
console.log('===== PAGE ERRORS =====');
console.log(pageErrors.length ? pageErrors.join('\n') : '(none)');
console.log('===== FAILED REQUESTS =====');
console.log(failedRequests.length ? failedRequests.join('\n') : '(none)');

await browser.close();
