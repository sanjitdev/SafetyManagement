/**
 * Home route — public landing (`/`) for CityFix.
 *
 * v1.1 launch-polish hotfix:
 *   - Authenticated visitors land here only briefly (redirected to
 *     `/home` so the citizen Home / City Activity surface remains
 *     the primary authed surface).
 *   - Anonymous visitors see a read-only city landing: bilingual
 *     hero, status-coloured city map (MapLibre + OpenStreetMap),
 *     and a PII-stripped public activity feed
 *     (`/api/v1/activity/public`). The "Report what you see" CTA
 *     routes to `/register?next=/report/location` — a citizen who
 *     wants to file a report must register first; the report draft
 *     is created in sessionStorage once they're authed.
 *
 * Server-side auth check: the route reads the session via
 * `getActiveSession()` and returns an HTTP 307 redirect for
 * authed users. This means the public landing is never painted
 * for an authed user, and the redirect does not require a client
 * component.
 *
 * The redirect target is ROLE-AWARE. It used to be a hard-coded
 * `redirect('/home')`, which dumped every authenticated user on the
 * citizen feed — an admin who bookmarked the site root, or anyone who
 * landed on `/` with a live session, ended up on the citizen Home
 * instead of their own console. The role→surface mapping already
 * existed in `lib/role-home.ts` (the login page and the splash page
 * both use it), so this route now uses the same single source of
 * truth: citizen → `/home`, dispatcher → `/dispatcher`,
 * crew → `/crew`, admin → `/admin`.
 *
 * In dev-store mode (`CITYFIX_DEV_STORE=1`) the existing
 * "Sign in as Rahim" demo button is preserved — it's a useful
 * walkthrough handle for local development and is not surfaced
 * in production.
 */

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getActiveSession } from '@/lib/db-switch';
import { isDevStore } from '@/lib/dev-store';
import { roleHome } from '@/lib/role-home';
import PublicLandingExperience from '@/components/PublicLandingExperience';
import { CityFixMark } from '@/components/CityFixMark';

export default async function HomePage() {
  const session = await getActiveSession();
  if (session) {
    // Authed users go straight to their OWN primary surface. The
    // role→surface mapping lives in `lib/role-home.ts` and is shared
    // with the login page and the splash page, so there is exactly
    // one place that decides where a role belongs.
    redirect(roleHome(session.role));
  }

  // Dev-store only — the demo persona is a local dev affordance.
  if (isDevStore()) {
    return (
      <main
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--space-7) var(--space-5)',
        }}
      >
        <div style={{ maxWidth: 720, width: '100%' }}>
          <CityFixMark size={38} />
          <h1
            style={{
              fontSize: 'var(--text-display-lg)',
              margin: '0 0 var(--space-3)',
              color: 'var(--color-ink)',
              fontWeight: 'var(--weight-semibold)',
              letterSpacing: 'var(--tracking-tight)',
            }}
          >
            CityFix
          </h1>
          <p
            style={{
              fontSize: 'var(--text-body-lg)',
              color: 'var(--color-ink-secondary)',
              lineHeight: 1.6,
              margin: '0 0 var(--space-6)',
            }}
          >
            Dev mode is on. The platform layer (auth, dedup,
            serializer, audit, i18n) runs against the in-memory store
            — no Postgres required. Sign in as the seeded demo citizen
            (Rahim) to walk the submit-report flow end-to-end.
          </p>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)',
              alignItems: 'flex-start',
            }}
          >
            <form action="/api/dev/login" method="post">
              <button
                type="submit"
                style={{
                  padding: 'var(--space-3) var(--space-5)',
                  background: 'var(--color-primary)',
                  color: 'var(--color-on-primary)',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-body-lg)',
                  fontWeight: 'var(--weight-semibold)',
                  cursor: 'pointer',
                }}
                data-testid="dev-login-citizen"
              >
                Sign in as Rahim (demo citizen) →
              </button>
            </form>
            <p
              style={{
                margin: 'var(--space-4) 0 var(--space-2)',
                fontSize: 'var(--text-caption)',
                color: 'var(--color-ink-secondary)',
                textTransform: 'uppercase',
                letterSpacing: 'var(--tracking-wide)',
                fontWeight: 'var(--weight-semibold)',
              }}
            >
              Switch persona
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <form action="/api/dev/login?role=dispatcher" method="post">
                <button
                  type="submit"
                  data-testid="dev-login-dispatcher"
                  style={{
                    padding: 'var(--space-2) var(--space-4)',
                    background: 'transparent',
                    color: 'var(--color-ink)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: 'var(--text-caption)',
                    cursor: 'pointer',
                  }}
                >
                  Habib (dispatcher)
                </button>
              </form>
              <form action="/api/dev/login?role=crew" method="post">
                <button
                  type="submit"
                  data-testid="dev-login-crew"
                  style={{
                    padding: 'var(--space-2) var(--space-4)',
                    background: 'transparent',
                    color: 'var(--color-ink)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: 'var(--text-caption)',
                    cursor: 'pointer',
                  }}
                >
                  Rashid (crew)
                </button>
              </form>
              <form action="/api/dev/login?role=admin" method="post">
                <button
                  type="submit"
                  data-testid="dev-login-admin"
                  style={{
                    padding: 'var(--space-2) var(--space-4)',
                    background: 'transparent',
                    color: 'var(--color-ink)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: 'var(--text-caption)',
                    cursor: 'pointer',
                  }}
                >
                  Anwar (admin)
                </button>
              </form>
            </div>
            <Link
              href="/splash"
              style={{
                fontSize: 'var(--text-body)',
                color: 'var(--color-primary)',
                fontWeight: 'var(--weight-semibold)',
                textDecoration: 'none',
              }}
            >
              Walk the splash → welcome flow →
            </Link>
            <form action="/api/dev/reset" method="post">
              <button
                type="submit"
                style={{
                  padding: 'var(--space-2) var(--space-4)',
                  background: 'transparent',
                  color: 'var(--color-ink-secondary)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-caption)',
                  cursor: 'pointer',
                }}
              >
                Reset demo data
              </button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  // Anonymous visitor in production → public landing.
  return <PublicLandingExperience />;
}
