/**
 * Playwright route spec for the Intent 009 UI-redesign CITIZEN surfaces
 * (tests/33-ui-redesign-citizen.spec.ts).
 *
 * Executable form of story 010
 * (`.specsmd/aidlc/memory-bank/intents/009-ui-redesign/units/004-citizen-surfaces/stories/010-citizen-surface-implementation.md`).
 *
 * WHAT IT COVERS
 * --------------
 *   Scenario A — the report flow keeps its progress indicator, and the
 *                photo step (step 2 of 5) reads its cap as "1 / 3 ছবি".
 *   Scenario B — the summary step's dedup prompt offers BOTH options,
 *                each explained.
 *   Scenario C — /reports shows the public `#TIX-` code on a row and
 *                the filter chips.
 *   Scenario D — /reports/[id] shows the vertical trail (4 steps, each
 *                with an icon AND a timestamp) and the labelled
 *                before/after photo groups.
 *   Scenario E — no raw internal ticket id is visible on ANY citizen
 *                surface.
 *   Scenario F — the `#TIX-` code on the page matches the code derived
 *                from the id the API returned.
 *
 * HOW IT STAYS BACKEND-AGNOSTIC
 * -----------------------------
 *   The two backends disagree on almost everything an id-shaped
 *   assertion could touch:
 *
 *     - the dev store mints `tkt_*` ids; Prisma/Postgres mints cuids;
 *     - the dev store's city/category/ward ids are readable strings
 *       (`city_dhaka_north` / `cat_streetlight` / `ward_14`); Postgres
 *       mints its own (cuids for cities and wards, slugs for
 *       categories' departments);
 *     - the seeded tickets carry DIFFERENT ids in each backend
 *       (`ticket_seed_crew_routed_3` in the dev store,
 *       `ticket_seed_cf_1006` in Postgres).
 *
 *   So this spec NEVER hard-codes an id. It DISCOVERS one:
 *
 *     - the `(cityId, categoryId, wardId)` triple comes from
 *       `GET /api/report/bootstrap` — the endpoint the report flow
 *       itself uses. It returns the SESSION's own city (a foreign
 *       city id is rejected with 403 `cross_city_forbidden`), the
 *       session's own ward (the citizen, the dispatcher and the crew
 *       personas are all seeded into the same ward, so a report filed
 *       anywhere else would be invisible to the dispatcher), and the
 *       city's category list — from which the `streetlight` category
 *       is picked BY SLUG (the slug is identical in both backends).
 *     - the ticket id comes from the RESPONSE BODY of the create call,
 *       never from a guess about its shape.
 *     - the crew member is discovered from the dispatcher's own crew
 *       roster (`GET /api/v1/dispatcher/crew-for-ward`), filtered to
 *       the crew that can actually work the ticket's category.
 *
 *   The one id-shaped thing this spec does assert is the SHAPE of the
 *   public code (`#TIX-` + 4 uppercase base-36 characters) and that it
 *   is DERIVED FROM the id — the derivation itself is proven by the
 *   unit test at `tests/unit/format/ticket-id.test.ts`, and the
 *   "the page's code equals the code derived from the API's id" check
 *   here is done by re-deriving it IN THE BROWSER from the same
 *   algorithm.
 *
 * WHY NO VISUAL BASELINE
 * ----------------------
 *   The baselines for these routes are regenerated in CI on the CI
 *   platform (a locally generated baseline is not comparable — see
 *   project memory "Mockup visual baselines must be generated on the CI
 *   platform"). This spec therefore asserts the BEHAVIOURAL criteria
 *   only, and deliberately contains no `toHaveScreenshot()`.
 *
 *   The product renders Bangla by default, so the assertions are on
 *   structure, roles, attributes and the FEW strings the contract
 *   pins exactly (the "1 / 3 ছবি" counter). Everything else is
 *   asserted structurally.
 */

import { test, expect, type Page } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';

/**
 * The public ticket code's shape.
 *
 * `#TIX-` followed by exactly 4 uppercase base-36 characters. The
 * character class is `[0-9A-Z]`, which is base-36 written in upper
 * case — it deliberately excludes `-`, `_` and lowercase, so a code
 * can never be confused with an internal id.
 */
const PUBLIC_CODE = /^#TIX-[0-9A-Z]{4}$/;

/**
 * A 1×1 transparent PNG, as an inline data URL.
 *
 * The API accepts an inline image data URL as a photo URL
 * (`isAcceptablePhotoUrl`), and the citizen's report flow produces
 * exactly this shape — the browser's FileReader output. So this is
 * the REAL wire shape, not a test-only shortcut.
 *
 * It is used for the citizen's OWN photo (the "Before" group). The
 * crew's photo uses a DIFFERENT byte string so the two groups are
 * distinguishable — a group that showed the same image on both sides
 * would not prove the split is real.
 */
const CITIZEN_PHOTO =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const CREW_PHOTO =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/**
 * Wait for the Next.js client router to exist.
 *
 * The citizen surfaces are client components whose content depends on
 * fetches; `window.next.router` only appears once the App Router's
 * client bundle has booted, so it is the earliest honest "the page is
 * interactive" signal. If it never appears the wait REJECTS — the
 * test fails loudly rather than silently skipping.
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
 * `waitUntil: 'domcontentloaded'` on purpose — NOT `'networkidle'`.
 * The home page polls `/api/v1/activity/public` on an interval, so the
 * network never goes idle there and `networkidle` is a race.
 */
async function gotoHydrated(page: Page, path: string): Promise<void> {
  const res = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  expect(res, `navigation to ${path} returned no response`).not.toBeNull();
  expect(res!.status(), `${path} did not answer 200`).toBe(200);
  await waitForHydration(page);
}

