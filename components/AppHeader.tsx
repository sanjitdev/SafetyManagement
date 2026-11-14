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
 *   3. Right cluster: language toggle, theme toggle, user menu
 *      (or sign-in / register buttons when signed-out).
 *
 * REMOVED 2026-11-14 (demo simplification):
 *   - The header SEARCH BOX. It submitted `?q=` to /admin/tickets,
 *     /dispatcher or /reports — but only the first two READ that
 *     param; /reports ignored it, so the citizen path (the default
 *     target) was a silent no-op. Both pages that DO read `q=` carry
 *     their own search input / filter, so the header form was a
 *     redundant second entry point rather than the only one.
 *   - The primary Report CTA button. The report flow is reached from
 *     the home page's own CTA and from `RoleSidebar`'s "New report"
 *     item, so the header copy was redundant — and the flow variant
 *     already suppressed it mid-flow precisely because a second
 *     "start a report" control there discards the draft in progress.
 *   - The inline-nav BURGER and its dropdown panel. The compact
 *     header carries two nav affordances on a phone: the
 *     `.appheader-open-nav` button (opens the role sidebar) and this
 *     burger (a dropdown of the inline nav). The search input used
 *     to sit between them and push them to opposite ends of the bar;
 *     removing the search left two identical hamburger buttons side
 *     by side. The burger was the redundant one — the citizen role
 *     sidebar carries Home, My Reports, New Report, Feed and Profile,
 *     a strict superset of the dropdown's Home / Feed / My Reports.
 *
 * Mobile (≤ 768px): the inline nav is hidden and the role sidebar is
 * opened by `.appheader-open-nav` instead.
 *
 * The header is sticky and consumes 64dp on desktop / 56dp on
 * mobile (--header-height-desktop / --header-height-mobile from
 * tokens.css). The AppShell body below it uses
 * `min-height: calc(100dvh - var(--header-height-desktop))` so the
 * page never produces a viewport scrollbar from chrome alone —
 * any scrolling is contained to inner regions.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';
import { CityFixMark } from './CityFixMark';
import { useSession } from './SessionProvider';
import { useLanguage } from './useLanguage';
import { t, type Language } from '@/lib/i18n/keys';
import { ICONS } from '@/lib/ui/icon-map';

interface AppHeaderProps {
  /** Active UI language. Bangla-first default. */
  lang?: Language;
  /**
   * The current persona. Staff surfaces (dispatcher / crew / admin)
   * get a role-tinted brand and no inline nav.
   */
  role?: 'citizen' | 'staff' | 'public';
  /**
   * Whether the user is signed in. Controls whether the right
   * cluster shows the UserMenu or a sign-in / register pair.
   *
   * When omitted, the header reads the shared session from
   * `SessionProvider` — which owns the single `/api/auth/status`
   * probe. The header no longer fetches the session itself: doing so
   * meant a second request on every page load (the header, the role
   * sidebar and the user menu each probed independently).
   */
  signedIn?: boolean | null;
  /** Compact operational top bar used beside the role sidebar. */
  compact?: boolean;
  /**
   * The focused, single-task shell used by the report flow.
   *
   * Mockup 14 (`mockups/14-report-shell.html`) specifies a `header.flowbar`
   * for a mid-flow step: the brand, a TASK TAG ("রিপোর্ট করুন"), and the
   * two global controls (language + theme). It deliberately does NOT
   * carry the city-wide navigation.
   *
   * The flow tag is a LABEL, not a link. The report flow starts at
   * `/report/location` — the FIRST step of the very flow the citizen is
   * halfway through — so a "start a report" control rendered mid-flow
   * would offer a control that silently discards the draft in progress.
   * `RoleSidebar` carries the actual link as its third item.
   *
   * The avatar / user menu IS kept, even though mockup 14 omits it:
   * the report flow is the one place a signed-in citizen has no other
   * way to log out, and dropping a working affordance to match a
   * mockup's inventory would be a functional regression.
   */
  variant?: 'default' | 'flow';
  /**
   * Whether the role sidebar is rendered beside this header.
   *
   * When it is, the sidebar carries the brand lockup (mark +
   * wordmark + tagline), so the header's own brand block is hidden —
   * otherwise the wordmark "CityFix" appears twice, side by side.
   * The flow task tag is NOT hidden: it labels what the citizen is
   * doing, and it lives in the same header row.
   */
  sidebar?: boolean;
  /** Whether the responsive role navigation drawer is open. */
  navOpen?: boolean;
  onOpenNav?: () => void;
}

