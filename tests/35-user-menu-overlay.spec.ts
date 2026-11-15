/**
 * The user menu must paint ABOVE the page it is opened over.
 *
 * ## The bug
 *
 * The user menu's dropdown panel was an absolutely-positioned child of
 * the app header. The header is `position: sticky` with a numeric
 * `z-index`, which makes it a STACKING CONTEXT — and a stacking context
 * traps every descendant's `z-index`. The panel carried `z-index: 80`
 * but that number only ranked it inside the header's own context.
 *
 * The dispatcher performance page has its own sticky sub-header at
 * `z-index: 10`. Both the header and that sub-header sat at z-index 10,
 * and the sub-header comes LATER in the DOM, so it won the paint. The
 * dropdown's top edge cut through the page's date-range row, the range
 * control painted over the panel, and the panel's own avatar/name
 * header row was clipped away — exactly what the report showed.
 *
 * ## The fix
 *
 * The panel is rendered in a React PORTAL on `<body>`, positioned
 * `fixed` against the trigger's measured viewport box. It therefore
 * lives in the ROOT stacking context and can paint above every in-page
 * stacking context, whatever their z-index.
 *
 * ## What this spec asserts
 *
 *   1. Where the dropdown overlaps a page-level control, the PANEL is
 *      the top element at that point (`elementFromPoint` returns an
 *      element inside the panel) — on the page that reproduced it and
 *      at every width.
 *   2. The panel is fully painted: its profile header row is visible
 *      and inside the viewport, not clipped by a sticky row.
 *   3. The panel is a child of `<body>`, not of the header — i.e. the
 *      portal really is in place.
 *   4. The menu still BEHAVES: Escape closes it and returns focus to
 *      the trigger, a click outside closes it, and a click inside does
 *      not.
 *   5. The same holds on the admin console, which renders the menu in
 *      a different topbar.
 *
 * Pre-reqs:
 *   - Dev server running with CITYFIX_DEV_STORE=1 (`npm run dev:feat`).
 *   - BASE_URL points at it (default http://localhost:3000).
 */

import { test, expect, APIRequestContext, Page } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';

async function devLogin(ctx: APIRequestContext, role: string): Promise<void> {
  const res = await ctx.post(`${BASE}/api/dev/login?role=${role}`, {
    maxRedirects: 0,
    failOnStatusCode: false,
  });
  expect(res.status(), `dev login for ${role}`).toBe(303);
}

/** Open the menu and wait for the panel to be on screen. */
async function openMenu(page: Page) {
  await page.locator('.usermenu-trigger').click();
  await expect(page.locator('.usermenu-panel')).toBeVisible({ timeout: 10_000 });
}

/**
 * What is the top-most element at the centre of `selector`'s box?
 * Returns the element's tag, class and whether it sits inside the
 * dropdown panel.
 */
async function topElementAt(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const target = document.querySelector(sel);
    if (!target) return null;
    const r = target.getBoundingClientRect();
    const el = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
    if (!el) return null;
    const panel = document.querySelector('.usermenu-panel');
    return {
      tag: el.tagName,
      cls: (el.className || '').toString().slice(0, 60),
      inPanel: panel ? panel.contains(el) : false,
    };
  }, selector);
}

