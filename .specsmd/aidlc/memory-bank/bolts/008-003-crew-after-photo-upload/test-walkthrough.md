---
stage: test
bolt: 008-003-crew-after-photo-upload
created: 2026-10-14T20:00:00Z
---

## Test Report: 003-crew-after-photo-upload — Bolt 008-003

### Summary

- **Tests**: 34 new tests in total - 25 unit cases in
  `tests/unit/crew/upload-photo.test.ts` and 9 Playwright cases
  (3 API + 5 UI + 1 visual baseline) in
  `tests/23-crew-after-photo-file-upload.spec.ts`.
- **Coverage**: the upload helper's every branch is covered: the
  MIME allow-list, the size cap, each of the five validation error
  codes, the file-to-data-URL read, the URL-as-is path, file-takes-
  precedence, the non-ok HTTP error path, and the ticket-id path
  encoding. The Playwright spec covers both upload branches, the
  invalid-file rejection, and the citizen's view of the uploaded
  after-photo.
- **Visual baseline**: new file
  `tests-mockups/baselines/23-crew-after-photo-file-upload.spec.ts/crew-after-photo-uploader-390x844.png`
  captures the crew uploader at the mobile viewport.

### Test Files

- [x] `tests/unit/crew/upload-photo.test.ts` - 25 unit cases
  covering the MIME allow-list, the pure input validator, the file
  reader, and the high-level upload helper. Includes: the
  allow-listed MIME types accepted and unknown types rejected; the
  `no_source`, `empty_url`, `invalid_url`, `invalid_file_type`, and
  `file_too_large` error codes; http and https URLs accepted and
  surrounding whitespace trimmed; a file accepted at the size limit
  and an over-sized file rejected; the file reader producing a data
  URL; the high-level helper posting the URL as-is, posting the data
  URL for the file branch, preferring the file when both are
  supplied, returning `http_<code>` on a non-ok response, and
  encoding the ticket id in the path.
- [x] `tests/23-crew-after-photo-file-upload.spec.ts` - 9 Playwright
  cases: 3 API cases (a data-URL after-photo returns 200 and writes
  a trail entry; an http(s) URL returns 200; an invalid URL returns
  400), 5 UI cases (the file picker is the primary surface with the
  URL behind a disclosure; `setInputFiles` plus Submit uploads the
  fixture and the after-photo appears; an unsupported MIME is
  rejected with the localized invalid-file copy; the URL override
  still uploads; the citizen sees the after-photo on their report
  view), and 1 visual baseline comparison at 390x844.
- [x] `tests/fixtures/after-photo.png` - Fixture: a 1x1 transparent
  PNG used as the uploaded after-photo.
- [x] `tests/fixtures/not-an-image.txt` - Fixture: a text file used
  to prove the MIME allow-list rejects a non-image upload.

### Acceptance Criteria Validation

- ✅ **A crew member can attach the after-photo from the native file
  picker**: pinned by the Playwright case
  `UI: setInputFiles + Submit uploads a fixture file -> after-photo
  appears`, which drives the real file input and asserts the photo
  lands on the ticket.
- ✅ **The URL input remains reachable as a collapsed power-user
  override**: pinned by
  `UI: file picker is the v1 surface; URL is behind a <details>
  override` (asserts the file input is present and the URL input is
  inside a disclosure) and by
  `UI: URL override + Submit uploads a URL -> after-photo appears`
  (asserts the override path still works).
- ✅ **Only JPEG, PNG, and WebP files up to 5 MB are accepted**:
  pinned by the unit cases that accept a JPEG at the size limit, a
  PNG and a WebP under the limit, and reject a non-allow-listed MIME
  and an over-sized file.
- ✅ **A non-http(s) URL and a whitespace-only URL are rejected with
  a distinct error code each**: pinned by the unit cases
  `rejects an empty URL`, `rejects a non-URL string`, and
  `rejects a non-http(s) URL`, and by the high-level cases
  `returns invalid_url for a non-URL string` and
  `treats a whitespace-only url as no_source`.
- ✅ **A non-image upload is rejected with the localized copy**:
  pinned by the Playwright case
  `UI: file picker rejects an unsupported MIME (text file) with the
  invalid_file copy`.
- ✅ **The after-photo appears on the citizen's report detail page
  after the upload**: pinned by
  `UI: after a file upload, the citizen sees the after-photo on
  their report view`, and by the API case
  `API: POST after-photo with a data: URL (file branch) -> 200,
  trail entry written`.
- ✅ **The upload helper's branches are covered by a unit test**:
  all 25 unit cases pass; the helper is exercised through an
  injected fetch stub so the suite never touches the network.
- ✅ **The visual baseline is captured and reviewed**: the new
  baseline at 390x844 is a new PNG surfaced in the PR, per
  `team.md` Forbidden.
- ✅ **`npx tsc --noEmit` clean** and the existing unit suite stays
  green: the bolt adds a test file and a new module and changes no
  existing assertion.

### Issues Found

None blocking.

Two notes recorded for follow-up:

1. **The `FileReader` is unavailable in the Node test environment**,
   so the unit test supplies a minimal polyfill. A browser-side read
   failure is surfaced as an invalid file type rather than as a
   distinct error code, so a genuine read failure and a rejected
   MIME type are indistinguishable to the page.
2. **The server route still accepts a URL, not a multipart body.**
   The file path is resolved on the client into a data URL, so the
   "accepts multipart" wording in the story title describes the
   user-facing intent rather than the wire format. The real
   object-storage upload path is a v1.1 follow-up.

### Notes

- The slow-motion demo spec was updated to drive the file picker
  instead of typing a URL, and its full happy-path capture still
  records 21 frames across the citizen, dispatcher, crew, and
  citizen return path.
- A local Playwright config targeting the dev server with server
  reuse was added so the Bolt 007 and 008 specs can run in sequence
  without a restart.
- The bolt added no package dependencies.
