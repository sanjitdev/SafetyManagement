---
stage: plan
bolt: 008-003-crew-after-photo-upload
created: 2026-10-14T18:25:00Z
---

## Implementation Plan: 003-crew-after-photo-upload — Bolt 008-003

### Objective

Land the file-upload half of Intent 008: let a crew member attach
the after-photo as a real file from the native file picker, while
keeping the URL input available as a collapsed power-user override
so the dev-store demo path keeps working.

### Deliverables

- A crew after-photo upload helper that accepts either a file or a
  URL, validates both, and posts the result to the existing crew
  photos endpoint.
- The crew ticket-detail page gains a real file input as the
  primary after-photo source.
- The existing URL input is preserved but collapsed behind a
  disclosure so it no longer dominates the surface.
- Localized copy for the new upload controls and for the invalid
  file error.
- A unit test covering the validation and upload branches, and a
  Playwright spec driving the real file picker end to end.

### Dependencies

- `app/api/v1/crew/tickets/[id]/photos/route.ts` - the existing
  endpoint the helper posts to. It already stores a photo as a URL
  string and writes the `after_photo:` trail marker, so the v1
  storage shape and the marker format are unchanged.
- `lib/i18n/keys.ts` - the new upload copy keys are registered by
  Bolt 008-001; this bolt only uses them.
- `tests/fixtures/` - the directory the new fixture files land in.
- The citizen photo route's MIME allow-list and size cap, which
  this bolt mirrors.

### Technical Approach

The v1 schema stores photos as URL strings rather than file bytes, so
the file path is resolved on the client: the helper reads the
chosen file into a data URL and posts the same `{ url }` body the
server already accepts. That keeps the server contract and the v1
production schema untouched while giving the crew a native file
picker.

The helper is a small pure module with three separable parts - a MIME
gate, an input-shape check, and a file reader - plus a high-level
entry point that composes them and posts to the endpoint. The
high-level entry point accepts an injectable fetch so the unit test
never touches the network.

### Acceptance Criteria

- [x] A crew member can attach the after-photo from the native file
      picker on the ticket-detail page.
- [x] The URL input remains reachable as a collapsed power-user
      override.
- [x] Only JPEG, PNG, and WebP files up to 5 MB are accepted.
- [x] A non-http(s) URL and a whitespace-only URL are rejected with
      a distinct error code each.
- [x] The after-photo appears on the citizen's report detail page
      after the upload.
- [x] The upload helper's branches are covered by a unit test.
