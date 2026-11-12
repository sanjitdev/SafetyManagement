/**
 * 1.1 Splash (App Open)
 *
 * Per spec 1.1-splash/1.1-splash.md: brief, calm, professional entry. After
 * the splash visual renders, the page checks location permission and the
 * auth state, then routes the citizen to the right place:
 *   - not-authed → / (public landing — first-run + return visit)
 *   - authed     → /home
 *
 * VISUAL TREATMENT — mockup 01-welcome.html
 * ------------------------------------------------
 * The splash is the app's first-run welcome moment, so it is composed
 * against the approved welcome mockup: a two-column hero (wordmark +
 * headline + lede + trust strip on the left, the abstract city map on
 * the right) inside the `--layout-desktop` frame. Below 1024px the
 * illustration is dropped and the hero runs full width, exactly as the
 * mockup's own media query does.
 *
 * WHAT THIS CHANGE DID NOT DO
 * ---------------------------
 * The mockup's CTA pair ("নিবন্ধন করুন" / "লগইন") is deliberately NOT
 * rendered. The splash is a transit surface: it resolves the session and
 * routes onward by itself, and a pair of buttons pointing at /register
 * and /login would be a second, competing way out of the page. The
 * mockup's CTA slot therefore carries the splash's own affordance —
 * the loading spinner, or the bundle-failure card with its Retry
 * button — in the same position and the same measure.
 *
 * The bilingual control lives in the app header (`AppShell` →
 * `AppHeader`), which the splash's own layout already renders, so the
 * welcome mockup's "বাংলা · English" trust marker is reproduced as the
 * static reassurance it is in the mockup rather than as a second
 * toggle.
 *
 * Server component for the visual shell; the permission + auth check +
 * routing happen on the client.
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { t, type Language } from '@/lib/i18n/keys';
import { useLanguage } from '@/components/useLanguage';
import { roleHome } from '@/lib/role-home';
import { CityFixMark } from '@/components/CityFixMark';
import { useSession } from '@/components/SessionProvider';
import { Button } from '@/components/ui';
import { ICONS } from '@/lib/ui/icon-map';

const SLOW_LOAD_THRESHOLD_MS = 2000;
const BUNDLE_FAIL_THRESHOLD_MS = 8000;

export default function SplashPage() {
  // The shared hook owns the language. This page used to
  // hard-code Bangla at module scope, so it ignored the user's
  // language choice entirely.
  const { lang } = useLanguage();
  const LANG = lang;
  const router = useRouter();
  const [showSlowLoad, setShowSlowLoad] = useState(false);
  const [bundleFailed, setBundleFailed] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  // The shared session — the splash layout's `AppShell` owns it, so the
  // routing decision below reuses that request instead of issuing its
  // own `/api/auth/status` call.
  const { authenticated, session } = useSession();

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

        // The auth state comes from the shared `SessionProvider` — the
        // splash layout's `AppShell` already fetched it, so this page
        // does not issue a second `/api/auth/status` request. We wait
        // for it to resolve before routing.
        if (authenticated === null) return; // still loading — the
        // routing decision waits for the shared session to land.
        if (cancelled) return;

        // Route each role to its own surface — a dispatcher opening the
        // app should land on the triage queue, not the citizen feed.
        router.replace(
          authenticated ? roleHome(session?.role) : '/',
        );
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
  }, [retryNonce, router, authenticated, session]);

  return (
    <div className="splash-page">
      <style>{`
        /* The welcome mockup frame: a desktop-width two-column
         * hero, collapsing to a single column below the tablet
         * breakpoint. The illustration is dropped entirely there —
         * the hero is a typography moment and must not be squeezed
         * beside a picture. */
        .splash-page {
          min-height: 100%;
          display: flex;
          align-items: stretch;
          max-width: var(--layout-desktop);
          margin: 0 auto;
          background: var(--color-surface-page);
        }
        .splash-hero {
          flex: 1.1;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: var(--space-8) var(--space-8) var(--space-7);
          min-height: 100%;
          box-sizing: border-box;
        }
        .splash-illustration {
          flex: 1;
          background: var(--color-surface-card);
          border-left: 1px solid var(--color-border);
          position: relative;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: var(--space-7);
          box-sizing: border-box;
        }
        @media (max-width: 1024px) {
          .splash-page { flex-direction: column; }
          .splash-hero {
            padding: var(--space-7) var(--space-5) var(--space-6);
            min-height: auto;
          }
          .splash-illustration { display: none; }
        }
        @keyframes cityfix-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* Left: brand + headline + actions + trust */}
      <section className="splash-hero">
        {/* Top: brand */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
          }}
        >
          <CityFixMark />
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 'var(--weight-bold)',
              fontSize: 'var(--text-body-lg)',
              letterSpacing: 'var(--tracking-tight)',
              color: 'var(--color-ink)',
            }}
          >
            CityFix
          </span>
        </div>

        {/* Middle: headline + lede */}
        <div style={{ marginTop: 'var(--space-8)' }}>
          <h1
            lang={LANG}
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-display-xl)',
              // The mockup's display leading (1.05). `--leading-tight`
              // is 1.2, which visibly loosens the two-line Bangla
              // headline, so the mockup's own value is kept.
              lineHeight: 1.05,
              margin: '0 0 var(--space-4)',
              letterSpacing: 'var(--tracking-tight)',
              fontWeight: 'var(--weight-semibold)',
              color: 'var(--color-ink)',
            }}
            dangerouslySetInnerHTML={{
              __html: t('splash.headline', null, LANG),
            }}
          />
          <p
            lang={LANG}
            style={{
              fontSize: 'var(--text-body-lg)',
              color: 'var(--color-ink-secondary)',
              lineHeight: 'var(--leading-normal)',
              margin: 0,
              // The mockup's lede measure (480px). `--layout-mobile-max`
              // is the same 480px the mockup used, and is the token
              // that names a centred reading column.
              maxWidth: 'var(--layout-mobile-max)',
            }}
          >
            {t('splash.lede', null, LANG)}
          </p>
        </div>

        {/* Bottom: the splash's own affordance + trust */}
        <div style={{ marginTop: 'var(--space-8)' }}>
          <div
            style={{
              // The mockup's action-slot measure (520px). No token
              // carries this width, so it stays literal — the same
              // value the approved mockup uses.
              maxWidth: 520,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 'var(--space-2)',
            }}
          >
            {bundleFailed ? (
              <div
                role="alert"
                style={{
                  width: '100%',
                  padding: 'var(--space-3) var(--space-4)',
                  background: 'var(--color-warning-soft)',
                  border: '1px solid var(--color-warning)',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-2)',
                  alignItems: 'flex-start',
                }}
              >
                <span
                  lang={LANG}
                  style={{
                    fontSize: 'var(--text-body)',
                    color: 'var(--color-ink)',
                    lineHeight: 'var(--leading-normal)',
                  }}
                >
                  {t('splash.error.bundle_failed', null, LANG)}
                </span>
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => {
                    setBundleFailed(false);
                    setShowSlowLoad(false);
                    setRetryNonce((n) => n + 1);
                  }}
                >
                  {t('splash.retry', null, LANG)}
                </Button>
              </div>
            ) : (
              <div
                aria-hidden
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: 'var(--space-2)',
                }}
              >
                <div
                  style={{
                    width: 'var(--icon-size-lg)',
                    height: 'var(--icon-size-lg)',
                    border: '2px solid var(--color-border)',
                    borderTopColor: 'var(--color-primary)',
                    borderRadius: 'var(--radius-pill)',
                    // The splash's own spin cadence (unchanged from
                    // before this re-skin). The motion scale tops out
                    // at `--duration-slow` (320ms), which is too fast
                    // for a spinner this size, so the 800ms the splash
                    // has always used is kept.
                    animation: 'cityfix-spin 800ms linear infinite',
                  }}
                />
                {showSlowLoad && (
                  <span
                    lang={LANG}
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

          {/* Trust strip — the mockup's three reassurance markers. */}
          <div
            style={{
              marginTop: 'var(--space-5)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              flexWrap: 'wrap',
              color: 'var(--color-ink-tertiary)',
              fontSize: 'var(--text-caption)',
            }}
          >
            <TrustItem icon={<ICONS.security.icon size={14} weight={ICONS.security.weight} aria-hidden />}>
              {t('public.trust.government.title', null, LANG)}
            </TrustItem>
            <TrustItem icon={<ICONS.lock.icon size={14} weight={ICONS.lock.weight} aria-hidden />}>
              {t('public.trust.privacy.title', null, LANG)}
            </TrustItem>
            <TrustItem icon={<ICONS.language.icon size={14} weight={ICONS.language.weight} aria-hidden />}>
              {t('public.trust.bilingual.title', null, LANG)}
            </TrustItem>
          </div>
        </div>
      </section>

      {/* Right: the abstract city illustration (hidden below 1024px) */}
      {/*
        The mockup's city art, reproduced as authored SVG.

        The NUMBERS below are the illustration's own coordinate system
        (a 520×520 drawing grid) — they are geometry, not CSS lengths,
        so they are not tokenised. Every COLOUR is a token, so the
        illustration follows the light/dark theme like the rest of the
        page.

        The pin is ONE authored teardrop path — a circular head that
        tapers to a point at the ticket's coordinates — not a stack of
        concentric circles. The tail is what makes it read as "a place
        to go"; the circle alone reads as a status dot. This is the
        same shape the live map draws in `components/CityActivityMap.tsx`.
      */}
      <aside className="splash-illustration" aria-hidden>
        <div
          style={{
            width: '100%',
            height: '100%',
            maxWidth: 520,
            aspectRatio: '1 / 1',
            position: 'relative',
          }}
        >
          <svg
            viewBox="0 0 520 520"
            xmlns="http://www.w3.org/2000/svg"
            style={{ width: '100%', height: '100%' }}
            aria-hidden
            focusable="false"
          >
            {/* Background gradient */}
            <defs>
              <linearGradient id="splash-city-bg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-surface-card)" />
                <stop offset="100%" stopColor="var(--color-surface-page)" />
              </linearGradient>
              <linearGradient id="splash-city-road" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="var(--color-surface-raised)" />
                <stop offset="100%" stopColor="var(--color-surface-sunken)" />
              </linearGradient>
            </defs>

            {/* Map background */}
            <rect width="520" height="520" fill="url(#splash-city-bg)" rx="20" />

            {/* Roads */}
            <line x1="0" y1="180" x2="520" y2="160" stroke="url(#splash-city-road)" strokeWidth="36" />
            <line x1="60" y1="0" x2="80" y2="520" stroke="url(#splash-city-road)" strokeWidth="32" />
            <line x1="0" y1="380" x2="520" y2="370" stroke="url(#splash-city-road)" strokeWidth="24" />
            <line x1="320" y1="0" x2="300" y2="520" stroke="url(#splash-city-road)" strokeWidth="22" />

            {/* Park */}
            <rect x="380" y="220" width="100" height="100" fill="var(--color-map-park)" rx="8" />
            {/* Water */}
            <rect x="20" y="430" width="160" height="60" fill="var(--color-map-water)" rx="8" />

            {/* Pin 1 — open (red) */}
            <g transform="translate(110, 130)">
              <path d="M0 16c0 8.5-9 15-9 15s-9-6.5-9-15a9 9 0 1 1 18 0Z" fill="var(--color-map-pin-open)" />
              <circle cx="-9" cy="-1" r="3.2" fill="white" />
            </g>
            {/* Pin 2 — in progress (amber) */}
            <g transform="translate(280, 250)">
              <path d="M0 16c0 8.5-9 15-9 15s-9-6.5-9-15a9 9 0 1 1 18 0Z" fill="var(--color-map-pin-progress)" />
              <circle cx="-9" cy="-1" r="3.2" fill="white" />
            </g>
            {/* Pin 3 — resolved (green) */}
            <g transform="translate(420, 110)">
              <path d="M0 16c0 8.5-9 15-9 15s-9-6.5-9-15a9 9 0 1 1 18 0Z" fill="var(--color-map-pin-resolved)" />
              <circle cx="-9" cy="-1" r="3.2" fill="white" />
            </g>
            {/* Pin 4 — open (red) */}
            <g transform="translate(180, 400)">
              <path d="M0 16c0 8.5-9 15-9 15s-9-6.5-9-15a9 9 0 1 1 18 0Z" fill="var(--color-map-pin-open)" />
              <circle cx="-9" cy="-1" r="3.2" fill="white" />
            </g>
            {/* Pin 5 — in progress */}
            <g transform="translate(440, 330)">
              <path d="M0 16c0 8.5-9 15-9 15s-9-6.5-9-15a9 9 0 1 1 18 0Z" fill="var(--color-map-pin-progress)" />
              <circle cx="-9" cy="-1" r="3.2" fill="white" />
            </g>
          </svg>
        </div>
      </aside>
    </div>
  );
}

/**
 * One marker in the splash's trust strip — a glyph plus a label.
 *
 * The glyph is decorative: the label carries the meaning, so the icon
 * is hidden from assistive technology rather than announced twice.
 */
function TrustItem({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
      }}
    >
      <span
        aria-hidden
        style={{ display: 'inline-flex', alignItems: 'center' }}
      >
        {icon}
      </span>
      <span>{children}</span>
    </span>
  );
}
