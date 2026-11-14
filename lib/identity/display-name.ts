/**
 * Display-name resolution (lib/identity/display-name.ts).
 *
 * Intent 008 / Bolt 008-002 — Story 002 (Render Display Names on Ticket
 * Surfaces). Translates a (role, userId) pair to a human-readable name
 * for the dispatcher / crew ticket-detail surfaces. The raw internal
 * id (e.g. `user_citizen_rahim`) is not a useful display value: a
 * dispatcher reading the trail wants to see "Rahim", not a system
 * identifier.
 *
 * SERVER-SIDE FIRST, CLIENT FALLBACK
 * ----------------------------------
 * The dev-store fixture map below only covers the three demo
 * personas, and only fits the dev store's `user_*` ids. On Postgres
 * the ids are opaque (`cmvtghhi7000…`, `seed_cit_01`), so a purely
 * client-side map printed raw ids all over the dispatcher surfaces.
 *
 * The names are now joined SERVER-SIDE and shipped on the payload:
 *   - `ticket.reporterName`, `ticket.assignedCrewName`
 *   - `trail[].actorName`
 *
 * so the client-side helpers below are only the FALLBACK for a row
 * whose join was absent. Every call site prefers the server value.
 *
 * The category label has the same problem and the same fix, but the
 * slug is the stable key both backends agree on — see
 * `categorySlug` / `categoryLabelBySlug` below.
 *
 * Unknown ids fall back to the id itself ("graceful fallback" — the
 * raw id is the same thing the user would see in the old code, so
 * the new code is no worse than the old code for unknown rows).
 */

import type { Language } from '@/lib/i18n/keys';
import { t } from '@/lib/i18n/keys';

export type RoleForDisplay = 'citizen' | 'dispatcher' | 'crew' | 'admin';

const DEMO_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  // Citizens
  user_citizen_rahim: 'Rahim',
  // Dispatchers
  user_dispatcher_habib: 'Habib',
  // Field crew
  user_crew_rashid: 'Rashid',
};

/**
 * Resolve a (role, userId) pair to a human-readable display name.
 *
 * FALLBACK ONLY — the payload now carries the server-joined name
 * (`ticket.reporterName`, `ticket.assignedCrewName`,
 * `trail[].actorName`); call sites prefer that and only reach for
 * this helper when the join was absent.
 *
 * - Returns the role label ("Admin" / "অ্যাডমিন") for the admin role
 *   — admins do not surface their own name on dispatcher/crew pages.
 * - Returns the demo display name for the three known fixture users.
 * - Returns the id itself (graceful fallback) for any other id.
 *
 * The function never throws. Callers can pass the result directly
 * to a React node.
 */
export function displayNameFor(
  role: RoleForDisplay,
  userId: string,
): string {
  if (!userId) return '—';
  if (role === 'admin') return 'admin';
  return DEMO_DISPLAY_NAMES[userId] ?? userId;
}

/**
 * Category display name. Translates a categoryId to a localized
 * label using the i18n registry's `category.<slug>` keys (the
 * citizen's category picker uses the same keys, so the strings
 * stay in sync with the citizen-side surface).
 *
 * TWO KEYS, TWO BACKENDS
 * ----------------------
 * The dev store keys its categories `cat_streetlight`; Postgres
 * mints a CUID (`cmvtghhi700082f9o2jww09ry`) and carries the
 * stable machine key in a separate `slug` column (`streetlight`).
 * So we accept EITHER an id or a slug and resolve both to the
 * same i18n key.
 *
 * The slug is the STABLE key: `lib/dev-store.ts` and the Postgres
 * seed agree on `streetlight` / `pothole` / `drainage` /
 * `garbage` / `other`. Resolving by slug is what keeps the
 * dispatcher's category chart readable on the real database —
 * with ids alone the chart fell back to raw CUIDs.
 *
 * Returns the id itself (graceful fallback) for unknown ids.
 */
export function categoryLabel(
  categoryId: string,
  lang: Language,
): string {
  if (!categoryId) return '—';
  return categoryLabelBySlug(categorySlug(categoryId), lang, categoryId);
}

/**
 * The stable machine key for a category, given either its id or
 * its slug.
 *
 * `cat_streetlight` → `streetlight`
 * `streetlight`     → `streetlight`  (already a slug)
 * `cmvtghhi7000…`  → `null` (an opaque Postgres id — the caller
 *                       must resolve it against the database)
 */
export function categorySlug(categoryIdOrSlug: string): string | null {
  if (!categoryIdOrSlug) return null;
  if (categoryIdOrSlug.startsWith('cat_')) {
    return categoryIdOrSlug.slice('cat_'.length);
  }
  if (CATEGORY_SLUGS.has(categoryIdOrSlug)) return categoryIdOrSlug;
  return null;
}

/**
 * The category slugs the product knows about. Used to tell a slug
 * apart from an opaque database id without a database round-trip.
 */
const CATEGORY_SLUGS: ReadonlySet<string> = new Set([
  'streetlight',
  'pothole',
  'drainage',
  'garbage',
  'other',
]);

/**
 * The i18n key for a category slug.
 */
const CATEGORY_SLUG_KEYS: Readonly<
  Record<string, keyof typeof import('@/lib/i18n/keys').TRANSLATIONS>
> = {
  streetlight: 'category.streetlight',
  pothole: 'category.pothole',
  drainage: 'category.drainage',
  garbage: 'category.garbage',
  other: 'category.other',
};

/**
 * Localize a category by its SLUG.
 *
 * `fallback` is what to show when the slug is unknown — the
 * caller normally passes the raw id, so an unresolvable category
 * degrades to the same value the pre-fix code showed.
 */
export function categoryLabelBySlug(
  slug: string | null | undefined,
  lang: Language,
  fallback: string,
): string {
  if (!slug) return fallback || '—';
  const key = CATEGORY_SLUG_KEYS[slug];
  if (!key) return fallback || '—';
  return t(key, null, lang);
}

