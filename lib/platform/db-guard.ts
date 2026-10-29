/**
 * Production database guard (lib/platform/db-guard.ts).
 *
 * WHY THIS EXISTS
 * ---------------
 * Local dev and production now point at DIFFERENT databases:
 *
 *   local  → a PostgreSQL server on this machine (`localhost:5432`)
 *   prod   → Neon (hosted, `*.neon.tech`)
 *
 * That split is deliberate, but it creates one dangerous failure mode: if
 * a local-style `DATABASE_URL` ever reaches production, the deployed app
 * silently writes its citizens' data — real names, NID numbers, phone
 * numbers, photos — into a developer's personal Postgres instance on
 * their laptop, where it is neither backed up nor governed.
 *
 * Nothing in the request path would fail. The app would work perfectly
 * and the data would be in the wrong place. That is exactly the class of
 * bug that is invisible until someone notices the data is gone.
 *
 * So: in production, a loopback `DATABASE_URL` is a hard error.
 *
 * DESIGN NOTES
 * ------------
 * - **Lazy, not module-load.** Vercel runs `next build` in a separate
 *   process that may not have env vars exposed at build time, and a
 *   module-load throw would fail the build before the app ever serves a
 *   request. Same reasoning (and the same pattern) as the WebAuthn prod
 *   guard in `lib/auth/webauthn.ts`: validate on first use, loud-fail on
 *   the first real request, build-friendly.
 * - **Never throws in development.** The whole point of local dev is to
 *   use the local database.
 * - **Checks the host, not the whole URL.** The rule is "production must
 *   not talk to a loopback address". Hostname matching is the right
 *   granularity: `localhost`, `127.0.0.1`, `::1` and `0.0.0.0` are all
 *   loopback; `db.internal.example.com` is not, even though it might
 *   be a container-local database (and that is a legitimate production
 *   topology).
 */

/** Hosts that resolve to the machine running the process. */
const LOOPBACK_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '0.0.0.0',
  '[::1]',
]);

/**
 * Parse the host out of a Postgres connection string.
 *
 * `DATABASE_URL` is a URL (`postgresql://user:pass@host:port/db`), but
 * it is also commonly written in the libpq keyword form
 * (`host=localhost port=5432 dbname=cityfix`). Both are handled; the
 * keyword form falls back to a `host=` scan.
 *
 * Returns `null` when no host can be determined — the caller treats
 * that as "not obviously local" and lets the connection attempt speak
 * for itself.
 */
export function extractDatabaseHost(url: string | undefined): string | null {
  if (!url) return null;

  // URL form.
  try {
    const parsed = new URL(url);
    if (parsed.hostname) return parsed.hostname.toLowerCase();
  } catch {
    // Not a URL — fall through to the keyword form.
  }

  // libpq keyword form: `host=...` (possibly quoted).
  const match = url.match(/(?:^|\s)host\s*=\s*('([^']*)'|"([^"]*)"|([^\s]+))/i);
  if (match) {
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    if (value) return value.toLowerCase();
  }

  return null;
}

/** True when the host points at the local machine. */
export function isLoopbackDatabaseHost(host: string | null): boolean {
  if (!host) return false;
  if (LOOPBACK_HOSTS.has(host)) return true;
  // The whole 127.0.0.0/8 range is loopback.
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}

let asserted = false;

/**
 * Throws if production is configured to use a loopback database.
 *
 * Returns silently in development (local dev is the point) and when the
 * guard has already run in this process. Idempotent by design — it is
 * called from the DB entry points, which run on every request.
 */
export function assertProductionDatabaseConfig(): void {
  if (process.env.NODE_ENV !== 'production') return;
  if (asserted) return;
  asserted = true;

  const url = process.env.DATABASE_URL;
  const host = extractDatabaseHost(url);

  if (isLoopbackDatabaseHost(host)) {
    throw new Error(
      `[db-guard] DATABASE_URL points at a loopback host ("${host}") while NODE_ENV=production. ` +
        'Production must use the hosted database (Neon). A local DATABASE_URL in production ' +
        'would write citizens\' data to a developer\'s machine. ' +
        'Set DATABASE_URL in the Vercel project environment.',
    );
  }
}

/**
 * Test helper — clears the "already asserted" latch so a test can
 * exercise the guard more than once in the same process.
 */
export function _resetDbGuard(): void {
  asserted = false;
}
