---
id: 002-page-renders-two-labelled-photo-groups
unit: 001-citizen-photo-split
intent: 007-citizen-resolution-visibility
status: complete
priority: must
created: 2026-10-13T20:15:00Z
assigned_bolt: 007-001-citizen-photo-and-trail-foundation
implemented: true
---

# Story: `/reports/[id]` renders two labelled photo groups

## User Story

**As a** citizen reading my own report on `/reports/[id]`
**I want** to see the photos grouped as "Before" (mine) and
"After" (the crew's), with bilingual labels
**So that** I can tell at a glance what I reported and what
the field crew did to fix it.

## Acceptance Criteria

- [ ] **Given** a ticket with 2 citizen photos and 1 crew photo, **When** a citizen opens `/reports/[id]`, **Then** the page renders a "Before" group with 2 thumbnails and an "After" group with 1 thumbnail, and the group labels are visible in the active locale (English "Before" / "After" OR Bangla "আগে" / "পরে").
- [ ] **Given** a ticket with only citizen photos (no crew photos), **When** a citizen opens `/reports/[id]`, **Then** no "After" group renders (the section is hidden, not rendered as an empty group).
- [ ] **Given** a ticket with 0 citizen photos and 1 crew photo, **When** a citizen opens `/reports/[id]`, **Then** the "Before" group renders a localized empty-state message ("No photo attached" / "কোনো ছবি সংযুক্ত নেই") and the "After" group renders the 1 crew thumbnail.
- [ ] **Given** the page is loaded in dark mode OR high-contrast mode, **When** the photo groups render, **Then** the labels and group containers honor the existing token system (`--color-ink`, `--color-surface-card`, `--color-border`) — no hard-coded colors.
- [ ] **Given** a Playwright E2E spec `tests/<NN-citizen-photo-groups>.spec.ts`, **When** the spec drives `/reports/[id]` for a seeded ticket with both photo groups, **Then** it asserts the two groups are present, the labels are visible in the active locale, and the thumbnail counts match.
- [ ] **Given** a new visual-regression baseline under `tests-mockups/baselines/01-mockups.spec.ts/`, **When** the page is screenshotted at 390×844 (mobile) and 1280×800 (desktop), **Then** the new baseline matches the screenshot to within the team's `0.005` tolerance.
- [ ] **Given** the typed i18n registry check, **When** the bolt runs, **Then** both English and Bangla strings (`photo.before`, `photo.after`, `photo.emptyBefore`) are present in `lib/i18n/keys.ts`.

## Technical Notes

- The page is `app/reports/[id]/page.tsx`. The current render is a single flat grid of `photoUrls`; this story replaces it with two sections.
- The new labels are added to `lib/i18n/keys.ts`:
  - `photo.before` — English "Before", Bangla "আগে"
  - `photo.after` — English "After", Bangla "পরে"
  - `photo.emptyBefore` — English "No photo attached", Bangla "কোনো ছবি সংযুক্ত নেই"
- The page is server-rendered; the labels are read via the existing `t(...)` helper from `lib/i18n/keys.ts`. No client-side fetch is added.
- The two groups should reuse the existing `ReportCard` / `StatusPill` primitives from Intent 006 if they fit. If a new primitive is needed, it lands under `components/ui/`.
- The visual-regression baseline is gated by team.md; the new PNG MUST be reviewed in the PR (per `team.md` Forbidden: "NEVER merge Bolts with failing visual regression tests").

## Dependencies

### Requires
- `001-prisma-migration-and-serializer-exposes-before-and-after-photo-urls` (the serializer must expose the two arrays)

### Enables
- None.

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Ticket has 1 photo total (citizen only) | One "Before" thumbnail, no "After" section. |
| Ticket has 1 photo total (crew only — citizen attached none) | "Before" group renders empty-state; "After" group renders 1 thumbnail. |
| Locale toggle (English ↔ Bangla) | Group labels swap; thumbnails unchanged. |
| `prefers-reduced-motion: reduce` | Any photo-fade animation collapses to instant. |
| Photo URL is broken (404) | Existing thumbnail fallback behaviour is unchanged (the page already handles missing URLs). |
| Dark mode | Labels and group containers use the same dark-mode tokens as the rest of the page. |

## Out of Scope

- The trail-marker filter — that is story `003-trail-marker-filter-with-i18n-and-regression-guard`.
- The dispatcher crew picker — Unit 003.
- Photo zoom / lightbox — deferred.
- Photo annotations, captions, or alt-text improvements beyond what already exists.
- The "Resolved!" celebration surface — explicit Won't per `requirements.md`.