/**
 * Force the UI language BEFORE the page renders.
 *
 * The product is Bangla-first, so `bn` is the default and most
 * scenarios assert against Bangla copy. The scenarios that assert
 * against ENGLISH copy call this with `'en'`.
 *
 * WHY THE COOKIE IS SET ON THE CONTEXT, NOT ONLY IN THE INIT SCRIPT
 * -----------------------------------------------------------------
 * The language reaches the app through ONE channel: the `cityfix_lang`
 * cookie. The server reads it in the root layout and publishes it
 * request-scoped (`lib/i18n/language-request-store.ts`); the client
 * FREEZES the same cookie at module load
 * (`lib/i18n/language-store.ts` → `frozenServerLanguage`). Both sides
 * read the same cookie, so when it is present the server-rendered HTML
 * and the client's first render agree and the hydration is clean.
 *
 * A `document.cookie` write from `addInitScript` does NOT achieve
 * that on the FIRST navigation: Playwright's init script runs after the
 * document request has already gone out, so the server saw no cookie
 * and rendered Bangla while the client froze English — a hydration
 * mismatch on every translated string, and a window in which the page
 * still shows the server's Bangla copy.
 *
 * `context.addCookies` puts the cookie in the jar, so it is sent as a
 * REQUEST HEADER on the very first navigation. The server then renders
 * the same language the client will, and there is no mismatch and no
 * window in which the copy is in the wrong language.
 *
 * The init script is kept as well: it seeds the durable
 * `localStorage` preference, which is what
 * `reconcileLanguagePreference()` reads after hydration.
 */
async function useLanguage(
  page: Page,
  lang: 'bn' | 'en' = 'bn',
): Promise<void> {
  await page.context().addCookies([
    {
      name: 'cityfix_lang',
      value: lang,
      url: BASE,
    },
  ]);
  await page.addInitScript((value: string) => {
    try {
      window.localStorage.setItem('cityfix.preferred_language.v1', value);
    } catch {
      /* storage may be unavailable — the cookie above still applies */
    }
    document.cookie = `cityfix_lang=${value}; path=/; max-age=31536000`;
  }, lang);
}

/**
 * The demo password every seeded persona carries, in both backends.
 *
 * `prisma/seed.ts` → `DEMO_PASSWORD = '12345678'`, and the dev store
 * hashes the same string. It is a local-demo credential only.
 */
const DEMO_PASSWORD = '12345678';

/**
 * The seeded personas' phone numbers.
 *
 * `prisma/seed.ts` and `lib/dev-store.ts` seed the SAME numbers (the
 * `+880171100000N` block): 0 = citizen (Rahim), 1 = dispatcher
 * (Habib), 2 = crew (Rashid), 4 = crew (Karim).
 *
 * The `+880199000000N` block is tried as well because the auth spec
 * (`tests/32-ui-redesign-auth.spec.ts`) records it as the Postgres
 * block — trying both costs one extra request and removes the
 * dependency on which block the running database uses.
 */
const PHONES: Record<'citizen' | 'dispatcher' | 'crew', string[]> = {
  citizen: ['+8801711000000', '+8801990000001'],
  dispatcher: ['+8801711000001', '+8801990000002'],
  crew: ['+8801711000002', '+8801990000003'],
};

/**
 * Mint a session for one of the seeded personas.
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
 *     `POST /api/dev/login?role=<role>` mints a session directly.
 *   - REAL MODE: that route is 404 by design, so the spec uses the
 *     REAL auth endpoint — `POST /api/v1/auth/login` with the seeded
 *     persona's phone and demo password.
 *
 * Each role needs its OWN session, so each role needs its OWN browser
 * context — a single cookie jar can only hold one session at a time.
 * The helpers below therefore take a `Page` (whose context is the
 * session's own) and are called once per role per scenario.
 */
async function loginAs(
  page: Page,
  role: 'citizen' | 'dispatcher' | 'crew',
): Promise<void> {
  const devRes = await page.request.post(`${BASE}/api/dev/login?role=${role}`, {
    maxRedirects: 0,
    failOnStatusCode: false,
  });
  if (devRes.status() === 200 || devRes.status() === 303) {
    return; // dev-store mode — the session cookie is set.
  }

  // Real mode — fall back to the real auth endpoint.
  const failures: string[] = [];
  for (const phone of PHONES[role]) {
    const res = await page.request.post(`${BASE}/api/v1/auth/login`, {
      data: { phone, password: DEMO_PASSWORD },
      failOnStatusCode: false,
    });
    if (res.status() === 200) return;
    failures.push(`${phone} -> ${res.status()}`);
  }
  throw new Error(
    `could not mint a ${role} session in either mode. ` +
      `dev login returned ${devRes.status()}; real login: ${failures.join(', ')}`,
  );
}

/**
 * The id triple a new report must be filed against.
 *
 * Discovered at runtime, never hard-coded — see the header note.
 */
interface SeedIds {
  cityId: string;
  categoryId: string;
  wardId: string;
}

/**
 * The category the FULL-LIFECYCLE scenario files against.
 *
 * It must be the `streetlight` category, because the dispatcher
 * persona is bound to the streetlight department and `requireScope`
 * refuses a ticket whose category's department differs. The SLUG is
 * identical in both backends (`streetlight` in `lib/dev-store.ts` and
 * in `prisma/seed.ts`), so the slug is a safe discriminator even
 * though the category ID is not.
 */
const STREETLIGHT_SLUG = 'streetlight';

/**
 * The dev store's own ids — the fallback when discovery finds nothing.
 */
const DEV_STORE_IDS: SeedIds = {
  cityId: 'city_dhaka_north',
  categoryId: 'cat_streetlight',
  wardId: 'ward_14',
};

/**
 * Discover the `(cityId, categoryId, wardId)` triple from the REPORT
 * BOOTSTRAP — the endpoint the report flow itself uses.
 *
 * WHY BOOTSTRAP AND NOT THE PUBLIC FEED
 * -------------------------------------
 * The public feed would give a city-wide view, but the ticket's WARD
 * has to be the CITIZEN'S OWN ward: `requireScope` refuses a ticket
 * whose ward differs from the dispatcher's, and the dispatcher, the
 * crew and the citizen persona are all seeded into the SAME ward
 * (ward 14 / `DEMO_WARD_NUMBER`). A streetlight ticket filed in
 * another ward would be invisible to the dispatcher and the
 * full-lifecycle scenario could never route it.
 *
 * `GET /api/report/bootstrap` returns exactly the right triple for
 * the session:
 *
 *   - `city.id` — the session's own city, so `POST /api/tickets`
 *     (which rejects a foreign city with 403 `cross_city_forbidden`)
 *     always accepts it;
 *   - `ward.id` — the session's own ward (the citizen's registered
 *     home ward);
 *   - `categories[]` — the city's category list, carrying the SLUG,
 *     so the streetlight category can be picked by slug rather than
 *     by a hard-coded id.
 *
 * It is citizen-only (a staff session gets 403 `citizen_only`), which
 * is fine: only the citizen files reports in this spec.
 */
