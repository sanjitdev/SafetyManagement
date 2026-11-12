---
id: 009-003-auth-and-public-surfaces
unit: 003-auth-and-public-surfaces
intent: 009-ui-redesign
type: simple-construction-bolt
status: complete
stories:
  - 007-auth-and-public-mockups
  - 008-auth-and-public-page-implementation
created: 2026-11-02T18:25:00Z
started: 2026-11-02T18:25:00Z
completed: 2026-11-11T21:50:00Z
updated: 2026-11-11T21:50:00Z
current_stage: complete
stages_completed:
  - name: plan
    completed: 2026-11-02T18:25:00Z
    artifact: implementation-plan.md
  - name: implement
    completed: 2026-11-11T21:50:00Z
    artifact: tests/32-ui-redesign-auth.spec.ts
requires_bolts:
  - 009-002-design-foundation
enables_bolts:
  - 009-004-citizen-surfaces
  - 009-005-dispatcher-console
  - 009-006-crew-field-app
requires_units: []
blocks: false
complexity:
  avg_complexity: 2
  avg_uncertainty: 2
  max_dependencies: 1
  testing_scope: 3
  estimated_files: 18
---

# Bolt 009-003 — Auth + Public Surfaces

## Purpose

Redesign the entry surfaces. These are the first screens every user
sees and the screens with the most failure modes, so they set the
tone for the whole redesign.

## Stories

| Story ID | Title | FR | State |
|----------|-------|-----|-------|
| 007-auth-and-public-mockups | Auth + public mockups | FR-3 | complete |
| 008-auth-and-public-page-implementation | Auth + public page implementation | FR-3 | complete |

## Files Created

- `design-artifacts/D-Design-System/01-Visual-Design/mockups/08-login.html`
- `design-artifacts/D-Design-System/01-Visual-Design/mockups/09-register.html`
- `design-artifacts/D-Design-System/01-Visual-Design/mockups/10-verify-otp.html`
- `design-artifacts/D-Design-System/01-Visual-Design/mockups/11-public-landing.html`
- `design-artifacts/D-Design-System/01-Visual-Design/mockups/12-feed.html`
- `tests-mockups/baselines/01-mockups.spec.ts/08-login-{1440x900,1024x768}.png`
- `tests-mockups/baselines/01-mockups.spec.ts/09-register-{1440x900,1024x768}.png`
- `tests-mockups/baselines/01-mockups.spec.ts/10-verify-otp-{1440x900,1024x768}.png`
- `tests-mockups/baselines/01-mockups.spec.ts/11-public-landing-{1440x900,1024x768}.png`
- `tests-mockups/baselines/01-mockups.spec.ts/12-feed-{1440x900,1024x768}.png`

## Files Modified

- `design-artifacts/D-Design-System/01-Visual-Design/gallery.html` —
  5 new cards + the count (`12 mockups`) + the coverage matrix.
- `design-artifacts/D-Design-System/01-Visual-Design/README.md` — the
  file table, the tree, the coverage rationale.
- `tests/01-mockups.spec.ts` — the 5 new entries at
  `['LARGE', 'MEDIUM']`.

## Files Modified — story 008 (page implementation, 2026-11-11)

The six surfaces were re-composed to their approved mockups with
**presentation-layer changes only**. Every fetch, query parameter,
cursor, limit, validation rule, role gate and PII-stripping path is
byte-identical to the pre-existing implementation.

- `app/login/page.tsx` — two-region shell, focusable `role="alert"`
  error summary linked to `#login-password`, labelled fields, a
  `components/ui/Button` password reveal.
- `app/register/page.tsx` — three-stage progress rail, a live 2×2
  password-requirements grid (icon + word + colour per rule).
- `app/verify-otp/page.tsx` — six real digit inputs, the delivery
  channel named, a live `M:SS` resend countdown, a recovery card.
- `app/splash/page.tsx` — the two-column welcome hero.
- `app/feed/page.tsx` — the sticky filter row with live counts, the
  "new" badge + tint, the shared `StatusPill`.
- `components/PublicLandingExperience.tsx` — the hero, the
  tabular-numeral stats strip, the live map, the PII-stripped feed.
- `lib/i18n/keys.ts` — ~95 new keys, every one with `bn` + `en`.
- `tests/32-ui-redesign-auth.spec.ts` — **new**, 18 tests.

### Two deliberate divergences from the mockups

1. The register form keeps a **confirm-password field**. The mockup
   omits it, but the existing app requires it and dropping it would
   change behaviour.
