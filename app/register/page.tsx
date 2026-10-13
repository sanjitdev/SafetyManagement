/**
 * 1.3 Registration (citizen creates account).
 *
 * Per UX spec 1.3-registration/1.3-registration.md:
 *   - 5 fields: phone, NID, full name, password, confirm password
 *   - 480px max-width, centered, in-flow submit (no sticky bottom on web)
 *   - Client-side validation on blur + submit per the spec table
 *   - Show/hide password toggle on both password inputs
 *   - Server errors render in the same red helper style under the field
 *   - On 201 → /verify?phone=… so the citizen can complete SMS-OTP
 *     (in dev mode the verify route is bypassed and we land at /home)
 *   - On 409 → inline conflict error pointing the citizen at /login
 *   - On 5xx / network → top-level toast above the form
 *   - Bilingual copy; per-user override persisted on submit (out of scope for v1)
 *
 * Phase B (2026-10-04): web-first, 1440×900 + 1024×768 viewports.
 */

'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { t, type Language } from '@/lib/i18n/keys';
import { safeNextPath } from '@/lib/safe-next';

const LANG_KEY = 'cityfix.preferred_language.v1';

type FieldKey = 'phone' | 'nid' | 'name' | 'password' | 'confirm';
type ErrorMap = Partial<Record<FieldKey, string>>;

interface FormState {
  phone: string;
  nid: string;
  name: string;
  password: string;
  confirm: string;
}

function validate(field: FieldKey, value: string, all: FormState): string | null {
  switch (field) {
    case 'phone':
      if (!value) return 'register.error.phone';
      if (!/^(\+?880|0)?1[0-9]{9}$/.test(value.replace(/[^0-9+]/g, ''))) {
        return 'register.error.phone';
      }
      return null;
    case 'nid':
      if (!value) return 'register.error.nid';
      if (!/^[0-9]{10}$|^[0-9]{17}$/.test(value)) return 'register.error.nid';
      return null;
    case 'name':
      if (!value || value.trim().length < 2) return 'register.error.name';
      return null;
    case 'password':
      if (!value) return 'register.error.password';
      if (value.length < 8) return 'register.error.password';
      if (!/[0-9]/.test(value)) return 'register.error.password';
      return null;
    case 'confirm':
      if (value !== all.password) return 'register.error.confirm';
      return null;
  }
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterInner />
    </Suspense>
  );
}

