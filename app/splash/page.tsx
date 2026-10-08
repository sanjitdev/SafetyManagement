/**
 * 1.1 Splash (App Open)
 *
 * Per spec 1.1-splash/1.1-splash.md: brief, calm, professional entry. After
 * the splash visual renders, the page checks location permission and the
 * auth state, then routes the citizen to the right place:
 *   - not-authed → /welcome (first-run)
 *   - authed     → /home
 *
 * Web-first (Phase B, 2026-10-04): centered on a neutral surface. Same
 * content at every viewport; the splash never reflows into a sidebar.
 *
 * Server component for the visual shell; the permission + auth check +
 * routing happen on the client.
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { t, type Language } from '@/lib/i18n/keys';

const LANG: Language = 'bn';
const SLOW_LOAD_THRESHOLD_MS = 2000;
const BUNDLE_FAIL_THRESHOLD_MS = 8000;

export default function SplashPage() {
  const router = useRouter();
  const [showSlowLoad, setShowSlowLoad] = useState(false);
  const [bundleFailed, setBundleFailed] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const slowLoadTimer = window.setTimeout(() => {
      if (!cancelled) setShowSlowLoad(true);
    }, SLOW_LOAD_THRESHOLD_MS);
    const failTimer = window.setTimeout(() => {
      if (!cancelled) setBundleFailed(true);
    }, BUNDLE_FAIL_THRESHOLD_MS);

    (async () => {
      try {
        // Request geolocation up front (UX Review revision #1). Non-blocking:
        // if the citizen denies, we still route onward.
        if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
          try {
            await new Promise<void>((resolve) => {
              navigator.geolocation.getCurrentPosition(
                () => resolve(),
                () => resolve(),
                { timeout: 1500, maximumAge: 60_000 },
              );
            });
          } catch {
            // Denied or unavailable — splash still routes.
          }
        }

        const res = await fetch('/api/auth/status', { credentials: 'include' });
        if (cancelled) return;
        if (!res.ok) {
          // Treat as anonymous; route to welcome.
          router.replace('/welcome');
          return;
        }
        const data = (await res.json()) as { authenticated: boolean };
        router.replace(data.authenticated ? '/home' : '/welcome');
      } catch {
        if (!cancelled) setBundleFailed(true);
      } finally {
        window.clearTimeout(slowLoadTimer);
        window.clearTimeout(failTimer);
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(slowLoadTimer);
      window.clearTimeout(failTimer);
    };
  }, [retryNonce, router]);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-surface-page)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-7) var(--space-5)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'var(--space-4)',
        }}
      >
        <div
          aria-hidden
          style={{
            width: 16,
            height: 16,
            background: 'var(--color-primary)',
            borderRadius: '50%',
          }}
        />
        <h1
          style={{
            fontSize: 'var(--text-display-lg)',
            fontWeight: 'var(--weight-semibold)',
            color: 'var(--color-ink)',
            margin: 0,
            letterSpacing: 'var(--tracking-tight)',
          }}
        >
          CityFix
        </h1>
        <p
          lang="bn"
          style={{
            fontSize: 'var(--text-body-lg)',
            color: 'var(--color-ink-secondary)',
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          {t('splash.tagline', null, LANG)}
        </p>

        {bundleFailed ? (
          <div
            role="alert"
            style={{
              marginTop: 'var(--space-3)',
              padding: 'var(--space-3) var(--space-4)',
              background: 'var(--color-warning-soft, #fdf2cf)',
              border: '1px solid var(--color-warning, #b58410)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
              alignItems: 'center',
            }}
          >
            <span
              lang="bn"
              style={{ fontSize: 'var(--text-body)', color: 'var(--color-ink)' }}
            >
              {t('splash.error.bundle_failed', null, LANG)}
            </span>
            <button
              type="button"
              onClick={() => {
                setBundleFailed(false);
                setShowSlowLoad(false);
                setRetryNonce((n) => n + 1);
              }}
              style={{
                padding: 'var(--space-2) var(--space-4)',
                background: 'var(--color-primary)',
                color: 'var(--color-on-primary)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-body-sm)',
                fontWeight: 'var(--weight-semibold)',
                cursor: 'pointer',
              }}
            >
              {t('splash.retry', null, LANG)}
            </button>
          </div>
        ) : (
          <div
            aria-hidden
            style={{
              marginTop: 'var(--space-3)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 'var(--space-2)',
            }}
          >
            <div
              style={{
                width: 24,
                height: 24,
                border: '2px solid var(--color-border)',
                borderTopColor: 'var(--color-primary)',
                borderRadius: '50%',
                animation: 'cityfix-spin 0.8s linear infinite',
              }}
            />
            {showSlowLoad && (
              <span
                lang="bn"
                style={{
                  fontSize: 'var(--text-caption)',
                  color: 'var(--color-ink-tertiary)',
                }}
              >
                {t('splash.loading', null, LANG)}
              </span>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes cityfix-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
