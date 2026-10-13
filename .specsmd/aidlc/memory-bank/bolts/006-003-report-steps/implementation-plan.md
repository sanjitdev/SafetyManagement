# Bolt 006-003 — Implementation Plan

## Goal

Apply the new visual + interaction language to each `/report/*`
step and to the post-submit confirmation. The `<ReportShell>`
primitive (Bolt 006-002) is already wired into the report layout;
this bolt redesigns the *body* of each step page so the design
language is consistent end-to-end.

## Scope (file by file)

### 1. `app/report/location/page.tsx` (S-004.1)
- Side card structure refined: H1 → short instruction → reverse
  geocode line → ward line → coordinates (mono) → primary
  "Continue" button (full-width on mobile).
- Mobile layout: map shrinks to top 60% (or 320px floor), card
  fills the bottom.
- Geofence-reject card uses `--color-destructive` left border +
  destructive X icon + one-sentence explanation + "Adjust the
  pin" button.
- Existing geofence logic preserved (R-1).

### 2. `app/report/photo/page.tsx` (S-004.2)
- Add a large 96dp-tall "Add photo" action area above the
  thumbnail grid (camera icon + label, full-width on mobile).
- Thumbnail grid becomes a horizontally-scrolling strip with
  remove "X" overlay on each.
- Live counter: "1 of 3 added" / "1 of 2 added" depending on
  narrow-category cap.
- When cap is reached, the primary action becomes disabled with
  a tooltip "Maximum N photos for this category".
- The hidden file input now also accepts `capture` attribute for
  mobile getUserMedia.
- Continue button disabled until ≥ 1 photo added; existing
  `aria-disabled` semantics preserved.

### 3. `app/report/category/page.tsx` (S-004.3)
- Add a search/filter input at the top (200ms debounced,
  case-insensitive, matches Bangla or English).
- Replace the flat `<ul>` with a 2-column grid
  (`grid-template-columns: repeat(auto-fill, minmax(240px, 1fr))`)
  on desktop; 1 column on mobile.
- Each card: icon (lucide-react), Bangla name (large), English
  name (small, secondary), chevron.
- Selected state: `--color-accent` 2px border +
  `--color-primary-soft` background + checkmark top-right.
- Cards keyboard-navigable (Tab + Enter, arrow keys within the
  grid) with a 3-4px focus ring.

### 4. `app/report/note/page.tsx` (S-004.4)
- Reduce NOTE_MAX from 500 to 280 to match the story spec.
- Add a visible `<label>` above the textarea.
- Helper text below: "ঐচ্ছিক — ২৮০ অক্ষর পর্যন্ত".
- Live counter at the bottom-right with `aria-live="polite"`.
- Red border + error message if the user attempts to exceed
  280 chars.
- "Continue" always enabled (note is optional).
- Move the "Submit" button to a primary CTA inside the side card
  so the citizen can submit the report at the end of step 4
  (existing flow posts to `/api/tickets` from this step — that
  path is preserved).

### 5. `app/report/summary/page.tsx` (S-004.5)
- 2-column layout: left (mini-map + first photo placeholder) +
  right (summary card with Edit buttons).
- Each summary row: label + value + small "Edit" text button
  (Link to the corresponding step).
- Below: "Confirm" checkbox + "Submit report" primary button.
- On submit: spinner + "জমা হচ্ছে…" loading state with
  `aria-busy="true"`.
- Inline error card on failure with "Try again" button.

### 6. `app/report/[id]/submitted/page.tsx` (S-004.6)
- Replace the inline SVG check with `CheckCircle2` from
  lucide-react at 96dp.
- H1 uses the display type scale.
- Reference ID in mono font with a "Copy" button; on click, the
  ID is copied to clipboard and a "Copied" toast appears for
  1.5s with `aria-live="polite"`.
- "What happens next" 3-step list in Bangla.
- The success checkmark animation is gated on a
  `sessionStorage` flag set only on the first visit, so reloads
  don't re-animate.
- "View report" routes to `/reports/<id>` (preserve existing);
  "Back to home" routes to `/home`.
- "Decline-noted" toast for the dedup-decline path is
  preserved.

### 7. `app/report/layout.tsx`
- No structural change — already wraps with the top bar and step
  indicator (the new `ReportShell` is rendered directly inside
  the layout; the layout is the shell).

### 8. `lib/i18n/keys.ts`
Add the new keys needed for the new copy:
- `report.photo.add_primary` / `report.photo.counter` /
  `report.photo.cap_tooltip` / `report.photo.help` /
  `report.photo.empty_state`
- `report.category.search_placeholder` / `report.category.no_match`
- `report.note.label` / `report.note.helper` /
  `report.note.counter` / `report.note.too_long`
- `report.summary.title` / `report.summary.location_row` /
  `report.summary.category_row` / `report.summary.photos_row` /
  `report.summary.note_row` / `report.summary.edit` /
  `report.summary.confirm_label` / `report.summary.submit_cta` /
  `report.summary.error_retry` / `report.summary.mini_map_aria`
- `confirmation.copy_id` / `confirmation.copied` /
  `confirmation.next_step1` / `confirmation.next_step2` /
  `confirmation.next_step3` / `confirmation.next_title`

## Constraints

- 5-step shape preserved (location → photo → category → note →
  summary → submitted).
- Form state preserved via existing `lib/report-draft.ts`
  sessionStorage flow.
- No new dependencies.
- All Bangla copy through `lib/i18n/keys.ts`.
- Existing unit tests must remain green; we add a small set of
  pure-logic unit tests for the new helpers
  (`filterCategories`, `copyToClipboard` thin wrapper, note
  validator).
- Existing Playwright mockup baselines must remain passing; we
  regenerate the affected baselines (`01-welcome`,
  `02-home-city-activity`, `03-report-submitted`) and add
  baselines for the redesigned step pages if a route spec
  doesn't already cover them.

## Verification

- `npx tsc --noEmit && npm run test:unit && npm run test:mockups`
- `npx next build` for the production smoke test.
- Manual: end-to-end report submission at 375 / 768 / 1024 / 1440.
- Dev server already running for browser verification by the
  user.
