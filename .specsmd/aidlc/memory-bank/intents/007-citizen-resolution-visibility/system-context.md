---
intent: 007-citizen-resolution-visibility
phase: inception
status: in-progress
created: 2026-10-13T20:05:00Z
updated: 2026-10-13T20:05:00Z
---

# System Context: Citizen Resolution Visibility

## Intent Boundary

This intent closes three citizen-visible seams in the post-submit
loop so the reporter can see, on `/reports/[id]`, which photos were
attached by the citizen vs. uploaded by the field crew, and so the
status trail never leaks the internal `after_photo:` marker. It also
adds the missing dispatcher-side handoff: a crew picker so a
dispatcher can assign a specific crew member to a ticket from
`/dispatcher/tickets/[id]` without bouncing to an admin.

The intent is **a polish / closure pass on surfaces that already
exist**. It does NOT introduce new roles, new top-level routes, new
public types, or new external integrations. The three functional
requirements each touch an established surface and an established
serializer / endpoint, and the only "new" artefact is the small
Prisma migration for the photo split (FR-1).

## In-Scope Surfaces

| Surface | Path | Touched |
|---------|------|---------|
| Citizen report detail (status trail + photo gallery) | `/reports/[id]` | Yes — FR-1, FR-2 |
| Citizen serializer (citizen branch) | `lib/serializers/ticket.ts` | Yes — FR-1, FR-2 |
| `i18n` registry (new labels) | `lib/i18n/keys.ts` | Yes — FR-1, FR-2 |
| Dispatcher ticket detail (crew picker) | `/dispatcher/tickets/[id]` | Yes — FR-3 |
| Dispatcher API (crew-assign endpoint or PATCH extension) | `app/api/v1/dispatcher/tickets/[id]/...` | Yes — FR-3 |
| Prisma schema (`TicketPhoto` row OR `beforePhotoUrls` / `afterPhotoUrls` columns) | `prisma/schema.prisma` | Yes — FR-1 (migration) |
| Dev store (parallel shape to Prisma) | `lib/dev-store.ts` | Yes — FR-1 (mirror the schema change) |
| Unit tests (serializer + crew-picker logic) | `tests/unit/serializers/...`, `tests/unit/crew-picker/...` | Yes — FR-1, FR-2, FR-3 |
| Playwright E2E specs | `tests/<NN-007-...>.spec.ts` | Yes — FR-1, FR-3 |
| Playwright visual regression baselines | `tests-mockups/baselines/01-mockups.spec.ts/` | Yes — FR-1, FR-3 |

## Out-of-Scope Surfaces

| Surface | Why Out |
|---------|---------|
| `/splash`, `/welcome`, `/login`, `/register` | Pre-auth; out of scope per Intent 005 launch-polish |
| `/home`, `/feed` (citizen) | No new control; the home/feed surface does not render photos or the trail |
| `/report/*` (submit flow) | Pre-resolve; FR-1 only touches post-resolve display |
| `/crew/*` (crew app) | Crew is the producer of `after_photo:`, not a consumer; the citizen-side filter is on the read path, not the write path |
| `/admin/*` (admin console) | Admin already has the pure-reassign path; the dispatcher picker does not change the admin surface |
| `lib/db.ts` Prisma client wrapper | No new direct access; everything goes through the service layer per team.md Mandated |
| `lib/platform/push.ts` | Out of scope (push notifications are an explicit "Won't") |
| `design-artifacts/*` | No new spec or wireframe; the change is an in-place render and a UI control added to an existing screen |
| API routes under `app/api/v1/crew/*` | The crew photo-upload write path is unchanged; this intent only filters on the read |

## External Interfaces This Intent Consumes

| Interface | Direction | Purpose | Notes |
|-----------|-----------|---------|-------|
| `GET /api/tickets/[id]` | Read | Citizen detail page loads the serialized ticket (FR-1, FR-2) | Existing endpoint; no change to the route, only the serializer output |
| `GET /api/v1/dispatcher/tickets/[id]` | Read | Dispatcher detail page loads the ticket + crew-list (FR-3) | Existing endpoint; the crew-list query is a sibling or a new service call |
| `POST /api/v1/crew/tickets/[id]/photos` (existing) | Read-only reference | The trail marker format that FR-2 must filter (`after_photo:<url>`) | Bolt 004-003 writes this; this intent does not change the write path |
| `writeAudit(...)` (existing) | Write | Every `assignedCrewId` change in FR-3 writes an audit row | Existing platform helper; no change |
| Prisma client (existing) | Read + Write | The photo-split data-model change (FR-1) goes through Prisma migration + dev store mirror | Single source of truth per project.md tech stack |

