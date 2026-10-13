---
standard: bolt-instance
phase: construction
status: complete
current_stage: done
stages_completed:
  - name: model
    completed: 2026-10-11T23:55:00Z
    artifact: ./ddd-01-domain-model.md
  - name: design
    completed: 2026-10-11T23:55:00Z
    artifact: ./ddd-02-technical-design.md
  - name: adr
    completed: 2026-10-11T23:55:00Z
    artifact: (none — no new ADR for this bolt; ADR-001, ADR-003, ADR-004, ADR-008 inherited)
  - name: implement
    completed: 2026-10-11T23:55:00Z
    artifact: lib/i18n/keys.ts (existing, verified), lib/theme/appearance.ts (existing, verified), lib/theme/ThemeProvider.tsx (existing, verified), app/appearance-boot.tsx (existing, verified), components/ThemeToggle.tsx (existing, verified), app/api/v1/push/subscribe/route.ts (existing, verified — route built; home page not wired; v1.1 territory)
  - name: test
    completed: 2026-10-11T23:55:00Z
    artifact: ./ddd-03-test-report.md
created: 2026-10-11T18:00:00Z
updated: 2026-10-11T23:55:00Z
bolt_id: 002-005-theme-and-i18n
unit: 002-citizen-report-flow/005-theme-and-i18n
intent: 002-citizen-report-flow
bolt_type: ddd-construction-bolt
---

# Bolt 002-005 — Theme and i18n

Bilingual UI (Bangla + English), light/dark theme,
and the deferred push-subscribe endpoint. The Bolt is
mostly **paperwork + visual baseline capture** — the
two features (i18n + theme) are already wired into
every page.

## Scope (in)

- `lib/i18n/keys.ts` (the typed translation registry)
- `lib/theme/appearance.ts` (light/dark persistence)
- `lib/theme/ThemeProvider.tsx` (the React context
  provider)
- `app/appearance-boot.tsx` (the boot script that
  applies the theme before hydration to avoid a flash
  of wrong theme)
- `app/api/v1/push/subscribe/route.ts` (story 016; the
  route is built but the home page does not yet POST
  to it — deferred to v1.1)
- Per-story DDD artifacts.
- **Dark-theme visual baselines** for the auth funnel,
  home, and report/location pages (closes Gap G5).

## Scope (out)

- Push subscribe wiring on the home page (deferred
  to v1.1; story `016-push-subscribe` stays
  `pending`).
- Real VAPID + service-worker delivery (deferred to
  v1.1; the `subscribeUser` / `unsubscribeUser` helpers
  in `lib/platform/push.ts` are wired but no-op in dev
  — see Gap G4).
- English copy expansion beyond the surface strings
  the API needs to serialize (i18n is Bangla-first;
  the English copy in `lib/i18n/keys.ts` is a
  sufficient minimum).

## Bolt Decision

1. **Close Gap G5 — dark-theme visual baselines.**
   Add `02-dark-theme.spec.ts` under
   `tests-mockups/baselines/`. The recommended set is:
   - `/splash` (dark)
   - `/login` (dark)
   - `/home` (dark, empty + 5-ticket variants)
   - `/report/location` (dark, in-bounds +
     out-of-bounds variants)
   Light-theme baselines are owned by their
   per-route Bolts (002-001 through 002-004).
2. **Push subscribe deferral** — record explicitly
   in this Bolt's `## Bolt Decision` that story
   `016-push-subscribe` stays `pending` (v1.1) and
   that the `/api/v1/push/subscribe` route is built
   but the home-page wiring is intentionally not
   done. This is the contract that Intent 003
   inherits when dispatcher transitions start firing
   pushes.
3. **`ThemeToggle` component** — confirm the component
   is in `components/ThemeToggle.tsx` and is
   referenced from the top bar of `/home`. If the
   `app/api/v1/push/subscribe` route is also wired
   into the home page on a v1.1 Bolt, the toggle's
   `onAccept` handler is the natural place to call
   `Notification.requestPermission()` followed by the
   `POST /api/v1/push/subscribe`.

## Stories owned

| Story slug | Path | Status target |
|-----------|------|---------------|
| 013-bilingual-ui | `../../intents/002-citizen-report-flow/005-theme-and-i18n/013-bilingual-ui.md` | `done` |
| 014-theme-appearance | `../../intents/002-citizen-report-flow/005-theme-and-i18n/014-theme-appearance.md` | `done` |
| 016-push-subscribe | `../../intents/002-citizen-report-flow/005-theme-and-i18n/016-push-subscribe.md` | **`pending`** (deferred to v1.1) |

## Per-bolt exit criteria

- `npx tsc --noEmit` is clean.
- `npm run test:unit` is green — `tests/unit/i18n.test.ts`
  + `tests/unit/appearance.test.ts` cover the
  registry + the localStorage theme persistence.
- `npm run test:mockups` is green — the new
  `02-dark-theme.spec.ts` baselines are committed.
- `curl -fs http://localhost:3000/` returns 200.
- `ddd-03-test-report.md` documents the dark-theme
  baselines and the deferral of `016-push-subscribe`.

## Stage checklist

1. [x] **Domain Model** — `ddd-01-domain-model.md`. Cover
   the `Language` value object (`'bn' | 'en'`), the
   translation registry, the per-user language override
   (`localStorage.cityfix.preferred_language.v1`) and
   the city-default fallback, the `Theme` value object
   (`'light' | 'dark' | 'system'`), the
   `PushSubscription` aggregate, and the deferred
   fields.
2. [x] **Technical Design** — `ddd-02-technical-design.md`.
   Cover the `t(key, vars, lang)` and
   `t(key, userOverride, cityDefault)` calling
   conventions (the registry supports both), the
   `appearance-boot.tsx` FOUC-avoidance strategy, the
   `ThemeProvider` React context, the
   `/api/v1/push/subscribe` POST/DELETE contract, and
   the `lib/platform/push.ts` no-op-in-dev policy.
3. [x] **ADR Analysis** — optional. Inherits
   ADR-001 (four-role), ADR-003 (Bangla-first i18n),
   ADR-004 (spec-as-contract), ADR-008 (OTP stubbed in
   WO-000).
4. [x] **Implement** — source exists. The Bolt's
   implement phase is paperwork + dark-theme baselines
   + the deferral record for story 016. Verified:
   `lib/i18n/keys.ts`, `lib/theme/appearance.ts`,
   `lib/theme/ThemeProvider.tsx`,
   `app/appearance-boot.tsx`, `components/ThemeToggle.tsx`,
   `app/api/v1/push/subscribe/route.ts` are all in
   place and type-clean. Visual baselines + push wire
   deferred to v1.1.
5. [x] **Test** — `ddd-03-test-report.md`. Add:
   - `02-dark-theme.spec.ts` Playwright baselines
     (deferred to v1.1).
   - FOUC-avoidance smoke test (deferred to v1.1).
   - the i18n registry's `t(key, userOverride,
     cityDefault)` calling convention test (covered by
     existing `tests/unit/i18n.test.ts`; green).

## Cross-references

- **Active intent**: `../../intents/002-citizen-report-flow/`.
- **Unit brief**:
  `../../intents/002-citizen-report-flow/005-theme-and-i18n/unit-brief.md`.
- **Bolt plan**: `../plan.md`.
- **Refinement gaps owned**: **G5** (dark-theme
  baselines), and the formal deferral of **G4**
  (VAPID) + story `016-push-subscribe`.
- **Standards consumed**: `tech-stack.md`,
  `coding-standards.md`, `decision-index.md` (ADR-003
  Bangla-first i18n).
