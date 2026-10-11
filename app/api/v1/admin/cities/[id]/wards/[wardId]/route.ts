/**
 * PATCH /api/v1/admin/cities/[id]/wards/[wardId]
 *   — update a ward (number / name / polygon).
 * DELETE /api/v1/admin/cities/[id]/wards/[wardId]
 *   — delete a ward (rejected with
 *     409 ward_has_tickets if any ticket
 *     still references it).
 *
 * Bolt 005-002 (Intent 005, Unit 002).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, getActiveSession } from '@/lib/db-switch';
import { ApiError, requireRole, requireWebAuthn } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/platform/audit';
import { validatePolygon } from '@/lib/admin/ward-polygon';

const PolygonSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))),
});

const WardPatch = z.object({
  name: z.string().min(2).max(60).optional(),
  nameBn: z.string().min(0).max(60).nullable().optional(),
  polygonGeoJson: PolygonSchema.nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; wardId: string } },
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
    const ward = await db.ward.findUnique({ where: { id: params.wardId } });
    if (!ward || ward.cityId !== city.id) {
      return NextResponse.json({ error: 'ward_not_found' }, { status: 404 });
    }
    const body = await req.json().catch(() => null);
    const parsed = WardPatch.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_input', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const patch: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) patch.name = parsed.data.name;
    if (parsed.data.nameBn !== undefined) patch.nameBn = parsed.data.nameBn;
    if (parsed.data.polygonGeoJson !== undefined) {
      if (parsed.data.polygonGeoJson === null) {
        patch.polygonGeoJson = null;
      } else {
        const result = validatePolygon(parsed.data.polygonGeoJson);
        if (!result.valid) {
          return NextResponse.json(
            { error: result.error },
            { status: 400 },
          );
        }
        patch.polygonGeoJson = JSON.stringify(result.polygon);
      }
    }
    const updated = await db.ward.update({
      where: { id: ward.id },
      data: patch,
    });
    await writeAudit({
      entityType: 'ward',
      entityId: ward.id,
      action: 'update',
      actorId: session.userId,
      beforeValue: {
        name: ward.name,
        nameBn: ward.nameBn,
        polygonGeoJson: ward.polygonGeoJson,
      },
      afterValue: {
        name: updated.name,
        nameBn: updated.nameBn,
        polygonGeoJson: updated.polygonGeoJson,
      },
    });
    return NextResponse.json({ ward: updated }, { status: 200 });
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    return NextResponse.json({ error: 'unhandled' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; wardId: string } },
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
    const ward = await db.ward.findUnique({ where: { id: params.wardId } });
    if (!ward || ward.cityId !== city.id) {
      return NextResponse.json({ error: 'ward_not_found' }, { status: 404 });
    }
    // Orphan check — tickets referencing
    // this ward.
    const tickets = await db.ticket.findMany({ where: { cityId: city.id } });
    const bound = tickets.filter((t) => t.wardId === ward.id);
    if (bound.length > 0) {
      return NextResponse.json(
        { error: 'ward_has_tickets', count: bound.length },
        { status: 409 },
      );
    }
    await db.ward.delete({ where: { id: ward.id } });
    await writeAudit({
      entityType: 'ward',
      entityId: ward.id,
      action: 'delete',
      actorId: session.userId,
      beforeValue: {
        name: ward.name,
        number: ward.number,
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