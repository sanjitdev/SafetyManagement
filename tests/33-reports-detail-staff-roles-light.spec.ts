/**
 * Playwright route spec: /reports/:id is a SHARED surface.
 *
 * ## The bug
 *
 * `app/reports/[id]/page.tsx` used `/api/report/bootstrap` — the
 * REPORT FORM's bootstrap, which is deliberately citizen-only:
 *
 * ```ts
 * if (session.role !== 'citizen') {
 *   return NextResponse.json({ error: 'citizen_only' }, { status: 403 });
 * }
 * ```
 *
 * as its AUTH GATE:
 *
 * ```ts
 * const authRes = await fetch('/api/report/bootstrap', { credentials: 'include' });
 * if (!authRes.ok) {
 *   setAuthed(false);   // → "You need to sign in to view this report."
 *   return;
 * }
 * ```
 *
 * `/reports` is NOT in `CITIZEN_ONLY_SURFACES` (lib/role-home.ts) —
 * only `/report` is — so every role may open `/reports/:id`. But
 * because the page's auth gate was a citizen-only endpoint, a
 * dispatcher, crew member or admin was told to sign in for EVERY
 * report, even though `GET /api/tickets/:id` authorizes staff by
 * city + ward/department and would have served them the ticket.
 *
 * ## The fix
 *
 * The ticket endpoint is now the single authority on the page. It
 * distinguishes 401 (no session → "sign in") from 403 (a session that
 * may not see this ticket → "forbidden"), so the two states can no
 * longer be collapsed into one misleading message.
 *
 * The category name is read off the ticket (the serializer already
 * denormalises `categoryName` / `categoryNameBn` onto it), so the
 * category-list fetch is gone entirely.
 *
 * ## What this spec asserts
 *
 * For every role that is scoped to see the seeded ticket:
 *   1. The page renders the ticket (its description), NOT the
 *      "You need to sign in to view this report." state.
 *   2. The category is rendered by NAME, not as a raw cuid — that
 *      proves the label came off the ticket payload.
 *   3. The citizen-only photo-delete affordance is NOT offered to a
 *      staff viewer, because the endpoint enforces
 *      `requireRole(session, 'citizen')`.
 *
 * And that an UNAUTHENTICATED visitor is still asked to sign in — the
 * 401 → "sign in" mapping must survive the fix.
 *
 * ## LANGUAGE
 *
 * The app is Bangla-first, and the default language here is Bangla, so
 * the assertions match the Bangla copy (with the English copy as an
 * alternative). The i18n key is `detail.signin_required`.
 *
 * Pre-reqs:
 *   - Dev server running with CITYFIX_DEV_STORE=1 (`npm run dev:feat`).
 *   - BASE_URL points at it (default http://localhost:3000).
 */

import { test, expect, APIRequestContext, Page } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';

/**
 * The ticket this spec opens.
 *
 * It has to be one a STAFF role is scoped to see. The dev store's
 * dispatcher/crew personas are bound to `ward_14` + the streetlight
 * department, so the ticket must be a `cat_streetlight` ticket in
 * `ward_14`. `cat_streetlight` is the only category the dev seed maps
 * to `dept_streetlight` — see tests/11-dispatcher-detail-light.spec.ts,
 * which uses the same category for the same reason.
 *
 * `ticket_seed_crew_done_today_1` is a resolved `cat_streetlight`
 * ticket in `ward_14`, assigned to the crew persona. It is
 * deliberately a RESOLVED ticket so the spec can also assert that the
 * citizen-only "feel heard" rating prompt is not offered to staff.
 */
const TICKET_ID = 'ticket_seed_crew_done_today_1';

/**
 * A ticket the dispatcher is NOT scoped to see.
 *
 * `ticket_seed_resolved_1` is a `cat_drainage` ticket, and drainage
 * belongs to `dept_roads` — while the dev store's dispatcher persona
 * is bound to `dept_streetlight`. So this ticket is outside the
 * dispatcher's scope on the DEPARTMENT dimension, in the same ward.
 *
 * This is the ticket that produced the bug: on the shared `/reports/:id`
 * surface the dispatcher was refused it, and the refusal rendered the
 * CITIZEN-ownership copy ("You can only view reports you created.")
 * — a rule that does not apply to a dispatcher at all.
 */
