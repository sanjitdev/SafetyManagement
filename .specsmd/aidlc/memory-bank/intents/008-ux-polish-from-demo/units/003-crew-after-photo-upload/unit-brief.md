---
unit: 003-crew-after-photo-upload
intent: 008-ux-polish-from-demo
created: 2026-10-14T18:40:00Z
---

# Unit 003 — Crew After-photo File Upload (unit-brief)

## Goal

Land Bolt 008-003. The bolt.md is the canonical plan;
this brief is the unit-level context the bolt inherits.

## Files (canonical list — confirmed against the bolt.md)

- `app/api/v1/crew/tickets/[id]/photos/route.ts` — widen
  input shape.
- `app/crew/tickets/[id]/page.tsx` — file input +
  collapsible URL override.
- `lib/crew/upload-photo.ts` — new / extended service
  helper.
- `tests/unit/crew/upload-photo.test.ts` — new unit test.
- `tests/23-crew-after-photo-file-upload.spec.ts` — new
  Playwright E2E.

## Story

### 001-crew-after-photo-accepts-multipart

**As a** field crew member with a phone camera
**I want** to attach the after-photo as a real file
**So that** I don't have to upload the photo to a URL
host first and then paste it.

**Given** the existing crew after-photo route only
accepts `{ photoUrl: string }`
**When** the crew member opens the after-photo control
**Then** I see a real file input (the URL input is
collapsed under a `Power user: paste a URL` disclosure).

And **Given** a real file is attached
**When** the crew member presses Submit
**Then** the file is uploaded via
`POST /api/v1/crew/tickets/[id]/photos`
(multipart `photo=<File>`), the response includes the
new photo URL, the trail gets an `after_photo:<url>`
entry, and the after-photo is visible on the citizen
detail page.

## Acceptance

See `bolt.md` for the canonical acceptance criteria.

## Notes

The MIME / size limits match the existing citizen photo
route (verified at bolt start).

The 4 i18n keys (`crew.photo.file.label`,
`crew.photo.url.override`,
`crew.photo.url.placeholder`, `crew.photo.submit`) are
registered in Bolt 008-001; this bolt uses them.

The slow-motion demo (`tests/22-slow-motion-e2e-demo.spec.ts`)
re-run drives the file upload via `setInputFiles(...)`
(no URL typing).
