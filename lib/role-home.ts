/**
 * Role → home surface (lib/role-home.ts).
 *
 * The four-role model (citizen / dispatcher / crew / admin) has
 * four different landing surfaces. Before staff could log in with a
 * password, only the citizen path existed, so every caller hard-coded
 * `/home` and a staff user who somehow got a session landed on the
 * citizen feed.
 *
 * Centralising the mapping here means the login page, the splash
 * page, and any future post-auth router all agree on where a role
 * belongs — and there is exactly one place to change it if the
 * surfaces move.
 *
 * NOTE: the admin home is `/admin`, NOT `/admin/tickets`.
 *
 * `app/admin/` originally held only `audit/`, `cities/`, `tickets/`
 * and `layout.tsx` — no index route — so `GET /admin` was a 404 and
 * the admin's home had to be a child (`/admin/tickets`). The index
 * page `app/admin/page.tsx` now exists and links every admin
 * surface, so the admin lands on the console itself.
 */

/** The four roles in the fixed v1 role model. */
export type AppRole = 'citizen' | 'dispatcher' | 'crew' | 'admin';

/**
 * Where each role lands after signing in.
 *
 * - citizen    → the home feed (their reports + city activity)
 * - dispatcher → the triage queue (their primary work surface)
 * - crew       → today's assignments (the field app surface)
 * - admin      → the admin console (card grid over every surface)
 */
export const ROLE_HOME: Record<AppRole, string> = {
  citizen: '/home',
  dispatcher: '/dispatcher',
  crew: '/crew',
  admin: '/admin',
};

/**
 * Resolve the home surface for a role.
 *
 * An unknown or missing role falls back to the citizen home — the
 * safest default, because `/home` is the surface every role can
 * read, whereas `/dispatcher` would bounce a citizen into a 403.
 */
export function roleHome(role: string | null | undefined): string {
  if (role && role in ROLE_HOME) {
    return ROLE_HOME[role as AppRole];
  }
  return ROLE_HOME.citizen;
}