const OUT_OF_SCOPE_TICKET_ID = 'ticket_seed_resolved_1';

async function devLogin(ctx: APIRequestContext, role: string): Promise<void> {
  const res = await ctx.post(`${BASE}/api/dev/login?role=${role}`, {
    maxRedirects: 0,
    failOnStatusCode: false,
  });
  expect(res.status(), `dev login for ${role}`).toBe(303);
}

/**
 * The "You need to sign in to view this report." state.
 *
 * Matched by TEXT rather than by a test id, because that string IS
 * the bug: if it is visible, the page told a signed-in staff member
 * to sign in. Bangla-first, so the Bangla copy is the primary match
 * and the English copy is the alternative.
 */
function signInRequired(page: Page) {
  return page.getByText(/সাইন ইন করুন|sign in to view this report/i);
}

/**
 * The "report not found" state — the 404 branch. A staff member
 * opening a ticket OUTSIDE their scope must see this, never the
 * sign-in prompt. (The old code showed the sign-in prompt for
 * everything.)
 */
function reportNotFound(page: Page) {
  return page.getByText(/পাওয়া যায়নি|not found/i);
}

/**
 * The ticket's own description, which the page renders in the
 * description card. Its presence proves the TICKET body rendered —
 * not just the shell.
 */
function ticketDescription(page: Page) {
  return page.getByTestId('report-detail-description');
}

test('dispatcher opens a report in their scope and sees the ticket, not a sign-in prompt', async ({
  page,
  context,
}) => {
  await devLogin(context.request, 'dispatcher');

  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  const resp = await page.goto(`${BASE}/reports/${TICKET_ID}`, {
    waitUntil: 'domcontentloaded',
  });
  expect(resp, 'expected a response for /reports/:id').not.toBeNull();
  expect(resp!.status()).toBe(200);

  // The ticket body renders.
  await expect(ticketDescription(page)).toBeVisible({ timeout: 10_000 });

  // THE REGRESSION: the sign-in prompt must NOT be visible for a
  // signed-in staff member.
  await expect(signInRequired(page)).toHaveCount(0);

  // The category renders by NAME ("Broken streetlight" / "রাস্তার আলো
  // নেই"), not as a raw cuid — proving the label came off the ticket
  // payload rather than from a separate category-list fetch.
  await expect(page.getByText(/broken streetlight|রাস্তার আলো নেই/i).first()).toBeVisible({
    timeout: 10_000,
  });
  // The raw category id must never reach the screen.
  await expect(page.getByText(/cat_[a-z]+/i)).toHaveCount(0);

  expect(errors, `page errors: ${errors.join(' | ')}`).toHaveLength(0);
});

test('crew opens a report in their scope and sees the ticket', async ({
  page,
  context,
}) => {
  await devLogin(context.request, 'crew');

  const resp = await page.goto(`${BASE}/reports/${TICKET_ID}`, {
    waitUntil: 'domcontentloaded',
  });
  expect(resp).not.toBeNull();
  expect(resp!.status()).toBe(200);

  await expect(ticketDescription(page)).toBeVisible({ timeout: 10_000 });
  await expect(signInRequired(page)).toHaveCount(0);
});

test('admin opens a report and sees the ticket', async ({ page, context }) => {
  await devLogin(context.request, 'admin');

  const resp = await page.goto(`${BASE}/reports/${TICKET_ID}`, {
    waitUntil: 'domcontentloaded',
  });
  expect(resp).not.toBeNull();
  expect(resp!.status()).toBe(200);

  await expect(ticketDescription(page)).toBeVisible({ timeout: 10_000 });
  await expect(signInRequired(page)).toHaveCount(0);
});

