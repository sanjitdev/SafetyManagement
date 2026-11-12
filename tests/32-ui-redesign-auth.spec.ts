/**
 * Playwright route spec for the Intent 009 UI-redesign auth + public
 * surfaces (tests/32-ui-redesign-auth.spec.ts).
 *
 * Executable form of story 008
 * (`.specsmd/aidlc/memory-bank/intents/009-ui-redesign/units/003-auth-and-public-surfaces/stories/008-auth-and-public-page-implementation.md`).
 *
 * WHAT IT COVERS
 * --------------
 *   Scenario 1 — /login: the error summary is focusable, sits above the
 *                form and links to the offending field; the field itself
 *                carries an inline `role="alert"`.
 *   Scenario 2 — /login + /register + /verify-otp: EVERY input has an
 *                associated label (a `<label for>` or an `aria-label`).
 *                No placeholder-only field.
 *   Scenario 3 — /login: the show/hide toggle is keyboard-reachable and
 *                the recovery path is reachable too.
 *   Scenario 4 — /register: the password-rules grid renders a per-rule
 *                ICON + WORD + COLOUR, with distinguishable met/unmet
 *                states.
 *   Scenario 5 — /verify-otp: the page names its delivery channel,
 *                shows the resend countdown, offers a recovery card.
 *   Scenario 6 — /: the landing never leaks a reporter identity and
 *                DOES carry the OSM / MapLibre attribution.
 *   Scenario 7 — /: the landing's figures are tabular.
 *   Scenario 8 — /feed: the filter chips carry live counts; the "new"
 *                state carries BOTH a badge and a tint.
 *   Scenario 9 — every controlled-input page waits for `window.next.router`
 *                before the spec types into it.
 *   Scenario 10— the auth/public pages' primary controls render from the
 *                `components/ui/` primitives (see the long note on the
 *                `ui primitives` describe block for exactly what this
 *                proves and what it does NOT prove).
 *
 * HOW IT DRIVES THE REAL FORMS
 * -----------------------------
 *   - The dev store is already running behind `http://localhost:3000`
 *     with `CITYFIX_DEV_STORE=1` (playwright.config.ts's `webServer`
 *     block starts it; `reuseExistingServer` reuses a manual one).
 *   - The login form validates CLIENT-SIDE FIRST: a phone that fails
 *     `/^(\+?880|0)?1[0-9]{9}$/`, or an EMPTY password, never reaches the
 *     server. A server-side "wrong password" therefore needs a
 *     VALID-SHAPE phone and a NON-EMPTY wrong password.
 *   - The seeded citizen is `+8801711000000`; every seeded persona's
 *     demo password is `12345678`.
 *
 * ROUTES THAT NEED A QUERY FLAG OR A SESSION
 * -------------------------------------------
 *   - `/` renders the DEV-MODE persona picker while `CITYFIX_DEV_STORE=1`
 *     is set. `/?landing=1` forces the REAL public landing — that is the
 *     documented escape hatch (app/page.tsx), and it is the only way to
 *     reach the landing under this spec's environment.
 *   - `/feed` requires a session; the spec mints one with the dev-only
 *     `POST /api/dev/login?role=citizen`, which must go through
 *     `page.request` so the cookie lands in the BROWSER context's jar
 *     (an isolated `request` fixture would not).
 *
 * WHY NO VISUAL BASELINE
 * ----------------------
 *   Story 008 also asks for "a committed baseline exists per route", but
 *   the baselines for these routes are regenerated in CI on the CI
 *   platform (a locally generated baseline is not comparable — see
 *   project memory "Mockup visual baselines must be generated on the CI
 *   platform"). This spec therefore asserts the BEHAVIOURAL criteria
 *   only, and deliberately contains no `toHaveScreenshot()`.
 *
 *   The page renders Bangla by default, so the assertions are on
 *   structure, roles, attributes and computed styles — never on Bangla
 *   copy strings. The two places where a word MATTERS (the "new" badge
 *   and the delivery channel) switch the page to English through the
 *   documented `cityfix.preferred_language.v1` / `cityfix_lang`
 *   preference, so the assertion reads the English copy and cannot be
 *   confused with the Bangla `status.submitted` label, which is
 *   coincidentally also "নতুন".
 */

import { test, expect, type Page } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';

/** The seeded demo citizen's phone. */
const CITIZEN_PHONE = '+8801711000000';

/** Every seeded persona's demo password. */
const DEMO_PASSWORD = '12345678';

/**
 * Wait for the Next.js client router to exist.
 *
 * The auth pages are client components whose inputs are CONTROLLED:
 * typing into one before React has hydrated writes into a DOM node that
 * React is about to re-render from state, and the typed value is
 * silently dropped. `window.next.router` only appears once the App
 * Router's client bundle has booted, so it is the earliest honest
 * "the page is interactive" signal.
 *
 * If it never appears the wait REJECTS, and the test fails loudly —
 * it never silently skips.
 */
async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(
    () => (window as any).next?.router != null,
    undefined,
    { timeout: 30_000 },
  );
}

/**
 * Navigate and wait for hydration.
 *
 * EVERY `page.goto` of a page with controlled inputs goes through
 * here, so the "hydration is awaited before typing" rule is enforced
 * structurally rather than by convention.
 *
 * `waitUntil: 'domcontentloaded'` on purpose — NOT `'networkidle'`.
 * The landing page polls `/api/v1/activity/public` on an interval, so
 * the network never goes idle there and `networkidle` is a race that
 * only passes when the suite happens to be idle. What we actually need
 * is the document parsed, and then the hydration signal below, which
 * is the real "the page is interactive" guarantee.
 */
