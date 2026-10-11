/**
 * GET /api/v1/admin/cities/[id]/categories
 *   — list categories for a city.
 * POST /api/v1/admin/cities/[id]/categories
 *   — create a category in a city.
 *
 * Bolt 005-002 (Intent 005, Unit 002).
 * Admins bypass the cross-city check
 * (per ADR-006).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, getActiveSession } from '@/lib/db-switch';
import { ApiError, requireRole, requireWebAuthn } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/platform/audit';

const CategoryInput = z.object({
  slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/),
  name: z.string().min(2).max(60),
  nameBn: z.string().min(0).max(60).nullable().optional(),
  departmentId: z.string().nullable().optional(),
  narrowCategoryPhotoCap: z
    .number()
    .int()
    .min(1)
    .max(10)
    .nullable()
    .optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getActiveSession();
    if (!session) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }
    requireRole(session, 'admin');
    const city = await db.city.findUnique({ where: { id: params.id } });
    if (!city) {
      return NextResponse.json({ error: 'city_not_found' }, { status: 404 });
    }
    const categories = await db.category.findMany({
      where: { cityId: city.id },
    });
    return NextResponse.json({ categories }, { status: 200 });
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    return NextResponse.json({ error: 'unhandled' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getActiveSession();
    if (!session) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }
    requireRole(session, 'admin');
    await requireWebAuthn(session);
    const city = await db.city.findUnique({ where: { id: params.id } });
    if (!city) {
      return NextResponse.json({ error: 'city_not_found' }, { status: 404 });
    }
    const body = await req.json().catch(() => null);
    const parsed = CategoryInput.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_input', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    if (parsed.data.departmentId) {
      const dept = await db.department.findUnique({
        where: { id: parsed.data.departmentId },
      });
      if (!dept || dept.cityId !== city.id) {
        return NextResponse.json(
          { error: 'department_not_found' },
          { status: 404 },
        );
      }
    }
    const cat = await db.category.create({
      data: {
        cityId: city.id,
        slug: parsed.data.slug,
        name: parsed.data.name,
        nameBn: parsed.data.nameBn ?? null,
        departmentId: parsed.data.departmentId ?? null,
        narrowCategoryPhotoCap: parsed.data.narrowCategoryPhotoCap ?? null,
      },
    });
    await writeAudit({
      entityType: 'category',
      entityId: cat.id,
      action: 'create',
      actorId: session.userId,
      afterValue: {
        slug: cat.slug,
        name: cat.name,
        nameBn: cat.nameBn,
        departmentId: cat.departmentId,
        narrowCategoryPhotoCap: cat.narrowCategoryPhotoCap,
      },
    });
    return NextResponse.json({ category: cat }, { status: 201 });
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    return NextResponse.json({ error: 'unhandled' }, { status: 500 });
  }
}