---
unit: 005-theme-and-i18n
intent: 002-citizen-report-flow
phase: inception
status: ready
created: 2026-10-04T00:00:00Z
updated: 2026-10-11T18:00:00Z
---

# Unit Brief: Theme and i18n

## Purpose

Stand up the cross-cutting theme + i18n plumbing that
every page consumes. The unit ships the typed key
registry, the bilingual `t(...)` resolver, the
light/dark theme provider + toggle, and the design
token source of truth (`tokens.css`). The push
subscribe endpoint is deferred to v1.1.

## Scope

### In Scope

- `lib/i18n/keys.ts` (typed key registry).
- `t(key, vars, lang)` resolver.
- `components/theme-toggle.tsx`.
- `lib/theme/` provider (light/dark).
- `tokens.css` (design-token source of truth).
- The bilingual toggle on splash + welcome (per WO-001
  feasibility decision).

### Out of Scope

- FCM / APNs (deferred until native wrappers ship).
- Real `web-push.sendNotification(...)` wire call
  (deferred to v1.1).

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| CITIZEN-REQ-013 | Bilingual UI (Bangla + English) | Must |
| CITIZEN-REQ-014 | Theme + appearance (light/dark) | Must |
| CITIZEN-REQ-016 | Push subscribe endpoint (no wire call yet) | Should |

## Domain Concepts

### Key Entities

| Entity | Description | Attributes |
|--------|-------------|------------|
| Translation | A typed key → string map | `key`, `bn`, `en` |
| Theme | Light or dark | `'light' \| 'dark'`, persisted to `localStorage` |
| Language | 'bn' or 'en' | persisted to `localStorage`; per-user override → city default → `DEFAULT_LANGUAGE = 'bn'` |

### Key Operations

| Operation | Description | Inputs | Outputs |
|-----------|-------------|--------|---------|
| `t(key, vars, lang)` | Resolve a translation key | key, vars, lang | string |
| `setLanguage(lang)` | Persist language choice | `'bn' \| 'en'` | void |
| `setTheme(theme)` | Persist theme choice | `'light' \| 'dark'` | void |
| `POST /api/v1/push/subscribe` | (v1.1) Register a Web Push subscription | `{ endpoint, p256dh, auth }` | 204 |

## Story Summary

| Metric | Count |
|--------|-------|
| Total Stories | 3 |
| Must Have | 2 |
| Should Have | 1 |
| Could Have | 0 |

### Stories

| Story ID | Title | Priority | Status |
|----------|-------|----------|--------|
| 013-bilingual-ui | Bilingual UI (Bangla + English) | Must | in-progress |
| 014-theme-appearance | Theme + appearance (light/dark) | Must | in-progress |
| 016-push-subscribe | Push subscribe endpoint (deferred) | Should | pending |

## Dependencies

### Depends On

| Unit | Reason |
|------|--------|
| Intent 001 (Unit 002) | Session + per-role |

### Depended By

| Unit | Reason |
|------|--------|
| 001-auth-and-profile | Toggle on splash/welcome |
| 002-home-and-activity | Theme + i18n in home |
| 003-submit-report-flow | Theme + i18n in 1.7-1.11 |
| 004-my-reports | Theme + i18n in 1.12-1.13 |

### External Dependencies

None.

## Technical Context

### Suggested Technology

- Typed key registry (`keyof typeof TRANSLATIONS`).
- React context for the theme + language providers.
- `localStorage` for persistence.
- `tokens.css` (CSS variables) for the design tokens.

### Integration Points

| Integration | Type | Protocol |
|-------------|------|----------|
| Every page → `t(key, vars, lang)` | resolver | direct function call |
| Every page → `components/theme-toggle.tsx` | component | direct import |
| `app/splash/page.tsx` + `app/welcome/page.tsx` → language toggle | component | direct import |

### Data Storage

| Data | Type | Volume | Retention |
|------|------|--------|-----------|
| Language choice | `localStorage` | 1 key | until changed |
| Theme choice | `localStorage` | 1 key | until changed |

## Constraints

- All user-facing copy goes through `t(...)`; hardcoded
  strings are forbidden.
- The typed key registry catches missing keys at build
  time.
- `tokens.css` is the design-token source of truth;
  no inline colors / fonts in components.

## Success Criteria

### Functional

- [x] `t(key, vars, lang)` resolves correctly.
- [x] Language toggle persists.
- [x] Theme toggle persists.
- [x] `tokens.css` defines the design tokens.

### Non-Functional

- [x] `npx tsc --noEmit` is clean.
- [x] Type-safe i18n registry.

### Quality

- [x] Unit tests for `t(...)`.

## Bolt Suggestions

A single `ddd-construction-bolt` for this unit would
take the two must stories because they share the
provider pattern.

## Notes

The push-subscribe endpoint is **deferred to v1.1**
because the real `web-push.sendNotification(...)` wire
call is also v1.1. The endpoint shape is documented in
`standards/api-conventions.md` so the v1.1 Bolt is
mechanical.
