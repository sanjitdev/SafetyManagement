/**
 * GET /api/v1/admin/cities/[id]/departments
 *   — list departments for a city.
 * POST /api/v1/admin/cities/[id]/departments
 *   — create a department in a city.
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

const DepartmentInput = z.object({
  slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/),
  name: z.string().min(2).max(60),
  nameBn: z.string().min(0).max(60).nullable().optional(),
  contactInfo: z.string().min(0).max(120).nullable().optional(),
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
    const departments = await db.department.findMany({
      where: { cityId: city.id },
    });
    return NextResponse.json({ departments }, { status: 200 });
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
    const parsed = DepartmentInput.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_input', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const dept = await db.department.create({
      data: {
        cityId: city.id,
        slug: parsed.data.slug,
        name: parsed.data.name,
        nameBn: parsed.data.nameBn ?? null,
      },
    });
    await writeAudit({
      entityType: 'department',
      entityId: dept.id,
      action: 'create',
      actorId: session.userId,
      afterValue: {
        slug: dept.slug,
        name: dept.name,
        nameBn: dept.nameBn,
      },
    });
    return NextResponse.json({ department: dept }, { status: 201 });
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    return NextResponse.json({ error: 'unhandled' }, { status: 500 });
  }
}