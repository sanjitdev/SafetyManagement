/**
 * Service worker registration (lib/crew/service-worker.ts).
 *
 * WO-003 acceptance:
 *
 *   > "PWA installable (per design log cross-cutting decision)"
 *
 * and the scope decision:
 *
 *   > "PWA service worker scope. Recommendation: cache shell +
 *   >  tokens; ticket data is always live (no stale cache)."
 *
 * The worker itself lives at `public/sw.js` — it MUST be served
 * from the site root so its scope covers `/crew/...`. A worker
 * served from `/crew/sw.js` would only control `/crew/*`, which
 * is narrower than the shell it needs to cache.
 *
 * This module owns the registration lifecycle:
 *
 *   - Registration is opt-in per environment: it is skipped
 *     when `npx next dev` is running without HTTPS (the browser
 *     refuses to register a service worker on `http://` other
 *     than `localhost`, and a silent failure would be worse
 *     than no registration).
 *   - Registration is idempotent — calling it twice is safe.
 *   - The module never throws. A failed registration degrades to
 *     "no service worker", which is the pre-WO-003 behaviour.
 */

/**
 * The service worker's path. Served from the site root by
 * Next.js's `public/` handling.
 */
export const SERVICE_WORKER_PATH = '/sw.js';

/**
 * True when the current environment can host a service worker.
 *
 * The browser only allows service workers over HTTPS, with
 * `localhost` as the development exception. Next.js's dev
 * server runs on `http://localhost:3000`, so the worker DOES
 * register in local dev — which is what the Playwright suites
 * need.
 */
export function isServiceWorkerSupported(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof navigator === 'undefined') return false;
  if (!('serviceWorker' in navigator)) return false;
  return window.isSecureContext === true;
}

/**
 * Register the service worker.
 *
 * Resolves `true` when a worker is now controlling the page,
 * `false` when registration was skipped or failed. Never
 * rejects — a missing service worker is not an error the crew
 * member needs to see.
 */
export async function registerServiceWorker(): Promise<boolean> {
  if (!isServiceWorkerSupported()) return false;
  try {
    const registration = await navigator.serviceWorker.register(
      SERVICE_WORKER_PATH,
      { scope: '/' },
    );
    await navigator.serviceWorker.ready;
    return Boolean(registration);
  } catch {
    return false;
  }
}

/**
 * Unregister every service worker for this origin. Test-only /
 * "reset the app" affordance.
 */
export async function unregisterServiceWorker(): Promise<boolean> {
  if (typeof navigator === 'undefined') return false;
  if (!('serviceWorker' in navigator)) return false;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    const results = await Promise.all(
      registrations.map((r) => r.unregister()),
    );
    return results.every(Boolean);
  } catch {
    return false;
  }
}
