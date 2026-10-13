'use client';

/**
 * AppHeader (components/AppHeader.tsx).
 *
 * The single, persistent top-of-page chrome rendered by AppShell on
 * every authenticated and public surface. Replaces the three
 * one-off headers that Bolt 006-003 left behind (the home page's
 * brand+Report+my_reports+avatar bar, the /report/* layout's
 * brand+Submit-tag+step-pill+actions bar, and the dispatcher /
 * admin / crew pages that had no header at all).
 *
 * Composition (left → right):
 *   1. Brand (CityFix logo + city tagline) — links to /home.
 *   2. Inline nav (Home / Activity / My reports) — only when
 *      signed in; the public landing keeps just the brand.
 *   3. Primary Report CTA (the most-tapped action) — only on
 *      citizen surfaces (the dispatcher / crew / admin pages
 *      receive `role="staff"` and don't render it).
 *   4. Right cluster: language toggle, theme toggle, user menu
 *      (or sign-in / register buttons when signed-out).
 *
 * Mobile (≤ 768px): the inline nav collapses behind a hamburger
 * button that opens a full-width dropdown panel.
 *
 * The header is sticky and consumes 64dp on desktop / 56dp on
 * mobile (--header-height-desktop / --header-height-mobile from
 * tokens.css). The AppShell body below it uses
 * `min-height: calc(100dvh - var(--header-height-desktop))` so the
 * page never produces a viewport scrollbar from chrome alone —
 * any scrolling is contained to inner regions.
 */

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';
import { t, type Language } from '@/lib/i18n/keys';

interface AppHeaderProps {
  /** Active UI language. Bangla-first default. */
  lang?: Language;
  /**
   * The current persona. Citizen surfaces receive the "New report"
   * primary CTA; staff surfaces (dispatcher / crew / admin) get
   * a role-tinted brand and no Report button.
   */
  role?: 'citizen' | 'staff' | 'public';
  /**
   * Whether the user is signed in. Controls whether the right
   * cluster shows the UserMenu or a sign-in / register pair.
   * When omitted, the header probes /api/auth/status itself.
   */
  signedIn?: boolean | null;
}

const LANG_KEY = 'cityfix.preferred_language.v1';

