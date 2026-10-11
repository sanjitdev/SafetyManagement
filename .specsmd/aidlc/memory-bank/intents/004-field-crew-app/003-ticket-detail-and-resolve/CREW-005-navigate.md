---
story: CREW-005-navigate
unit: 003-ticket-detail-and-resolve
intent: 004-field-crew-app
phase: construction
status: done
created: 2026-10-12T01:30:00Z
updated: 2026-10-12T03:00:00Z
---

# Story: CREW-005 — Navigate (open device maps app)

## Given / When / Then

### Acceptance 1 — iOS: `maps://` URL scheme

**Given** a crew member on an iOS device
**And** a ticket with `locationLat = 23.789`,
`locationLng = 90.4075`
**When** the crew member taps "Navigate"
**Then** the device opens Apple Maps with
the destination pre-filled at
`(23.789, 90.4075)`. The URL scheme is
`maps://?daddr=23.789,90.4075`.

### Acceptance 2 — Android: `geo:` URL scheme

**Given** a crew member on an Android
device
**When** the crew member taps "Navigate"
**Then** the device opens the default
maps app (Google Maps, in most cases) with
the destination pre-filled. The URL scheme
is `geo:23.789,90.4075?q=23.789,90.4075(label)`
where `label` is the ticket's
`locationLabel` (URL-encoded).

### Acceptance 3 — Desktop web: Google Maps `https://` fallback

**Given** a crew member on a desktop
browser
**When** the crew member taps "Navigate"
**Then** a new tab opens to
`https://www.google.com/maps/dir/?api=1&destination=23.789,90.4075`
with the destination pre-filled.

### Acceptance 4 — Platform detection

**Given** the page renders on any
device
**When** the page mounts
**Then** the "Navigate" CTA's `href` is
set based on `navigator.userAgent`:
- `/iPhone|iPad|iPod/i.test(ua)` →
  iOS scheme
- `/Android/i.test(ua)` → Android
  scheme
- else → desktop web fallback

The detection is a small pure function
in `app/crew/tickets/[id]/navigate-href.ts`
that takes `(lat, lng, label, ua)` and
returns the URL string. The function is
unit-tested in `tests/unit/navigate-href.test.ts`.

### Acceptance 5 — Hit area ≥ 44px tall

**Given** a 390x844 viewport
**When** the page renders
**Then** the "Navigate" CTA is a tappable
target ≥ 44px tall. (Standard mobile
accessibility; the page's other CTAs
follow the same rule.)

### Acceptance 6 — Opens in a new tab on web

**Given** a desktop browser
**When** the crew member taps "Navigate"
**Then** the link opens in a new tab
(`target="_blank"` with
`rel="noopener noreferrer"`). On mobile
the OS handles the URL scheme and opens
the maps app directly — the `target`
attribute is ignored by the OS.

## Technical Notes

- The CTA is a plain `<a>` element. The
  `href` is computed at render time from
  `navigator.userAgent`. The function
  `navigateHref(lat, lng, label, ua)`
  is exported from a small module and
  unit-tested.
- On iOS, the `maps://?daddr=` scheme
  is the documented Apple Maps URL. The
  page does NOT pin Apple Maps; the
  user can change the default maps app
  in iOS Settings, and the system
  re-routes the URL.
- On Android, the `geo:` scheme is the
  standard RFC 5870 URI for geographic
  locations. The `?q=` parameter adds a
  label that most apps render as the
  pin's tooltip. The label is
  URL-encoded with `encodeURIComponent`.
- On desktop, the Google Maps `dir/`
  endpoint is the public, no-auth way
  to deep-link to directions.
- The CTA is a "secondary" button
  visually (ghost / outline), not a
  primary action. The primary CTAs are
  the transition buttons. The "Navigate"
  sits in the location card.

## Out of Scope

- Real-time location tracking (the CTA
  opens the OS maps app; the crew is
  responsible for the actual navigation).
- Voice-guided turn-by-turn (the OS
  maps app handles that).
- "Avoid tolls" / "Fastest route"
  preferences (those are user prefs
  on the device's maps app, not in the
  CityFix app).
- A custom in-app map view (the WO-003
  PRD is silent; v1.1 may add a small
  embedded map preview if load
  justifies).

## Dependencies

- None beyond the standard browser
  APIs (`navigator.userAgent`).

## Cross-references

- `app/crew/tickets/[id]/navigate-href.ts`
  (new) — pure function.
- `app/crew/tickets/[id]/page.tsx`
  (delta) — the CTA in the location
  card uses `navigateHref(...)`.
- `tests/unit/navigate-href.test.ts`
  (new) — unit test for the URL
  builder.
- `lib/i18n/keys.ts` — new
  `crew.detail.navigate.cta` key
  (Bangla + English).
- `tests/15-crew-ticket-light.spec.ts`
  (delta) — Acceptance 4 (platform
  detection) is pinned as a Vitest
  unit test, not a Playwright check
  (the function is pure).
