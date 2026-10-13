---
standard: ddd-01-domain-model
phase: construction
status: complete
created: 2026-10-11T23:55:00Z
updated: 2026-10-11T23:55:00Z
bolt_id: 002-005-theme-and-i18n
---

# Bolt 002-005 — Domain Model

The bilingual UI + the light/dark theme + the
deferred push-subscribe endpoint. This Bolt is
the **cross-cutting close-out** of Intent 002:
the two features (i18n + theme) are already
wired into every page; the close-out is
paperwork + dark-theme visual baselines + the
formal deferral record for `016-push-subscribe`.

## Value Objects

### `Language`

```typescript
type Language = 'bn' | 'en';
```

The two supported locales. The default is `bn`
per project.md (Bangla-first). The user override
is stored in
`localStorage.cityfix.preferred_language.v1` and
falls back to the city's `defaultLanguage` and
finally to English.

### `Theme` (a.k.a. `Appearance`)

```typescript
type Appearance = 'light' | 'dark' | 'system';
type ResolvedAppearance = 'light' | 'dark';
```

The three-state citizen-selectable appearance.
`'system'` follows `prefers-color-scheme` (the
default); `'light'` and `'dark'` are force-mode
user overrides. The resolved value is always
`'light'` or `'dark'`. The preference is stored
in `localStorage.cityfix.preferred_appearance.v1`.

### `TranslationKey`

The typed key registry `TRANSLATIONS` in
`lib/i18n/keys.ts` — a map from key →
`{bn: string, en: string}`. Every user-facing
string routes through `t(key, vars, lang)` per
team.md's Mandated rule (no hard-coded copy).

### `PushSubscription` (deferred to v1.1)

A stub-only value object for v1. The
`/api/v1/push/subscribe` POST/DELETE route is
built but the home page does not yet POST to it
(deferred to v1.1 — see
`aidlc/spaces/default/memory/project.md →
Corrections` for the Bolt 002-005 deferral
record).

```typescript
interface PushSubscription {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  subscribedAt: string;
  // v1.1: real VAPID + service-worker delivery
}
```

## Domain services

### `t(key, vars, lang)`

The translation lookup. Resolves a key to the
Bangla string (canonical) or the English string
(fallback). Supports `{var}` interpolation. Used
by every page.

### `t(key, userOverride?, cityDefault?)`

The variant that lets the caller pass the
user-override and city-default chain explicitly.
Used by the home page and the report flow when
the lang state is held outside the call site.

### `readAppearance()` / `writeAppearance(value)`

The localStorage-backed theme persistence.
Returns `null` when localStorage is unavailable
(SSR / privacy mode). No-op write swallows
`QuotaExceededError` and `SecurityError` so a
failed write never breaks the toggle UI.

### `resolveAppearance(pref, systemPrefersDark)`

Maps `'system'` → `'light'` or `'dark'` based on
the system hint; explicit `'light'` / `'dark'`
pass through unchanged. Pure function (no DOM).

### `applyAppearanceToDocument(pref, systemPrefersDark)` (client-side)

DOM-touching variant that adds the
`theme-light` / `theme-dark` / `theme-system`
class to `<html>`. Called by
`app/appearance-boot.tsx` synchronously before
hydration to avoid FOUC.

### `subscribeSystemChanges(onChange)` (client-side)

Subscribes to
`window.matchMedia('(prefers-color-scheme: dark)')`
changes. The `ThemeProvider` React context uses
this to live-update the appearance when
`pref === 'system'` and the OS theme changes.

## Ubiquitous language

| Term | Meaning |
|------|---------|
| **Theme / Appearance** | The three-state citizen-selectable appearance (`'light'` / `'dark'` / `'system'`). Stored in localStorage; resolved to `'light'` / `'dark'` at render time. |
| **Lang / Language** | The two-state locale (`'bn'` / `'en'`). Stored in localStorage; falls back to the city's `defaultLanguage` then to English. |
| **Translation key** | A typed identifier (e.g. `'splash.tagline'`) that resolves to a Bangla or English string via `t(...)`. |
| **FOUC** | Flash Of Unstyled Content — the wrong-theme flash that happens when the theme is applied after the first paint. The boot script prevents this. |
| **VAPID** | Voluntary Application Server Identification — the Web Push protocol's auth scheme. v1 has no real VAPID; v1.1 wires the wire call. |

## FOUC avoidance — the contract

The boot script (`app/appearance-boot.tsx`) is an
inline `<script>` injected **before** the React
hydration. It reads the localStorage preference
and applies the resolved class to `<html>`
synchronously. This is the contract that
guarantees no FOUC: the first paint already has
the right theme.

**The boot script is not optional.** Removing it
re-introduces the FOUC regression. Every page
that links `ThemeProvider` must also link the
boot script in the root layout.

## Push-subscribe — the explicit deferral

The `/api/v1/push/subscribe` route is **built**
in WO-000 but is **not wired into the home
page** in v1. The dispatcher's status transitions
(Intents 003+) will eventually fire pushes that
deliver to the citizen's browser; the wire-call
is a v1.1 surface (Gap G4: real VAPID +
service-worker delivery).

Story `016-push-subscribe` stays **`pending`**
in this Bolt's close-out. The deferral is
recorded in:
- This Bolt's `## Bolt Decision`
- `aidlc/spaces/default/memory/project.md →
  Corrections`
- The intent directory's `units.md`
- The intent's `013-bilingual-ui.md` and
  `014-theme-appearance.md` story files (which
  remain `done`)

The v1.1 Bolt that picks up the push wire is
called out in `plan.md` (deferred; not part of
this Bolt's closure).

## Cross-references

- `bolt.md`: `./bolt.md`.
- Standards:
  `../../standards/tech-stack.md`,
  `../../standards/coding-standards.md`,
  `../../standards/decision-index.md`
  (ADR-003 Bangla-first i18n).
- Predecessor bolts: 002-001 through 002-004.
- Successor bolts: none (this is the
  cross-cutting close-out of Intent 002).