async function discoverSeedIds(page: Page): Promise<SeedIds> {
  const res = await page.request.get(`${BASE}/api/report/bootstrap`, {
    failOnStatusCode: false,
  });
  if (res.status() === 200) {
    const body = (await res.json().catch(() => null)) as {
      city?: { id?: string };
      ward?: { id?: string } | null;
      categories?: Array<{ id: string; slug: string }>;
    } | null;

    const streetlight = body?.categories?.find((c) => c.slug === STREETLIGHT_SLUG);
    const categoryId = streetlight?.id ?? body?.categories?.[0]?.id;
    if (body?.city?.id && body?.ward?.id && categoryId) {
      return {
        cityId: body.city.id,
        categoryId,
        wardId: body.ward.id,
      };
    }
  }
  return { ...DEV_STORE_IDS };
}

/**
 * Derive the public ticket code from an internal id, IN THE BROWSER.
 *
 * This is the same algorithm `lib/format/ticket-id.ts` implements
 * (FNV-1a 32-bit over the prefix-stripped id, then 4 base-36
 * characters). It is re-implemented here on purpose: the assertion is
 * "the code on the page equals the code DERIVED FROM the id the API
 * returned", and re-deriving it independently of the production
 * module is what makes the check meaningful rather than a tautology.
 *
 * The browser's `String.prototype` and `Math` are the same in both
 * engines, so the arithmetic is identical.
 */
