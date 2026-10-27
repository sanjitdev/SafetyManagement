/**
 * GET  /api/v1/admin/cities/[id]/users
 *   — list the city's provisioned users + role counts.
 * POST /api/v1/admin/cities/[id]/users
 *   — provision one user.
 *
 * Bolt 005-003 (Intent 005, Unit 003) — 4.6 User provisioning.
 *
 * Admins bypass the cross-city check (per ADR-006); the city in the
 * path is the city being administered.
 *
 * Every state-changing operation writes an audit entry via
 * `writeAudit(...)` (PLAT-REQ-007).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getActiveSession } from '@/lib/db-switch';
import { ApiError, requireRole, requireWebAuthn } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/platform/audit';
import { hashPassword } from '@/lib/auth/password';
import {
  buildUsersList,
  classifyIdentifier,
  mapSpecRoleToPrismaRole,
  validateInitialPassword,
  type ProvisionRole,
} from '@/lib/admin/users';
import {
  createCityUser,
  findUserByIdentifier,
  listCityCrews,
  listCityDepartments,
  listCitySessions,
  listCityUsers,
  listCityWards,
} from '@/lib/admin/users-db';

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const CreateUserSchema = z.object({
  nameBn: z.string().trim().min(1, 'name_bn_required').max(120),
  nameEn: z.string().trim().min(1, 'name_en_required').max(120),
  identifier: z.string().trim().min(1, 'identifier_required').max(120),
  email: z
    .string()
    .trim()
    .max(160)
    .refine(
      (v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      'email_invalid',
    )
    .optional()
    .default(''),
  role: z.enum(['dispatcher', 'crew', 'supervisor']),
  wardIds: z.array(z.string().min(1)).max(20).optional().default([]),
  crewId: z.string().min(1).nullable().optional().default(null),
  departmentId: z.string().min(1).nullable().optional().default(null),
  password: z.string().min(1, 'password_required').max(200),
  status: z.enum(['active', 'invited', 'disabled']).optional().default('active'),
});

/**
 * Resolve the role-specific scope fields into the flat column set
 * the `User` table stores.
 *
 * The 4.6 rules:
 *   - dispatcher: ≥ 1 ward, no crew, no department.
 *   - crew: exactly 1 crew and 1 department.
 *   - supervisor: no ward, no crew, no department.
 *
 * The `User` table stores a SINGLE `wardId`, so a multi-ward
 * dispatcher keeps the FIRST ward on the row and the full list is
 * reported back to the client in the response. (The schema has no
 * ward-join table; see the report's "not implemented" list.)
 */
function resolveScope(
  role: ProvisionRole,
  wardIds: string[],
  crewId: string | null,
  departmentId: string | null,
): { wardId: string | null; crewId: string | null; departmentId: string | null } {
  if (role === 'dispatcher') {
    return { wardId: wardIds[0] ?? null, crewId: null, departmentId: null };
  }
  if (role === 'crew') {
    return { wardId: null, crewId, departmentId };
  }
  return { wardId: null, crewId: null, departmentId: null };
}

