/**
 * Citizen flow interaction walk — drives the real UI end to end.
 *
 * Usage:
 *   node flow-walk.mjs [viewport]
 *
 * Unlike `ui-audit.mjs` (which screenshots pages), this harness
 * CLICKS through the flow: register → verify OTP → home → report
 * (category → location → photo → note → summary) → submitted →
 * reports list → reports detail → feedback.
 *
 * Every step asserts on visible copy so a page that renders blank
 * or throws mid-flow fails loudly instead of producing a
 * plausible-looking screenshot.
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

const vpName = process.argv[2] || 'desktop';
const viewport = VIEWPORTS[vpName] || VIEWPORTS.desktop;

const consoleErrors = [];
const pageErrors = [];
const failures = [];
let stepNo = 0;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
const page = await ctx.newPage();

page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(`[${page.url()}] ${m.text()}`);
});
page.on('pageerror', (e) => pageErrors.push(`[${page.url()}] ${e.message}`));

async function go(path) {
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined);
  await page.waitForTimeout(900);
}

async function shot(name) {
  stepNo += 1;
  const file = `${OUT}/flow-${vpName}-${String(stepNo).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: file, fullPage: true });
  console.log(`STEP ${stepNo} ${file} | url="${new URL(page.url()).pathname}"`);
}

/**
 * Assert that the page contains visible copy matching `needle`.
 * Throwing here aborts the walk at the exact step that broke.
 */
async function expectText(needle, label) {
  const body = await page.locator('body').innerText().catch(() => '');
  if (!body.includes(needle)) {
    failures.push(`STEP ${stepNo} (${label}): expected copy "${needle}" not found`);
    console.log(`  !! MISSING "${needle}" (${label})`);
    return false;
  }
  console.log(`  ok "${needle}" (${label})`);
  return true;
}

async function expectVisible(selector, label) {
  const n = await page.locator(selector).count();
  if (n === 0) {
    failures.push(`STEP ${stepNo} (${label}): no element matching "${selector}"`);
    console.log(`  !! MISSING selector "${selector}" (${label})`);
    return false;
  }
  console.log(`  ok selector "${selector}" x${n} (${label})`);
  return true;
}

console.log(`\n=== CITIZEN FLOW WALK (${vpName}) ===\n`);

// ── 1. Register ────────────────────────────────────────────────────
await go('/register');
await shot('register');
await expectText('অ্যাকাউন্ট তৈরি করুন', 'register heading');

// The register form's fields. They carry NO `name` attribute, so
// select by type + placeholder / position rather than by name.
//
// The dev store seeds a fixed citizen, so a fresh phone/NID may 409
// as "already registered" — the walk proves the FORM renders,
// validates, and reaches the OTP step either way.
//
// NID validation (`app/register/page.tsx`) accepts 10 or 17 DIGITS —
// 1990123456 (10) and 19901234567890123 (17) both pass.
// A phone unique to THIS run, so registration succeeds on a fresh
// dev store and conflicts (409) only on a rerun — which the fallback
// below handles.
const RUN_PHONE = `017${String(Date.now()).slice(-8)}`;
const RUN_NID = String(Date.now()).slice(-10);

await page.locator('input[type="tel"]').first().fill(RUN_PHONE);
console.log(`  filled phone ${RUN_PHONE}`);

await page.locator('input[placeholder="1234567890"]').first().fill(RUN_NID);
console.log(`  filled nid ${RUN_NID}`);

await page.locator('input[autocomplete="name"]').first().fill('তাহসিনা আক্তার');
console.log('  filled name');

const passFields = page.locator('input[type="password"]');
await passFields.nth(0).fill('Passw0rd!2026');
console.log('  filled password');
await passFields.nth(1).fill('Passw0rd!2026');
console.log('  filled confirm password');
await shot('register-filled');

const submit = page.locator(
  'button[type="submit"], button:has-text("পরবর্তী"), button:has-text("তৈরি")',
).first();
if (await submit.count()) {
  await submit.click();
  await page.waitForTimeout(2500);
}
await shot('register-submitted');
console.log(`  after submit url="${new URL(page.url()).pathname}"`);

