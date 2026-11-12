---
intent: 006-citizen-home-and-report-redesign
phase: construction
status: complete
created: 2026-10-13T18:05:00Z
updated: 2026-11-11T21:55:00Z
---

# System Context: Citizen Home & Report-Flow Redesign

## Intent Boundary

This intent touches the **citizen-facing surface only** — the routes
a logged-in or anonymous visitor reaches after the splash/welcome
pages. It does **not** touch:

- The dispatcher, crew, or admin consoles (separate intents in v2).
- The public landing or splash surface (pre-auth).
- The authentication or registration flows (WO-001 platform layer).
- The notification or push-delivery surface (WO-006 deferred).
- The data layer, Prisma schema, or API contracts.

## In-Scope Surfaces

| Surface | Path | Touched |
|---------|------|---------|
| Citizen home (activity map + recent reports) | `/home` | Yes — FR-2 |
| Report step 1 — Location | `/report/location` | Yes — FR-4 |
| Report step 2 — Photo | `/report/photo` | Yes — FR-5 |
| Report step 3 — Category | `/report/category` | Yes — FR-6 |
| Report step 4 — Note | `/report/note` | Yes — FR-7 |
| Report step 5 — Summary | `/report/summary` | Yes — FR-8 |
| Report submitted confirmation | `/report/[id]/submitted` | Yes — FR-9 |
| Token system (foundation) | `design-artifacts/D-Design-System/01-Visual-Design/tokens.css` | Yes — FR-1 |
| Shared layout primitives | `components/ui/` | Yes — FR-10 |

## Out-of-Scope Surfaces

| Surface | Why Out |
|---------|---------|
| `/splash`, `/welcome` | Pre-auth; redesign deferred to v2 follow-ups per `_progress/v2-roadmap.md` |
| `/login`, `/register`, `/verify-otp` | Auth surface; gated by WO-001 platform layer |
| `/dispatch/*`, `/crew/*`, `/admin/*` | Role-specific consoles; v2 work |
| `/account/*` | Profile/settings; deferred |
| `lib/db*`, `lib/serializers/*`, `lib/auth/*` | Platform layer; not touched |
| API routes under `app/api/v1/*` | Backend; not touched |
| Prisma schema | Data model; not touched |

## External Interfaces This Intent Consumes

| Interface | Direction | Purpose | Notes |
|-----------|-----------|---------|-------|
| `GET /api/report/bootstrap` | Read | List categories for the Category step (FR-6) | Existing endpoint; no change |
| `GET /api/v1/tickets` | Read | List tickets for the home map + side panel (FR-2) | Existing endpoint; no change |
| `POST /api/v1/tickets` | Write | Submit the report (FR-8 / FR-9) | Existing endpoint; no change |
| Web Push subscription (existing) | Subscribe | Subscribe the citizen on home (post-redesign) | Pre-existing, not added by this intent |
| Browser `navigator.geolocation` | Read | Auto-locate on Location step (FR-4) | Pre-existing |
| `getUserMedia` / `<input type="file" capture>` | Read | Photo capture on Photo step (FR-5) | Pre-existing |

## External Interfaces This Intent Publishes

None. The intent does not expose new routes, API endpoints, or public
types outside the existing app.

## Stakeholders

| Stakeholder | Concern | Resolution |
|-------------|---------|------------|
| Citizen (primary user) | Visual feel, ease of completing a report | This intent directly addresses |
| Dispatcher / crew | None — they don't see this surface | Out of scope |
| Product owner | Measurable lift in time-on-task | Tracked via NFR (Performance) |
| Design lead | Coherent design language, no drift | The shared primitives (FR-10) keep the home + report flow consistent |
| Tech lead | No regression in test suite, no new dependencies | Gated by `team.md` Mandated checks |

## Architectural Drivers

| Driver | Impact |
|--------|--------|
| **Token-name stability** | The redesign must not change token names. Components reference `var(--color-primary)`, `var(--space-5)`, etc. by name; the names are the public contract. (FR-1) |
| **No new dependencies** | The existing icon set (lucide-react), the existing i18n registry, the existing token system, and the existing component primitives are sufficient. (Constraints) |
| **Bangla-first parity** | Every new English string must have a Bangla equivalent in `lib/i18n/keys.ts`. (FR-3, FR-4–FR-9, Constraints) |
| **WCAG 2.1 AA** | All NFRs (Accessibility section) must hold on every redesigned surface. (NFR Accessibility) |
| **Playwright mockup gating** | Visual regression baselines update deliberately; new PNG reviewed in PR. (NFR Reliability) |
| **No backend change** | The redesign is render-only. All API contracts are frozen. (Constraints) |

## Adjacent Surfaces (Touched Only by Token Cascade)

These surfaces are **not** redesigned by this intent, but they
automatically inherit the new token values from FR-1:

- `/splash`, `/welcome`, `/login`, `/register` — the token cascade
  affects them visually, but their layout, copy, and behavior are
  untouched.
- The shared `<SiteHeader>`, `<SiteFooter>`, and global navigation
  components — same.
- Any consumer of `var(--color-*)`, `var(--space-*)`, `var(--text-*)`.

The token refresh is therefore a **foundation Unit (001)** that
cascades to every other citizen-touching surface automatically. The
construction agent must visually re-verify splash + welcome after
the token change lands to ensure the cascade did not break a
pre-existing layout.

## Boundaries With Other Intents

| Adjacent Intent | Boundary |
|----------------|----------|
| `005-*` (preceding — bolt for dev-store) | None — completed |
| `007-*` (v2 follow-ups) | Inherits the new token system + layout primitives |
| `008-*` (admin/dispatcher redesign) | Will share primitives from FR-10; separate intent |

## Risk Posture

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Token cascade breaks a pre-existing layout on a non-redesigned surface | Medium | Medium | Construction agent visually re-verifies splash + welcome + login after FR-1 lands |
| New i18n keys ship without Bangla translations | Low | High | Construction agent runs the typed registry check before each bolt merge; team.md Mandated |
| Playwright baselines auto-update and hide a real regression | Medium | High | Per `team.md` Forbidden: baselines reviewed in PR; new PNG surfaced in PR description |
| `prefers-reduced-motion` is ignored on a transition | Medium | Medium | All new animations gated on media query; checked in unit tests |
| Touch targets < 44dp on a chip / map control | Medium | Medium | FR-2 / FR-3 acceptance criteria enforce 48dp on map controls and 44dp everywhere else |
| Pin density (>200) tanks home-map FPS | Low | Medium | Existing MapLibre cluster pattern is inherited; no change to data flow |

## Checkpoint Targets

- **Checkpoint 2 (passed)**: requirements.md approved.
- **Checkpoint 3 (next)**: this system-context.md + units.md + per-unit
  briefs + per-story files + per-bolt plans surfaced together.
- **Checkpoint 4 (final)**: route to Construction Agent.

## Open Items

- The 5 open questions in `requirements.md` (5-step shape, theme-outdoor
  scope, map filter, photo CTA copy, language posture) have provisional
  defaults captured in `inception-log.md`. None of them block
  Checkpoint 3 — the defaults are stated as defaults and can be
  overridden at any later point.
