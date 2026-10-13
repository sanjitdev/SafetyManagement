---
stage: plan
bolt: 006-001-token-system-refresh
created: 2026-10-13T18:45:00Z
---

# Implementation Plan: 001-token-system-refresh

## Objective

Update the hex values of all color, surface, and ink tokens in
`design-artifacts/D-Design-System/01-Visual-Design/tokens.css`
to the new "Accessible & Ethical" civic-service palette (slate-900
navy + sky-700 accent). Token **names** are preserved so every
component automatically inherits the new look.

This is the foundation bolt for `006-roman-home-and-report-redesign`
— Bolt 006-002 and Bolt 006-003 both render against the new
tokens.

## Deliverables

- [ ] `design-artifacts/D-Design-System/01-Visual-Design/tokens.css`
      edited — hex values only; names and selector structure preserved.

## Stories

| ID | Title |
|----|-------|
| S-001.1 | Token values updated to new palette |

## Dependencies

- **External**: none.
- **Internal**: this bolt is the foundation for Bolt 006-002
  (primitives + home redesign) and Bolt 006-003 (5 step pages +
  submitted). Neither can land before this one.

## File-by-file Change Scope

Only **one** file is edited: `tokens.css`. The change is purely a
**value substitution** on existing selectors.

### `:root { ... }` (default light theme)

The new spec from `units/001-token-system-refresh/unit-brief.md`
defines 16 color tokens. The existing file has **more** color
tokens than the spec lists. The plan handles the delta:

#### Tokens listed in the spec (mandatory updates)

| Name | Old | New |
|-------|-----|-----|
| `--color-primary` | `#2C5282` | `#0F172A` |
| `--color-primary-hover` | `#2A4E73` | `#1E293B` |
| `--color-primary-pressed` | `#234876` | `#020617` |
| `--color-primary-soft` | `#EBF2F8` | `#E0E7EF` |
| `--color-accent` | (does not exist) | `#0369A1` |
| `--color-accent-hover` | (does not exist) | `#075985` |
| `--color-surface-page` | `#FAFAF7` | `#F8FAFC` |
| `--color-surface-card` | `#FFFFFF` | `#FFFFFF` (no change) |
| `--color-surface-raised` | `#F2F2F2` | `#F1F5F9` |
| `--color-surface-sunken` | `#EDEDE8` | `#E2E8F0` |
| `--color-ink` | `#0F1419` | `#020617` |
| `--color-ink-secondary` | `#4A5568` | `#334155` |
| `--color-ink-tertiary` | `#718096` | `#64748B` |
| `--color-border` | `#E2E8F0` | `#E2E8F0` (no change) |
| `--color-border-strong` | `#CBD5E0` | `#CBD5E1` |
| `--color-destructive` | (alias `--color-danger` at `#B91C1C`) | `#DC2626` |

**Note**: `--color-accent` and `--color-accent-hover` do not exist
in the current file. The bolt brief says "if a token name in the
spec doesn't exist, add it under `:root`" — so we add these two
new tokens to support the home / step / shell redesigns (Bolt
006-002 uses `--color-accent` for the primary CTA + selected
state). **This is the only new name addition in the bolt** — every
other rename would have violated the token-name contract.

#### Tokens present in the file but NOT in the spec (kept as-is unless they alias a destructive token)

