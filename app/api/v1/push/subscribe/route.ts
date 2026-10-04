/**
 * POST /api/v1/push/subscribe — citizen opts in to push notifications.
 * DELETE /api/v1/push/subscribe — opt out.
 *
 * PLAT-REQ-006: per-citizen per-their-own-tickets only. The /scope is the
 * session's user_id; we never store per-ticket scopes in v1 (the reporter
 * is the only push fan-out target).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';
import { requireRole } from '@/lib/auth/guards';
import { subscribeUser, unsubscribeUser } from '@/lib/platform/push';

const SubscribeInput = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  try {
    requireRole(session, 'citizen');
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = SubscribeInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  await subscribeUser({
    userId: session!.userId,
    endpoint: parsed.data.endpoint,
    p256dh: parsed.data.keys.p256dh,
    auth: parsed.data.keys.auth,
  });
  return NextResponse.json({ ok: true });
}

const UnsubscribeInput = z.object({ endpoint: z.string().url() });

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  try {
    requireRole(session, 'citizen');
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = UnsubscribeInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  await unsubscribeUser(parsed.data.endpoint);
  return NextResponse.json({ ok: true });
}