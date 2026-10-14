---
intent: 007-citizen-resolution-visibility
phase: inception
status: in-progress
created: 2026-10-13T20:10:00Z
updated: 2026-10-13T20:10:00Z
---

# Units: Citizen Resolution Visibility

## Decomposition Strategy

The intent is decomposed along two axes:

1. **Citizen-side serializer first (foundation)** — the Prisma
   migration that splits photos by `uploadedByRole` (FR-1) and the
   trail-marker filter at the citizen serializer (FR-2) both touch
   the same file (`lib/serializers/ticket.ts`). They land together
   in Bolt `007-001` because the serializer must commit one new
   shape in a single PR — splitting it would leave the citizen
   branch inconsistent with itself.
2. **Dispatcher crew picker as a self-contained feature** — FR-3
   is a new dispatcher-side write path (endpoint + UI control +
   audit), independent of the serializer work. It lands in Bolt
   `007-002`.

This yields **3 Units**:

| # | Unit | FRs | Bolt |
|---|------|-----|------|
| 001 | Citizen Photo Split | FR-1 | Bolt 007-001 (foundation, with Unit 002) |
| 002 | Trail Marker Filter | FR-2 | Bolt 007-001 (foundation, with Unit 001) |
| 003 | Dispatcher Crew Picker | FR-3 | Bolt 007-002 |

## Requirement-to-Unit Mapping

- **FR-1**: Before/after photo split on the citizen report detail
  page → `001-citizen-photo-split`
- **FR-2**: Filter `after_photo:` marker from the citizen-visible
  status trail → `002-trail-marker-filter`
- **FR-3**: Dispatcher crew picker on the dispatcher ticket-detail
  page → `003-dispatcher-crew-picker`

Every FR is accounted for; no FR is split across units.

## Dependency Graph

```
001 (Citizen Photo Split)  ─┐
                            ├── both land in Bolt 007-001
002 (Trail Marker Filter)   ─┘
                                │
                                ▼
                       003 (Dispatcher Crew Picker) ── Bolt 007-002
```

- **001 ⊥ 002**: Both units touch `lib/serializers/ticket.ts`. They
  are parallel within the same bolt (Bolt 007-001); the serializer
  commits in a single PR.
- **001 + 002 → 003**: Bolt 007-002 is independent of the
  serializer changes but may land in either order. The sequence
  below (001+002 first, then 003) keeps the bolt count to two and
  matches the team's per-bolt design-log rhythm.

## Units

### Unit 001 — Citizen Photo Split

- **Type**: Backend-foundation (DDD bolt) — data-model + serializer
- **FRs covered**: FR-1
- **Stories**: ~2
- **Complexity**: Small-to-Medium (Prisma migration, three-branch
  serializer change, page render, i18n labels, full test pyramid)
- **Description**: Add a discriminator to the photo storage so the
  citizen serializer can return `beforePhotoUrls` and
  `afterPhotoUrls` as two separate arrays, and update
  `/reports/[id]` to render them as two labelled groups. The
  migration choice (additive `TicketPhoto` row with
  `uploadedByRole` + `uploadedAt` vs split columns
  `beforePhotoUrls` / `afterPhotoUrls`) is finalized in the
  unit-brief's Implementation Notes.
- **Acceptance**:
  - All FR-1 acceptance criteria met.
  - Prisma migration is backwards-compatible: existing dev-store
    rows continue to read as a valid citizen surface (citizen
    photos land in `beforePhotoUrls`).
  - All three serializer branches (citizen / non-citizen / public)
    expose `beforePhotoUrls` and `afterPhotoUrls`.
  - The page renders the two groups in both English and Bangla.
  - Unit + Playwright E2E + visual baseline are present.
- **File**: `units/001-citizen-photo-split/unit-brief.md`

### Unit 002 — Trail Marker Filter

- **Type**: Backend-foundation (DDD bolt) — serializer-only + i18n
- **FRs covered**: FR-2
- **Stories**: ~1
- **Complexity**: Small (single-file serializer change + i18n key +
  regression-guard unit test)
