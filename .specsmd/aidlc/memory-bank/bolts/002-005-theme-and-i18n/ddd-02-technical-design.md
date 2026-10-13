---
standard: ddd-02-technical-design
phase: construction
status: complete
created: 2026-10-11T23:55:00Z
updated: 2026-10-11T23:55:00Z
bolt_id: 002-005-theme-and-i18n
---

# Bolt 002-005 — Technical Design

The bilingual UI + light/dark theme + the
deferred push-subscribe endpoint. Anchors to the
existing source:

- `lib/i18n/keys.ts` (the translation registry)
- `lib/theme/appearance.ts` (light/dark
  persistence — pure data)
- `lib/theme/ThemeProvider.tsx` (React context
  provider)
- `app/appearance-boot.tsx` (FOUC-avoidance
  boot script)
- `components/ThemeToggle.tsx` (the toggle UI)
- `app/api/v1/push/subscribe/route.ts` (the
  deferred wire call)

The Bolt's implement phase is paperwork +
dark-theme visual baselines + the deferral
record for story `016-push-subscribe`, not a
from-scratch build.

## Architecture pattern

```text
┌─────────────────────────────────────────────────┐
│  Root layout                                    │
│   - app/appearance-boot.tsx (inline script,     │
│     runs BEFORE hydration to avoid FOUC)        │
│   - lib/theme/ThemeProvider (React context,     │
│     live-updates when system theme changes)     │
└────────────────────┬────────────────────────────┘
                     │ provides
                     ▼
┌─────────────────────────────────────────────────┐
│  Presentation  (every page)                     │
│   - components/ThemeToggle (light/dark/system)  │
│   - localStorage('preferred_appearance.v1')     │
│   - localStorage('preferred_language.v1')       │
│   - t(key, vars, lang) for all user copy        │
└────────────────────┬────────────────────────────┘
                     │ uses
                     ▼
┌─────────────────────────────────────────────────┐
│  Service  (lib/i18n/keys.ts,                    │
│            lib/theme/appearance.ts)             │
│   - Translation registry (typed keys)           │
│   - readAppearance / writeAppearance            │
│   - resolveAppearance                           │
│   - applyAppearanceToDocument (DOM-touching)    │
└────────────────────┬────────────────────────────┘
                     │ uses
                     ▼
┌─────────────────────────────────────────────────┐
│  Platform  (lib/platform/push.ts — no-op in dev)│
│   - subscribeUser / unsubscribeUser (stubs)     │
│   - sendTicketPush (best-effort; see 002-003b)  │
│   - /api/v1/push/subscribe POST/DELETE (route   │
│     built; not yet wired into the home page)    │
└─────────────────────────────────────────────────┘
```

## Layer structure (per surface)

### `app/appearance-boot.tsx` — FOUC avoidance

```text
1. Inline <script> in root layout, runs
   synchronously before hydration
2. Read window.localStorage.getItem(
   'cityfix.preferred_appearance.v1')
3. Resolve via pref + systemPrefersDark
4. Add the resolved class (theme-light /
   theme-dark) to <html>
5. If 'system', subscribe to matchMedia changes
```

The script is **not** a React component. It is
raw JavaScript that runs before React hydrates.
This is the only way to avoid FOUC: the theme
must be on `<html>` before the first paint.

### `lib/theme/ThemeProvider.tsx` — React context

```text
1. useState<Appearance>('system') (default)
2. useEffect: read from localStorage, subscribe
   to matchMedia changes
3. Provide {appearance, resolved, setAppearance}
   to children
4. On setAppearance: write to localStorage +
   apply class to <html> + re-subscribe
```

The provider is the React-side counterpart to
the boot script. The boot script handles the
first paint; the provider handles every render
after.

### `components/ThemeToggle.tsx` — the toggle UI

```text
1. Read appearance from ThemeProvider context
2. Render 3 buttons: Light, Dark, System
3. The active one is filled with the primary
   colour
4. onClick → setAppearance(value)
```

