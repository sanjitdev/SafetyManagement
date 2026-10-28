/**
 * Admin user-provisioning domain logic (lib/admin/users.ts).
 *
 * Backs the 4.6 User Provisioning surface
 * (`/admin/cities/[id]/users`) and its six API routes.
 *
 * ---------------------------------------------------------------------------
 * SCHEMA STATUS — READ THIS FIRST
 * ---------------------------------------------------------------------------
 *
 * The concurrent Prisma migration (`prisma/migrations/
 * 20261027140000_platform_gaps/`) landed WHILE this module was
 * being written. The schema NOW has:
 *
 *   - `User.status`      String  @default("active")
 *                         ('active' | 'invited' | 'disabled')
 *   - `User.nameBn`      String?
 *   - `User.lastLoginAt` DateTime?
 *   - `User.disabledAt`  DateTime?
 *   - `User.crewId`      String?  → the new `Crew` model
 *   - `Crew`             (id, cityId, name, nameBn, departmentId)
 *   - `SlaPolicy`        (id, cityId, categoryId, resolveHours)
 *   - `City.status`      String  @default("setup")
 *
 * So this module reads the REAL COLUMNS first and only falls back
 * to a DERIVED value when the column is absent. The fallback is
 * needed because the in-memory DEV STORE (`lib/dev-store.ts`) has
 * NOT been extended with the new columns — it is a hand-written
 * mirror of the Prisma model and is owned by another agent. The
 * dev store therefore returns rows with the new fields `undefined`.
 *
 * The mapping is:
 *
 *   | Spec field      | Prisma column (prod)          | Dev-store fallback        |
 *   |-----------------|-------------------------------|---------------------------|
 *   | status pill     | `User.status`                 | derived from sessions     |
 *   | Bangla name     | `User.nameBn ?? User.name`    | `User.name`               |
 *   | last login      | `User.lastLoginAt`            | MAX(`Session.lastSeenAt`) |
 *   | crew            | `User.crewId` → `Crew` row    | synthetic (ward,dept) key |
 *
 * `SlaPolicy` is NOT consulted anywhere on the 4.6/4.7 surfaces:
 * the 4.7 "avg time to resolve" is computed from the ticket rows
 * (`resolvedAt - createdAt`).
 *
 * ---------------------------------------------------------------------------
 * ROLE MAPPING
 * ---------------------------------------------------------------------------
 *
 * The Prisma `Role` enum is `citizen | dispatcher | crew | admin`.
 * The 4.6 spec's three provisioning roles are Dispatcher, Crew
 * member and Supervisor. There is NO `supervisor` role in the
 * schema. The v1 mapping is:
 *
 *   - Dispatcher   → `role: 'dispatcher'`
 *   - Crew member  → `role: 'crew'`
 *   - Supervisor   → `role: 'admin'`  (read-only across the city —
 *                   the admin role already bypasses the
 *                   (ward, department) scope check in
 *                   `lib/auth/guards.ts` `requireScope`, which is
 *                   exactly the "read-only, no ward/crew
 *                   assignment" posture the spec asks for)
 *   - Citizen      → `role: 'citizen'` (never provisioned here;
 *                   citizens self-register)
 *
 * `mapSpecRoleToPrismaRole` is the single place that translation
 * happens. TODO(migration): if a `supervisor` role is added to the
 * `Role` enum, change `supervisor` to map to `'supervisor'`.
 *
 * ---------------------------------------------------------------------------
 * IDENTIFIER
 * ---------------------------------------------------------------------------
 *
 * The spec calls the identifier a "staff ID or mobile". The
 * `User` model has `phone String?` (unique per city via
 * `@@unique([cityId, phone])`) and `email String?` (unique per
 * city). There is no `staffId` column. The v1 mapping stores the
 * identifier in `phone` when it looks like a mobile number and in
 * `email` when it looks like an email address; a non-email,
 * non-mobile identifier is rejected by the Zod layer with
 * `identifier_invalid`. Uniqueness is therefore enforced by the
 * database's `(cityId, phone)` / `(cityId, email)` indexes AND
 * re-checked in the route with an explicit lookup, which returns
 * `409 identifier_taken`.
 *
 * ---------------------------------------------------------------------------
 * CSV IMPORT
 * ---------------------------------------------------------------------------
 *
 * The spec's CSV header is:
 *   name_bn, name_en, identifier, email, role, wards_or_crew, department
 *
 * `parseUserCsv` handles RFC-4180 quoting, a UTF-8 BOM, CRLF or LF
 * line endings, and an OPTIONAL header row (the column ORDER is
 * what matters; a file that starts directly with a data row is
 * accepted).
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The three provisioning roles the 4.6 spec exposes. */
export type ProvisionRole = 'dispatcher' | 'crew' | 'supervisor';

