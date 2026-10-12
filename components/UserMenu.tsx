'use client';

/**
 * UserMenu — top-right avatar dropdown with logout.
 *
 * Renders in every authenticated surface (citizen /home, dispatcher
 * /dispatcher, crew /crew, admin pages). A 32px circular button
 * shows the user's initials; clicking opens a small panel anchored
 * below the button that lists the user's name + role + (for non-
 * citizens) the city/ward scope, then a Logout action.
 *
 * Behaviour:
 *   - Click the button to open; click again or click outside to close.
 *   - Escape closes the menu when open.
 *   - The menu itself is keyboard navigable (Tab/Shift+Tab through
 *     the buttons; the panel uses role="menu" so screen readers
 *     announce it).
 *   - Logout POSTs to /api/auth/logout and reloads the window at
 *     `/` so any client caches (route prefetch, splash visual) are
 *     cleared. The welcome page then renders the public landing
 *     for an anonymous visitor.
 *
 * The component never blocks the page render: while the auth/status
 * call is in flight the avatar shows a fallback (a grey circle
 * labelled with "—"). Once the response arrives the real initials
 * replace it.
 *
 * i18n: copy comes from `lib/i18n/keys.ts`. The `lang` prop is
 * forwarded to every t() call.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { t, type Language } from '@/lib/i18n/keys';

type Role = 'citizen' | 'dispatcher' | 'crew' | 'admin';

interface UserMenuProps {
  /** Active UI language. Bangla-first default. */
  lang?: Language;
}

interface StatusPayload {
  authenticated: boolean;
  session: {
    sessionId: string;
    userId: string;
    role: Role;
    cityId: string;
    wardId: string | null;
    name: string | null;
  } | null;
}

const ROLE_KEY: Record<Role, keyof typeof import('@/lib/i18n/keys').TRANSLATIONS> =
  {
    citizen: 'user.menu.role.citizen',
    dispatcher: 'user.menu.role.dispatcher',
    crew: 'user.menu.role.crew',
    admin: 'user.menu.role.admin',
  };

function initialsOf(name: string | null | undefined): string {
  if (!name) return '—';
  const trimmed = name.trim();
  if (!trimmed) return '—';
  // For Bangla names we just take the first character; for Latin
  // names we take the first letter of up to two whitespace-separated
  // words. The visual goal is "looks like initials" — anything
  // further is out of scope for v1.
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 1);
  return (parts[0].slice(0, 1) + parts[parts.length - 1].slice(0, 1)).toUpperCase();
}

export function UserMenu({ lang = 'bn' }: UserMenuProps) {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuId = useId();

  // Fetch auth/status once on mount. The endpoint is cheap (single
  // session + user lookup) and is the canonical source for both
  // "am I signed in?" and "what's my role/name?".
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/status', { credentials: 'same-origin' });
        if (!res.ok || cancelled) return;
        const payload = (await res.json()) as StatusPayload;
        if (!cancelled) setStatus(payload);
      } catch {
        // Network error / offline. Leave status null; the avatar
        // will show the fallback glyph.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Close on Escape + click outside.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      const root = containerRef.current;
      if (root && e.target instanceof Node && !root.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  const onToggle = useCallback(() => {
    setOpen((v) => !v);
  }, []);

  const onLogout = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    setOpen(false);
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
      });
    } catch {
      // The endpoint is idempotent; even on failure the cookie
      // gets cleared the next time the user lands. We still
      // redirect — leaving the user stuck on a page that thinks
      // they are signed in is worse than a hard reload.
    }
    // Hard reload to `/` so the splash/landing visual re-bootstraps
    // and any client caches (router prefetch, theme localStorage)
    // are cleared.
    window.location.href = '/';
  }, [signingOut]);

  const name = status?.session?.name ?? null;
  const role = status?.session?.role ?? null;
  const initials = initialsOf(name);

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', display: 'inline-block' }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-label={
          name
            ? t('user.menu.aria.avatar', { name }, lang)
            : t('user.menu.open_menu', null, lang)
        }
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={onToggle}
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: 'var(--color-primary-soft, #e6f2ee)',
          color: 'var(--color-primary)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 'var(--text-caption)',
          fontWeight: 'var(--weight-bold)',
          border: '1px solid var(--color-border)',
          cursor: 'pointer',
          padding: 0,
          fontFamily: 'inherit',
        }}
      >
        {initials}
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={t('user.menu.open_menu', null, lang)}
          style={{
            position: 'absolute',
            top: 'calc(100% + var(--space-2))',
            right: 0,
            minWidth: 220,
            background: 'var(--color-surface-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-card)',
            boxShadow: 'var(--shadow-popover, 0 4px 12px rgba(0,0,0,0.08))',
            padding: 'var(--space-3)',
            zIndex: 50,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
          }}
        >
          <div
            style={{
              padding: 'var(--space-1) var(--space-2)',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            <span
              style={{
                fontSize: 'var(--text-body)',
                fontWeight: 'var(--weight-semibold)',
                color: 'var(--color-ink)',
                lineHeight: 1.3,
              }}
            >
              {name ?? '—'}
            </span>
            {role && (
              <span
                style={{
                  fontSize: 'var(--text-caption)',
                  color: 'var(--color-ink-secondary)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 'var(--space-1)',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    display: 'inline-block',
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'var(--color-primary)',
                  }}
                />
                {t(ROLE_KEY[role], null, lang)}
              </span>
            )}
          </div>

          <div
            style={{
              height: 1,
              background: 'var(--color-border)',
              margin: 'var(--space-1) 0',
            }}
          />

          <button
            type="button"
            role="menuitem"
            onClick={onLogout}
            disabled={signingOut}
            style={{
              padding: 'var(--space-2) var(--space-3)',
              background: 'transparent',
              border: 'none',
              borderRadius: 'var(--radius-input)',
              color: 'var(--color-danger, #c0392b)',
              fontWeight: 'var(--weight-semibold)',
              fontSize: 'var(--text-body)',
              textAlign: 'left',
              cursor: signingOut ? 'wait' : 'pointer',
              fontFamily: 'inherit',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
              focusable="false"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            {signingOut
              ? t('user.menu.signing_out', null, lang)
              : t('user.menu.logout', null, lang)}
          </button>
        </div>
      )}
    </div>
  );
}