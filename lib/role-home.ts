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

/**
 * Which roles may legitimately land on a given path prefix.
 *
 * A `?next=` deep link is a REQUEST to resume somewhere specific. It
 * is not a request to bypass the role model. Before staff could log
 * in with a password, the only post-auth surface was `/home`, so the
 * login page honoured `?next=` unconditionally — and every role that
 * arrived through a deep link was dumped on the citizen feed (or, via
 * the public landing's "Log in" CTA, on the citizen's report screen).
 *
 * The rule this table encodes:
 *
 *   - A path under a STAFF surface (`/admin`, `/dispatcher`, `/crew`)
 *     is only reachable by that surface's own role.
 *   - A path under a CITIZEN-ONLY surface (`/report`, `/register`,
 *     `/verify-otp`, `/login`) is only reachable by a citizen.
 *   - Everything else — `/home`, `/feed`, `/reports`, `/splash` — is
 *     a SHARED surface every role may read, so a deep link there is
 *     honoured for all roles.
 *
 * `null` means "no role may land here" and falls back to the role's
 * own home rather than a 403 dead end.
 */
const STAFF_SURFACES: ReadonlyArray<{ prefix: string; role: AppRole }> = [
  { prefix: '/admin', role: 'admin' },
  { prefix: '/dispatcher', role: 'dispatcher' },
  { prefix: '/crew', role: 'crew' },
];

const CITIZEN_ONLY_SURFACES: readonly string[] = [
  '/report',
  '/register',
  '/verify-otp',
  '/login',
];

/**
 * Is `path` a surface this role may be sent to?
 *
 * A role with no explicit claim on the path (i.e. a path that is not
 * under a staff surface and not citizen-only) is allowed — that is the
 * shared-surface case.
 */
export function roleCanVisit(
  role: string | null | undefined,
  path: string,
): boolean {
  const resolvedRole: AppRole =
    role && role in ROLE_HOME ? (role as AppRole) : 'citizen';

  for (const surface of STAFF_SURFACES) {
    if (path === surface.prefix || path.startsWith(surface.prefix + '/')) {
      return resolvedRole === surface.role;
    }
  }

  for (const prefix of CITIZEN_ONLY_SURFACES) {
    if (path === prefix || path.startsWith(prefix + '/')) {
      return resolvedRole === 'citizen';
    }
  }

  return true;
}

/**
 * Resolve where a signed-in user should land.
 *
 * `nextPath` is the SANITISED deep-link target (already passed
 * through `safeNextPath`), or null when the caller did not ask for
 * one. It is honoured only when the signed-in role is allowed to
 * visit that surface; otherwise the user lands on their own role's
 * home.
 *
 * The deep link is checked against the ROLE, not against a hard-coded
 * role list at the call site, so every auth entry point shares one
 * rule.
 */
export function resolvePostAuthTarget(
  role: string | null | undefined,
  nextPath: string | null | undefined,
): string {
  if (nextPath && roleCanVisit(role, nextPath)) {
    return nextPath;
  }
  return roleHome(role);
}
