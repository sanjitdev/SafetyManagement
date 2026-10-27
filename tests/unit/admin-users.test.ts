/**
 * Unit tests for the 4.6 user-provisioning domain logic
 * (`lib/admin/users.ts`).
 *
 * Pure logic — no DB, no Next runtime. Covers the role mapping, the
 * status / last-login derivations, the identifier classification, the
 * password policy and the CSV parse + validation pipeline.
 */

import { describe, expect, it } from 'vitest';
import {
  buildUsersList,
  classifyIdentifier,
  crewKeyFor,
  deriveIdentifier,
  deriveLastLoginAt,
  deriveUserName,
  deriveUserStatus,
  escapeCsvCell,
  filterByTab,
  generateInitialPassword,
  mapPrismaRoleToSpecRole,
  mapSpecRoleToPrismaRole,
  parseProvisionRole,
  parseUserCsv,
  resolveCrews,
  splitCsvRows,
  validateCsvRow,
  validateInitialPassword,
  validateUserCsv,
  type AdminCrewRow,
  type AdminDepartmentRow,
  type AdminSessionRow,
  type AdminUserRow,
  type AdminWardRow,
} from '@/lib/admin/users';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const WARDS: AdminWardRow[] = [
  { id: 'ward_14', number: 14, name: 'Mirpur 14', nameBn: 'মিরপুর ১৪' },
  { id: 'ward_15', number: 15, name: 'Mirpur 15', nameBn: 'মিরপুর ১৫' },
];

const DEPARTMENTS: AdminDepartmentRow[] = [
  { id: 'dept_streetlight', name: 'Streetlight', nameBn: 'স্ট্রিটলাইট' },
];

const CREWS: AdminCrewRow[] = [
  {
    id: 'crew_mirpur',
    cityId: 'city_1',
    name: 'Mirpur Streetlight Crew',
    nameBn: 'মিরপুর স্ট্রিটলাইট ক্রু',
    departmentId: 'dept_streetlight',
  },
];

