/**
 * POST /api/dev/login — mint a dev session for the demo.
 *
 * Dev-only: returns 404 unless CITYFIX_DEV_STORE === '1'. Issues a session
 * cookie and redirects to the first page of the flow the persona is
 * expected to walk.
 *
 * The `?role=` query parameter selects the persona (default `citizen`).
 * Personas available in dev-store mode:
 *   - citizen    → Rahim, the seeded demo citizen
 *   - dispatcher → Habib, ward-14 streetlight dispatcher
 *   - crew       → Rashid, ward-14 streetlight crew
 *   - admin      → Anwar, city admin (bypasses ward/department scope)
 *
 * Real auth (phone + NID + OTP + WebAuthn) lives in the WO-000 / WO-004
 * auth route handlers and is out of scope for the dev demo.
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isDevStore } from '@/lib/dev-store';
import { devMintSession, type DevPersonaRole } from '@/lib/dev-session';
import { SESSION_COOKIE } from '@/lib/auth/session';

const VALID_ROLES: ReadonlySet<DevPersonaRole> = new Set([
  'citizen',
  'dispatcher',
  'crew',
  'admin',
]);

// Where each persona lands after login. The citizen defaults to the
// start of the submit flow; the dispatcher lands on the triage queue
// (/dispatcher); the crew lands on the today's-assignments page
// (/crew); the admin lands on /home — the admin console (Intent
// 005) is deferred; the platform's /home page is the neutral
// surface for the admin persona until the intent-specific page
// ships.
const REDIRECT_BY_ROLE: Record<DevPersonaRole, string> = {
  citizen: '/report/location',
  dispatcher: '/dispatcher',
  crew: '/crew',
  admin: '/home',
};

export async function POST(req: NextRequest) {
  if (!isDevStore()) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const roleParam = req.nextUrl.searchParams.get('role');
  const role: DevPersonaRole =
    roleParam && VALID_ROLES.has(roleParam as DevPersonaRole)
      ? (roleParam as DevPersonaRole)
      : 'citizen';
  const { cookieValue, expiresAt, userId } = await devMintSession(role);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, cookieValue, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // dev only; the prod session is Secure
    path: '/',
    expires: new Date(expiresAt),
  });
  // Redirect to the persona's first expected surface. Redirects are
  // absolute URLs because NextResponse.redirect expects them.
  const target = REDIRECT_BY_ROLE[role];
  const res = NextResponse.redirect(new URL(target, req.nextUrl.origin), {
    status: 303,
  });
  // Echo the persona so a tool (Playwright spec, curl, the home page
  // CTA) can confirm which role was actually minted without re-fetching
  // /api/auth/status. This is dev-only debug metadata; the prod session
  // never carries it.
  res.headers.set('x-cityfix-dev-persona', `${role}:${userId}`);
  return res;
}

// GET is also supported for symmetry: hitting the endpoint in a browser
// address bar (e.g. when an admin clicks a "switch persona" link) mints
// the same cookie and redirects. This keeps the human-tester ergonomics
// of "click to switch persona" without standing up a dedicated UI.
export async function GET(req: NextRequest) {
  return POST(req);
}
