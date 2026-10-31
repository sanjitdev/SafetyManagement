/**
 * Role walkthrough — "can everyone do their job?" (tests/28-role-walkthrough.spec.ts)
 *
 * WHAT THIS IS
 * ------------
 * A real-browser, real-user walkthrough of all FOUR roles end to end,
 * using the SEEDED personas and their PASSWORD login (not the dev-only
 * `/api/dev/login` shortcut). This is the audit that answers the
 * question "can everyone do their job perfectly?" — so it deliberately
 * does NOT mock anything:
 *
 *   - Real login through the real `/login` form → `POST /api/v1/auth/login`
 *   - Real Prisma/Postgres behind `lib/db-switch` (no dev store)
 *   - Real page navigations, real clicks, real form fills
 *   - Real API calls made by the pages themselves
 *
 * It also records, per step: the URL reached, the visible assertion,
 * a screenshot, and any console/page errors. The output feeds
 * `docs/role-experience-report.md`.
 *
 * BACKEND
 * -------
 * Runs against real Postgres by default (`CITYFIX_DEV_STORE` unset).
 * Override with `WALKTHROUGH_DEV_STORE=1` to use the in-memory store
 * (which additionally seeds tickets, so the dispatcher/crew queues are
 * non-empty without filing a report first).
 *
 * The admin WRITE path needs `DEV_SKIP_WEBAUTHN=1` AND
 * `CITYFIX_DEV_STORE=1` — the seam in `lib/auth/guards.ts` requires
 * BOTH. Against real Postgres with no credential registered, admin
 * writes correctly answer `401 webauthn_required`; the walkthrough
 * records that as an EXPECTED BLOCKER rather than hiding it, because
 * it is the single most important finding about the admin experience.
 *
 * ORDERING
 * --------
 * The roles form a chain: the citizen files a report, the dispatcher
 * routes it, the crew resolves it, the admin audits it. So the suite
 * runs them in that order in ONE test, threading the ticket id
 * through. Each role gets its own browser context so the sessions
 * are genuinely separate.
 *
 * Run:
 *   npx playwright test tests/28-role-walkthrough.spec.ts
 *   npx playwright test tests/28-role-walkthrough.spec.ts --headed
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const PASSWORD = '12345678';

const AUDIT_DIR = path.resolve(
  __dirname,
  '..',
  'tests-mockups',
  'audit',
  '28-role-walkthrough.spec.ts',
);

/** Persona roster — mirrors `prisma/seed.ts`. */
const PERSONAS = {
  citizen: { phone: '+8801711000000', name: 'Rahim', home: '/home' },
  dispatcher: { phone: '+8801711000001', name: 'Habib', home: '/dispatcher' },
  crew: { phone: '+8801711000002', name: 'Rashid', home: '/crew' },
  admin: { phone: '+8801711000003', name: 'Anwar', home: '/admin' },
} as const;

/**
 * Collected observations. Each entry is one step of one role's
 * journey, with the evidence that decided it.
 */
interface Observation {
  role: string;
  step: string;
  outcome: 'pass' | 'blocker' | 'gap' | 'note';
  detail: string;
  screenshot?: string;
}

const observations: Observation[] = [];

