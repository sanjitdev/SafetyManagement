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
 * Source of truth:
 *   - The dev-store fixture names (lib/dev-store.ts) for the demo
 *     personas: Rahim (citizen), Habib (dispatcher), Rashid (crew).
 *   - The role label for the admin role (we never expose the admin's
 *     own name on a non-admin surface).
 *
 * The helper is intentionally a pure function with no DB / no fetch.
 * The wire shape we get from `serializeTicketForRole` already
 * includes the actor id (`entry.actorId` for trail entries,
 * `ticket.reporterId` for the citizen row, `ticket.assignedCrewId`
 * for the crew row). Looking up the name on the client keeps the
 * route shape stable: we don't need to denormalise the names into
 * the response payload.
 *
 * Unknown ids fall back to the id itself ("graceful fallback" — the
 * raw id is the same thing the user would see in the old code, so
 * the new code is no worse than the old code for unknown rows).
 *
 * Production behaviour: the fixture map only covers the demo
 * personas. In production, the role would have to be resolved
 * against the User table (server-side) — that is a v1.1 follow-up.
 * The fallback to the raw id is intentional for now: the demo
 * personas are the only ids that ever land on these surfaces in v1.
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
 * Returns the id itself (graceful fallback) for unknown ids.
 */
export function categoryLabel(
  categoryId: string,
  lang: Language,
): string {
  if (!categoryId) return '—';
  const map: Record<string, keyof typeof import('@/lib/i18n/keys').TRANSLATIONS> = {
    cat_streetlight: 'category.streetlight',
    cat_pothole: 'category.pothole',
    cat_drainage: 'category.drainage',
    cat_garbage: 'category.garbage',
    cat_other: 'category.other',
  };
  const key = map[categoryId];
  if (!key) return categoryId;
  return t(key, null, lang);
}

