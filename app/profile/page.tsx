'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { SkeletonBlock, SkeletonStatus } from '@/components/ui/Skeleton';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
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

export default function ProfilePage() {
  const router = useRouter();
  const [lang, setLang] = useState<Language>('bn');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState('');
  const [nameBn, setNameBn] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<'load' | 'save' | 'name' | 'name_bn' | null>(null);

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

    let cancelled = false;
    void fetch('/api/profile', { credentials: 'same-origin' })
      .then(async (response) => {
        if (response.status === 401) {
          router.replace('/login?next=%2Fprofile');
          return null;
        }
        if (!response.ok) throw new Error('profile_load_failed');
        return (await response.json()) as { profile: Profile };
      })
      .then((payload) => {
        if (cancelled || !payload) return;
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
      window.removeEventListener('cityfix:language-updated', onLanguageUpdated);
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

        <header style={{ marginBottom: 'var(--space-5)' }}>
          <h1 lang={lang} style={{ margin: 0, color: 'var(--color-ink)', fontSize: 'var(--text-h1)', fontWeight: 'var(--weight-bold)', letterSpacing: '-0.025em', lineHeight: 'var(--leading-tight)' }}>
            {t('profile.title', null, lang)}
          </h1>
          <p lang={lang} style={{ margin: 'var(--space-2) 0 0', color: 'var(--color-ink-secondary)', fontSize: 'var(--text-body)', lineHeight: 'var(--leading-normal)' }}>
            {t('profile.subtitle', null, lang)}
          </p>
        </header>

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