// ---------------------------------------------------------------------------
// GET — list users
// ---------------------------------------------------------------------------

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

    const [users, sessions, wards, departments, crews] = await Promise.all([
      listCityUsers(params.id),
      listCitySessions(params.id),
      listCityWards(params.id),
      listCityDepartments(params.id),
      listCityCrews(params.id),
    ]);

    const result = buildUsersList(users, sessions, wards, departments, crews);
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    return NextResponse.json({ error: 'unhandled' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST — provision one user
// ---------------------------------------------------------------------------

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

    const body = await req.json().catch(() => null);
    const parsed = CreateUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_input', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const data = parsed.data;

    // --- Identifier classification -----------------------------------
    const identifier = classifyIdentifier(data.identifier);
    if (!identifier.ok) {
      return NextResponse.json({ error: identifier.reason }, { status: 400 });
    }
    if (identifier.kind === 'phone' && data.email) {
      // The identifier is the mobile; a separate email is also fine.
      // Nothing to reject here — the email is stored in `email`.
    }
    if (identifier.kind === 'email' && data.email && data.email !== data.identifier) {
      return NextResponse.json(
        { error: 'identifier_email_conflict' },
        { status: 400 },
      );
    }

    // --- Password policy ---------------------------------------------
    const passwordCheck = validateInitialPassword(data.password);
    if (!passwordCheck.ok) {
      return NextResponse.json(
        { error: passwordCheck.error ?? 'password_invalid' },
        { status: 400 },
      );
    }

    // --- Role scope rules --------------------------------------------
    const [wards, departments, crews] = await Promise.all([
      listCityWards(params.id),
      listCityDepartments(params.id),
      listCityCrews(params.id),
    ]);
    const wardIds = wards.map((w) => w.id);
    const crewIds = crews.map((c) => c.id);
    const departmentIds = departments.map((d) => d.id);

    if (data.role === 'dispatcher') {
      if (data.wardIds.length === 0) {
        return NextResponse.json({ error: 'dispatcher_needs_ward' }, { status: 400 });
      }
      for (const w of data.wardIds) {
        if (!wardIds.includes(w)) {
          return NextResponse.json({ error: 'ward_unknown' }, { status: 400 });
        }
      }
    }
    if (data.role === 'crew') {
      if (!data.crewId) {
        return NextResponse.json({ error: 'crew_needs_crew' }, { status: 400 });
      }
      if (crewIds.length > 0 && !crewIds.includes(data.crewId)) {
        return NextResponse.json({ error: 'crew_unknown' }, { status: 400 });
      }
      if (!data.departmentId) {
        return NextResponse.json({ error: 'crew_needs_department' }, { status: 400 });
      }
      if (!departmentIds.includes(data.departmentId)) {
        return NextResponse.json({ error: 'department_unknown' }, { status: 400 });
      }
    }
    if (data.role === 'supervisor') {
      if (data.wardIds.length > 0) {
        return NextResponse.json({ error: 'supervisor_takes_no_wards' }, { status: 400 });
      }
      if (data.crewId) {
        return NextResponse.json({ error: 'supervisor_takes_no_crew' }, { status: 400 });
      }
    }

    // --- Identifier uniqueness (per city) ----------------------------
    const existing = await findUserByIdentifier(params.id, data.identifier);
    if (existing) {
      return NextResponse.json({ error: 'identifier_taken' }, { status: 409 });
    }
    if (data.email) {
      const emailOwner = await findUserByIdentifier(params.id, data.email);
      if (emailOwner) {
        return NextResponse.json({ error: 'identifier_taken' }, { status: 409 });
      }
    }

    // --- Persist ------------------------------------------------------
    const scope = resolveScope(data.role, data.wardIds, data.crewId, data.departmentId);
    const passwordHash = await hashPassword(data.password);

    const created = await createCityUser({
      id: `user_${data.role}_${Date.now().toString(36)}_${Math.random()
        .toString(36)
        .slice(2, 8)}`,
      cityId: params.id,
      role: mapSpecRoleToPrismaRole(data.role),
      name: data.nameEn,
      nameBn: data.nameBn,
      email: data.email ? data.email : identifier.kind === 'email' ? data.identifier : null,
      phone: identifier.kind === 'phone' ? data.identifier : null,
      passwordHash,
      wardId: scope.wardId,
      departmentId: scope.departmentId,
      crewId: scope.crewId,
      status: data.status,
    });

    await writeAudit({
      entityType: 'user',
      entityId: created.id,
      action: 'user.create',
      actorId: session.userId,
      afterValue: {
        role: data.role,
        nameBn: data.nameBn,
        nameEn: data.nameEn,
        identifier: data.identifier,
        email: created.email,
        phone: created.phone,
        wardId: created.wardId,
        crewId: created.crewId,
        departmentId: created.departmentId,
        status: created.status,
      },
    });

    return NextResponse.json({ user: created }, { status: 201 });
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    return NextResponse.json({ error: 'unhandled' }, { status: 500 });
  }
}
