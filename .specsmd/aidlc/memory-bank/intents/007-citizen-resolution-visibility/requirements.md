---
intent: 007-citizen-resolution-visibility
phase: inception
status: inception-complete
created: 2026-10-13T19:50:00Z
updated: 2026-10-13T20:25:00Z
---

# Requirements: 007-citizen-resolution-visibility

## Intent Overview

Close the three remaining gaps in the citizen-side end-to-end loop so
that a reporter can clearly see the resolution of their report once the
field crew has fixed the issue. The mechanics of the loop (submit →
dispatcher triage → crew assign → crew resolve) all work; what is
missing is the citizen-visible polish that makes the loop feel
complete:

1. Photos captured by the citizen ("before") and by the field crew
   ("after") are not separated on the citizen detail page — they sit
   in a single flat grid, so the reporter cannot tell at a glance
   which photos are evidence of the fix.
2. The crew's "after" photo upload writes a `TicketTrailEntry` whose
   `note` field is the raw marker `after_photo:<url>`. That string
   is currently passed through the citizen serializer verbatim, so
   the reporter sees a literal `after_photo:https://...` in the
   status trail instead of a human-readable note.
3. The dispatcher cannot pick which crew member to assign the ticket
   to from the dispatcher ticket-detail page. They can re-assign
   wards/departments and write internal notes, but the crew picker
   itself is admin-only via the shared transition route. The
   dispatcher either has to bounce the ticket back to an admin or
   leave it `unassigned`, breaking the loop's handoff.

This intent is the small, focused close-out of those three gaps. It
is intentionally scoped tight: no new roles, no new pages, no
real-time push, no celebratory animation. The objective is to make
the existing flow honest for the citizen without expanding the
surface area.

## Business Goals

| Goal | Success Metric | Priority |
|------|----------------|----------|
| Citizens can see the before/after photo split on the report detail page | A non-technical user inspecting a resolved ticket can name which photos were "before" and which were "after" without instructions. | Must |
| Citizens do not see internal marker strings in the status trail | The literal `after_photo:` prefix never appears in any citizen-facing render of the trail. | Must |
| Dispatchers can assign a ticket to a specific crew member from the dispatcher detail page | A dispatcher moving a ticket from "routed" to "in_progress" can choose a crew member from a UI picker on the same screen, without bouncing to an admin. | Must |
| Existing v1 surfaces (push notifications, "Resolved!" celebration, real-time polling) remain untouched | No new endpoints added for push/polling; no celebratory animation introduced. | Should |

---

## Functional Requirements

### FR-1: Before/after photo split on the citizen report detail page
- **Description**: The citizen report-detail page (`/reports/[id]`) MUST render the report's photos as two clearly-labelled sections — "Before" (photos the citizen attached during submission) and "After" (photos the field crew attached during resolution) — instead of a single flat grid. The "After" section MUST only render for tickets that have at least one crew-uploaded photo; tickets that have not been resolved yet MUST hide the "After" section entirely.

  **Data-model change (resolved at Checkpoint 1, Q3):** Today both uploads append to a single `Ticket.photoUrls` array with no discriminator. FR-1 includes a small Prisma migration that either (a) introduces a `TicketPhoto` row with `uploadedByRole` (`citizen` | `crew`) and `uploadedAt`, or (b) splits the array into two columns on `Ticket` (`beforePhotoUrls`, `afterPhotoUrls`). The serializer (`lib/serializers/ticket.ts`) then exposes `beforePhotoUrls` and `afterPhotoUrls` as two separate arrays; the page renders them as two groups.