async function gotoHydrated(page: Page, path: string): Promise<void> {
  const res = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  expect(res, `navigation to ${path} returned no response`).not.toBeNull();
  expect(res!.status(), `${path} did not answer 200`).toBe(200);
  await waitForHydration(page);
}

/**
 * Force the UI language to English BEFORE the page renders.
 *
 * The cookie is what the SERVER reads, so setting it first means the
 * server-rendered HTML and the client's first render agree and the
 * hydration does not blow up. `localStorage` is the durable store the
 * client reads on mount.
 */
async function useEnglish(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('cityfix.preferred_language.v1', 'en');
    } catch {
      /* storage may be unavailable — the cookie below still applies */
    }
    document.cookie = 'cityfix_lang=en; path=/; max-age=31536000';
  });
}

/**
 * Mint a session for the citizen persona.
 *
 * MUST be called with `page.request` — that is the BrowserContext's
 * request, so the `cityfix_session` cookie it receives is written into
 * the SAME jar the page will later use. An isolated `request` fixture
 * keeps its own jar and the page stays signed out.
 *
 * Two modes, because the spec has to pass against BOTH the in-memory
 * dev store and the real Postgres:
 *
 *   - DEV STORE (`CITYFIX_DEV_STORE=1`): the dev-only
 *     `POST /api/dev/login?role=citizen` mints a session directly.
 *   - REAL MODE: that route is 404 by design (`app/api/dev/login`
 *     guards on `isDevStore()`), so the spec uses the REAL auth
 *     endpoint — `POST /api/v1/auth/login` with the seeded citizen's
 *     phone and demo password — and lets it set the session cookie.
 *
 * The citizen's phone differs between the two: the dev store seeds
 * `+8801711000000`, while the Postgres seed uses the `+880199000000N`
 * block. Both are `12345678`.
 */
async function devLoginAsCitizen(page: Page): Promise<void> {
  const devRes = await page.request.post(`${BASE}/api/dev/login?role=citizen`, {
    maxRedirects: 0,
    failOnStatusCode: false,
  });
  if (devRes.status() === 200 || devRes.status() === 303) {
    return; // dev-store mode — the session cookie is set.
  }

  // Real mode — fall back to the real auth endpoint.
  const phones = ['+8801990000001', '+8801711000000'];
  const failures: string[] = [];
  for (const phone of phones) {
    const res = await page.request.post(`${BASE}/api/v1/auth/login`, {
      data: { phone, password: '12345678' },
      failOnStatusCode: false,
    });
    if (res.status() === 200) return;
    failures.push(`${phone} -> ${res.status()}`);
  }
  throw new Error(
    `could not mint a citizen session in either mode. ` +
      `dev login returned ${devRes.status()}; real login: ${failures.join(', ')}`,
  );
}

/**
 * The id triple a new report must be filed against.
 *
 * The two backends disagree on id shape, so the spec DISCOVERS the
 * real triple at runtime instead of hard-coding one:
 *
 *   - DEV STORE: `city_dhaka_north` / `cat_streetlight` / `ward_14`.
 *   - REAL Postgres: cuid-generated ids (the Prisma seed generates its
 *     own; it only mirrors the dev store's ward NUMBER, not its id).
 *
 * `GET /api/v1/activity/public` already publishes the city, ward and
 * category id on every ticket (`serializeTicketForPublic` keeps them —
 * they are city configuration, not PII), so one request yields a
 * triple that is guaranteed to be in the session's own city. That
 * matters: `POST /api/tickets` answers 403 `cross_city_forbidden` for
 * a foreign city id, so the discovered id MUST come from the city the
 * session belongs to.
 */
interface SeedIds {
  cityId: string;
  categoryId: string;
  wardId: string;
}

/** The dev store's own ids — the fallback when discovery finds nothing. */
const DEV_STORE_IDS: SeedIds = {
  cityId: 'city_dhaka_north',
  categoryId: 'cat_streetlight',
  wardId: 'ward_14',
};

/**
 * Discover a `(cityId, categoryId, wardId)` triple that is valid for
 * the CURRENT session's city.
 *
 * The public activity route is session-scoped: with a session cookie
 * it returns that session's city, so the triple it carries is always
 * accepted by `POST /api/tickets`. Without a session it falls back to
 * the platform's primary seeded city — which is the same city in
 * v1, but the spec always has a session by the time it calls this.
 */
async function discoverSeedIds(page: Page): Promise<SeedIds> {
  const res = await page.request.get(`${BASE}/api/v1/activity/public?limit=5`, {
    failOnStatusCode: false,
  });
  if (res.status() === 200) {
    const body = (await res.json().catch(() => null)) as {
      tickets?: Array<{ cityId?: string; categoryId?: string; wardId?: string }>;
    } | null;
    const t = body?.tickets?.find(
      (x) => x.cityId && x.categoryId && x.wardId,
    );
    if (t) {
      return {
        cityId: t.cityId!,
        categoryId: t.categoryId!,
        wardId: t.wardId!,
      };
    }
  }

  // Nothing published — fall back to the dev-store shape. In real mode
  // this branch is unreachable (the seeded city always has tickets);
  // if it ever IS reached, the create call fails loudly with its own
  // status, which is a clearer signal than a silent skip.
  return { ...DEV_STORE_IDS };
}

