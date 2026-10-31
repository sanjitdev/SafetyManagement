/**
 * Vitest: a `?next=` deep link must not override the role model.
 *
 * ## The bug this pins
 *
 * The login page routed by role correctly when the user arrived at a
 * bare `/login` — but when the URL carried a `?next=` deep link, the
 * deep link won and the role was ignored entirely:
 *
 * ```ts
 * const explicitNext = params.get('next');
 * router.replace(explicitNext ? nextPath : roleHome(data?.role));
 * ```
 *
 * The public landing's "Log in" CTA links to `/login?next=/report/location`
 * (the citizen report flow), so every persona who signed in from there
 * landed on the citizen's report screen — the admin on a citizen form,
 * the dispatcher on a citizen form. The same shape sent a staff user
 * who deep-linked to `/admin` through `/login?next=/admin` onto
 * `/home`.
 *
 * The earlier fix (`app/page.tsx` routing by `roleHome(session.role)`)
 * did NOT cover this: the site root is a different entry point from
 * the login form. Both had to route by role.
 *
 * ## The rule
 *
 * A deep link is a request to resume somewhere specific. It is not a
 * request to bypass the role model. `resolvePostAuthTarget` honours
 * the deep link only when the signed-in role may legitimately land on
 * that surface.
 */

import { describe, expect, it } from 'vitest';
import {
  ROLE_HOME,
  roleCanVisit,
  roleHome,
  resolvePostAuthTarget,
} from '@/lib/role-home';

describe('roleHome', () => {
  it.each([
    ['citizen', '/home'],
    ['dispatcher', '/dispatcher'],
    ['crew', '/crew'],
    ['admin', '/admin'],
  ] as const)('maps %s to %s', (role, expected) => {
    expect(roleHome(role)).toBe(expected);
  });

  it('falls back to the citizen home for an unknown or missing role', () => {
    expect(roleHome(undefined)).toBe('/home');
    expect(roleHome(null)).toBe('/home');
    expect(roleHome('mayor')).toBe('/home');
  });
});

describe('roleCanVisit', () => {
  it('lets each role reach its own staff surface', () => {
    expect(roleCanVisit('admin', '/admin')).toBe(true);
    expect(roleCanVisit('admin', '/admin/tickets/42')).toBe(true);
    expect(roleCanVisit('dispatcher', '/dispatcher')).toBe(true);
    expect(roleCanVisit('dispatcher', '/dispatcher/monitor')).toBe(true);
    expect(roleCanVisit('crew', '/crew')).toBe(true);
  });

  it('keeps each role out of another role\'s staff surface', () => {
    expect(roleCanVisit('citizen', '/admin')).toBe(false);
    expect(roleCanVisit('dispatcher', '/admin')).toBe(false);
    expect(roleCanVisit('crew', '/admin')).toBe(false);
    expect(roleCanVisit('admin', '/dispatcher')).toBe(false);
    expect(roleCanVisit('citizen', '/crew')).toBe(false);
  });

  it('does not treat a surface prefix as a match for a longer word', () => {
    // `/administrators` must not be read as the `/admin` surface.
    expect(roleCanVisit('admin', '/administrators')).toBe(true);
    expect(roleCanVisit('crew', '/crew-reports')).toBe(true);
  });

  it('keeps staff out of citizen-only surfaces', () => {
    expect(roleCanVisit('admin', '/report/location')).toBe(false);
    expect(roleCanVisit('dispatcher', '/report/location')).toBe(false);
    expect(roleCanVisit('crew', '/report/location')).toBe(false);
    expect(roleCanVisit('admin', '/register')).toBe(false);
    expect(roleCanVisit('admin', '/verify-otp')).toBe(false);
  });

  it('lets a citizen reach the citizen-only surfaces', () => {
    expect(roleCanVisit('citizen', '/report/location')).toBe(true);
    expect(roleCanVisit('citizen', '/register')).toBe(true);
    expect(roleCanVisit('citizen', '/verify-otp')).toBe(true);
  });

  it('lets every role reach the shared surfaces', () => {
    for (const role of ['citizen', 'dispatcher', 'crew', 'admin'] as const) {
      expect(roleCanVisit(role, '/home')).toBe(true);
      expect(roleCanVisit(role, '/feed')).toBe(true);
      expect(roleCanVisit(role, '/reports')).toBe(true);
      expect(roleCanVisit(role, '/splash')).toBe(true);
    }
  });
});

describe('resolvePostAuthTarget', () => {
  it('lands each role on its own home when there is no deep link', () => {
    for (const role of ['citizen', 'dispatcher', 'crew', 'admin'] as const) {
      expect(resolvePostAuthTarget(role, null)).toBe(ROLE_HOME[role]);
      expect(resolvePostAuthTarget(role, undefined)).toBe(ROLE_HOME[role]);
      expect(resolvePostAuthTarget(role, '')).toBe(ROLE_HOME[role]);
    }
  });

  it('honours a deep link into a shared surface', () => {
    expect(resolvePostAuthTarget('admin', '/reports')).toBe('/reports');
    expect(resolvePostAuthTarget('citizen', '/reports')).toBe('/reports');
    expect(resolvePostAuthTarget('crew', '/home')).toBe('/home');
  });

  it('honours a citizen deep link into a citizen-only surface', () => {
    expect(resolvePostAuthTarget('citizen', '/report/location')).toBe(
      '/report/location',
    );
  });

  it('honours a staff deep link into their own staff surface', () => {
    expect(resolvePostAuthTarget('admin', '/admin/tickets')).toBe(
      '/admin/tickets',
    );
    expect(resolvePostAuthTarget('dispatcher', '/dispatcher/monitor')).toBe(
      '/dispatcher/monitor',
    );
  });

  it('refuses a staff deep link into a citizen-only surface', () => {
    // This is the exact failure the user reported: an admin who
    // signed in from the public landing's "Log in" CTA
    // (`/login?next=/report/location`) landed on the citizen's
    // report form.
    expect(resolvePostAuthTarget('admin', '/report/location')).toBe('/admin');
    expect(resolvePostAuthTarget('dispatcher', '/report/location')).toBe(
      '/dispatcher',
    );
    expect(resolvePostAuthTarget('crew', '/report/location')).toBe('/crew');
  });

  it('refuses a citizen deep link into a staff surface', () => {
    expect(resolvePostAuthTarget('citizen', '/admin')).toBe('/home');
    expect(resolvePostAuthTarget('citizen', '/dispatcher')).toBe('/home');
    expect(resolvePostAuthTarget('citizen', '/crew')).toBe('/home');
  });

  it('refuses a cross-role deep link into another staff surface', () => {
    expect(resolvePostAuthTarget('admin', '/dispatcher')).toBe('/admin');
    expect(resolvePostAuthTarget('dispatcher', '/admin')).toBe('/dispatcher');
    expect(resolvePostAuthTarget('crew', '/admin/tickets')).toBe('/crew');
  });

  it('falls back to the citizen home for an unknown role', () => {
    expect(resolvePostAuthTarget('mayor', '/admin')).toBe('/home');
    expect(resolvePostAuthTarget(null, '/admin')).toBe('/home');
  });
});
