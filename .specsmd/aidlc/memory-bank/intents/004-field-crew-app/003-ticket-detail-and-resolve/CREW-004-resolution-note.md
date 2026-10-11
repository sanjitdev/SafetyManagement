---
story: CREW-004-resolution-note
unit: 003-ticket-detail-and-resolve
intent: 004-field-crew-app
phase: construction
status: done
created: 2026-10-12T01:30:00Z
updated: 2026-10-12T03:00:00Z
---

# Story: CREW-004 — Resolution Note

## Given / When / Then

### Acceptance 1 — Note stored in the trail entry

**Given** a crew session
**And** a ticket in `in_progress`
**When** the crew member submits a
transition with `toStatus: 'resolved'`
and a `note: 'Replaced the bulb'`
**Then** the API returns `200` and a
new `TicketTrailEntry` is written with
`toStatus = 'resolved'`, `actorId =
session.userId`, and `note = 'Replaced
the bulb'`.

### Acceptance 2 — Note visible to the citizen

**Given** the trail entry from Acceptance 1
**When** the citizen reads the ticket
**Then** the trail entry is visible in
the citizen view's "what the crew did"
list. The note text is the resolution
note. (The crew's `actorId` is
anonymised as "City corporation" per
PLAT-REQ-005 — the citizen does not
see "Rashid", they see "City
corporation".)

### Acceptance 3 — Empty note rejected for `resolved`

**Given** a crew session
**And** a ticket in `in_progress`
**When** the crew member POSTs a
transition with `toStatus: 'resolved'`
and an empty / whitespace-only `note`
**Then** the API returns `400` with
`{ error: 'invalid_input', issues:
[ { code: 'too_small', minimum: 1,
... } ] }`. (The page disables the
"Mark resolved" button when the note
is empty, but the API is the source
of truth — a direct curl call must
also be rejected.)

### Acceptance 4 — Optional for other transitions

**Given** a crew session
**When** the crew member POSTs a
transition with `toStatus:
'in_progress'` (no `note` field, or
empty `note`)
**Then** the API returns `200` and the
transition succeeds with a new trail
entry whose `note` is `null`. (The
note is only required for `resolved`.)

### Acceptance 5 — Max length 1000 chars

**Given** a crew session
**When** the crew member POSTs a
transition with `toStatus: 'resolved'`
and `note: <a string of 1001 chars>`
**Then** the API returns `400` with
`{ error: 'invalid_input' }`. The
Zod schema enforces
`z.string().min(1).max(1000)` for
`resolved` transitions.

### Acceptance 6 — Note visible in the audit trail

**Given** the trail entry from Acceptance 1
**When** an auditor reads the
`AuditEntry` for action
`ticket.transition` on the ticket
**Then** the `afterValue.note` field
contains the resolution note. (The
engine's `writeAudit` call includes
the note; CREW-001's serializer
contract is the same one the
dispatcher uses.)

## Technical Notes

- The note is the **only** required
  field on a `resolved` transition. The
  Zod schema is:
  ```ts
  z.object({
    toStatus: z.enum(['in_progress',
    'resolved', 'cancelled']),
    note: z.string().max(1000).optional()
  }).superRefine((data, ctx) => {
    if (data.toStatus === 'resolved' &&
    (!data.note || data.note.trim()
    === '')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['note'],
        message: 'note is required for
        resolved',
      });
    }
  });
  ```
- The page disables "Mark resolved"
  when the note textarea is empty;
  the API is the source of truth for
  the rejection.
- The citizen view of the trail
  renders the note as plain text.
  The note is **not** markdown — the
  crew writes what they did, the
  citizen reads what was done. v1.1
  may add a small list of pre-canned
  phrases (per category) to make
  note entry faster on a phone.

## Out of Scope

- The list page (Unit 002).
- The "Capture after photo" upload
  (separate endpoint; separate
  trail-entry note prefix).
- Markdown rendering or pre-canned
  phrases (v1.1).
- The "Navigate" CTA (CREW-005).

## Dependencies

- Intent 001 (Unit 003) — the
  `transitionTicket` engine. The
  engine already accepts a `note?`
  parameter; this story is purely
  about the API's stricter
  validation for `resolved`.

## Cross-references

- `app/api/v1/crew/tickets/[id]/transition/route.ts`
  (delta) — the Zod schema's
  `superRefine` enforces the
  required-on-resolved rule.
- `app/crew/tickets/[id]/page.tsx`
  (delta) — the "Mark resolved"
  button is disabled when the note
  textarea is empty.
- `lib/i18n/keys.ts` — new
  `crew.detail.resolution_note.*`
  keys (≈3 keys: label / placeholder
  / error).
- `tests/15-crew-ticket-light.spec.ts`
  — Acceptance 3 (empty note → 400)
  + Acceptance 5 (1001 chars → 400)
  are pinned as API checks.
