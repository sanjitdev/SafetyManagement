/**
 * PATCH  /api/v1/admin/cities/[id]/users/[userId]
 *   — update a provisioned user.
 * DELETE /api/v1/admin/cities/[id]/users/[userId]
 *   — delete a provisioned user. REQUIRES a WebAuthn assertion
 *     (the 4.6 "hardware-key requirement": deletion is destructive
 *     and irreversible).
 *
 * Bolt 005-003 (Intent 005, Unit 003) — 4.6 User provisioning.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getActiveSession } from '@/lib/db-switch';
import { ApiError, requireRole, requireWebAuthn } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/platform/audit';
import { hashPassword } from '@/lib/auth/password';
import {
  classifyIdentifier,
  mapPrismaRoleToSpecRole,
  mapSpecRoleToPrismaRole,
  validateInitialPassword,
  type ProvisionRole,
} from '@/lib/admin/users';
import {
  deleteCityUser,
  findCityUser,
  findUserByIdentifier,
  updateCityUser,
  type UpdateUserInput,
} from '@/lib/admin/users-db';

const UpdateUserSchema = z.object({
  nameBn: z.string().trim().min(1).max(120).optional(),
  nameEn: z.string().trim().min(1).max(120).optional(),
  identifier: z.string().trim().min(1).max(120).optional(),
  email: z
    .string()
    .trim()
    .max(160)
    .refine(
      (v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      'email_invalid',
    )
    .optional(),
  role: z.enum(['dispatcher', 'crew', 'supervisor']).optional(),
  wardIds: z.array(z.string().min(1)).max(20).optional(),
  crewId: z.string().min(1).nullable().optional(),
  departmentId: z.string().min(1).nullable().optional(),
  password: z.string().min(1).max(200).optional(),
  status: z.enum(['active', 'invited', 'disabled']).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; userId: string } },
) {
  try {
    const session = await getActiveSession();
    if (!session) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }
    requireRole(session, 'admin');
    await requireWebAuthn(session);

    const before = await findCityUser(params.id, params.userId);
    if (!before) {
      return NextResponse.json({ error: 'user_not_found' }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    const parsed = UpdateUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_input', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const data = parsed.data;

    // --- Identifier change: validate + uniqueness ---------------------
    let phone = before.phone;
    let email = before.email;
    if (data.identifier !== undefined) {
      const identifier = classifyIdentifier(data.identifier);
      if (!identifier.ok) {
        return NextResponse.json({ error: identifier.reason }, { status: 400 });
      }
      const owner = await findUserByIdentifier(params.id, data.identifier);
      if (owner && owner.id !== params.userId) {
        return NextResponse.json({ error: 'identifier_taken' }, { status: 409 });
      }
      if (identifier.kind === 'phone') {
        phone = data.identifier;
        // The identifier was a mobile; the email stays as-is.
      } else {
        email = data.identifier;
      }
    }
    if (data.email !== undefined) {
      const nextEmail = data.email === '' ? null : data.email;
      if (nextEmail) {
        const owner = await findUserByIdentifier(params.id, nextEmail);
        if (owner && owner.id !== params.userId) {
          return NextResponse.json({ error: 'identifier_taken' }, { status: 409 });
        }
      }
      email = nextEmail;
    }

    // --- Password change ---------------------------------------------
    let passwordHash: string | undefined;
    if (data.password !== undefined) {
      const check = validateInitialPassword(data.password);
      if (!check.ok) {
        return NextResponse.json(
          { error: check.error ?? 'password_invalid' },
          { status: 400 },
        );
      }
      passwordHash = await hashPassword(data.password);
    }

    // --- Role + scope -------------------------------------------------
    const payload: UpdateUserInput = {};
    if (data.nameEn !== undefined) payload.name = data.nameEn;
    if (data.nameBn !== undefined) payload.nameBn = data.nameBn;
    if (data.email !== undefined || data.identifier !== undefined) {
      payload.email = email;
      payload.phone = phone;
    }
    if (data.status !== undefined) payload.status = data.status;
    if (passwordHash !== undefined) payload.passwordHash = passwordHash;

    if (data.role !== undefined) {
      const role: ProvisionRole = data.role;
      payload.role = mapSpecRoleToPrismaRole(role);
      if (role === 'dispatcher') {
        const wardIds = data.wardIds ?? (before.wardId ? [before.wardId] : []);
        if (wardIds.length === 0) {
          return NextResponse.json(
            { error: 'dispatcher_needs_ward' },
            { status: 400 },
          );
        }
        payload.wardId = wardIds[0];
        payload.crewId = null;
        payload.departmentId = null;
      } else if (role === 'crew') {
        if (!data.crewId) {
          return NextResponse.json({ error: 'crew_needs_crew' }, { status: 400 });
        }
        if (!data.departmentId) {
          return NextResponse.json(
            { error: 'crew_needs_department' },
            { status: 400 },
          );
        }
        payload.wardId = null;
        payload.crewId = data.crewId;
        payload.departmentId = data.departmentId;
      } else {
        payload.wardId = null;
        payload.crewId = null;
        payload.departmentId = null;
      }
    } else if (data.wardIds !== undefined) {
      payload.wardId = data.wardIds[0] ?? null;
    }
    if (data.crewId !== undefined && data.role === undefined) {
      payload.crewId = data.crewId;
    }
    if (data.departmentId !== undefined && data.role === undefined) {
      payload.departmentId = data.departmentId;
    }

    const updated = await updateCityUser(params.userId, payload);
    if (!updated) {
      return NextResponse.json({ error: 'user_not_found' }, { status: 404 });
    }

    await writeAudit({
      entityType: 'user',
      entityId: updated.id,
      action: 'user.update',
      actorId: session.userId,
      beforeValue: {
        role: before.role,
        name: before.name,
        nameBn: before.nameBn ?? null,
        email: before.email,
        phone: before.phone,
        wardId: before.wardId,
        crewId: before.crewId ?? null,
        departmentId: before.departmentId,
        status: before.status ?? null,
      },
      afterValue: {
        role: updated.role,
        name: updated.name,
        nameBn: updated.nameBn ?? null,
        email: updated.email,
        phone: updated.phone,
        wardId: updated.wardId,
        crewId: updated.crewId ?? null,
        departmentId: updated.departmentId,
        status: updated.status ?? null,
      },
    });

    return NextResponse.json({ user: updated }, { status: 200 });
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    return NextResponse.json({ error: 'unhandled' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; userId: string } },
) {
  try {
    const session = await getActiveSession();
    if (!session) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }
    requireRole(session, 'admin');
    // The 4.6 spec: deletion requires the hardware key.
    await requireWebAuthn(session);

    const before = await findCityUser(params.id, params.userId);
    if (!before) {
      return NextResponse.json({ error: 'user_not_found' }, { status: 404 });
    }

    const deleted = await deleteCityUser(params.userId);
    if (!deleted) {
      // The user has reported or been assigned tickets; the FK
      // restriction forbids a hard delete.
      return NextResponse.json({ error: 'user_has_tickets' }, { status: 409 });
    }

    await writeAudit({
      entityType: 'user',
      entityId: before.id,
      action: 'user.delete',
      actorId: session.userId,
      beforeValue: {
        role: before.role,
        name: before.name,
        email: before.email,
        phone: before.phone,
        status: before.status ?? null,
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