## External Interfaces This Intent Publishes

| Interface | Direction | Purpose | Notes |
|-----------|-----------|---------|-------|
| `PATCH /api/v1/dispatcher/tickets/[id]/assign-crew` (or guarded PATCH extension) | Write | Dispatcher sets / clears `assignedCrewId` on a ticket (FR-3) | New sibling route, OR a guarded extension of the existing dispatcher PATCH; the team.md Mandated "no role-escalation" rule keeps the admin-only `toStatus`-less reassign path admin-only |

No other new routes, no new public types, no new push / SSE / WebSocket
transports.

## Stakeholders

| Stakeholder | Concern | Resolution |
|-------------|---------|------------|
| Citizen (primary user) | Can I see what the crew did? Is the status trail readable? | This intent directly addresses via FR-1, FR-2 |
| Dispatcher | Can I assign a crew member to this ticket from this page? | FR-3 directly addresses |
| Field crew | The `after_photo:` marker keeps working as an internal audit signal | No change to the write path; the filter is citizen-only per FR-2 |
| Admin | The pure-reassign admin path is unchanged | The existing `app/api/tickets/[id]/transition` admin-only behaviour is preserved (no role-escalation) |
| Tech lead | No schema-merge risk, no new role, no new external integration | Prisma migration is a single additive change (new `TicketPhoto` row OR split columns); backfill is covered in the FR-1 unit brief |
| Design lead | The new photo groups and the new picker should match the design tokens already in use | Reuse `tokens.css` and the existing `ReportCard` / `StatusPill` primitives from Intent 006 |
| Product owner | The visible "loop closed" moment is measurable | Test pyramid compliance row in `requirements.md` (Checkpoint 1, Q5) |
| Audit / compliance | Every `assignedCrewId` change is auditable | The existing `writeAudit(...)` helper is the only path; no new audit channel |

## Architectural Drivers

| Driver | Impact |
|--------|--------|
| **Single-source serializer** | FR-1 and FR-2 land at the serializer (`lib/serializers/ticket.ts`), not at the page or the API route. Any future citizen surface that reads the trail (push payload, email, public activity feed) benefits from the same fix without re-doing it. |
| **Migration safety** | The FR-1 Prisma migration MUST be backwards-compatible: existing rows in the dev store and any seeded fixtures continue to read as a valid citizen surface. The new `uploadedByRole` discriminator OR the split columns approach is decided at the FR-1 unit-brief stage. |
| **No role escalation** | FR-3 adds a dispatcher-only write path. The admin-only pure-reassign path (no `toStatus`) stays admin-only. The new endpoint MUST verify (server-side) that the chosen crew member's `homeWardId` equals the ticket's `wardId` — the picker UI is a hint, not the trust boundary. |
| **Test pyramid** | All three Must FRs ship with unit + Playwright E2E + visual baseline (FR-2 ships unit-only — no new user-visible control). Matches the team's gating posture (Playwright baselines are gating per team.md). |
| **Bilingual parity** | All new labels ("Before", "After", "After photo added", "Assign crew", etc.) flow through `lib/i18n/keys.ts` with both English and Bangla strings. |
| **Marker format stability** | The `after_photo:` marker format on `TicketTrailEntry.note` MUST stay stable (the audit pipeline greps on it per Bolt 004-003 line 113-117). The fix is at the citizen serializer, not a marker rename. The unit test asserts no `^[a-z_]+:` marker-shaped string reaches the citizen branch. |

## Adjacent Surfaces (No Code Change, Possible Token Cascade)

These surfaces are **not** touched by this intent, but if any new
token or component primitive is introduced to render the photo groups
or the picker, the cascade may affect them visually. The construction
agent should visually re-verify after each bolt lands.

- `/home`, `/feed` (citizen)
- `/splash`, `/welcome`, `/login`, `/register`
- The shared `<ReportCard>`, `<StatusPill>`, `<FilterChipGroup>`, `<AppHeader>` primitives from Intent 006

The construction agent should prefer reusing existing primitives over
introducing new ones; if a new primitive is unavoidable, it lands in
`components/ui/` per the project layout.

## Boundaries With Other Intents

