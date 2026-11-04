---
intent: 009-ui-redesign
phase: inception
status: complete
created: 2026-11-02T18:00:00Z
updated: 2026-11-02T19:10:00Z
---

# System Context: 009-ui-redesign

## Boundary

In-scope surfaces:

- `design-artifacts/D-Design-System/01-Visual-Design/tokens.css` — the
  single source of truth for the visual language.
- `design-artifacts/D-Design-System/01-Visual-Design/components.html`
  + `gallery.html` + `mockups/*.html` — the visual reference and the
  per-wave approval artefacts.
- `design-artifacts/D-Design-System/02-Assets/` — brand marks,
  favicon, OG image, attribution notices.
- `app/globals.css` — global CSS layer (focus ring, reduced motion,
  8px rhythm, `.sr-only`, print styles).
- `app/layout.tsx` — `themeColor` + document metadata.
- `components/ui/**` — the primitive library every page composes from.
- `components/ui/charts/**` — the chart primitives.
- `lib/ui/icon-map.ts` — the Phosphor icon registry.
- `components/AppHeader.tsx` — the global chrome.
- The 31 routes listed in the wave table below.
- `lib/i18n/keys.ts` — new keys only; existing keys are reused.
- `tests/unit/components/**`, `tests/unit/ui/**` — the primitive and
  token contracts.
- `tests/01-mockups.spec.ts` + `tests-mockups/baselines/**` — the
  visual gate.

Out-of-scope surfaces:

- `app/api/**` — no endpoint changes.
- `prisma/schema.prisma` + migrations — no schema changes.
- `lib/serializers/**` — the citizen trust boundary is unchanged.
- `lib/auth/**`, `lib/platform/push.ts`, `lib/photo/**` — untouched.
- The MapLibre map internals — chrome only.
- Real city photography, real SMS delivery, a real city seal.

## Route Coverage by Wave

| Wave | Unit | Routes | Mockups |
|------|------|--------|---------|
| 0 | 001-ci-unblock | — (build + CI pipeline) | — |
| 1 | 002-design-foundation | — (shared layer) | — |
| 2 | 003-auth-and-public-surfaces | `/login`, `/register`, `/verify-otp`, `/`, `/feed`, `/splash` | `08`–`12` |
| 3 | 004-citizen-surfaces | `/home`, `/report/(create)/{category,location,photo,note,summary}`, `/report/[id]/submitted`, `/reports`, `/reports/[id]` | `13`–`16` |
| 4 | 005-dispatcher-console | `/dispatcher`, `/dispatcher/tickets/[id]`, `/dispatcher/map`, `/dispatcher/dedup`, `/dispatcher/monitor`, `/dispatcher/performance` | `17`–`21` |
| 5 | 006-crew-field-app | `/crew`, `/crew/tickets/[id]` | `22`–`23` |
| 6 | 007-admin-console | `/admin`, `/admin/tickets`, `/admin/tickets/[id]`, `/admin/audit`, `/admin/cities`, `/admin/cities/[id]/{setup,wards,taxonomy,users,adoption}` | `24`–`28` |
| 7 | 008-verification-and-signoff | all 31 | — |

## External Surfaces (Read-Only)

- `lib/i18n/keys.ts` — the typed translation registry. The redesign
  **reads** it and **adds** to it; it does not restructure it.
- `lib/role-home.ts` — role-scoped routing at `/`, `/splash`,
  `/login`. The redesign must not change the routing contract
  (`tests/unit/role-redirect-call-sites.test.ts` guards it).
- `lib/serializers/ticket.ts` — the citizen trust boundary.
  Unchanged.
- `next.config.js` — CSP headers. Any new external asset (font, CDN)
  must be allow-listed; the mockups use the Google Fonts + Tailwind CDN
  hosts that are already allow-listed for the mockup route.
- `tests/29-admin-dark-theme.spec.ts` — the dark-theme regression
  spec; it runs in every wave's gate.
- `tests/30-role-redirect.spec.ts` — the hydration-wait pattern
  (`window.next.router`) that every new Playwright route spec must
  reuse.

## Trust Boundary

The serializer (`lib/serializers/ticket.ts`) remains the load-bearing
trust boundary for citizen surfaces. The redesign changes chrome only:
no new data is exposed, no field is un-redacted, and the display-name
rule from Intent 008 (admin names hidden; ids only in `data-testid`)
carries over unchanged.

The public landing (`/`) is the one surface where anonymous visitors
see city activity. It must remain **PII-stripped** — the redesigned
landing shows status, category, ward and timestamp, never a reporter
name, phone number or exact address.

## NFR Constraints

- **Performance** — no material FCP regression; charts are
  `dynamic()`-imported; Phosphor imports are per-icon.
- **Accessibility** — AA contrast in all three theme contexts; no
  colour-only status encoding; 44px touch targets; keyboard-operable
  error summaries; `prefers-reduced-motion` honoured.
- **Reliability** — visual baselines are gating; token drift and i18n
  drift are caught by unit tests / `check:i18n`.
- **Compliance** — bilingual parity on every new key; OSM + MapLibre
  attribution; no fabricated authority marks.