export function AppHeader({ lang: langProp, role = 'public', signedIn: signedInProp }: AppHeaderProps) {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const [lang, setLang] = useState<Language>(langProp ?? 'bn');
  const [signedIn, setSignedIn] = useState<boolean | null>(signedInProp ?? null);
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  // Hydrate language + auth from localStorage / status endpoint.
  // We do this in the header rather than the page so the chrome
  // is always in sync with the user's preference even when a page
  // has no language state of its own.
  useEffect(() => {
    if (!langProp) {
      try {
        const stored = window.localStorage.getItem(LANG_KEY);
        if (stored === 'en' || stored === 'bn') setLang(stored);
      } catch {
        // ignore
      }
    }
  }, [langProp]);

  useEffect(() => {
    if (signedInProp != null) return; // caller already knows
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/status', { credentials: 'same-origin' });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { authenticated: boolean };
        if (!cancelled) setSignedIn(Boolean(data.authenticated));
      } catch {
        if (!cancelled) setSignedIn(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signedInProp]);

  // Close the mobile menu on route change and on Escape / outside click.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      const root = containerRef.current;
      if (root && e.target instanceof Node && !root.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [menuOpen]);

  function toggleLang() {
    const next: Language = lang === 'bn' ? 'en' : 'bn';
    setLang(next);
    try {
      window.localStorage.setItem(LANG_KEY, next);
    } catch {
      // ignore
    }
  }

  const navItems = [
    { href: '/home', label: t('header.nav.home', null, lang) },
    { href: '/feed', label: t('header.nav.feed', null, lang) },
    { href: '/reports', label: t('header.nav.reports', null, lang) },
  ];

  const showNav = signedIn === true && role !== 'staff';
  const showReportCta = role !== 'staff' && signedIn !== false;

  return (
    <header
      ref={containerRef}
      data-role={role}
      style={{
        height: 'var(--header-height-desktop)',
        background: 'var(--color-surface-card)',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 var(--space-5)',
        position: 'sticky',
        top: 0,
        zIndex: 'var(--z-sticky, 50)',
        gap: 'var(--space-3)',
        flexShrink: 0,
      }}
    >
      {/* LEFT: brand + inline nav */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-5)',
          minWidth: 0,
          flex: '1 1 auto',
        }}
      >
        <Link
          href="/home"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            textDecoration: 'none',
            color: 'var(--color-ink)',
            flexShrink: 0,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 12,
              height: 12,
              background: 'var(--color-primary)',
              borderRadius: '50%',
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: 'var(--text-body-lg)',
              fontWeight: 'var(--weight-bold)',
              whiteSpace: 'nowrap',
              fontFamily: 'var(--font-display)',
              letterSpacing: 'var(--tracking-tight)',
            }}
          >
            CityFix
          </span>
          <span
            className="appheader-city"
            lang={lang}
            style={{
              fontSize: 'var(--text-body-sm)',
              color: 'var(--color-ink-secondary)',
              marginLeft: 'var(--space-1)',
              whiteSpace: 'nowrap',
            }}
          >
            · {t('header.brand.city', null, lang)}
          </span>
        </Link>

        {/* Desktop inline nav (≥ 768px) */}
        {showNav && (
          <nav
            aria-label={t('header.nav.menu_label', null, lang)}
            className="appheader-nav"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-1)',
            }}
          >
            {navItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  lang={lang}
                  aria-current={active ? 'page' : undefined}
                  style={{
                    padding: 'var(--space-1) var(--space-3)',
                    fontSize: 'var(--text-body-sm)',
                    fontWeight: active ? 'var(--weight-semibold)' : 'var(--weight-medium)',
                    color: active ? 'var(--color-primary)' : 'var(--color-ink-secondary)',
                    background: active ? 'var(--color-primary-soft, #e6f2ee)' : 'transparent',
                    textDecoration: 'none',
                    borderRadius: 'var(--radius-pill)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        )}
      </div>

      {/* CENTER: primary Report CTA — citizen only */}
      {showReportCta && (
        <button
          type="button"
          onClick={() => router.push('/report/location')}
          lang={lang}
          className="appheader-cta"
          style={{
            height: 44,
            padding: '0 var(--space-5)',
            background: 'var(--color-primary)',
            color: 'var(--color-on-primary)',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--text-body)',
            fontWeight: 'var(--weight-semibold)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            flexShrink: 0,
            whiteSpace: 'nowrap',
            fontFamily: 'inherit',
          }}
        >
          <PlusIcon />
          {t('header.nav.report', null, lang)}
        </button>
      )}

      {/* RIGHT: lang + theme + user menu (or sign-in / register) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={toggleLang}
          aria-label={t('welcome.lang.toggle', null, lang)}
          title={t('welcome.lang.toggle', null, lang)}
          style={{
            height: 36,
            minWidth: 40,
            padding: '0 var(--space-3)',
            background: 'transparent',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-pill)',
            color: 'var(--color-ink-secondary)',
            fontSize: 'var(--text-caption)',
            fontWeight: 'var(--weight-semibold)',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {t('welcome.lang.toggle', null, lang)}
        </button>

        <ThemeToggle lang={lang} />

        {signedIn === true ? (
          <UserMenu lang={lang} />
        ) : signedIn === false ? (
          <div
            className="appheader-signin"
            style={{ display: 'inline-flex', gap: 'var(--space-1)' }}
          >
            <Link
              href="/login"
              lang={lang}
              style={{
                height: 36,
                padding: '0 var(--space-3)',
                display: 'inline-flex',
                alignItems: 'center',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-pill)',
                color: 'var(--color-ink-secondary)',
                fontSize: 'var(--text-caption)',
                fontWeight: 'var(--weight-semibold)',
                textDecoration: 'none',
              }}
            >
              {t('header.user.signin', null, lang)}
            </Link>
            <Link
              href="/register"
              lang={lang}
              style={{
                height: 36,
                padding: '0 var(--space-3)',
                display: 'inline-flex',
                alignItems: 'center',
                background: 'var(--color-primary)',
                color: 'var(--color-on-primary)',
                borderRadius: 'var(--radius-pill)',
                fontSize: 'var(--text-caption)',
                fontWeight: 'var(--weight-semibold)',
                textDecoration: 'none',
              }}
            >
              {t('header.user.register', null, lang)}
            </Link>
          </div>
        ) : null}

        {/* Mobile hamburger (only when nav would otherwise overflow) */}
        {showNav && (
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={t('header.nav.toggle_menu', null, lang)}
            aria-expanded={menuOpen}
            aria-controls={menuId}
            className="appheader-burger"
            style={{
              width: 36,
              height: 36,
              display: 'none', // shown via CSS at ≤ 768px
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: '1px solid var(--color-border)',
              borderRadius: '50%',
              color: 'var(--color-ink-secondary)',
              cursor: 'pointer',
              padding: 0,
              fontFamily: 'inherit',
            }}
          >
            <BurgerIcon open={menuOpen} />
          </button>
        )}
      </div>

      {/* Mobile dropdown panel */}
      {showNav && menuOpen && (
        <div
          id={menuId}
          role="menu"
          className="appheader-menu"
          style={{
            position: 'absolute',
            top: 'calc(var(--header-height-desktop) + 4px)',
            left: 'var(--space-3)',
            right: 'var(--space-3)',
            background: 'var(--color-surface-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-card)',
            boxShadow: 'var(--shadow-popover, 0 4px 12px rgba(0,0,0,0.08))',
            padding: 'var(--space-2)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-1)',
            zIndex: 60,
          }}
        >
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                lang={lang}
                style={{
                  padding: 'var(--space-3) var(--space-4)',
                  fontSize: 'var(--text-body)',
                  fontWeight: active ? 'var(--weight-semibold)' : 'var(--weight-medium)',
                  color: active ? 'var(--color-primary)' : 'var(--color-ink)',
                  background: active ? 'var(--color-primary-soft, #e6f2ee)' : 'transparent',
                  textDecoration: 'none',
                  borderRadius: 'var(--radius-input)',
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .appheader-nav { display: none !important; }
          .appheader-burger { display: inline-flex !important; }
          .appheader-city { display: none !important; }
          .appheader-signin { display: none !important; }
        }
        @media (max-width: 640px) {
          .appheader-cta span { display: none; }
        }
      `}</style>
    </header>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden focusable="false">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function BurgerIcon({ open }: { open: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden focusable="false">
      {open ? (
        <>
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="18" y1="6" x2="6" y2="18" />
        </>
      ) : (
        <>
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="18" x2="20" y2="18" />
        </>
      )}
    </svg>
  );
}