- **Description**: Filter the raw `after_photo:<url>` marker from
  the citizen serializer's trail render. The marker stays in the
  underlying `TicketTrailEntry` rows (the audit pipeline greps on
  it). The citizen branch either omits these entries or replaces
  their `note` with the localized "After photo added" string.
  Add a regression-guard unit test that asserts no
  `^[a-z_]+:` marker-shaped string reaches the citizen branch —
  so any future marker fails the build until explicitly handled.
- **Acceptance**:
  - All FR-2 acceptance criteria met.
  - The replacement label "After photo added" (English + Bangla)
    is present in `lib/i18n/keys.ts`.
  - The regression-guard unit test runs on existing trail fixtures
    and the synthetic `after_photo:` entry, and passes.
  - The existing trail tests under `tests/unit/serializers/`
    continue to pass.
  - Unit-only test pyramid (no new E2E — FR-2 has no new
    user-visible control).
- **File**: `units/002-trail-marker-filter/unit-brief.md`

### Unit 003 — Dispatcher Crew Picker

- **Type**: Frontend feature (simple-construction bolt) — endpoint
  + UI control + audit
- **FRs covered**: FR-3
- **Stories**: ~2
- **Complexity**: Medium (new endpoint with server-side ward
  gate + new UI control on an existing page + audit + full test
  pyramid)
- **Description**: Add a dispatcher-only write endpoint (sibling
  route OR guarded extension of the existing dispatcher PATCH)
  that lets a dispatcher set or clear `assignedCrewId` on a
  ticket. Add the matching UI control on
  `/dispatcher/tickets/[id]` that lists crew users whose
  `homeWardId` matches the ticket's `wardId`. Every write goes
  through `writeAudit(...)` and writes an audit row with
  before/after `assignedCrewId` (matching the existing
  admin-only pure-reassign pattern). The admin-only
  pure-reassign path is preserved (no role-escalation).
- **Acceptance**:
  - All FR-3 acceptance criteria met.
  - Server-side ward-scope check: the chosen crew member's
    `homeWardId` MUST equal the ticket's `wardId`, else `403`
    `role_cannot_assign_cross_ward`.
  - The existing dispatcher PATCH route's behaviour for
    `wardId` / `categoryId` / `internalNote` is unchanged.
  - The admin-only pure-reassign path is unchanged.
  - Unit + Playwright E2E + visual baseline are present.
- **File**: `units/003-dispatcher-crew-picker/unit-brief.md`

## Stories Per Unit (Summary)

| Unit | Stories |
|------|---------|
| 001 | S-001.1: Prisma migration + serializer exposes `beforePhotoUrls` / `afterPhotoUrls`<br>S-001.2: `/reports/[id]` renders two labelled photo groups |
| 002 | S-002.1: Citizen trail filter + i18n key + regression-guard test |
| 003 | S-003.1: `PATCH /api/v1/dispatcher/tickets/[id]/assign-crew` endpoint with ward gate + audit<br>S-003.2: Dispatcher ticket-detail picker UI + visual baseline |

**Total: 5 stories** across 3 units → **2 bolts**.

## Bolt Plan (Summary; full details in `bolts/007-001-...` and `bolts/007-002-...`)

| Bolt | Units | Stories | Complexity |
|------|-------|---------|------------|
| 007-001 | 001 + 002 | 3 stories | Small-to-Medium — one Prisma migration, one three-branch serializer change, one serializer-only filter, one page render, full test pyramid |
| 007-002 | 003 | 2 stories | Medium — one new endpoint, one new UI control, audit + full test pyramid |

## Open Items

- The FR-1 Prisma migration shape (additive `TicketPhoto` row with
  `uploadedByRole` + `uploadedAt` vs split columns `beforePhotoUrls`
  / `afterPhotoUrls`) is finalized in Unit 001's unit-brief
  Implementation Notes. Both are acceptable per FR-1's acceptance
  criteria; the choice is one of code-style cleanliness vs query
  ergonomics. The unit-brief makes the call.
- The FR-3 endpoint shape (sibling route `PATCH
  /api/v1/dispatcher/tickets/[id]/assign-crew` vs a guarded
  extension of the existing dispatcher PATCH) is finalized at
  Unit 003's bolt stage. The unit-brief flags both.
- The Playwright visual-baseline slots for FR-1's grouped photo
  grid and FR-3's picker open + selected states are recorded at
  bolt-plan stage.
