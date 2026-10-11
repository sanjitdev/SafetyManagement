/**
 * GET /api/v1/admin/cities/[id] — read a city.
 * PATCH /api/v1/admin/cities/[id] — update a city
 *   (name, nameBn, defaultLanguage, dedupRadiusMeters).
 * DELETE /api/v1/admin/cities/[id] — hard-delete
 *   (cascade per ADR-009; v1 only).
 *
 * Bolt 005-002 (Intent 005, Unit 002).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, getActiveSession } from '@/lib/db-switch';
import { ApiError, requireRole, requireWebAuthn } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/platform/audit';

const CityPatch = z.object({
  name: z.string().min(2).max(60).optional(),
  nameBn: z.string().min(0).max(60).nullable().optional(),
  defaultLanguage: z.enum(['bn', 'en']).optional(),
  dedupRadiusMeters: z.number().int().min(1).max(500).optional(),
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
    return NextResponse.json({ city }, { status: 200 });
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    return NextResponse.json({ error: 'unhandled' }, { status: 500 });
  }
}

export async function PATCH(
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
    const parsed = CityPatch.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_input', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const updated = await db.city.update({
      where: { id: city.id },
      data: parsed.data,
    });
    await writeAudit({
      entityType: 'city',
      entityId: city.id,
      action: 'update',
      actorId: session.userId,
      beforeValue: {
        name: city.name,
        nameBn: city.nameBn,
        defaultLanguage: city.defaultLanguage,
        dedupRadiusMeters: city.dedupRadiusMeters,
      },
      afterValue: {
        name: updated.name,
        nameBn: updated.nameBn,
        defaultLanguage: updated.defaultLanguage,
        dedupRadiusMeters: updated.dedupRadiusMeters,
      },
    });
    return NextResponse.json({ city: updated }, { status: 200 });
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    return NextResponse.json({ error: 'unhandled' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
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
    // Per ADR-009: hard delete. The dev
    // store doesn't cascade (we delete
    // the city row directly); the Prisma
    // path cascades through the
    // `onDelete: Cascade` chain.
    await db.city.delete({ where: { id: city.id } });
    await writeAudit({
      entityType: 'city',
      entityId: city.id,
      action: 'delete',
      actorId: session.userId,
      beforeValue: {
        name: city.name,
        slug: city.slug,
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