/** The status pill values the 4.6 spec exposes. */
export type UserStatus = 'active' | 'invited' | 'disabled';

/** The role tab values the 4.6 spec exposes. */
export type UserTab = 'all' | 'dispatcher' | 'crew' | 'supervisor';

export const PROVISION_ROLES: readonly ProvisionRole[] = [
  'dispatcher',
  'crew',
  'supervisor',
];

export const USER_STATUSES: readonly UserStatus[] = [
  'active',
  'invited',
  'disabled',
];

export const USER_TABS: readonly UserTab[] = [
  'all',
  'dispatcher',
  'crew',
  'supervisor',
];

/**
 * A raw user row as it comes out of the db facade.
 *
 * The lifecycle / naming / crew fields are OPTIONAL because the
 * in-memory dev store does not carry them yet (see the header
 * comment). A missing field means "fall back to the derivation".
 */
export interface AdminUserRow {
  id: string;
  cityId: string;
  role: string;
  name: string;
  nameBn?: string | null;
  email: string | null;
  phone: string | null;
  status?: string | null;
  lastLoginAt?: string | Date | null;
  crewId?: string | null;
  wardId: string | null;
  departmentId: string | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
}

/** A session row, trimmed to what the derivation needs. */
export interface AdminSessionRow {
  userId: string;
  lastSeenAt: string | Date;
  expiresAt: string | Date;
}

/** A ward row, trimmed to what the derivation needs. */
export interface AdminWardRow {
  id: string;
  number: number;
  name: string;
  nameBn: string | null;
}

/** A department row, trimmed to what the derivation needs. */
export interface AdminDepartmentRow {
  id: string;
  name: string;
  nameBn: string | null;
}

/** A crew row. */
export interface AdminCrewRow {
  id: string;
  cityId?: string;
  name: string;
  nameBn: string | null;
  departmentId: string | null;
}

/** The card the 4.6 list column renders. */
export interface AdminUserCard {
  id: string;
  /** Bangla display name. */
  nameBn: string;
  /** English display name. */
  nameEn: string;
  /** Staff ID or mobile — the spec's "identifier". */
  identifier: string;
  email: string | null;
  /** The provisioning role (never 'citizen'). */
  role: ProvisionRole;
  /** Raw Prisma role, for the API consumer. */
  prismaRole: string;
  wardIds: string[];
  /** Ward display names, English. */
  wardLabels: string[];
  /** Ward display names, Bangla (falls back to the English label). */
  wardLabelsBn: string[];
  crewId: string | null;
  /** Crew display name, English. */
  crewLabel: string | null;
  /** Crew display name, Bangla (falls back to the English label). */
  crewLabelBn: string | null;
  departmentId: string | null;
  /** Department display name, English. */
  departmentLabel: string | null;
  /** Department display name, Bangla (falls back to the English label). */
  departmentLabelBn: string | null;
  status: UserStatus;
  lastLoginAt: string | null;
}

/** A crew as the 4.6 page consumes it. */
export interface AdminCrew {
  id: string;
  name: string;
  nameBn: string;
  wardId: string | null;
  departmentId: string | null;
  memberIds: string[];
}

export interface AdminUserRoleCounts {
  all: number;
  dispatcher: number;
  crew: number;
  supervisor: number;
}

export interface AdminUsersListResult {
  users: AdminUserCard[];
  counts: AdminUserRoleCounts;
  crews: AdminCrew[];
  wards: AdminWardRow[];
  departments: AdminDepartmentRow[];
  /** True when at least one dispatcher AND at least one crew exist. */
  canLaunch: boolean;
}

// ---------------------------------------------------------------------------
// Role mapping
// ---------------------------------------------------------------------------

/**
 * Map a spec provisioning role onto the Prisma `Role` enum.
 */
