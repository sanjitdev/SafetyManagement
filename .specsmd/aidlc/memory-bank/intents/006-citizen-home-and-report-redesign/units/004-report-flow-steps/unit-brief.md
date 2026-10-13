---
intent: 006-citizen-home-and-report-redesign
unit: 004-report-flow-steps
phase: construction
status: complete
priority: must
created: 2026-10-13T18:30:00Z
updated: 2026-10-13T19:35:00Z
completed: 2026-10-13T19:35:00Z
depends_on: [001-token-system-refresh, 003-report-flow-shell]
---

# Unit 004 — Report Flow Steps (5 steps + submitted)

## Scope

Update each of the 5 step pages (`/report/location`, `/photo`,
`/category`, `/note`, `/summary`) and the post-submit confirmation
(`/report/[id]/submitted`) to the new visual + interaction spec.
Each page composes `<ReportShell>` from Unit 003.

## FRs Covered

- FR-4 (Location step)
- FR-5 (Photo step)
- FR-6 (Category step)
- FR-7 (Note step)
- FR-8 (Summary step)
- FR-9 (Submitted confirmation)

## Stories

| ID | Title | Priority |
|----|-------|----------|
| S-004.1 | Location step redesign (FR-4) | Must |
| S-004.2 | Photo step redesign (FR-5) | Must |
| S-004.3 | Category step redesign (FR-6) | Must |
| S-004.4 | Note step redesign (FR-7) | Must |
| S-004.5 | Summary step redesign (FR-8) | Must |
| S-004.6 | Submitted confirmation redesign (FR-9) | Must |

## Implementation Notes

### Files Touched

- `app/report/location/page.tsx` — restructure the side card
  (FR-4 layout).
- `app/report/photo/page.tsx` — primary photo area + thumbnail
  strip + counter.
- `app/report/category/page.tsx` — 2-column grid of category cards
  + search filter.
- `app/report/note/page.tsx` — labeled textarea + char counter.
- `app/report/summary/page.tsx` — 2-column confirmation + Edit
  buttons + Submit (gated on Confirm checkbox).
- `app/report/[id]/submitted/page.tsx` — success surface with
  reference ID + "What happens next" list.

### Constraint

- Form state preservation across step changes is existing behavior;
  the redesign does not change it.
- The 5-step shape is preserved (default per Checkpoint 2).
- Bangla-first: every new English string has a Bangla equivalent
  in `lib/i18n/keys.ts`.

### Open Questions (from `requirements.md`)

- **Q4 (default)**: photo step CTA copy is "Add photo" (works on
  desktop too; camera prompt fires only on mobile with
  `getUserMedia` support).
- **Q5 (default)**: submitted-page "What happens next" list is
  Bangla only; the English toggle reveals the same list in English
  when active.

## Acceptance Criteria (per story)

### S-004.1 — Location
- [ ] Side card never exceeds 480px wide on desktop.
- [ ] On mobile, the card is at the bottom 40% of the screen.
- [ ] Geofence-reject card has `--color-destructive` left border +
      X icon + one-sentence explanation.
- [ ] "Adjust the pin" calls `map.flyTo({ center, zoom: 16 })` and
      removes focus from the button.

### S-004.2 — Photo
- [ ] Primary action area is 96dp tall, full-width on mobile.
- [ ] Thumbnail strip is keyboard-navigable.
- [ ] "Continue" disabled until ≥ 1 photo added.
- [ ] On mobile with `getUserMedia` support, tapping opens camera;
      otherwise file picker.
- [ ] Narrow-category cap is reflected in the counter.

### S-004.3 — Category
- [ ] 2-column grid (1 col on mobile).
- [ ] Each card: icon, Bangla name (large), English name (small),
      chevron.
- [ ] Selected state: `--color-accent` 2px border +
      `--color-primary-soft` background + checkmark top-right.
- [ ] Search/filter input debounced 200ms, case-insensitive,
      matches Bangla or English.

### S-004.4 — Note
- [ ] Visible label above textarea; helper text below.
- [ ] Live char counter at bottom-right, `aria-live="polite"`.
- [ ] 280-char hard limit with visible error if exceeded.
- [ ] Textarea auto-grows to 5 lines, then scrolls internally.
- [ ] "Continue" always enabled (note is optional).

### S-004.5 — Summary
- [ ] 2-column layout (1 col on mobile): mini-map + photo
      thumbnail left, summary card right.
- [ ] Each summary row has a small "Edit" text button.
- [ ] "Submit" gated on "Confirm" checkbox.
- [ ] On submit: spinner + "জমা হচ্ছে…" for the duration of the
      network request, then route to `/report/[id]/submitted` or
      show inline error.

### S-004.6 — Submitted
- [ ] Large green checkmark (`CheckCircle2`, 96dp) centered.
- [ ] H1: "আপনার রিপোর্ট গ্রহণ করা হয়েছে".
- [ ] Reference ID in mono font, copyable; "Copy" button flashes
      "Copied" toast for 1.5s.
- [ ] Three-step "What happens next" list in Bangla.
- [ ] Two actions: "View report" (primary) and "Back to home"
      (secondary).
- [ ] Subsequent visits to the same `/report/[id]/submitted` URL
      do not re-show the success animation.

## Cross-Cutting Acceptance

- [ ] All 287 unit tests + 19 Playwright route specs pass.
- [ ] `npx tsc --noEmit` is clean.
- [ ] axe-core shows zero serious or critical issues on every
      redesigned page.
- [ ] All Bangla copy comes from `lib/i18n/keys.ts`.
- [ ] Playwright mockup baselines for each redesigned page are
      reviewed in the PR (per `team.md` Forbidden).
- [ ] `prefers-reduced-motion: reduce` collapses every transition
      to instant (or ≤ 50ms).
- [ ] Step transition is client-side; no full-page reload.
- [ ] Form state preserved across step changes.

## Verification

- `npx tsc --noEmit && npm run test:unit && npm run test:mockups`
- Manual: complete a full report end-to-end locally; confirm
  every step's primary action is reachable in 1 tap; resize the
  window to 375 / 768 / 1024 / 1440 and confirm layouts hold.

## Out of Scope

- No collapse of the 5-step shape (per Checkpoint 2 default).
- No changes to the data layer.
- No new icons beyond lucide-react; if a missing icon is needed,
  the construction agent picks the closest match and documents
  the choice in the bolt.md.
