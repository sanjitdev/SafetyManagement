/**
 * Home route — dev entry surface for the citizen report flow.
 *
 * In dev-store mode (CITYFIX_DEV_STORE=1), this page renders a
 * "Sign in as Rahim (demo citizen)" button that POSTs to /api/dev/login
 * and redirects into the report flow. In production, the page renders
 * the citizen Home view (1.6) — for now, a polite message pointing
 * at the dev mode.
 *
 * Mirrors the Phase B re-skin (2026-10-04): web-first, 1440 × 900 +
 * 1024 × 768. Uses the design tokens via globals.css / tokens.css.
 */

import Link from 'next/link';
import { isDevStore } from '@/lib/dev-store';
import { t, type Language } from '@/lib/i18n/keys';
import { ThemeToggle } from '@/components/ThemeToggle';

const LANG: Language = 'bn';

export default function HomePage() {
  const dev = isDevStore();
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-7) var(--space-5)',
        position: 'relative',
      }}
    >
      {/* Theme toggle — top-right of the welcome surface. */}
      <div
        style={{
          position: 'absolute',
          top: 'var(--space-5)',
          right: 'var(--space-5)',
        }}
      >
        <ThemeToggle lang={LANG} variant="compact" />
      </div>
      <div style={{ maxWidth: 720, width: '100%' }}>
        <div
          style={{
            display: 'inline-block',
            width: 12,
            height: 12,
            background: 'var(--color-primary)',
            borderRadius: '50%',
            marginBottom: 'var(--space-3)',
          }}
          aria-hidden
        />
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
          lang="bn"
          style={{
            fontSize: 'var(--text-h3)',
            color: 'var(--color-ink-secondary)',
            margin: '0 0 var(--space-5)',
            lineHeight: 1.4,
          }}
        >
          {t('home.tagline', null, LANG)}
        </p>
        <p
          style={{
            fontSize: 'var(--text-body-lg)',
            color: 'var(--color-ink-secondary)',
            lineHeight: 1.6,
            margin: '0 0 var(--space-6)',
          }}
        >
          {dev
            ? 'Dev mode is on. The platform layer (auth, dedup, serializer, audit, i18n) runs against the in-memory store — no Postgres required. Sign in as the seeded demo citizen (Rahim) to walk the submit-report flow end-to-end.'
            : 'CityFix is a citizen-powered city issue reporting platform. Production home view (1.6 Home / City Activity) lands with the WO-001 Bolt; this is the development placeholder.'}
        </p>

        {dev ? (
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
              >
                Sign in as Rahim (demo citizen) →
              </button>
            </form>
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
            <div
              style={{
                marginTop: 'var(--space-5)',
                padding: 'var(--space-3) var(--space-4)',
                background: 'var(--color-surface-raised)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-pill)',
                fontSize: 'var(--text-caption)',
                color: 'var(--color-ink-secondary)',
              }}
            >
              Demo data seeded · City: Dhaka North · Ward 14 (Mirpur) · 5 categories · citizen Rahim (+8801711000000)
            </div>
          </div>
        ) : (
          <div
            style={{
              display: 'inline-block',
              padding: 'var(--space-2) var(--space-4)',
              background: 'var(--color-surface-raised)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-pill)',
              fontSize: 'var(--text-caption)',
              color: 'var(--color-ink-secondary)',
            }}
          >
            v1 scaffold · start with <code>npm run dev:feat</code> to see the demo
          </div>
        )}
      </div>
    </main>
  );
}
