---
id: 008-002-visible-chrome
unit: 002-visible-chrome
intent: 008-ux-polish-from-demo
type: simple-construction-bolt
status: complete
stories:
  - 001-dedupe-header-chrome-on-ticket-detail-pages
  - 002-render-display-names-on-ticket-surfaces
  - 003-chrome-polish-status-pill-assignedcrew-icon-buttonlabel
created: 2026-10-14T18:20:00Z
started: 2026-10-14T18:20:00Z
completed: 2026-10-27T00:00:00Z
updated: 2026-10-27T00:00:00Z
current_stage: null
stages_completed:
  - name: plan
    completed: 2026-10-14T18:20:00Z
    artifact: implementation-plan.md
  - name: implement
    completed: 2026-10-14T19:15:00Z
    artifact: implementation-walkthrough.md
  - name: test
    completed: 2026-10-14T19:30:00Z
    artifact: test-walkthrough.md
requires_bolts: []
enables_bolts: []
requires_units: []
blocks: false
complexity:
  avg_complexity: 2
  avg_uncertainty: 2
  max_dependencies: 1
  testing_scope: 3
  estimated_files: 8
---

# Bolt 008-002 — Visible Chrome

## Purpose

Land the visible-chrome half of Intent 008 in one bolt:

1. **FR-3** — Render exactly one `HeaderBar` on the crew
   and dispatcher ticket-detail pages (kill the duplicate
   back link + duplicate language / theme toggle row).
2. **FR-4** — Replace raw internal ids on those same
   pages with display names: H1 = category name (+ small
   id badge); metadata = display name; reporter + actor =
   display name. The citizen detail page's `tkt_*` pill
   stays.
3. **FR-6 (chrome half)** — Always-labelled status pill;
   localized "Not assigned" placeholder for empty
   `assignedCrewId`; category-specific icon; clearer
   "Change ward / department" button label; "Before" /
   "After" photo-card labels with localized alt.

The new i18n keys are registered in Bolt 008-001; this
bolt only *uses* them on the surfaces.

## Stories

### From Unit 002 (visible chrome)
| Story ID | Title | FR |
|----|-------|----|
| 001-dedupe-header-chrome-on-ticket-detail-pages | One HeaderBar on crew + dispatcher detail pages | FR-3 |
| 002-render-display-names-on-ticket-surfaces | Display names on ticket surfaces (H1, metadata, trail actor) | FR-4 |
| 003-chrome-polish-status-pill-assignedcrew-icon-buttonlabel | Status pill always labelled; empty assignedCrew; category icon; button label; photo card label | FR-6 (chrome half) |

## Files Modified

- `app/crew/tickets/[id]/page.tsx` — drop the local
  sub-header row; remap `ward_14 · cat_streetlight` H1 to
  the category display name + small id badge; remap
  metadata fields; render the category icon; relabel
  photo cards.
- `app/dispatcher/tickets/[id]/page.tsx` — same shape.
- `lib/identity/display-name.ts` — new helper:
  `displayNameFor(role, userId): string` that returns
  the display name for `citizen` / `dispatcher` / `crew`
  roles, and the role label for `admin` (admin names
  hidden by policy).
- `lib/identity/index.ts` — re-export the helper (if
  the existing `lib/identity/` exists, follow the
  existing module shape).
- `components/StatusPill.tsx` — add the missing
  `submitted` state label.
- `tests/unit/identity/display-name.test.ts` — new unit
  test (Vitest) for the helper.
- `tests-mockups/baselines/01-mockups.spec.ts/` — new
  baselines for the chrome change.

## Implementation Notes

### FR-3 (chrome dedup)

The current
`app/crew/tickets/[id]/page.tsx` renders a local
sub-header row *and* the global `HeaderBar`. The fix is
to remove the local row and let `HeaderBar` be the only
chrome.

```tsx
// BEFORE
<HeaderBar ... />
<header className="ticket-subheader">
  <Link href="/crew/tickets">← আভ্যন্তরীণ কাজে ফিরে যান</Link>
  <LanguageToggle />
  <ThemeToggle />
</header>
<H1>{ticket.title}</H1>

// AFTER
<HeaderBar backHref="/crew/tickets" backLabel="crew.detail.back_to_list" ... />
<H1>{ticket.categoryName}<span className="text-muted">#{ticket.id}</span></H1>
```

