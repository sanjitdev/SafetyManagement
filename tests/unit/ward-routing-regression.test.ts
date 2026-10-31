/**
 * Vitest: regression guard for the ward-routing bug that made a
 * citizen's report invisible to the dispatcher and crew meant to
 * handle it.
 *
 * ## The bug
 *
 * `app/api/v1/auth/login/route.ts` minted the session with:
 *
 * ```ts
 * wardId: user.role === 'citizen' || user.role === 'admin' ? null : user.wardId,
 * ```
 *
 * so a CITIZEN's session carried no ward — even though the citizen
 * has a registered home ward (`User.wardId`; the seed puts Rahim in
 * Ward 14, the ward the persona spec says he lives in).
 *
 * `GET /api/report/bootstrap` then fell through to its fallback:
 *
 * ```ts
 * ward: session.wardId
 *   ? await db.ward.findUnique(...)
 *   : await db.ward.findFirst({ where: { cityId }, orderBy: { number: 'asc' } }),
 * ```
 *
 * → the FIRST ward by number (Ward 1). The report draft's `wardId`
 * became Ward 1, the ticket was filed under Ward 1, and the
 * dispatcher/crew scoped to the citizen's actual ward (Ward 14) never
 * saw it in their queue. The chain simply died: the citizen's report
 * could not be routed, assigned, worked, or resolved.
 *
 * Five OTHER session-minting paths already bound `user.wardId`
 * (register, verify-otp, dev issue-session, dev bootstrap-admin, the
 * in-memory dev store), so the behaviour depended on WHICH login
 * surface the citizen used. Password login was the only path that
 * dropped the ward.
 *
 * ## The second bug
 *
 * `POST /api/tickets` created the `DedupFlag` for a citizen-declined
 * dedup match with the ward of the NEW ticket but the department of
 * the ORIGINAL ticket's category:
 *
 * ```ts
 * wardId: created.wardId,                        // new ticket's ward
 * departmentId: originalCategory?.departmentId,  // original ticket's dept
 * ```
 *
 * `requireScope` demands an EXACT match on both fields, and the
 * dispatcher's dedup queue filters on the same pair. A flag built
 * from two different tickets matched no dispatcher at all: it was
 * listed for nobody and could not be confirmed or dismissed by
 * anyone who could see it. Both fields now come from the flagged
 * ticket — the one the dispatcher actually has to act on.
 *
 * These tests pin all three fixes so the regression cannot come back
 * silently.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const LOGIN_ROUTE = readFileSync(
  path.join(process.cwd(), 'app', 'api', 'v1', 'auth', 'login', 'route.ts'),
  'utf8',
);
const BOOTSTRAP_ROUTE = readFileSync(
  path.join(process.cwd(), 'app', 'api', 'report', 'bootstrap', 'route.ts'),
  'utf8',
);
const TICKETS_ROUTE = readFileSync(
  path.join(process.cwd(), 'app', 'api', 'tickets', 'route.ts'),
  'utf8',
);

describe('password login binds the citizen ward', () => {
  it('does not null the ward for a citizen session', () => {
    // The old form lumped `citizen` in with `admin`:
    //   wardId: user.role === 'citizen' || user.role === 'admin' ? null : user.wardId
    expect(LOGIN_ROUTE).not.toMatch(
      /wardId:\s*user\.role\s*===\s*'citizen'\s*\|\|\s*user\.role\s*===\s*'admin'/,
    );
  });

  it('binds the ward for every role except admin', () => {
    expect(LOGIN_ROUTE).toMatch(/wardId:\s*user\.role\s*===\s*'admin'\s*\?\s*null\s*:\s*user\.wardId/);
  });

  it('still keeps the citizen out of any department', () => {
    // A citizen is not on a department's roster. The department must
    // stay null even now that the ward is bound.
    expect(LOGIN_ROUTE).toMatch(
      /departmentId:\s*\n?\s*user\.role\s*===\s*'citizen'\s*\|\|\s*user\.role\s*===\s*'admin'\s*\?\s*null\s*:\s*user\.departmentId/,
    );
  });
});

describe('the report bootstrap reads the session ward', () => {
  it('still falls back to the first ward by number when the session has none', () => {
    // The fallback stays — it is the right behaviour for a session
    // genuinely without a ward (e.g. an admin probing the endpoint).
    // What must not happen is the FALLBACK being taken for a citizen
    // who HAS a ward, which is what the login bug caused.
    expect(BOOTSTRAP_ROUTE).toMatch(/session\.wardId\s*\?/);
    expect(BOOTSTRAP_ROUTE).toMatch(/orderBy:\s*\{\s*number:\s*'asc'\s*\}/);
  });
});

describe('the dedup flag scope comes from one ticket', () => {
  it('takes the department from the flagged ticket, not the original', () => {
    // The old form denormalised the department from the ORIGINAL
    // ticket's category while taking the ward from the NEW ticket:
    //   wardId: created.wardId,
    //   departmentId: originalCategory?.departmentId ?? null,
    // Mixing the two produced a flag no dispatcher could scope to.
    expect(TICKETS_ROUTE).not.toMatch(
      /departmentId:\s*originalCategory\?\.departmentId/,
    );
  });

  it('reads the flagged ticket category for the department', () => {
    expect(TICKETS_ROUTE).toMatch(/category\.findUnique\(\{\s*\n?\s*where:\s*\{\s*id:\s*created\.categoryId/);
    expect(TICKETS_ROUTE).toMatch(/departmentId:\s*flaggedCategory\?\.departmentId\s*\?\?\s*null/);
  });

  it('keeps the ward and the department on the same ticket', () => {
    const flagBlock = TICKETS_ROUTE.slice(
      TICKETS_ROUTE.indexOf('db.dedupFlag.create'),
      TICKETS_ROUTE.indexOf('db.dedupFlag.create') + 700,
    );
    // Both scope fields must be derived from `created` (the flagged
    // ticket) — never one from `created` and one from `original`.
    expect(flagBlock).toMatch(/wardId:\s*created\.wardId/);
    expect(flagBlock).not.toMatch(/wardId:\s*original\.wardId/);
  });
});

describe('the ticket route validates the ward and category against the city', () => {
  it('rejects a ward that is not in the session city', () => {
    expect(TICKETS_ROUTE).toMatch(/ward_not_in_city/);
    expect(TICKETS_ROUTE).toMatch(/ward\.cityId\s*!==\s*session!\.cityId/);
  });

  it('rejects a category that is not in the session city', () => {
    expect(TICKETS_ROUTE).toMatch(/category_not_in_city/);
    expect(TICKETS_ROUTE).toMatch(/category\.cityId\s*!==\s*session!\.cityId/);
  });
});
