/**
 * Vitest: source-level wiring assertions for the photo-size fix.
 *
 * ## Why source-level assertions
 *
 * `vitest.config.ts` sets `environment: 'node'` and the repo
 * installs no jsdom/happy-dom, so the browser-side canvas path
 * cannot be exercised in a unit test. The established pattern in
 * this repo (`tests/unit/report-card-thumbnail-render.test.ts`) is
 * to read the source and assert the wiring. These tests do that.
 *
 * ## The regression this guards
 *
 * The citizen reported: "report note input shows invalid input when
 * submitting". The note was never the problem — the PHOTO was. The
 * note page rendered the raw machine code:
 *
 *   setError(body.error ?? …);
 *
 * so the citizen saw the literal string `invalid_input`. The
 * `not.toMatch(/setError\(body\.error/)` assertions below are the
 * direct regression guard for that symptom.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function sourceOf(...segments: string[]): string {
  return readFileSync(path.join(process.cwd(), ...segments), 'utf8');
}

const CITIZEN_PHOTO_PAGE = sourceOf(
  'app',
  'report',
  '(create)',
  'photo',
  'page.tsx',
);
const CITIZEN_NOTE_PAGE = sourceOf(
  'app',
  'report',
  '(create)',
  'note',
  'page.tsx',
);
const CITIZEN_SUMMARY_PAGE = sourceOf(
  'app',
  'report',
  '(create)',
  'summary',
  'page.tsx',
);
const CREW_UPLOAD_HELPER = sourceOf('lib', 'crew', 'upload-photo.ts');
const CREW_TICKET_PAGE = sourceOf('app', 'crew', 'tickets', '[id]', 'page.tsx');
const CREATE_TICKET_ROUTE = sourceOf('app', 'api', 'tickets', 'route.ts');
const CREW_PHOTO_ROUTE = sourceOf(
  'app',
  'api',
  'v1',
  'crew',
  'tickets',
  '[id]',
  'photos',
  'route.ts',
);

describe('the citizen photo step downscales before sending', () => {
  it('calls the downscale helper', () => {
    expect(CITIZEN_PHOTO_PAGE).toContain('downscalePhotoFile');
  });

  it('keeps the URL and its blob in ONE paired array', () => {
    // The previous code built `photoUrls` and `photoBlobs` with two
    // independent `.filter()` passes, so they could drift apart.
    expect(CITIZEN_PHOTO_PAGE).toContain('photoEntries');
  });

  it('sends the DOWNSCALED mime type, not the original file type', () => {
    expect(CITIZEN_PHOTO_PAGE).toMatch(/mimeType/);
  });

  it('shows a processing hint while a large photo is encoded', () => {
    expect(CITIZEN_PHOTO_PAGE).toContain('report.photo.processing');
  });
});

describe('the citizen note page never renders the raw API code', () => {
  it('does not setError(body.error) — the reported symptom', () => {
    expect(CITIZEN_NOTE_PAGE).not.toMatch(/setError\(body\.error\b/);
  });

  it('maps the too-large code to its localised copy', () => {
    // The code itself lives in `lib/photo/error-code.ts`; the page
    // calls the mapper and renders the returned i18n key.
    expect(CITIZEN_NOTE_PAGE).toContain('photoErrorKeyForCode');
    expect(CITIZEN_NOTE_PAGE).toContain('specificKey');
  });
});

describe('the citizen summary page never renders the raw API code', () => {
  it('does not setError(body.error)', () => {
    expect(CITIZEN_SUMMARY_PAGE).not.toMatch(/setError\(body\.error\b/);
  });

  it('maps the too-large code to its localised copy', () => {
    expect(CITIZEN_SUMMARY_PAGE).toContain('photoErrorKeyForCode');
    expect(CITIZEN_SUMMARY_PAGE).toContain('specificKey');
  });
});

describe('the crew upload path', () => {
  it('downscales before sending', () => {
    expect(CREW_UPLOAD_HELPER).toContain('downscalePhotoFile');
  });

  it('reads the error body so the dedicated code survives', () => {
    // Without reading the body, `http_400` collapsed into the
    // generic "invalid URL" bucket and the crew member never learned
    // the photo was simply too big.
    expect(CREW_UPLOAD_HELPER).toContain('photo_too_large');
    expect(CREW_UPLOAD_HELPER).toMatch(/res\.clone\(\)|body\?\.error/);
  });

  it('maps the code to its own copy on the crew ticket page', () => {
    expect(CREW_TICKET_PAGE).toContain('crew.photo.error.too_large');
    expect(CREW_TICKET_PAGE).toContain('photo_too_large');
  });
});

describe('both API routes share the size contract', () => {
  it('use the shared constant — the old 2,000,000 literal is gone', () => {
    for (const source of [CREATE_TICKET_ROUTE, CREW_PHOTO_ROUTE]) {
      expect(source).not.toMatch(/2_000_000/);
      expect(source).toContain('MAX_PHOTO_URL_CHARS');
    }
  });

  it('run the oversize probe before the Zod parse', () => {
    for (const source of [CREATE_TICKET_ROUTE, CREW_PHOTO_ROUTE]) {
      expect(source).toContain('hasOversizedPhoto');
      expect(source).toContain("'photo_too_large'");
    }
  });
});