export function mapSpecRoleToPrismaRole(role: ProvisionRole): string {
  switch (role) {
    case 'dispatcher':
      return 'dispatcher';
    case 'crew':
      return 'crew';
    case 'supervisor':
      // No `supervisor` role in the Prisma `Role` enum. The admin
      // role is the closest fit: it bypasses the (ward, department)
      // scope check, which is the spec's "read-only, no assignment"
      // posture. TODO(migration): add `supervisor` to the enum.
      return 'admin';
    default:
      return 'citizen';
  }
}

/**
 * Reverse of `mapSpecRoleToPrismaRole` — the role a card displays.
 */
export function mapPrismaRoleToSpecRole(role: string): ProvisionRole | null {
  switch (role) {
    case 'dispatcher':
      return 'dispatcher';
    case 'crew':
      return 'crew';
    case 'admin':
      return 'supervisor';
    default:
      return null;
  }
}

/** Parse a free-text role string from a CSV cell. */
export function parseProvisionRole(raw: string): ProvisionRole | null {
  const v = raw.trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (v === 'dispatcher' || v === 'ডিসপ্যাচার') return 'dispatcher';
  if (v === 'crew' || v === 'crewmember' || v === 'ক্রু' || v === 'ক্রুসদস্য') {
    return 'crew';
  }
  if (v === 'supervisor' || v === 'সুপারভাইজার') return 'supervisor';
  return null;
}

// ---------------------------------------------------------------------------
// Name / status / last-login derivation
// ---------------------------------------------------------------------------

/**
 * Bangla + English display names for a user row.
 *
 * Reads `User.nameBn` when the column is present (production);
 * falls back to `User.name` for both slots when it is not (the
 * dev store).
 */
export function deriveUserName(
  row: Pick<AdminUserRow, 'name' | 'nameBn'>,
): { nameBn: string; nameEn: string } {
  const nameBn =
    row.nameBn !== undefined && row.nameBn !== null && row.nameBn !== ''
      ? row.nameBn
      : row.name;
  return { nameBn, nameEn: row.name };
}