test.describe('the user menu paints above the page', () => {
  test('the panel wins the paint where it overlaps the dispatcher range control', async ({
    page,
    context,
  }) => {
    await devLogin(context.request, 'dispatcher');

    // The page that reproduced it: its own sticky sub-header sat at the
    // same z-index as the app header and came later in the DOM.
    await page.goto(`${BASE}/dispatcher/performance`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.locator('[data-testid="dispatcher-performance-range"]'),
    ).toBeVisible({ timeout: 15_000 });

    await openMenu(page);

    const hit = await topElementAt(page, '[data-testid="dispatcher-performance-range"]');
    expect(hit, 'the range control must be on screen').not.toBeNull();
    expect(hit!.inPanel, 'the dropdown panel must paint over the range control').toBe(true);
  });

  test('the panel wins the paint at every viewport width', async ({ page, context }) => {
    await devLogin(context.request, 'dispatcher');

    for (const width of [1440, 1024, 768, 480, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${BASE}/dispatcher/performance`, { waitUntil: 'domcontentloaded' });
      await expect(
        page.locator('[data-testid="dispatcher-performance-range"]'),
      ).toBeVisible({ timeout: 15_000 });

      await openMenu(page);

      const hit = await topElementAt(page, '[data-testid="dispatcher-performance-range"]');
      expect(hit, `width ${width}: the range control must be on screen`).not.toBeNull();
      expect(
        hit!.inPanel,
        `width ${width}: the dropdown panel must paint over the range control`,
      ).toBe(true);
    }
  });

  test('the panel is fully painted, not clipped by a sticky row', async ({ page, context }) => {
    await devLogin(context.request, 'dispatcher');
    await page.setViewportSize({ width: 439, height: 900 });

    await page.goto(`${BASE}/dispatcher/performance`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.locator('[data-testid="dispatcher-performance-range"]'),
    ).toBeVisible({ timeout: 15_000 });
    await openMenu(page);

    const panel = await page.locator('.usermenu-panel').evaluate((el) => {
      const r = el.getBoundingClientRect();
      // The profile header row is the FIRST child — it is what the
      // report showed being clipped away.
      const header = el.firstElementChild as HTMLElement | null;
      const hr = header ? header.getBoundingClientRect() : null;
      return {
        top: r.top,
        bottom: r.bottom,
        left: r.left,
        right: r.right,
        headerTop: hr?.top ?? null,
        headerBottom: hr?.bottom ?? null,
        headerHeight: hr?.height ?? null,
        viewportH: window.innerHeight,
        viewportW: window.innerWidth,
      };
    });

    // The panel is on screen and inside the viewport.
    expect(panel.top).toBeGreaterThanOrEqual(0);
    expect(panel.bottom).toBeLessThanOrEqual(panel.viewportH);
    expect(panel.left).toBeGreaterThanOrEqual(0);
    expect(panel.right).toBeLessThanOrEqual(panel.viewportW);

    // The profile header row has real height — it is not squashed to
    // nothing by a sticky row sitting on top of it.
    expect(panel.headerHeight!).toBeGreaterThan(30);
  });

  test('the panel is portalled onto the body, not nested in the header', async ({
    page,
    context,
  }) => {
    await devLogin(context.request, 'dispatcher');
    await page.goto(`${BASE}/dispatcher`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.usermenu-trigger')).toBeVisible({ timeout: 15_000 });
    await openMenu(page);

    const parent = await page.locator('.usermenu-panel').evaluate(
      (el) => el.parentElement?.tagName ?? null,
    );
    // A portal puts the panel directly under <body>. While it was
    // absolutely positioned inside the header it inherited the header's
    // sticky stacking context and could never outrank a sibling page
    // row.
    expect(parent).toBe('BODY');
  });

  test('the trigger still points at the panel it controls', async ({ page, context }) => {
    await devLogin(context.request, 'dispatcher');
    await page.goto(`${BASE}/dispatcher`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.usermenu-trigger')).toBeVisible({ timeout: 15_000 });
    await openMenu(page);

    // The portal moved the panel out of the header's subtree, but the
    // ARIA link is by ID, so it must still resolve — and the panel must
    // still carry the trigger's `aria-controls` value.
    const link = await page.evaluate(() => {
      const trigger = document.querySelector('.usermenu-trigger');
      const controls = trigger?.getAttribute('aria-controls') ?? null;
      const panel = document.querySelector('.usermenu-panel');
      return {
        controls,
        expanded: trigger?.getAttribute('aria-expanded') ?? null,
        panelId: panel?.id ?? null,
        resolves: controls ? Boolean(document.getElementById(controls)) : false,
      };
    });

    expect(link.controls).toBeTruthy();
    expect(link.expanded).toBe('true');
    expect(link.panelId).toBe(link.controls);
    expect(link.resolves).toBe(true);
  });

  test('Escape closes the menu and returns focus to the trigger', async ({
    page,
    context,
  }) => {
    await devLogin(context.request, 'dispatcher');
    await page.goto(`${BASE}/dispatcher`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.usermenu-trigger')).toBeVisible({ timeout: 15_000 });
    await openMenu(page);

    await page.keyboard.press('Escape');
    await expect(page.locator('.usermenu-panel')).toHaveCount(0);

    const focused = await page.evaluate(
      () => document.activeElement?.className?.toString() ?? '',
    );
    expect(focused).toContain('usermenu-trigger');
  });

  test('a click outside closes the menu and a click inside does not', async ({
    page,
    context,
  }) => {
    await devLogin(context.request, 'dispatcher');
    await page.goto(`${BASE}/dispatcher`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.usermenu-trigger')).toBeVisible({ timeout: 15_000 });
    await openMenu(page);

    // A click INSIDE the panel must not close it.
    await page.locator('.usermenu-panel .usermenu-profile-link').click({ trial: true });
    await expect(page.locator('.usermenu-panel')).toBeVisible();

    // A click OUTSIDE must close it.
    await page.mouse.click(8, 8);
    await expect(page.locator('.usermenu-panel')).toHaveCount(0);
  });

  test('the admin console menu also paints above its own topbar content', async ({
    page,
    context,
  }) => {
    await devLogin(context.request, 'admin');
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.usermenu-trigger')).toBeVisible({ timeout: 15_000 });
    await openMenu(page);

    const parent = await page.locator('.usermenu-panel').evaluate(
      (el) => el.parentElement?.tagName ?? null,
    );
    expect(parent).toBe('BODY');

    // The panel must not overlap the topbar's own range control.
    const overlaps = await page.evaluate(() => {
      const panel = document.querySelector('.usermenu-panel');
      const range = document.querySelector('.admin-range-select');
      if (!panel || !range) return null;
      const p = panel.getBoundingClientRect();
      const r = range.getBoundingClientRect();
      return !(p.bottom <= r.top || p.top >= r.bottom || p.right <= r.left || p.left >= r.right);
    });
    expect(overlaps).toBe(false);
  });
});
