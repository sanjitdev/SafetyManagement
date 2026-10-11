/**
 * PATCH /api/v1/admin/cities/[id]/departments/[deptId]
 *   — update a department.
 * DELETE /api/v1/admin/cities/[id]/departments/[deptId]
 *   — delete a department (rejected with
 *     409 department_has_categories if any
 *     category still references it).
 *
 * Bolt 005-002 (Intent 005, Unit 002).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, getActiveSession } from '@/lib/db-switch';
import { ApiError, requireRole, requireWebAuthn } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/platform/audit';

const DepartmentPatch = z.object({
  name: z.string().min(2).max(60).optional(),
  nameBn: z.string().min(0).max(60).nullable().optional(),
  contactInfo: z.string().min(0).max(120).nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; deptId: string } },
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
    const dept = await db.department.findUnique({
      where: { id: params.deptId },
    });
    if (!dept || dept.cityId !== city.id) {
      return NextResponse.json(
        { error: 'department_not_found' },
        { status: 404 },
      );
    }
    const body = await req.json().catch(() => null);
    const parsed = DepartmentPatch.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_input', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const updated = await db.department.update({
      where: { id: dept.id },
      data: parsed.data,
    });
    await writeAudit({
      entityType: 'department',
      entityId: dept.id,
      action: 'update',
      actorId: session.userId,
      beforeValue: {
        name: dept.name,
        nameBn: dept.nameBn,
      },
      afterValue: {
        name: updated.name,
        nameBn: updated.nameBn,
      },
    });
    return NextResponse.json({ department: updated }, { status: 200 });
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    return NextResponse.json({ error: 'unhandled' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; deptId: string } },
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
    const dept = await db.department.findUnique({
      where: { id: params.deptId },
    });
    if (!dept || dept.cityId !== city.id) {
      return NextResponse.json(
        { error: 'department_not_found' },
        { status: 404 },
      );
    }
    // Orphan check — categories
    // referencing this department.
    const categories = await db.category.findMany({
      where: { cityId: city.id },
    });
    const bound = categories.filter((c) => c.departmentId === dept.id);
    if (bound.length > 0) {
      return NextResponse.json(
        {
          error: 'department_has_categories',
          count: bound.length,
          categoryIds: bound.map((c) => c.id),
        },
        { status: 409 },
      );
    }
    await db.department.delete({ where: { id: dept.id } });
    await writeAudit({
      entityType: 'department',
      entityId: dept.id,
      action: 'delete',
      actorId: session.userId,
      beforeValue: {
        name: dept.name,
        slug: dept.slug,
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