The same pattern applies to the dispatcher detail page.

### FR-4 (display names)

The page maps the ticket's `categoryId` / `wardId` /
`cityId` / `assignedCrewId` / `reporterId` to a display
name via a small helper. For citizen / dispatcher /
crew roles, the helper returns the user's display name;
for `admin`, the helper returns the role label
(`admin`).

```ts
// lib/identity/display-name.ts
import { getUserDirectory } from '@/lib/db-switch';

export function displayNameFor(role, userId): string {
  if (role === 'admin') return 'admin';
  const user = getUserDirectory().find((u) => u.id === userId);
  if (!user) return userId; // fallback to id (still better than nothing)
  return user.displayName ?? `${user.firstName} ${user.lastName}`.trim();
}
```

The exact source of the display name is decided in the
bolt's technical-design stage. The `User` model already
has a `displayName` field (verified at bolt start).

### FR-6 (chrome polish)

- **Status pill** — add the `submitted` case in
  `components/StatusPill.tsx`:
  ```tsx
  case 'submitted': return { label: t('ticket.status.submitted', null, lang), tone: 'neutral' };
  ```
- **Empty `assignedCrewId`** — replace `—` with
  `t('dispatcher.assignCrew.none', null, lang)`.
- **Category icon** — use the same icon set as the
  citizen category picker (likely `lib/icons/category.ts`
  or similar). The icon is rendered next to the H1.
- **Button label** — the `ওয়ার্ড / বিভাগ পরিবর্তন` key
  is updated to `ওয়ার্ড ও বিভাগ পরিবর্তন` in
  Bolt 008-001; this bolt updates the page if the
  change is page-side (it's a key-side change in
  Bolt 008-001).
- **Photo card label** — render `photo.before` /
  `photo.after` above each photo; alt text uses the
  same label, not a numeric index.

### Test strategy

- **Unit test** (`tests/unit/identity/display-name.test.ts`):
  - `displayNameFor('admin', 'u_admin')` returns `'admin'`.
  - `displayNameFor('citizen', 'u_rahim')` returns
    `'Rahim'`.
  - `displayNameFor('dispatcher', 'u_habib')` returns
    `'Habib'`.
  - `displayNameFor('crew', 'u_rashid')` returns
    `'Rashid'`.
  - Unknown id returns the id (graceful fallback).
- **Visual baseline** — capture new baselines for the
  crew detail and dispatcher detail pages at 1280×800
  (light theme, Bangla locale). The existing baselines
  are updated (per `team.md` Forbidden).
- **Manual sign-off** — re-run the slow-motion demo;
  the captured frames show the new chrome.

## Verification

- `npx tsc --noEmit && npm run test:unit && npm run test:mockups && curl -fs http://localhost:3000/`
- The new unit test is green.
- The 2 new visual baselines are accepted in the PR.
- The slow-motion demo re-run shows the new chrome
  (one back link, display names, status pill, photo
  card labels).

## Out of Scope

- i18n key registration — Bolt 008-001.
- The crew after-photo file upload — Bolt 008-003.
- The admin ticket-detail page (admin has a different
  header; out of scope for this intent).
- The dispatcher / crew queue pages.
- The map page.

## Risk Posture

| Risk | Mitigation |
|------|-----------|
| `displayNameFor` returns the id (fallback) for a user the directory doesn't have | The unit test covers the fallback; the helper is the single source of truth. |
| The new chrome breaks an existing visual baseline | The new baselines replace the old ones; the diff is the load-bearing review. |
| The category icon helper doesn't exist on the ticket surfaces | The bolt creates a small `lib/icons/category.ts` if it doesn't exist; verified at bolt start. |
| The status-pill component has different call sites with different prop shapes | The bolt's technical-design stage verifies all call sites; a shared `StatusPill` is the cleanest path. |
| The actor-name helper exposes a citizen's name on a dispatcher / crew surface — privacy concern | Out of scope for this intent: the citizen's name is already visible on the dispatcher / crew ticket detail (it's the reporter); the bolt is a UX rename, not a privacy change. |