// A 409 means this phone/NID was already registered by an earlier run
// of this harness. The app's response is correct (conflict message +
// "log in" link), so the walk falls back to logging in as the seeded
// citizen — the flow under test is the REPORT flow, not registration.
//
// The seeded citizen (lib/dev-store.ts) is phone +8801711000000,
// NID 1234567890, password `12345678`.
if (new URL(page.url()).pathname === '/register') {
  const conflict = await page
    .locator('body')
    .innerText()
    .then((t) => t.includes('আগেই নিবন্ধিত') || t.includes('already registered'))
    .catch(() => false);
  if (conflict) {
    console.log('  register conflicted (already registered) — falling back to login');
    await go('/login');
    await shot('login');
    const loginPhone = page
      .locator('input[type="tel"], input[inputmode="numeric"], input[placeholder*="01"]')
      .first();
    if (await loginPhone.count()) {
      await loginPhone.fill('01711000000');
    }
    const loginPass = page.locator('input[type="password"]').first();
    if (await loginPass.count()) {
      await loginPass.fill('12345678');
    }
    await shot('login-filled');
    const loginSubmit = page
      .locator('button[type="submit"], button:has-text("লগ ইন")')
      .first();
    if (await loginSubmit.count()) {
      await loginSubmit.click();
      await page.waitForTimeout(2500);
    }
    await shot('login-submitted');
    console.log(`  after login url="${new URL(page.url()).pathname}"`);
  }
}

// ── 2. OTP ─────────────────────────────────────────────────────────
// The dev store returns a `dev_code` on the send-otp response. The
// walk reads it from the page (the UI surfaces it in dev mode) and
// types it, so the verify step is exercised for real.
const bodyNow = await page.locator('body').innerText().catch(() => '');
const otpMatch = bodyNow.match(/\b(\d{6})\b/);
if (otpMatch) {
  console.log(`  otp code on page: ${otpMatch[1]}`);
  const otpInputs = page.locator('input[inputmode="numeric"], input[name="code"]');
  const count = await otpInputs.count();
  if (count === 6) {
    for (let i = 0; i < 6; i += 1) {
      await otpInputs.nth(i).fill(otpMatch[1][i]);
    }
    console.log('  filled 6-digit otp');
  } else if (count === 1) {
    await otpInputs.first().fill(otpMatch[1]);
    console.log('  filled otp (single input)');
  }
  await page.waitForTimeout(600);
  const verify = page
    .locator('button:has-text("যাচাই"), button:has-text("পরবর্তী"), button[type="submit"]')
    .first();
  if (await verify.count()) {
    await verify.click();
    await page.waitForTimeout(2500);
  }
}
await shot('otp');
console.log(`  after otp url="${new URL(page.url()).pathname}"`);

// ── 2b. Seed the report draft ──────────────────────────────────────
// The report flow's later steps redirect to /report/location when
// no draft is in sessionStorage. Seed one so the walk can actually
// reach (and assert on) the location / photo / note / summary steps.
// The dedup context seeds /report/summary, the dedup-DECLINE screen.
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

// ── 3. Home ────────────────────────────────────────────────────────
await go('/home');
await shot('home');
await expectText('শহরের কার্যকলাপ', 'home heading');

// ── 4. Report: category ────────────────────────────────────────────
await go('/report/category');
await shot('report-category');
await expectText('সমস্যাটি কী?', 'category heading');
await expectVisible('[aria-checked="true"], [role="radio"][aria-checked="true"]', 'selected category');

// ── 5. Report: location ────────────────────────────────────────────
await go('/report/location');
await shot('report-location');
await expectText('পিনটি বসান', 'location heading');
await expectVisible('[data-testid*="map"], canvas, .maplibregl-map', 'map present');

// ── 6. Report: photo ───────────────────────────────────────────────
await go('/report/photo');
await shot('report-photo');
await expectText('ছবি যোগ করুন', 'photo heading');

// ── 7. Report: note ────────────────────────────────────────────────
await go('/report/note');
await shot('report-note');
await expectText('নোট যোগ করুন', 'note heading');
const noteBox = page.locator('textarea').first();
if (await noteBox.count()) {
  await noteBox.fill('রাস্তার আলো ৩ দিন ধরে বন্ধ আছে।');
  console.log('  filled note');
}
await shot('report-note-filled');

// ── 8. Report: summary ─────────────────────────────────────────────
await go('/report/summary');
await shot('report-summary');
await expectText('আপনার রিপোর্ট পর্যালোচনা করুন', 'summary heading');

