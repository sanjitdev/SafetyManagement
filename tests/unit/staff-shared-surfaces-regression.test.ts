/**
 * Vitest: regression guard for the staff-role 403 on the shared
 * citizen surfaces.
 *
 * ## The bug
 *
 * `lib/role-home.ts` classifies `/home`, `/feed`, `/reports` and
 * `/splash` as SHARED surfaces — "every role may read" — and
 * `roleCanVisit` honours that for a `?next=` deep link.
 *
 * But `/home` and `/reports` read their city configuration from
 * `GET /api/report/bootstrap`, which is the REPORT FORM's bootstrap
 * and is deliberately citizen-only:
 *
 * ```ts
 * if (session.role !== 'citizen') {
 *   return NextResponse.json({ error: 'citizen_only' }, { status: 403 });
 * }
 * ```
 *
 * So a dispatcher who followed a deep link to `/home` or `/reports`
 * got a 403 from that call, the page set its error state, and the
 * surface the authorization model said was shared was broken for every
 * staff role.
 *
 * This is the SAME bug class as Bolt 008-012 (which fixed it for
 * `/feed` by moving the city config into `/api/v1/activity/public`).
 * The fix simply had not been applied to `/home` and `/reports`.
 *
 * ## The fix
 *
 * The two pages now read their categories and wards from
 * `/api/v1/activity/public`, which serves every role and already
 * returns both lists alongside the feed. The citizen's own ward comes
 * from the session, which already carries `wardName` / `wardNameBn`.
 *
 * `GET /api/report/bootstrap` KEEPS its citizen-only guard: it is the
 * report form's endpoint, and the OpenAPI contract says "Only
 * citizens file reports". The report flow (`/report/*`) is a
 * citizen-only surface and legitimately uses it.
 *
 * These tests pin both halves, so neither can regress silently:
 *   - the shared pages must NOT call the citizen-only endpoint
 *   - the report flow must STILL call it
 *   - the endpoint must STILL reject staff
 *
 * ## The same bug, one level down: the report DETAIL page
 *
 * `app/reports/[id]/page.tsx` had the same coupling, but as an AUTH
 * GATE rather than a config fetch. It called
 * `/api/report/bootstrap` first and treated a non-OK response as
 * "not signed in":
 *
 * ```ts
 * const authRes = await fetch('/api/report/bootstrap', { credentials: 'include' });
 * if (!authRes.ok) {
 *   setAuthed(false);
 *   return;
 * }
 * ```
 *
 * For a dispatcher that 403s (`citizen_only`), so the page rendered
 * "You need to sign in to view this report." — for EVERY report,
 * even though `GET /api/tickets/:id` authorizes staff by city +
 * ward/department and would have served them the ticket.
 *
 * The ticket endpoint is now the single authority on this page. It
 * already distinguishes 401 (no session → "sign in") from 403 (a
 * session that may not see this ticket → "forbidden"), so the page
 * just renders what the endpoint says.
 *
 * The category name is read off the ticket instead: the serializer
 * already denormalises `categoryName` / `categoryNameBn` onto it
 * (`lib/serializers/ticket.ts`), so the extra category-list fetch was
 * both redundant and the thing that broke staff access.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function read(...segments: string[]): string {
  return readFileSync(path.join(process.cwd(), ...segments), 'utf8');
}

const HOME_PAGE = read('app', 'home', 'page.tsx');
const REPORTS_PAGE = read('app', 'reports', 'page.tsx');
const REPORT_DETAIL_PAGE = read('app', 'reports', '[id]', 'page.tsx');
const BOOTSTRAP_ROUTE = read('app', 'api', 'report', 'bootstrap', 'route.ts');
const TICKET_BY_ID_ROUTE = read('app', 'api', 'tickets', '[id]', 'route.ts');
const REPORT_LOCATION_PAGE = read('app', 'report', '(create)', 'location', 'page.tsx');

/**
 * Strip comments so a prose mention of an endpoint is not mistaken for
 * a call to it. Both pages explain in a comment WHY they no longer use
 * the citizen-only bootstrap, and those explanations must not fail the
 * "does not call it" assertion.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

describe('the shared citizen surfaces do not call the citizen-only bootstrap', () => {
  it('/home does not fetch /api/report/bootstrap', () => {
    expect(stripComments(HOME_PAGE)).not.toMatch(/['"`]\/api\/report\/bootstrap['"`]/);
  });

  it('/reports does not fetch /api/report/bootstrap', () => {
    expect(stripComments(REPORTS_PAGE)).not.toMatch(/['"`]\/api\/report\/bootstrap['"`]/);
  });

  it('/home reads the city config from the role-agnostic public feed', () => {
    expect(stripComments(HOME_PAGE)).toMatch(/['"`]\/api\/v1\/activity\/public/);
  });

  it('/reports reads the city config from the role-agnostic public feed', () => {
    expect(stripComments(REPORTS_PAGE)).toMatch(/['"`]\/api\/v1\/activity\/public/);
  });

  it('/home takes the user ward from the session, not from a second fetch', () => {
    // The session already carries wardName / wardNameBn, so the page
    // must not need the bootstrap's `ward` field for it.
    expect(stripComments(HOME_PAGE)).toMatch(/session\?\.wardName/);
  });

  it('/reports uses the ticket row own ward, with the city ward list as fallback', () => {
    expect(stripComments(REPORTS_PAGE)).toMatch(/wardName:\s*t\.wardName\s*\?\?/);
  });
});

describe('the report flow still uses the report bootstrap', () => {
  it('/report/location fetches /api/report/bootstrap', () => {
    // The report form is a CITIZEN-ONLY surface (see
    // `CITIZEN_ONLY_SURFACES` in lib/role-home.ts), so it is the one
    // place the citizen-only endpoint is correct.
    expect(stripComments(REPORT_LOCATION_PAGE)).toMatch(
      /['"`]\/api\/report\/bootstrap['"`]/,
    );
  });
});

/**
 * The report DETAIL page (`/reports/:id`) is under the SHARED
 * `/reports` prefix, so every role may open it. It used to gate
 * itself on `/api/report/bootstrap` — the citizen-only report-form
 * bootstrap — and treated a non-OK response as "not signed in". A
 * dispatcher therefore got "You need to sign in to view this report."
 * for every report, even though `GET /api/tickets/:id` authorizes
 * staff perfectly well.
 *
 * The ticket endpoint is now the single authority: it distinguishes
 * 401 (no session → sign in) from 403 (a session that may not see
 * this ticket → forbidden).
 */
