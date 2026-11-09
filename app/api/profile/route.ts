/**
 * GET /api/profile — read the signed-in user's own profile.
 * PUT /api/profile — update the signed-in user's own display name.
 *
 * ADR-007 ("admin write paths require WebAuthn") is stated as a
 * property of the ROLE, not of the path: *"Every admin write path
 * requires a fresh WebAuthn assertion… gated for the `admin` role
 * only. Dispatcher and crew writes are not admin writes and are not
 * gated. Reads are exempt everywhere."*
 *
 * This route is the exact case ADR-007 predicted would be missed: it
 * sits OUTSIDE the `/api/v1/admin/*` tree but is reachable by an
 * admin session and performs a write. It used to carry no
 * `requireRole`, no `requireWebAuthn`, hand-rolled validation, and no
 * audit row — see SECURITY_AUDIT finding #5.
 *
 * The fix keeps the citizen-facing behaviour intact while closing the
 * admin gap:
 *
 *   - A citizen / dispatcher / crew write to their OWN profile is NOT
 *     an admin write and is NOT gated. The write is scoped to
 *     `session.userId`, so one user can never edit another.
 *   - An ADMIN write IS gated: `requireWebAuthn(session)` must pass
 *     before the write lands.
 *   - Validation is a Zod schema at the boundary (team.md: "Zod
 *     schemas at every external API boundary"), not hand-rolled
 *     string checks.
 *   - Every write lands an audit row (`writeAudit`).
 *
 * Guard ordering (ADR-007: "The ceremony must not fire before the
 * cheap checks"): the session check, the body parse, and the Zod
 * validation all run BEFORE the ceremony, so a caller with a bad
 * payload is not asked for a hardware-key assertion they could
 * never use to make the request valid.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, getActiveSession } from '@/lib/db-switch';
import { ApiError, requireWebAuthn } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/platform/audit';

/**
 * The profile write body.
 *
 * `name` is required and non-empty (the display name the citizen is
 * known by). `nameBn` is optional and nullable — clearing the Bangla
 * name is a legitimate action, so `null` and `""` both mean "no
 * Bangla name".
 *
 * The control-character rule is carried over from the hand-rolled
 * check this replaced (`/[\u0000-\u001f\u007f]/`): a name must not
 * smuggle control characters into the UI, the audit log, or a PDF.
 */
const ProfileInput = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'name must not be empty')
    .max(80, 'name must be 80 characters or fewer')
    .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), {
      message: 'name must not contain control characters',
    }),
  nameBn: z
    .string()
    .trim()
    .max(80, 'nameBn must be 80 characters or fewer')
    .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), {
      message: 'nameBn must not contain control characters',
    })
    .nullable()
    .optional(),
});

function serializeProfile(user: NonNullable<Awaited<ReturnType<typeof db.user.findUnique>>>) {
  return {
    id: user.id,
    name: user.name,
    nameBn: user.nameBn ?? null,
    email: user.email ?? null,
    phone: user.phone ?? null,
    role: user.role,
    cityId: user.cityId,
  };
}

export async function GET() {
  const session = await getActiveSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user) return NextResponse.json({ error: 'user_not_found' }, { status: 404 });

  return NextResponse.json({ profile: serializeProfile(user) });
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getActiveSession();
    if (!session) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }

    // Cheap checks first (ADR-007 guard ordering): parse and
    // validate the body BEFORE any ceremony, so a malformed request
    // gets a 400 rather than being sent through a hardware-key
    // prompt it could never satisfy.
    const payload = await request.json().catch(() => null);
    const parsed = ProfileInput.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_input', issues: parsed.error.issues },
        { status: 400 },
      );
    }

    // The ceremony. ADR-007 gates ADMIN writes; dispatcher and crew
    // writes are not admin writes and are not gated. This route is
    // scoped to `session.userId`, so the write can only ever touch
    // the caller's OWN row.
    if (session.role === 'admin') {
      await requireWebAuthn(session);
    }

    const before = await db.user.findUnique({ where: { id: session.userId } });
    if (!before) {
      return NextResponse.json({ error: 'user_not_found' }, { status: 404 });
    }

    const user = await db.user.updateProfile({
      where: { id: session.userId },
      data: { name: parsed.data.name, nameBn: parsed.data.nameBn || null },
    });

    await writeAudit({
      entityType: 'user',
      entityId: user.id,
      action: 'user.update_profile',
      actorId: session.userId,
      beforeValue: { name: before.name, nameBn: before.nameBn ?? null },
      afterValue: { name: user.name, nameBn: user.nameBn ?? null },
    });

    return NextResponse.json({ profile: serializeProfile(user) });
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    return NextResponse.json({ error: 'unhandled' }, { status: 500 });
  }
}
