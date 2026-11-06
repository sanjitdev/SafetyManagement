'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useSession, type SessionRole } from './SessionProvider';
import { t, type Language } from '@/lib/i18n/keys';

type Role = SessionRole;

interface UserMenuProps {
  lang?: Language;
  variant?: 'header' | 'sidebar';
}

const ROLE_KEY: Record<Role, keyof typeof import('@/lib/i18n/keys').TRANSLATIONS> = {
  citizen: 'user.menu.role.citizen',
  dispatcher: 'user.menu.role.dispatcher',
  crew: 'user.menu.role.crew',
  admin: 'user.menu.role.admin',
};

function initialsOf(name: string | null | undefined): string | null {
  const words = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (!words.length) return null;
  return words.length === 1
    ? words[0].slice(0, 1)
    : `${words[0].slice(0, 1)}${words[words.length - 1].slice(0, 1)}`.toUpperCase();
}

function ProfileIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden focusable="false">
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5.5 20c.4-3.4 2.8-5.3 6.5-5.3s6.1 1.9 6.5 5.3" strokeLinecap="round" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden focusable="false">
      <path d="M10 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H10" strokeLinecap="round" />
      <path d="M13 8l4 4-4 4M17 12H8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function UserMenu({ lang = 'bn', variant = 'header' }: UserMenuProps) {
  const sidebar = variant === 'sidebar';
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuId = useId();

  // The session is owned by `SessionProvider`. This menu used to fetch
  // `/api/auth/status` on mount AND on every menu open — a third
  // redundant request per page load. It now reads the shared payload
  // and only asks for a refresh when the profile actually changed.
  const { session, refresh: refreshStatus } = useSession();

  useEffect(() => {
    const onProfileUpdated = () => void refreshStatus();
    window.addEventListener('cityfix:profile-updated', onProfileUpdated);
    return () => window.removeEventListener('cityfix:profile-updated', onProfileUpdated);
  }, [refreshStatus]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const root = containerRef.current;
      if (root && event.target instanceof Node && !root.contains(event.target)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  const onLogout = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    setOpen(false);
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } catch {
      // Still leave the protected surface; the server will reject an expired session.
    }
    window.location.href = '/';
  }, [signingOut]);

  const user = session;
  const name = lang === 'bn' ? user?.nameBn || user?.name : user?.name || user?.nameBn;

  return (
    <div ref={containerRef} className={`usermenu-root${sidebar ? ' usermenu-sidebar' : ''}`} style={{ position: 'relative', display: 'inline-flex', width: sidebar ? '100%' : undefined }}>
      <button
        ref={buttonRef}
        type="button"
        className="usermenu-trigger"
        aria-label={name ? t('user.menu.aria.avatar', { name }, lang) : t('user.menu.open_menu', null, lang)}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => {
          setOpen((wasOpen) => !wasOpen);
        }}
        style={{
          minWidth: sidebar ? 0 : 44,
          width: sidebar ? '100%' : undefined,
          height: sidebar ? 58 : 44,
          padding: sidebar ? 'var(--space-2)' : '0 var(--space-2)',
          border: sidebar ? '1px solid transparent' : (open ? '1px solid var(--color-border-strong)' : '1px solid var(--color-border)'),
          borderRadius: sidebar ? 'var(--radius-md)' : 'var(--radius-pill)',
          background: sidebar ? 'transparent' : (open ? 'var(--color-surface-raised)' : 'var(--color-surface-card)'),
          color: sidebar ? '#f7f9ff' : 'var(--color-ink)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: sidebar ? 'flex-start' : 'center',
          gap: 'var(--space-2)',
          cursor: 'pointer',
          fontFamily: 'inherit',
          transition: 'background var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out)',
        }}
      >
        <span
          aria-hidden
          style={{
            width: sidebar ? 38 : 28,
            height: sidebar ? 38 : 28,
            flexShrink: 0,
            borderRadius: '50%',
            background: 'var(--color-primary-soft)',
            color: 'var(--color-primary)',
            display: 'inline-grid',
            placeItems: 'center',
            fontSize: 'var(--text-caption)',
            fontWeight: 'var(--weight-bold)',
          }}
        >
          {initialsOf(name) ?? <ProfileIcon />}
        </span>
        <span className="usermenu-label" style={{ minWidth: 0, maxWidth: sidebar ? 150 : 112, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: sidebar ? 'normal' : 'nowrap', display: sidebar ? 'flex' : undefined, flexDirection: sidebar ? 'column' : undefined, alignItems: sidebar ? 'flex-start' : undefined, gap: sidebar ? 3 : undefined, marginInlineStart: sidebar ? 'var(--space-2)' : undefined, flex: sidebar ? 1 : undefined, fontSize: 'var(--text-caption)', fontWeight: 'var(--weight-semibold)' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{name ?? t('user.menu.open_menu', null, lang)}</span>
          {sidebar && user?.role ? <span style={{ color: '#b9c5db', fontSize: 11, fontWeight: 'var(--weight-regular)' }}>{t(ROLE_KEY[user.role], null, lang)}</span> : null}
        </span>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden focusable="false" style={{ marginInlineStart: sidebar ? 'auto' : undefined }}>
          <path d={open ? 'm5 12 5-5 5 5' : 'm5 8 5 5 5-5'} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          id={menuId}
          role="group"
          aria-label={t('user.menu.open_menu', null, lang)}
          className="usermenu-panel"
          style={{
            position: 'absolute',
            top: sidebar ? undefined : 'calc(100% + var(--space-2))',
            bottom: sidebar ? 'calc(100% + var(--space-2))' : undefined,
            right: 0,
            width: 'min(304px, calc(100vw - 24px))',
            boxSizing: 'border-box',
            background: 'var(--color-surface-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-card)',
            boxShadow: 'var(--shadow-popover, 0 8px 24px rgba(15, 23, 42, 0.14))',
            padding: 'var(--space-2)',
            zIndex: 80,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-1)',
          }}
        >
          <div style={{ padding: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <span aria-hidden style={{ width: 42, height: 42, flexShrink: 0, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'var(--color-primary-soft)', color: 'var(--color-primary)', fontSize: 'var(--text-body)', fontWeight: 'var(--weight-bold)' }}>
              {initialsOf(name) ?? <ProfileIcon />}
            </span>
            <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <strong style={{ color: 'var(--color-ink)', fontSize: 'var(--text-body-sm)', lineHeight: 1.35, overflowWrap: 'anywhere' }}>{name ?? '—'}</strong>
              {user?.role && <span style={{ color: 'var(--color-ink-secondary)', fontSize: 'var(--text-caption)' }}>{t(ROLE_KEY[user.role], null, lang)}</span>}
            </span>
          </div>

          <Link
            href="/profile"
            className="usermenu-profile-link"
            onClick={() => setOpen(false)}
            style={{
              minHeight: 48,
              padding: '0 var(--space-3)',
              borderRadius: 'var(--radius-input)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              color: 'var(--color-ink)',
              textDecoration: 'none',
              background: 'var(--color-surface-raised)',
            }}
          >
            <span style={{ color: 'var(--color-primary)', display: 'inline-flex' }}><ProfileIcon /></span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <strong style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-semibold)' }}>{t('user.menu.profile', null, lang)}</strong>
              <span style={{ fontSize: 'var(--text-caption)', color: 'var(--color-ink-secondary)' }}>{t('user.menu.profile_hint', null, lang)}</span>
            </span>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden focusable="false" style={{ marginInlineStart: 'auto' }}>
              <path d="m7 4 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>

          <div style={{ height: 1, background: 'var(--color-border)', margin: 'var(--space-1) var(--space-2)' }} />

          <button
            type="button"
            className="usermenu-logout"
            onClick={onLogout}
            disabled={signingOut}
            style={{
              minHeight: 44,
              padding: '0 var(--space-3)',
              background: 'transparent',
              border: 0,
              borderRadius: 'var(--radius-input)',
              color: 'var(--color-danger)',
              fontWeight: 'var(--weight-semibold)',
              fontSize: 'var(--text-body-sm)',
              textAlign: 'left',
              cursor: signingOut ? 'wait' : 'pointer',
              fontFamily: 'inherit',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
            }}
          >
            <LogoutIcon />
            {signingOut ? t('user.menu.signing_out', null, lang) : t('user.menu.logout', null, lang)}
          </button>
        </div>
      )}
    </div>
  );
}