- **Acceptance Criteria**:
  - Given a ticket with 2 citizen photos and 1 crew photo, when a citizen opens `/reports/[id]`, then the page renders a "Before" group with 2 thumbnails and an "After" group with 1 thumbnail, and the labels are visible in both English and Bangla per the i18n key registry.
  - Given a ticket with only citizen photos (no crew photos), when a citizen opens `/reports/[id]`, then no "After" group renders.
  - Given a ticket with 0 citizen photos and 1 crew photo, when a citizen opens `/reports/[id]`, then the "Before" group renders an empty-state message and the "After" group renders the 1 crew thumbnail.
  - The serializer (`lib/serializers/ticket.ts`) MUST continue to strip any internal fields from the citizen branch; the before/after split is a data-model concern reflected in the serializer exposing `beforePhotoUrls` and `afterPhotoUrls` as two separate arrays.
  - **Test pyramid (Checkpoint 1, Q5):** unit tests at the serializer layer (the array split is correct across all three branches — citizen / non-citizen / public), one Playwright E2E that loads a seeded resolved ticket and asserts the two groups are present and labelled, and a new visual-regression baseline for the grouped photo grid (matches the team's gating posture — Playwright baselines are gating per team.md).
- **Priority**: Must
- **Related Stories**: TBD (defined in units stage)

### FR-2: Filter `after_photo:` marker from the citizen-visible status trail
- **Description**: The citizen serializer MUST NOT surface the raw `after_photo:<url>` marker that the crew photo-upload endpoint appends to the `TicketTrailEntry` table. The marker is an internal audit signal, not a citizen-facing note. On the citizen report-detail page, the trail MUST either omit these entries entirely or replace them with a localized "After photo added" entry; the raw prefix MUST never appear in any citizen-facing render.

  **Marker scope (resolved at Checkpoint 1, Q2):** `after_photo:` is the only internal marker the system writes to `TicketTrailEntry.note` in the pilot. The filter is single-prefix. As a regression guard, the unit test asserts that NO trail entry's `note` field on the citizen branch matches the shape `^[a-z_]+:` — so any future marker added in any trail-write call site will fail the test until it is explicitly handled.

- **Acceptance Criteria**:
  - Given a ticket whose trail contains one entry with `note: "after_photo:https://blob/abc.jpg"`, when the ticket is serialized for a citizen, then the serialized trail does NOT contain a `note` field whose value starts with `after_photo:` (either the entry is omitted or the `note` is replaced with the localized "After photo added" string).
  - The replacement label "After photo added" (English) and its Bangla equivalent are present in `lib/i18n/keys.ts` and are used on the citizen render.
  - Internal surfaces (dispatcher, crew, admin) continue to see the raw marker in their trail — this requirement is citizen-only.
  - A new unit test under `tests/unit/serializers/ticket.test.ts` (or a dedicated trail-marker test) asserts that for any `TicketTrailEntry` whose `note` matches `^[a-z_]+:`, the citizen branch either omits the entry or replaces the `note` — and fails the build if a new marker is added without a corresponding citizen-side decision.
  - The existing trail tests under `tests/unit/serializers/` continue to pass.
  - **Test pyramid (Checkpoint 1, Q5):** unit tests at the serializer + i18n layers; no E2E required (FR-2 has no new user-visible control — it removes a string from an existing render).
- **Priority**: Must
- **Related Stories**: TBD (defined in units stage)

### FR-3: Dispatcher crew picker on the dispatcher ticket-detail page
- **Description**: The dispatcher ticket-detail page (`/dispatcher/tickets/[id]`) MUST surface a UI control that lets a dispatcher assign a specific crew member to the ticket. The control MUST list all crew users whose `homeWardId` matches the ticket's current `wardId` (ward-scoped, per Checkpoint 1, Q1). The dispatcher MUST be able to pick a crew member and persist that choice without bouncing to an admin.

- **Acceptance Criteria**:
  - Given a dispatcher on a ticket-detail page whose ticket is `routed` to ward `ward_14`, when the dispatcher opens the "Assign crew" picker, then the picker lists every crew user whose `homeWardId` equals `ward_14`, showing each user's display name in both English and Bangla.
  - The dispatcher can select a crew member and submit, and the `assignedCrewId` on the ticket is updated; an `AuditEntry` is written with before/after `assignedCrewId` (matching the pattern already used by the admin-only pure-reassign path).
  - A dispatcher who picks no crew member can clear the assignment (revert to `null`).
  - The endpoint MUST verify (server-side) that the chosen crew member's `homeWardId` equals the ticket's `wardId` before writing — i.e., the picker UI is a hint, not the trust boundary.
  - The picker is gated to the dispatcher role; crew and citizen surfaces do not gain a new control.
  - The shared transition route's existing admin-only pure-reassign behaviour is preserved (no role-escalation). The crew-picker endpoint is a sibling route (e.g., `PATCH /api/v1/dispatcher/tickets/[id]/assign-crew`) or a guarded extension of the existing dispatcher PATCH; resolved at the units stage.
  - **Test pyramid (Checkpoint 1, Q5):** unit tests at the picker-logic layer (ward-scope filter, role gate, audit-entry shape), one Playwright E2E that drives the picker from a dispatcher session and asserts the ticket's `assignedCrewId` is updated and an audit row is written, and a new visual-regression baseline for the picker open + selected states.
- **Priority**: Must
- **Related Stories**: TBD (defined in units stage)

---

## Non-Functional Requirements

### Performance
| Requirement | Metric | Target |
|-------------|--------|--------|
| Citizen detail-page render | Time to first paint of the photo group sections | < 200ms p95 on the existing 4G throttle (matches the existing 1.12 My Reports target). |
| Dispatcher picker open latency | Time from click to the picker showing the crew list | < 300ms p95 (the crew list is small per ward, ≤ 50 entries in pilot). |

### Scalability
| Requirement | Metric | Target |
|-------------|--------|--------|
| Crew list size per ward | Crew users scoped to a single ward | ≤ 50 (pilot); the picker does not need pagination. |
| Photos per ticket | Citizen + crew photos combined | ≤ 6 (3 citizen cap + 3 crew cap from CREW-003). |

### Security
| Requirement | Standard | Notes |
|-------------|----------|-------|
| Authorization on the dispatcher crew-picker endpoint | Role gate: dispatcher only; cannot assign crew outside the ticket's ward scope | The endpoint MUST verify the chosen crew member's `homeWardId` matches the ticket's `wardId` before writing. |
| Serializer citizen branch | Continue to strip `assignedCrewId`, `internalNote`, and any other internal fields; the new `beforePhotoUrls` / `afterPhotoUrls` arrays are SAFE to expose to citizens | The existing `tests/unit/serializers/ticket.test.ts` invariants are preserved. |
| Audit | Every `assignedCrewId` change writes an `AuditEntry` via `writeAudit(...)` from `lib/platform/audit.ts` | Matches the existing transition-route pattern. |

### Reliability
| Requirement | Metric | Target |
|-------------|--------|--------|
| Trail marker filtering | The filter MUST be enforced at the serializer layer (not at the render layer) so any future citizen surface that reads the trail also benefits | Single source of truth. |
| Photo array integrity | A crew photo URL MUST end up in `afterPhotoUrls`, never in `beforePhotoUrls`, even if the trail marker is malformed | Defensive: bucketing falls back to the trail-entry ordering, not the prefix alone. |

### Compliance
| Requirement | Standard | Notes |
|-------------|----------|-------|
| Bilingual UI | All new labels (group headers, replacement trail note, picker placeholder) flow through `lib/i18n/keys.ts` | Per the team-mandated i18n rule. |
| WebAuthn admin-only writes | Dispatcher crew-picker writes go through the existing service layer; admin WebAuthn is unchanged | The admin-only `toStatus`-less reassign path stays admin-only. |
| Test pyramid (locked at Checkpoint 1, Q5) | All three Must FRs ship with unit + Playwright E2E + visual baseline (FR-2: unit only — no new user-visible control) | Matches the team's gating posture (Playwright baselines are gating per team.md). |

---

## Constraints

### Technical Constraints

**Project-wide standards**: Required standards will be loaded from memory-bank standards folder by Construction Agent.

**Intent-specific constraints** (only list constraints unique to this feature):
- The serializer change is a citizen-branch contract change. Any new field (e.g., `beforePhotoUrls`, `afterPhotoUrls`) MUST be added to all three branches (citizen / non-citizen / public) with the appropriate scoping, or the type signature of `SerializedTicket` will be broken.
- The Prisma migration for FR-1 (adding `TicketPhoto` rows with `uploadedByRole` / `uploadedAt`, OR splitting `Ticket.photoUrls` into two columns) MUST be backwards-compatible: existing rows in the dev store and any seeded fixtures MUST continue to read as a valid citizen surface (citizen photos land in `beforePhotoUrls`, no rows leak into `afterPhotoUrls`).
- The crew-picker must reuse the existing `/api/tickets/[id]/transition` route shape or add a sibling route under `/api/v1/dispatcher/tickets/[id]` — the existing dispatcher PATCH does not currently accept `assignedCrewId` and would need a guard to keep dispatchers from escalating.
- The `after_photo:` marker format on `TicketTrailEntry.note` MUST stay stable (the audit pipeline greps on it per Bolt 004-003 line 113-117). The fix is to filter the marker at the citizen serializer, not to rename the marker.

### Business Constraints
- This intent lands on `main` as part of the v1 launch-polish window; it must NOT introduce new user-facing copy in English-only — both locales (English + Bangla) ship at the same time per the project's i18n standard.
- Scope is intentionally tight: no new endpoints for push, no celebratory animation, no real-time polling. The three functional requirements are the maximum.
- The intent does not expand the four-role model.

---

## Assumptions

| Assumption | Risk if Invalid | Mitigation |
|------------|-----------------|------------|
| The crew photo-upload endpoint (`POST /api/v1/crew/tickets/[id]/photos`) writes to the same `Ticket.photoUrls` array as the citizen upload (confirmed at Checkpoint 1, Q3). | Already known to be true; the FR-1 unit will verify the exact write call site and pick the migration shape (separate `TicketPhoto` rows vs split columns). | Add the `uploadedByRole` discriminator as part of FR-1's Prisma migration. |
| Crew assignment is ward-scoped in the pilot (confirmed at Checkpoint 1, Q1). | If the city ever moves to department-scoped assignment, the picker query changes. | The picker query is centralized in one service function; switching the model is a single edit. The NFR notes the ward-scope is the v1 model. |
| `after_photo:` is the only internal marker on `TicketTrailEntry.note` (confirmed at Checkpoint 1, Q2). | If a future marker is added, it would leak to the citizen trail. | A regression-guard unit test asserts no `^[a-z_]+:` marker-shaped string reaches the citizen branch. Any new marker either passes the test (with an explicit decision) or fails the build. |
| No citizen surface outside `/reports/[id]` consumes the trail today. | If a future surface (push, email, etc.) reads the trail, this fix only catches the web render. | The filter is at the serializer, not the page; any future consumer goes through the same serializer. |
| The dev store can be re-seeded cleanly after the FR-1 migration. | If the migration needs a backfill step on the dev store, the FR-1 unit must include that step. | The unit brief will include a backfill step as a precondition for the bolt. |

---

## Out of Scope (Won't)

The following are explicitly excluded from this intent and are tracked
as v1.1 follow-ups:

- **Push notifications on status changes** — the existing `sendTicketPush()` scaffold in `lib/platform/push.ts:106` is the v1.1 wire call; this intent does not wire it.
- **"Resolved!" celebration surface** — Bolt 004-003 line 463-471 explicitly defers the celebration animation. This intent does not introduce it.
- **Real-time polling / SSE / WebSocket** — no new live-update transport. Citizens see the resolution when they next load `/reports/[id]`.
- **Bulk photo upload, photo editing, photo annotations** — single-image upload only, as the existing endpoints already enforce.
- **Dispatcher-side filtering of the trail marker** — dispatchers still see the raw `after_photo:` marker; the filter is citizen-only.
- **Any change to the four-role model or the WebAuthn-mandatory-for-admin rule.**

---

## Open Questions

All three Checkpoint 1 open questions are now resolved:

| Question | Resolution |
|----------|------------|
| Is crew assignment ward-scoped or department-scoped in the pilot? | **Ward-scoped** (Checkpoint 1, Q1). Picker lists crew whose `homeWardId` matches the ticket's `wardId`. |
| Are there internal trail-note markers other than `after_photo:`? | **No** — `after_photo:` is the only one (Checkpoint 1, Q2). A regression-guard unit test catches any future marker. |
| Do the citizen and crew photo uploads share `Ticket.photoUrls`? | **Yes, same array, no discriminator** (Checkpoint 1, Q3). FR-1 includes a Prisma migration to add the discriminator. |

No remaining open questions. New questions uncovered during the units or construction phase will be appended here as they arise.