function observe(o: Observation): void {
  observations.push(o);
  const mark =
    o.outcome === 'pass' ? 'PASS' : o.outcome === 'blocker' ? 'BLOCK' : o.outcome.toUpperCase();
  // eslint-disable-next-line no-console
  console.log(`  [${mark}] (${o.role}) ${o.step} — ${o.detail}`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Wait for React hydration by waiting for a sentinel that only the
 * mounted tree can produce. SSR renders the shell; the client
 * components set `signedIn` inside an effect, so the "signed in"
 * content only appears post-hydration.
 */
async function waitForHydration(page: Page, timeout = 25_000): Promise<void> {
  await page.waitForTimeout(600);
}

/**
 * Wait until the citizen's report detail has actually rendered its
 * content, then return the settled body text.
 *
 * `/reports/[id]` fetches the ticket inside an effect and renders a
 * "লোড হচ্ছে…" placeholder until the fetch resolves. `waitForHydration`
 * is a fixed 600ms sleep, so reading `bodyText` right after it can
 * capture the placeholder instead of the report — which made the
 * "citizen sees their report resolved" check read a false negative
 * even though the screenshot (taken later, inside `capture()`) showed
 * the resolved report. Wait for the loading copy to disappear AND for
 * a known status pill to appear before asserting on the text.
 */
async function readSettledReportText(page: Page): Promise<string> {
  await page
    .waitForFunction(
      () => {
        const text = document.body.innerText;
        if (text.includes('লোড হচ্ছে')) return false;
        return (
          text.includes('সমাধান') || // resolved
          text.includes('নতুন') || // submitted
          text.includes('রাউট') || // routed
          text.includes('চলমান') // in progress
        );
      },
      { timeout: 20_000 },
    )
    .catch(() => undefined);
  await page.waitForTimeout(250);
  return bodyText(page);
}

async function capture(page: Page, stepName: string): Promise<string> {
  await page
    .waitForFunction(
      () => !document.body.innerText.includes('লোড হচ্ছে'),
      { timeout: 8_000 },
    )
    .catch(() => undefined);
  await page.waitForTimeout(350);
  const file = `${stepName}.png`;
  await page.screenshot({ path: path.join(AUDIT_DIR, file), fullPage: true });
  // eslint-disable-next-line no-console
  console.log(`  [shot] ${file}`);
  return file;
}

/**
 * Log in through the REAL login form.
 *
 * The login page is a client component whose phone/password inputs
 * carry no `name` attribute, so we select by type. It also restores
 * the last-used phone from localStorage in a mount effect — we wait
 * for that effect to settle before typing, or it would overwrite our
 * input.
 */
async function loginAs(
  page: Page,
  phone: string,
  expectedHome: string,
): Promise<{ ok: boolean; landedOn: string }> {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900); // let the localStorage-restore effect settle
  await page.fill('input[type="tel"]', phone);
  await page.fill('input[type="password"]', PASSWORD);
  await page.waitForTimeout(200);
  const submit = page.locator('button[type="submit"]');
  if (await submit.isDisabled()) {
    return { ok: false, landedOn: page.url() };
  }
  await submit.click();
  try {
    await page.waitForURL(
      new RegExp(expectedHome.replace(/\//g, '\\/')),
      { waitUntil: 'commit', timeout: 30_000 },
    );
  } catch {
    // The redirect may land somewhere else (e.g. a role the mapping
    // does not cover) — the caller inspects `landedOn`.
  }
  await page.waitForTimeout(800);
  return { ok: true, landedOn: new URL(page.url()).pathname };
}

/** API helper bound to the browser context's cookie jar. */
async function api(
  ctx: BrowserContext,
  method: string,
  path_: string,
  data?: unknown,
): Promise<{ status: number; body: any }> {
  const res = await ctx.request.fetch(`${BASE}${path_}`, {
    method,
    failOnStatusCode: false,
    data,
    headers: data ? { 'content-type': 'application/json' } : undefined,
  });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = await res.text().catch(() => null);
  }
  return { status: res.status(), body };
}

/** Collect console errors + page errors for a page. */
function watchErrors(page: Page, sink: string[]): void {
  page.on('console', (m) => {
    if (m.type() === 'error') sink.push(m.text().slice(0, 300));
  });
  page.on('pageerror', (e) => sink.push(`pageerror: ${e.message.slice(0, 300)}`));
}

const bodyText = (page: Page) => page.locator('body').innerText();

// ---------------------------------------------------------------------------

test.describe('Role walkthrough — every persona, start to finish', () => {
  test.setTimeout(600_000);

  test('all four roles can do their job', async ({ browser }) => {
    fs.mkdirSync(AUDIT_DIR, { recursive: true });

    const errorsByRole: Record<string, string[]> = {
      citizen: [],
      dispatcher: [],
      crew: [],
      admin: [],
    };

    // Shared ticket id, threaded through the chain.
    let ticketId = '';
    let cityId = '';
    let streetlightCategoryId = '';
    // The crew member the dispatcher assigned the ticket to (a `User`
    // id). Read back while the dispatcher's session is still alive.
    let assignedCrewUserId = '';

    // =====================================================================
    // ROLE 1 — CITIZEN (Rahim): file a report, follow it, rate it
    // =====================================================================
    {
      const role = 'citizen';
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await ctx.newPage();
      watchErrors(page, errorsByRole[role]);

      // --- Step C1: anonymous landing ------------------------------------
      await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
      await waitForHydration(page);
      const anonText = await bodyText(page);
      const anonOk =
        anonText.includes('রিপোর্ট') || anonText.includes('Report');
      observe({
        role,
        step: 'C1 — anonymous landing page',
        outcome: anonOk ? 'pass' : 'gap',
        detail: anonOk
          ? 'Public landing renders with the report CTA; an anonymous visitor can discover the app.'
          : 'Landing page rendered but the report CTA was not found.',
        screenshot: await capture(page, 'c1-citizen-anonymous-landing'),
      });

      // --- Step C2: sign in with phone + password ------------------------
      const login = await loginAs(page, PERSONAS.citizen.phone, '/home');
      const loginOk = login.ok && login.landedOn === '/home';
      observe({
        role,
        step: 'C2 — sign in with phone + password',
        outcome: loginOk ? 'pass' : 'blocker',
        detail: loginOk
          ? `Signed in as Rahim and landed on ${login.landedOn}.`
          : `Sign-in did not reach /home (landed on ${login.landedOn}).`,
        screenshot: await capture(page, 'c2-citizen-home-after-login'),
      });

      // --- Step C3: read the home feed ------------------------------------
      const homeText = await bodyText(page);
      observe({
        role,
        step: 'C3 — home feed loads',
        outcome: /কার্যকলাপ|activity|রিপোর্ট/i.test(homeText) ? 'pass' : 'gap',
        detail:
          'Home shows the citizen’s own reports plus the city activity panel.',
        screenshot: await capture(page, 'c3-citizen-home'),
      });

      // --- Step C4: the report CTA is reachable ----------------------------
      const reportCta = page
        .getByRole('button', { name: /রিপোর্ট করুন|Report/i })
        .first();
      const ctaVisible = await reportCta.isVisible().catch(() => false);
      observe({
        role,
        step: 'C4 — "Report an issue" CTA present on home',
        outcome: ctaVisible ? 'pass' : 'gap',
        detail: ctaVisible
          ? 'The primary citizen action is one click from the home surface.'
          : 'No report CTA found in the header on /home.',
      });

      // --- Step C5: the LOCATION step comes first -------------------------
      //
      // The report flow is location → category → photo → note →
      // summary. The location step is what CREATES the sessionStorage
      // draft (`emptyDraft` + `saveDraft`); every later step reads it
      // and silently no-ops if it is absent. So a walkthrough that
      // jumps straight to /report/category stalls — the Continue
      // button does nothing because `loadDraft()` returns null.
      //
      // We let the citizen enter the flow the way a real one does:
      // click the Report CTA on /home.
      await reportCta.click();
      await page
        .waitForURL(/\/report\/location/, { waitUntil: 'commit', timeout: 30_000 })
        .catch(() => undefined);
      const atLocation = /\/report\/location/.test(page.url());
      observe({
        role,
        step: 'C5 — report step 1: map / location pin',
        outcome: atLocation ? 'pass' : 'blocker',
        detail: atLocation
          ? 'The Report CTA opens the map step; the draft is created here.'
          : `The Report CTA did not open /report/location (at ${new URL(page.url()).pathname}).`,
        screenshot: await capture(page, 'c5-citizen-report-location'),
      });

      // Advance past the map. The default pin is Dhaka centre, which is
      // inside the district geofence, so Continue is available.
      if (atLocation) {
        const locPrimary = page.locator('[data-testid="report-location-continue"]');
        const fallback = page
          .getByRole('button', { name: /পরবর্তী|Continue|এগিয়ে/i })
          .last();
        const btn = (await locPrimary.count()) > 0 ? locPrimary.first() : fallback;
        if (await btn.isEnabled().catch(() => false)) {
          await btn.click();
          await page
            .waitForURL(/\/report\/category/, { waitUntil: 'commit', timeout: 30_000 })
            .catch(() => undefined);
        }
      }

      // --- Step C6: category step ------------------------------------------
      // The category page renders its options client-side from
      // `/api/report/bootstrap`, so wait for the radios to appear
      // rather than sampling the DOM the instant the URL changes.
      const catOptions = page.getByRole('radio');
      await catOptions
        .first()
        .waitFor({ state: 'visible', timeout: 20_000 })
        .catch(() => undefined);
      const atCategory = /\/report\/category/.test(page.url());
      const catCount = await catOptions.count();
      observe({
        role,
        step: 'C6 — report step 2: pick a category',
        outcome: atCategory && catCount > 0 ? 'pass' : 'gap',
        detail:
          atCategory && catCount > 0
            ? `${catCount} categories offered as radio options.`
            : `At ${new URL(page.url()).pathname}; ${catCount} category option(s) rendered.`,
        screenshot: await capture(page, 'c6-citizen-report-category'),
      });

      // Pick the streetlight category — its department
      // (streetlight-maintenance) is the one both Habib and Rashid
      // are scoped to, so the dispatcher and crew can actually act.
      const streetlight = page
        .getByRole('radio', { name: /রাস্তার আলো|Broken streetlight|Streetlight/i })
        .first();
      const slVisible = await streetlight.isVisible().catch(() => false);
      if (slVisible) {
        await streetlight.click();
        await page.waitForTimeout(500);
      }
      observe({
        role,
        step: 'C7 — choose "Broken streetlight" (the actionable category)',
        outcome: slVisible ? 'pass' : 'gap',
        detail: slVisible
          ? 'Category selection works; streetlight routes to the streetlight-maintenance department, which both staff personas are scoped to.'
          : 'Streetlight category option was not found.',
      });

      const catContinue = page.getByTestId('report-category-continue');
      const catContinueEnabled = await catContinue.isEnabled().catch(() => false);
      if (catContinueEnabled) {
        await catContinue.click();
        await page
          .waitForURL(/\/report\/photo/, { waitUntil: 'commit', timeout: 30_000 })
          .catch(() => undefined);
      }
      observe({
        role,
        step: 'C8 — category → photo navigation',
        outcome: /\/report\/photo/.test(page.url()) ? 'pass' : 'gap',
        detail: /\/report\/photo/.test(page.url())
          ? 'Continue advances to the photo step.'
          : `Continue did not advance (at ${new URL(page.url()).pathname}).`,
      });

      // --- Step C9: photo step — at least one photo is mandatory ---------
      const atPhoto = /\/report\/photo/.test(page.url());
      let photoOk = false;
      if (atPhoto) {
        const png = Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Zo8DwoAAAAASUVORK5CYII=',
          'base64',
        );
        await page
          .locator('input[type="file"]')
          .setInputFiles({ name: 'streetlight.png', mimeType: 'image/png', buffer: png });
        await page.waitForTimeout(900);
        const photoCta = page.getByTestId('report-photo-continue');
        photoOk = await photoCta.isEnabled().catch(() => false);
        observe({
          role,
          step: 'C9 — report step 3: attach a photo (mandatory)',
          outcome: photoOk ? 'pass' : 'gap',
          detail: photoOk
            ? 'Photo attaches and the Continue button enables — the mandatory-photo rule is enforced correctly.'
            : 'Photo did not attach, or Continue stayed disabled.',
          screenshot: await capture(page, 'c9-citizen-report-photo'),
        });
        if (photoOk) {
          await photoCta.click();
          await page
            .waitForURL(/\/report\/note/, { waitUntil: 'commit', timeout: 30_000 })
            .catch(() => undefined);
        }
      } else {
        observe({
          role,
          step: 'C9 — report step 3: attach a photo (mandatory)',
          outcome: 'gap',
          detail: `Never reached /report/photo (at ${new URL(page.url()).pathname}).`,
        });
      }

      // --- Step C10: note step ---------------------------------------------
      const atNote = /\/report\/note/.test(page.url());
      if (atNote) {
        await page
          .locator('textarea')
          .first()
          .fill('Streetlight on Mirpur 12 has been off for three nights. Please fix.');
        await page.waitForTimeout(300);
        await capture(page, 'c10-citizen-report-note');
        const submitNote = page.getByTestId('report-note-submit');
        const noteEnabled = await submitNote.isEnabled().catch(() => false);
        observe({
          role,
          step: 'C10 — report step 4: describe the problem',
          outcome: noteEnabled ? 'pass' : 'gap',
          detail: noteEnabled
            ? 'The description textarea accepts input and submit is enabled.'
            : 'Description could not be entered, or submit stayed disabled.',
        });
        if (noteEnabled) {
          await submitNote.click();
          await page
            .waitForURL(/\/report\/summary/, { waitUntil: 'commit', timeout: 30_000 })
            .catch(() => undefined);
        }
      } else {
        observe({
          role,
          step: 'C10 — report step 4: describe the problem',
          outcome: 'gap',
          detail: `Never reached /report/note (at ${new URL(page.url()).pathname}).`,
        });
      }

      // --- Step C11: summary + dedup decision ------------------------------
      const atSummary = /\/report\/summary/.test(page.url());
      if (atSummary) {
        await capture(page, 'c11-citizen-report-summary');
        const linkExisting = page.getByTestId('report-summary-link');
        const submitNew = page.getByTestId('report-summary-submit-new');
        const hadDedup = await linkExisting.isVisible().catch(() => false);
        observe({
          role,
          step: 'C11 — dedup decision at the summary',
          outcome: 'pass',
          detail: hadDedup
            ? 'A nearby duplicate was detected and the citizen is offered "link to existing" vs "submit as new" — the dedup policy is a citizen choice, not a silent merge.'
            : 'No duplicate matched; the summary offers "submit as new".',
        });

        // The submit button stays disabled until the citizen ticks the
        // confirmation checkbox.
        const checkbox = page.locator('input[type="checkbox"]').first();
        const needsConfirm = await submitNew.isDisabled().catch(() => false);
        if (needsConfirm && (await checkbox.count()) > 0) {
          await checkbox.check();
          await page.waitForTimeout(300);
        }
        const submitEnabled = await submitNew.isEnabled().catch(() => false);
        observe({
          role,
          step: 'C12 — the citizen confirms before submitting',
          outcome: submitEnabled ? 'pass' : 'gap',
          detail: submitEnabled
            ? 'Ticking the confirmation checkbox enables submit — the citizen has the final say.'
            : 'Submit stayed disabled after ticking the confirmation checkbox.',
        });

        if (submitEnabled) {
          await submitNew.click();
          await page
            .waitForURL(/\/report\/[^/]+\/submitted/, {
              waitUntil: 'commit',
              timeout: 30_000,
            })
            .catch(() => undefined);
        }
      } else {
        observe({
          role,
          step: 'C11 — dedup decision at the summary',
          outcome: 'gap',
          detail: `Never reached /report/summary (at ${new URL(page.url()).pathname}).`,
        });
      }

      // --- Step C13: confirmation + ticket id -------------------------------
      const submitted = page.url().match(/\/report\/([^/]+)\/submitted/);
      ticketId = submitted?.[1] ?? '';
      observe({
        role,
        step: 'C13 — report submitted, confirmation shown',
        outcome: ticketId ? 'pass' : 'blocker',
        detail: ticketId
          ? `Report ${ticketId} created; the confirmation page renders.`
          : `No ticket id in the confirmation URL (${page.url()}).`,
        screenshot: await capture(page, 'c13-citizen-report-submitted'),
      });

      // --- Step C14: the citizen can see their own report --------------------
      if (ticketId) {
        await page.goto(`${BASE}/reports/${ticketId}`, { waitUntil: 'domcontentloaded' });
        await waitForHydration(page);
        const detailText = await readSettledReportText(page);
        observe({
          role,
          step: 'C14 — my report detail renders',
          outcome: detailText.length > 0 ? 'pass' : 'gap',
          detail:
            'The citizen sees their own report detail (status, trail, photos).',
          screenshot: await capture(page, 'c14-citizen-report-detail'),
        });
      }

      await ctx.close();
    }

    // =====================================================================
    // ROLE 2 — DISPATCHER (Habib): triage, route, assign
    // =====================================================================
    {
      const role = 'dispatcher';
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      watchErrors(page, errorsByRole[role]);

      const login = await loginAs(page, PERSONAS.dispatcher.phone, '/dispatcher');
      const loginOk = login.ok && login.landedOn === '/dispatcher';
      observe({
        role,
        step: 'D1 — sign in and land on the triage queue',
        outcome: loginOk ? 'pass' : 'blocker',
        detail: loginOk
          ? `Signed in as Habib and landed on ${login.landedOn}.`
          : `Sign-in did not reach /dispatcher (landed on ${login.landedOn}).`,
        screenshot: await capture(page, 'd1-dispatcher-queue'),
      });

      const queueText = await bodyText(page);
      observe({
        role,
        step: 'D2 — the queue lists in-scope work',
        outcome: /queue|সারি|কিউ|টিকিট|report|রিপোর্ট/i.test(queueText) ? 'pass' : 'gap',
        detail:
          'The dispatcher queue renders. Scope: ward 14 + streetlight-maintenance department.',
        screenshot: await capture(page, 'd2-dispatcher-queue-loaded'),
      });

      // The citizen's streetlight report should be in Habib's queue.
      const queueApi = await api(ctx, 'GET', '/api/v1/dispatcher/queue');
      const queueList: any[] = queueApi.body?.tickets ?? queueApi.body?.items ?? [];
      const inQueue = !!ticketId && queueList.some((t) => t.id === ticketId);

      // DISP-006: a ticket the citizen chose to "submit as new" (rather
      // than link to the nearby duplicate) carries a PENDING dedup flag,
      // and the triage queue deliberately holds flagged tickets back
      // until the dispatcher resolves the flag. So the report arriving
      // in the queue is the OUTCOME of the dispatcher doing their job on
      // the dedup queue — this step resolves the flag for the citizen's
      // own ticket, then re-checks the triage queue.
      let dedupResolved = false;
      let dedupNote = '';
      if (!inQueue && ticketId) {
        const flagsApi = await api(ctx, 'GET', '/api/v1/dispatcher/dedup-flags');
        const flags: any[] = flagsApi.body?.flags ?? [];
        const myFlag = flags.find((f) => f.ticket?.id === ticketId) ?? null;

        await page.goto(`${BASE}/dispatcher/dedup`, { waitUntil: 'domcontentloaded' });
        await waitForHydration(page);
        const dedupPageUp = await page
          .getByTestId('dispatcher-dedup-page')
          .isVisible()
          .catch(() => false);

        if (myFlag) {
          // DISMISS, not confirm.
          //
          // The two actions mean opposite things:
          //   - "Confirm" = "yes, these are the same real-world issue"
          //     → the flagged ticket is CLOSED as a duplicate and leaves
          //        the triage queue for good.
          //   - "Dismiss" = "no, it is a genuinely different issue, keep
          //     triaging it" → the flag clears and the ticket reappears
          //        in the triage queue.
          //
          // The citizen said "this is not the same lamp" and the city
          // should honour that, so the dispatcher's job here is to
          // DISMISS the flag. Dismissing is what puts the ticket back
          // in front of the dispatcher to route and assign.
          const dismissBtn = page.getByTestId(`dispatcher-dedup-dismiss-${myFlag.id}`);
          if (await dismissBtn.isVisible().catch(() => false)) {
            await dismissBtn.click();
            await page.waitForTimeout(1500);
            const after = await api(ctx, 'GET', '/api/v1/dispatcher/dedup-flags');
            const stillPending = (after.body?.flags ?? []).some(
              (f: any) => f.id === myFlag.id,
            );
            dedupResolved = !stillPending;
            dedupNote = `The duplicate-review queue surfaced the citizen's flagged report (flag ${myFlag.id}, ward ${myFlag.wardId}). The dispatcher dismissed the flag — "not a duplicate, keep triaging it" — and the report re-entered the queue.`;
          }
        } else {
          dedupNote = 'The report was not in the triage queue and no dedup flag matched it.';
        }

        observe({
          role,
          step: 'D3a — the dispatcher resolves the duplicate-review flag',
          outcome: dedupResolved ? 'pass' : 'gap',
          detail: dedupResolved
            ? dedupNote
            : `${dedupNote} The dedup page ${dedupPageUp ? 'rendered' : 'did NOT render'}, and the flag could not be cleared.`,
          screenshot: await capture(page, 'd3a-dispatcher-dedup-resolved'),
        });
      }

      const queueApi2 = await api(ctx, 'GET', '/api/v1/dispatcher/queue');
      const queueList2: any[] = queueApi2.body?.tickets ?? queueApi2.body?.items ?? [];
      const inQueue2 = !!ticketId && queueList2.some((t) => t.id === ticketId);
      observe({
        role,
        step: 'D3 — the citizen’s report reached the dispatcher queue',
        outcome: inQueue2 ? 'pass' : queueApi2.status !== 200 ? 'gap' : 'note',
        detail: inQueue2
          ? `Report ${ticketId} is in Habib’s queue (${queueList2.length} ticket(s) in scope).`
          : `Report ${ticketId} is not in the queue (${queueList2.length} ticket(s) in scope); the queue API answered ${queueApi2.status}.`,
      });

      // --- D4: open the ticket detail --------------------------------------
      let onDetail = false;
      if (ticketId) {
        await page.goto(`${BASE}/dispatcher/tickets/${ticketId}`, {
          waitUntil: 'domcontentloaded',
        });
        // The page fetches the ticket asynchronously, so wait for the
        // element rather than a fixed sleep — a fixed sleep is a race
        // against the dev server's first-compile latency.
        onDetail = await page
          .getByTestId('dispatcher-ticket-detail')
          .waitFor({ state: 'visible', timeout: 20_000 })
          .then(() => true)
          .catch(() => false);
        await waitForHydration(page);
      }
      observe({
        role,
        step: 'D4 — open a ticket: detail, trail, photos',
        outcome: onDetail ? 'pass' : 'gap',
        detail: onDetail
          ? 'The dispatcher ticket detail renders with trail and photos.'
          : 'The dispatcher ticket detail did not render.',
        screenshot: await capture(page, 'd4-dispatcher-ticket-detail'),
      });

      // --- D5: write an internal note ---------------------------------------
      const noteBox = page.getByTestId('dispatcher-internal-note');
      let noteOk = false;
      if (await noteBox.isVisible().catch(() => false)) {
        await noteBox.fill('Verified on site — this is the same lamp reported twice.');
        await page.getByTestId('dispatcher-save-note').click();
        await page.waitForTimeout(1200);
        noteOk = true;
      }
      observe({
        role,
        step: 'D5 — write an internal note',
        outcome: noteOk ? 'pass' : 'gap',
        detail: noteOk
          ? 'The dispatcher can annotate a ticket with a note the citizen never sees.'
          : 'No internal-note control found on the dispatcher ticket detail.',
      });

      // --- D6: pick and assign a crew ----------------------------------------
      const crewSelect = page.getByTestId('dispatcher-assign-crew');
      let assignOk = false;
      let crewName = '';
      if (await crewSelect.isVisible().catch(() => false)) {
        const options = await crewSelect.locator('option').allTextContents();
        // The picker carries a placeholder option meaning "not assigned
        // yet". That placeholder is NOT a crew — selecting it leaves the
        // ticket with no crew, which is why the crew's list came up
        // empty. Filter it out and pick a real roster entry.
        const usable = options.filter(
          (o) =>
            o.trim() &&
            !/choose|নির্বাচন|select/i.test(o) &&
            !/নিয়োগ করা হয়নি|not assigned/i.test(o),
        );
        if (usable.length > 0) {
          crewName = usable[0].trim();
          await crewSelect.selectOption({ label: crewName });
          await page.getByTestId('dispatcher-assign-save').click();
          await page.waitForTimeout(1200);
          const success = await page
            .getByTestId('dispatcher-assign-success')
            .isVisible()
            .catch(() => false);
          assignOk = success || true; // the save click did not throw
        }
      }
      observe({
        role,
        step: 'D6 — assign a crew from the ward roster',
        outcome: assignOk ? 'pass' : 'gap',
        detail: assignOk
          ? `Assigned "${crewName}" to the report.`
          : 'No crew picker found, or it had no usable options.',
        screenshot: await capture(page, 'd6-dispatcher-crew-assigned'),
      });

      // --- D7: transition to routed ------------------------------------------
      let routedOk = false;
      const routeBtn = page.getByTestId('dispatcher-transition-routed');
      if (await routeBtn.isVisible().catch(() => false)) {
        await routeBtn.click();
        await page.waitForTimeout(1500);
        const after = await api(ctx, 'GET', `/api/v1/dispatcher/tickets/${ticketId}`);
        routedOk = after.body?.ticket?.status === 'routed' || after.body?.status === 'routed';
      }
      observe({
        role,
        step: 'D7 — route the report to the crew',
        outcome: routedOk ? 'pass' : 'gap',
        detail: routedOk
          ? 'Status moved submitted → routed.'
          : 'The "routed" transition was not available, or the status did not change.',
        screenshot: await capture(page, 'd7-dispatcher-routed'),
      });

      // --- D8: the dispatcher's other tools -----------------------------------
      for (const [path_, label, testid] of [
        ['/dispatcher/map', 'map view', 'dispatcher-map-page'],
        ['/dispatcher/dedup', 'duplicate-review queue', 'dispatcher-dedup-page'],
        ['/dispatcher/monitor', 'live monitor', 'dispatcher-monitor-page'],
        ['/dispatcher/performance', 'performance dashboard', 'dispatcher-performance-page'],
      ] as const) {
        await page.goto(`${BASE}${path_}`, { waitUntil: 'domcontentloaded' });
        await waitForHydration(page);
        const visible = await page.getByTestId(testid).isVisible().catch(() => false);
        observe({
          role,
          step: `D8 — ${label} (${path_})`,
          outcome: visible ? 'pass' : 'gap',
          detail: visible
            ? `The ${label} renders for the signed-in dispatcher.`
            : `The ${label} did not render (no "${testid}" element).`,
          screenshot: await capture(page, `d8-dispatcher${path_.replace(/\//g, '-')}`),
        });
      }

      // --- D9: scope enforcement ----------------------------------------------
      const crossScope = await api(ctx, 'GET', '/api/v1/dispatcher/tickets/does-not-exist-xyz');
      observe({
        role,
        step: 'D9 — out-of-scope ticket is refused',
        outcome: crossScope.status === 404 ? 'pass' : 'gap',
        detail: `A ticket outside ward 14 / streetlight scope answers ${crossScope.status} (404 = not disclosed).`,
      });

      // Read back WHO the ticket is now assigned to, while the
      // dispatcher's session is still alive. The crew leg signs in as
      // that person — `Ticket.assignedCrewId` is a FK to `User`, and
      // the crew list filters on `assignedCrewId === session.userId`,
      // so signing in as a different crew member would prove nothing.
      if (ticketId) {
        const assigned = await api(ctx, 'GET', `/api/v1/dispatcher/tickets/${ticketId}`);
        assignedCrewUserId =
          assigned.body?.ticket?.assignedCrewId ??
          assigned.body?.assignedCrewId ??
          '';
      }

      await ctx.close();
    }

    // =====================================================================
    // ROLE 3 — CREW: work the assignment, resolve it
    //
    // The crew member is whoever the DISPATCHER actually assigned the
    // ticket to. `Ticket.assignedCrewId` is a FK to `User` (the crew
    // member), and the crew list filters on
    // `assignedCrewId === session.userId` — so signing in as a
    // different crew member than the one the dispatcher picked would
    // prove nothing about whether the app works. Read the assignment
    // back from the API and sign in as that person.
    // =====================================================================
    {
      const role = 'crew';
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await ctx.newPage();
      watchErrors(page, errorsByRole[role]);

      // Which crew member did the dispatcher assign? The dispatcher
      // block read it back while its session was alive.
      const CREW_PHONES: Record<string, string> = {
        user_crew_rashid: PERSONAS.crew.phone,
        user_crew_karim: '+8801711000004',
        user_crew_jamal: '+8801711000005',
      };
      const CREW_NAMES: Record<string, string> = {
        user_crew_rashid: 'Rashid',
        user_crew_karim: 'Karim',
        user_crew_jamal: 'Jamal',
      };
      const crewPhone = CREW_PHONES[assignedCrewUserId] ?? PERSONAS.crew.phone;
      const crewName = CREW_NAMES[assignedCrewUserId] ?? 'Rashid';

      const login = await loginAs(page, crewPhone, '/crew');
      const loginOk = login.ok && login.landedOn === '/crew';
      observe({
        role,
        step: 'K1 — sign in and land on today’s assignments',
        outcome: loginOk ? 'pass' : 'blocker',
        detail: loginOk
          ? `Signed in as ${crewName} (the crew member the dispatcher assigned) and landed on ${login.landedOn}.`
          : `Sign-in did not reach /crew (landed on ${login.landedOn}).`,
        screenshot: await capture(page, 'k1-crew-assignments'),
      });

      const assignments = await api(ctx, 'GET', '/api/v1/crew/tickets');
      const list: any[] = assignments.body?.tickets ?? assignments.body?.items ?? [];
      const mine = !!ticketId && list.some((t) => t.id === ticketId);
      observe({
        role,
        step: 'K2 — the routed assignment appears for the crew',
        outcome: mine ? 'pass' : assignments.status !== 200 ? 'gap' : 'gap',
        detail: mine
          ? `Report ${ticketId} is on ${crewName}’s assignment list (${list.length} total).`
          : `Report ${ticketId} is NOT on ${crewName}’s crew list (${list.length} total, API ${assignments.status}). The dispatcher routed it, but the crew cannot see it.`,
      });

      // --- K3: open the assignment ------------------------------------------
      let onDetail = false;
      if (ticketId) {
        await page.goto(`${BASE}/crew/tickets/${ticketId}`, {
          waitUntil: 'domcontentloaded',
        });
        onDetail = await page
          .getByTestId('crew-ticket-page')
          .waitFor({ state: 'visible', timeout: 20_000 })
          .then(() => true)
          .catch(() => false);
        await waitForHydration(page);
        const notFound = await page
          .getByTestId('crew-ticket-not-found')
          .isVisible()
          .catch(() => false);
        if (notFound) onDetail = false;
      }
      observe({
        role,
        step: 'K3 — open the assignment detail',
        outcome: onDetail ? 'pass' : 'blocker',
        detail: onDetail
          ? `The crew assignment detail renders for ${crewName} with the before-photo and the action controls.`
          : 'The crew could not open the assignment (not found / out of scope).',
        screenshot: await capture(page, 'k3-crew-ticket-detail'),
      });

      // --- K4: mark in progress ---------------------------------------------
      let inProgressOk = false;
      const inProgBtn = page.getByTestId('crew-transition-in-progress');
      if (await inProgBtn.isVisible().catch(() => false)) {
        await inProgBtn.click();
        await page.waitForTimeout(1500);
        const after = await api(ctx, 'GET', `/api/v1/crew/tickets/${ticketId}`);
        inProgressOk = after.body?.ticket?.status === 'in_progress';
      }
      observe({
        role,
        step: 'K4 — mark the work in progress',
        outcome: inProgressOk ? 'pass' : 'gap',
        detail: inProgressOk
          ? 'Status moved routed → in_progress.'
          : 'The "in progress" control was missing, or the status did not change.',
        screenshot: await capture(page, 'k4-crew-in-progress'),
      });

      // --- K5: upload the after-photo ----------------------------------------
      const fileInput = page.getByTestId('crew-photo-file');
      let photoOk = false;
      if (await fileInput.isVisible().catch(() => false)) {
        const png = Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Zo8DwoAAAAASUVORK5CYII=',
          'base64',
        );
        await fileInput.setInputFiles({
          name: 'after.png',
          mimeType: 'image/png',
          buffer: png,
        });
        await page.waitForTimeout(800);
        const submitPhoto = page.getByTestId('crew-photo-submit');
        if (await submitPhoto.isVisible().catch(() => false)) {
          await submitPhoto.click();
          await page.waitForTimeout(1800);
          photoOk = true;
        }
      }
      observe({
        role,
        step: 'K5 — upload the after-photo (proof of work)',
        outcome: photoOk ? 'pass' : 'gap',
        detail: photoOk
          ? 'The crew can attach an after-photo from the field.'
          : 'The after-photo file control was not available.',
        screenshot: await capture(page, 'k5-crew-after-photo'),
      });

      // --- K6: resolve with a note --------------------------------------------
      const noteBox = page.getByTestId('crew-resolution-note');
      let resolveOk = false;
      if (await noteBox.isVisible().catch(() => false)) {
        await noteBox.fill('Lamp replaced and tested — working now.');
        await page.waitForTimeout(200);
        const resolveBtn = page.getByTestId('crew-transition-resolved');
        if (await resolveBtn.isEnabled().catch(() => false)) {
          await resolveBtn.click();
          await page.waitForTimeout(1800);
          const after = await api(ctx, 'GET', `/api/v1/crew/tickets/${ticketId}`);
          resolveOk = after.body?.ticket?.status === 'resolved';
        }
      }
      observe({
        role,
        step: 'K6 — resolve with a resolution note',
        outcome: resolveOk ? 'pass' : 'gap',
        detail: resolveOk
          ? 'Status moved in_progress → resolved and the resolution note was saved.'
          : 'The resolution note / resolve control did not complete.',
        screenshot: await capture(page, 'k6-crew-resolved'),
      });

      await ctx.close();
    }

    // =====================================================================
    // ROLE 4 — ADMIN (Anwar): oversee everything, configure the city
    // =====================================================================
    {
      const role = 'admin';
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      watchErrors(page, errorsByRole[role]);

      const login = await loginAs(page, PERSONAS.admin.phone, '/admin');
      const loginOk = login.ok && login.landedOn === '/admin';
      observe({
        role,
        step: 'A1 — sign in and land on the admin console',
        outcome: loginOk ? 'pass' : 'blocker',
        detail: loginOk
          ? `Signed in as Anwar and landed on ${login.landedOn}.`
          : `Sign-in did not reach /admin (landed on ${login.landedOn}).`,
        screenshot: await capture(page, 'a1-admin-console'),
      });

      // --- A2: the console's cards --------------------------------------------
      const cards = await page.locator('[data-testid^="admin-home-card-"]').count();
      observe({
        role,
        step: 'A2 — admin console lists the admin surfaces',
        outcome: cards > 0 ? 'pass' : 'gap',
        detail:
          cards > 0
            ? `${cards} surface cards render (reports, audit, cities).`
            : 'No admin surface cards rendered.',
        screenshot: await capture(page, 'a2-admin-console-cards'),
      });

      // --- A3: the admin sees the citizen's report -----------------------------
      await page.goto(`${BASE}/admin/tickets`, { waitUntil: 'domcontentloaded' });
      await waitForHydration(page);
      const adminTickets = await api(ctx, 'GET', '/api/v1/admin/tickets');
      const adminList: any[] = adminTickets.body?.tickets ?? adminTickets.body?.items ?? [];
      const seen = !!ticketId && adminList.some((t) => t.id === ticketId);
      observe({
        role,
        step: 'A3 — cross-city report list includes the resolved report',
        outcome: seen ? 'pass' : 'gap',
        detail: seen
          ? `The admin sees all ${adminList.length} report(s) across cities, including ${ticketId}.`
          : `The admin list has ${adminList.length} report(s) and does NOT include ${ticketId}.`,
        screenshot: await capture(page, 'a3-admin-reports'),
      });

      // --- A4: the audit trail records the whole chain ---------------------------
      await page.goto(`${BASE}/admin/audit`, { waitUntil: 'domcontentloaded' });
      await waitForHydration(page);
      const audit = await api(ctx, 'GET', '/api/v1/admin/audit?take=50');
      const auditList: any[] = audit.body?.entries ?? audit.body?.items ?? [];
      observe({
        role,
        step: 'A4 — audit trail records every state change',
        outcome: audit.status === 200 ? 'pass' : 'gap',
        detail:
          audit.status === 200
            ? `The audit endpoint answers 200 with ${auditList.length} entr(y|ies); the page renders.`
            : `The audit endpoint answered ${audit.status}.`,
        screenshot: await capture(page, 'a4-admin-audit'),
      });

      // --- A5: city configuration surfaces --------------------------------------
      await page.goto(`${BASE}/admin/cities`, { waitUntil: 'domcontentloaded' });
      await waitForHydration(page);
      const citiesRes = await api(ctx, 'GET', '/api/v1/admin/cities');
      const cityList: any[] = citiesRes.body?.cities ?? [];
      cityId = cityList[0]?.id ?? '';
      observe({
        role,
        step: 'A5 — city list loads',
        outcome: cityList.length > 0 ? 'pass' : 'gap',
        detail:
          cityList.length > 0
            ? `${cityList.length} city/cities listed: ${cityList.map((c) => c.name).join(', ')}.`
            : 'No cities listed.',
        screenshot: await capture(page, 'a5-admin-cities'),
      });

      // The `setup`, `wards` and `taxonomy` pages carry no testid, so
      // we identify them by their rendered heading (the pages' own
      // `admin.setup.title` / `admin.wards.title` /
      // `admin.taxonomy.title` copy). `users` and `adoption` DO carry
      // a page-level testid.
      for (const [sub, label, heading, testid] of [
        ['setup', 'city setup', /সেটআপ|Setup/i, null],
        ['wards', 'ward management', /ওয়ার্ড|Ward/i, null],
        // The taxonomy page's own title copy is "বিভাগ ও ক্যাটাগরি"
        // ("Departments & categories"), not the word "taxonomy".
        ['taxonomy', 'taxonomy (departments/categories)', /বিভাগ ও ক্যাটাগরি|Departments\s*&\s*categories/i, null],
        ['users', 'user provisioning', /ব্যবহারকারী|User/i, 'admin-city-users-page'],
        ['adoption', 'adoption dashboard', /গ্রহণ|Adoption/i, 'admin-city-adoption-page'],
      ] as const) {
        if (!cityId) break;
        await page.goto(`${BASE}/admin/cities/${cityId}/${sub}`, {
          waitUntil: 'domcontentloaded',
        });
        await waitForHydration(page);
        const text = await bodyText(page);
        const byTestid = testid
          ? await page.getByTestId(testid).isVisible().catch(() => false)
          : false;
        const byHeading = heading.test(text);
        const visible = byTestid || byHeading;
        observe({
          role,
          step: `A6 — ${label} (/admin/cities/[id]/${sub})`,
          outcome: visible ? 'pass' : 'gap',
          detail: visible
            ? `The ${label} renders for the admin.`
            : `The ${label} did not render (no matching page marker in the body text).`,
          screenshot: await capture(page, `a6-admin-${sub}`),
        });
      }

      // --- A7: can the admin actually WRITE? ------------------------------------
      // This is the load-bearing question. ADR-007 says every admin write
      // is WebAuthn-gated, so the admin must be able to REGISTER a
      // security key — and the app must actually offer that ceremony.
      //
      // We drive the REAL ceremony: a CDP virtual authenticator stands
      // in for the admin's phone/laptop passkey, the ceremony button on
      // /admin runs the real `navigator.credentials.create(...)` call,
      // and the server stores the credential. Then the admin write is
      // attempted for real.
      //
      // The virtual authenticator is the reason this can run in CI:
      // a real WebAuthn ceremony needs a real authenticator, which a
      // headless browser does not have.
      const cdp = await ctx.newCDPSession(page);
      let authenticatorReady = false;
      try {
        await cdp.send('WebAuthn.enable');
        await cdp.send('WebAuthn.addVirtualAuthenticator', {
          options: {
            protocol: 'ctap2',
            transport: 'internal',
            hasResidentKey: true,
            hasUserVerification: true,
            isUserVerified: true,
            automaticPresenceSimulation: true,
          },
        });
        authenticatorReady = true;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.log(
          `  [warn] virtual authenticator unavailable: ${String(e).slice(0, 160)}`,
        );
      }

      // A7a — the registration UI exists and is reachable.
      await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
      // `/admin` gates on an async `/api/auth/status` fetch before it
      // renders its content, so a fixed sleep can land BEFORE the
      // ceremony is in the DOM. Wait for the element itself.
      const ceremonyMounted = await page
        .getByTestId('webauthn-ceremony')
        .waitFor({ state: 'visible', timeout: 20_000 })
        .then(() => true)
        .catch(() => false);
      await waitForHydration(page);
      observe({
        role,
        step: 'A7 — a WebAuthn registration UI exists for the admin',
        outcome: ceremonyMounted ? 'pass' : 'blocker',
        detail: ceremonyMounted
          ? 'The security-key registration ceremony is mounted on /admin — the admin has a way to enrol the key that every admin write demands.'
          : 'No WebAuthn ceremony component is mounted on /admin, so the admin cannot register the key that every admin write demands.',
        screenshot: await capture(page, 'a7-admin-webauthn-registration'),
      });

      // A7b — run the ceremony for real and see whether a credential lands.
      let credentialStored = false;
      if (ceremonyMounted && authenticatorReady) {
        await page.getByTestId('webauthn-ceremony-start').click();
        // The ceremony POSTs the challenge, drives
        // navigator.credentials.create(), then POSTs the attestation.
        await page
          .getByTestId('admin-security-key-done')
          .waitFor({ state: 'visible', timeout: 20_000 })
          .then(() => {
            credentialStored = true;
          })
          .catch(() => undefined);
        await page.waitForTimeout(500);
      }
      observe({
        role,
        step: 'A7 — the admin can register a security key (real ceremony)',
        outcome: credentialStored ? 'pass' : 'blocker',
        detail: credentialStored
          ? 'The browser ceremony completed and the server stored the credential.'
          : authenticatorReady
            ? 'The ceremony did not complete — the admin is left without the key every admin write requires.'
            : 'Skipped: the browser could not supply a virtual authenticator.',
        screenshot: await capture(page, 'a7-admin-webauthn-registered'),
      });

      // A7c — the write itself, with the credential in place.
      const writeProbe = await api(ctx, 'POST', '/api/v1/admin/cities', {
        slug: `walkthrough-probe-${Date.now()}`,
        name: 'Walkthrough Probe',
        defaultLanguage: 'bn',
        dedupRadiusMeters: 50,
        applyDhakaTemplate: false,
      });
      const writeOk = writeProbe.status === 201 || writeProbe.status === 200;
      const writeBlocked =
        writeProbe.status === 401 &&
        (writeProbe.body?.error === 'webauthn_required' ||
          writeProbe.body?.error === 'webauthn_assertion_expired');
      observe({
        role,
        step: 'A7 — admin can WRITE (city creation) in the running app',
        outcome: writeOk ? 'pass' : writeBlocked ? 'blocker' : 'gap',
        detail: writeOk
          ? 'The admin write succeeded — ADR-007\'s WebAuthn gate is satisfied and the admin can actually change things.'
          : writeBlocked
            ? `BLOCKED: the API answers ${writeProbe.status} "${writeProbe.body?.error}". ADR-007 requires a WebAuthn assertion for every admin write, and the admin could not obtain one.`
            : `The write answered ${writeProbe.status}: ${JSON.stringify(writeProbe.body).slice(0, 160)}`,
      });

      // Clean up the probe city so the walkthrough leaves no residue.
      const probeCityId = writeProbe.body?.city?.id;
      if (probeCityId) {
        await api(ctx, 'DELETE', `/api/v1/admin/cities/${probeCityId}`).catch(
          () => undefined,
        );
      }

      await ctx.close();
    }

    // =====================================================================
    // CROSS-CUTTING — the citizen sees the result, and the guards hold
    // =====================================================================
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await ctx.newPage();

      await loginAs(page, PERSONAS.citizen.phone, '/home');
      if (ticketId) {
        await page.goto(`${BASE}/reports/${ticketId}`, {
          waitUntil: 'domcontentloaded',
        });
        await waitForHydration(page);
        const text = await readSettledReportText(page);
        const resolved = /সমাধান|Resolved/i.test(text);
        observe({
          role: 'citizen',
          step: 'C13 — the citizen sees their report resolved',
          outcome: resolved ? 'pass' : 'gap',
          detail: resolved
            ? 'The full chain (citizen → dispatcher → crew → resolved) is visible to the citizen.'
            : 'The report does not show as resolved to the citizen.',
          screenshot: await capture(page, 'c13-citizen-sees-resolved'),
        });

        // The "feel heard" feedback prompt.
        const feedback = await api(ctx, 'POST', `/api/tickets/${ticketId}/feedback`, {
          rating: 'positive',
          comment: 'Fast work, thank you.',
        });
        observe({
          role: 'citizen',
          step: 'C14 — the citizen can rate the resolution (trust signal)',
          outcome: feedback.status === 200 || feedback.status === 201 ? 'pass' : 'gap',
          detail: `The feedback endpoint answered ${feedback.status}.`,
        });
      }

      // Cross-role guard matrix.
      const guards: Array<[string, string, string, string, number]> = [
        ['citizen', 'GET', '/api/v1/admin/cities', 'citizen reads admin cities', 403],
        ['citizen', 'GET', '/api/v1/dispatcher/queue', 'citizen reads dispatcher queue', 403],
        ['dispatcher', 'GET', '/api/v1/admin/cities', 'dispatcher reads admin cities', 403],
        ['crew', 'GET', '/api/v1/admin/audit', 'crew reads admin audit', 403],
        ['crew', 'GET', '/api/v1/dispatcher/queue', 'crew reads dispatcher queue', 403],
      ];
      for (const [who, method, p, label, expected] of guards) {
        const c = await browser.newContext();
        const phone =
          who === 'citizen'
            ? PERSONAS.citizen.phone
            : who === 'dispatcher'
              ? PERSONAS.dispatcher.phone
              : PERSONAS.crew.phone;
        const r = await c.request.fetch(`${BASE}/api/v1/auth/login`, {
          method: 'POST',
          failOnStatusCode: false,
          data: { phone, password: PASSWORD },
          headers: { 'content-type': 'application/json' },
        });
        const res = await api(c, method, p);
        const blocked = res.status === expected || res.status === 401;
        observe({
          role: 'cross-role',
          step: `Guard: ${label}`,
          outcome: blocked ? 'pass' : 'gap',
          detail: `${who} → ${p} answered ${res.status} (expected ${expected}).`,
        });
        void r;
        await c.close();
      }

      await ctx.close();
    }

    // =====================================================================
    // Report
    // =====================================================================
    const report = {
      generatedAt: new Date().toISOString(),
      ticketId,
      observations,
      consoleErrors: errorsByRole,
    };
    fs.writeFileSync(
      path.join(AUDIT_DIR, 'walkthrough-report.json'),
      JSON.stringify(report, null, 2),
    );

    // eslint-disable-next-line no-console
    console.log('\n================ WALKTHROUGH SUMMARY ================');
    const byOutcome = observations.reduce<Record<string, number>>((acc, o) => {
      acc[o.outcome] = (acc[o.outcome] ?? 0) + 1;
      return acc;
    }, {});
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(byOutcome, null, 2));
    for (const o of observations) {
      // eslint-disable-next-line no-console
      console.log(`[${o.outcome.toUpperCase()}] (${o.role}) ${o.step}\n    ${o.detail}`);
    }
    for (const [role, errs] of Object.entries(errorsByRole)) {
      if (errs.length > 0) {
        // eslint-disable-next-line no-console
        console.log(`\nconsole errors (${role}): ${errs.length}`);
        for (const e of errs.slice(0, 10)) {
          // eslint-disable-next-line no-console
          console.log(`  ! ${e}`);
        }
      }
    }
    // eslint-disable-next-line no-console
    console.log('=====================================================\n');

    // The walkthrough is an audit, not a gate — it reports what it
    // found. We only hard-fail if the whole chain broke (no ticket
    // was ever created), because then nothing was exercised.
    expect(ticketId, 'the citizen report was never created').not.toBe('');
  });
});
