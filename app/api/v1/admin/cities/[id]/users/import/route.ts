/**
 * POST /api/v1/admin/cities/[id]/users/import
 *   — bulk-provision users from a CSV document.
 *
 * Bolt 005-003 (Intent 005, Unit 003) — 4.6 User provisioning.
 *
 * REQUIRES a WebAuthn assertion: the 4.6 spec puts bulk import
 * behind the hardware key alongside deletion, because a bad import
 * can provision dozens of accounts at once.
 *
 * Every row is validated independently. Good rows are created;
 * bad rows are reported back with their row numbers and per-field
 * error codes so the admin can fix and re-import them.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getActiveSession } from '@/lib/db-switch';
import { ApiError, requireRole, requireWebAuthn } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/platform/audit';
import { hashPassword } from '@/lib/auth/password';
import {
  classifyIdentifier,
  generateInitialPassword,
  mapSpecRoleToPrismaRole,
  validateUserCsv,
} from '@/lib/admin/users';
import {
  createCityUser,
  findUserByIdentifier,
  listCityCrews,
  listCityDepartments,
  listCityWards,
} from '@/lib/admin/users-db';

const ImportSchema = z.object({
  csv: z.string().min(1, 'csv_required').max(512 * 1024),
  /** Optional: one shared initial password for every imported row. */
  password: z.string().min(1).max(200).optional(),
  /** Skip rows whose identifier already exists instead of failing them. */
  skipDuplicates: z.boolean().optional().default(true),
});

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
    const parsedBody = ImportSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: 'invalid_input', issues: parsedBody.error.issues },
        { status: 400 },
      );
    }
    const { csv, password, skipDuplicates } = parsedBody.data;

    const [wards, departments, crews] = await Promise.all([
      listCityWards(params.id),
      listCityDepartments(params.id),
      listCityCrews(params.id),
    ]);

    const validation = validateUserCsv(csv, {
      wardIds: wards.map((w) => w.id),
      crewIds: crews.map((c) => c.id),
      departmentIds: departments.map((d) => d.id),
    });

    // The shared password for every imported row. When the admin
    // supplied none, generate a strong one per row (the plaintext is
    // returned ONCE in the response so the admin can distribute it;
    // only the hash is stored).
    const sharedPassword = password ?? null;

    const created: { rowNumber: number; id: string; password: string | null }[] = [];
    const failed: { rowNumber: number; errors: string[] }[] = [];

    for (const row of validation.results) {
      if (!row.valid || !row.parsed) {
        failed.push({ rowNumber: row.rowNumber, errors: row.errors });
        continue;
      }
      const input = row.parsed;

      // Identifier must be a mobile or an email.
      const identifier = classifyIdentifier(input.identifier);
      if (!identifier.ok) {
        failed.push({ rowNumber: row.rowNumber, errors: [identifier.reason] });
        continue;
      }

      // Uniqueness within the city.
      const owner = await findUserByIdentifier(params.id, input.identifier);
      if (owner) {
        if (skipDuplicates) {
          failed.push({ rowNumber: row.rowNumber, errors: ['identifier_taken'] });
          continue;
        }
        failed.push({ rowNumber: row.rowNumber, errors: ['identifier_taken'] });
        continue;
      }
      if (input.email) {
        const emailOwner = await findUserByIdentifier(params.id, input.email);
        if (emailOwner) {
          failed.push({ rowNumber: row.rowNumber, errors: ['identifier_taken'] });
          continue;
        }
      }

      const rowPassword = sharedPassword ?? generateInitialPassword();
      let passwordHash: string;
      try {
        passwordHash = await hashPassword(rowPassword);
      } catch {
        failed.push({ rowNumber: row.rowNumber, errors: ['password_invalid'] });
        continue;
      }

      try {
        const createdUser = await createCityUser({
          id: `user_import_${row.rowNumber}_${Date.now().toString(36)}_${Math.random()
            .toString(36)
            .slice(2, 8)}`,
          cityId: params.id,
          role: mapSpecRoleToPrismaRole(input.role),
          name: input.nameEn,
          nameBn: input.nameBn,
          email: input.email ?? (identifier.kind === 'email' ? input.identifier : null),
          phone: identifier.kind === 'phone' ? input.identifier : null,
          passwordHash,
          wardId: input.role === 'dispatcher' ? (input.wardIds[0] ?? null) : null,
          departmentId: input.departmentId,
          crewId: input.crewId,
          status: 'invited',
        });
        created.push({
          rowNumber: row.rowNumber,
          id: createdUser.id,
          // The plaintext is surfaced ONCE so the admin can hand it
          // out. It is never persisted.
          password: sharedPassword ? null : rowPassword,
        });
        await writeAudit({
          entityType: 'user',
          entityId: createdUser.id,
          action: 'user.import',
          actorId: session.userId,
          afterValue: {
            role: input.role,
            nameBn: input.nameBn,
            nameEn: input.nameEn,
            identifier: input.identifier,
            email: createdUser.email,
            phone: createdUser.phone,
            wardId: createdUser.wardId,
            crewId: createdUser.crewId,
            departmentId: createdUser.departmentId,
            status: 'invited',
            importRow: row.rowNumber,
          },
        });
      } catch {
        failed.push({ rowNumber: row.rowNumber, errors: ['create_failed'] });
      }
    }

    return NextResponse.json(
      {
        imported: created.length,
        failed: failed.length,
        created,
        errors: failed,
      },
      { status: failed.length > 0 && created.length === 0 ? 400 : 200 },
    );
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    return NextResponse.json({ error: 'unhandled' }, { status: 500 });
  }
}
