'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { SkeletonBlock, SkeletonStatus } from '@/components/ui/Skeleton';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { useTheme } from '@/lib/theme/ThemeProvider';
import type { Appearance } from '@/lib/theme/appearance';
import { t, type Language } from '@/lib/i18n/keys';

const LANG_KEY = 'cityfix.preferred_language.v1';
const ROLE_KEY = {
  citizen: 'user.menu.role.citizen',
  dispatcher: 'user.menu.role.dispatcher',
  crew: 'user.menu.role.crew',
  admin: 'user.menu.role.admin',
} as const;

interface Profile {
  id: string;
  name: string;
  nameBn: string | null;
  email: string | null;
  phone: string | null;
  role: keyof typeof ROLE_KEY;
  cityId: string;
}

/**
 * Module-scope in-flight promise for the profile read.
 *
 * The `/profile` layout resolves the session on the SERVER and passes
 * `signedIn` to `AppShell`, which disables the `SessionProvider` —
 * so there is no shared session to gate the fetch on, and a plain
 * mount effect would fire it twice under React 18 StrictMode.
 *
 * Caching the in-flight promise makes the second mount JOIN the first
 * request instead of starting another one. The result is settled into
 * module scope too, so the remount reads the payload synchronously
 * rather than re-fetching.
 */
let profileRequest: Promise<{ profile: Profile } | null> | null = null;
let profileResult: { profile: Profile } | null = null;

function loadProfile(): Promise<{ profile: Profile } | null> {
  if (profileResult) return Promise.resolve(profileResult);
  if (!profileRequest) {
    profileRequest = fetch('/api/profile', { credentials: 'same-origin' })
      .then(async (response) => {
        if (response.status === 401) return null;
        if (!response.ok) throw new Error('profile_load_failed');
        const payload = (await response.json()) as { profile: Profile };
        profileResult = payload;
        return payload;
      })
      .finally(() => {
        profileRequest = null;
      });
  }
  return profileRequest;
}