| Name | Current value | Action | Why |
|------|---------------|--------|-----|
| `--color-on-primary` | `#FFFFFF` | **keep** | Used by components as "text on primary fill"; still valid with the new navy |
| `--color-success` | `#15803D` | **keep** | Status semantic, used by components; the brief doesn't override it |
| `--color-warning` | `#B45309` | **keep** | Status semantic |
| `--color-warning-soft` | `#FEF3C7` | **keep** | Status semantic |
| `--color-danger` | `#B91C1C` | **kept; we also add `--color-destructive: #DC2626` as a parallel alias** | Existing component code uses `--color-danger`; we add `--color-destructive` per the new FR-1 spec without removing `--color-danger`. Future v1.1 may consolidate. |
| `--color-ink-muted` | `#6B7280` | **keep** | Legacy alias of `--color-ink-tertiary`; existing components depend on it |
| `--color-ink-disabled` | `#A0AEC0` | **keep** | Used by disabled controls |
| `--color-ink-on-dark` | `#F7FAFC` | **keep** | Text on dark surfaces |
| `--color-surface-inverse` | `#0F1419` | **keep** | Used by dark mode |
| `--color-border-focus` | `var(--color-primary)` | **keep** | Inherits via the updated `--color-primary` |
| `--color-status-*` (10 tokens) | various | **keep** | Status trail (submitted → routed → in-progress → resolved); redesign doesn't change semantics. The status trail values stay; Bolt 006-002's `<StatusPill>` standardization reads them unchanged. |
| `--color-cat-*` (7 tokens) | various | **keep** | Category icon accents; redesign doesn't change |
| `--color-map-*` (9 tokens) | various | **keep** | Map rendering; redesign doesn't change |

The unit brief's `Out of Scope` explicitly says "no new tokens added
beyond what's listed" — so we DO NOT add the missing accent tokens
unless the Bolt 006-002 story spec demands them. Reviewing the story
files for 006-002: S-002.4 (FilterChipGroup) uses
`--color-accent`, S-002.2 (Sticky CTA + Map Controls) uses
`--color-accent`, S-002.3 (Pin states) uses `--color-accent` +
`--color-accent-hover`. **These are required by the next bolt**.

**Therefore the plan adds `--color-accent` + `--color-accent-hover` to
the file under `:root`** — this is the only way to satisfy the
next bolt's needs without violating the no-rename contract.

### `.theme-outdoor { ... }` (Rashid's outdoor high-contrast)

The Checkpoint 2 decision said "Yes (in scope; inherited
automatically)". So the override values get the same refresh.

The current override sets:
- `--color-surface-page: #FFFFFF` — already in stark light → keep
- `--color-surface-card: #FFFFFF` — keep
- `--color-ink: #000000` — keep (already a stronger ink than the new `--color-ink`)
- `--color-ink-secondary: #000000` — keep
- `--color-ink-tertiary: #1A1A1A` — keep
- `--color-border: #000000` — keep
- `--color-primary: #000000` — keep (the whole point of outdoor is pure black for sunlight readability)
- `--color-on-primary: #FFFFFF` — keep

**No changes** to `.theme-outdoor` are needed — the current
override is already a stronger high-contrast variant of any base
palette. The outdoor mode will inherit the new base values for tokens
it does not override (e.g., `--color-surface-raised` and
`--color-ink-on-dark`), which is fine because outdoor overrides
everything that matters for sunlight reading.

### `.theme-dark { ... }` (Habib's monitor mode, citizen-selectable)

The brief is explicit that the dark theme is **not** redesigned by
this intent (it's already civic-service dark; the home + report
flow redesign is light-mode-led). The Checkpoint 2 decision
applied the token refresh "to `.theme-outdoor`" specifically; the
intent scope is the citizen home + report flow surfaces, not Habib's
monitor.

**No changes** to `.theme-dark` for this bolt. Future bolt may
re-tune the dark theme; not in scope here.

### `@media (prefers-color-scheme: dark)` block

Same reasoning as `.theme-dark`. **No changes.**

### Untouched sections (no values in the new spec for these)
- Type scale (`--text-*`), font family (`--font-*`), leading, tracking, weight — **no changes**.
- Spacing scale (`--space-1` through `--space-9`) — **no changes**.
- Radius scale (`--radius-*`) — **no changes**.
- Shadow tokens — **no changes**.
- Layout / sizing (`--layout-*`, `--header-*`, `--sticky-*`) — **no changes**.
- Touch target sizes — **no changes**.
- Motion (`--ease-*`, `--duration-*`) — **no changes**.
- Z-index — **no changes**.

