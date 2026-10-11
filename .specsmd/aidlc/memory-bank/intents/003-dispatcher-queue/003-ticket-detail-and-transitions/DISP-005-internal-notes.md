---
story: DISP-005-internal-notes
unit: 003-ticket-detail-and-transitions
intent: 003-dispatcher-queue
phase: construction
status: done
created: 2026-10-11T23:55:00Z
updated: 2026-10-12T00:30:00Z
---

# Story: DISP-005 — Internal notes (dispatcher-only field)

## Given / When / Then

### Acceptance 1 — Internal note write

**Given** a dispatcher session
**When** the dispatcher types into the
"Internal note" textarea on
`/dispatcher/tickets/[id]` and clicks
Save
**Then** the ticket's `internalNote`
updates; an `AuditEntry` is written
with
`action: 'internal_note'`,
`beforeValue: { internalNote: <old> }`,
`afterValue: { internalNote: <new> }`;
the textarea re-renders with the saved
value (success state).

### Acceptance 2 — Internal note hidden from citizen

**Given** a ticket with
`internalNote = '...hydrant clearance in
alley'`
**When** the citizen (Reporter) opens
`/reports/[id]`
**Then** the `internalNote` is NOT
visible anywhere on the page
(no field, no rendered value, not even
an empty-string placeholder).

### Acceptance 3 — Internal note visible to all dispatcher-scoped users

**Given** a dispatcher in ward_14
**When** another dispatcher in
`ward_15 / dept_streetlight` (same
department, different ward) opens
`/dispatcher/tickets/[id]`
**Then** they CAN read the
`internalNote` (the dispatcher's
serializer exposes it for any
authenticated dispatcher role; the
field is dispatcher-only, not
dispatcher-instance-only).

### Acceptance 4 — Empty internal note allowed

**Given** a ticket with no
`internalNote`
**When** the dispatcher saves an empty
note
**Then** the API persists
`internalNote: ''`; the audit entry
captures the empty save (empty string
is a valid value — clearing the note
is recorded).

### Acceptance 5 — Internal note alongside reassign

**Given** the dispatcher changes BOTH
the ward dropdown AND the internal
note in one save
**When** the Save button is clicked
**Then** the API applies BOTH changes
in one transaction; TWO `AuditEntry`
rows are written atomically (one for
`reassign`, one for `internal_note`).

## Technical Notes

- The internal note is exposed via the
  dispatcher serializer branch of
  `serializeTicketForRole` (already in
  place; the citizen branch omits the
  field entirely).
- The PATCH endpoint accepts
  `{ wardId?, categoryId?, internalNote? }`
  all optional; missing keys are not
  applied; `internalNote: ''` is valid
  (clearing).
- The textarea is a controlled
  component; Save button is disabled
  until there is a diff vs the loaded
  value (UX nicety, not a security
  requirement).
- Audit entries for `internal_note`
  include the full
  `beforeValue` and `afterValue` (the
  team.md Mandated "every state change
  writes an `AuditEntry`" applies to
  internal notes too).
- Audit entries are written in
  separate `AuditEntry` rows so the
  trail and the audit log remain
  linear and per-field; the dispatcher's
  detail page may render a combined
  "history" view or keep them separate.
- The internal note is NOT visible to
  crew (Intent 004 — deferred). It is
  dispatcher-only in v1; admin reads it
  from the admin console (Intent 005 —
  deferred).

## Out of Scope

- Ticket detail rendering itself
  (DISP-003).
- Reassign dropdowns (DISP-004).
- Crew-side view of the internal note
  (Intent 004 — deferred).
- Markdown / rich-text formatting on
  the note (plain text only in v1).
- Note threading / multiple notes
  per ticket (one `internalNote` field
  per ticket; the audit log keeps the
  full history).

## Dependencies

- Intent 001 (Unit 001) — `Ticket` model
  already has `internalNote` column.
- Intent 001 (Unit 001) —
  `serializeTicketForRole` (dispatcher
  branch exposes `internalNote`; citizen
  branch omits it).
- Intent 003 (Unit 001) — guards.
- DISP-003 — the page this textarea
  lives on.

## Cross-references

- `app/api/v1/dispatcher/tickets/[id]/route.ts` —
  new API (PATCH).
- `app/dispatcher/tickets/[id]/page.tsx` —
  new page (internal note textarea
  section).
- `lib/platform/audit.ts` —
  `writeAudit(...)` (inherited).
- `lib/serializers/ticket.ts` — dispatcher
  branch (inherited; exposes
  `internalNote`).
- `tests/11-dispatcher-detail-light.spec.ts` —
  Playwright route spec covers the
  internal-note acceptance.
- `tests/unit/serializers.test.ts` —
  citizen branch omits `internalNote`
  (regression coverage; this bolt may
  add a test case).
