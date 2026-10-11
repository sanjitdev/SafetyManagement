/**
 * Navigate CTA URL builder
 * (app/crew/tickets/[id]/navigate-href.ts).
 *
 * CREW-005 (Intent 004, Unit 003): the "Navigate" CTA
 * on the per-ticket page opens the device's default
 * maps app with the ticket's location as the
 * destination. v1 picks the URL scheme based on the
 * platform:
 *
 *   - iOS: `maps://?daddr=<lat>,<lng>`
 *   - Android: `geo:<lat>,<lng>?q=<lat>,<lng>(label)`
 *   - Web (desktop / unknown): Google Maps directions
 *     `https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>`
 *
 * The function is a pure module (no DOM, no
 * navigator) so it is unit-testable in Node + Vitest.
 * The page passes `navigator.userAgent` from a small
 * `useMemo` after mount; the test passes an explicit
 * UA string.
 *
 * The `label` parameter is optional. When supplied, the
 * Android URL embeds it as the marker name; iOS and
 * web ignore it.
 */

export type NavigatePlatform = 'ios' | 'android' | 'web';

export interface NavigateInput {
  lat: number;
  lng: number;
  /** Optional human-readable marker label (e.g. the
   *  ticket's `locationLabel`). Used for the Android
   *  `geo:` scheme's `q=` marker. */
  label?: string | null;
}

/**
 * Detect the platform from a User-Agent string. The
 * heuristic is intentionally minimal — the v1 surface
 * only needs to distinguish iOS, Android, and the
 * desktop web fallback. iPadOS may report as Mac in
 * newer Safari; v1 accepts the desktop fallback for
 * iPadOS-on-Mac. A v1.1 bolt may tighten this.
 */
export function detectPlatform(userAgent: string | null | undefined): NavigatePlatform {
  if (!userAgent) return 'web';
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  return 'web';
}

/**
 * Build the navigate-href for the given platform +
 * coordinates. Pure function; the test passes an
 * explicit platform to pin each URL shape.
 */
export function buildNavigateHref(
  platform: NavigatePlatform,
  input: NavigateInput,
): string {
  const { lat, lng, label } = input;
  switch (platform) {
    case 'ios':
      return `maps://?daddr=${lat},${lng}`;
    case 'android': {
      // The Android `geo:` scheme embeds the label as
      // the marker. The label is URL-encoded so a
      // street name with spaces / Bangla survives.
      if (label) {
        return `geo:${lat},${lng}?q=${lat},${lng}(${encodeURIComponent(label)})`;
      }
      return `geo:${lat},${lng}?q=${lat},${lng}`;
    }
    case 'web':
      return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  }
}