| Adjacent Intent | Boundary |
|----------------|----------|
| `002-citizen-report-flow` (preceding) | The trail-marker format (`after_photo:<url>`) was introduced in Bolt 004-003 (Intent 004). This intent filters it on the citizen read path; the write path is unchanged. |
| `003-dispatcher-queue` (preceding) | The dispatcher PATCH route (`app/api/v1/dispatcher/tickets/[id]/route.ts`) accepts `wardId` / `categoryId` / `internalNote` today but NOT `assignedCrewId`. FR-3 either adds a sibling route or guards an extension. The existing dispatcher PATCH is preserved. |
| `004-field-crew-app` (preceding) | The crew photo-upload write path (`POST /api/v1/crew/tickets/[id]/photos`) is unchanged. This intent only touches the read path. |
| `005-admin-city-setup` (preceding) | The admin-only pure-reassign path (`app/api/tickets/[id]/transition` with no `toStatus`) stays admin-only. The dispatcher crew-picker does NOT escalate the admin role; the two paths coexist. |
| `006-citizen-home-and-report-redesign` (preceding) | Reuses the `ReportCard` and `StatusPill` primitives; the new photo-group UI should match the same token system. No new tokens expected. |
| `008-*` (v1.1 follow-ups) | Push notifications, the "Resolved!" celebration surface, and real-time polling are explicitly parked as v1.1 follow-ups per the `requirements.md` Won't list. They would extend the citizen detail page, not this intent. |

## Risk Posture

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| FR-1 Prisma migration breaks seeded dev-store fixtures | Medium | Medium | Migration is additive; a backfill step is included in the FR-1 unit brief; the dev store mirrors the same change |
| FR-1 migration's discriminator choice (`TicketPhoto` row vs split columns) misaligns with future push payload shape | Low | Medium | Decision is finalized at the FR-1 unit brief; the discriminator is exposed in the serializer, not the route, so the push shape can adapt later |
| FR-2 regression-guard test fails on an existing trail entry that uses a marker shape we didn't anticipate | Low | Low | The regex `^[a-z_]+:` is narrow enough to avoid false positives on free-text notes; the test runs on the existing trail fixtures first to confirm |
| FR-3 dispatcher picker endpoint is mis-scoped (a dispatcher assigns a crew from a different ward) | Low | High | The endpoint MUST server-side verify the chosen crew member's `homeWardId` equals the ticket's `wardId`; the picker UI is a hint only; unit + E2E tests cover the cross-ward reject path |
| FR-3 endpoint is treated as a role-escalation path by an admin-only check elsewhere in the code | Low | High | The existing admin-only pure-reassign path is preserved; the new endpoint is gated to `role === 'dispatcher'` and does not accept `toStatus`; the role-gate unit test asserts the dispatcher cannot pass `toStatus` |
| New i18n keys ship without Bangla translations | Low | High | Typed registry check before each bolt merge; team.md Mandated |
| Playwright baseline auto-update hides a real regression on the photo-group grid | Medium | Medium | Per team.md Forbidden: baselines reviewed in PR; new PNG surfaced in PR description |
| `prefers-reduced-motion` ignored on a photo-group transition | Low | Low | All new animations gated on media query; checked in unit tests |
| Touch targets < 44dp on the crew-picker list rows | Low | Low | FR-3 acceptance criteria enforce 48dp on the picker rows |

## Checkpoint Targets

- **Checkpoint 1 (passed)**: requirements.md approved with all 5 clarifying questions answered.
- **Checkpoint 2 (passed)**: requirements.md final approval.
- **Checkpoint 3 (next)**: this system-context.md + units.md + per-unit briefs + per-story files + per-bolt plans surfaced together.
- **Checkpoint 4 (final)**: route to Construction Agent.

## Open Items

- The FR-1 Prisma migration shape (additive `TicketPhoto` row vs split columns) is the one open implementation choice; it is finalized at the FR-1 unit-brief stage. The intent does NOT pre-commit; the FR-1 acceptance criteria are agnostic to the choice.
- The exact i18n key names ("Before", "After", "After photo added", "Assign crew", etc.) are finalized at the units stage when the design tokens and primitives are confirmed.
- The Playwright E2E spec file name (`tests/<NN-007-...>.spec.ts`) and the visual-baseline slot under `tests-mockups/baselines/01-mockups.spec.ts/` are finalized at the bolt-plan stage.