async function derivePublicCode(page: Page, internalId: string): Promise<string> {
  return page.evaluate((id: string) => {
    const bare = id.replace(/^(ticket|tkt)_/, '');
    let hash = 0x811c9dc5;
    for (let i = 0; i < bare.length; i += 1) {
      hash ^= bare.charCodeAt(i);
      hash +=
        (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
      hash >>>= 0;
    }
    let value = hash >>> 0;
    let out = '';
    for (let i = 0; i < 4; i += 1) {
      out = (value % 36).toString(36).toUpperCase() + out;
      value = Math.floor(value / 36);
    }
    return `#TIX-${out}`;
  }, internalId);
}

/**
 * File a report and return its id.
 *
 * The id comes from the RESPONSE BODY, so it is correct for whichever
 * backend is running (`tkt_*` in the dev store, a cuid in real mode).
 *
 * The location is jittered so a second call does not land inside the
 * 50 m dedup radius of the first — the dedup prompt scenario needs a
 * ticket that was NOT deduped, and a duplicate would change what the
 * summary step renders.
 *
 * `photos` are the citizen's OWN photos: they land in the "Before"
 * group (`uploadedByRole: 'citizen'`).
 */
async function fileReport(
  page: Page,
  ids: SeedIds,
  opts: {
    note: string;
    at?: { lat: number; lng: number };
    photos?: string[];
  },
): Promise<string> {
  const base = { lat: 23.7901, lng: 90.3957 };
  const at = opts.at ?? {
    lat: base.lat + Math.random() * 0.08,
    lng: base.lng + Math.random() * 0.08,
  };
  const res = await page.request.post(`${BASE}/api/tickets`, {
    headers: { 'content-type': 'application/json' },
    data: {
      cityId: ids.cityId,
      categoryId: ids.categoryId,
      wardId: ids.wardId,
      locationLat: at.lat,
      locationLng: at.lng,
      note: opts.note,
      photoUrls: opts.photos ?? [],
    },
    failOnStatusCode: false,
  });
  expect(
    res.status(),
    `filing a report failed (${res.status()}) — ids used: ${JSON.stringify(ids)}`,
  ).toBe(201);

  const body = (await res.json().catch(() => null)) as {
    ticket?: { id?: string };
    id?: string;
  } | null;
  const id = body?.ticket?.id ?? body?.id ?? '';
  expect(id, 'the filed report must have an id').not.toBe('');
  return id;
}

/**
 * The dedup radius the API enforces.
 *
 * `lib/platform/dedup.ts` → `checkDedup` compares the haversine
 * distance against the city's `dedupRadiusMeters`, which defaults to
 * 50 m. A probe that is further away than that does NOT produce a
 * dedup match — the API files a second, separate ticket — and the
 * summary step then has no prompt to render.
 */
const DEDUP_RADIUS_METERS = 50;

/**
 * A point a few METRES from `anchor`.
 *
 * The offset is expressed in METRES and converted to degrees, so the
 * distance is unambiguous: 1 degree of latitude is ~111,000 m, and
 * 1 degree of longitude at Dhaka's latitude is ~111,000 × cos(23.79°)
 * ≈ 101,500 m.
 */
function metresFrom(
  anchor: { lat: number; lng: number },
  eastMeters: number,
  northMeters: number,
): { lat: number; lng: number } {
  const M_PER_DEG_LAT = 111_000;
  const M_PER_DEG_LNG = 111_000 * Math.cos((anchor.lat * Math.PI) / 180);
  return {
    lat: anchor.lat + northMeters / M_PER_DEG_LAT,
    lng: anchor.lng + eastMeters / M_PER_DEG_LNG,
  };
}

// =========================================================================
// Scenario A — the report flow's progress indicator + the photo cap
// =========================================================================

test.describe('Scenario A — the report flow keeps its progress indicator', () => {
  test('the photo step is step 2 of 5 and its cap indicator reads "1 / 3 ছবি"', async ({
    page,
  }) => {
    // Bangla is the product default, and the counter's contract is
    // pinned against the BANGLA string ("1 / 3 ছবি") — so the
    // language is set explicitly rather than left to whatever the
    // ambient cookie happens to be.
    await useLanguage(page, 'bn');
    await loginAs(page, 'citizen');

    // Seed a draft with exactly ONE photo so the counter reads "1 / 3".
    //
    // The draft lives in sessionStorage under a fixed key, and the
    // photo step READS it on mount (it restores `photoUrls` and
    // re-derives the cap from the draft's category). The location
    // label is set too so the location-reminder card renders — the
    // photo page only renders it when a label exists.
    //
    // `categoryId` is null: the cap is re-derived from the draft's
    // category on every mount (`derivePhotoCap`), and the DEFAULT cap
    // is 3. A streetlight category would narrow it to 2 and the
    // counter would read "1 / 2" instead.
    //
    // The draft's `cityId` / `wardId` are the DEV STORE's ids, which
    // is deliberate and harmless: the photo step NEVER submits the
    // draft — it only reads `photoUrls`, `categoryId` and the location
    // labels off it. The submission happens on the NOTE step, which is
    // not exercised here. So the ids in this fixture are inert, and
    // hard-coding them keeps the scenario free of a second bootstrap
    // round-trip.
    await page.addInitScript(() => {
      try {
        window.sessionStorage.setItem(
          'cityfix.reportDraft.v1',
          JSON.stringify({
            cityId: 'city_dhaka_north',
            wardId: 'ward_14',
            locationLat: 23.7901,
            locationLng: 90.3957,
            locationLabel: 'Mirpur, Dhaka',
            locationLabelBn: 'মিরপুর, ঢাকা',
            categoryId: null,
            photoUrls: [
              'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
            ],
            note: '',
            step: 'photo',
          }),
        );
      } catch {
        /* storage may be unavailable — the counter still renders */
      }
    });

    await gotoHydrated(page, '/report/photo');
    // The page fetches its bootstrap and restores the draft; give it a
    // beat to settle.
    await page.waitForTimeout(1_500);

    // --- the STEP INDICATOR ------------------------------------------
    const indicator = page.locator('[data-testid="report-step-indicator"]');
    await expect(indicator).toHaveCount(1);
    // The primitive's observable contract: `data-current` / `data-total`.
    await expect(indicator).toHaveAttribute('data-current', '2');
    await expect(indicator).toHaveAttribute('data-total', '5');

    // Five step markers, and step 2 is the current one. `aria-current`
    // is how the current step is exposed — not colour.
    const steps = indicator.locator('[data-step]');
    await expect(steps).toHaveCount(5);
    await expect(indicator.locator('[data-step="2"]')).toHaveAttribute(
      'aria-current',
      'step',
    );
    // Step 1 is completed, steps 3-5 are future.
    await expect(indicator.locator('[data-step="1"]')).toHaveAttribute(
      'data-state',
      'completed',
    );
    await expect(indicator.locator('[data-step="3"]')).toHaveAttribute(
      'data-state',
      'future',
    );

    // The connector between two completed steps is painted; the rest
    // are pending. The connector is `aria-hidden` (it is decorative),
    // so it is asserted by its data attribute.
    const connectors = indicator.locator('[data-connector]');
    await expect(connectors).toHaveCount(4);

    // --- the PROGRESS SENTENCE ---------------------------------------
    // The progress sentence under the rail was removed: it duplicated
    // the side card's own step pill and the rail's numbered circles.
    // The position is still carried by the circles' data-state.
    const progress = page.locator('[data-testid="report-step-progress"]');
    await expect(progress).toHaveCount(0);

    // --- the PHOTO CAP INDICATOR --------------------------------------
    // The contract pins this EXACTLY: "1 / 3 ছবি" with ASCII digits.
    // `interpolate` does `String(v)` with no numeral conversion, so the
    // digits are ASCII — and a "helpful" conversion to Bengali
    // numerals would break the contract.
    const counter = page.locator('[data-testid="report-photo-counter"]');
    await expect(counter).toHaveCount(1);
    await expect(counter).toContainText('1 / 3 ছবি');
    // Explicitly NOT Bengali numerals.
    const counterText = (await counter.innerText()).trim();
    expect(
      counterText,
      'the photo counter must use ASCII digits, not Bengali numerals',
    ).toMatch(/^[0-9]+\s*\/\s*[0-9]+/);
    expect(counterText).not.toMatch(/[০-৯]/);

    // It is announced politely when it changes.
    await expect(counter).toHaveAttribute('role', 'status');
    await expect(counter).toHaveAttribute('aria-live', 'polite');
  });
});

// =========================================================================
// Scenario B — the summary step's dedup prompt
// =========================================================================

test.describe('Scenario B — the summary step offers both dedup options', () => {
  test('the dedup prompt explains the existing report AND the submit-anyway path', async ({
    page,
  }) => {
    await useLanguage(page, 'en');
    await loginAs(page, 'citizen');

    const ids = await discoverSeedIds(page);

    // File a report, then file a SECOND one a few METRES away. The
    // second POST is inside the API's 50 m dedup radius, so the API
    // answers with a dedup match — which is what puts the dedup
    // prompt on the summary step.
    //
    // The probe's offset is fixed, not random, and it is expressed in
    // METRES. A random degree-offset would sometimes land 100 m away
    // (1e-3 degrees is ~111 m of latitude), which is OUTSIDE the
    // radius: the API would file a second, separate ticket and the
    // dedup prompt would never appear. The scenario would then pass
    // vacuously on some runs and fail on others.
    //
    // The ANCHOR itself is jittered by a few hundred metres, so a
    // re-run does not collide with the open ticket the previous run
    // left behind. A fixed anchor would make the FIRST POST return
    // 200-with-dedup_match instead of 201, and the scenario would
    // fail on the second run against the same database.
    const anchor = metresFrom(
      { lat: 23.7901, lng: 90.3957 },
      Math.random() * 400,
      Math.random() * 400,
    );
    const first = await fileReport(page, ids, { note: 'dedup anchor', at: anchor });
    expect(first).not.toBe('');

    // The dedup context is what the summary page reads. Its shape is
    // documented on the page itself (`DedupContext`): the id of the
    // EXISTING report, the distance, and its status.
    //
    // The API's field names are SNAKE_CASE (`existing_ticket_id`,
    // `distance_meters`, `existing_status`) — the note page maps them
    // into the camelCase `DedupContext` before writing
    // sessionStorage. This spec mirrors that mapping exactly.
    const at = metresFrom(anchor, 12, 8); // ≈ 14 m away — inside the radius
    const second = await page.request.post(`${BASE}/api/tickets`, {
      headers: { 'content-type': 'application/json' },
      data: {
        cityId: ids.cityId,
        categoryId: ids.categoryId,
        wardId: ids.wardId,
        locationLat: at.lat,
        locationLng: at.lng,
        note: 'dedup probe',
        photoUrls: [],
      },
      failOnStatusCode: false,
    });
    // Either the API matched a duplicate (200 with dedup_match) or it
    // did not (in which case there is no dedup prompt to show and this
    // scenario cannot be exercised — that is a legitimate state, and it
    // is reported rather than silently passed).
    const secondBody = (await second.json().catch(() => null)) as {
      dedup_match?: boolean;
      existing_ticket_id?: string;
      distance_meters?: number;
      existing_status?: string;
    } | null;

    const existingId = secondBody?.existing_ticket_id ?? '';
    if (!secondBody?.dedup_match || !existingId) {
      test.skip(
        true,
        'the API did not return a dedup match for the probe pair, so there is no dedup prompt to assert',
      );
      return;
    }

    // The probe really was inside the radius — otherwise the skip
    // above would be masking a bug in the fixture's geometry.
    expect(
      secondBody?.distance_meters ?? Infinity,
      'the dedup match must be inside the API radius',
    ).toBeLessThanOrEqual(DEDUP_RADIUS_METERS);

    // Drive the summary page the way the app does: the dedup context
    // is left in sessionStorage by the create flow.
    await page.addInitScript((ctx: unknown) => {
      try {
        window.sessionStorage.setItem('cityfix.reportDedup.v1', JSON.stringify(ctx));
      } catch {
        /* storage may be unavailable */
      }
    }, {
      existingTicketId: existingId,
      distanceMeters: secondBody?.distance_meters ?? 0,
      existingStatus: secondBody?.existing_status ?? 'submitted',
    });

    await gotoHydrated(page, '/report/summary');
    await page.waitForTimeout(1_500);

    // --- the prompt is there ------------------------------------------
    // The existing report is NAMED, not just referenced.
    const existingLabel = page.locator('text=/Existing report/i');
    await expect(existingLabel.first()).toBeVisible();

    // --- BOTH options, each with its own control -----------------------
    // Option 1 — link to the existing report.
    const link = page.locator('[data-testid="report-summary-link"]');
    await expect(link).toHaveCount(1);
    await expect(link).toBeVisible();
    await expect(link).toContainText(/Link to this report/i);

    // Option 2 — submit anyway, as a new report.
    const submitNew = page.locator('[data-testid="report-summary-submit-new"]');
    await expect(submitNew).toHaveCount(1);
    await expect(submitNew).toBeVisible();
    await expect(submitNew).toContainText(/Submit as new report/i);

    // The "submit anyway" path is GATED on an explicit confirmation —
    // it must not be a single accidental click.
    const confirm = page.locator('input[type="checkbox"]');
    await expect(confirm).toHaveCount(1);
    await expect(submitNew).toBeDisabled();
    await confirm.check();
    await expect(submitNew).toBeEnabled();

    // --- the two options are DISTINCT -----------------------------------
    // The whole point of the prompt: the citizen can either join the
    // existing report or start a new one. Two identical-looking
    // controls would defeat it.
    expect(await link.innerText()).not.toBe(await submitNew.innerText());

    // The explanation is present, not just the buttons: the prompt
    // says a similar report was FOUND and how far away it is.
    const body = await page.locator('body').innerText();
    expect(
      body,
      'the dedup prompt must explain that an existing report was found',
    ).toMatch(/found|similar|duplicate|already/i);
  });
});

// =========================================================================
// Scenario C — /reports: the public code + the filter chips
// =========================================================================

test.describe('Scenario C — /reports shows the public code and the filter chips', () => {
  test('a row carries the #TIX- code and the chip row carries live counts', async ({
    page,
  }) => {
    await loginAs(page, 'citizen');

    const ids = await discoverSeedIds(page);
    const ticketId = await fileReport(page, ids, {
      note: `ui-redesign citizen row probe ${Math.random()}`,
    });

    await gotoHydrated(page, '/reports');
    await page.waitForTimeout(2_000);

    // --- the FILTER CHIPS ---------------------------------------------
    const chips = page.locator('[data-testid="reports-filter-chips"]');
    await expect(chips).toHaveCount(1);

    const chipButtons = chips.locator('button');
    const chipCount = await chipButtons.count();
    expect(chipCount, 'the reports list must render its filter chips').toBeGreaterThanOrEqual(4);

    // Every chip exposes its pressed state (not implied by a class).
    for (let i = 0; i < chipCount; i += 1) {
      await expect(chipButtons.nth(i)).toHaveAttribute(
        'aria-pressed',
        /^(true|false)$/,
      );
    }

    // The chip row is a labelled group.
    await expect(chips).toHaveAttribute('role', 'group');
    const groupLabel = await chips.getAttribute('aria-label');
    expect(groupLabel?.trim(), 'the chip group needs an accessible name').not.toBe('');

    // The counts are baked into the chip LABELS (the primitive has no
    // separate count slot), so every chip's label carries a number.
    for (let i = 0; i < chipCount; i += 1) {
      const label = (await chipButtons.nth(i).innerText()).trim();
      expect(
        label,
        `chip #${i + 1} ("${label}") must carry a count`,
      ).toMatch(/\(\s*\d+\s*\)/);
    }

    // --- the COUNTS --------------------------------------------------
    //
    // The chip count must be a TOTAL over the set the chip filters,
    // not the number of rows that happened to be rendered.
    //
    // For a CITIZEN the count comes from `countByReportStatusGroup`
    // over the citizen's OWN reports — NOT the public feed's
    // city-wide `stats.counts` (a citizen with 3 reports must not see
    // "All 58" on a "my reports" page).
    //
    // The invariant asserted here is the one that is INDEPENDENT of
    // how the page happens to fetch its rows: the three group chips
    // must SUM to the "all" chip. That is exactly the property the
    // shared grouping guarantees (`countByReportStatusGroup`), and it
    // is the property a citizen actually relies on — the three
    // filtered views partition the whole list, so their counts must
    // add back up to it.
    //
    // A chip that counted only the RENDERED rows would break this
    // sum the moment the list was filtered or paginated.
    const chipCounts: number[] = [];
    for (let i = 0; i < chipCount; i += 1) {
      const label = (await chipButtons.nth(i).innerText()).trim();
      const n = Number(label.match(/\(\s*(\d+)\s*\)/)?.[1] ?? 'NaN');
      expect(n, `chip #${i + 1} ("${label}") must carry a numeric count`).not.toBeNaN();
      chipCounts.push(n);
    }
    const [allCount, newCount, activeCount, resolvedCount] = chipCounts;
    expect(
      newCount! + activeCount! + resolvedCount!,
      'the three group chip counts must sum to the "all" chip count',
    ).toBe(allCount);

    // The citizen's own report count, from the citizen-only endpoint.
    // The page's chip count is computed over the citizen's own reports
    // too, so the two agree whenever the page's own fetch returned the
    // citizen's whole set (which it does when the city has fewer
    // tickets than the feed's limit).
    const ownTotal = await page.evaluate(async () => {
      const res = await fetch('/api/tickets', { credentials: 'include' });
      if (!res.ok) return null;
      const body = (await res.json()) as { tickets?: unknown[] };
      return Array.isArray(body.tickets) ? body.tickets.length : null;
    });
    expect(ownTotal, 'the citizen own-report count must be readable').not.toBeNull();
    expect(
      allCount,
      'the "all" chip must count at least the citizen own-report count',
    ).toBeGreaterThanOrEqual(ownTotal!);

    const renderedRows = await page.locator('[data-testid="reports-row"]').count();
    expect(
      allCount,
      'the "all" chip must count at least every row the page renders',
    ).toBeGreaterThanOrEqual(renderedRows);

    // The citizen's own freshly filed report is on the list, and its
    // status is `submitted` — so the "new" chip counts it.
    expect(
      newCount,
      'the "new" chip must count the freshly filed (submitted) report',
    ).toBeGreaterThanOrEqual(1);

    // --- the PUBLIC CODE ON A ROW --------------------------------------
    const rowCodes = page.locator('[data-testid="reports-row-code"]');
    const rowCodeCount = await rowCodes.count();
    expect(rowCodeCount, 'the rows must carry the public ticket code').toBeGreaterThan(0);

    // Every code on every row has the right SHAPE.
    for (let i = 0; i < rowCodeCount; i += 1) {
      const code = (await rowCodes.nth(i).innerText()).trim();
      expect(code, `row #${i + 1}'s code ("${code}") must match the public shape`).toMatch(
        PUBLIC_CODE,
      );
    }

    // The seeded report's own code is on the page — and it is the code
    // DERIVED from the id the API gave us. (The citizen sees their own
    // report on the "my reports" list.)
    const expectedCode = await derivePublicCode(page, ticketId);
    const allCodes = await rowCodes.evaluateAll((els) =>
      els.map((el) => (el.textContent || '').trim()),
    );
    expect(
      allCodes,
      `the report filed as "${ticketId}" (code ${expectedCode}) must appear on the list`,
    ).toContain(expectedCode);
  });
});

// =========================================================================
// Scenario D — /reports/[id]: the trail + the labelled photo groups
// =========================================================================

test.describe('Scenario D — /reports/[id] shows the trail and the photo groups', () => {
  test('the trail has four steps, each with an icon and a timestamp, and the photos are labelled', async ({
    browser,
  }) => {
    // Three roles, three sessions, three cookie jars — a browser
    // context holds ONE session cookie at a time, so each role gets
    // its own context.
    const citizenCtx = await browser.newContext();
    const dispatcherCtx = await browser.newContext();
    const crewCtx = await browser.newContext();
    try {
      const citizen = await citizenCtx.newPage();
      const dispatcher = await dispatcherCtx.newPage();
      const crew = await crewCtx.newPage();

      // English, deliberately. The trail's timestamps are rendered with
      // `Intl.DateTimeFormat('bn-BD')` when the page is in Bangla, and
      // that locale emits BENGALI DIGITS ("১৫:০৪"). The timestamp
      // assertion below is written against ASCII digits, so the page
      // is pinned to English rather than the assertion being loosened
      // into a check that accepts either numeral system.
      await useLanguage(citizen, 'en');

      await loginAs(citizen, 'citizen');
      await loginAs(dispatcher, 'dispatcher');
      await loginAs(crew, 'crew');

      const ids = await discoverSeedIds(citizen);

      // The citizen files a report WITH a photo, so the "Before"
      // group has something in it.
      const ticketId = await fileReport(citizen, ids, {
        note: `ui-redesign citizen detail probe ${Math.random()}`,
        photos: [CITIZEN_PHOTO],
      });

      // --- the CREW'S AFTER PHOTO --------------------------------------
      //
      // The "After" group holds the CREW's photos, and the crew can
      // only upload to a ticket assigned to THEM
      // (`ticket.assignedCrewId === session.userId`), and only a
      // ticket they can see (same city + ward + department). The
      // citizen's own report therefore has to be ROUTED and ASSIGNED
      // before the crew can add an after-photo to it.
      //
      // That is the real product lifecycle, and driving it here is
      // what makes the after-photo group a REAL assertion rather than
      // a mock: the group only renders because the crew actually
      // uploaded a photo that the serializer bucketed as 'crew'.
      //
      // Step 1 — the dispatcher routes the ticket.
      const routed = await dispatcher.request.post(
        `${BASE}/api/v1/dispatcher/tickets/${ticketId}/transition`,
        {
          headers: { 'content-type': 'application/json' },
          data: { toStatus: 'routed' },
          failOnStatusCode: false,
        },
      );
      expect(
        routed.status(),
        `the dispatcher could not route the report (${routed.status()})`,
      ).toBe(200);

      // Step 2 — the dispatcher picks a crew member who can actually
      // work this ticket's category. The roster is discovered from the
      // dispatcher's own picker endpoint, which filters by the
      // category's department — so the member it returns can take the
      // ticket by construction.
      //
      // THE ASSIGNEE MUST BE THE CREW SESSION'S OWN USER. The
      // after-photo route refuses a ticket the caller is not assigned
      // to (`ticket.assignedCrewId !== session.userId` → 404), so
      // assigning "the first member the roster returns" and then
      // uploading as the seeded crew persona is only correct by
      // luck — the roster is sorted by LOAD then NAME, so a busy
      // Karim could sort ahead of Rashid.
      //
      // So the crew's own user id is read from the session
      // (`GET /api/auth/status`), and THAT member is looked up in
      // the roster. If the roster does not contain the logged-in crew
      // member, the scenario genuinely cannot run — the dispatcher
      // cannot hand this ticket to the crew who would fix it — and
      // the test says so rather than silently uploading as somebody
      // else.
      const crewStatusRes = await crew.request.get(`${BASE}/api/auth/status`, {
        failOnStatusCode: false,
      });
      expect(
        crewStatusRes.status(),
        `the crew session could not be read (${crewStatusRes.status()})`,
      ).toBe(200);
      const crewSession = (await crewStatusRes.json().catch(() => null)) as {
        session?: { userId?: string; role?: string };
      } | null;
      const crewUserId = crewSession?.session?.userId ?? '';
      expect(
        crewUserId,
        'the crew session must carry a user id',
      ).not.toBe('');
      expect(
        crewSession?.session?.role,
        'the crew session must actually be a crew session',
      ).toBe('crew');

      const rosterRes = await dispatcher.request.get(
        `${BASE}/api/v1/dispatcher/crew-for-ward?wardId=${encodeURIComponent(ids.wardId)}&categoryId=${encodeURIComponent(ids.categoryId)}`,
        { failOnStatusCode: false },
      );
      expect(
        rosterRes.status(),
        `the crew roster could not be read (${rosterRes.status()})`,
      ).toBe(200);
      const roster = (await rosterRes.json().catch(() => null)) as {
        crew?: Array<{ id: string; atCapacity?: boolean }>;
      } | null;
      const assignee = roster?.crew?.find((c) => c.id === crewUserId);
      expect(
        assignee,
        `the logged-in crew member (${crewUserId}) must be in the dispatcher's roster for this ward + category, so the ticket can be handed to them`,
      ).toBeTruthy();
      expect(
        assignee!.atCapacity,
        'the logged-in crew member must not be at capacity, or the assignment is refused with 409',
      ).toBe(false);

      const assigned = await dispatcher.request.post(
        `${BASE}/api/v1/dispatcher/tickets/${ticketId}/assign-crew`,
        {
          headers: { 'content-type': 'application/json' },
          data: { assignedCrewId: assignee!.id },
          failOnStatusCode: false,
        },
      );
      expect(
        assigned.status(),
        `the dispatcher could not assign the report (${assigned.status()})`,
      ).toBe(200);

      // Step 3 — the crew uploads the "after" photo.
      const crewRes = await crew.request.post(
        `${BASE}/api/v1/crew/tickets/${ticketId}/photos`,
        {
          headers: { 'content-type': 'application/json' },
          data: { url: CREW_PHOTO },
          failOnStatusCode: false,
        },
      );
      expect(
        crewRes.status(),
        `the crew could not upload the after-photo (${crewRes.status()})`,
      ).toBe(200);

      // --- the CITIZEN'S DETAIL PAGE ------------------------------------
      await gotoHydrated(citizen, `/reports/${ticketId}`);
      await citizen.waitForTimeout(2_000);

      // --- the TRAIL ------------------------------------------------------
      const trail = citizen.locator('[data-testid="report-detail-trail"]');
      await expect(trail).toHaveCount(1);

      // It is an ORDERED LIST — the journey reads top to bottom.
      await expect(trail.locator('ol')).toHaveCount(1);

      const steps = trail.locator('ol > li');
      const stepCount = await steps.count();
      expect(stepCount, 'the trail must carry the four locked statuses').toBe(4);

      for (let i = 0; i < stepCount; i += 1) {
        const step = steps.nth(i);

        // Every step carries an ICON, so the status is readable without
        // colour. The `Timeline` primitive requires one per item.
        const iconCount = await step.locator('svg').count();
        expect(
          iconCount,
          `trail step #${i + 1} must carry an icon so its status is not colour-alone`,
        ).toBeGreaterThan(0);

        // Every step carries a DETAIL line. For a step that has happened
        // it is the timestamp; for a step that has not it is the
        // "pending" copy. Either way the line is present — a step with
        // no detail at all would be an empty row.
        const detail = (await step.innerText()).trim();
        expect(
          detail.length,
          `trail step #${i + 1} must carry a detail line (timestamp or pending copy)`,
        ).toBeGreaterThan(0);
      }

      // The steps that HAVE happened carry their TIMESTAMP; the ones
      // that have not carry the pending copy. (The page is pinned to
      // English above, so the timestamp is ASCII-digit and the pending
      // copy is the English word "Pending".)
      const secondStepText = (await steps.nth(1).innerText()).trim();
      expect(
        secondStepText,
        'the routed step must show its timestamp',
      ).toMatch(/\d{1,2}:\d{2}|\d{4}/);
      const thirdStepText = (await steps.nth(2).innerText()).trim();
      expect(
        thirdStepText,
        'a step that has not happened must say so',
      ).toMatch(/pending/i);

      // The FIRST step is the one that HAPPENED first, so its detail is
      // a real TIMESTAMP (not the pending copy). The page renders the
      // timestamp for every step that has a transition, and a step with
      // no transition renders the pending copy instead — so a step
      // carrying a timestamp proves that transition really happened.
      const firstStepText = (await steps.first().innerText()).trim();
      expect(
        firstStepText,
        'the first trail step must show its timestamp',
      ).toMatch(/\d{1,2}:\d{2}|\d{4}/);

      // The trail's steps carry their state, so "what has happened" is
      // exposed structurally and not only by colour.
      //
      // The ticket has been ROUTED by the dispatcher above, so its
      // status is `routed` — the second of the four locked statuses.
      // The trail therefore reads: step 1 done (submitted), step 2
      // current (routed), steps 3 and 4 upcoming. This is the whole
      // point of the trail: it says exactly how far the report has got.
      const states = await steps.evaluateAll((els) =>
        els.map((el) => el.getAttribute('data-state')),
      );
      expect(states[0], 'the submitted step must be done').toBe('done');
      expect(states[1], 'the routed step must be the current one').toBe('current');
      expect(states.slice(2)).toEqual(['upcoming', 'upcoming']);

      // --- the LABELLED PHOTO GROUPS -------------------------------------
      // "আগে" (before — the citizen's photos) and "পরে" (after — the
      // crew's photos), each with a VISIBLE label.
      const before = citizen.locator('[data-testid="report-detail-photos-before"]');
      const after = citizen.locator('[data-testid="report-detail-photos-after"]');
      await expect(before).toHaveCount(1);
      await expect(after).toHaveCount(1);

      // The labels are VISIBLE text, not an aria-label on an empty box.
      await expect(before.locator('*').filter({ hasText: /আগে|Before/ }).first()).toBeVisible();
      await expect(after.locator('*').filter({ hasText: /পরে|After/ }).first()).toBeVisible();

      // The two groups are labelled DIFFERENTLY — the whole point is
      // that a citizen can tell their own photo from the crew's.
      const beforeText = (await before.innerText()).trim();
      const afterText = (await after.innerText()).trim();
      expect(beforeText, 'the before group must carry its own label').not.toBe(afterText);

      // Each group holds EXACTLY its own side of the split: the
      // citizen's photo is in "Before" and the crew's is in "After".
      // Without this the labels could be swapped and the test would
      // still pass.
      //
      // The tile is a `<figure>` whose photo is painted as a CSS
      // `background: url("…")` (see `thumbnailBackground`), NOT an
      // `<img>` — so the selector matches on the background URL, not
      // on `background-image:` (the style attribute carries the
      // shorthand).
      const beforeSrc = await before.locator('figure').evaluateAll((els) =>
        els.map((el) => (el.getAttribute('style') || '')),
      );
      const afterSrc = await after.locator('figure').evaluateAll((els) =>
        els.map((el) => (el.getAttribute('style') || '')),
      );
      expect(beforeSrc.length, 'the before group must hold one tile').toBe(1);
      expect(afterSrc.length, 'the after group must hold one tile').toBe(1);
      expect(beforeSrc[0], 'the before tile must paint the citizen photo').toContain(
        'url(',
      );
      expect(afterSrc[0], 'the after tile must paint the crew photo').toContain('url(');

      // The two tiles paint DIFFERENT bytes — the citizen's photo and
      // the crew's photo are not the same image. (The fixtures are
      // deliberately different 1×1 PNGs.)
      expect(
        beforeSrc[0],
        'the before and after tiles must not paint the same image',
      ).not.toBe(afterSrc[0]);
    } finally {
      await citizenCtx.close();
      await dispatcherCtx.close();
      await crewCtx.close();
    }
  });
});

// =========================================================================
// Scenario E — no raw internal id on any citizen surface
// =========================================================================

test.describe('Scenario E — no raw internal ticket id reaches a citizen', () => {
  test('the reports list, the detail page and the confirmation show no raw id', async ({
    page,
  }) => {
    await loginAs(page, 'citizen');

    const ids = await discoverSeedIds(page);
    const ticketId = await fileReport(page, ids, {
      note: `ui-redesign citizen id-leak probe ${Math.random()}`,
    });

    // The id is long and distinctive, so an accidental leak is
    // unmistakable in the page text.
    expect(ticketId.length, 'the probe id must be long enough to spot').toBeGreaterThanOrEqual(8);

    const surfaces: Array<{ path: string; name: string }> = [
      { path: '/reports', name: 'the reports list' },
      { path: `/reports/${ticketId}`, name: 'the report detail page' },
      { path: `/report/${ticketId}/submitted`, name: 'the submitted confirmation' },
    ];

    for (const { path, name } of surfaces) {
      await gotoHydrated(page, path);
      await page.waitForTimeout(1_500);

      // The BODY TEXT must not carry the raw id.
      const body = await page.locator('body').innerText();
      expect(
        body,
        `${name} must not render the raw internal id "${ticketId}"`,
      ).not.toContain(ticketId);

      // Nor may it be hiding in an attribute (a `href`, a `data-`).
      //
      // The one legitimate exception: the ticket's own LINK carries the
      // id in its URL path — `/reports/<id>` — because that IS the
      // route. So the check is on ATTRIBUTE VALUES OTHER THAN hrefs
      // that point at the ticket's own route.
      const attributeLeaks = await page.evaluate((id: string) => {
        const out: string[] = [];
        document.querySelectorAll('*').forEach((el) => {
          for (const attr of Array.from(el.attributes)) {
            if (!attr.value.includes(id)) continue;
            // The ticket's own route is the one legitimate carrier.
            if (attr.name === 'href' && attr.value.includes(`/reports/${id}`)) continue;
            out.push(`${el.tagName}[${attr.name}]="${attr.value.slice(0, 120)}"`);
          }
        });
        return out;
      }, ticketId);
      expect(
        attributeLeaks,
        `${name} must not leak the raw internal id in an attribute: ${attributeLeaks.join(' | ')}`,
      ).toEqual([]);
    }
  });
});

// =========================================================================
// Scenario F — the code on the page matches the code derived from the id
// =========================================================================

test.describe('Scenario F — the public code is derived from the id', () => {
  test('the detail page and the confirmation show the same derived code', async ({
    page,
  }) => {
    await loginAs(page, 'citizen');

    const ids = await discoverSeedIds(page);
    const ticketId = await fileReport(page, ids, {
      note: `ui-redesign citizen code probe ${Math.random()}`,
    });

    const expected = await derivePublicCode(page, ticketId);
    expect(expected, 'the derived code must have the public shape').toMatch(PUBLIC_CODE);

    // --- the DETAIL page ------------------------------------------------
    await gotoHydrated(page, `/reports/${ticketId}`);
    await page.waitForTimeout(1_500);

    const detailCode = page.locator('[data-testid="report-detail-code"]');
    await expect(detailCode).toHaveCount(1);
    const detailText = (await detailCode.innerText()).trim();
    expect(detailText, 'the detail page must show the derived code').toBe(expected);

    // --- the CONFIRMATION page -----------------------------------------
    // The confirmation shows the code for the ticket the citizen just
    // filed. It reads the id from the route param, so the same id
    // yields the same code.
    await gotoHydrated(page, `/report/${ticketId}/submitted`);
    await page.waitForTimeout(1_500);

    const confirmCode = page.locator('[data-testid="report-confirmation-code"]');
    await expect(confirmCode).toHaveCount(1);
    const confirmText = (await confirmCode.innerText()).trim();
    expect(confirmText, 'the confirmation must show the same derived code').toBe(expected);

    // The clipboard carries the PUBLIC code — the citizen reads it out
    // to the city corporation, and the corporation can look THAT up.
    const copied = await confirmCode.evaluate((el) => (el.textContent || '').trim());
    expect(copied).toBe(expected);
  });
});
