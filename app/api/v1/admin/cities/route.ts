/**
 * GET /api/v1/admin/cities — list cities.
 * POST /api/v1/admin/cities — create a city
 *   (with optional applyDhakaTemplate).
 *
 * Bolt 005-002 (Intent 005, Unit 002).
 * Reads are gated by `requireRole('admin')`.
 * Writes are gated by `requireRole('admin')`
 * + `requireWebAuthn(session)` + `writeAudit(...)`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, getActiveSession } from '@/lib/db-switch';
import { ApiError, requireRole, requireWebAuthn } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/platform/audit';
import { applyDhakaTemplate } from '@/lib/admin/dhaka-template';

const CityInput = z.object({
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, 'slug must be lowercase letters, digits, and dashes'),
  name: z.string().min(2).max(60),
  nameBn: z.string().min(0).max(60).nullable().optional(),
  defaultLanguage: z.enum(['bn', 'en']).default('bn'),
  dedupRadiusMeters: z.number().int().min(1).max(500).default(50),
  applyDhakaTemplate: z.boolean().optional().default(false),
});

export async function GET(_req: NextRequest) {
  try {
    const session = await getActiveSession();
    if (!session) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }
    requireRole(session, 'admin');
    const cities = await db.city.findMany();
    const out = await Promise.all(
      cities.map(async (c) => {
        const wards = await db.ward.findMany({ where: { cityId: c.id } });
        const departments = await db.department.findMany({
          where: { cityId: c.id },
        });
        const categories = await db.category.findMany({
          where: { cityId: c.id },
        });
        const status =
          wards.length > 0 &&
          categories.length > 0 &&
          departments.length > 0
            ? 'live'
            : 'setup';
        return {
          id: c.id,
          slug: c.slug,
          name: c.name,
          nameBn: c.nameBn,
          defaultLanguage: c.defaultLanguage,
          dedupRadiusMeters: c.dedupRadiusMeters,
          status,
          counts: {
            dispatchers: 0,
            crews: 0,
            ticketsPerDay: 0,
            wards: wards.length,
            categories: categories.length,
            departments: departments.length,
          },
        };
      }),
    );
    return NextResponse.json({ cities: out }, { status: 200 });
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    return NextResponse.json({ error: 'unhandled' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getActiveSession();
    if (!session) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }
    requireRole(session, 'admin');
    await requireWebAuthn(session);
    const body = await req.json().catch(() => null);
    const parsed = CityInput.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_input', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const existing = await db.city.findUniqueBySlug({
      where: { slug: parsed.data.slug },
    });
    if (existing) {
      return NextResponse.json(
        { error: 'city_slug_taken' },
        { status: 409 },
      );
    }
    const city = await db.city.create({
      data: {
        slug: parsed.data.slug,
        name: parsed.data.name,
        nameBn: parsed.data.nameBn ?? null,
        defaultLanguage: parsed.data.defaultLanguage,
        dedupRadiusMeters: parsed.data.dedupRadiusMeters,
      },
    });
    await writeAudit({
      entityType: 'city',
      entityId: city.id,
      action: 'create',
      actorId: session.userId,
      afterValue: {
        slug: city.slug,
        name: city.name,
        nameBn: city.nameBn,
        defaultLanguage: city.defaultLanguage,
        dedupRadiusMeters: city.dedupRadiusMeters,
      },
    });

    let templateResult = null;
    if (parsed.data.applyDhakaTemplate) {
      try {
        templateResult = await applyDhakaTemplate(city.id, session.userId);
      } catch {
        // If the template collided on a
        // unique constraint, we still keep
        // the city — the city row itself
        // is the source of truth.
        return NextResponse.json(
          {
            city,
            templateError: 'template_already_applied',
          },
          { status: 200 },
        );
      }
    }

    return NextResponse.json(
      { city, templateResult },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    return NextResponse.json({ error: 'unhandled' }, { status: 500 });
  }
}