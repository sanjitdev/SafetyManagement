---
id: 005-dispatcher-ticket-detail-picker-ui-and-visual-baseline
unit: 003-dispatcher-crew-picker
intent: 007-citizen-resolution-visibility
status: complete
priority: must
created: 2026-10-13T20:15:00Z
assigned_bolt: 007-002-dispatcher-crew-picker
implemented: true
---

# Story: Dispatcher ticket-detail picker UI + visual baseline

## User Story

**As a** dispatcher triaging a ticket at `/dispatcher/tickets/[id]`
**I want** to pick a crew member from a list scoped to the
ticket's ward, and see the choice persist
**So that** I can hand off the ticket to a specific crew member
without bouncing to an admin, and I can see at a glance who is
assigned.

## Acceptance Criteria

- [ ] **Given** a dispatcher on a ticket-detail page whose ticket is `routed` to ward `ward_14`, **When** the dispatcher opens the page, **Then** the page renders an "Assign crew" picker (heading + control) below the existing ticket metadata. The picker shows the currently-assigned crew member (if any) and lists every crew user whose `homeWardId` equals `ward_14`, with each user's display name in both English and Bangla.
- [ ] **Given** the picker is open with a list of crew users, **When** the dispatcher selects a crew member, **Then** a "Save" action is enabled; selecting the empty option (no crew) clears the assignment.
- [ ] **Given** the dispatcher selects a crew member and clicks "Save", **When** the request lands, **Then** the ticket's `assignedCrewId` updates, the page reflects the new assignment, and the existing "Audit" or history section shows the new audit entry.
- [ ] **Given** the dispatcher selects the empty option and clicks "Save", **When** the request lands, **Then** the ticket's `assignedCrewId` is `null`, the page reflects the cleared assignment, and the audit entry is written.
- [ ] **Given** the dispatcher picks a crew member from a different ward (visible only via the test path; the picker UI does NOT show cross-ward crew), **When** the request lands, **Then** the response is `403` and the page surfaces the error message in the active locale without crashing.
- [ ] **Given** the page is in dark mode or high-contrast mode, **When** the picker renders, **Then** the picker honors the existing token system — no hard-coded colors.
- [ ] **Given** the typed i18n registry check, **When** the bolt runs, **Then** both English and Bangla strings are present in `lib/i18n/keys.ts`:
  - `dispatcher.assignCrew` — English "Assign crew", Bangla "ক্রু নিয়োগ করুন"
  - `dispatcher.noCrewAssigned` — English "No crew assigned", Bangla "কোনো ক্রু নিয়োগ করা হয়নি"
  - `dispatcher.saveAssignment` — English "Save", Bangla "সংরক্ষণ করুন"
- [ ] **Given** a Playwright E2E spec `tests/<NN-dispatcher-crew-picker>.spec.ts`, **When** the spec drives a dispatcher session through the picker (open → select → save), **Then** it asserts:
  - The picker's list is ward-scoped (only `ward_14` crew).
  - The selection persists on page reload.
  - The audit entry is written.
  - The clear-assignment path works.
  - The cross-ward reject path returns `403` and the page surfaces the error without crashing.
- [ ] **Given** a new visual-regression baseline under `tests-mockups/baselines/01-mockups.spec.ts/`, **When** the picker is screenshotted at 1280×800 (desktop) in both "open" and "selected" states, **Then** the new baseline matches the screenshot to within the team's `0.005` tolerance.

## Technical Notes

- The page is `app/dispatcher/tickets/[id]/page.tsx`. The current render is a read-only monospace display of `assignedCrewId`; this story replaces it with a labelled picker.
- The picker should reuse the existing `<select>` primitive OR the `FilterChipGroup` primitive from Intent 006 — whichever fits. A new primitive is not expected.
- The picker is gated to the dispatcher role; crew and citizen surfaces do not gain a new control.
- The picker is a hint, not the trust boundary — the endpoint (`PATCH /api/v1/dispatcher/tickets/[id]/assign-crew`) is the security-critical surface. The picker UI should NOT attempt to filter cross-ward crew at the client (the server-side guard is the source of truth).
- The visual-regression baseline is gated by team.md; the new PNGs MUST be reviewed in the PR.
- The picker respects `prefers-reduced-motion: reduce` (no animations introduced).

## Dependencies

### Requires
- `004-patch-assign-crew-endpoint-with-ward-gate-and-audit` (the endpoint)
- Existing dispatcher auth/role guard.

### Enables
- None.

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Picker list is empty (no crew in the ward) | Picker renders the empty option only; "Save" is disabled until a selection is made. |
| Ticket has no `assignedCrewId` initially | Picker shows the empty option as the current selection. |
| Picker open state on slow network | A skeleton / loading state is acceptable (finalized at bolt-plan). |
| Network error during save | Page surfaces a localized error and keeps the previous selection. |
| Multiple dispatchers open the same ticket and both save | Last-write-wins; both write audit rows. |
| `prefers-reduced-motion: reduce` | No fade/slide animation on picker open. |
| Keyboard navigation | The picker is keyboard-accessible (Tab to focus, Arrow keys to navigate, Enter to select). |

## Out of Scope

- The endpoint — that is story `004-patch-assign-crew-endpoint-with-ward-gate-and-audit`.
- Crew auto-assignment or any logic that picks a crew member without dispatcher input.
- Department-scoped assignment (deferred per Checkpoint 1, Q1).
- A picker that bypasses the ward gate for high-priority tickets (explicit Won't).
- Push notifications to the crew.
- Bulk assign.
- The "Resolved!" celebration surface or any v1.1 follow-up.
