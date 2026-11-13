/**
 * 1.5 Login (returning users)
 *
 * Per UX spec 1.5-login/1.5-login.md:
 *   - 2 fields: phone + password
 *   - Phone pre-filled from localStorage.last_phone (v1)
 *   - Show/hide password toggle
 *   - 401 → wrong-credentials error summary + inline field error
 *   - 423 → locked full-card message
 *   - 5xx → top-level error summary
 *   - Forgot-password link (the public landing, where the city
 *     hotline is published — v1 has no reset route)
 *   - Register link below CTA
 *   - Bilingual copy
 *
 * Phase B (2026-10-04): web-first, 1440×900 + 1024×768 viewports.
 *
 * VISUAL CONTRACT — mockup 08
 * ----------------------------
 * The page is a TWO-REGION shell: the form on the left, the civic
 * story on the right. Below 1024px the story column is HIDDEN (not
 * stacked) so the form keeps the full width of a phone screen.
 *
 * This is a PRESENTATION change only. The API call, the submit
 * handler, the validation, the error mapping, the redirects and the
 * session logic are byte-for-byte the behaviour the spec describes —
 * only the composition around them changed.
 */

'use client';

import { Suspense, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { t, type Language } from '@/lib/i18n/keys';
import { safeNextPath } from '@/lib/safe-next';
import { resolvePostAuthTarget } from '@/lib/role-home';
import { useLanguage } from '@/components/useLanguage';
import { Button, Input } from '@/components/ui';
import { ICONS } from '@/lib/ui/icon-map';

const LAST_PHONE_KEY = 'cityfix.last_phone.v1';
const DEFAULT_NEXT = '/home';

type FieldKey = 'phone' | 'password';
type ErrorMap = Partial<Record<FieldKey, string>>;
type ErrorState = 'wrong' | 'network' | 'locked';

/** The ids the mockup wires the ARIA relationships against. */
const PHONE_ID = 'login-phone';
const PASSWORD_ID = 'login-password';

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

  const passwordError = errors.password
    ? t(errors.password, null, lang)
    : serverError === 'wrong'
      ? t('login.error.wrong', null, lang)
      : undefined;

  return (
    <div className="login-shell">
      {/* ================= FORM COLUMN ================= */}
      <section className="login-form-col">
        {/* Brand lockup */}
        <Link
          href="/"
          aria-label="CityFix home"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            textDecoration: 'none',
            color: 'var(--color-ink)',
            alignSelf: 'flex-start',
          }}
        >
          <BrandMark />
          <span
            style={{
              fontSize: 'var(--text-body-lg)',
              fontWeight: 'var(--weight-bold)',
              letterSpacing: 'var(--tracking-tight)',
            }}
          >
            CityFix
          </span>
          <span
            lang={lang}
            style={{
              fontSize: 'var(--text-body-sm)',
              color: 'var(--color-ink-tertiary)',
            }}
          >
            {t('login.brand.city', null, lang)}
          </span>
        </Link>

        {/* The form column centres its content vertically. */}
        <div className="login-form-wrap">
          <div style={{ width: '100%', maxWidth: 420 }}>
            <h1
              lang={lang}
              style={{
                fontSize: 'var(--text-display-md)',
                lineHeight: 'var(--leading-snug)',
                fontFamily: 'var(--font-display)',
                fontWeight: 'var(--weight-semibold)',
                letterSpacing: 'var(--tracking-tight)',
                color: 'var(--color-ink)',
                margin: '0 0 var(--space-2)',
              }}
            >
              {t('login.title', null, lang)}
            </h1>
            <p
              lang={lang}
              style={{
                fontSize: 'var(--text-body)',
                color: 'var(--color-ink-secondary)',
                margin: '0 0 var(--space-5)',
                lineHeight: 'var(--leading-normal)',
              }}
            >
              {t('login.subtitle', null, lang)}
            </p>

            {/* The ERROR SUMMARY — the focusable block that names the
                failure and links to the field it belongs to. */}
            {serverError && serverError !== 'locked' && (
              <ErrorSummary
                lang={lang}
                title={t('login.alert.title', null, lang)}
                body={
                  serverError === 'wrong'
                    ? t('login.alert.wrong', null, lang)
                    : t('login.error.network', null, lang)
                }
                linkLabel={t('login.alert.link', null, lang)}
                linkHref={`#${PASSWORD_ID}`}
              />
            )}

            <form onSubmit={onSubmit} noValidate>
              {/* Phone */}
              <div style={{ marginBottom: 'var(--space-4)' }}>
                <label
                  htmlFor={PHONE_ID}
                  lang={lang}
                  style={{
                    display: 'block',
                    fontSize: 'var(--text-body-sm)',
                    fontWeight: 'var(--weight-semibold)',
                    color: 'var(--color-ink)',
                    marginBottom: 'var(--space-2)',
                    lineHeight: 'var(--leading-snug)',
                  }}
                >
                  {t('login.field.phone.label', null, lang)}
                </label>
                <Input
                  id={PHONE_ID}
                  size="lg"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  lang={lang}
                  placeholder="01XXXXXXXXX"
                  value={phone}
                  onChange={(e) => updatePhone(e.target.value)}
                  aria-invalid={!!errors.phone}
                  aria-describedby={`${PHONE_ID}-hint`}
                  style={{
                    height: 48,
                    borderColor: errors.phone
                      ? 'var(--color-danger)'
                      : 'var(--color-border-input)',
                  }}
                />
                <span
                  id={`${PHONE_ID}-hint`}
                  lang={lang}
                  style={{
                    display: 'block',
                    fontSize: 'var(--text-caption)',
                    color: 'var(--color-ink-secondary)',
                    marginTop: 'var(--space-2)',
                    lineHeight: 'var(--leading-snug)',
                  }}
                >
                  {t('login.field.phone.hint', null, lang)}
                </span>
              </div>

              {/* Password + show/hide */}
              <div style={{ marginBottom: 'var(--space-4)' }}>
                <label
                  htmlFor={PASSWORD_ID}
                  lang={lang}
                  style={{
                    display: 'block',
                    fontSize: 'var(--text-body-sm)',
                    fontWeight: 'var(--weight-semibold)',
                    color: 'var(--color-ink)',
                    marginBottom: 'var(--space-2)',
                    lineHeight: 'var(--leading-snug)',
                  }}
                >
                  {t('login.field.password.label', null, lang)}
                </label>
                <div style={{ position: 'relative' }}>
                  <Input
                    id={PASSWORD_ID}
                    size="lg"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    lang="en"
                    value={password}
                    onChange={(e) => updatePassword(e.target.value)}
                    aria-invalid={!!passwordError}
                    aria-describedby={
                      passwordError ? `${PASSWORD_ID}-error` : undefined
                    }
                    style={{
                      height: 48,
                      // Room for the absolutely-positioned adornment
                      // button so the text never runs under it.
                      paddingRight: 72,
                      borderColor: passwordError
                        ? 'var(--color-danger)'
                        : 'var(--color-border-input)',
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={
                      showPassword
                        ? t('login.cta.hide', null, lang)
                        : t('login.cta.show', null, lang)
                    }
                    lang={lang}
                    style={{
                      position: 'absolute',
                      right: 'var(--space-2)',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--color-ink-secondary)',
                      fontSize: 'var(--text-caption)',
                    }}
                    icon={<ICONS.eye.icon size={16} aria-hidden />}
                  >
                    {showPassword
                      ? t('login.cta.hide', null, lang)
                      : t('login.cta.show', null, lang)}
                  </Button>
                </div>
                {passwordError && (
                  <p
                    id={`${PASSWORD_ID}-error`}
                    lang={lang}
                    role="alert"
                    style={{
                      display: 'flex',
                      gap: 'var(--space-2)',
                      alignItems: 'flex-start',
                      fontSize: 'var(--text-caption)',
                      fontWeight: 'var(--weight-medium)',
                      color: 'var(--color-danger)',
                      margin: 'var(--space-2) 0 0',
                      lineHeight: 'var(--leading-snug)',
                    }}
                  >
                    <ICONS.statusWarning.icon size={14} aria-hidden />
                    {passwordError}
                  </p>
                )}
              </div>

              {/* Help row — the recovery path sits beside the
                  reassurance, and both are keyboard reachable. */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 'var(--space-3)',
                  flexWrap: 'wrap',
                  marginTop: 'var(--space-2)',
                }}
              >
                <span
                  lang={lang}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                    fontSize: 'var(--text-caption)',
                    color: 'var(--color-ink-tertiary)',
                  }}
                >
                  <ICONS.lock.icon size={14} aria-hidden />
                  {t('login.help.note', null, lang)}
                </span>
                <Link
                  href="/"
                  lang={lang}
                  style={{
                    fontSize: 'var(--text-body-sm)',
                    color: 'var(--color-accent)',
                    fontWeight: 'var(--weight-semibold)',
                    textDecoration: 'none',
                  }}
                >
                  {t('login.help.link', null, lang)}
                </Link>
              </div>

              <Button
                type="submit"
                variant="primary"
                fullWidth
                disabled={submitting || !phone || !password}
                loading={submitting}
                icon={<ICONS.signIn.icon size={18} aria-hidden />}
                lang={lang}
                style={{ marginTop: 'var(--space-5)', minHeight: 52 }}
              >
                {submitting
                  ? t('login.cta.submitting', null, lang)
                  : t('login.cta.submit', null, lang)}
              </Button>
            </form>

            {/* Register link */}
            <div style={{ marginTop: 'var(--space-5)', textAlign: 'center' }}>
              <Link
                href={
                  nextPath === DEFAULT_NEXT
                    ? '/register'
                    : `/register?next=${encodeURIComponent(nextPath)}`
                }
                lang={lang}
                style={{
                  fontSize: 'var(--text-body-sm)',
                  color: 'var(--color-ink-secondary)',
                  textDecoration: 'none',
                }}
              >
                {t('login.footer.new_here', null, lang)}{' '}
                <strong
                  style={{
                    color: 'var(--color-accent)',
                    fontWeight: 'var(--weight-semibold)',
                  }}
                >
                  {t('login.footer.register', null, lang)}
                </strong>
              </Link>
            </div>

            <p
              lang={lang}
              style={{
                marginTop: 'var(--space-6)',
                textAlign: 'center',
                fontSize: 'var(--text-micro)',
                color: 'var(--color-ink-tertiary)',
                lineHeight: 'var(--leading-snug)',
              }}
            >
              {t('login.legal', null, lang)}
            </p>
          </div>
        </div>
      </section>

      {/* ================= STORY COLUMN ================= */}
      <aside className="login-story">
        {/* Abstract city map behind the story */}
        <div
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0, opacity: 0.35 }}
        >
          <StoryMap />
        </div>

        <div
          style={{
            position: 'relative',
            zIndex: 1,
            maxWidth: 460,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-5)',
          }}
        >
          <span
            lang={lang}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              alignSelf: 'flex-start',
              padding: '4px var(--space-3)',
              borderRadius: 'var(--radius-pill)',
              background: 'rgba(96, 165, 250, 0.16)',
              color: 'var(--color-ink-on-dark)',
              fontSize: 'var(--text-caption)',
              fontWeight: 'var(--weight-semibold)',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--color-status-resolved)',
              }}
            />
            {t('login.story.eyebrow', null, lang)}
          </span>

          <h2
            lang={lang}
            style={{
              fontSize: 'var(--text-display-lg)',
              lineHeight: 1.15,
              fontFamily: 'var(--font-display)',
              fontWeight: 'var(--weight-semibold)',
              letterSpacing: 'var(--tracking-tight)',
              margin: 0,
              color: 'var(--color-ink-on-dark)',
            }}
          >
            {t('login.story.title_line1', null, lang)}
            <br />
            {t('login.story.title_line2', null, lang)}
          </h2>

          <p
            lang={lang}
            style={{
              fontSize: 'var(--text-body-lg)',
              color: 'rgba(247, 250, 252, 0.76)',
              margin: 0,
              lineHeight: 'var(--leading-normal)',
            }}
          >
            {t('login.story.subtitle', null, lang)}
          </p>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)',
              marginTop: 'var(--space-2)',
            }}
          >
            <Benefit
              icon={<ICONS.statusSubmitted.icon size={18} aria-hidden />}
              title={t('login.story.benefit1.title', null, lang)}
              desc={t('login.story.benefit1.desc', null, lang)}
            />
            <Benefit
              icon={<ICONS.performance.icon size={18} aria-hidden />}
              title={t('login.story.benefit2.title', null, lang)}
              desc={t('login.story.benefit2.desc', null, lang)}
            />
            <Benefit
              icon={<ICONS.statusResolved.icon size={18} aria-hidden />}
              title={t('login.story.benefit3.title', null, lang)}
              desc={t('login.story.benefit3.desc', null, lang)}
            />
          </div>
        </div>

        {/* The trust strip */}
        <div
          lang={lang}
          style={{
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            gap: 'var(--space-4)',
            flexWrap: 'wrap',
            paddingTop: 'var(--space-5)',
            borderTop: '1px solid rgba(148, 163, 184, 0.22)',
            fontSize: 'var(--text-caption)',
            color: 'rgba(247, 250, 252, 0.72)',
          }}
        >
          <TrustItem
            icon={<ICONS.security.icon size={14} aria-hidden />}
            label={t('login.story.trust.government', null, lang)}
          />
          <TrustItem
            icon={<ICONS.lock.icon size={14} aria-hidden />}
            label={t('login.story.trust.privacy', null, lang)}
          />
          <TrustItem
            icon={<ICONS.language.icon size={14} aria-hidden />}
            label={t('login.story.trust.bilingual', null, lang)}
          />
        </div>
      </aside>

      {/*
        The shell's layout and its responsive collapse.

        A grid template and a media query cannot be expressed with
        inline styles alone, so the shell's own rules live in a
        page-scoped <style> block — the same pattern
        app/register/page.tsx uses for its own media query. The tokens
        are still the design system's; only the LAYOUT lives here.

        Below 1024px the story column is HIDDEN, not stacked: on a
        phone the form keeps the full width of the screen, and the
        story is decoration that a 390px column cannot carry anyway.
      */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .login-shell {
              display: grid;
              grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
              min-height: 100vh;
            }
            .login-form-col {
              display: flex;
              flex-direction: column;
              padding: var(--space-6) var(--space-7) var(--space-6);
              background: var(--color-surface-page);
              min-width: 0;
            }
            .login-form-wrap {
              flex: 1;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: var(--space-7) 0;
            }
            .login-story {
              position: relative;
              overflow: hidden;
              /* The story panel is a DARK surface in every theme. Do not
               * use --color-surface-inverse here: that token flips with
               * the theme, so in dark mode it resolves to near-white
               * (#F7FAFC) while the panel's ink is --color-ink-on-dark
               * (#F9FAFB) — a 1.02:1 pair, i.e. invisible copy. The
               * StoryMap strokes are light-on-dark at 30% opacity too.
               * --color-rail is dark in light AND dark mode, and
               * --color-rail-ink is its light counterpart. */
              background: var(--color-rail);
              color: var(--color-ink-on-dark);
              padding: var(--space-8) var(--space-8) var(--space-7);
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              min-width: 0;
            }
            @media (max-width: 1024px) {
              .login-shell { grid-template-columns: minmax(0, 1fr) !important; }
              .login-story { display: none !important; }
            }
          `,
        }}
      />
    </div>
  );
}

/**
 * The error summary.
 *
 * It is FOCUSABLE (`tabIndex={-1}`) so a failed submit can move the
 * keyboard to it, and it LINKS to the field the failure belongs to so
 * the user is one keystroke away from fixing it.
 */
function ErrorSummary({
  title,
  body,
  linkLabel,
  linkHref,
  lang,
}: {
  title: string;
  body: string;
  linkLabel: string;
  linkHref: string;
  lang: Language;
}) {
  return (
    <div
      role="alert"
      tabIndex={-1}
      lang={lang}
      style={{
        display: 'flex',
        gap: 'var(--space-3)',
        alignItems: 'flex-start',
        padding: 'var(--space-3) var(--space-4)',
        borderRadius: 'var(--radius-input)',
        border: '1px solid var(--color-danger)',
        background: 'var(--color-danger-soft)',
        color: 'var(--color-ink)',
        fontSize: 'var(--text-body-sm)',
        marginBottom: 'var(--space-4)',
      }}
    >
      <ICONS.statusWarning.icon size={18} color="var(--color-danger)" aria-hidden />
      <div>
        <div style={{ fontWeight: 'var(--weight-semibold)' }}>{title}</div>
        <div>{body}</div>
        <a
          href={linkHref}
          lang={lang}
          style={{
            display: 'inline-block',
            marginTop: 2,
            color: 'var(--color-danger)',
            fontWeight: 'var(--weight-semibold)',
            textDecoration: 'underline',
            textUnderlineOffset: 2,
          }}
        >
          {linkLabel}
        </a>
      </div>
    </div>
  );
}

/**
 * One benefit row in the story column.
 */
function Benefit({
  icon,
  title,
  desc,
}: {
  icon: ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 'var(--space-3)',
        alignItems: 'flex-start',
        padding: 'var(--space-3)',
        border: '1px solid rgba(148, 163, 184, 0.22)',
        borderRadius: 'var(--radius-md)',
        background: 'rgba(15, 23, 42, 0.45)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 32,
          height: 32,
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 'var(--radius-sm)',
          background: 'rgba(96, 165, 250, 0.18)',
          color: 'var(--color-ink-on-dark)',
        }}
      >
        {icon}
      </span>

      <div>
        <div
          style={{
            fontSize: 'var(--text-body)',
            fontWeight: 'var(--weight-semibold)',
            color: 'var(--color-ink-on-dark)',
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 'var(--text-caption)',
            color: 'rgba(247, 250, 252, 0.72)',
            lineHeight: 'var(--leading-snug)',
          }}
        >
          {desc}
        </div>
      </div>
    </div>
  );
}

/**
 * One item in the story column's trust strip.
 */
function TrustItem({
  icon,
  label,
}: {
  icon: ReactNode;
  label: string;
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
      {icon}
      {label}
    </span>
  );
}

/**
 * The brand mark — the same pin-and-check drawing `CityFixMark` renders,
 * without the boxed chrome the mockup's lockup uses.
 *
 * The register page draws it the same way, so the two auth pages open
 * with an identical lockup.
 */
function BrandMark() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      focusable="false"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M12 22.4c-.4 0-.74-.21-.93-.57C10.65 20.7 6.2 15.2 6.2 10 6.2 5.6 8.9 2 12.2 2S18.2 5.6 18.2 10c0 5.2-4.45 10.7-4.87 11.83-.19.36-.53.57-.93.57Z"
        fill="var(--color-primary)"
      />
      <rect x="7.5" y="5.1" width="9" height="9" rx="2" fill="var(--color-surface-card)" />
      <path
        d="M9.6 9.5 11.3 11.2l3.4-3.6"
        stroke="var(--color-success)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The abstract city map behind the story column.
 *
 * Decorative only — it is `aria-hidden` and carries no information a
 * screen reader needs. The roads, the park and the pins are the same
 * drawing the mockup uses.
 */
function StoryMap() {
  return (
    <svg
      viewBox="0 0 800 800"
      preserveAspectRatio="xMidYMid slice"
      style={{ width: '100%', height: '100%', display: 'block' }}
      aria-hidden
      focusable="false"
    >
      <g stroke="rgba(148,163,184,0.30)" strokeLinecap="round" fill="none">
        <line x1="0" y1="200" x2="800" y2="180" strokeWidth="34" />
        <line x1="120" y1="0" x2="140" y2="800" strokeWidth="26" />
        <line x1="0" y1="470" x2="800" y2="455" strokeWidth="22" />
        <line x1="520" y1="0" x2="500" y2="800" strokeWidth="18" />
        <line x1="280" y1="0" x2="290" y2="800" strokeWidth="14" />
        <line x1="0" y1="350" x2="800" y2="340" strokeWidth="10" />
      </g>
      <g fill="rgba(52,211,153,0.16)">
        <rect x="600" y="270" width="150" height="160" rx="12" />
      </g>
      <g fill="rgba(96,165,250,0.55)">
        <circle cx="200" cy="180" r="9" />
        <circle cx="380" cy="330" r="9" />
        <circle cx="640" cy="170" r="9" />
        <circle cx="250" cy="480" r="9" />
        <circle cx="560" cy="430" r="9" />
      </g>
    </svg>
  );
}
