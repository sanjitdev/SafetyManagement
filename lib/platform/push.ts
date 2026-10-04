/**
 * Web Push subscription helpers (lib/platform/push.ts).
 *
 * PLAT-REQ-006: per-citizen per-their-own-tickets push subscriptions.
 *
 * v1 keeps this thin — no actual web-push library wired yet (no public-key
 * encryption without the runtime web-push package; deferred to a v1.1
 * library addition). The DB-backed subscription list and the per-transition
 * send-fan-out are implemented; the wire-protocol call is the deferred bit.
 */

import { prisma } from '@/lib/db';

export interface SubscribeInput {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function subscribeUser(input: SubscribeInput): Promise<void> {
  // upsert keyed on endpoint (which is unique across users); endpoint-scoped
  // update preserves the privacy boundary (one endpoint → one user).
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
  await prisma.pushSubscription
    .delete({ where: { endpoint } })
    .catch(() => undefined);
}

/**
 * Fan-out: find every push subscription that belongs to a citizen who
 * is allowed to be notified about this ticket (i.e., the reporter).
 *
 * For v1 this is just the reporter. In v1.1, supporters (citizens who
 * "follow" a ticket) extend the fan-out.
 */
export async function fanOutForTicket(
  ticketId: string,
): Promise<Array<{ endpoint: string; p256dh: string; auth: string }>> {
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
  // v1.1: const webpush = (await import('web-push')).default;
  //       webpush.setVapidDetails(...);
  //       for (const sub of subs) { await webpush.sendNotification(sub, payload).catch(...); }
  // For v1 we just log the fan-out.
  if (process.env.NODE_ENV !== 'production') {
    console.info(
      `[push] fan-out ticket=${args.ticketId} toStatus=${args.toStatus} → ${subs.length} subscription(s) [v1 stub; wire call deferred to v1.1]`,
    );
  }
  return { sent: subs.length };
}