describe('the shared report detail page does not gate on the citizen-only bootstrap', () => {
  it('/reports/:id does not fetch /api/report/bootstrap', () => {
    expect(stripComments(REPORT_DETAIL_PAGE)).not.toMatch(
      /['"`]\/api\/report\/bootstrap['"`]/,
    );
  });

  it('/reports/:id reads the ticket from the role-aware ticket endpoint', () => {
    expect(stripComments(REPORT_DETAIL_PAGE)).toMatch(/['"`]\/api\/tickets\/\$\{id\}/);
  });

  it('/reports/:id reads the category name off the ticket, not a category list', () => {
    // The serializer already denormalises categoryName /
    // categoryNameBn onto the ticket (lib/serializers/ticket.ts), so
    // a second category-list fetch is both redundant and the thing
    // that broke staff access.
    expect(stripComments(REPORT_DETAIL_PAGE)).toMatch(/categoryLabel\(ticket,/);
  });

  it('/reports/:id maps 401 to "sign in" and 403 to "forbidden"', () => {
    // The two states must stay distinct: a 401 means there is no
    // session; a 403 means there IS one but it may not see this
    // ticket. Collapsing them (the old behaviour) is what told a
    // dispatcher to sign in.
    expect(stripComments(REPORT_DETAIL_PAGE)).toMatch(
      /res\.status\s*===\s*401[\s\S]{0,160}setAuthed\(false\)/,
    );
    expect(stripComments(REPORT_DETAIL_PAGE)).toMatch(
      /res\.status\s*===\s*403[\s\S]{0,160}setError\('forbidden'\)/,
    );
  });

  it('/reports/:id hides the citizen-only write affordances from staff', () => {
    // POST /api/tickets/:id/feedback and DELETE
    // /api/tickets/:id/photos/:idx both enforce
    // `requireRole(session, 'citizen')`. Offering them to a staff
    // viewer would render a button that can only fail.
    expect(stripComments(REPORT_DETAIL_PAGE)).toMatch(/isCitizen\s*&&\s*\(/);
    expect(stripComments(REPORT_DETAIL_PAGE)).toMatch(
      /ticket\.status\s*===\s*'resolved'\s*&&\s*isCitizen/,
    );
  });
});

describe('the ticket endpoint keeps its per-role authorization', () => {
  it('rejects an unauthenticated request with 401', () => {
    expect(TICKET_BY_ID_ROUTE).toMatch(/not_authenticated[\s\S]{0,80}status:\s*401/);
  });

  it('scopes dispatcher and crew reads by ward / department', () => {
    expect(TICKET_BY_ID_ROUTE).toMatch(
      /session\.role\s*===\s*'dispatcher'\s*\|\|\s*session\.role\s*===\s*'crew'/,
    );
    expect(TICKET_BY_ID_ROUTE).toMatch(/requireScope\(/);
  });

  it('scopes citizen reads to their own reports', () => {
    expect(TICKET_BY_ID_ROUTE).toMatch(
      /session\.role\s*===\s*'citizen'\s*&&\s*ticket\.reporterId\s*!==\s*session\.userId/,
    );
  });
});

describe('the report bootstrap keeps its citizen-only guard', () => {
  it('still rejects a non-citizen session with 403 citizen_only', () => {
    expect(BOOTSTRAP_ROUTE).toMatch(
      /session\.role\s*!==\s*'citizen'[\s\S]{0,120}citizen_only/,
    );
    expect(BOOTSTRAP_ROUTE).toMatch(/status:\s*403/);
  });

  it('still answers an unauthenticated request with 401', () => {
    expect(BOOTSTRAP_ROUTE).toMatch(/not_authenticated[\s\S]{0,80}status:\s*401/);
  });
});
