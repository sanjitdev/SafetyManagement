# Work Order — WO-003 Field Crew App

**Created:** 2026-10-04
**Author:** Freya (from approved Phase 2/3/4 artifacts)
**Status:** Ready for PRD
**Priority:** Critical
**Depends on:** WO-000 Platform Foundation

---

## Objective

Build the **field-crew-facing** work surface — what Rashid the Resolver sees and does from accepting an assignment to marking it resolved with before/after photos. 5 pages, **web-first (1440 × 900 large + 1024 × 768 medium design canvases) with a phone-width fallback (390 × 844) for in-the-field use**. Works on 3G, tolerates offline queueing. Bangla-first. Web re-skin (Phase B, 2026-10-04): the dedicated mobile-first layout was retained as a *phone fallback* within a web-first layout — Rashid may open it on a crew tablet at the warehouse or a phone on-site, and the layout must reflow cleanly between 1440 px and 360 px.

Without this surface, Habib has no way to close tickets and citizens never see "resolved". **Feature #4 is explicitly a gating feature — the entire field-crew side collapses without it.**

---

## Why This Matters

From the Feature Impact Analysis:

- **#4 Mobile-first, low-bandwidth field-crew app** (FIA 14) — directly addresses Rashid's +5 (Tools that survive the field, FIA 15) and +1 (Get the next job with all the right info, FIA 15). **Gating.**
- **#8 Photo + map pin upfront on every ticket** (FIA 12) — directly addresses Rashid's +1 (FIA 15) and N2 (Stop being sent to the wrong place, FIA 14). Direct gating feature.
- **#12 Photo before/after pair on resolved tickets** (FIA 18) — addresses Rahim's P3 (FIA 14), Habib's P5 (FIA 12), Rashid's +3 (FIA 12). Proof of fix.

**Headline from Persona 04:** Rashid's operational forces score at FIA 15 — the field-crew workflow is the **most-leverage point** on the platform, even though it is the third-priority persona. The success of every other feature depends on Rashid being able to use this app reliably on a cracked phone in direct sunlight with 3G.

---

## Scope

### In scope (5 pages — `03-rashid-the-resolver/`)