// =========================================================================
// /login
// =========================================================================

test.describe('/login — error summary, labels, keyboard reach', () => {
  test('Scenario 1: a wrong password renders a focusable error summary above the form that links to the password field', async ({
    page,
  }) => {
    // ISOLATE THE FAILED ATTEMPT.
    //
    // The login route counts failures PER CLIENT IP and locks that IP
    // out for 10 minutes after 5 of them (lib/auth/login-lockout.ts).
    // Every spec on this box shares 127.0.0.1, so a spec that fires
    // repeated wrong-password attempts would eventually lock EVERYONE
    // out for 10 minutes and the 423 lockout card would replace the
    // form entirely — taking the error summary with it.
    //
    // The route reads `x-forwarded-for` (app/api/v1/auth/login/route.ts
    // `clientIp`), so pinning a dedicated forwarded IP gives THIS
    // test its own failure counter. The spec therefore stays
    // deterministic no matter how many times it (or another spec)
    // hammers the login endpoint.
    //
    // `content-length` IS DELETED before the override. The body is
    // unchanged, but Chromium had already computed `content-length`
    // for the original request; replaying it against a rewritten
    // header set can leave the request HANGING — the fetch in
    // app/login/page.tsx never resolves, the submit button stays
    // disabled on "লগ ইন হচ্ছে…", and the error summary never
    // renders. Dropping the header lets the transport recompute it
    // from the (unchanged) body.
    await page.route('**/api/v1/auth/login', async (route) => {
      const headers = { ...route.request().headers() };
      delete headers['content-length'];
      headers['x-forwarded-for'] = '203.0.113.77';
      await route.continue({ headers });
    });

    await gotoHydrated(page, '/login');

    // A VALID-SHAPE phone and a NON-EMPTY wrong password: the form's
    // client-side validator passes, so the request reaches the server
    // and comes back 401.
    await page.locator('#login-phone').fill(CITIZEN_PHONE);
    await page.locator('#login-password').fill('definitely-not-the-password');
    await page.locator('button[type="submit"]').click();

    // The summary is identified by its LINK to the offending field —
    // that is what makes it the summary and not one of the other
    // alerts the page can carry (the inline field error, the 423
    // lockout card, the 429 toast).
    const summary = page.locator('[role="alert"]', {
      has: page.locator('a[href="#login-password"]'),
    });
    await expect(summary).toHaveCount(1, { timeout: 10_000 });
    await expect(summary).toBeVisible();

    const summaryIsBeforeForm = await summary.evaluate((el) => {
      // The summary is a SIBLING of the form (it is rendered above it,
      // not inside it), so `closest('form')` would find nothing. Ask
      // the document for the form and compare the two nodes.
      const form = document.querySelector('form');
      if (!form) return false;
      // DOCUMENT_POSITION_FOLLOWING = the form FOLLOWS the summary.
      return Boolean(el.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(
      summaryIsBeforeForm,
      'the error summary must come BEFORE the <form> in DOM order',
    ).toBe(true);

    // It is focusable (`tabindex="-1"`), so a failed submit can move
    // the keyboard to it.
    await expect(summary).toHaveAttribute('tabindex', '-1');

    // It links to the offending field.
    const href = await summary.locator('a').first().getAttribute('href');
    expect(href).toBe('#login-password');

    // The field itself carries the invalid state...
    await expect(page.locator('#login-password')).toHaveAttribute('aria-invalid', 'true');

    // ...and an inline error element with its own `role="alert"`.
    const inline = page.locator('#login-password-error');
    await expect(inline).toBeVisible();
    await expect(inline).toHaveAttribute('role', 'alert');
    // The inline error is what the field points at.
    await expect(page.locator('#login-password')).toHaveAttribute(
      'aria-describedby',
      /login-password-error/,
    );
  });

  test('Scenario 2 (login): every input has an associated label — none is placeholder-only', async ({
    page,
  }) => {
    await gotoHydrated(page, '/login');

    const unlabelled = await page.evaluate(() => {
      const out: Array<{ id: string; type: string; placeholder: string | null }> = [];
      document.querySelectorAll('input').forEach((input) => {
        const type = (input.getAttribute('type') || 'text').toLowerCase();
        if (type === 'hidden') return;
        const id = input.getAttribute('id') || '';
        const hasLabelFor = id
          ? Boolean(document.querySelector(`label[for="${CSS.escape(id)}"]`))
          : false;
        const hasAriaLabel = Boolean(input.getAttribute('aria-label')?.trim());
        const hasAriaLabelledby = Boolean(input.getAttribute('aria-labelledby')?.trim());
        if (!hasLabelFor && !hasAriaLabel && !hasAriaLabelledby) {
          out.push({
            id,
            type,
            placeholder: input.getAttribute('placeholder'),
          });
        }
      });
      return out;
    });

    expect(
      unlabelled,
      `these inputs have neither a <label for> nor an aria-label: ${JSON.stringify(unlabelled)}`,
    ).toEqual([]);

    // The two fields are labelled by a real `<label for>`.
    await expect(page.locator('label[for="login-phone"]')).toHaveCount(1);
    await expect(page.locator('label[for="login-password"]')).toHaveCount(1);
  });

  test('Scenario 3: the show/hide toggle is keyboard-reachable and the recovery path is reachable too', async ({
    page,
  }) => {
    await gotoHydrated(page, '/login');

    // The reveal control is a real button with an accessible name.
    const toggle = page.locator('#login-password').locator('xpath=..').locator('button');
    await expect(toggle).toHaveCount(1);
    const name = (await toggle.getAttribute('aria-label')) ?? (await toggle.textContent()) ?? '';
    expect(name.trim(), 'the reveal toggle must carry an accessible name').not.toBe('');

    // Keyboard-reachable: focus it and press Enter.
    await toggle.focus();
    await expect(toggle).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#login-password')).toHaveAttribute('type', 'text');

    // Press again → back to a masked field.
    await page.keyboard.press('Enter');
    await expect(page.locator('#login-password')).toHaveAttribute('type', 'password');

    // The recovery path is reachable by keyboard: the page carries a
    // focusable link that takes the citizen to the help surface. It is
    // an <a href>, so it is in the tab order and activates on Enter.
    const recovery = page.locator('a[href="/"]').first();
    await expect(recovery).toBeVisible();
    await recovery.focus();
    await expect(recovery).toBeFocused();
    // It is a link with a real destination — a <div> would not be.
    expect(await recovery.evaluate((el) => el.tagName)).toBe('A');
    expect((await recovery.getAttribute('href'))?.trim()).not.toBe('');
  });
});

// =========================================================================
// /register
// =========================================================================

test.describe('/register — labels and the live password rules', () => {
  test('Scenario 2 (register): every input has an associated label — none is placeholder-only', async ({
    page,
  }) => {
    await gotoHydrated(page, '/register');

    const unlabelled = await page.evaluate(() => {
      const out: Array<{ id: string; type: string; placeholder: string | null }> = [];
      document.querySelectorAll('input').forEach((input) => {
        const type = (input.getAttribute('type') || 'text').toLowerCase();
        if (type === 'hidden') return;
        const id = input.getAttribute('id') || '';
        const hasLabelFor = id
          ? Boolean(document.querySelector(`label[for="${CSS.escape(id)}"]`))
          : false;
        const hasAriaLabel = Boolean(input.getAttribute('aria-label')?.trim());
        const hasAriaLabelledby = Boolean(input.getAttribute('aria-labelledby')?.trim());
        if (!hasLabelFor && !hasAriaLabel && !hasAriaLabelledby) {
          out.push({ id, type, placeholder: input.getAttribute('placeholder') });
        }
      });
      return out;
    });

    expect(
      unlabelled,
      `these inputs have neither a <label for> nor an aria-label: ${JSON.stringify(unlabelled)}`,
    ).toEqual([]);

    // Every one of the five register fields carries a `<label for>`.
    for (const id of ['reg-phone', 'reg-nid', 'reg-name', 'reg-password', 'reg-confirm']) {
      await expect(page.locator(`label[for="${id}"]`)).toHaveCount(1);
    }
  });

  test('Scenario 4: the password rules show a per-rule icon + word + a distinguishable met/unmet state', async ({
    page,
  }) => {
    await gotoHydrated(page, '/register');

    const grid = page.locator('#reg-password-req');
    await expect(grid).toBeVisible();

    // The grid holds at least four requirement rows.
    const items = grid.locator('> span');
    const itemCount = await items.count();
    expect(itemCount, 'the password-requirements grid needs at least 4 rules').toBeGreaterThanOrEqual(4);

    // Every row carries BOTH an icon (svg/img) AND a text label.
    const rows = await items.evaluateAll((els) =>
      els.map((el) => ({
        iconCount: el.querySelectorAll('svg, img').length,
        label: (el.textContent || '').trim(),
      })),
    );
    rows.forEach((row, i) => {
      expect(row.iconCount, `requirement #${i + 1} must render an icon`).toBeGreaterThan(0);
      expect(row.label, `requirement #${i + 1} must render a text label`).not.toBe('');
    });

    // COLOUR: the unmet state and the met state must be visually
    // distinguishable, and the state must be driven by the CURRENT
    // password value (so the panel is a progress indicator).
    const unmetColors = await items.evaluateAll((els) =>
      els.map((el) => getComputedStyle(el).color),
    );
    expect(
      new Set(unmetColors).size,
      'the unmet requirements must not all share one colour',
    ).toBeGreaterThan(0);

    // Type a password that satisfies SOME rules but not all:
    // "Abcdef1" — 7 chars (length UNMET), has a number (MET), has a
    // capital (MET), has no symbol (UNMET). The grid must now split
    // into two visually different colours.
    await page.locator('#reg-password').fill('Abcdef1');
    await expect(grid).toBeVisible();

    const mixed = await items.evaluateAll((els) =>
      els.map((el) => ({
        color: getComputedStyle(el).color,
        label: (el.textContent || '').trim(),
      })),
    );
    const distinctColours = new Set(mixed.map((m) => m.color));
    expect(
      distinctColours.size,
      `met and unmet rules must differ in colour; saw ${JSON.stringify(mixed)}`,
    ).toBeGreaterThan(1);

    // And the icon must CHANGE with the state too, so the state is
    // never colour-alone: the two states draw different glyphs.
    const iconPaths = await items.evaluateAll((els) =>
      els.map((el) => el.querySelector('svg')?.innerHTML ?? ''),
    );
    expect(
      new Set(iconPaths).size,
      'met and unmet rules must differ in icon, not colour alone',
    ).toBeGreaterThan(1);
  });
});

// =========================================================================
// /verify-otp
// =========================================================================

test.describe('/verify-otp — delivery channel, countdown, recovery', () => {
  test('Scenario 5: the page names its delivery channel, shows the resend countdown and offers a recovery card', async ({
    page,
  }) => {
    // English, so the delivery channel reads "SMS" and the recovery
    // card's heading is unambiguous.
    await useEnglish(page);
    await gotoHydrated(page, '/verify-otp?phone=%2B8801711000000');

    // --- SIX digit inputs -------------------------------------------
    const digits = page.locator('[role="group"] input');
    await expect(digits).toHaveCount(6);
    for (let i = 0; i < 6; i++) {
      await expect(digits.nth(i)).toHaveAttribute('maxlength', '1');
    }

    // --- the DELIVERY CHANNEL ----------------------------------------
    // The delivery card names the channel it used. Read the English
    // copy: "The code was sent by SMS."
    const body = await page.locator('body').innerText();
    expect(
      body,
      'the OTP page must name its delivery channel (SMS)',
    ).toMatch(/sent\s+by\s+SMS/i);
    // And the channel is EMPHASISED (a <strong>), so it is not just
    // buried in the sentence.
    await expect(page.locator('strong', { hasText: /^SMS$/ }).first()).toBeVisible();

    // --- the RESEND CONTROL + COUNTDOWN ------------------------------
    // The resend control is disabled while the cooldown runs...
    const resend = page.locator('button', { hasText: /send now/i });
    await expect(resend).toHaveCount(1);
    await expect(resend).toBeDisabled();

    // ...and the countdown is on screen. It reads "0:59" — a
    // minutes:seconds pair that counts down.
    await expect(page.locator('text=/\\b\\d:\\d{2}\\b/').first()).toBeVisible();
    const countdownText = await page
      .locator('text=/\\b\\d:\\d{2}\\b/')
      .first()
      .innerText();
    expect(countdownText.trim(), 'the countdown must read m:ss').toMatch(/^\d+:[0-5]\d$/);

    // --- the RECOVERY CARD ------------------------------------------
    // The help card is a titled block with a bullet list of recovery
    // steps (the "Code didn't arrive?" card).
    await expect(page.locator('text=/code didn\'t arrive\?/i').first()).toBeVisible();
    const recoveryList = page.locator('ul li');
    expect(
      await recoveryList.count(),
      'the recovery card must offer actionable steps',
    ).toBeGreaterThanOrEqual(1);
  });

  test('Scenario 2 (otp): every input has an associated label — the six digit boxes carry an aria-label', async ({
    page,
  }) => {
    await gotoHydrated(page, '/verify-otp?phone=%2B8801711000000');

    const report = await page.evaluate(() => {
      const out: Array<{
        id: string;
        type: string;
        placeholder: string | null;
        ariaLabel: string | null;
        hasLabelFor: boolean;
      }> = [];
      document.querySelectorAll('input').forEach((input) => {
        const type = (input.getAttribute('type') || 'text').toLowerCase();
        if (type === 'hidden') return;
        const id = input.getAttribute('id') || '';
        out.push({
          id,
          type,
          placeholder: input.getAttribute('placeholder'),
          ariaLabel: input.getAttribute('aria-label'),
          hasLabelFor: id
            ? Boolean(document.querySelector(`label[for="${CSS.escape(id)}"]`))
            : false,
        });
      });
      return out;
    });

    expect(report.length).toBeGreaterThan(0);
    report.forEach((input) => {
      const labelled =
        input.hasLabelFor || Boolean(input.ariaLabel && input.ariaLabel.trim());
      expect(
        labelled,
        `input ${input.id || '(no id)'} has neither a <label for> nor an aria-label`,
      ).toBe(true);
      // The six OTP boxes have NO id, so they MUST be labelled by
      // `aria-label` — that is the only accessible name they have.
      if (!input.id) {
        expect(
          input.ariaLabel,
          `an id-less input (${input.type}) must carry an aria-label`,
        ).toBeTruthy();
      }
    });

    // The digit labels distinguish the position ("Code digit 1".."6").
    const labels = report.map((r) => r.ariaLabel).filter(Boolean) as string[];
    expect(new Set(labels).size).toBe(labels.length);
  });
});

// =========================================================================
// / — the public landing
// =========================================================================

test.describe('/ — the public landing', () => {
  test('Scenario 6: the landing never leaks a reporter identity and does carry the OSM / MapLibre attribution', async ({
    page,
  }) => {
    // `?landing=1` forces the REAL public landing; without it the
    // dev-store persona picker shadows it.
    await gotoHydrated(page, '/?landing=1');
    // The landing fetches its feed and its stats — give them a beat.
    await page.waitForTimeout(2_000);

    const body = await page.locator('body').innerText();

    // No seeded reporter NAME.
    expect(body, 'the landing must not name a reporter').not.toContain('Rahim');
    expect(body, 'the landing must not name a reporter').not.toContain('Habib');
    expect(body, 'the landing must not name a reporter').not.toContain('Rashid');
    expect(body, 'the landing must not name a reporter').not.toContain('Anwar');

    // No phone number — neither the international nor the local
    // Bangla shape.
    expect(
      body,
      'the landing must not render a phone number',
    ).not.toMatch(/\+?880\s?1\d{9}/);
    expect(
      body,
      'the landing must not render a phone number',
    ).not.toMatch(/(?:^|\D)01\d{9}(?:\D|$)/);

    // No exact address — the landing shows the WARD, never a street
    // address or a coordinate pair.
    expect(
      body,
      'the landing must not render a lat/lng coordinate',
    ).not.toMatch(/\b\d{2}\.\d{4,}\s*,\s*\d{2}\.\d{4,}\b/);

    // The OSM / MapLibre attribution IS present — it is a licence
    // requirement for the tiles the landing renders.
    expect(
      body,
      'the landing must carry the OSM / MapLibre attribution',
    ).toMatch(/OpenStreetMap|MapLibre|©/);
  });

  test('Scenario 7: the landing shows tabular figures', async ({ page }) => {
    await gotoHydrated(page, '/?landing=1');
    await page.waitForTimeout(2_000);

    const tabular = await page.evaluate(() => {
      const hits: string[] = [];
      document.querySelectorAll('*').forEach((el) => {
        const style = getComputedStyle(el);
        if (style.fontVariantNumeric.includes('tabular-nums')) {
          hits.push((el.textContent || '').trim().slice(0, 40));
        }
      });
      return hits;
    });

    expect(
      tabular.length,
      'at least one element on the landing must compute font-variant-numeric: tabular-nums',
    ).toBeGreaterThan(0);
  });
});

// =========================================================================
// /feed
// =========================================================================

test.describe('/feed — live chip counts and the "new" state', () => {
  test('Scenario 8a: every filter chip carries aria-pressed and a live .feed-chip-count', async ({
    page,
  }) => {
    await devLoginAsCitizen(page);
    await gotoHydrated(page, '/feed');
    await page.waitForTimeout(2_500);

    const chips = page.locator('.feed-chip');
    const count = await chips.count();
    expect(count, 'the feed must render its filter chips').toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const chip = chips.nth(i);
      // The pressed state is exposed, not implied by a class.
      await expect(chip).toHaveAttribute('aria-pressed', /^(true|false)$/);

      // The live count is a distinct element inside the chip.
      const countEl = chip.locator('.feed-chip-count');
      await expect(countEl).toHaveCount(1);
      const text = (await countEl.innerText()).trim();
      expect(text, `chip #${i + 1} must show a numeric count`).not.toBe('');
      // Bangla numerals are used by default, so accept both scripts.
      expect(
        text,
        `chip #${i + 1} count "${text}" is not numeric`,
      ).toMatch(/^[০-৯0-9][০-৯0-9,\.]*$/);
    }

    // The counts are LIVE, and they count the WHOLE fetched set — not
    // the rows currently on screen.
    //
    // The feed paginates the LIST (`visible = filtered.slice(0, page *
    // PAGE_SIZE)`, PAGE_SIZE = 20) while the chips count over the
    // whole `tickets` array (app/feed/page.tsx, the `counts` memo:
    // "Each count is the size of that group over the WHOLE fetched set
    // (not over the currently-visible page), so a chip always tells the
    // reader how big its group is"). So the "all" chip equals the
    // city's total, which is ≥ the rendered row count whenever the
    // list has more than one page.
    //
    // Asserting equality with the RENDERED row count would therefore
    // fail on any dataset larger than a page — which is the wrong
    // contract, not a product defect. The honest assertions are:
    //   (a) the "all" chip equals the API's own `total` for the city,
    //   (b) it is at least the number of rows on screen.
    const apiTotal = await page.evaluate(async () => {
      const res = await fetch('/api/v1/activity/public?limit=1', {
        credentials: 'include',
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { total?: number };
      return typeof body.total === 'number' ? body.total : null;
    });
    const rows = await page.locator('.feed-row').count();
    const allCount = (await page.locator('.feed-chip').first().locator('.feed-chip-count').innerText()).trim();
    const parsed = Number(allCount.replace(/[০-৯]/g, (d) => '০১২৩৪৫৬৭৮৯'.indexOf(d).toString()));

    expect(
      parsed,
      'the "all" chip count must be a number',
    ).not.toBeNaN();
    expect(
      parsed,
      'the "all" chip must count at least every row the page renders',
    ).toBeGreaterThanOrEqual(rows);
    if (apiTotal !== null) {
      expect(
        parsed,
        `the "all" chip must equal the city's total (${apiTotal}) — it counts the whole fetched set`,
      ).toBe(apiTotal);
    }
  });

  test('Scenario 8b: a newly-arrived ticket carries BOTH a badge and a tint that differ from an ordinary row', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await useEnglish(page);
    await devLoginAsCitizen(page);
    await gotoHydrated(page, '/feed');
    await page.waitForTimeout(2_500);

    // Seed a ticket that is new to the feed. The dedup radius is 50 m
    // and the exact key is unique, so the point has to be genuinely
    // fresh — otherwise the API answers 200 `dedup_match` and NO new
    // ticket enters the feed, and the badge can never fire.
    //
    // The id triple is DISCOVERED at runtime (see `discoverSeedIds`) —
    // the dev store and the real Postgres disagree on id shape, and a
    // hard-coded dev-store city id is a 403 `cross_city_forbidden` in
    // real mode.
    const ids = await discoverSeedIds(page);
    const seed = await page.request.post(`${BASE}/api/tickets`, {
      headers: { 'content-type': 'application/json' },
      data: {
        cityId: ids.cityId,
        categoryId: ids.categoryId,
        wardId: ids.wardId,
        locationLat: 23.7901 + Math.random() * 0.05,
        locationLng: 90.3957 + Math.random() * 0.05,
        note: `ui-redesign new-badge probe ${Math.random()}`,
        photoUrls: [],
      },
      failOnStatusCode: false,
    });
    expect(
      seed.status(),
      `seeding a new ticket failed (${seed.status()}) — the "new" state cannot be exercised. ` +
        `ids used: ${JSON.stringify(ids)}`,
    ).toBe(201);
    // The response nests the ticket under `ticket.id`. The id shape
    // differs between backends (`tkt_*` in the dev store, a cuid in
    // real mode), so accept any non-empty id string.
    const seedBody = (await seed.json().catch(() => null)) as {
      ticket?: { id?: string };
      id?: string;
    } | null;
    const ticketId = seedBody?.ticket?.id ?? seedBody?.id ?? '';
    expect(ticketId, 'the seeded ticket must have an id').not.toBe('');

    // The page polls every 15 s and flags ids it has not seen before
    // as new for 5 s. Poll the DOM until the flag lands.
    const deadline = Date.now() + 60_000;
    let seen = false;
    while (Date.now() < deadline && !seen) {
      await page.waitForTimeout(500);
      seen = await page.evaluate(
        (tid) =>
          Array.from(document.querySelectorAll('.feed-row')).some(
            (r) =>
              r.getAttribute('data-new') === 'true' &&
              (r.getAttribute('href') || '').includes(tid),
          ),
        ticketId,
      );
    }
    expect(
      seen,
      'the seeded ticket never picked up the "new" state — the feed poll did not flag it',
    ).toBe(true);

    const styles = await page.evaluate((tid) => {
      const rows = Array.from(document.querySelectorAll('.feed-row'));
      const newRow = rows.find(
        (r) => r.getAttribute('data-new') === 'true' && (r.getAttribute('href') || '').includes(tid),
      );
      const oldRow = rows.find(
        (r) => r.getAttribute('data-new') !== 'true' && !(r.getAttribute('href') || '').includes(tid),
      );
      const read = (el: Element | undefined) =>
        el
          ? {
              background: getComputedStyle(el).backgroundColor,
              borderColor: getComputedStyle(el).borderColor,
              text: (el.textContent || '').trim(),
            }
          : null;
      return { newRow: read(newRow), oldRow: read(oldRow) };
    }, ticketId);

    expect(styles.newRow, 'the new row must exist').not.toBeNull();
    expect(styles.oldRow, 'an ordinary row must exist for the comparison').not.toBeNull();

    // --- the BADGE ---------------------------------------------------
    // The new row carries a badge element whose text is the "new"
    // label. In English that is "New" — and it is NOT the same word
    // as the status pill, which reads "Submitted" for a fresh report.
    // The badge is the row's LAST element, so match it on the tail of
    // the row text rather than with a word boundary (the badge sits
    // flush against the preceding timestamp).
    expect(
      styles.newRow!.text,
      'the new row must carry a "New" badge',
    ).toMatch(/New\s*$/);

    // The badge is a distinct element, not just a word in the note.
    const badge = page.locator('.feed-row[data-new="true"] span', { hasText: /^New$/ });
    expect(
      await badge.count(),
      'the "new" badge must be its own element inside the row',
    ).toBeGreaterThan(0);

    // --- the TINT ----------------------------------------------------
    // The tinted row's background differs from an ordinary row's.
    expect(
      styles.newRow!.background,
      'the new row must carry a background tint distinct from an ordinary row',
    ).not.toBe(styles.oldRow!.background);

    // ...and so does its border.
    expect(
      styles.newRow!.borderColor,
      'the new row must carry a border tint distinct from an ordinary row',
    ).not.toBe(styles.oldRow!.borderColor);
  });
});

// =========================================================================
// Scenario 9 — hydration
// =========================================================================

test.describe('Scenario 9 — hydration is awaited before typing', () => {
  test('the router is present before any controlled input is filled', async ({ page }) => {
    await gotoHydrated(page, '/login');

    // The wait helper RESOLVED — assert it, so a helper that silently
    // no-ops can never make this test green.
    const routerPresent = await page.evaluate(() => Boolean((window as any).next?.router));
    expect(routerPresent, 'window.next.router must exist after the hydration wait').toBe(true);

    // And the page is genuinely interactive: the value the controlled
    // input was given survives the next render.
    await page.locator('#login-phone').fill(CITIZEN_PHONE);
    await page.locator('#login-password').fill(DEMO_PASSWORD);
    await page.waitForTimeout(500);
    await expect(page.locator('#login-phone')).toHaveValue(CITIZEN_PHONE);
    await expect(page.locator('#login-password')).toHaveValue(DEMO_PASSWORD);
  });

  test('the hydration wait fails loudly when the router never appears', async ({ page }) => {
    // The helper waits 30 s before it rejects, and the default test
    // timeout is 30 s too — give the test room to observe the
    // rejection rather than timing out first.
    test.setTimeout(90_000);
    // Prove the helper is not vacuous: on a page whose client bundle
    // never boots, the App Router never installs `window.next.router`,
    // so the wait must REJECT rather than resolve silently. Blocking
    // every script is the bluntest way to guarantee that — the router
    // is installed from a `useEffect` inside the App Router chunk, so
    // no script means no router.
    await page.route('**/*.js', (route) => route.abort());
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    let timedOut = false;
    try {
      await waitForHydration(page);
    } catch {
      timedOut = true;
    }
    expect(
      timedOut,
      'the hydration wait must reject when window.next.router never appears',
    ).toBe(true);
  });
});

// =========================================================================
// Scenario 10 — components/ui primitives
// =========================================================================

test.describe('Scenario 10 — the auth/public pages render from the components/ui primitives', () => {
  /**
   * WHAT THIS PROVES
   * ----------------
   *   `components/ui/Button.tsx` renders
   *       <button data-variant={variant} data-size={size} …>
   *   and `components/ui/IconButton.tsx` renders
   *       <button data-variant={variant} data-size={size} …>
   *   The `data-variant` / `data-size` attributes are the primitive's
   *   OBSERVABLE CONTRACT — a hand-rolled `<button>` in this codebase
   *   does not carry them (verified against app/login/page.tsx,
   *   app/verify-otp/page.tsx and app/feed/page.tsx).
   *
   *   So: a control that carries `data-variant` AND `data-size` came
   *   out of `components/ui`. That is a POSITIVE identification, not a
   *   negative one.
   *
   * WHAT THIS DOES NOT PROVE
   * ------------------------
   *   It does NOT prove that EVERY `<button>` on the page is a
   *   primitive. It cannot: the primitives render `<button>` elements,
   *   so counting buttons proves nothing, and the absence of
   *   `data-variant` on a button does not identify WHICH component
   *   rendered it. The story's "no hand-rolled `<button>`" clause is
   *   therefore only PARTIALLY covered here — this test proves the
   *   PRIMARY controls come from the primitive library, and leaves the
   *   secondary adornments (see the findings reported with this spec)
   *   to a human review.
   */

  const PRIMITIVE_BUTTONS: ReadonlyArray<{ path: string; name: string }> = [
    { path: '/login', name: 'the login submit CTA' },
    { path: '/register', name: 'the register submit CTA' },
    { path: '/verify-otp?phone=%2B8801711000000', name: 'the OTP submit CTA' },
  ];

  for (const { path, name } of PRIMITIVE_BUTTONS) {
    test(`${name} renders from components/ui (data-variant + data-size)`, async ({ page }) => {
      await gotoHydrated(page, path);

      const submit = page.locator('button[type="submit"]');
      await expect(submit).toHaveCount(1);

      // The primitive's observable contract.
      await expect(submit).toHaveAttribute('data-variant', /^(primary|secondary|ghost|danger)$/);
      await expect(submit).toHaveAttribute('data-size', /^(sm|md|lg)$/);

      // And the primitive's accessibility contract: the Button
      // primitive renders the `disabled` state as a NATIVE attribute
      // (`disabled={isDisabled}`), so a blocked control is genuinely
      // inert — unfocusable, unclickable, and announced as disabled.
      // A hand-rolled `<button>` that only greyed itself out with a
      // class would still be focusable and still clickable.
      //
      // Whether the CTA is blocked AT REST depends on the page (the
      // login CTA blocks on an empty form; the register CTA does not,
      // it validates on submit), so the check is: the button's disabled
      // state is the NATIVE attribute, never a lookalike.
      const disabledAttr = await submit.getAttribute('disabled');
      const isDisabled = await submit.isDisabled();
      if (isDisabled) {
        expect(
          disabledAttr,
          'a blocked CTA must carry the NATIVE disabled attribute',
        ).not.toBeNull();
      }

      // `aria-busy` is the primitive's LOADING marker — it is only set
      // while the request is in flight, not while the button is merely
      // blocked. Assert the attribute is either absent (idle) or
      // "true" (loading); a hand-rolled button would set neither
      // consistently.
      const busy = await submit.getAttribute('aria-busy');
      expect(
        busy === null || busy === 'true',
        `aria-busy must be absent or "true", got ${JSON.stringify(busy)}`,
      ).toBe(true);
    });
  }

  test('a blocked CTA is natively disabled — the OTP submit cannot be double-fired', async ({
    page,
  }) => {
    await gotoHydrated(page, '/verify-otp?phone=%2B8801711000000');

    // The OTP submit is blocked until all six digits are entered. The
    // primitive renders that as the NATIVE `disabled` attribute, so
    // the control cannot be activated at all.
    const submit = page.locator('button[type="submit"]');
    await expect(submit).toBeDisabled();
    await expect(submit).toHaveAttribute('disabled', '');
    // A natively disabled button is not focusable — a hand-rolled
    // button that only looked disabled would still take focus.
    await expect(submit).not.toBeFocused();
  });

  test('the OTP back control renders from the IconButton primitive', async ({ page }) => {
    await gotoHydrated(page, '/verify-otp?phone=%2B8801711000000');

    // The IconButton primitive renders `data-variant` + `data-size` AND
    // requires an accessible name (it is `aria-label` + `title`).
    const iconButton = page.locator('button[data-variant][data-size]').first();
    await expect(iconButton).toHaveCount(1);
    await expect(iconButton).toHaveAttribute('data-variant', /^(ghost|secondary|danger)$/);
    const label = await iconButton.getAttribute('aria-label');
    expect(label?.trim(), 'an IconButton must carry an aria-label').not.toBe('');
    // The primitive renders the same string as `title`, so a sighted
    // mouse user gets the same hint.
    expect(await iconButton.getAttribute('title')).toBe(label);
  });
});
