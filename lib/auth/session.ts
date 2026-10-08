/**
 * Session-cookie helpers (lib/auth/session.ts).
 *
 * PLAT-REQ-002 + tech-audit §4: HTTP-only, SameSite=Lax, Secure signed
 * cookies. The cookie value is the Session row id; the session record in
 * the DB carries the (cityId, wardId, departmentId) scope binding.
 *
 * Cookie name: `cityfix_session`. Lifetime: 14 days (refresh on each request).
 *
 * For v1 we hand-roll the cookie (no library) so the contract is obvious.
 */

import { cookies } from 'next/headers';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { db } from '@/lib/db-switch';
import { isDevStore } from '@/lib/dev-store';
import type { Role } from '@prisma/client';

export const SESSION_COOKIE = 'cityfix_session';
export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error('SESSION_SECRET env var must be at least 32 characters');
  }
  return s;
}

function sign(value: string): string {
  return createHmac('sha256', secret()).update(value).digest('hex');
}

/**
 * Cookie value format: `<sessionId>.<signature>` — opaque to clients;
 * tamper-evident.
 */
function pack(sessionId: string): string {
  return `${sessionId}.${sign(sessionId)}`;
}

function unpack(cookieValue: string): string | null {
  const dot = cookieValue.lastIndexOf('.');
  if (dot < 0) return null;
  const id = cookieValue.slice(0, dot);
  const sig = cookieValue.slice(dot + 1);
  const expected = sign(id);
  // Constant-time compare
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  return id;
}

export interface SessionContext {
  sessionId: string;
  userId: string;
  cityId: string;
  wardId: string | null;
  departmentId: string | null;
  role: Role;
}

/**
 * Look up the current session from the cookie. Returns null if absent,
 * tampered, or expired.
 */
export async function getSession(): Promise<SessionContext | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const sessionId = unpack(raw);
  if (!sessionId) return null;

  const session = await db.session.findUnique({
    where: { id: sessionId },
  });
  if (!session) return null;
  const expiresAt =
    session.expiresAt instanceof Date ? session.expiresAt : new Date(session.expiresAt);
  if (expiresAt < new Date()) {
    // expired; clean up
    await db.session.delete({ where: { id: sessionId } }).catch(() => {});
    return null;
  }

  // Update last-seen (fire-and-forget; do not block the request).
  db.session
    .update({
      where: { id: sessionId },
      data: { lastSeenAt: new Date() },
    })
    .catch(() => {});

  const user = await db.user.findUnique({
    where: { id: session.userId },
  });
  if (!user) return null;

  return {
    sessionId,
    userId: user.id,
    cityId: session.cityId,
    wardId: session.wardId,
    departmentId: session.departmentId,
    role: user.role,
  };
}

/**
 * Create a session row + return the cookie value to set.
 * Caller is responsible for `cookies().set(...)` in their route handler.
 */
export async function createSession(args: {
  userId: string;
  cityId: string;
  wardId: string | null;
  departmentId: string | null;
}): Promise<{ sessionId: string; cookieValue: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const session = await db.session.create({
    data: {
      userId: args.userId,
      cityId: args.cityId,
      wardId: args.wardId,
      departmentId: args.departmentId,
      expiresAt,
    },
  });
  // In dev mode the cookie is a raw id (dev-session.ts reads it as-is).
  // In prod the cookie is `<id>.<hmac>` to detect tampering.
  const cookieValue = isDevStore() ? session.id : pack(session.id);
  return {
    sessionId: session.id,
    cookieValue,
    expiresAt,
  };
}

export async function destroySession(sessionId: string): Promise<void> {
  await db.session.delete({ where: { id: sessionId } }).catch(() => {});
}

export function generateSessionId(): string {
  return randomBytes(24).toString('hex');
}