export function AppHeader({ lang: langProp, role = 'public', signedIn: signedInProp, compact = false, variant = 'default', sidebar = false, navOpen = false, onOpenNav }: AppHeaderProps) {
  const pathname = usePathname() ?? '/';
  // The shared hook owns the language. `langProp` still wins when a
  // caller passes it — that is the escape hatch for a surface that
  // resolves the language server-side. Otherwise the hook reads the
  // stored preference during the first render (no Bangla flash) and
  // subscribes to `cityfix:language-updated`, so the header and the
  // page body always move together.
  const { lang: hookLang, setLang } = useLanguage(langProp);
  const lang = langProp ?? hookLang;

  // The session comes from the shared provider (one request per page
  // load, shared by the header, the role sidebar and the user menu).
  // `signedInProp` still wins when a caller passes it — that is the
  // escape hatch for surfaces that already resolved the session
  // server-side and want to skip the probe entirely.
  const { authenticated } = useSession();
  const signedIn = signedInProp ?? authenticated;

  function toggleLang() {
    const next: Language = lang === 'bn' ? 'en' : 'bn';
    // The hook's setter persists the choice AND publishes the
    // `cityfix:language-updated` event, so every surface — this
    // header, the role sidebar and the page body — re-renders on the
    // same tick.
    setLang(next);
  }

  const notificationHref = pathname.startsWith('/admin')
    ? '/admin/audit'
    : pathname.startsWith('/dispatcher')
      ? '/dispatcher/monitor'
      : pathname.startsWith('/crew')
        ? '/crew'
        : '/feed';

  const navItems = [
    { href: '/home', label: t('header.nav.home', null, lang), icon: ICONS.home },
    { href: '/feed', label: t('header.nav.feed', null, lang), icon: ICONS.feed },
    { href: '/reports', label: t('header.nav.reports', null, lang), icon: ICONS.reports },
  ];

  const showNav = signedIn === true && role !== 'staff' && variant !== 'flow';
  // The flow variant drops the nav, the CTA and the city tagline, and
  // carries the task tag instead — mockup 14's `.flow-tag`.
  const isFlow = variant === 'flow';

  return (
    <header
      className="appheader-root"
      data-role={role}
      data-compact={compact ? 'true' : undefined}
      data-variant={isFlow ? 'flow' : undefined}
      data-sidebar={sidebar ? 'true' : undefined}
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
          className="appheader-brand"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            textDecoration: 'none',
            color: 'var(--color-ink)',
            flexShrink: 0,
          }}
        >
          <CityFixMark />
          <span
            style={{
              fontSize: 'var(--text-body-lg)',
              fontWeight: 'var(--weight-bold)',
              whiteSpace: 'nowrap',
              fontFamily: 'var(--font-display)',
              letterSpacing: '-0.035em',
            }}
          >
            CityFix
          </span>
          <span
            className="appheader-city"
            lang={lang}
            style={{
              // --text-micro (12px) to match the role-sidebar and admin
              // brand taglines. The header tagline used to be
              // --text-body-sm (15px), which made the same brand render
              // at two different tagline sizes depending on the surface.
              fontSize: 'var(--text-micro)',
              color: 'var(--color-ink-secondary)',
              marginLeft: 'var(--space-1)',
              whiteSpace: 'nowrap',
            }}
          >
            · {t('header.brand.city', null, lang)}
          </span>
        </Link>

        {/* FLOW VARIANT: the task tag.
            Mockup 14 puts a "রিপোর্ট করুন" pill next to the brand to
            say what the citizen is currently doing. It is a LABEL, not
            a link — the flow's own CTA would restart the flow. */}
        {isFlow && (
          <span
            className="appheader-flow-tag"
            lang={lang}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              padding: 'var(--space-1) var(--space-3)',
              background: 'var(--color-primary-soft)',
              color: 'var(--color-primary)',
              borderRadius: 'var(--radius-pill)',
              fontSize: 'var(--text-caption)',
              fontWeight: 'var(--weight-semibold)',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            <ICONS.newReport.icon size={16} weight={ICONS.newReport.weight} aria-hidden focusable="false" />
            <span className="appheader-flow-tag-label">
              {t('header.nav.report', null, lang)}
            </span>
          </span>
        )}

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
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                    padding: 'var(--space-1) var(--space-3)',
                    fontSize: 'var(--text-body-sm)',
                    fontWeight: active ? 'var(--weight-semibold)' : 'var(--weight-medium)',
                    color: active ? 'var(--color-primary)' : 'var(--color-ink-secondary)',
                    background: active ? 'var(--color-primary-soft)' : 'transparent',
                    textDecoration: 'none',
                    borderRadius: 'var(--radius-pill)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <item.icon.icon
                    size={16}
                    weight={item.icon.weight}
                    aria-hidden
                    focusable="false"
                  />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        )}
      </div>

      {compact ? (
        <div className="appheader-compact-tools">
          <button type="button" className="appheader-open-nav" aria-label={t('shell.nav.open', null, lang)} aria-expanded={navOpen} aria-controls="role-sidebar" onClick={onOpenNav}>
            <ICONS.menu.icon size={20} aria-hidden />
          </button>
        </div>
      ) : null}

      {/* RIGHT: lang + theme + user menu (or sign-in / register) */}
      <div
        className="appheader-actions"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          flexShrink: 0,
        }}
      >
        {compact ? (
          <Link href={notificationHref} className="appheader-notifications" aria-label={t('shell.nav.notifications', null, lang)} title={t('shell.nav.notifications', null, lang)}>
            <ICONS.notifications.icon size={20} aria-hidden />
          </Link>
        ) : null}
        <button
          type="button"
          onClick={toggleLang}
          aria-label={t('welcome.lang.toggle', null, lang)}
          title={t('welcome.lang.toggle', null, lang)}
          style={{
            height: 40,
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
      </div>

      {/*
       * The header's responsive rules live in a plain <style> with
       * `dangerouslySetInnerHTML` rather than a JSX text child.
       *
       * React ESCAPES a <style> element's text child, so the
       * server-rendered markup and the client's copy diverged the
       * moment the CSS contained a quote character — which produced
       * a hydration mismatch on every page that renders the header
       * (/reports, /feed, /home). A static literal passed through
       * dangerouslySetInnerHTML is emitted verbatim on both sides.
       */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @media (max-width: 768px) {
          .appheader-nav { display: none !important; }
          .appheader-city { display: none !important; }
          .appheader-signin { display: none !important; }
        }
        @media (max-width: 640px) {
          /* The focused flow bar carries the brand, the task tag and
             the two global controls. On a 390px phone that is too
             much for one row, so the task tag's LABEL collapses to
             its icon — the tag stays, it just stops pushing the
             toggles off the right edge. */
          .appheader-root[data-variant="flow"] .appheader-flow-tag { padding: var(--space-1); }
          .appheader-root[data-variant="flow"] .appheader-flow-tag > span { display: none; }
        }
        @media (max-width: 640px) {
          .appheader-root { padding-inline: var(--space-2) !important; gap: var(--space-1) !important; }
          .appheader-root > div:first-of-type { gap: var(--space-2) !important; }
          .appheader-actions { gap: var(--space-1) !important; }
          .appheader-root > div:first-of-type > a > span:first-child { width: 32px !important; height: 32px !important; }
          .usermenu-label { display: none; }
        }
        .appheader-root .usermenu-trigger:hover { background: var(--color-surface-raised) !important; }
        .usermenu-profile-link { transition: background var(--duration-fast) var(--ease-out); }
        .usermenu-profile-link:hover { background: var(--color-primary-soft) !important; }
        .usermenu-logout:hover { background: var(--color-danger-soft) !important; }
      `,
        }}
      />
    </header>
  );
}
