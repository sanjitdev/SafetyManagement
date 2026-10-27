/**
 * Vitest: audit-query LIST path (`listAuditEntries`).
 *
 * Companion to `tests/unit/audit-query.test.ts` (which covers the
 * pure `buildWhere` / `clampLimit` helpers). This file exercises the
 * DATABASE-backed half of `lib/admin/audit-query.ts`:
 *
 *  1. The date-window filter.
 *  2. The `actorId` filter.
 *  3. The `action` filter (an ARRAY — `AuditQueryFilters.action`).
 *  4. The actor HYDRATION — a known actor is rendered as
 *     `"<name> (<role>)"`, an unknown actor falls back to the raw id.
 *  5. The `limit` is applied and `nextCursor` is set when there are
 *     MORE rows than the limit; `nextCursor` is `null` otherwise.
 *  6. The `entityType` filter (also an array).
 *
 * The dev store is used as the backend (`CITYFIX_DEV_STORE=1`).
 *
 * The fixture timestamps are anchored to a FIXED window rather than
 * "now", so the assertions do not drift with the wall clock.
 */

import { describe, expect, test, beforeEach } from 'vitest';
import { listAuditEntries } from '@/lib/admin/audit-query';
import { resetStore, getStore } from '@/lib/dev-store';

const FROM = '2026-10-01T00:00:00.000Z';
const TO = '2026-10-31T00:00:00.000Z';
const MID = '2026-10-20T00:00:00.000Z';

function seedAudit(
  id: string,
  opts: {
    actorId?: string;
    action?: string;
    entityType?: string;
    entityId?: string;
    timestamp?: string;
  } = {},
) {
  getStore().audit.push({
    id,
    actorId: opts.actorId ?? 'user_citizen_rahim',
    action: opts.action ?? 'ticket_create',
    entityType: opts.entityType ?? 'ticket',
    entityId: opts.entityId ?? 'tkt_1',
    beforeValue: null,
    afterValue: null,
    timestamp: opts.timestamp ?? MID,
  } as never);
}

function seedActor(id: string, name: string, role: string) {
  getStore().users.set(id, {
    id,
    cityId: 'city_dhaka_north',
    role,
    phone: null,
    nid: null,
    name,
    email: null,
    passwordHash: 'h',
    wardId: null,
    departmentId: null,
    languageOverride: null,
    webAuthnCredentials: null,
    webAuthnChallenge: null,
  } as never);
}

beforeEach(() => {
  resetStore();
  // The demo seed ships audit rows; clear them so each test starts
  // from an empty audit log.
  getStore().audit.length = 0;
});

describe('listAuditEntries', () => {
  test('returns only the entries inside the requested window', async () => {
    seedAudit('aud_inside', { timestamp: MID });
    seedAudit('aud_before', { timestamp: '2026-09-01T00:00:00.000Z' });
    seedAudit('aud_after', { timestamp: '2026-11-15T00:00:00.000Z' });

    const { entries } = await listAuditEntries({ from: FROM, to: TO });
    expect(entries.map((e) => e.id)).toEqual(['aud_inside']);
  });

  test('filters by actorId', async () => {
    seedAudit('aud_a', { actorId: 'user_citizen_rahim' });
    seedAudit('aud_b', { actorId: 'user_dispatcher_habib' });

    const { entries } = await listAuditEntries({
      from: FROM,
      to: TO,
      actorId: 'user_dispatcher_habib',
    });
    expect(entries.map((e) => e.id)).toEqual(['aud_b']);
  });

  test('filters by action (an array of actions)', async () => {
    seedAudit('aud_a', { action: 'ticket_create' });
    seedAudit('aud_b', { action: 'ticket_resolve' });
    seedAudit('aud_c', { action: 'ticket_transition' });

    const { entries } = await listAuditEntries({
      from: FROM,
      to: TO,
      action: ['ticket_resolve', 'ticket_transition'],
    });
    expect(entries.map((e) => e.id).sort()).toEqual(['aud_b', 'aud_c']);
  });

  test('filters by entityType', async () => {
    seedAudit('aud_a', { entityType: 'ticket' });
    seedAudit('aud_b', { entityType: 'city' });

    const { entries } = await listAuditEntries({
      from: FROM,
      to: TO,
      entityType: ['city'],
    });
    expect(entries.map((e) => e.id)).toEqual(['aud_b']);
  });

  test('hydrates a known actor as "<name> (<role>)"', async () => {
    seedActor('user_dispatcher_habib', 'Habib Rahman', 'dispatcher');
    seedAudit('aud_a', { actorId: 'user_dispatcher_habib' });

    const { entries } = await listAuditEntries({ from: FROM, to: TO });
    expect(entries[0].actorName).toBe('Habib Rahman (dispatcher)');
    expect(entries[0].actorRole).toBe('dispatcher');
  });

  test('falls back to the raw actor id for an unknown actor', async () => {
    seedAudit('aud_a', { actorId: 'user_ghost' });

    const { entries } = await listAuditEntries({ from: FROM, to: TO });
    expect(entries[0].actorName).toBe('user_ghost');
    expect(entries[0].actorRole).toBe('citizen');
  });

  test('maps the row fields onto the view shape', async () => {
    seedAudit('aud_a', {
      actorId: 'user_citizen_rahim',
      action: 'ticket_create',
      entityType: 'ticket',
      entityId: 'tkt_42',
      timestamp: MID,
    });

    const { entries } = await listAuditEntries({ from: FROM, to: TO });
    expect(entries[0]).toMatchObject({
      id: 'aud_a',
      actorId: 'user_citizen_rahim',
      action: 'ticket_create',
      entityType: 'ticket',
      entityId: 'tkt_42',
      createdAt: MID,
    });
  });

  test('applies the limit and sets nextCursor when more rows exist', async () => {
    seedAudit('aud_a', { timestamp: '2026-10-20T03:00:00.000Z' });
    seedAudit('aud_b', { timestamp: '2026-10-20T02:00:00.000Z' });
    seedAudit('aud_c', { timestamp: '2026-10-20T01:00:00.000Z' });

    const { entries, nextCursor } = await listAuditEntries({
      from: FROM,
      to: TO,
      limit: 2,
    });
    expect(entries).toHaveLength(2);
    expect(nextCursor).toBe('2026-10-20T02:00:00.000Z');
  });

  test('nextCursor is null when the rows fit inside the limit', async () => {
    seedAudit('aud_a', { timestamp: MID });

    const { entries, nextCursor } = await listAuditEntries({
      from: FROM,
      to: TO,
      limit: 10,
    });
    expect(entries).toHaveLength(1);
    expect(nextCursor).toBeNull();
  });

  test('returns an empty result for a window with no rows', async () => {
    const { entries, nextCursor } = await listAuditEntries({
      from: '2020-01-01T00:00:00.000Z',
      to: '2020-02-01T00:00:00.000Z',
    });
    expect(entries).toEqual([]);
    expect(nextCursor).toBeNull();
  });
});
