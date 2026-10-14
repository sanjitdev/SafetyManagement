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
 * Gated by CITYFIX_DEV_PROMOTE_SECRET — same shared-secret header
 * pattern as issue-session / promote-admin / bootstrap-admin.
 * Returns 404 if the env var is unset.
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