function user(overrides: Partial<AdminUserRow> = {}): AdminUserRow {
  return {
    id: 'user_1',
    cityId: 'city_1',
    role: 'dispatcher',
    name: 'Habib Rahman',
    email: null,
    phone: '+8801711000010',
    wardId: 'ward_14',
    departmentId: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Role mapping
// ---------------------------------------------------------------------------

describe('role mapping', () => {
  it('maps the spec roles onto the Prisma Role enum', () => {
    expect(mapSpecRoleToPrismaRole('dispatcher')).toBe('dispatcher');
    expect(mapSpecRoleToPrismaRole('crew')).toBe('crew');
    // The Prisma `Role` enum has no `supervisor`; the admin role is
    // the closest fit (admins bypass the ward/department scope
    // check, which is the spec's read-only supervisor posture).
    expect(mapSpecRoleToPrismaRole('supervisor')).toBe('admin');
  });

  it('maps the Prisma roles back onto the spec roles', () => {
    expect(mapPrismaRoleToSpecRole('dispatcher')).toBe('dispatcher');
    expect(mapPrismaRoleToSpecRole('crew')).toBe('crew');
    expect(mapPrismaRoleToSpecRole('admin')).toBe('supervisor');
    // Citizens are not provisioned on this page.
    expect(mapPrismaRoleToSpecRole('citizen')).toBeNull();
  });

  it('parses English and Bangla role spellings', () => {
    expect(parseProvisionRole('dispatcher')).toBe('dispatcher');
    expect(parseProvisionRole('DISPATCHER')).toBe('dispatcher');
    expect(parseProvisionRole('crew')).toBe('crew');
    expect(parseProvisionRole('supervisor')).toBe('supervisor');
    expect(parseProvisionRole('citizen')).toBeNull();
    expect(parseProvisionRole('')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Name / status / last-login derivations
// ---------------------------------------------------------------------------

describe('name derivation', () => {
  it('prefers the Bangla column and falls back to `name`', () => {
    const withBn = deriveUserName(
      user({ name: 'Habib Rahman', nameBn: 'হাবিব রহমান' }),
    );
    expect(withBn).toEqual({ nameBn: 'হাবিব রহমান', nameEn: 'Habib Rahman' });

    const withoutBn = deriveUserName(user({ name: 'Habib Rahman' }));
    expect(withoutBn).toEqual({
      nameBn: 'Habib Rahman',
      nameEn: 'Habib Rahman',
    });
  });
});

describe('status derivation', () => {
  it('prefers the explicit `status` column', () => {
    const sessions: AdminSessionRow[] = [
      {
        userId: 'user_1',
        lastSeenAt: '2026-10-26T00:00:00.000Z',
        expiresAt: '2999-01-01T00:00:00.000Z',
      },
    ];
    expect(deriveUserStatus(user({ status: 'disabled' }), sessions)).toBe(
      'disabled',
    );
    expect(deriveUserStatus(user({ status: 'invited' }), sessions)).toBe(
      'invited',
    );
  });

  it('falls back to the session state when the column is absent', () => {
    // No sessions ⇒ never signed in ⇒ invited.
    expect(deriveUserStatus(user(), [])).toBe('invited');
    // A live session ⇒ active.
    expect(
      deriveUserStatus(user(), [
        {
          userId: 'user_1',
          lastSeenAt: '2026-10-26T00:00:00.000Z',
          expiresAt: '2999-01-01T00:00:00.000Z',
        },
      ]),
    ).toBe('active');
    // Only lapsed sessions ⇒ disabled.
    expect(
      deriveUserStatus(user(), [
        {
          userId: 'user_1',
          lastSeenAt: '2020-01-01T00:00:00.000Z',
          expiresAt: '2020-01-02T00:00:00.000Z',
        },
      ]),
    ).toBe('disabled');
  });
});

describe('last-login derivation', () => {
  it('prefers the `lastLoginAt` column', () => {
    const row = user({ lastLoginAt: '2026-10-20T10:00:00.000Z' });
    expect(deriveLastLoginAt(row, [])).toBe('2026-10-20T10:00:00.000Z');
  });

  it('falls back to the max session `lastSeenAt`', () => {
    const row = user();
    const sessions: AdminSessionRow[] = [
      {
        userId: 'user_1',
        lastSeenAt: '2026-10-10T00:00:00.000Z',
        expiresAt: '2026-11-10T00:00:00.000Z',
      },
      {
        userId: 'user_1',
        lastSeenAt: '2026-10-22T00:00:00.000Z',
        expiresAt: '2026-11-22T00:00:00.000Z',
      },
    ];
    expect(deriveLastLoginAt(row, sessions)).toBe('2026-10-22T00:00:00.000Z');
  });

  it('returns null when there is nothing to derive from', () => {
    expect(deriveLastLoginAt(user(), [])).toBeNull();
  });
});

describe('identifier derivation', () => {
  it('prefers the email, then the phone', () => {
    expect(deriveIdentifier(user({ email: 'a@b.com' }))).toBe('a@b.com');
    expect(deriveIdentifier(user())).toBe('+8801711000010');
  });
});

// ---------------------------------------------------------------------------
// Identifier + password validation
// ---------------------------------------------------------------------------

describe('identifier classification', () => {
  it('accepts a mobile', () => {
    expect(classifyIdentifier('+8801711000010')).toEqual({
      ok: true,
      kind: 'phone',
    });
  });

  it('accepts an email', () => {
    expect(classifyIdentifier('habib@example.org')).toEqual({
      ok: true,
      kind: 'email',
    });
  });

  it('rejects an empty, over-long or malformed identifier', () => {
    expect(classifyIdentifier('')).toEqual({
      ok: false,
      reason: 'identifier_required',
    });
    expect(classifyIdentifier('x'.repeat(200))).toEqual({
      ok: false,
      reason: 'identifier_too_long',
    });
    expect(classifyIdentifier('not a phone')).toEqual({
      ok: false,
      reason: 'identifier_invalid',
    });
  });
});

describe('initial password policy', () => {
  it('requires 8+ chars, a digit, an upper and a lower case letter', () => {
    expect(validateInitialPassword('Passw0rd').ok).toBe(true);
    expect(validateInitialPassword('short1A')).toEqual({
      ok: false,
      error: 'password_too_short',
    });
    expect(validateInitialPassword('password1')).toEqual({
      ok: false,
      error: 'password_needs_uppercase',
    });
    expect(validateInitialPassword('PASSWORD1')).toEqual({
      ok: false,
      error: 'password_needs_lowercase',
    });
    expect(validateInitialPassword('Password')).toEqual({
      ok: false,
      error: 'password_needs_digit',
    });
  });

  it('generates a password that satisfies the policy', () => {
    for (let i = 0; i < 25; i += 1) {
      const pw = generateInitialPassword();
      expect(pw.length).toBeGreaterThanOrEqual(8);
      expect(validateInitialPassword(pw).ok).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Crew resolution + list building
// ---------------------------------------------------------------------------

describe('crew resolution', () => {
  it('uses the Crew rows and `User.crewId` when the model is present', () => {
    const users = [
      user({ id: 'u1', role: 'crew', crewId: 'crew_mirpur' }),
      user({ id: 'u2', role: 'crew', crewId: 'crew_mirpur' }),
    ];
    const crews = resolveCrews(users, CREWS, WARDS, DEPARTMENTS);
    expect(crews).toHaveLength(1);
    expect(crews[0].id).toBe('crew_mirpur');
    expect(crews[0].memberIds.sort()).toEqual(['u1', 'u2']);
  });

  it('synthesises crews from (ward, department) when it is not', () => {
    const users = [
      user({ id: 'u1', role: 'crew', wardId: 'ward_14', departmentId: 'dept_streetlight' }),
    ];
    const crews = resolveCrews(users, null, WARDS, DEPARTMENTS);
    expect(crews).toHaveLength(1);
    expect(crews[0].id).toBe(crewKeyFor(users[0]));
    expect(crews[0].name).toContain('Streetlight');
  });
});

describe('buildUsersList', () => {
  const users = [
    user({ id: 'u_disp', role: 'dispatcher', wardId: 'ward_14' }),
    user({ id: 'u_crew', role: 'crew', crewId: 'crew_mirpur' }),
    user({ id: 'u_sup', role: 'admin' }),
    user({ id: 'u_cit', role: 'citizen' }),
  ];

  it('excludes citizens and counts by role', () => {
    const result = buildUsersList(users, [], WARDS, DEPARTMENTS, CREWS);
    // Cards are sorted by the English display name; every fixture
    // shares the same name, so the sort is stable on the input order.
    expect(result.users.map((u) => u.id)).toEqual([
      'u_disp',
      'u_crew',
      'u_sup',
    ]);
    expect(result.counts).toEqual({
      all: 3,
      dispatcher: 1,
      crew: 1,
      supervisor: 1,
    });
  });

  it('gates the launch button on one dispatcher AND one crew', () => {
    const withCrew = buildUsersList(users, [], WARDS, DEPARTMENTS, CREWS);
    expect(withCrew.canLaunch).toBe(true);

    const noCrew = buildUsersList(
      [user({ id: 'u_disp', role: 'dispatcher' })],
      [],
      WARDS,
      DEPARTMENTS,
      CREWS,
    );
    expect(noCrew.canLaunch).toBe(false);

    const noDispatcher = buildUsersList(
      [user({ id: 'u_crew', role: 'crew', crewId: 'crew_mirpur' })],
      [],
      WARDS,
      DEPARTMENTS,
      CREWS,
    );
    expect(noDispatcher.canLaunch).toBe(false);
  });

  it('filters the cards down to one role tab', () => {
    const result = buildUsersList(users, [], WARDS, DEPARTMENTS, CREWS);
    expect(filterByTab(result.users, 'all')).toHaveLength(3);
    expect(filterByTab(result.users, 'dispatcher').map((u) => u.id)).toEqual([
      'u_disp',
    ]);
    expect(filterByTab(result.users, 'crew').map((u) => u.id)).toEqual([
      'u_crew',
    ]);
    expect(filterByTab(result.users, 'supervisor').map((u) => u.id)).toEqual([
      'u_sup',
    ]);
  });
});

// ---------------------------------------------------------------------------
// CSV parsing + validation
// ---------------------------------------------------------------------------

describe('CSV splitting', () => {
  it('handles CRLF, LF and quoted cells with embedded commas', () => {
    const rows = splitCsvRows('a,b\r\n"x,y",z\n');
    expect(rows).toEqual([
      ['a', 'b'],
      ['x,y', 'z'],
    ]);
  });

  it('strips a leading BOM', () => {
    const rows = splitCsvRows('\ufeffa,b\n');
    expect(rows[0]).toEqual(['a', 'b']);
  });

  it('unescapes doubled quotes', () => {
    const rows = splitCsvRows('"say ""hi""",b\n');
    expect(rows[0][0]).toBe('say "hi"');
  });
});

describe('CSV parsing', () => {
  it('consumes an optional header row and numbers rows from the file', () => {
    const parsed = parseUserCsv(
      'name_bn,name_en,identifier,email,role,wards_or_crew,department\n' +
        'A,A,+8801711000001,,dispatcher,ward_14,\n' +
        'B,B,+8801711000002,,dispatcher,ward_15,\n',
    );
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].rowNumber).toBe(2);
    expect(parsed.rows[1].rowNumber).toBe(3);
  });

  it('assumes the column order when there is no header', () => {
    const parsed = parseUserCsv('A,A,+8801711000001,,dispatcher,ward_14,\n');
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].cells.role).toBe('dispatcher');
    expect(parsed.rows[0].cells.wards_or_crew).toBe('ward_14');
  });

  it('skips fully blank lines', () => {
    const parsed = parseUserCsv(
      'name_bn,name_en,identifier,email,role,wards_or_crew,department\n\n',
    );
    expect(parsed.rows).toHaveLength(0);
  });
});

describe('CSV row validation', () => {
  const context = {
    wardIds: ['ward_14', 'ward_15'],
    crewIds: ['crew_mirpur'],
    departmentIds: ['dept_streetlight'],
  };

  it('accepts a well-formed dispatcher row', () => {
    const parsed = parseUserCsv(
      'name_bn,name_en,identifier,email,role,wards_or_crew,department\n' +
        'A,A,+8801711000001,,dispatcher,ward_14,\n',
    );
    const result = validateCsvRow(parsed.rows[0], context);
    expect(result.valid).toBe(true);
    expect(result.parsed?.role).toBe('dispatcher');
    expect(result.parsed?.wardIds).toEqual(['ward_14']);
  });

  it('rejects a dispatcher with no ward', () => {
    const parsed = parseUserCsv(
      'name_bn,name_en,identifier,email,role,wards_or_crew,department\n' +
        'A,A,+8801711000001,,dispatcher,,\n',
    );
    const result = validateCsvRow(parsed.rows[0], context);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('dispatcher_needs_ward');
  });

  it('rejects a crew row with no crew or no department', () => {
    const parsed = parseUserCsv(
      'name_bn,name_en,identifier,email,role,wards_or_crew,department\n' +
        'A,A,+8801711000001,,crew,,\n' +
        'B,B,+8801711000002,,crew,crew_mirpur,\n',
    );
    const first = validateCsvRow(parsed.rows[0], context);
    expect(first.errors).toContain('crew_needs_crew');
    expect(first.errors).toContain('crew_needs_department');

    const second = validateCsvRow(parsed.rows[1], context);
    expect(second.errors).toContain('crew_needs_department');
  });

  it('rejects an unknown ward, crew or department', () => {
    const parsed = parseUserCsv(
      'name_bn,name_en,identifier,email,role,wards_or_crew,department\n' +
        'A,A,+8801711000001,,dispatcher,ward_99,\n' +
        'B,B,+8801711000002,,crew,crew_nope,dept_nope\n',
    );
    expect(validateCsvRow(parsed.rows[0], context).errors).toContain(
      'ward_unknown',
    );
    const crewErrors = validateCsvRow(parsed.rows[1], context).errors;
    expect(crewErrors).toContain('crew_unknown');
    expect(crewErrors).toContain('department_unknown');
  });

  it('rejects a supervisor with wards or a crew', () => {
    const parsed = parseUserCsv(
      'name_bn,name_en,identifier,email,role,wards_or_crew,department\n' +
        'A,A,sup@example.org,,supervisor,ward_14,\n',
    );
    const result = validateCsvRow(parsed.rows[0], context);
    expect(result.errors).toContain('supervisor_takes_no_wards');
  });

  it('rejects an invalid role and an invalid identifier', () => {
    const parsed = parseUserCsv(
      'name_bn,name_en,identifier,email,role,wards_or_crew,department\n' +
        'A,A,not-an-id,,mayor,,\n',
    );
    const result = validateCsvRow(parsed.rows[0], context);
    expect(result.errors).toContain('role_invalid');
    expect(result.errors).toContain('identifier_invalid');
  });

  it('validates every row independently', () => {
    const result = validateUserCsv(
      'name_bn,name_en,identifier,email,role,wards_or_crew,department\n' +
        'A,A,+8801711000001,,dispatcher,ward_14,\n' +
        'B,B,+8801711000002,,dispatcher,,\n' +
        'C,C,+8801711000003,,dispatcher,ward_15,\n',
      context,
    );
    expect(result.valid).toHaveLength(2);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].rowNumber).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// CSV serialisation
// ---------------------------------------------------------------------------

describe('CSV escaping', () => {
  it('quotes cells that contain a comma, a quote or a newline', () => {
    expect(escapeCsvCell('plain')).toBe('plain');
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell('line\nbreak')).toBe('"line\nbreak"');
    expect(escapeCsvCell(null)).toBe('');
  });
});
