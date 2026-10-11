/**
 * GET /api/v1/admin/cities/[id]/wards
 *   — list wards for a city.
 * POST /api/v1/admin/cities/[id]/wards
 *   — create a ward (with polygon
 *     validation per lib/admin/ward-polygon.ts).
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
import { validatePolygon } from '@/lib/admin/ward-polygon';

const PolygonSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))),
});

const WardInput = z.object({
  number: z.number().int().min(1).max(200),
  name: z.string().min(2).max(60),
  nameBn: z.string().min(0).max(60).nullable().optional(),
  polygonGeoJson: PolygonSchema.nullable().optional(),
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
    const wards = await db.ward.findMany({ where: { cityId: city.id } });
    return NextResponse.json({ wards }, { status: 200 });
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
    const parsed = WardInput.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_input', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    let polygonJson: string | null = null;
    if (parsed.data.polygonGeoJson) {
      const result = validatePolygon(parsed.data.polygonGeoJson);
      if (!result.valid) {
        return NextResponse.json(
          { error: result.error },
          { status: 400 },
        );
      }
      polygonJson = JSON.stringify(result.polygon);
    }
    const ward = await db.ward.create({
      data: {
        cityId: city.id,
        number: parsed.data.number,
        name: parsed.data.name,
        nameBn: parsed.data.nameBn ?? null,
        polygonGeoJson: polygonJson,
      },
    });
    await writeAudit({
      entityType: 'ward',
      entityId: ward.id,
      action: 'create',
      actorId: session.userId,
      afterValue: {
        number: ward.number,
        name: ward.name,
        nameBn: ward.nameBn,
        hasPolygon: polygonJson !== null,
      },
    });
    return NextResponse.json({ ward }, { status: 201 });
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    return NextResponse.json({ error: 'unhandled' }, { status: 500 });
  }
}