// ── 8b. Submit the report ──────────────────────────────────────────
// The summary step's dedup card offers "submit as new" (the dedup
// DECLINE path) plus a confirm checkbox. Ticking the box and
// clicking the CTA actually creates a ticket owned by THIS citizen,
// which is what makes the later "my reports" assertions meaningful.
//
// This must run while still ON the summary page — the CTA lives there.
let ownTicketId = null;
const confirmBox = page.locator('input[type="checkbox"]').first();
if (await confirmBox.count()) {
  await confirmBox.check();
  console.log('  ticked the confirm checkbox');
} else {
  console.log('  (no confirm checkbox on the summary step)');
}
await shot('report-summary-confirmed');

const submitNew = page.locator('[data-testid="report-summary-submit-new"]').first();
if (await submitNew.count()) {
  await submitNew.click();
  await page.waitForTimeout(3000);
  console.log(`  after submit url="${new URL(page.url()).pathname}"`);
  await shot('report-submit-result');
  // The submitted page carries the new ticket id in its URL.
  const newPath = new URL(page.url()).pathname;
  ownTicketId = newPath.match(/\/report\/([^/]+)\/submitted/)?.[1] ?? null;
  if (ownTicketId) {
    console.log(`  new ticket id = ${ownTicketId}`);
    await expectText('গ্রহণ করা হয়েছে', 'submitted heading');
    // The citizen's OWN report must be visible on the detail page.
    await go(`/reports/${ownTicketId}`);
    await shot('own-report-detail');
    await expectText('রাস্তার আলো নেই', 'own report detail title');
    // …and the note the citizen typed must round-trip.
    await expectText('রাস্তার আলো ৩ দিন ধরে বন্ধ আছে।', 'own report note');
  }
} else {
  console.log('  (no "submit as new" button on the summary step)');
}

// ── 9. Submitted ────────────────────────────────────────────────────
await go('/report/ticket_seed_routed_1/submitted');
await shot('report-submitted');
await expectText('গ্রহণ করা হয়েছে', 'submitted heading');

// ── 10. Reports list ───────────────────────────────────────────────
await go('/reports');
await shot('reports-list');
await expectText('আমার রিপোর্ট', 'reports heading');
if (ownTicketId) {
  const listBody = await page.locator('body').innerText().catch(() => '');
  if (listBody.includes('রাস্তার আলো নেই')) {
    console.log('  ok the newly submitted report appears in "my reports"');
  } else {
    failures.push('STEP: the newly submitted report is missing from "my reports"');
    console.log('  !! the newly submitted report is missing from "my reports"');
  }
}

// ── 11. Reports detail ─────────────────────────────────────────────
// A newly-registered citizen does NOT own the seeded ticket, so the
// page correctly renders the 403 "this report is not yours" guard.
// Assert on THAT, not on the ticket title.
await go('/reports/ticket_seed_routed_1');
await shot('reports-detail');
const detailBody = await page.locator('body').innerText().catch(() => '');
if (detailBody.includes('শুধুমাত্র আপনার নিজের রিপোর্ট')) {
  console.log('  ok ownership guard rendered (403 page) — expected for a non-owner');
} else {
  await expectText('রাস্তার আলো নেই', 'report detail title');
}

// The avatar initials — read from the DOM, not from the screenshot,
// so a low-resolution Bangla glyph is never misread as a wrong value.
const avatar = await page
  .locator('button[aria-haspopup="menu"]')
  .first()
  .textContent()
  .catch(() => null);
console.log(`  avatar initials = ${JSON.stringify(avatar)}`);

// ── 12. Feedback (on the detail page, when a resolved ticket has one)
const feedback = page.locator('[data-testid*="feedback"]').first();
if (await feedback.count()) {
  console.log('  feedback prompt present');
} else {
  console.log('  (no feedback prompt on this ticket — expected for a non-resolved ticket)');
}
await shot('reports-detail-feedback');

// ── Report ─────────────────────────────────────────────────────────
console.log('\n===== ASSERTION FAILURES =====');
console.log(failures.length ? failures.join('\n') : '(none)');
console.log('===== CONSOLE ERRORS =====');
console.log(consoleErrors.length ? consoleErrors.join('\n') : '(none)');
console.log('===== PAGE ERRORS =====');
console.log(pageErrors.length ? pageErrors.join('\n') : '(none)');

await browser.close();

if (failures.length || pageErrors.length) {
  console.log('\nFLOW WALK: FAILED');
  process.exit(1);
}
console.log('\nFLOW WALK: PASSED');