export default function ProfilePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { appearance, setAppearance } = useTheme();
  const [lang, setLang] = useState<Language>('bn');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState('');
  const [nameBn, setNameBn] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<'load' | 'save' | 'name' | 'name_bn' | null>(null);

  // The sidebar's "Settings" item deep-links to `/profile?tab=settings`.
  // The tab lives in the URL so the nav item can highlight correctly and
  // the link is shareable; anything else falls back to the details tab.
  const tab = searchParams.get('tab') === 'settings' ? 'settings' : 'details';

  // Publish the active tab to the sidebar.
  //
  // The sidebar cannot read the query itself: `useSearchParams()` in
  // shared chrome forces a client-side-rendering bailout on every
  // statically-prerendered route in the app. So this page — which
  // owns the `tab` query — announces it, and the sidebar listens.
  // This is the same pattern the admin users `role` filter uses.
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('cityfix:profile-tab-updated', {
        detail: tab === 'settings' ? 'settings' : null,
      }),
    );
  }, [tab]);

  function chooseLanguage(next: Language) {
    setLang(next);
    try {
      window.localStorage.setItem(LANG_KEY, next);
    } catch {
      // Storage may be unavailable (private mode) — the in-memory
      // state still drives this render.
    }
    window.dispatchEvent(new CustomEvent('cityfix:language-updated', { detail: next }));
  }

  useEffect(() => {
    const onLanguageUpdated = (event: Event) => {
      const next = (event as CustomEvent<Language>).detail;
      if (next === 'bn' || next === 'en') setLang(next);
    };
    window.addEventListener('cityfix:language-updated', onLanguageUpdated);
    try {
      const stored = window.localStorage.getItem(LANG_KEY);
      if (stored === 'en' || stored === 'bn') setLang(stored);
    } catch {
      // Keep the Bangla-first default when storage is unavailable.
    }

    return () => {
      window.removeEventListener('cityfix:language-updated', onLanguageUpdated);
    };
  }, []);

  // The profile read. `loadProfile` dedupes the request at module
  // scope, so StrictMode's double mount joins the first call instead
  // of issuing a second one.
  useEffect(() => {
    let cancelled = false;
    void loadProfile()
      .then((payload) => {
        if (cancelled) return;
        if (!payload) {
          router.replace('/login?next=%2Fprofile');
          return;
        }
        setProfile(payload.profile);
        setName(payload.profile.name);
        setNameBn(payload.profile.nameBn ?? '');
      })
      .catch(() => {
        if (!cancelled) setError('load');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  const isDirty = useMemo(() => Boolean(profile && (
    name.trim() !== profile.name || nameBn.trim() !== (profile.nameBn ?? '')
  )), [name, nameBn, profile]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    const normalizedName = name.trim();
    const normalizedNameBn = nameBn.trim();
    if (!normalizedName || normalizedName.length > 80) {
      setError('name');
      return;
    }
    if (normalizedNameBn.length > 80) {
      setError('name_bn');
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const response = await fetch('/api/profile', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: normalizedName, nameBn: normalizedNameBn }),
      });
      if (response.status === 401) {
        router.replace('/login?next=%2Fprofile');
        return;
      }
      if (!response.ok) throw new Error('profile_save_failed');
      const payload = (await response.json()) as { profile: Profile };
      // Refresh the module-scope cache so a remount reads the SAVED
      // profile rather than the pre-save snapshot.
      profileResult = payload;
      setProfile(payload.profile);
      setName(payload.profile.name);
      setNameBn(payload.profile.nameBn ?? '');
      setSaved(true);
      window.dispatchEvent(new Event('cityfix:profile-updated'));
    } catch {
      setError('save');
    } finally {
      setSaving(false);
    }
  }

  const returnHref = profile?.role === 'dispatcher'
    ? '/dispatcher'
    : profile?.role === 'crew'
      ? '/crew'
      : profile?.role === 'admin'
        ? '/admin'
        : '/home';

  return (
    <div style={{ minHeight: '100%', padding: 'var(--space-6) var(--space-5)', boxSizing: 'border-box' }}>
      <main style={{ width: '100%', maxWidth: 920, margin: '0 auto' }}>
        <Link
          href={returnHref}
          lang={lang}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-4)', color: 'var(--color-ink-secondary)', fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-semibold)', textDecoration: 'none' }}
        >
          <span aria-hidden>←</span>{t('profile.back', null, lang)}
        </Link>

        <header style={{ marginBottom: 'var(--space-4)' }}>
          <h1 lang={lang} style={{ margin: 0, color: 'var(--color-ink)', fontSize: 'var(--text-h1)', fontWeight: 'var(--weight-bold)', letterSpacing: '-0.025em', lineHeight: 'var(--leading-tight)' }}>
            {tab === 'settings' ? t('profile.settings.title', null, lang) : t('profile.title', null, lang)}
          </h1>
          <p lang={lang} style={{ margin: 'var(--space-2) 0 0', color: 'var(--color-ink-secondary)', fontSize: 'var(--text-body)', lineHeight: 'var(--leading-normal)' }}>
            {tab === 'settings' ? t('profile.settings.subtitle', null, lang) : t('profile.subtitle', null, lang)}
          </p>
        </header>

        <nav className="profile-tabs" aria-label={t('shell.nav.label', null, lang)} style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-5)', borderBottom: '1px solid var(--color-border)' }}>
          {(['details', 'settings'] as const).map((value) => {
            const isActive = tab === value;
            const href = value === 'settings' ? '/profile?tab=settings' : '/profile';
            return (
              <Link
                key={value}
                href={href}
                lang={lang}
                aria-current={isActive ? 'page' : undefined}
                className={`profile-tab${isActive ? ' is-active' : ''}`}
                style={{
                  padding: 'var(--space-2) var(--space-3)',
                  marginBottom: '-1px',
                  borderBottom: '2px solid transparent',
                  color: isActive ? 'var(--color-primary)' : 'var(--color-ink-secondary)',
                  fontSize: 'var(--text-body-sm)',
                  fontWeight: 'var(--weight-semibold)',
                  textDecoration: 'none',
                }}
              >
                {t(value === 'settings' ? 'profile.tab.settings' : 'profile.tab.details', null, lang)}
              </Link>
            );
          })}
        </nav>

        {tab === 'settings' ? (
          <SettingsPanel lang={lang} appearance={appearance} onAppearance={setAppearance} onLanguage={chooseLanguage} />
        ) : (
        <>

        {loading ? (
          <SkeletonStatus lang={lang} className="profile-loading-card">
            <div className="profile-loading-heading">
              <SkeletonBlock style={{ width: 56, height: 56, borderRadius: '50%', flex: '0 0 auto' }} />
              <div style={{ display: 'grid', gap: 9, flex: 1 }}>
                <SkeletonBlock style={{ width: '42%', height: 17 }} />
                <SkeletonBlock style={{ width: '24%', height: 12 }} />
              </div>
            </div>
            <div className="profile-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--space-4)' }}>
              {[0, 1, 2, 3].map((item) => <div key={item} style={{ display: 'grid', gap: 9 }}><SkeletonBlock style={{ width: '34%', height: 11 }} /><SkeletonBlock style={{ height: 42, borderRadius: 'var(--radius-input)' }} /></div>)}
            </div>
            <SkeletonBlock style={{ width: 132, height: 42, justifySelf: 'end' }} />
          </SkeletonStatus>
        ) : error === 'load' ? (
          <div role="alert" lang={lang} style={{ padding: 'var(--space-4)', background: 'var(--color-danger-soft)', borderRadius: 'var(--radius-card)', color: 'var(--color-danger)' }}>
            {t('profile.error.load', null, lang)}
          </div>
        ) : profile ? (
          <section style={{ background: 'var(--color-surface-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
            <div style={{ padding: 'var(--space-5)', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
              <span aria-hidden style={{ width: 56, height: 56, flexShrink: 0, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'var(--color-primary-soft)', color: 'var(--color-primary)', fontSize: 'var(--text-h3)', fontWeight: 'var(--weight-bold)' }}>
                {(lang === 'bn' ? profile.nameBn || profile.name : profile.name).trim().slice(0, 1)}
              </span>
              <div style={{ minWidth: 0 }}>
                <div lang={lang} style={{ color: 'var(--color-ink)', fontSize: 'var(--text-body-lg)', fontWeight: 'var(--weight-semibold)', overflowWrap: 'anywhere' }}>
                  {lang === 'bn' ? profile.nameBn || profile.name : profile.name}
                </div>
                <div lang={lang} style={{ marginTop: 3, color: 'var(--color-ink-secondary)', fontSize: 'var(--text-caption)' }}>
                  {t(ROLE_KEY[profile.role], null, lang)}
                </div>
              </div>
            </div>

            <form onSubmit={onSubmit} lang={lang} style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
              <div>
                <h2 style={{ margin: 0, color: 'var(--color-ink)', fontSize: 'var(--text-body-lg)', fontWeight: 'var(--weight-semibold)' }}>{t('profile.identity.title', null, lang)}</h2>
                <div className="profile-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
                  <Field id="profile-name" label={t('profile.name', null, lang)} hint={t('profile.name.hint', null, lang)} required lang={lang} error={error === 'name' ? t('profile.error.name', null, lang) : undefined}>
                    <Input value={name} onChange={(event) => { setName(event.target.value); setError(null); setSaved(false); }} maxLength={80} autoComplete="name" />
                  </Field>
                  <Field id="profile-name-bn" label={t('profile.name_bn', null, lang)} hint={t('profile.name_bn.hint', null, lang)} lang={lang} error={error === 'name_bn' ? t('profile.error.name_bn', null, lang) : undefined}>
                    <Input value={nameBn} onChange={(event) => { setNameBn(event.target.value); setError(null); setSaved(false); }} maxLength={80} lang="bn" />
                  </Field>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-4)' }}>
                <h2 style={{ margin: 0, color: 'var(--color-ink)', fontSize: 'var(--text-body-lg)', fontWeight: 'var(--weight-semibold)' }}>{t('profile.contact.title', null, lang)}</h2>
                <p style={{ margin: 'var(--space-1) 0 var(--space-3)', color: 'var(--color-ink-secondary)', fontSize: 'var(--text-caption)' }}>{t('profile.contact.note', null, lang)}</p>
                <div className="profile-contact-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--space-3)' }}>
                  <ReadOnlyDetail label={t('profile.phone', null, lang)} value={profile.phone} />
                  <ReadOnlyDetail label={t('profile.email', null, lang)} value={profile.email} />
                </div>
              </div>

              {(error === 'save' || saved) && (
                <p role={error === 'save' ? 'alert' : 'status'} aria-live="polite" style={{ margin: 0, padding: 'var(--space-3)', borderRadius: 'var(--radius-input)', background: error === 'save' ? 'var(--color-danger-soft)' : 'var(--color-success-soft)', color: error === 'save' ? 'var(--color-danger)' : 'var(--color-success)', fontSize: 'var(--text-body-sm)' }}>
                  {t(error === 'save' ? 'profile.error.save' : 'profile.saved', null, lang)}
                </p>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button type="submit" loading={saving} disabled={!isDirty || saving}>
                  {saving ? t('profile.saving', null, lang) : t('profile.save', null, lang)}
                </Button>
              </div>
            </form>
          </section>
        ) : null}
        </>
        )}
      </main>
      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 640px) {
          .profile-form-grid, .profile-contact-grid { grid-template-columns: minmax(0, 1fr) !important; }
        }
      ` }} />
    </div>
  );
}

function ReadOnlyDetail({ label, value }: { label: string; value: string | null }) {
  return (
    <div style={{ padding: 'var(--space-3)', minWidth: 0, borderRadius: 'var(--radius-input)', background: 'var(--color-surface-raised)' }}>
      <div style={{ color: 'var(--color-ink-secondary)', fontSize: 'var(--text-caption)', fontWeight: 'var(--weight-semibold)' }}>{label}</div>
      <div style={{ marginTop: 4, color: 'var(--color-ink)', fontSize: 'var(--text-body-sm)', overflowWrap: 'anywhere' }}>{value || '—'}</div>
    </div>
  );
}

/**
 * The Settings tab.
 *
 * Everything on it is a device-local preference — the same two the
 * header already exposes (language and appearance), collected in one
 * place instead of scattered across chrome. Both write to
 * localStorage and broadcast the change so every listener (the header,
 * the sidebar, this page) stays in sync without a reload.
 */
function SettingsPanel({
  lang,
  appearance,
  onAppearance,
  onLanguage,
}: {
  lang: Language;
  appearance: Appearance;
  onAppearance: (next: Appearance) => void;
  onLanguage: (next: Language) => void;
}) {
  return (
    <section style={{ background: 'var(--color-surface-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
      <div style={{ padding: 'var(--space-5)', borderBottom: '1px solid var(--color-border)' }}>
        <h2 style={{ margin: 0, color: 'var(--color-ink)', fontSize: 'var(--text-body-lg)', fontWeight: 'var(--weight-semibold)' }}>
          {t('profile.settings.language.title', null, lang)}
        </h2>
        <p style={{ margin: 'var(--space-1) 0 var(--space-3)', color: 'var(--color-ink-secondary)', fontSize: 'var(--text-caption)' }}>
          {t('profile.settings.language.hint', null, lang)}
        </p>
        <SegmentedControl
          lang={lang}
          options={[
            { value: 'bn', label: t('profile.settings.language.bn', null, lang) },
            { value: 'en', label: t('profile.settings.language.en', null, lang) },
          ]}
          selected={lang}
          onSelect={(value) => onLanguage(value as Language)}
        />
      </div>

      <div style={{ padding: 'var(--space-5)' }}>
        <h2 style={{ margin: 0, color: 'var(--color-ink)', fontSize: 'var(--text-body-lg)', fontWeight: 'var(--weight-semibold)' }}>
          {t('profile.settings.appearance.title', null, lang)}
        </h2>
        <p style={{ margin: 'var(--space-1) 0 var(--space-3)', color: 'var(--color-ink-secondary)', fontSize: 'var(--text-caption)' }}>
          {t('profile.settings.appearance.hint', null, lang)}
        </p>
        <SegmentedControl
          lang={lang}
          options={[
            { value: 'light', label: t('profile.settings.appearance.light', null, lang) },
            { value: 'dark', label: t('profile.settings.appearance.dark', null, lang) },
            { value: 'system', label: t('profile.settings.appearance.system', null, lang) },
          ]}
          selected={appearance}
          onSelect={(value) => onAppearance(value as Appearance)}
        />
      </div>
    </section>
  );
}

function SegmentedControl({
  lang,
  options,
  selected,
  onSelect,
}: {
  lang: Language;
  options: { value: string; label: string }[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div
      role="group"
      lang={lang}
      style={{ display: 'inline-flex', gap: 2, padding: 3, borderRadius: 'var(--radius-input)', background: 'var(--color-surface-raised)' }}
    >
      {options.map((option) => {
        const isActive = option.value === selected;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onSelect(option.value)}
            aria-pressed={isActive}
            style={{
              padding: '7px 14px',
              border: '1px solid transparent',
              borderRadius: 'calc(var(--radius-input) - 3px)',
              background: isActive ? 'var(--color-surface-card)' : 'transparent',
              color: isActive ? 'var(--color-primary)' : 'var(--color-ink-secondary)',
              boxShadow: isActive ? '0 1px 2px rgba(15, 23, 42, 0.12)' : 'none',
              fontFamily: 'inherit',
              fontSize: 'var(--text-body-sm)',
              fontWeight: 'var(--weight-semibold)',
              cursor: 'pointer',
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
