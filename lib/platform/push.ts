/**
 * Web Push subscription helpers (lib/platform/push.ts).
 *
 * PLAT-REQ-006: per-citizen per-their-own-tickets push subscriptions.
 *
 * v1 keeps this thin — no actual web-push library wired yet (no public-key
 * encryption without the runtime web-push package; deferred to a v1.1
 * library addition). The DB-backed subscription list and the per-transition
 * send-fan-out are implemented; the wire-protocol call is the deferred bit.
 *
 * Backend-agnostic: works on Prisma or the in-memory dev store.
 */

import { devDb, isDevStore } from '@/lib/dev-store';
import { prisma } from '@/lib/db';

export interface SubscribeInput {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

// In-memory dev-store subscription table — key on endpoint, value is the row.
const devSubs = new Map<
  string,
  { id: string; userId: string; endpoint: string; p256dh: string; auth: string; createdAt: string }
>();

function makeId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function subscribeUser(input: SubscribeInput): Promise<void> {
  if (isDevStore()) {
    const existing = devSubs.get(input.endpoint);
    if (existing) {
      devSubs.set(input.endpoint, { ...existing, userId: input.userId, p256dh: input.p256dh, auth: input.auth });
    } else {
      devSubs.set(input.endpoint, {
        id: makeId('sub'),
        userId: input.userId,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        createdAt: new Date().toISOString(),
      });
    }
    return;
  }
  await prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    update: { userId: input.userId, p256dh: input.p256dh, auth: input.auth },
    create: {
      userId: input.userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
    },
  });
}

export async function unsubscribeUser(endpoint: string): Promise<void> {
  if (isDevStore()) {
    devSubs.delete(endpoint);
    return;
  }
  await prisma.pushSubscription
    .delete({ where: { endpoint } })
    .catch(() => undefined);
}

/**
 * Fan-out: find every push subscription that belongs to a citizen who
 * is allowed to be notified about this ticket (i.e., the reporter).
 */
export async function fanOutForTicket(
  ticketId: string,
): Promise<Array<{ endpoint: string; p256dh: string; auth: string }>> {
  if (isDevStore()) {
    const ticket = devDb.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) return [];
    return [...devSubs.values()]
      .filter((s) => s.userId === ticket.reporterId)
      .map((s) => ({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }));
  }
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { reporterId: true },
  });
  if (!ticket) return [];
  const subs = await prisma.pushSubscription.findMany({
    where: { userId: ticket.reporterId },
    select: { endpoint: true, p256dh: true, auth: true },
  });
  return subs;
}

/**
 * Placeholder send — v1 doesn't ship the actual web-push wire call (no
 *     web-push package + VAPID key generation are deferred to v1.1). The
 *     PLAT-REQ-006 acceptance is "transport exists and is wired." For v1
 *     we log the intended fan-out; v1.1 replaces this body with the
 *     real `web-push.sendNotification(...)` call.
 */
export async function sendTicketPush(args: {
  ticketId: string;
  toStatus: string;
}): Promise<{ sent: number }> {
  const subs = await fanOutForTicket(args.ticketId);
  if (subs.length === 0) return { sent: 0 };
  if (process.env.NODE_ENV !== 'production') {
    console.info(
      `[push] fan-out ticket=${args.ticketId} toStatus=${args.toStatus} → ${subs.length} subscription(s) [v1 stub; wire call deferred to v1.1]`,
    );
  }
  return { sent: subs.length };
}
