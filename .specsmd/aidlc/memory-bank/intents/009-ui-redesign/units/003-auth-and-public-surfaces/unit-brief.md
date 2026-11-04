---
unit: 003-auth-and-public-surfaces
intent: 009-ui-redesign
status: in-progress
created: 2026-11-02T18:25:00Z
updated: 2026-11-02T19:10:00Z
---

# Unit 003 — Auth + Public Surfaces (unit-brief)

## Goal

Redesign the entry surfaces. These are the first screens every user
sees and the screens with the most failure modes, so they set the
tone for the whole redesign.

## Scope

### Mockups (approval gate)

| Mockup | Surface | Pattern |
|--------|---------|---------|
| `08-login.html` | Sign in | Two-region auth shell: form left / dark civic-story right. Collapses below 1024px. |
| `09-register.html` | Create account | Three-stage funnel rail (অ্যাকাউন্ট → ফোন যাচাই → শুরু); live password-requirement rows. |
| `10-verify-otp.html` | Phone verification | Six single-digit OTP boxes, named delivery channel, resend countdown, recovery card. |
| `11-public-landing.html` | Anonymous landing | Hero + live stats strip + status-coloured map card + trust row + PII-stripped feed. |
| `12-feed.html` | Signed-in feed | App header + sticky filter chips with live counts + "new" badge state. |

Every mockup uses only `var(--color-*)` tokens defined in
`tokens.css` — no hard-coded hex — inlines SVG icons (no emoji), and
carries Bangla-first copy.

### Implementation

`/login`, `/register`, `/verify-otp`, `/` (public landing), `/feed`,
`/splash` — re-composed from `components/ui/` primitives.

## Files

- `design-artifacts/D-Design-System/01-Visual-Design/mockups/08-login.html` (new)
- `design-artifacts/D-Design-System/01-Visual-Design/mockups/09-register.html` (new)
- `design-artifacts/D-Design-System/01-Visual-Design/mockups/10-verify-otp.html` (new)
- `design-artifacts/D-Design-System/01-Visual-Design/mockups/11-public-landing.html` (new)
- `design-artifacts/D-Design-System/01-Visual-Design/mockups/12-feed.html` (new)
- `design-artifacts/D-Design-System/01-Visual-Design/gallery.html` — 5 cards
  + the coverage matrix.
- `design-artifacts/D-Design-System/01-Visual-Design/README.md` —
  the file table, the tree and the coverage rationale.
- `tests/01-mockups.spec.ts` — the 5 new entries at
  `['LARGE', 'MEDIUM']`.
- `tests-mockups/baselines/01-mockups.spec.ts/` — 10 new PNGs.
- `app/login/page.tsx`, `app/register/page.tsx`,
  `app/verify-otp/page.tsx`, `app/page.tsx`, `app/feed/page.tsx`,
  `app/splash/page.tsx` — re-composed.
- `components/PublicLandingExperience.tsx` — re-composed.
- `tests/32-ui-redesign-auth.spec.ts` — new route spec.
- `lib/i18n/keys.ts` — new keys for the redesigned copy.

## Stories

### 007-auth-and-public-mockups

**As a** reviewer of the redesign
**I want** five static mockups for the entry surfaces
**So that** I can approve the direction before a line of page code is
written.

**Given** the Wave 1 foundation (tokens + primitives + icon registry)
**When** I open `gallery.html`
**Then** I see the five Wave 2 mockups alongside the seven Wave 1
ones
**And** each mockup renders with only `tokens.css` variables.

### 008-auth-and-public-page-implementation

**As a** citizen signing in for the first time
**I want** the auth screens to tell me exactly what is wrong and how
to fix it
**So that** I am never left guessing which field the platform
rejected.

**Given** I submit the sign-in form with an invalid password
**When** the request fails
**Then** a focusable error summary appears above the form and links to
the offending field
**And** the field itself carries an inline `role="alert"` message
**And** the show/hide toggle and the recovery path are both reachable
by keyboard.

## Acceptance

### Mockups

- All five mockups exist, are token-pure, emoji-free and Bangla-first.
- `gallery.html` lists 12 mockups with an updated coverage matrix.
- `tests/01-mockups.spec.ts` captures all five at 1440×900 and
  1024×768.
- 10 new committed baselines; `npm run test:mockups` → **25/25**
  green.
- `tests/unit/ui/mockup-tokens.test.ts` passes for the new files.

### Implementation

- Each of the six routes renders from primitives — no hand-rolled
  `<button>`.
- Every invalid-input path shows a focusable error summary linked to
  the field + an inline `role="alert"`.
- Every input has a `<label for>`; no placeholder-only field.
- The password rules show a per-rule icon + word + colour.
- The OTP screen names its delivery channel, shows the resend
  countdown, and offers a recovery card.
- The public landing shows tabular figures and a PII-stripped feed.
- `tests/32-ui-redesign-auth.spec.ts` drives the real forms against
  the dev store, waiting for `window.next.router` before filling
  controlled inputs (the Intent 008 hydration trap).
- New i18n keys ship `bn` + `en` together; `npm run check:i18n`
  green.

### Exit gate

`npx tsc --noEmit` clean · `npm run lint` 0 errors · `npm run
test:unit` green · `npm run test:mockups` green · `npm run
check:i18n` green · `npm run build` green.

## Status

- **Mockups:** shipped (5 mockups, gallery wiring, 10 baselines).
- **Page implementation:** pending.

## Notes

The `ui-ux-pro-max` skill was invoked for the auth direction. Its
product-wide run returned *Glassmorphism* + Poppins — **rejected**,
because it contradicts the locked Accessible + Swiss decision and
because Poppins does not render Bangla. Its auth-domain run returned
*Accessible & Ethical* + *Minimal Single Column* + navy `#0F172A` +
Atkinson Hyperlegible + 3–4px focus rings + 44×44 targets + the
no-emoji-icon rule — **accepted**; that output is what shaped the
two-region auth shell and the 3-benefit + trust-strip story column.

A recurring baseline failure was worth recording: `11-public-landing`
drifted by 82–156px of height between runs. The cause is the Google
Fonts web font loading at a different metric on a different run, not
a layout change. Recapturing with `npm run test:update-baselines`
fixed it. A future wave should consider self-hosting the font so the
baseline is deterministic.
