/**
 * Client-safe geographic constants (lib/geo/constants.ts).
 *
 * These are pure data — no node: imports — so they are safe to import
 * from both client components and server modules. The dev-store
 * (`lib/dev-store.ts`) imports the same constant via this module rather
 * than declaring its own copy.
 */

export const DHAKA_CENTER = { lat: 23.7890, lng: 90.4075 };