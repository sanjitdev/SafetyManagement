/**
 * Unit tests for the Web Push subscription helpers
 * (`lib/platform/push.ts`).
 *
 * PLAT-REQ-006: per-citizen push subscriptions, and a per-transition
 * fan-out to the reporter's own subscriptions only.
 *
 * The module is backend-agnostic: it uses the in-memory dev store when
 * `CITYFIX_DEV_STORE=1` (the vitest default) and Prisma otherwise.
 * These tests exercise the dev-store path.
 *
 * Covered:
 *   - `subscribeUser` — a new subscription is stored; subscribing the
 *     SAME endpoint again UPDATES the existing row (upsert semantics)
 *     rather than creating a duplicate.
 *   - `unsubscribeUser` — removes the subscription; removing an unknown
 *     endpoint is a no-op.
 *   - `fanOutForTicket` — returns only the subscriptions belonging to
 *     the ticket's REPORTER (other citizens' subscriptions are not
 *     leaked); an unknown ticket returns `[]`.
 *   - `sendTicketPush` — returns the number of subscriptions the
 *     fan-out reached, and `0` when there is nobody to notify.
 *
 * NOTE: the dev subscription table (`devSubs`) is MODULE-level state in
 * `lib/platform/push.ts` and is NOT cleared by `resetStore()`. Each
 * test therefore uses its own reporter id and its own endpoints, so
 * the assertions are independent of the module-level table's history.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { resetStore, getStore, DEV_CITY_ID } from '@/lib/dev-store';
import {
  fanOutForTicket,
  sendTicketPush,
  subscribeUser,
  unsubscribeUser,
} from '@/lib/platform/push';

beforeEach(() => {
  resetStore();
});

function seedTicket(id: string, reporterId: string) {
  getStore().tickets.set(id, {
    id,
    cityId: DEV_CITY_ID,
    wardId: 'ward_14',
    categoryId: 'cat_pothole',
    reporterId,
    status: 'submitted',
    locationLat: 23.7,
    locationLng: 90.4,
    locationLabel: null,
    locationLabelBn: null,
    note: null,
    assignedCrewId: null,
    internalNote: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    resolvedAt: null,
  } as never);
}

describe('subscribeUser', () => {
  it('stores a new subscription', async () => {
    const reporter = 'user_push_new';
    await subscribeUser({
      userId: reporter,
      endpoint: 'https://push.example/new-1',
      p256dh: 'key-1',
      auth: 'auth-1',
    });

    seedTicket('tkt_new', reporter);
    const subs = await fanOutForTicket('tkt_new');
    expect(subs).toHaveLength(1);
    expect(subs[0].endpoint).toBe('https://push.example/new-1');
  });

  it('updates the existing subscription when the same endpoint subscribes again', async () => {
    const reporter = 'user_push_upsert';
    await subscribeUser({
      userId: reporter,
      endpoint: 'https://push.example/upsert-1',
      p256dh: 'key-1',
      auth: 'auth-1',
    });
    await subscribeUser({
      userId: reporter,
      endpoint: 'https://push.example/upsert-1',
      p256dh: 'key-2',
      auth: 'auth-2',
    });

    seedTicket('tkt_upsert', reporter);
    const subs = await fanOutForTicket('tkt_upsert');
    expect(subs).toHaveLength(1);
    expect(subs[0].p256dh).toBe('key-2');
    expect(subs[0].auth).toBe('auth-2');
  });
});

describe('unsubscribeUser', () => {
  it('removes the subscription', async () => {
    const reporter = 'user_push_unsub';
    await subscribeUser({
      userId: reporter,
      endpoint: 'https://push.example/unsub-1',
      p256dh: 'key-1',
      auth: 'auth-1',
    });
    seedTicket('tkt_unsub', reporter);
    expect(await fanOutForTicket('tkt_unsub')).toHaveLength(1);

    await unsubscribeUser('https://push.example/unsub-1');
    expect(await fanOutForTicket('tkt_unsub')).toHaveLength(0);
  });

  it('is a no-op for an unknown endpoint', async () => {
    await expect(
      unsubscribeUser('https://push.example/never-subscribed'),
    ).resolves.toBeUndefined();
  });
});

describe('fanOutForTicket', () => {
  it('returns [] for an unknown ticket', async () => {
    expect(await fanOutForTicket('tkt_missing')).toEqual([]);
  });

  it('returns only the reporter subscriptions', async () => {
    const reporter = 'user_push_scope';
    await subscribeUser({
      userId: reporter,
      endpoint: 'https://push.example/scope-reporter',
      p256dh: 'k-r',
      auth: 'a-r',
    });
    await subscribeUser({
      userId: 'user_push_someone_else',
      endpoint: 'https://push.example/scope-other',
      p256dh: 'k-o',
      auth: 'a-o',
    });

    seedTicket('tkt_scope', reporter);
    const subs = await fanOutForTicket('tkt_scope');

    expect(subs).toHaveLength(1);
    expect(subs[0].endpoint).toBe('https://push.example/scope-reporter');
  });

  it('returns [] when the reporter has no subscriptions', async () => {
    seedTicket('tkt_nosub', 'user_push_nobody');
    expect(await fanOutForTicket('tkt_nosub')).toEqual([]);
  });

  it('returns every subscription the reporter owns', async () => {
    const reporter = 'user_push_multi';
    await subscribeUser({
      userId: reporter,
      endpoint: 'https://push.example/multi-a',
      p256dh: 'k-a',
      auth: 'a-a',
    });
    await subscribeUser({
      userId: reporter,
      endpoint: 'https://push.example/multi-b',
      p256dh: 'k-b',
      auth: 'a-b',
    });

    seedTicket('tkt_multi', reporter);
    expect(await fanOutForTicket('tkt_multi')).toHaveLength(2);
  });
});

describe('sendTicketPush', () => {
  it('reports 0 when the ticket does not exist', async () => {
    expect(await sendTicketPush({ ticketId: 'tkt_missing', toStatus: 'routed' })).toEqual({
      sent: 0,
    });
  });

  it('reports 0 when the reporter has no subscriptions', async () => {
    seedTicket('tkt_push_none', 'user_push_none');
    expect(await sendTicketPush({ ticketId: 'tkt_push_none', toStatus: 'routed' })).toEqual({
      sent: 0,
    });
  });

  it('reports the number of subscriptions the fan-out reached', async () => {
    const reporter = 'user_push_send';
    await subscribeUser({
      userId: reporter,
      endpoint: 'https://push.example/send-a',
      p256dh: 'k-a',
      auth: 'a-a',
    });
    await subscribeUser({
      userId: reporter,
      endpoint: 'https://push.example/send-b',
      p256dh: 'k-b',
      auth: 'a-b',
    });

    seedTicket('tkt_push_send', reporter);
    expect(await sendTicketPush({ ticketId: 'tkt_push_send', toStatus: 'routed' })).toEqual({
      sent: 2,
    });
  });
});