The toggle is rendered in the top bar of the
home page, the report flow pages, and the
my-reports list page. The detail page does not
have the toggle (it's a back-link to the list).

### `t(key, vars, lang)` — translation lookup

```text
1. Resolve lang:
   a. userOverride (if passed)
   b. city.defaultLanguage (from bootstrap)
   c. DEFAULT_LANGUAGE ('bn')
2. Look up TRANSLATIONS[key][lang]
3. If undefined, fall back to 'en', then to key
4. Substitute {var} placeholders
5. Return the resolved string
```

The function is pure (no DOM, no side effects).
The `lang` parameter is always `'bn' | 'en'`;
the caller resolves the chain (user override →
city default → English) before calling.

### `/api/v1/push/subscribe` POST/DELETE — deferred

The route is **built** in WO-000 but the home
page does **not** POST to it. The route's
contract:

- `POST {endpoint, p256dh, auth}` → 201
  `{subscribedAt}`
- `DELETE {endpoint}` → 204
- Both endpoints are citizen-only and
  rate-limited.

The home page's push-subscribe wiring is a v1.1
Bolt. Story `016-push-subscribe` stays
**`pending`** in this Bolt's close-out. The
`ThemeToggle`'s `onAccept` handler is the
natural place to call
`Notification.requestPermission()` followed by
the `POST /api/v1/push/subscribe` (v1.1).

## Data persistence

No new models. The translation registry is
in-memory (compiled); the appearance preference
is in localStorage; the push subscription will
be a Prisma model when v1.1 wires it (deferred).

## Security

### Translation registry

The registry is bundled at build time. There is
no user input flowing into the registry; the
keys are typed and the values are static. There
is no XSS surface from the i18n lookup.

### Theme persistence

The localStorage write is wrapped in a try/catch
that swallows `QuotaExceededError` and
`SecurityError`. A failed write never breaks the
toggle UI.

### Push subscribe

The route is auth-gated and rate-limited. The
endpoint / p256dh / auth are server-validated
(v1.1 will add zod schemas). v1 ships the route
shape; v1.1 ships the schema + the home-page
wiring.

## NFRs (per-bolt targets)

| NFR | Target | Rationale |
|-----|--------|-----------|
| FOUC | None (zero) | The boot script applies the theme before the first paint. |
| Theme toggle latency | ≤ 16 ms | One localStorage write + one className change. |
| Translation lookup | ≤ 1 ms | In-memory map; pure function. |
| Dark-theme baseline fidelity | 0.005 tolerance | Per team.md Mandated. |
| Push wire (v1.1) | ≤ 200 ms | One POST + one DB write. |

## API contracts

| Endpoint | Method | Auth | Body | Response | Status |
|----------|--------|------|------|----------|--------|
| `/api/v1/push/subscribe` | POST | citizen (deferred) | `{endpoint, p256dh, auth}` | `{subscribedAt}` | Route built, home page not wired — v1.1 |
| `/api/v1/push/subscribe` | DELETE | citizen (deferred) | `{endpoint}` | 204 | Same |

The route is **built but not wired**. v1
documents the contract; v1.1 ships the home-page
integration.

## Frontend contracts

### localStorage

| Key | Read | Write | Default |
|-----|------|-------|---------|
| `cityfix.preferred_appearance.v1` | On mount (boot script + provider) | On toggle | `'system'` |
| `cityfix.preferred_language.v1` | On mount (page-local) | On toggle | (unset; falls back to city default) |

The two keys are independent. A citizen can be
in dark mode + Bangla (the most common config
in the v1 demo) or in light mode + English (the
test harness config for the visual baselines).

### Effects

1. **Boot script** (deps: `[]`, runs once at
   page load): read + apply class.
2. **ThemeProvider mount** (deps: `[]`):
   subscribe to matchMedia changes.
3. **ThemeToggle click** (deps: `[appearance]`):
   setAppearance(newValue) → localStorage write
   + class change.
4. **Lang toggle** (page-local, e.g. on the home
   top bar): setLang(newValue) → localStorage
   write + re-render.

### Render branches

- **ThemeToggle**: 3 buttons (Light / Dark /
  System). The active one is filled.
- **lang-aware pages**: every user-facing string
  routes through `t(key, vars, lang)`. The lang
  state is held in the page's useState and
  synced with localStorage.

## Layer-by-layer checklist (for the Construction Agent)

- [ ] The boot script is present in the root
  layout (verify by reading
  `app/layout.tsx`).
- [ ] The `ThemeProvider` is present in the
  root layout (verify by reading
  `app/layout.tsx`).
- [ ] The `ThemeToggle` is rendered in the home
  top bar and the report flow's top bar.
- [ ] Every user-facing string routes through
  `t(...)` (no hard-coded copy).
- [ ] The dark-theme visual baselines
  (`02-dark-theme.spec.ts`) are committed
  under `tests-mockups/baselines/`.
- [ ] Story `016-push-subscribe` is recorded
  as `pending` in the intent's `units.md`.

## Bolt Decision (technical addenda)

In addition to the Bolt Decision recorded in
`./bolt.md`:

- **Boot script ordering**: the boot script
  must run **before** the React hydration but
  **after** the CSS is loaded. The order is:
  `<html>` → `<head>` (with CSS) → boot script
  → `<body>` (with React). Reordering breaks
  the FOUC guarantee.
- **ThemeProvider state source of truth**:
  the provider's state is the React-side
  source of truth after hydration. The
  localStorage value is the boot-time source
  of truth before hydration. The two are
  kept in sync via the provider's
  `setAppearance` callback.
- **Translation key type safety**: the keys
  are `string` at the type level (a flat
  `Record<string, ...>`). v1.1 may tighten to
  `keyof typeof TRANSLATIONS` for compile-time
  safety, but the current `string` typing
  supports the dynamic-key use case (e.g. the
  status-pill labels like
  `t('status.${status}', ...)`).
- **i18n coverage**: the registry covers
  every string the spec references. New
  strings are added to the registry on the
  same Bolt that introduces the page. The
  EN side is the bare minimum the API needs
  to serialize; v1 does not invest in
  full-coverage English copy.

## Cross-references

- `bolt.md`: `./bolt.md`.
- `ddd-01`: `./ddd-01-domain-model.md`.
- Standards:
  `../../standards/tech-stack.md`,
  `../../standards/coding-standards.md`,
  `../../standards/decision-index.md`
  (ADR-003 Bangla-first i18n).
- Predecessor bolts: 002-001 through 002-004.
- Successor bolts: none (this is the
  cross-cutting close-out of Intent 002).
