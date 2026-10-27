---
stage: implement
bolt: 008-003-crew-after-photo-upload
created: 2026-10-14T19:45:00Z
---

## Implementation Walkthrough: 003-crew-after-photo-upload — Bolt 008-003

### Summary

Gave the crew after-photo flow a native file picker as its primary
source, and moved the URL input behind a collapsed disclosure so it
stays available as a power-user override. The v1 schema stores
photos as URL strings, so the file path is resolved on the client: a
new upload helper reads the chosen file into a data URL and posts
the same body the existing endpoint already accepts, leaving the
server contract and the v1 storage shape untouched.

### Structure Overview

- **Upload helper** - `lib/crew/upload-photo.ts` is a small pure
  module. It separates the MIME gate, the input-shape check, the
  file reader, and the high-level upload entry point, so the page
  component and the unit test exercise the same code paths.
- **Page** - `app/crew/tickets/[id]/page.tsx` gains a real file
  input as the primary after-photo source. The existing URL input is
  kept but moved inside a disclosure element, so the v1 surface is
  the file picker and the URL path is still one click away.
- **Endpoint** - `app/api/v1/crew/tickets/[id]/photos/route.ts` is
  unchanged. It already accepts a photo as a URL, stores it, and
  writes the stable `after_photo:` trail marker.

### Completed Work

- [x] `lib/crew/upload-photo.ts` - New upload helper. Exposes the
  allowed MIME list and the 5 MB size cap, a MIME gate, an
  input-shape validator that distinguishes a missing source, an
  empty URL, an invalid URL, an invalid file type, and an
  over-sized file, an async file reader that produces a data URL,
  and a high-level upload entry point that validates, reads, and
  posts to the crew photos endpoint with an injectable fetch.
- [x] `app/crew/tickets/[id]/page.tsx` - The file picker is wired
  in as the primary after-photo input, and the URL input is
  collapsed inside a disclosure labelled as the power-user
  override. Both branches call the shared upload helper, and the
  invalid-file error renders localized copy.
- [x] `lib/i18n/keys.ts` - The upload copy keys used by the page
  (the file label, the URL override label, the URL placeholder, and
  the invalid-file error) are consumed from the registry; they were
  registered by Bolt 008-001.
- [x] `tests/unit/crew/upload-photo.test.ts` - New unit test for the
  upload helper's validation and upload branches, using an injected
  fetch stub and a minimal file-reader polyfill.
- [x] `tests/23-crew-after-photo-file-upload.spec.ts` - New
  Playwright spec driving the real file picker end to end.
- [x] `tests/fixtures/after-photo.png` - New fixture: a 1x1
  transparent PNG used as the uploaded after-photo.
- [x] `tests/fixtures/not-an-image.txt` - New fixture: a text file
  used to prove the MIME allow-list rejects non-image uploads.
- [x] `tests-mockups/baselines/23-crew-after-photo-file-upload.spec.ts/crew-after-photo-uploader-390x844.png`
  - New visual baseline for the crew uploader at the mobile
  viewport.
- [x] `tests/22-slow-motion-e2e-demo.spec.ts` - Updated to drive
  the file picker instead of typing a URL.
- [x] `playwright.config.local.ts` - New local Playwright config
  targeting the dev server on port 3100 with server reuse, so the
  Bolt 007 and 008 specs can run without a restart.

### Key Decisions

- **Resolve the file on the client, not by widening the server
  contract**: the v1 schema stores photos as URL strings, so reading
  the file into a data URL and posting the existing `{ url }` body
  gives the crew a file picker without a schema migration, a new
  upload pipeline, or a change to the v1 production contract. The
  real object-storage upload path stays available as the v1.1
  follow-up.
- **Keep the URL input, but collapse it**: the URL path is what the
  dev-store demo and the seed data rely on. Moving it behind a
  disclosure preserves that path without letting it dominate the v1
  surface.
- **Validate MIME on the browser-reported type, not the file
  extension**: the file picker populates the type from OS metadata,
  so a renamed binary is rejected rather than accepted on the
  strength of its name.
- **Inject the fetch into the high-level helper**: the unit test
  then never touches the network, and the validation branches are
  testable without a server.
- **Mirror the citizen route's allow-list and cap exactly**: jpeg,
  png, and webp at 5 MB. Keeping the two routes identical avoids a
  second set of limits to reason about.

### Deviations from Plan

- **The server route does not accept multipart.** The plan proposed
  widening `app/api/v1/crew/tickets/[id]/photos/route.ts` to accept
  a multipart file part. The shipped change instead keeps the route
  contract unchanged and resolves the file on the client. The
  visible outcome the plan wanted - a real file picker on the v1
  surface - is delivered, but the story title's "accepts multipart"
  describes the user-facing intent rather than the wire format.
- **No `crew.photo.file.label` key was added by this bolt.** That
  key, along with the URL override, placeholder, and invalid-file
  error keys, was registered by Bolt 008-001 and is only consumed
  here.

### Dependencies Added

None. The bolt uses the browser `FileReader` and `File` APIs, which
  are platform globals, plus the already-installed `vitest` and
  `playwright` dev dependencies.

### Developer Notes

- The helper returns a discriminated result rather than throwing, so
  the page can render each error case with its own localized copy
  and the unit test can assert on the error code directly.
- A non-ok HTTP response surfaces as an `http_<status>` error code
  rather than a validation code, so the page can tell "the file was
  rejected" apart from "the server said no".
- The ticket id is URL-encoded in the request path, so a ticket id
  containing a slash cannot break out of the path segment.
- The file reader is unavailable in the Node test environment, so the
  unit test supplies a minimal polyfill. A browser-side read failure
  is surfaced as an invalid file type rather than a distinct code.
