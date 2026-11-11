/**
 * 1.5 Login (returning users)
 *
 * Per UX spec 1.5-login/1.5-login.md:
 *   - 2 fields: phone + password
 *   - 480px max-width, centered, in-flow submit (no sticky bottom on web)
 *   - Phone pre-filled from localStorage.last_phone (v1)
 *   - Show/hide password toggle
 *   - 401 → wrong-credentials inline error (vague — never reveals which field)
 *   - 423 → locked full-card message
 *   - 5xx → top-level toast
 *   - Forgot-password link (placeholder route in v1)
 *   - Register link below CTA
 *   - Bilingual copy; EN shows "Welcome back." subtitle, BN omits it
 *
 * Phase B (2026-10-04): web-first, 1440×900 + 1024×768 viewports.
 */

'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { t, type Language } from '@/lib/i18n/keys';
import { safeNextPath } from '@/lib/safe-next';
import { resolvePostAuthTarget } from '@/lib/role-home';
import { CityFixMark } from '@/components/CityFixMark';
import { useLanguage } from '@/components/useLanguage';

const LAST_PHONE_KEY = 'cityfix.last_phone.v1';
const DEFAULT_NEXT = '/home';

type FieldKey = 'phone' | 'password';
type ErrorMap = Partial<Record<FieldKey, string>>;
type ErrorState = 'wrong' | 'network' | 'locked';

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const nextPath = safeNextPath(params.get('next'), DEFAULT_NEXT);
  const { lang, setLang } = useLanguage();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<ErrorMap>({});
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<ErrorState | null>(null);
  const [lockout, setLockout] = useState(false);

  useEffect(() => {
    try {
      const storedPhone = window.localStorage.getItem(LAST_PHONE_KEY);
      if (storedPhone) setPhone(storedPhone);
    } catch {
      // ignore
    }
  }, []);

  function validateField(key: FieldKey, value: string): string | null {
    if (key === 'phone') {
      if (!value) return 'login.error.invalid_phone';
      if (!/^(\+?880|0)?1[0-9]{9}$/.test(value.replace(/[^0-9+]/g, ''))) {
        return 'login.error.invalid_phone';
      }
      return null;
    }
    if (!value) return 'login.error.empty_password';
    return null;
  }

  function updatePhone(value: string) {
    setPhone(value);
    setErrors((e) => ({ ...e, phone: undefined }));
  }

  function updatePassword(value: string) {
    setPassword(value);
    setErrors((e) => ({ ...e, password: undefined }));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setServerError(null);

    // Validate all fields client-side first
    const phoneErr = validateField('phone', phone);
    const passwordErr = validateField('password', password);
    const newErrors: ErrorMap = {};
    if (phoneErr) newErrors.phone = phoneErr;
    if (passwordErr) newErrors.password = passwordErr;
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phone, password }),
      });
      if (res.status === 200) {
        try {
          window.localStorage.setItem(LAST_PHONE_KEY, phone);
        } catch {
          // ignore
        }
        // Honor the `?next=` deep link (safeNextPath sanitized it) —
        // but ONLY when the caller explicitly asked for one AND the
        // signed-in role is allowed to land on that surface. Otherwise
        // route to the surface that matches the signed-in role: a
        // dispatcher lands on the triage queue, crew on their
        // assignments, admin on the admin console, citizen on the
        // feed.
        //
        // The role check matters. Honouring `?next=` unconditionally
        // dumped every role that arrived via a deep link onto the
        // citizen's surface — the public landing's "Log in" CTA
        // carries `?next=/report/location`, so an admin who signed in
        // from there landed on a citizen report form.
        const data = (await res.json().catch(() => null)) as {
          role?: string;
        } | null;
        const explicitNext = params.get('next');
        router.replace(
          resolvePostAuthTarget(
            data?.role,
            explicitNext ? nextPath : null,
          ),
        );
        return;
      }
      if (res.status === 401) {
        setServerError('wrong');
        // Spec: clear both fields on wrong credentials.
        setPassword('');
        setPhone('');
        return;
      }
      if (res.status === 423) {
        setLockout(true);
        return;
      }
      if (res.status === 429) {
        setServerError('network');
        return;
      }
      setServerError('network');
    } catch {
      setServerError('network');
    } finally {
      setSubmitting(false);
    }
  }

  if (lockout) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--color-surface-page)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--space-7) var(--space-5)',
        }}
      >
        <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
          <p
            lang={lang}
            role="alert"
            style={{
              fontSize: 'var(--text-h3)',
              color: 'var(--color-ink)',
              margin: '0 0 var(--space-5)',
            }}
          >
            {t('login.error.too_many', null, lang)}
          </p>
          {/* Forgot-password flow ships with WO-004 (auth hardening). Intentionally
              no recovery link in v1 — locked citizens wait the 10-minute cooldown. */}
          <p
            lang={lang}
            style={{
              fontSize: 'var(--text-body-sm)',
              color: 'var(--color-ink-muted)',
              margin: 'var(--space-4) 0 0',
            }}
          >
            {t('login.locked.note', null, lang)}
          </p>
        </div>
      </div>
    );
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
              <CityFixMark />
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
              {t('login.title', null, lang)}
            </h1>
            {/* BN: no subtitle (per spec — Bangla register is transactional) */}
            {lang === 'en' && (
              <p
                lang={lang}
                style={{
                  fontSize: 'var(--text-body)',
                  color: 'var(--color-ink-secondary)',
                  margin: 0,
                  lineHeight: 1.5,
                }}
              >
                {t('login.subtitle', null, lang)}
              </p>
            )}
          </div>

          {serverError === 'network' && (
            <div
              role="alert"
              lang={lang}
              style={{
                padding: 'var(--space-3) var(--space-4)',
                background: 'var(--color-warning-soft)',
                border: '1px solid var(--color-warning)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--color-ink)',
                fontSize: 'var(--text-body-sm)',
                marginBottom: 'var(--space-4)',
              }}
            >
              {t('login.error.network', null, lang)}
            </div>
          )}

          <form onSubmit={onSubmit} noValidate>
            <Field
              label={t('login.field.phone.label', null, lang)}
              helper={`+880 ${t('login.field.phone.placeholder', null, lang)}`}
              error={errors.phone ? t(errors.phone, null, lang) : undefined}
              lang={lang}
            >
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                lang={lang}
                placeholder="01XXXXXXXXX"
                value={phone}
                onChange={(e) => updatePhone(e.target.value)}
                aria-invalid={!!errors.phone}
                style={inputStyle(!!errors.phone, false)}
              />
            </Field>

            <Field
              label={t('login.field.password.label', null, lang)}
              error={errors.password ? t(errors.password, null, lang) : undefined}
              lang={lang}
              rightAdornment={
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={
                    showPassword
                      ? t('login.cta.hide', null, lang)
                      : t('login.cta.show', null, lang)
                  }
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
                  {showPassword
                    ? t('login.cta.hide', null, lang)
                    : t('login.cta.show', null, lang)}
                </button>
              }
            >
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                lang="en"
                value={password}
                onChange={(e) => updatePassword(e.target.value)}
                aria-invalid={!!errors.password}
                style={inputStyle(!!errors.password, true)}
              />
            </Field>

            {/* Wrong-credentials inline error (under the password field) */}
            {serverError === 'wrong' && (
              <p
                lang={lang}
                role="alert"
                style={{
                  fontSize: 'var(--text-body-sm)',
                  color: 'var(--color-danger)',
                  margin: '0 0 var(--space-3)',
                }}
              >
                {t('login.error.wrong', null, lang)}
              </p>
            )}

            <div style={{ textAlign: 'right', marginTop: 'var(--space-2)' }}>
              {/* Forgot-password ships with WO-004 (auth hardening); v1 citizens
                  reset by contacting the city hotline surfaced on the splash page. */}
              <span
                lang={lang}
                style={{
                  fontSize: 'var(--text-body-sm)',
                  color: 'var(--color-ink-muted)',
                }}
              >
                {t('login.note.need_help', null, lang)}
              </span>
            </div>

            <button
              type="submit"
              disabled={submitting || !phone || !password}
              lang={lang}
              style={{
                marginTop: 'var(--space-5)',
                width: '100%',
                height: 56,
                background:
                  submitting || !phone || !password
                    ? 'var(--color-surface-raised)'
                    : 'var(--color-primary)',
                color:
                  submitting || !phone || !password
                    ? 'var(--color-ink-secondary)'
                    : 'var(--color-on-primary)',
                border:
                  submitting || !phone || !password
                    ? '1px solid var(--color-border)'
                    : 'none',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-body-lg)',
                fontWeight: 'var(--weight-semibold)',
                cursor: submitting ? 'wait' : 'pointer',
                // The disabled state should look disabled but still
                // clearly readable: surface-raised + ink-secondary in
                // both themes is the established "dimmed but visible"
                // pattern. The 1px border keeps the button shape
                // legible against the surface-card in dark mode.
                opacity: submitting || !phone || !password ? 0.7 : 1,
              }}
            >
              {submitting
                ? t('login.cta.submitting', null, lang)
                : t('login.cta.submit', null, lang)}
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
                nextPath === DEFAULT_NEXT
                  ? '/register'
                  : `/register?next=${encodeURIComponent(nextPath)}`
              }
              lang={lang}
              style={{
                fontSize: 'var(--text-body-sm)',
                color: 'var(--color-primary)',
                textDecoration: 'none',
                fontWeight: 'var(--weight-semibold)',
              }}
            >
              {t('login.link.register', null, lang)}
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

function inputStyle(invalid: boolean, hasAdornment: boolean): React.CSSProperties {
  return {
    width: '100%',
    height: 48,
    padding: hasAdornment ? '0 var(--space-7) 0 var(--space-3)' : '0 var(--space-3)',
    border: `1px solid ${invalid ? 'var(--color-danger)' : 'var(--color-border)'}`,
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
            color: 'var(--color-danger)',
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
