/**
 * GET /api/report/bootstrap — return the city config the report flow needs.
 *
 * For dev-store mode, returns the seeded Dhaka North city, the citizen's
 * default ward, and the city's category list. Auth-required: a citizen
 * session must be present.
 *
 * In production, this is replaced by `GET /cities/:id/categories` +
 * `GET /cities/:id/wards` endpoints (deferred to v1.1 — the v1 surface
 * ships the platform layer first).
 */

import { NextResponse } from 'next/server';
import { db, getActiveSession } from '@/lib/db-switch';

export async function GET() {
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }
  if (session.role !== 'citizen') {
    return NextResponse.json({ error: 'citizen_only' }, { status: 403 });
  }
  const city = await db.city.findUnique({ where: { id: session.cityId } });
  if (!city) {
    return NextResponse.json({ error: 'city_not_found' }, { status: 404 });
  }
  const categories = await db.category.findMany({ where: { cityId: session.cityId } });
  return NextResponse.json({
    city: {
      id: city.id,
      name: city.name,
      nameBn: city.nameBn,
      defaultLanguage: city.defaultLanguage,
    },
    ward: session.wardId
      ? await db.ward.findUnique({ where: { id: session.wardId } })
      : await db.ward.findFirst({ where: { cityId: session.cityId }, orderBy: { number: 'asc' } }),
    categories: categories.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      nameBn: c.nameBn,
      narrowCategoryPhotoCap: c.narrowCategoryPhotoCap,
    })),
  });
}
