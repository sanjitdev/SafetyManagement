---
id: 013-bilingual-ui
unit: 005-theme-and-i18n
intent: 002-citizen-report-flow
status: in-progress
priority: must
created: 2026-10-04T00:00:00Z
updated: 2026-10-11T18:00:00Z
assigned_bolt: null
implemented: true
---

# Story: 013-bilingual-ui

## User Story

**As a** citizen
**I want** every screen to be available in Bangla
(canonical) and English, with a toggle on splash /
welcome
**So that** I can read in the language I'm most
comfortable with.

**As a** platform engineer
**I want** every user-facing string to go through a
typed key registry
**So that** missing translations break the build,
not the UI.

## Acceptance Criteria

- [x] **Given** `lib/i18n/keys.ts`, **When** I import
  `TRANSLATIONS`, **Then** it has type
  `Record<key, { bn: string; en: string }>`.
- [x] **Given** `t(key, vars, lang)`, **When** I call
  it with a known key, **Then** it returns the right
  string with `vars` interpolated.
- [x] **Given** a missing key, **When** TypeScript
  builds, **Then** the build fails (`keyof typeof
  TRANSLATIONS`).
- [x] **Given** the language toggle, **When** I switch
  languages, **Then** the active language persists to
  `localStorage`.
- [x] **Given** a fresh visit, **When** `localStorage`
  is empty, **Then** the language falls back to
  `DEFAULT_LANGUAGE = 'bn'`.
- [x] **Given** every page, **When** I read any
  user-facing string, **Then** it goes through `t(...)`.

## Technical Notes

- See `standards/coding-standards.md` ("i18n"
  section): the typed key registry is the contract.
- Bangla is canonical; English is secondary; both
  locales are fully authored.
- The bilingual toggle on splash + welcome is a
  surface deviation from the default Bangla-only
  reading of `project.md`; the toggle just lets the
  citizen pick (per WO-001 feasibility decision).

## Dependencies

### Requires
- (none — foundational)

### Enables
- Every other WO-001+ story (all copy is i18n)

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Missing `vars` interpolation | `t` returns the raw template |
| `lang` is not 'bn' or 'en' | Fall back to `DEFAULT_LANGUAGE = 'bn'` |
| `localStorage` is unavailable | Fall back to `DEFAULT_LANGUAGE = 'bn'` |
| Key exists in `bn` but not `en` | v1: falls back to `bn`; build does not break |

## Out of Scope

- A third locale (deferred to v1.1).
- RTL support (deferred to v1.1 if a locale needs it).
- Per-component locale override (deferred to v1.1).

## Status

Working code on the happy path. `t(...)` resolves, the
toggle persists, and the typed registry catches
missing keys at build time.