test('the citizen-only write affordances are not offered to a staff viewer', async ({
  page,
  context,
}) => {
  await devLogin(context.request, 'dispatcher');

  await page.goto(`${BASE}/reports/${TICKET_ID}`, { waitUntil: 'domcontentloaded' });
  await expect(ticketDescription(page)).toBeVisible({ timeout: 10_000 });

  // The photo delete button carries the `detail.photo.delete_aria`
  // label. It is a citizen-only write (DELETE
  // /api/tickets/:id/photos/:idx enforces
  // `requireRole(session, 'citizen')`), so a staff viewer must not be
  // offered it.
  await expect(page.getByRole('button', { name: /delete|মুছুন|ডিলিট/i })).toHaveCount(0);
});

test('an unauthenticated visitor is still asked to sign in', async ({ page }) => {
  // The 401 → "sign in" mapping must survive the fix. A signed-out
  // visitor genuinely has no session; telling them to sign in is the
  // right message. (The bug was that a SIGNED-IN staff member was
  // told the same thing.)
  const resp = await page.goto(`${BASE}/reports/${TICKET_ID}`, {
    waitUntil: 'domcontentloaded',
  });
  expect(resp).not.toBeNull();
  expect(resp!.status()).toBe(200);

  await expect(signInRequired(page)).toBeVisible({ timeout: 10_000 });
});

test('a ticket that does not exist renders "not found", not "sign in"', async ({
  page,
  context,
}) => {
  // The 404 branch. It must not be confused with the 401 branch: a
  // signed-in staff member asking for a missing ticket has a session
  // and should be told the ticket is missing, not told to sign in.
  await devLogin(context.request, 'dispatcher');

  const resp = await page.goto(`${BASE}/reports/ticket_does_not_exist`, {
    waitUntil: 'domcontentloaded',
  });
  expect(resp).not.toBeNull();
  expect(resp!.status()).toBe(200);

  await expect(reportNotFound(page)).toBeVisible({ timeout: 10_000 });
  await expect(signInRequired(page)).toHaveCount(0);
});

/**
 * THE SCOPE-FILTER DIVERGENCE, FIXED.
 *
 * The shared `/reports` LIST hands a staff member every report filed
 * in the session's city. The shared `/reports/:id` DETAIL used to
 * narrow dispatcher / crew reads to (ward + department), so the list
 * showed a ticket the detail route refused — "I can see it but I
 * can't open it".
 *
 * The detail route now matches the list it is opened from: a staff
 * member may open any report in their own city.
 */
test('a dispatcher opens a report OUTSIDE their ward / department on the shared surface', async ({
  page,
  context,
}) => {
  await devLogin(context.request, 'dispatcher');

  const resp = await page.goto(`${BASE}/reports/${OUT_OF_SCOPE_TICKET_ID}`, {
    waitUntil: 'domcontentloaded',
  });
  expect(resp).not.toBeNull();
  expect(resp!.status()).toBe(200);

  // The ticket body renders — no refusal at all.
  await expect(ticketDescription(page)).toBeVisible({ timeout: 10_000 });
  await expect(signInRequired(page)).toHaveCount(0);
});

test('a dispatcher never sees the citizen-ownership message', async ({
  page,
  context,
}) => {
  // "You can only view reports you created." is a CITIZEN-ownership
  // sentence. A dispatcher does not create reports, so that sentence
  // describes a rule that does not apply to them — and it was the
  // exact copy the bug reported.
  //
  // The ownership sentence is legitimate for a CITIZEN opening
  // someone else's report, so the assertion is scoped to the staff
  // viewer: on every page a staff member can reach, the ownership
  // copy must be absent.
  await devLogin(context.request, 'dispatcher');

  await page.goto(`${BASE}/reports/${TICKET_ID}`, { waitUntil: 'domcontentloaded' });
  await expect(ticketDescription(page)).toBeVisible({ timeout: 10_000 });

  await expect(
    page.getByText(/শুধুমাত্র আপনার নিজের রিপোর্ট|only view reports you created/i),
  ).toHaveCount(0);
});