function RegisterInner() {
  const router = useRouter();
  const params = useSearchParams();
  const nextPath = safeNextPath(params.get('next'), '/home');
  const [lang, setLang] = useState<Language>('bn');
  const [form, setForm] = useState<FormState>({
    phone: '',
    nid: '',
    name: '',
    password: '',
    confirm: '',
  });
  const [errors, setErrors] = useState<ErrorMap>({});
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LANG_KEY);
      if (stored === 'en' || stored === 'bn') setLang(stored);
    } catch {
      // ignore
    }
  }, []);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      // Re-validate dependent fields when password changes so the
      // confirm error updates live.
      if (key === 'password' && touched.confirm) {
        const confirmErr = validate('confirm', next.confirm, next);
        setErrors((e) => ({ ...e, confirm: confirmErr ?? undefined }));
      }
      return next;
    });
    if (touched[key]) {
      const err = validate(key, value, { ...form, [key]: value });
      setErrors((e) => ({ ...e, [key]: err ?? undefined }));
    }
  }

  function blur(key: FieldKey) {
    setTouched((t) => ({ ...t, [key]: true }));
    const err = validate(key, form[key], form);
    setErrors((e) => ({ ...e, [key]: err ?? undefined }));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setServerError(null);
    setNetworkError(null);

    // Validate every field
    const newErrors: ErrorMap = {};
    (['phone', 'nid', 'name', 'password', 'confirm'] as FieldKey[]).forEach((k) => {
      const err = validate(k, form[k], form);
      if (err) newErrors[k] = err;
    });
    setErrors(newErrors);
    setTouched({ phone: true, nid: true, name: true, password: true, confirm: true });
    if (Object.keys(newErrors).length > 0) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          phone: form.phone,
          nid: form.nid,
          name: form.name,
          password: form.password,
        }),
      });
      if (res.status === 201) {
        // Registration succeeded; the API minted a session cookie so the
        // verify page can identify the user. Route to /verify-otp with the
        // phone so the page can render the masked subtitle. We also
        // forward the `?next=` deep link so the post-OTP redirect
        // resumes the original intent (e.g. /report/location when a
        // public visitor taps "Report what you see").
        const phone = encodeURIComponent(form.phone);
        const next =
          nextPath === '/home'
            ? ''
            : `&next=${encodeURIComponent(nextPath)}`;
        router.replace(`/verify-otp?phone=${phone}${next}`);
        return;
      }
      if (res.status === 409) {
        setServerError('register.error.conflict');
        return;
      }
      if (res.status === 429) {
        setNetworkError('register.error.network');
        return;
      }
      // Any other 4xx/5xx
      setNetworkError('register.error.network');
    } catch {
      setNetworkError('register.error.network');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        background: 'var(--color-surface-page)',
      }}
    >
      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--space-5) var(--space-5) var(--space-7)',
          minHeight: 0,
          overflowY: 'auto',
        }}
      >
        <div style={{ width: '100%', maxWidth: 480, margin: '0 auto' }}>
          {/* Heading */}
          <div style={{ marginBottom: 'var(--space-6)' }}>
            <Link
              href="/"
              aria-label="CityFix home"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                textDecoration: 'none',
                color: 'var(--color-ink)',
                marginBottom: 'var(--space-5)',
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 12,
                  height: 12,
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
            <h1
              lang={lang}
              style={{
                fontSize: 'var(--text-h1)',
                fontWeight: 'var(--weight-semibold)',
                color: 'var(--color-ink)',
                margin: '0 0 var(--space-2)',
                letterSpacing: 'var(--tracking-tight)',
              }}
            >
              {t('register.title', null, lang)}
            </h1>
            <p
              lang={lang}
              style={{
                fontSize: 'var(--text-body)',
                color: 'var(--color-ink-secondary)',
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              {t('register.subtitle', null, lang)}
            </p>
          </div>

          {/* Network / 5xx toast */}
          {networkError && (
            <div
              role="alert"
              lang={lang}
              style={{
                padding: 'var(--space-3) var(--space-4)',
                background: 'var(--color-warning-soft, #fdf2cf)',
                border: '1px solid var(--color-warning, #b58410)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--color-ink)',
                fontSize: 'var(--text-body-sm)',
                marginBottom: 'var(--space-4)',
              }}
            >
              {t(networkError, null, lang)}
            </div>
          )}

          {/* Form */}
          <form onSubmit={onSubmit} noValidate>
            <Field
              label={t('register.field.phone.label', null, lang)}
              helper={`+880 ${t('register.field.phone.placeholder', null, lang)}`}
              error={errors.phone ? t(errors.phone, null, lang) : undefined}
              lang={lang}
            >
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                lang={lang}
                placeholder="01XXXXXXXXX"
                value={form.phone}
                onChange={(e) => update('phone', e.target.value)}
                onBlur={() => blur('phone')}
                aria-invalid={!!errors.phone}
                style={inputStyle(!!errors.phone)}
              />
            </Field>

            <Field
              label={t('register.field.nid.label', null, lang)}
              helper={t('register.field.nid.helper', null, lang)}
              error={errors.nid ? t(errors.nid, null, lang) : undefined}
              lang={lang}
            >
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                lang={lang}
                placeholder="1234567890"
                value={form.nid}
                onChange={(e) => update('nid', e.target.value.replace(/[^0-9]/g, '').slice(0, 17))}
                onBlur={() => blur('nid')}
                aria-invalid={!!errors.nid}
                style={inputStyle(!!errors.nid)}
              />
            </Field>

            <Field
              label={t('register.field.name.label', null, lang)}
              helper={t('register.field.name.helper', null, lang)}
              error={errors.name ? t(errors.name, null, lang) : undefined}
              lang={lang}
            >
              <input
                type="text"
                autoComplete="name"
                lang={lang}
                placeholder=""
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                onBlur={() => blur('name')}
                aria-invalid={!!errors.name}
                style={inputStyle(!!errors.name)}
              />
            </Field>

            <Field
              label={t('register.field.password.label', null, lang)}
              helper={t('register.field.password.helper', null, lang)}
              error={errors.password ? t(errors.password, null, lang) : undefined}
              lang={lang}
              rightAdornment={
                <ShowHide
                  shown={showPassword}
                  onToggle={() => setShowPassword((s) => !s)}
                  lang={lang}
                />
              }
            >
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                lang="en"
                value={form.password}
                onChange={(e) => update('password', e.target.value)}
                onBlur={() => blur('password')}
                aria-invalid={!!errors.password}
                style={inputStyle(!!errors.password, !!showPassword)}
              />
            </Field>

            <Field
              label={t('register.field.confirm.label', null, lang)}
              helper={serverError ? t('register.error.conflict', null, lang) : undefined}
              error={
                serverError
                  ? t('register.error.conflict', null, lang)
                  : errors.confirm
                    ? t(errors.confirm, null, lang)
                    : undefined
              }
              lang={lang}
              rightAdornment={
                <ShowHide
                  shown={showConfirm}
                  onToggle={() => setShowConfirm((s) => !s)}
                  lang={lang}
                />
              }
            >
              <input
                type={showConfirm ? 'text' : 'password'}
                autoComplete="new-password"
                lang="en"
                value={form.confirm}
                onChange={(e) => update('confirm', e.target.value)}
                onBlur={() => blur('confirm')}
                aria-invalid={!!(errors.confirm || serverError)}
                style={inputStyle(!!(errors.confirm || serverError), !!showConfirm)}
              />
            </Field>

            <button
              type="submit"
              disabled={submitting}
              lang={lang}
              style={{
                marginTop: 'var(--space-5)',
                width: '100%',
                height: 56,
                background: submitting
                  ? 'var(--color-primary-soft)'
                  : 'var(--color-primary)',
                color: 'var(--color-on-primary)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-body-lg)',
                fontWeight: 'var(--weight-semibold)',
                cursor: submitting ? 'wait' : 'pointer',
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting
                ? t('register.cta.submitting', null, lang)
                : t('register.cta.submit', null, lang)}
            </button>
          </form>

          <div
            style={{
              marginTop: 'var(--space-6)',
              paddingTop: 'var(--space-5)',
              borderTop: '1px solid var(--color-border)',
              textAlign: 'center',
            }}
          >
            <Link
              href={
                nextPath === '/home'
                  ? '/login'
                  : `/login?next=${encodeURIComponent(nextPath)}`
              }
              lang={lang}
              style={{
                fontSize: 'var(--text-body-sm)',
                color: 'var(--color-primary)',
                textDecoration: 'none',
                fontWeight: 'var(--weight-semibold)',
              }}
            >
              {t('register.link.login', null, lang)}
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

function inputStyle(invalid: boolean, hasAdornment = false): React.CSSProperties {
  return {
    width: '100%',
    height: 48,
    padding: hasAdornment ? '0 var(--space-7) 0 var(--space-3)' : '0 var(--space-3)',
    border: `1px solid ${invalid ? 'var(--color-danger, #c92a2a)' : 'var(--color-border)'}`,
    borderRadius: 'var(--radius-md)',
    background: 'var(--color-surface-card)',
    color: 'var(--color-ink)',
    fontSize: 'var(--text-body)',
    outline: 'none',
    boxSizing: 'border-box',
  };
}

function Field({
  label,
  helper,
  error,
  rightAdornment,
  lang,
  children,
}: {
  label: string;
  helper?: string;
  error?: string;
  rightAdornment?: React.ReactNode;
  lang: Language;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 'var(--space-4)' }}>
      <label
        lang={lang}
        style={{
          display: 'block',
          fontSize: 'var(--text-body-sm)',
          fontWeight: 'var(--weight-semibold)',
          color: 'var(--color-ink)',
          marginBottom: 'var(--space-2)',
        }}
      >
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        {children}
        {rightAdornment && (
          <div
            style={{
              position: 'absolute',
              right: 'var(--space-2)',
              top: '50%',
              transform: 'translateY(-50%)',
            }}
          >
            {rightAdornment}
          </div>
        )}
      </div>
      {error ? (
        <p
          lang={lang}
          role="alert"
          style={{
            fontSize: 'var(--text-caption)',
            color: 'var(--color-danger, #c92a2a)',
            margin: 'var(--space-2) 0 0',
          }}
        >
          {error}
        </p>
      ) : helper ? (
        <p
          lang={lang}
          style={{
            fontSize: 'var(--text-caption)',
            color: 'var(--color-ink-tertiary)',
            margin: 'var(--space-2) 0 0',
          }}
        >
          {helper}
        </p>
      ) : null}
    </div>
  );
}

function ShowHide({
  shown,
  onToggle,
  lang,
}: {
  shown: boolean;
  onToggle: () => void;
  lang: Language;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={shown ? t('register.cta.hide', null, lang) : t('register.cta.show', null, lang)}
      lang={lang}
      style={{
        background: 'transparent',
        border: 'none',
        color: 'var(--color-ink-secondary)',
        fontSize: 'var(--text-caption)',
        fontWeight: 'var(--weight-semibold)',
        cursor: 'pointer',
        padding: 'var(--space-2)',
      }}
    >
      {shown ? t('register.cta.hide', null, lang) : t('register.cta.show', null, lang)}
    </button>
  );
}