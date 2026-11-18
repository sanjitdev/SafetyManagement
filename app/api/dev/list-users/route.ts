/**
 * POST /api/dev/list-users — list users for the dev login picker.
 *
 * v1.1-launch (2026-10-14) — companion to /api/dev/issue-session.
 * The user opened the Vercel build and /reports was empty because
 * no session cookie was set. The /api/dev/issue-session endpoint
 * needs a userId; this endpoint surfaces a small directory so the
 * companion /dev/login page can render a `<select>` of all users
 * in the caller's city.
 *
 * Gated by CITYFIX_DEV_PROMOTE_SECRET **and** a non-production
 * build — same shared-secret header pattern as issue-session /
 * promote-admin / bootstrap-admin. Returns 404 if the env var is
 * unset, and 404 if `NODE_ENV === 'production'`.
 *
 * The production half of the gate matters here too: this endpoint
 * enumerates every user's id, name, role and phone in the city, and
 * that directory is exactly what an attacker needs to drive
 * `bootstrap-admin` and `issue-session`. In production it must not
 * be reachable at all.
 *
 * The gate is on `NODE_ENV`, NOT on `isDevStore()`: the directory
 * this endpoint returns is only useful against the REAL database —
 * the dev store's persona ids are fixed and already public in the
 * seed. So a dev-store gate would make the endpoint useless where
 * it is wanted and would not have removed the production leak,
 * while a production gate removes exactly the deployment it must
 * never run in.
 *
 * Body: { citySlug?: string, role?: 'citizen'|'dispatcher'|'crew'|'admin' }
 *   - `citySlug` defaults to `dhaka-north`, the v1.1-launch seed city.
 *   - `role` is optional; if omitted, all four roles are returned.
 *
 * Response: { users: Array<{ id, name, role, phone, cityId, wardId, departmentId }> }
 *
 * Field shape is the smallest projection needed to populate a
 * dropdown: id is the value, name + role is the label, phone is
 * shown to disambiguate. `passwordHash` is never returned.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db-switch';

const ALL_ROLES = ['citizen', 'dispatcher', 'crew', 'admin'] as const;
type Role = (typeof ALL_ROLES)[number];

function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ALL_ROLES as readonly string[]).includes(value);
}

export async function POST(req: NextRequest) {
  const expected = process.env.CITYFIX_DEV_PROMOTE_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  // The dev routes must not run in a PRODUCTION BUILD — see the
  // route's docblock. The 404 (not 403) also tells a production
  // caller nothing about whether the secret exists.
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const supplied = req.headers.get('x-cityfix-promote-secret');
  if (supplied !== expected) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: { citySlug?: string; role?: string } = {};
  try {
    body = (await req.json()) as { citySlug?: string; role?: string };
  } catch {
    // empty body is fine
  }
  const citySlug = body.citySlug ?? 'dhaka-north';

  const city = await db.city.findUniqueBySlug({ where: { slug: citySlug } });
  if (!city) {
    return NextResponse.json({ error: 'city_not_found' }, { status: 404 });
  }

  // Build a where clause that includes the role filter if provided.
  const where: { cityId: string; role?: string } = { cityId: city.id };
  if (body.role && isRole(body.role)) {
    where.role = body.role;
  }

  const users = await db.user.findMany({ where, orderBy: { name: 'asc' } });

  // Strip the passwordHash (and any other PII we don't want to
  // log to the console / display in the picker). The shape matches
  // the dev-login page's `<option>` value/label needs.
  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role,
      phone: u.phone,
      cityId: u.cityId,
      wardId: u.wardId,
      departmentId: u.departmentId ?? null,
    })),
  });
}
