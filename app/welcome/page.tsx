/**
 * 1.2 Welcome (first run only)
 *
 * Per spec 1.2-welcome/1.2-welcome.md and mockup 01-welcome.html:
 *   - Two-column web hero at large viewport (brand + headline left,
 *     abstract city illustration right), single column at medium.
 *   - CTA pair (Register / Login) at the bottom of the left column.
 *   - Trust strip with 3 markers below the CTAs.
 *   - Language toggle in the top-right of the left column.
 *   - Bangla-first; toggle flips the whole screen and persists.
 *
 * First-run gate: on first render, set localStorage.welcome_seen = true
 * so the splash skips Welcome on the next launch.
 *
 * Per Phase B (2026-10-04): web-first, 1440 × 900 large + 1024 × 768
 * medium. No mobile-only chrome.
 */

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { t, type Language } from '@/lib/i18n/keys';

const LANG_KEY = 'cityfix.preferred_language.v1';
const WELCOME_SEEN_KEY = 'cityfix.welcome_seen.v1';

export default function WelcomePage() {
  const [lang, setLang] = useState<Language>('bn');

  useEffect(() => {
    // Mark welcome seen so the splash skips it on next launch. Set
    // immediately on mount, not after a tap, per spec 1.2 (Behavior).
    try {
      window.localStorage.setItem(WELCOME_SEEN_KEY, 'true');
      const stored = window.localStorage.getItem(LANG_KEY);
      if (stored === 'en' || stored === 'bn') setLang(stored);
    } catch {
      // localStorage unavailable — proceed with default language.
    }
  }, []);

  function toggleLang() {
    const next: Language = lang === 'bn' ? 'en' : 'bn';
    setLang(next);
    try {
      window.localStorage.setItem(LANG_KEY, next);
    } catch {
      // ignore
    }
  }

  const headline = t('welcome.headline', null, lang);
  const subhead = t('welcome.subhead', null, lang);

  return (
    <div
      className="welcome-page"
      style={{
        minHeight: '100vh',
        maxWidth: 'var(--layout-desktop, 1440px)',
        margin: '0 auto',
        display: 'flex',
        alignItems: 'stretch',
        background: 'var(--color-surface-page)',
      }}
    >
      <style>{`
        @media (max-width: 1024px) {
          .welcome-page { flex-direction: column !important; }
          .welcome-hero { padding: var(--space-7) var(--space-5) var(--space-6) !important; min-height: auto !important; }
          .welcome-illustration { display: none !important; }
        }
      `}</style>

      {/* Hero column */}
      <section
        className="welcome-hero"
        style={{
          flex: 1.1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 'var(--space-8) var(--space-8) var(--space-7)',
          minHeight: '100vh',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Link
            href="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              textDecoration: 'none',
              color: 'var(--color-ink)',
            }}
            aria-label="CityFix home"
          >
            <span
              aria-hidden
              style={{
                width: 14,
                height: 14,
                background: 'var(--color-primary)',
                borderRadius: '50%',
              }}
            />
            <span
              style={{
                fontSize: 'var(--text-body-lg)',
                fontWeight: 'var(--weight-bold)',
              }}
            >
              CityFix
            </span>
          </Link>
          <button
            type="button"
            onClick={toggleLang}
            aria-label="Toggle language"
            style={{
              padding: 'var(--space-1) var(--space-3)',
              background: 'transparent',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-pill)',
              color: 'var(--color-ink-secondary)',
              fontSize: 'var(--text-caption)',
              fontWeight: 'var(--weight-semibold)',
              cursor: 'pointer',
            }}
          >
            {t('welcome.lang.toggle', null, lang)}
          </button>
        </header>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-5)',
            marginTop: 'var(--space-7)',
            maxWidth: 560,
          }}
        >
          <h1
            lang={lang}
            style={{
              fontSize: 'var(--text-display-lg)',
              fontWeight: 'var(--weight-semibold)',
              color: 'var(--color-ink)',
              margin: 0,
              letterSpacing: 'var(--tracking-tight)',
              lineHeight: 1.15,
            }}
            dangerouslySetInnerHTML={{ __html: headline }}
          />
          <p
            lang={lang}
            style={{
              fontSize: 'var(--text-body-lg)',
              color: 'var(--color-ink-secondary)',
              margin: 0,
              lineHeight: 1.6,
            }}
          >
            {subhead}
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-5)',
            marginTop: 'var(--space-7)',
            maxWidth: 520,
            width: '100%',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 'var(--space-3)',
            }}
          >
            <Link
              href="/register"
              style={{
                height: 64,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--color-primary)',
                color: 'var(--color-on-primary)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-body-lg)',
                fontWeight: 'var(--weight-semibold)',
                textDecoration: 'none',
              }}
            >
              {t('welcome.cta.register', null, lang)}
            </Link>
            <Link
              href="/login"
              style={{
                height: 64,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'transparent',
                color: 'var(--color-ink)',
                border: '1px solid var(--color-border-strong, #aaa)',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-body-lg)',
                fontWeight: 'var(--weight-semibold)',
                textDecoration: 'none',
              }}
            >
              {t('welcome.cta.login', null, lang)}
            </Link>
          </div>

          {/* Trust strip */}
          <div
            style={{
              display: 'flex',
              gap: 'var(--space-3)',
              alignItems: 'center',
              padding: 'var(--space-3) var(--space-4)',
              background: 'var(--color-surface-raised)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-pill)',
              fontSize: 'var(--text-caption)',
              color: 'var(--color-ink-tertiary)',
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}
            >
              <ShieldIcon />
              {t('welcome.trust.government', null, lang)}
            </span>
            <Divider />
            <span
              style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}
            >
              <LockIcon />
              {t('welcome.trust.secure', null, lang)}
            </span>
            <Divider />
            <span
              style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}
            >
              <GlobeIcon />
              {t('welcome.trust.language', null, lang)}
            </span>
          </div>
        </div>
      </section>

      {/* Illustration column — abstract pin map (decorative) */}
      <aside
        className="welcome-illustration"
        aria-hidden
        style={{
          flex: 1,
          background: 'var(--color-surface-card)',
          borderLeft: '1px solid var(--color-border)',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--space-7)',
        }}
      >
        <PinMapArt />
      </aside>
    </div>
  );
}

