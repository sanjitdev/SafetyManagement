/**
 * Vitest: regression guard for the missing report-card thumbnails.
 *
 * ## The bug
 *
 * The citizen's "My reports" list (`app/reports/page.tsx`) mapped
 * `photoUrls` into its client state but the card markup never
 * rendered an image. The card showed only the status pill, category,
 * ward, age and note — no thumbnail at all.
 *
 * The same gap existed on the staff surfaces:
 *
 *   - `app/dispatcher/page.tsx` — the queue row showed a category
 *     glyph and ignored `photoUrls` entirely.
 *   - `app/crew/page.tsx` — the assignment row did the same.
 *
 * The dispatcher monitor (`app/dispatcher/monitor/page.tsx`) DID
 * render a thumbnail, but built the CSS `background` with an
 * unquoted `url(${row.thumbnailUrl})`. An inline `data:image/…` URL
 * contains commas and parentheses that break out of the CSS
 * function, so the square stayed blank.
 *
 * These tests pin the contract at the source level: every list-row
 * surface that receives `photoUrls` must resolve a renderable URL
 * and emit an image element. The DOM render itself is covered by
 * Playwright.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(relative: string): string {
  return readFileSync(path.join(process.cwd(), relative), 'utf8');
}

const REPORTS_PAGE = read('app/reports/page.tsx');
const DISPATCHER_PAGE = read('app/dispatcher/page.tsx');
const CREW_PAGE = read('app/crew/page.tsx');
const MONITOR_PAGE = read('app/dispatcher/monitor/page.tsx');
const CREW_DETAIL_PAGE = read('app/crew/tickets/[id]/page.tsx');

describe('My Reports list — the report card renders a thumbnail', () => {
  it('resolves the thumbnail from the ticket photo list', () => {
    expect(REPORTS_PAGE).toContain('firstRenderablePhotoUrl');
    expect(REPORTS_PAGE).toContain('tkt.photoUrls');
  });

  it('renders an image element for the thumbnail', () => {
    expect(REPORTS_PAGE).toMatch(/<img\b/);
    // The image source is the resolved, renderable URL — not a raw
    // array element that might be an unrenderable value.
    expect(REPORTS_PAGE).toMatch(/src=\{photoUrl!\}/);
  });

  it('falls back to the shared no-photo placeholder', () => {
    expect(REPORTS_PAGE).toContain('PhotoPlaceholder');
  });
});

describe('Dispatcher queue — the queue row renders a thumbnail', () => {
  it('resolves the thumbnail from the ticket photo list', () => {
    expect(DISPATCHER_PAGE).toContain('firstRenderablePhotoUrl');
    expect(DISPATCHER_PAGE).toContain('ticket.photoUrls');
  });

  it('renders an image element for the thumbnail', () => {
    expect(DISPATCHER_PAGE).toMatch(/<img\b/);
    expect(DISPATCHER_PAGE).toMatch(/src=\{photoUrl!\}/);
  });

  it('falls back to the category glyph when there is no photo', () => {
    // The glyph is the shared `CategoryIcon` primitive (Phosphor), not
    // a page-local emoji helper.
    expect(DISPATCHER_PAGE).toContain('CategoryIcon');
    expect(DISPATCHER_PAGE).toContain('slug={ticket.categorySlug}');
  });
});

describe('Crew assignments — the assignment row renders a thumbnail', () => {
  it('resolves the thumbnail from the ticket photo list', () => {
    expect(CREW_PAGE).toContain('firstRenderablePhotoUrl');
    expect(CREW_PAGE).toContain('ticket.photoUrls');
  });

  it('renders an image element for the thumbnail', () => {
    expect(CREW_PAGE).toMatch(/<img\b/);
    expect(CREW_PAGE).toMatch(/src=\{photoUrl!\}/);
  });

  it('falls back to the category glyph when there is no photo', () => {
    expect(CREW_PAGE).toContain('CategoryIcon');
    expect(CREW_PAGE).toContain('slug={ticket.categorySlug}');
  });
});

describe('Dispatcher monitor — the thumbnail background is safely quoted', () => {
  it('does not build an unquoted url(...) background', () => {
    // An unquoted `url(data:image/jpeg;base64,...)` breaks the CSS
    // function — the commas and parentheses inside the data URL
    // terminate it early and the square renders blank.
    expect(MONITOR_PAGE).not.toMatch(/`url\(\$\{row\.thumbnailUrl\}\)/);
  });

  it('builds the background through the shared helper', () => {
    expect(MONITOR_PAGE).toContain('thumbnailBackground(row.thumbnailUrl)');
  });
});

describe('Crew ticket detail — the photo link href is guarded', () => {
  it('does not put a raw photo URL into a clickable href', () => {
    // The photo URL is persisted verbatim and surfaced to staff. A
    // `javascript:` value in an `href` is directly clickable, so the
    // anchor must go through the render-side guard. (`<img src>` is
    // not a script-execution vector, so it does not need the guard.)
    expect(CREW_DETAIL_PAGE).not.toMatch(/href=\{u\}/);
  });

  it('guards the href with the shared photo-URL helper', () => {
    expect(CREW_DETAIL_PAGE).toContain('isRenderablePhotoUrl');
  });
});
