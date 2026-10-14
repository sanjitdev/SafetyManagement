---
story: 001-crew-after-photo-accepts-multipart
unit: 003-crew-after-photo-upload
intent: 008-ux-polish-from-demo
status: ready
created: 2026-10-14T18:45:00Z
---

# Story 001 — Crew After-photo Accepts Multipart

## User Story

**As a** field crew member with a phone camera
**I want** to attach the after-photo as a real file
**So that** I don't have to upload the photo to a URL
host first and then paste it.

## Acceptance Criteria

- **Given** the existing crew after-photo route only
  accepts `{ photoUrl: string }`
- **When** the crew member opens the after-photo
  control on `/crew/tickets/[id]`
- **Then** I see a real file input (the URL input is
  collapsed under a `Power user: paste a URL` disclosure)

- **And** a real file is attached
- **When** the crew member presses Submit
- **Then** the file is uploaded via
  `POST /api/v1/crew/tickets/[id]/photos`
  (multipart `photo=<File>`), the response includes
  the new photo URL, the trail gets an
  `after_photo:<url>` entry, and the after-photo is
  visible on the citizen detail page

- **And** the existing URL-only path keeps working
  (the dev-store demo path uses the URL input)

- **And** `tests/unit/crew/upload-photo.test.ts` passes:
  - Multipart path: `photo` file present, `photoUrl`
    absent → `photo` uploaded, audit row written
  - URL path: `photoUrl` present, `photo` absent →
    `photoUrl` uploaded, audit row written
  - Neither: 400 `either_photo_or_photoUrl_required`
  - Both: prefer `photo` (file takes precedence)
  - Cross-crew: 403 `forbidden_role`
  - Out-of-scope ticket: 404 `not_found`

- **And** `tests/23-crew-after-photo-file-upload.spec.ts`
  drives the file upload via `setInputFiles(...)` and
  asserts the after-photo appears on the citizen
  surface

## BDD Scenarios

### Scenario 1: File upload (multipart)

```gherkin
Given the crew is on /crew/tickets/<routed-ticket>
  And the ticket is in state "in_progress"
When the crew attaches a JPG file to the photo input
  And presses Submit
Then the file is uploaded
  And the trail gains an "after_photo:<url>" entry
  And the after-photo is visible on /citizen/reports/<id>
```

### Scenario 2: URL override (power user)

```gherkin
Given the crew is on /crew/tickets/<routed-ticket>
When the crew expands the "Paste a URL" disclosure
  And pastes a valid URL
  And presses Submit
Then the URL is uploaded
  And the trail gains an "after_photo:<url>" entry
  And the after-photo is visible on /citizen/reports/<id>
```

### Scenario 3: Neither path provided

```gherkin
Given the crew presses Submit without attaching a file
  And without pasting a URL
Then the form shows an inline error
  And the API returns 400 "either_photo_or_photoUrl_required"
```

### Scenario 4: Out-of-scope ticket

```gherkin
Given a crew member tries to upload to a ticket
  not assigned to them
Then the API returns 404 "not_found"
```

## Out of Scope

- i18n key registration — Bolt 008-001 (the 4 keys
  `crew.photo.file.label`, `crew.photo.url.override`,
  `crew.photo.url.placeholder`, `crew.photo.submit`
  are registered in 008-001).
- Visible chrome changes (header dedup, display
  names) — Bolt 008-002.
- Bulk photo upload, photo editing, photo
  annotations.
- A different MIME set (the citizen route's MIME
  set is the v1 set).

## Linked Files

- `app/api/v1/crew/tickets/[id]/photos/route.ts`
- `app/crew/tickets/[id]/page.tsx`
- `lib/crew/upload-photo.ts` (new / extended)
- `tests/unit/crew/upload-photo.test.ts` (new)
- `tests/23-crew-after-photo-file-upload.spec.ts` (new)