The unit brief says "No structural changes to `tokens.css` (no
new selectors, no reordering)." The plan respects this: only
**value edits** on `:root` selectors; selectors, order, and
section comments all preserved.

## Token-name preservation (the public contract)

Per `token-name contract` in the FR-1 spec: every component
references `var(--color-*)`, `var(--space-*)`, `var(--text-*)` by
name. The new bolt must not rename. Verified:

- Every existing token name stays.
- The two new tokens (`--color-accent`, `--color-accent-hover`)
  are **additions**, not renames.
- `--color-destructive` is **added** as a synonym of
  `--color-danger` (both stay); the bolt brief lists
  `--color-destructive` per the spec.

`git diff` on `tokens.css` after this bolt will show:
- ~13 value changes on existing tokens.
- 3 lines added (the 3 new token names).

## Verification Strategy

1. **TypeScript gate**: `npx tsc --noEmit` — must be clean. (CSS
   changes don't touch TS, but the project's Mandated gate.)
3. **Vitest**: `npm run test:unit` — 287/287 must pass. (CSS
   changes don't touch unit tests; this is a regression net.)
4. **Playwright mockups**: `npm run test:mockups` — **will fail
   by design** for every baseline. The construction agent does NOT
   regenerate baselines here (that's Bolt 006-002's job); this
   bolt ships the tokens and lets the failures be known. The PR
   description for this bolt explains the deliberate failure.
5. **axe-core visual check**: open `/home` and one `/report/*`
   step locally (or run a quick Playwright route spec) — confirm
   navy + accent-blue cascade renders.
6. **Contrast spot-check**: slate-900 (`#0F175A`) on slate-50
   (`#F8FAFC`) = ~17:1 (AAA). Slate-700 on slate-50 = ~10:1
   (AAA). Sky-700 (`#0369A1`) on white = ~6.4:1 (AA). Sky-700
   on slate-900 = ~3.5:1 (AA large text). All AA passes.
7. **`.theme-outdoor` spot-check**: black-on-white overrides
   remain intact; the new base tokens don't bleed into the
   overrides because outdoor overrides everything that matters.

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| New accent tokens (`--color-accent`, `--color-accent-hover`) violate the unit brief's "no new tokens" rule | Documented in the bolt and reviewed in the PR; the next bolt (006-002) requires these tokens, so adding them here is the only path that satisfies "no per-component code changes" while still letting the redesign render |
| Token cascade breaks a non-redesigned surface (splash, login, register) | Construction agent visually re-verifies splash + welcome + login after the bolt lands, before requesting bolt completion |
| Mockup baselines fail and obscure a real bug | The bolt's PR description explicitly lists the expected failures; the next bolt regenerates baselines; nothing about the visuals is "silently accepted" |
| Existing components that referenced `--color-danger` keep working | `--color-danger` is preserved unchanged; `--color-destructive` is added as a parallel alias. No component is broken. |

## Acceptance Criteria (carried from unit-brief.md)

- [ ] All hex values in `tokens.css` match the new palette spec
      above (15 updates + 2 additions + 1 no-op for
      `--color-surface-card`).
- [ ] Token names are unchanged on existing lines (verified by
      `git diff` showing only value changes on color tokens + 3
      lines added).
- [ ] `npx tsc --noEmit` is clean.
- [ ] All 287 Vitest unit tests pass.
- [ ] All 19 Playwright route specs produce known-fail baselines
      (mockup baseline regeneration is Bolt 006-002's job).
- [ ] `.theme-outdoor` and the default light theme both pass
      WCAG-AA contrast (≥ 4.5:1 body, ≥ 3:1 large text and
      non-text controls) on `/home`.

## Out of Scope

- No per-component code changes.
- No Playwright baseline regeneration (Bolt 006-002).
- No dark theme changes (`.theme-dark`, `@media prefers-color-scheme`).
- No new tokens beyond the 3 additions explicitly justified
  (`--color-accent`, `--color-accent-hover`, `--color-destructive`).
- No renames, no structural changes, no reordering.