function Divider() {
  return (
    <span
      aria-hidden
      style={{
        width: 1,
        height: 12,
        background: 'var(--color-border)',
      }}
    />
  );
}

function ShieldIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15 15 0 0 1 0 20a15 15 0 0 1 0-20z" />
    </svg>
  );
}

/**
 * Decorative abstract pin map. Pure SVG — three clusters of status pins
 * over stylized roads, park, water. No interaction.
 */
function PinMapArt() {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 520 520"
      style={{ maxWidth: 520, maxHeight: 520 }}
      role="presentation"
    >
      <defs>
        <linearGradient id="cf-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-surface-raised, #f4f4f4)" />
          <stop offset="100%" stopColor="var(--color-surface-page, #fafafa)" />
        </linearGradient>
      </defs>
      {/* Roads */}
      <g stroke="var(--color-border)" strokeWidth="3" fill="none">
        <path d="M40 80 L480 80" />
        <path d="M40 220 L480 220" />
        <path d="M40 360 L480 360" />
        <path d="M40 480 L480 480" />
        <path d="M80 40 L80 480" />
        <path d="M260 40 L260 480" />
        <path d="M440 40 L440 480" />
      </g>
      {/* Park */}
      <rect
        x="100"
        y="100"
        width="140"
        height="100"
        rx="12"
        fill="var(--color-primary-soft, #e6f2ee)"
      />
      <text
        x="170"
        y="156"
        textAnchor="middle"
        fontSize="14"
        fill="var(--color-ink-tertiary)"
      >
        Park
      </text>
      {/* Water */}
      <rect
        x="280"
        y="380"
        width="140"
        height="80"
        rx="12"
        fill="url(#cf-water)"
      />
      <text
        x="350"
        y="426"
        textAnchor="middle"
        fontSize="14"
        fill="var(--color-ink-tertiary)"
      >
        Lake
      </text>
      {/* Pin clusters */}
      <Pin cx={120} cy={280} status="submitted" />
      <Pin cx={170} cy={300} status="in_progress" />
      <Pin cx={310} cy={140} status="resolved" />
      <Pin cx={360} cy={180} status="resolved" />
      <Pin cx={400} cy={140} status="submitted" />
      <Pin cx={420} cy={420} status="in_progress" />
      <Pin cx={380} cy={440} status="resolved" />
      <Pin cx={200} cy={420} status="submitted" />
    </svg>
  );
}

function Pin({ cx, cy, status }: { cx: number; cy: number; status: 'submitted' | 'in_progress' | 'resolved' }) {
  const fill =
    status === 'resolved'
      ? 'var(--color-status-resolved, #1f7a3f)'
      : status === 'in_progress'
        ? 'var(--color-status-in-progress, #1f6feb)'
        : 'var(--color-primary)';
  return (
    <g>
      <circle cx={cx} cy={cy} r="14" fill="white" stroke={fill} strokeWidth="2" />
      <circle cx={cx} cy={cy} r="6" fill={fill} />
    </g>
  );
}
