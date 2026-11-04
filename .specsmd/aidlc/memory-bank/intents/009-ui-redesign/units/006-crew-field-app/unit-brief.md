---
unit: 006-crew-field-app
intent: 009-ui-redesign
status: not-started
created: 2026-11-02T18:40:00Z
updated: 2026-11-02T18:40:00Z
---

# Unit 006 — Crew Field App (unit-brief)

## Goal

Redesign Rashid's field surfaces. The constraint here is different
from every other wave: the screen is read in **direct sunlight, one
hand, with gloves on**. The high-contrast outdoor theme is a
functional requirement, not a preference — it is preserved exactly.

## Scope

### Mockups (approval gate)

| Mockup | Surface | Pattern |
|--------|---------|---------|
| `22-crew-assignments.html` | `/crew` | Today's assignments list, large targets |
| `23-crew-ticket-detail.html` | `/crew/tickets/[id]` | Hands-busy work view, `.theme-outdoor` |

### Implementation

`/crew`, `/crew/tickets/[id]`.

## Files

- `design-artifacts/D-Design-System/01-Visual-Design/mockups/22-crew-assignments.html` (new)
- `design-artifacts/D-Design-System/01-Visual-Design/mockups/23-crew-ticket-detail.html` (new)
- `design-artifacts/D-Design-System/01-Visual-Design/gallery.html`
- `tests/01-mockups.spec.ts` + 6 new baselines (2 mockups × 3
  viewports: large / medium / phone 390×844 — the crew pages are the
  only ones that keep the phone-width baseline)
- `app/crew/page.tsx`, `app/crew/tickets/[id]/page.tsx`
- `tests/35-ui-redesign-crew.spec.ts`

## Stories

### 013-crew-mockups

**As a** field crew member
**I want** the field mockups to be legible in sunlight
**So that** I can read a ticket without shielding my phone with my
hand.

### 014-crew-page-implementation

**As a** crew member standing at a broken streetlight
**I want** to open the ticket, take the after-photo, mark it resolved
and note what I did — in as few taps as possible
**So that** the work is recorded before I walk away.

**Given** I am on the crew ticket-detail page
**When** I look at the status action
**Then** it is a single large button with a label plus a status icon
**And** the after-photo capture is a single thumb-reachable target.

## Acceptance

- The two mockups are approved, token-pure and wired into the gallery
  + baseline spec; 6 new committed baselines (large + medium + phone).
- Touch targets stay ≥48px.
- The one-thumb capture flow survives.
- The before/after photo cards keep their labels (Intent 008).
- `.theme-outdoor` is preserved — pure black on pure white — and
  re-verified at AA contrast.
- Route spec + baselines committed.

### Exit gate

The Unit 003 exit gate, plus `tests/35-ui-redesign-crew.spec.ts`
green.

## Status

Not started. The Wave 2 mockups (`08`–`12`) must be approved first.

## Notes

`06-field-app-home` and `07-status-in-progress` already cover this
territory and keep their phone-width baselines. `22` supersedes `06`;
`23` supersedes `07`. The existing mockups stay in the gallery only
until the replacements are approved — after that they are retired so
the gallery shows one crew design, not two.

The `.theme-outdoor` block in `tokens.css` is **not** softened by the
redesign. That was an explicit decision: sunlight legibility beats
visual harmony.