| Page | Route | Purpose |
|---|---|---|
| 3.1 Field App Home | `/field` | Web-first (top bar + 720px content column); today's jobs list; greeting strip with one-shot "Refresh location" (UX Review revision #9 caveat); reflows cleanly to 390 px phone widths |
| 3.2 Assignment Detail | `/field/jobs/:id` | Same web-first pattern as 3.1; full job: citizen photo, map, category, description, in-flow "Start" CTA |
| 3.3 Status: In Progress | `/field/jobs/:id/in-progress` | **Full-bleed** (no chrome, no centered column) in `.theme-outdoor` high-contrast palette; hands-busy exception; top strip + hero + step log + progress note + big "Fixed — take photo" CTA |
| 3.4 Resolve — Before/After Capture | `/field/jobs/:id/resolve` | Multi-photo capture (1–3 photos per UX Review revision #6) |
| 3.5 Confirmation — Mark Resolved | `/field/jobs/:id/done` | Submission confirmation; return to job list |

### Out of scope

- Crew authentication and provisioning → WO-000 (auth), WO-004 (provisioning)
- Ticket schema, audit log, offline queue contract → WO-000
- Citizen UI, dispatcher UI, admin UI → WO-001, WO-002, WO-004
- Native app wrapper → deferred (PWA install per design log; native deferred)

---

## Specs & Scenarios Affected

**Scenario:** `03-rashid-the-resolver-fixes-his-first-job-of-the-day.md`

**All 5 page specs:**
- `design-artifacts/C-UX-Scenarios/03-rashid-the-resolver/3.1-field-app-home/3.1-field-app-home.md`
- `design-artifacts/C-UX-Scenarios/03-rashid-the-resolver/3.2-assignment-detail/3.2-assignment-detail.md`
- `design-artifacts/C-UX-Scenarios/03-rashid-the-resolver/3.3-status-in-progress/3.3-status-in-progress.md`
- `design-artifacts/C-UX-Scenarios/03-rashid-the-resolver/3.4-resolve-before-after-capture/3.4-resolve-before-after-capture.md`
- `design-artifacts/C-UX-Scenarios/03-rashid-the-resolver/3.5-confirmation-mark-resolved/3.5-confirmation-mark-resolved.md`

**Visual mockups (added Phase B, 2026-10-04):**
- `design-artifacts/D-Design-System/01-Visual-Design/mockups/06-field-app-home.html` → pages 3.1, 3.2
- `design-artifacts/D-Design-System/01-Visual-Design/mockups/07-status-in-progress.html` → page 3.3 (uses `.theme-outdoor`)
- Pages 3.4 and 3.5 continue to share component patterns from the design system library (no new hero mockups added in Phase B).

**Strategy inputs:**
- `design-artifacts/A-Product-Brief/01-product-brief.md` — field crew section
- `design-artifacts/B-Trigger-Map/04-persona-rashid-the-resolver.md` — full persona + FIA forces
- `design-artifacts/B-Trigger-Map/06-feature-impact.md` — Features #4, #8, #12

---

## Dependencies

- **WO-000 Platform Foundation** — must complete first. This WO consumes: crew auth, `GET /tickets?assigned=me`, `POST /tickets/:id/start`, `POST /tickets/:id/upload-photo`, `POST /tickets/:id/resolve`, offline queue contract, i18n, photo storage.

---

## Acceptance Criteria

### Field App Home (3.1)

- [ ] **Web-first layout** (Phase B): top bar + 720px content column; reflows cleanly to 390 px phone widths
- [ ] Today's jobs list filtered to `assigned_crew = current_user`
- [ ] Greeting strip with crew name + ward + current date
- [ ] **One-shot "Refresh location" button** on the greeting strip (UX Review revision #9 caveat added) — refreshes GPS on tap, then idle. Battery + privacy.
- [ ] Each job card: thumbnail, category, address (reverse-geocoded), age, distance from current location
- [ ] Polling refreshes every 10–30s; offline state shows banner
- [ ] Tap a job → 3.2
- [ ] Visual must match `mockups/06-field-app-home.html` to within `tolerance: 0.005` at large + medium + 390 × 844 phone

### Assignment Detail (3.2)

- [ ] **Same web-first pattern as 3.1** (top bar + 720px content column; reflows to 390 px phone)
- [ ] Full job view: citizen photo(s), map pin, category, address, reporter note (if any), age
- [ ] **Photo + map pin upfront** (Feature #8 — first thing Rashid sees is the truth source)
- [ ] In-flow "Start job" CTA (Phase B — replaces mobile sticky CTA) transitions status to `in_progress` and navigates to 3.3
- [ ] Offline: status change is queued and retried on reconnect

### Status: In Progress (3.3)

- [ ] **Outdoor high-contrast theme** (UX Review revision #4): near-white background, pure-black text, no greys; designed for direct-sunlight readability on LCD and OLED
- [ ] Auto-switches by ambient-light sensor if available; manual override in settings
- [ ] **Full-bleed page (no chrome)** in the `.theme-outdoor` palette (Phase B — hands-busy exception; the centered content column is *dropped* on this page so the high-contrast treatment extends edge-to-edge)
- [ ] Top strip with minimize control + timer; hero block with citizen photo + ticket title + ward; step log; progress note composer; primary "Fixed — take photo" CTA
- [ ] Map view + citizen photo visible at top
- [ ] Quick actions: navigate (opens native maps app), call reporter (anonymized), enqueue next job, mark resolved
- [ ] "Mark resolved" → 3.4
- [ ] Visual must match `mockups/07-status-in-progress.html` to within `tolerance: 0.005` at large + medium + 390 × 844 phone

### Resolve — Before/After Capture (3.4)

- [ ] Multi-photo capture flow (UX Review revision #6):
  - Default cap = 3 photos
  - Narrow-category cap = 2 (configurable per category by Aamir)
  - Mandatory minimum = 1
- [ ] "Before" photos are pre-populated from the original citizen report (read-only)
- [ ] "After" photos: camera-first; gallery fallback
- [ ] Review step before submit
- [ ] Offline: photo upload is queued and retried on reconnect
- [ ] Submit → 3.5

### Confirmation — Mark Resolved (3.5)

- [ ] **Centered 640px card on neutral surface** (Phase B — mirrors Rahim's 1.11 pattern), max-width `--card-max-width` token; no top bar / no chrome; the card is the page
- [ ] Submission confirmation; ticket transitions to `resolved` on successful upload
- [ ] Hero check icon + headline + subtitle + photo pair (before / after) + quick stats + two-button CTA pair (next job / back home) + share link
- [ ] Returns to 3.1 with job removed from active list
- [ ] If upload still queued: shows "uploading" state; ticket moves to "Pending sync" filter in 3.1
- [ ] Multi-photo set flows downstream to: `confirmation-mark-resolved.md` (3.5), `resolve-confirmation.md` (Habib's 2.6), `my-reports-detail.md` (Rahim's 1.12 with horizontal scroll + "+n" overflow indicator)

### Cross-cutting

- [ ] Bangla default; English toggle available
- [ ] Works on 3G: bundle size, image compression, deferred non-essential fetches
- [ ] Offline-tolerant: status changes and photo uploads queue locally; retry on reconnect
- [ ] PWA installable (per design log cross-cutting decision)
- [ ] One-tap status changes (in-progress → resolved; Feature #4 design rationale — no free-text forms)
- [ ] Browser-verified on Chromium at web viewports **1440 × 900 (large) and 1024 × 768 (medium)**, plus the **390 × 844 phone fallback** (Phase B — web-first with phone reflow)
- [ ] Visual regression: mockups 06 + 07 pass Playwright `npm run test:mockups` at `tolerance: 0.005` across all three viewports (6 baselines)

---

## Do Not Change

- The **outdoor high-contrast theme** for in-progress (UX Review revision #4 — dark mode rejected in favor of high-contrast).
- The **multi-photo defaults** (cap = 3, narrow-category cap = 2, mandatory minimum = 1; UX Review revision #6).
- The **one-shot "Refresh location"** button pattern (UX Review revision #9 caveat). Continuous tracking is **not** the pattern — battery + privacy.
- The **photo + map pin as first-screen content** (Feature #8 — non-negotiable).
- The **offline-queue-then-sync** pattern (Feature #4 — gating).
- The **3G tolerance** requirement (Feature #4 — gating).

---

## Reference Files

**Page specs (5):** see Specs section above.

**Design system:** `design-artifacts/D-Design-System/01-Visual-Design/tokens.css` (the `.theme-outdoor` class implements the in-progress theme).

**Strategy:** `design-artifacts/A-Product-Brief/01-product-brief.md`, `design-artifacts/B-Trigger-Map/{04-persona-rashid-the-resolver,06-feature-impact}.md`.

**Tests:**
- `tests/01-mockups.spec.ts` — visual regression on Rashid mockups 06 + 07 at large + medium + 390 × 844 (6 baselines, added Phase B 2026-10-04)
- `tests/helpers/compare.ts` — Playwright helper
- `tests-mockups/baselines/01-mockups.spec.ts/` — committed baselines
- Pages 3.4 / 3.5 do not have committed baselines; visual regression on built pages against spec mocks must be added during build (per `tests-mockups/README.md` "How the build phase uses this" section).

**Prior WO:** `design-artifacts/E-Development/WO-000-platform-foundation.md`

---

## Open Questions for Mimir

1. **Photo compression policy.** v1 spec doesn't pin a target. Recommendation: max 1600px long edge, JPEG quality 80, EXIF stripped except GPS.
2. **Offline queue storage.** IndexedDB vs. localStorage? Recommendation: IndexedDB (larger quota; photo blobs).
3. **PWA service worker scope.** Recommendation: cache shell + tokens; ticket data is always live (no stale cache).
4. **Ambient-light sensor.** Auto-switch is "if available" — needs feature-detection, not hard dependency.