2. The landing page renders the **live `CityActivityMap`**, not the
   mockup's static SVG placeholder — the mockup is a static artefact
   and cannot show real pins.

### The hand-rolled `<button>` sweep

The first pass left eleven hand-rolled `<button>` elements across the
six surfaces, which story 008 forbids. All eleven now render from
`components/ui/Button`: the password reveal (`login`), the language
pills (`verify-otp`, landing), the resend control and the back-confirm
dialog pair (`verify-otp`), the feed filter chip (`feed`), and the
landing chips, reset and load-older (`landing`). The grep that proves
it is `grep -c "<button"` returning zero on all six files.

## Implementation Notes

### The skill run that was rejected

The `ui-ux-pro-max` skill was invoked as requested. Two runs:

1. **Product-wide** (`"civic government SaaS operations dashboard modern
   professional trustworthy" --design-system`) → **Glassmorphism**,
   Poppins / Open Sans, an orange CTA. **Rejected**: it contradicts the
   locked Accessible + Swiss decision, and Poppins does not render
   Bangla — the one thing the product cannot compromise on.
2. **Auth-domain** (`"government public service login authentication
   trust" --design-system`) → **Accessible & Ethical**,
   *Minimal Single Column*, navy `#0F172A` + `#0369A1` accent,
   Atkinson Hyperlegible, 3–4px focus rings, 44×44 touch targets, the
   no-emoji-icon rule. **Accepted** — this output is what shaped the
   two-region auth shell and the 3-benefit + trust-strip story column.

### What each mockup establishes

| Mockup | The pattern it defines |
|--------|----------------------|
| `08-login` | Two-region auth shell — form left, dark civic story right, collapsing below 1024px. A focusable `role="alert"` error summary linked to `#login-password`. Labelled phone + password fields with `aria-describedby`. Show/hide password. A "সরকারি প্রতিষ্ঠানের নিরাপদ লগইন" secondary CTA and a legal line. |
| `09-register` | Three-stage funnel rail (অ্যাকাউন্ট → ফোন যাচাই → শুরু). Live password-requirement rows — each row is icon + word + colour, never colour alone. Consent checkbox. "পরবর্তী ধাপ — ফোন যাচাই" CTA. |
| `10-verify-otp` | Top bar with back / brand / language. Masked phone `+880 1712-***-678`. A delivery-state card naming SMS as the channel. Six single-digit OTP boxes with filled + error states. An inline `role="alert"` wrong-code error. Resend countdown `0:42`. A recovery card for when the code does not arrive. An anti-phishing footnote. |
| `11-public-landing` | Sticky top bar. Hero with eyebrow + XL headline + sub + a Report / How-it-works CTA pair. A live-stats strip (৪৮২ reports, ৩৯৭ resolved, ৩.৪ দিন avg) with tabular numerals. A map card with status-coloured pins + a legend. A 3-item trust strip. A 6-card activity feed whose status pills carry icon + word + colour. A footer with OSM / MapLibre attribution. |
| `12-feed` | The signed-in citizen app header — Phosphor nav icons, Report CTA, language / theme toggle, avatar. A sticky filter chip row with live counts. A 6-row feed where the newest row carries a "new" badge (shape + word, not tint alone). Status pills and ward pills. A load-more button. |

Every mockup uses only `var(--color-*)` tokens defined in
`tokens.css`, inlines SVG icons (no emoji), and carries Bangla-first
copy.

### The icon-markup problem, and its fix

The mockups must render offline and statically, so they cannot import
a React icon component. They needed real icon geometry, not emoji.

A temporary helper (`scripts/.tmp-dump-icons.mjs`) rendered the
Phosphor SSR output to static SVG markup, which was then inlined into
the mockups. The helper and its dump (`.tmp-icons.json`) were
temporary build aids and were **deleted** after the mockups were
written — they are not part of the deliverable.

### A baseline drift worth recording

`11-public-landing` failed its baseline twice: the page height moved
from 1484px to 1566px at 1024px wide. The cause was the Google Fonts
web font loading at different metrics on a different run, not a
layout change. Recapturing with `npm run test:update-baselines`
fixed it.

**The fix before the final sign-off**: self-host Noto Sans Bengali so
the baseline is deterministic instead of occasionally flaky. Tracked
as an open decision in the intent's inception log.

## Verification

Story 007 (mockups):