function toIso(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

/**
 * Derive the status pill.
 *
 * Reads `User.status` when the column is present. When it is
 * absent (dev store), derives it from the session history:
 *   - `invited`  → the user has never had a session row.
 *   - `active`   → the user has at least one live session.
 *   - `disabled` → every session has lapsed.
 */
export function deriveUserStatus(
  row: Pick<AdminUserRow, 'status'>,
  sessions: AdminSessionRow[],
): UserStatus {
  const raw = row.status?.trim().toLowerCase();
  if (raw === 'active' || raw === 'invited' || raw === 'disabled') {
    return raw;
  }
  if (sessions.length === 0) return 'invited';
  const now = Date.now();
  const live = sessions.some((s) => {
    const exp = toIso(s.expiresAt);
    return exp !== null && Date.parse(exp) > now;
  });
  if (live) return 'active';
  return 'disabled';
}

/**
 * Derive "last login".
 *
 * Reads `User.lastLoginAt` when the column is present; otherwise
 * falls back to MAX(`Session.lastSeenAt`) — the closest proxy for
 * "when we last saw this person".
 */
export function deriveLastLoginAt(
  row: Pick<AdminUserRow, 'lastLoginAt'>,
  sessions: AdminSessionRow[],
): string | null {
  const direct = toIso(row.lastLoginAt);
  if (direct !== null) return direct;
  let max: string | null = null;
  let maxMs = -Infinity;
  for (const s of sessions) {
    const iso = toIso(s.lastSeenAt);
    if (iso === null) continue;
    const ms = Date.parse(iso);
    if (ms > maxMs) {
      maxMs = ms;
      max = iso;
    }
  }
  return max;
}

/**
 * The identifier the card shows. Prefers the email when the row
 * was provisioned with an email identifier, otherwise the phone.
 */
export function deriveIdentifier(
  row: Pick<AdminUserRow, 'email' | 'phone'>,
): string {
  return row.email ?? row.phone ?? '';
}

// ---------------------------------------------------------------------------
// Crew resolution
// ---------------------------------------------------------------------------

/**
 * The synthetic crew key for a crew-role user row, used ONLY when
 * the `Crew` model is unavailable (dev store).
 */
export function crewKeyFor(
  row: Pick<AdminUserRow, 'wardId' | 'departmentId'>,
): string {
  if (!row.wardId && !row.departmentId) return 'crew_unassigned';
  return `crew_${row.wardId ?? 'none'}__${row.departmentId ?? 'none'}`;
}

function parseCrewKey(key: string): {
  wardId: string | null;
  departmentId: string | null;
} {
  if (key === 'crew_unassigned') return { wardId: null, departmentId: null };
  const m = /^crew_(.+)__(.+)$/.exec(key);
  if (!m) return { wardId: null, departmentId: null };
  return {
    wardId: m[1] === 'none' ? null : m[1],
    departmentId: m[2] === 'none' ? null : m[2],
  };
}

/**
 * Resolve the city's crews.
 *
 * When the `Crew` model is available (production), the crews come
 * from the `Crew` rows and the members from `User.crewId`. When it
 * is not (dev store), the crews are synthesised from the
 * (ward, department) pair each crew member is scoped to.
 */
export function resolveCrews(
  users: AdminUserRow[],
  crews: AdminCrewRow[] | null,
  wards: AdminWardRow[],
  departments: AdminDepartmentRow[],
): AdminCrew[] {
  const wardById = new Map(wards.map((w) => [w.id, w]));
  const deptById = new Map(departments.map((d) => [d.id, d]));

  if (crews && crews.length > 0) {
    const out: AdminCrew[] = crews.map((c) => ({
      id: c.id,
      name: c.name,
      nameBn: c.nameBn ?? c.name,
      wardId: null,
      departmentId: c.departmentId,
      memberIds: users
        .filter((u) => u.crewId === c.id)
        .map((u) => u.id),
    }));
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }

  // Dev-store fallback: synthesise from (ward, department).
  const byKey = new Map<string, string[]>();
  for (const u of users) {
    if (u.role !== 'crew') continue;
    const key = u.crewId ?? crewKeyFor(u);
    const list = byKey.get(key);
    if (list) list.push(u.id);
    else byKey.set(key, [u.id]);
  }
  const out: AdminCrew[] = [];
  for (const [key, memberIds] of byKey) {
    const { wardId, departmentId } = parseCrewKey(key);
    const ward = wardId ? wardById.get(wardId) : undefined;
    const dept = departmentId ? deptById.get(departmentId) : undefined;
    const wardName = ward?.name ?? '';
    const deptName = dept?.name ?? '';
    const wardNameBn = ward?.nameBn ?? wardName;
    const deptNameBn = dept?.nameBn ?? deptName;
    out.push({
      id: key,
      name: [wardName, deptName].filter(Boolean).join(' — ') || 'Crew',
      nameBn: [wardNameBn, deptNameBn].filter(Boolean).join(' — ') || 'ক্রু',
      wardId,
      departmentId,
      memberIds,
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

// ---------------------------------------------------------------------------
// Card building
// ---------------------------------------------------------------------------

function indexSessions(
  sessions: AdminSessionRow[],
): Map<string, AdminSessionRow[]> {
  const byUser = new Map<string, AdminSessionRow[]>();
  for (const s of sessions) {
    const list = byUser.get(s.userId);
    if (list) list.push(s);
    else byUser.set(s.userId, [s]);
  }
  return byUser;
}

/**
 * Build the list payload the 4.6 page renders: the user cards, the
 * per-tab counts, the resolved crews, and the `canLaunch` flag that
 * drives the "Setup complete — launch city" button's `disabled`
 * state.
 */
export function buildUsersList(
  users: AdminUserRow[],
  sessions: AdminSessionRow[],
  wards: AdminWardRow[],
  departments: AdminDepartmentRow[],
  crewRows: AdminCrewRow[] | null = null,
): AdminUsersListResult {
  const sessionsByUser = indexSessions(sessions);
  const wardById = new Map(wards.map((w) => [w.id, w]));
  const deptById = new Map(departments.map((d) => [d.id, d]));
  const crews = resolveCrews(users, crewRows, wards, departments);
  const crewByMember = new Map<string, AdminCrew>();
  for (const crew of crews) {
    for (const memberId of crew.memberIds) crewByMember.set(memberId, crew);
  }

  const cards: AdminUserCard[] = [];
  const counts: AdminUserRoleCounts = {
    all: 0,
    dispatcher: 0,
    crew: 0,
    supervisor: 0,
  };

  for (const u of users) {
    const role = mapPrismaRoleToSpecRole(u.role);
    if (!role) continue; // citizens are not provisioned here
    const userSessions = sessionsByUser.get(u.id) ?? [];
    const { nameBn, nameEn } = deriveUserName(u);
    const ward = u.wardId ? wardById.get(u.wardId) : undefined;
    const dept = u.departmentId ? deptById.get(u.departmentId) : undefined;
    const crew = crewByMember.get(u.id) ?? null;

    cards.push({
      id: u.id,
      nameBn,
      nameEn,
      identifier: deriveIdentifier(u),
      email: u.email,
      role,
      prismaRole: u.role,
      wardIds: u.wardId ? [u.wardId] : [],
      wardLabels: ward ? [ward.name] : [],
      wardLabelsBn: ward ? [ward.nameBn ?? ward.name] : [],
      crewId: u.crewId ?? crew?.id ?? null,
      crewLabel: crew?.name ?? null,
      crewLabelBn: crew ? crew.nameBn || crew.name : null,
      departmentId: u.departmentId,
      departmentLabel: dept?.name ?? null,
      departmentLabelBn: dept ? dept.nameBn ?? dept.name : null,
      status: deriveUserStatus(u, userSessions),
      lastLoginAt: deriveLastLoginAt(u, userSessions),
    });

    counts.all += 1;
    counts[role] += 1;
  }

  cards.sort((a, b) => a.nameEn.localeCompare(b.nameEn));

  return {
    users: cards,
    counts,
    crews,
    wards,
    departments,
    canLaunch: counts.dispatcher > 0 && counts.crew > 0,
  };
}

/** Filter the built cards down to one role tab. */
export function filterByTab(
  cards: AdminUserCard[],
  tab: UserTab,
): AdminUserCard[] {
  if (tab === 'all') return cards;
  return cards.filter((c) => c.role === tab);
}

// ---------------------------------------------------------------------------
// Identifier validation
// ---------------------------------------------------------------------------

const MOBILE_RE = /^\+?[0-9][0-9\s-]{6,19}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Decide whether the spec's "staff ID or mobile" identifier is
 * acceptable, and which column it should live in.
 */
export function classifyIdentifier(
  identifier: string,
): { ok: true; kind: 'phone' | 'email' } | { ok: false; reason: string } {
  const v = identifier.trim();
  if (v.length === 0) return { ok: false, reason: 'identifier_required' };
  if (v.length > 120) return { ok: false, reason: 'identifier_too_long' };
  if (EMAIL_RE.test(v)) return { ok: true, kind: 'email' };
  if (MOBILE_RE.test(v)) return { ok: true, kind: 'phone' };
  return { ok: false, reason: 'identifier_invalid' };
}

// ---------------------------------------------------------------------------
// Password
// ---------------------------------------------------------------------------

/**
 * The initial-password policy the 4.6 spec states: "≥ 8 chars,
 * mixed". `lib/auth/password.ts` `hashPassword` enforces the
 * platform floor (≥ 8 chars + ≥ 1 digit); the spec's "mixed" adds
 * an upper-case and a lower-case letter, so the provisioning layer
 * enforces the stricter rule and reports a typed error.
 */
export function validateInitialPassword(password: string): {
  ok: boolean;
  error?: string;
} {
  if (password.length < 8) return { ok: false, error: 'password_too_short' };
  if (!/\d/.test(password)) return { ok: false, error: 'password_needs_digit' };
  if (!/[a-z]/.test(password)) return { ok: false, error: 'password_needs_lowercase' };
  if (!/[A-Z]/.test(password)) return { ok: false, error: 'password_needs_uppercase' };
  return { ok: true };
}

const PASSWORD_ALPHABET =
  'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Generate an initial password that always satisfies
 * `validateInitialPassword`.
 */
export function generateInitialPassword(length = 12): string {
  const len = Math.max(8, Math.min(64, Math.floor(length) || 12));
  const chars: string[] = [];
  const pick = (re: RegExp) => {
    let c = '';
    do {
      c = PASSWORD_ALPHABET[Math.floor(Math.random() * PASSWORD_ALPHABET.length)];
    } while (!re.test(c));
    return c;
  };
  chars.push(pick(/[a-z]/));
  chars.push(pick(/[A-Z]/));
  chars.push(/\d/.test(PASSWORD_ALPHABET[0]) ? pick(/\d/) : '7');
  while (chars.length < len) {
    chars.push(
      PASSWORD_ALPHABET[Math.floor(Math.random() * PASSWORD_ALPHABET.length)],
    );
  }
  // Fisher-Yates so the guaranteed characters aren't always first.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = chars[i];
    chars[i] = chars[j];
    chars[j] = tmp;
  }
  return chars.join('');
}

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

export const USER_CSV_COLUMNS = [
  'name_bn',
  'name_en',
  'identifier',
  'email',
  'role',
  'wards_or_crew',
  'department',
] as const;

export const USER_CSV_TEMPLATE =
  'name_bn,name_en,identifier,email,role,wards_or_crew,department\n' +
  'Rahim Uddin,Rahim Uddin,+8801711000010,rahim@example.org,dispatcher,ward_14,\n' +
  'Karim Mia,Karim Mia,+8801711000011,,crew,,dept_streetlight\n' +
  'Salma Begum,Salma Begum,supervisor@example.org,,supervisor,,\n';

export interface ParsedCsvRow {
  /** 1-based row number as it appears in the file (header = row 1). */
  rowNumber: number;
  cells: Record<string, string>;
}

export interface ParsedCsvResult {
  rows: ParsedCsvRow[];
}

/**
 * Split a CSV document into rows of raw cells. RFC-4180 quoting
 * (doubled quotes escape a literal quote), CRLF or LF endings, and
 * a leading UTF-8 BOM are all handled.
 */
export function splitCsvRows(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let sawAnyChar = false;

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      sawAnyChar = true;
      continue;
    }
    if (ch === ',') {
      row.push(cell);
      cell = '';
      sawAnyChar = true;
      continue;
    }
    if (ch === '\r') {
      if (src[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      sawAnyChar = false;
      continue;
    }
    if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      sawAnyChar = false;
      continue;
    }
    cell += ch;
    sawAnyChar = true;
  }
  if (sawAnyChar || cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/**
 * Parse a CSV document into named rows.
 *
 * The header row is OPTIONAL: when the first row's first cell is
 * `name_bn` (case-insensitive) it is consumed as the header;
 * otherwise the column order from `USER_CSV_COLUMNS` is assumed.
 */
export function parseUserCsv(text: string): ParsedCsvResult {
  const raw = splitCsvRows(text);
  if (raw.length === 0) return { rows: [] };

  const first = raw[0].map((c) => c.trim().toLowerCase());
  const hasHeader = first[0] === 'name_bn';
  const body = hasHeader ? raw.slice(1) : raw;

  const rows: ParsedCsvRow[] = [];
  for (let i = 0; i < body.length; i += 1) {
    const cellsArr = body[i];
    // Skip fully-blank lines.
    if (cellsArr.every((c) => c.trim() === '')) continue;
    const cells: Record<string, string> = {};
    for (let c = 0; c < USER_CSV_COLUMNS.length; c += 1) {
      cells[USER_CSV_COLUMNS[c]] = (cellsArr[c] ?? '').trim();
    }
    rows.push({ rowNumber: hasHeader ? i + 2 : i + 1, cells });
  }
  return { rows };
}

// ---------------------------------------------------------------------------
// CSV row validation
// ---------------------------------------------------------------------------

/** The result of validating one CSV row. */
export interface CsvRowValidation {
  rowNumber: number;
  valid: boolean;
  /** The parsed row, when valid. */
  parsed?: CsvUserInput;
  /** Per-field error codes, when invalid. */
  errors: string[];
  /** The raw cells, so the UI can render the failed row for fixing. */
  cells: Record<string, string>;
}

/** The normalised shape of a user-provisioning input. */
export interface CsvUserInput {
  nameBn: string;
  nameEn: string;
  identifier: string;
  email: string | null;
  role: ProvisionRole;
  wardIds: string[];
  crewId: string | null;
  departmentId: string | null;
}

export const UserCsvRowSchema = z.object({
  name_bn: z.string().trim().min(1, 'name_bn_required').max(120),
  name_en: z.string().trim().min(1, 'name_en_required').max(120),
  identifier: z.string().trim().min(1, 'identifier_required').max(120),
  email: z
    .string()
    .trim()
    .max(160)
    .refine(
      (v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      'email_invalid',
    )
    .transform((v) => (v === '' ? '' : v)),
  role: z.string().trim().min(1, 'role_required'),
  wards_or_crew: z.string().trim().max(200),
  department: z.string().trim().max(120),
});

/**
 * Validate one parsed CSV row against the 4.6 rules:
 *   - role must be one of dispatcher / crew / supervisor
 *   - dispatchers must have ≥ 1 ward
 *   - crew members must have exactly 1 crew and 1 department
 *   - the identifier must be a mobile or an email
 */
export function validateCsvRow(
  row: ParsedCsvRow,
  context: {
    wardIds: string[];
    crewIds: string[];
    departmentIds: string[];
  },
): CsvRowValidation {
  const errors: string[] = [];
  const parsedShape = UserCsvRowSchema.safeParse(row.cells);
  if (!parsedShape.success) {
    for (const issue of parsedShape.error.issues) {
      errors.push(issue.message);
    }
  }

  const cells = row.cells;
  const role = parseProvisionRole(cells.role ?? '');
  if (!role) errors.push('role_invalid');

  const identifierKind = classifyIdentifier(cells.identifier ?? '');
  if (!identifierKind.ok) errors.push(identifierKind.reason);

  const wardIds = (cells.wards_or_crew ?? '')
    .split(/[|;,]/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0);
  const department = (cells.department ?? '').trim();
  const crewRaw = (cells.wards_or_crew ?? '').trim();

  if (role === 'dispatcher') {
    if (wardIds.length === 0) errors.push('dispatcher_needs_ward');
    for (const w of wardIds) {
      if (!context.wardIds.includes(w)) errors.push('ward_unknown');
    }
  }
  if (role === 'crew') {
    if (crewRaw.length === 0) errors.push('crew_needs_crew');
    else if (!context.crewIds.includes(crewRaw)) errors.push('crew_unknown');
    if (department.length === 0) errors.push('crew_needs_department');
    else if (!context.departmentIds.includes(department)) {
      errors.push('department_unknown');
    }
  }
  if (role === 'supervisor') {
    if (wardIds.length > 0) errors.push('supervisor_takes_no_wards');
    if (crewRaw.length > 0) errors.push('supervisor_takes_no_crew');
  }

  const result: CsvRowValidation = {
    rowNumber: row.rowNumber,
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    cells,
  };
  if (result.valid && role) {
    result.parsed = {
      nameBn: cells.name_bn,
      nameEn: cells.name_en,
      identifier: cells.identifier,
      email: cells.email ? cells.email : null,
      role,
      wardIds: role === 'dispatcher' ? wardIds : [],
      crewId: role === 'crew' ? crewRaw || null : null,
      departmentId: role === 'crew' && department ? department : null,
    };
  }
  return result;
}

/**
 * Validate a whole CSV document. Rows are validated independently so
 * the importer can save the good rows and report the bad ones with
 * their row numbers (the 4.6 spec's "errors are shown with row
 * numbers").
 */
export function validateUserCsv(
  text: string,
  context: {
    wardIds: string[];
    crewIds: string[];
    departmentIds: string[];
  },
): {
  parsed: ParsedCsvResult;
  results: CsvRowValidation[];
  valid: CsvUserInput[];
  failed: CsvRowValidation[];
} {
  const parsed = parseUserCsv(text);
  const results = parsed.rows.map((row) => validateCsvRow(row, context));
  return {
    parsed,
    results,
    valid: results.filter((r) => r.valid && r.parsed).map((r) => r.parsed!),
    failed: results.filter((r) => !r.valid),
  };
}

// ---------------------------------------------------------------------------
// CSV serialisation
// ---------------------------------------------------------------------------

/** Escape one CSV cell. */
export function escapeCsvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Build a CSV document from a header row + data rows. */
export function buildCsvDocument(
  header: readonly string[],
  rows: readonly (readonly unknown[])[],
): string {
  const lines: string[] = [];
  lines.push(header.map(escapeCsvCell).join(','));
  for (const row of rows) {
    lines.push(row.map(escapeCsvCell).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}
