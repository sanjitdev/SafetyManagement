/**
 * Vitest: role → home surface (`lib/role-home.ts`).
 *
 * The four-role model has four landing surfaces. Before staff could
 * log in with a password, every caller hard-coded `/home`, so a
 * dispatcher who somehow obtained a session landed on the citizen
 * feed — the wrong surface for their work, and a route they have no
 * business being on.
 *
 * These tests pin the mapping and, importantly, pin the two facts
 * that are easy to break:
 *   - `/admin` IS the admin home. `app/admin/page.tsx` is the admin
 *     console; before it existed, `/admin` was a 404 and the admin
 *     home had to be a child (`/admin/tickets`).
 *   - An unknown role falls back to `/home` (the citizen surface),
 *     never to a staff surface — a 403 is worse than a redundant
 *     landing.
 */

import { describe, expect, it } from 'vitest';
import { ROLE_HOME, roleHome } from '@/lib/role-home';

describe('ROLE_HOME', () => {
  it('maps each of the four roles to a surface', () => {
    expect(ROLE_HOME.citizen).toBe('/home');
    expect(ROLE_HOME.dispatcher).toBe('/dispatcher');
    expect(ROLE_HOME.crew).toBe('/crew');
    expect(ROLE_HOME.admin).toBe('/admin');
  });

  it('routes the admin to the `/admin` console index, not a child route', () => {
    // `app/admin/page.tsx` exists, so `/admin` resolves. Pinning it
    // here catches a regression where someone points the admin back
    // at a child route (or deletes the index and leaves the redirect
    // pointing at a 404).
    expect(ROLE_HOME.admin).toBe('/admin');
  });

  it('maps every role to a distinct surface', () => {
    const paths = Object.values(ROLE_HOME);
    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe('roleHome', () => {
  it.each(['citizen', 'dispatcher', 'crew', 'admin'])(
    'returns the %s surface',
    (role) => {
      expect(roleHome(role)).toBe(ROLE_HOME[role as keyof typeof ROLE_HOME]);
    },
  );

  it('falls back to the citizen home for an unknown role', () => {
    expect(roleHome('mayor')).toBe('/home');
    expect(roleHome('')).toBe('/home');
  });

  it('falls back to the citizen home for a null or undefined role', () => {
    expect(roleHome(null)).toBe('/home');
    expect(roleHome(undefined)).toBe('/home');
  });

  it('never returns a staff surface for an unrecognised role', () => {
    // The fallback must be the surface every role can read — sending
    // an unknown role to /dispatcher would bounce them into a 403.
    expect(roleHome('unknown')).not.toBe('/dispatcher');
    expect(roleHome('unknown')).not.toBe('/crew');
    expect(roleHome('unknown')).not.toBe('/admin/tickets');
  });
});
