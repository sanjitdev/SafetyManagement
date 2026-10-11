/**
 * PATCH /api/v1/admin/cities/[id]/categories/[catId]
 *   — update a category.
 * DELETE /api/v1/admin/cities/[id]/categories/[catId]
 *   — delete a category (rejected with
 *     409 category_has_tickets if any
 *     ticket still references it).
 *
 * Bolt 005-002 (Intent 005, Unit 002).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, getActiveSession } from '@/lib/db-switch';
import { ApiError, requireRole, requireWebAuthn } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/platform/audit';

const CategoryPatch = z.object({
  name: z.string().min(2).max(60).optional(),
  nameBn: z.string().min(0).max(60).nullable().optional(),
  departmentId: z.string().nullable().optional(),
  narrowCategoryPhotoCap: z.number().int().min(1).max(10).nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; catId: string } },
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
    const cat = await db.category.findUnique({ where: { id: params.catId } });
    if (!cat || cat.cityId !== city.id) {
      return NextResponse.json(
        { error: 'category_not_found' },
        { status: 404 },
      );
    }
    const body = await req.json().catch(() => null);
    const parsed = CategoryPatch.safeParse(body);
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
    const updated = await db.category.update({
      where: { id: cat.id },
      data: parsed.data,
    });
    await writeAudit({
      entityType: 'category',
      entityId: cat.id,
      action: 'update',
      actorId: session.userId,
      beforeValue: {
        name: cat.name,
        nameBn: cat.nameBn,
        departmentId: cat.departmentId,
        narrowCategoryPhotoCap: cat.narrowCategoryPhotoCap,
      },
      afterValue: {
        name: updated.name,
        nameBn: updated.nameBn,
        departmentId: updated.departmentId,
        narrowCategoryPhotoCap: updated.narrowCategoryPhotoCap,
      },
    });
    return NextResponse.json({ category: updated }, { status: 200 });
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    return NextResponse.json({ error: 'unhandled' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; catId: string } },
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
    const cat = await db.category.findUnique({ where: { id: params.catId } });
    if (!cat || cat.cityId !== city.id) {
      return NextResponse.json(
        { error: 'category_not_found' },
        { status: 404 },
      );
    }
    // Orphan check — tickets referencing
    // this category. The dev store's
    // ticket.findMany doesn't take a
    // `categoryId` filter directly, so we
    // iterate and check inline.
    const tickets = await db.ticket.findMany({ where: { cityId: city.id } });
    const bound = tickets.filter((t) => t.categoryId === cat.id);
    if (bound.length > 0) {
      return NextResponse.json(
        { error: 'category_has_tickets', count: bound.length },
        { status: 409 },
      );
    }
    await db.category.delete({ where: { id: cat.id } });
    await writeAudit({
      entityType: 'category',
      entityId: cat.id,
      action: 'delete',
      actorId: session.userId,
      beforeValue: {
        name: cat.name,
        slug: cat.slug,
      },
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    return NextResponse.json({ error: 'unhandled' }, { status: 500 });
  }
}