| Gate | Command | Result |
|------|---------|--------|
| Types | `npx tsc --noEmit` | clean |
| Lint | `npm run lint` | 0 errors (56 pre-existing warnings) |
| Unit | `npm run test:unit` | 98 files / **1430 passed** |
| Visual | `npm run test:mockups` | **25/25** |
| i18n | `npm run check:i18n` | ok (770 keys) |
| Build | `npm run build` | green |

Story 008 (page implementation, 2026-11-11):

| Gate | Command | Result |
|------|---------|--------|
| Types | `npx tsc --noEmit` | clean |
| Unit | `npm run test:unit` | 123 files / **2148 passed** |
| Route specs | `playwright test tests/ --ignore-snapshots` | **368 passed**, 12 failed (all pre-existing) |
| Story spec | `playwright test tests/32-ui-redesign-auth.spec.ts` | **18 passed** |
| i18n | `npm run check:i18n` | ok (1091 keys) |

The twelve failures are pre-existing and unrelated to this bolt. Each
was reproduced by stashing this change set and re-running against
`HEAD` (10c50a5): `tests/04` (1 — the ADR-007 admin-WebAuthn gate),
`tests/20` (5) and `tests/27` (6).

### The story spec passes in BOTH backends (2026-11-12)

`tests/32-ui-redesign-auth.spec.ts` is backend-agnostic. It was
verified twice — once against the in-memory dev store
(`CITYFIX_DEV_STORE=1`) and once against the real local Postgres
(`next dev` with no dev-store flag) — and passed **18/18 in each**.

Three things had to change for that, and each is worth recording
because the symptom pointed somewhere else:

1. **The id triple is DISCOVERED, not hard-coded.** The spec used to
   post `city_dhaka_north` / `cat_streetlight` / `ward_14` — dev-store
   shapes. In real mode the ids are cuids, so the create answered 403
   `cross_city_forbidden` (the route rejects a foreign city id before
   it looks at the ward or the category). The spec now reads
   `(cityId, categoryId, wardId)` off the first row of
   `GET /api/v1/activity/public`, which is session-scoped, so the
   triple is always in the session's own city. The dev-store
   constants remain only as a fallback for an empty feed.
2. **The ticket id is read from the response body**, not matched with
   a `/"id":"(tkt_[^"]+)"/` regex — the dev store mints `tkt_*` ids
   and Postgres mints cuids, and the response nests the ticket under
   `ticket.id`.
3. **The "all" chip count asserts the right contract.** It counts the
   WHOLE fetched set, not the rows on screen — the feed paginates the
   LIST (`PAGE_SIZE = 20`) while the chips count over every ticket
   (`app/feed/page.tsx`, the `counts` memo). The old assertion
   compared the chip against the rendered row count, which is only
   equal while the city has fewer tickets than one page. It now
   asserts the chip equals the API's own `total` and is at least the
   rendered row count.

### A Playwright hang worth recording

The login spec pins `x-forwarded-for` so its wrong-password attempt
gets its own lockout counter. Doing that with
`route.continue({ headers })` **hung the request**: the fetch in
`app/login/page.tsx` never resolved, the submit button stayed
disabled on "লগ ইন হচ্কে…", and the error summary never rendered. The
body was never changed, but the original `content-length` was
replayed against a rewritten header set. Deleting `content-length`
before the override lets the transport recompute it, and the request
completes normally.

### One dev-server hazard: two servers, one `.next`

Running a second `next dev` on another port against the SAME `.next`
directory corrupts the first server's route manifest — routes start
answering 404 while they still exist on disk, and the webpack cache
logs `ENOENT` on paths it has already written. This cost several
debugging cycles and looks exactly like a code defect (the earlier
`__webpack_modules__[moduleId] is not a function` 500 was the same
class). The reliable sequence is: stop every server, `rm -rf .next`,
start ONE server, warm the routes the spec touches with a `curl`
loop, then run. A first compile can take ~20s, which exceeds a 30s
test timeout if the spec navigates to the route as it is compiling.

## Out of Scope

- New endpoints or auth flows — the API is unchanged.
- The citizen, dispatcher, crew and admin surfaces — Units 004–007.

## Risk Posture

| Risk | Mitigation |
|------|-----------|
| The mockups drift from the tokens later | `tests/unit/ui/mockup-tokens.test.ts` fails on any undefined `var(--token)` reference. |
| The auth pages are implemented before the mockups are approved | The approval gate is recorded in the design log; Story 008 stays `ready` until then. |
| The web font makes the baselines flaky | Self-hosting the font before the Wave 7 regeneration. |
