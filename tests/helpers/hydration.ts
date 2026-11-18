/**
 * Hydration helpers for Playwright route specs
 * (tests/helpers/hydration.ts).
 *
 * ── Why this exists ──────────────────────────────────────────────
 *
 * `page.goto(url, { waitUntil: 'domcontentloaded' })` returns when the
 * HTML is PARSED. It says nothing about whether React has HYDRATED —
 * taken the parsed HTML, attached the event handlers and made the page
 * interactive.
 *
 * `expect(locator).toBeVisible()` is not a hydration signal either: it
 * only proves the server-rendered markup is on screen. React attaches
 * `onClick` / `onChange` during hydration, so on a heavy page the
 * element can be VISIBLE and still INERT.
 *
 * A click that lands in that window is silently swallowed. The DOM
 * event fires and bubbles to `document` (so a `document`-level
 * listener sees it), but React's synthetic handler never runs, so the
 * component never responds. The symptom looks exactly like a product
 * bug — "the menu does not open", "the filter does not apply" — but it
 * is purely a harness race.
 *
 * This was measured, not assumed. In `tests/35-user-menu-overlay.spec.ts`
 * the admin-console test failed on CI with "the user menu does not open",
 * and reproduced locally at roughly **17 failures in 25** once the
 * machine was loaded. Probing the DOM node showed the cause exactly:
 *
 *   failing run : hasReactProps=false, hasOnClick=false  → not hydrated
 *   passing run : hasReactProps=true,  hasOnClick=true   → hydrated
 *
 * The `/admin` console compiles ~6700 modules, so it hydrates later
 * than the lighter pages — which is why the same spec was rock-solid on
 * `/dispatcher/performance` and flaky on `/admin`.
 *
 * ── The signal ───────────────────────────────────────────────────
 *
 * React stores a DOM element's props ON THE NODE, under a key that
 * starts with `__reactProps$`. That key is only present once the
 * component has hydrated, and `props.onClick` being a function
 * proves the very handler the test is about to invoke is attached.
 *
 * This is strictly stronger than the `window.next.router` signal the
 * suite used before: the router booting says the App Router client
 * runtime is live, but says nothing about whether THIS element's
 * handlers are wired up. `waitForHydrated` accepts a selector for
 * exactly that reason — when you are about to click a specific button,
 * wait for that button, not for the page.
 *
 * `window.next.router` remains available as a page-level fallback for
 * surfaces with no probeable element.
 */

import type { Page } from '@playwright/test';

/** Default ceiling for a hydration wait. Generous: CI runners are slow. */
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Wait until React has hydrated the element matched by `selector`.
 *
 * With no selector, waits for `<body>` to carry React props — a
 * page-level "the app is interactive now" signal. Prefer passing the
 * selector of the element you are about to interact with; it is both
 * faster and a stronger guarantee.
 *
 * @throws Playwright's timeout error if hydration has not happened.
 */
export async function waitForHydrated(
  page: Page,
  selector?: string,
  timeout: number = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  await page.waitForFunction(
    (sel: string | undefined) => {
      const root = sel ? document.querySelector(sel) : document.body;
      if (!root) return false;
      const key = Object.keys(root).find((k) => k.startsWith('__reactProps$'));
      if (!key) return false;
      if (!sel) return true;
      // A specific element was asked for: prove ITS handler is attached,
      // not merely that the tree around it hydrated.
      const props = (root as unknown as Record<string, unknown>)[key] as
        | { onClick?: unknown; onChange?: unknown }
        | undefined;
      return typeof props?.onClick === 'function' || typeof props?.onChange === 'function';
    },
    selector,
    { timeout },
  );
}

/**
 * Wait for the Next.js App Router client runtime to be live.
 *
 * Weaker than `waitForHydrated` — it proves the router booted, not that
 * a particular element's handlers are attached. Use it only where no
 * probeable element exists, or as a cheap first gate before a
 * `waitForHydrated` on a specific selector.
 */
export async function waitForRouter(
  page: Page,
  timeout: number = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  await page.waitForFunction(
    () => !!(window as unknown as { next?: { router?: unknown } }).next?.router,
    undefined,
    { timeout },
  );
}

/**
 * Navigate and wait for the target element to be hydrated.
 *
 * The default navigation in this suite is `domcontentloaded`, which
 * resolves long before the page is interactive. Pair it with this
 * helper whenever the next statement interacts with a React-controlled
 * element.
 */
export async function gotoHydrated(
  page: Page,
  url: string,
  selector?: string,
  timeout: number = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await waitForHydrated(page, selector, timeout);
}
