/**
 * 1.3 Registration (citizen creates account).
 *
 * Per UX spec 1.3-registration/1.3-registration.md:
 *   - 5 fields: phone, NID, full name, password, confirm password
 *   - Client-side validation on blur + submit per the spec table
 *   - Show/hide password toggle on both password inputs
 *   - Server errors render in the red helper style under the field
 *   - On 201 → /verify-otp?phone=… so the citizen can complete SMS-OTP
 *     (in dev mode the verify route is bypassed and we land at /home)
 *   - On 409 → inline conflict error pointing the citizen at /login
 *   - On 5xx / network → top-level toast above the form
 *   - Bilingual copy; per-user override persisted on submit (out of scope for v1)
 *
 * VISUAL CONTRACT
 * ---------------
 * The page is re-composed to match the approved mockup
 * `design-artifacts/D-Design-System/01-Visual-Design/mockups/09-register.html`:
 *
 * NOTE (2026-11-13): the page-per-page mockups were replaced by the four
 * role dashboards, so `09-register.html` no longer exists. The composition
 * described below is retained here as the record of the contract this
 * page was built against.
 *
 *   - a two-region shell (form on the left, civic story on the right),
 *     collapsing to one column below 1024px with the story column hidden;
 *   - a three-stage progress rail above the title;
 *   - the live password-requirements panel under the password field, where
 *     every row carries an ICON as well as a word so the met / unmet state
 *     is never colour-alone;
 *   - the consent row, the CTA with its trailing arrow, and the centred
 *     footer link.
 *
 * This was a PRESENTATION-LAYER change only. The API call, the submit
 * handler, the validation rules, the redirect targets, the session
 * handling and the field set are all unchanged — the confirm-password
 * field stays even though the mockup omits it.
 *
 * Phase B (2026-10-04): web-first, 1440×900 + 1024×768 viewports.
 */

'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { t, type Language } from '@/lib/i18n/keys';
import { safeNextPath } from '@/lib/safe-next';
import { ICONS } from '@/lib/ui/icon-map';
import { Button, Input } from '@/components/ui';
import { useLanguage } from '@/components/useLanguage';


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
  const { lang } = useLanguage();
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

  // The live password requirements. Each rule is driven by the CURRENT
  // password value, so the panel is a progress indicator rather than a
  // static legend.
  const passwordRules = [
    { key: 'length' as const, met: form.password.length >= 8 },
    { key: 'number' as const, met: /[0-9]/.test(form.password) },
    { key: 'uppercase' as const, met: /[A-Z]/.test(form.password) },
    { key: 'symbol' as const, met: /[^A-Za-z0-9]/.test(form.password) },
  ];

  return (
    <div className="register-shell">
      {/* ================= FORM COLUMN ================= */}
      <section className="register-form-col">
        {/* Brand lockup */}
        <Link
          href="/"
          aria-label="CityFix home"
          className="register-brand"
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
            style={{
              fontSize: 'var(--text-body-sm)',
              color: 'var(--color-ink-tertiary)',
            }}
          >
            {t('register.brand.city', null, lang)}
          </span>
        </Link>

        <div className="register-form-wrap">
          <div style={{ width: '100%', maxWidth: 460 }}>
            {/* ---- Funnel progress rail (visual, not interactive) ---- */}
            <div
              className="register-steps"
              aria-label={t('register.steps.label', null, lang)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                marginBottom: 'var(--space-5)',
              }}
            >
              <Step index={1} label={t('register.steps.1.label', null, lang)} active />
              <span
                aria-hidden
                style={{ flex: 1, height: 1, background: 'var(--color-border)' }}
              />
              <Step index={2} label={t('register.steps.2.label', null, lang)} />
              <span
                aria-hidden
                style={{ flex: 1, height: 1, background: 'var(--color-border)' }}
              />
              <Step index={3} label={t('register.steps.3.label', null, lang)} />
            </div>

            <h1
              lang={lang}
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--text-display-md)',
                lineHeight: 'var(--leading-snug)',
                fontWeight: 'var(--weight-semibold)',
                letterSpacing: 'var(--tracking-tight)',
                color: 'var(--color-ink)',
                margin: '0 0 var(--space-2)',
              }}
            >
              {t('register.title', null, lang)}
            </h1>
            <p
              lang={lang}
              style={{
                fontSize: 'var(--text-body)',
                color: 'var(--color-ink-secondary)',
                margin: '0 0 var(--space-5)',
              }}
            >
              {t('register.subtitle', null, lang)}
            </p>

            {/* Network / 5xx toast */}
            {networkError && (
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
                {t(networkError, null, lang)}
              </div>
            )}

            <form onSubmit={onSubmit} noValidate>
              {/* ---- Phone ---- */}
              <RegisterField
                id="reg-phone"
                label={t('register.field.phone.label', null, lang)}
                lang={lang}
                hint={
                  <span style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start' }}>
                    <span
                      aria-hidden
                      style={{
                        flexShrink: 0,
                        marginTop: 2,
                        color: 'var(--color-ink-tertiary)',
                        display: 'inline-flex',
                      }}
                    >
                      <ICONS.phone.icon size={14} aria-hidden />
                    </span>
                    <span>{t('register.field.phone.helper', null, lang)}</span>
                  </span>
                }
                error={errors.phone ? t(errors.phone, null, lang) : undefined}
              >
                {(aria, control) => (
                  <Input
                    {...aria}
                    size="lg"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    lang={lang}
                    placeholder="01XXXXXXXXX"
                    value={form.phone}
                    onChange={(e) => update('phone', e.target.value)}
                    onBlur={() => blur('phone')}
                    style={control.invalidStyle}
                  />
                )}
              </RegisterField>

              {/* ---- NID ---- */}
              <RegisterField
                id="reg-nid"
                label={t('register.field.nid.label', null, lang)}
                lang={lang}
                error={errors.nid ? t(errors.nid, null, lang) : undefined}
              >
                {(aria, control) => (
                  <Input
                    {...aria}
                    size="lg"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    lang={lang}
                    placeholder="1234567890"
                    value={form.nid}
                    onChange={(e) => update('nid', e.target.value.replace(/[^0-9]/g, '').slice(0, 17))}
                    onBlur={() => blur('nid')}
                    style={control.invalidStyle}
                  />
                )}
              </RegisterField>

              {/* ---- Name ---- */}
              <RegisterField
                id="reg-name"
                label={t('register.field.name.label', null, lang)}
                lang={lang}
                hint={t('register.field.name.helper', null, lang)}
                error={errors.name ? t(errors.name, null, lang) : undefined}
              >
                {(aria, control) => (
                  <Input
                    {...aria}
                    size="lg"
                    type="text"
                    autoComplete="name"
                    lang={lang}
                    placeholder=""
                    value={form.name}
                    onChange={(e) => update('name', e.target.value)}
                    onBlur={() => blur('name')}
                    style={control.invalidStyle}
                  />
                )}
              </RegisterField>

              {/* ---- Password ---- */}
              <RegisterField
                id="reg-password"
                label={t('register.field.password.label', null, lang)}
                lang={lang}
                error={errors.password ? t(errors.password, null, lang) : undefined}
                describedByExtra="reg-password-req"
              >
                {(aria, control) => (
                  <>
                    <div style={{ position: 'relative' }}>
                      <Input
                        {...aria}
                        size="lg"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        lang="en"
                        value={form.password}
                        onChange={(e) => update('password', e.target.value)}
                        onBlur={() => blur('password')}
                        // Clears the absolutely-positioned show/hide adornment.
                        style={{
                          padding: '0 72px 0 var(--space-3)',
                          ...control.invalidStyle,
                        }}
                      />
                      <ShowHide
                        shown={showPassword}
                        onToggle={() => setShowPassword((s) => !s)}
                        lang={lang}
                      />
                    </div>

                    {/* Live password requirements — every row carries an
                        icon, so the state is never colour-alone. */}
                    <div
                      id="reg-password-req"
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                        gap: 'var(--space-2)',
                        padding: 'var(--space-3)',
                        marginTop: 'var(--space-2)',
                        background: 'var(--color-surface-raised)',
                        borderRadius: 'var(--radius-input)',
                        fontSize: 'var(--text-caption)',
                        color: 'var(--color-ink-secondary)',
                      }}
                    >
                      {passwordRules.map((rule) => (
                        <span
                          key={rule.key}
                          style={{
                            display: 'flex',
                            gap: 'var(--space-2)',
                            alignItems: 'center',
                            color: rule.met
                              ? 'var(--color-status-resolved)'
                              : 'var(--color-ink-tertiary)',
                          }}
                        >
                          {rule.met ? (
                            <ICONS.statusResolved.icon
                              size={14}
                              weight="bold"
                              aria-hidden
                              style={{ flexShrink: 0 }}
                            />
                          ) : (
                            <ICONS.statusWarning.icon
                              size={14}
                              weight="bold"
                              aria-hidden
                              style={{ flexShrink: 0 }}
                            />
                          )}
                          <span>{t(`register.password.rule.${rule.key}`, null, lang)}</span>
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </RegisterField>

              {/* ---- Confirm password ----
                  Kept: the mockup omits it, but the field and its
                  validation are part of the shipped behaviour. */}
              <RegisterField
                id="reg-confirm"
                label={t('register.field.confirm.label', null, lang)}
                lang={lang}
                error={
                  serverError
                    ? t('register.error.conflict', null, lang)
                    : errors.confirm
                      ? t(errors.confirm, null, lang)
                      : undefined
                }
              >
                {(aria, control) => (
                  <div style={{ position: 'relative' }}>
                    <Input
                      {...aria}
                      size="lg"
                      type={showConfirm ? 'text' : 'password'}
                      autoComplete="new-password"
                      lang="en"
                      value={form.confirm}
                      onChange={(e) => update('confirm', e.target.value)}
                      onBlur={() => blur('confirm')}
                      style={{
                        padding: '0 72px 0 var(--space-3)',
                        ...control.invalidStyle,
                      }}
                    />
                    <ShowHide
                      shown={showConfirm}
                      onToggle={() => setShowConfirm((s) => !s)}
                      lang={lang}
                    />
                  </div>
                )}
              </RegisterField>

              {/* ---- Consent ---- */}
              <div
                style={{
                  display: 'flex',
                  gap: 'var(--space-3)',
                  alignItems: 'flex-start',
                  fontSize: 'var(--text-caption)',
                  color: 'var(--color-ink-secondary)',
                  lineHeight: 'var(--leading-snug)',
                  marginTop: 'var(--space-4)',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 18,
                    height: 18,
                    flexShrink: 0,
                    marginTop: 1,
                    border: '1px solid var(--color-border-input)',
                    borderRadius: 'var(--radius-xs)',
                    background: 'var(--color-surface-card)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--color-on-primary)',
                  }}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                    focusable="false"
                  >
                    <path d="m5 13 4 4L19 7" />
                  </svg>
                </span>
                <span>
                  {t('register.consent.lead', null, lang)}{' '}
                  <strong
                    style={{
                      color: 'var(--color-accent)',
                      fontWeight: 'var(--weight-semibold)',
                    }}
                  >
                    {t('register.consent.terms', null, lang)}
                  </strong>{' '}
                  {t('register.consent.tail', null, lang)}
                </span>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                disabled={submitting}
                loading={submitting}
                lang={lang}
                trailingIcon={<ICONS.forward.icon size={18} aria-hidden />}
                style={{
                  marginTop: 'var(--space-5)',
                  minHeight: 52,
                  fontSize: 'var(--text-body-lg)',
                }}
              >
                {submitting
                  ? t('register.cta.submitting', null, lang)
                  : t('register.cta.submit', null, lang)}
              </Button>
            </form>

            {/* ---- Footer link ---- */}
            <div style={{ marginTop: 'var(--space-5)', textAlign: 'center' }}>
              <Link
                href={
                  nextPath === '/home'
                    ? '/login'
                    : `/login?next=${encodeURIComponent(nextPath)}`
                }
                lang={lang}
                style={{
                  fontSize: 'var(--text-body-sm)',
                  color: 'var(--color-ink-secondary)',
                  textDecoration: 'none',
                }}
              >
                {t('register.link.login', null, lang)}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ================= STORY COLUMN ================= */}
      <aside className="register-story">
        <div
          aria-hidden
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
          {/* Eyebrow */}
          <span
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
              aria-hidden
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--color-status-resolved)',
              }}
            />
            {t('register.story.eyebrow', null, lang)}
          </span>

          <h2
            lang={lang}
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-display-lg)',
              lineHeight: 1.15,
              fontWeight: 'var(--weight-semibold)',
              letterSpacing: 'var(--tracking-tight)',
              margin: 0,
              color: 'var(--color-ink-on-dark)',
              whiteSpace: 'pre-line',
            }}
          >
            {t('register.story.title', null, lang)}
          </h2>

          <p
            lang={lang}
            style={{
              fontSize: 'var(--text-body-lg)',
              color: 'rgba(247, 250, 252, 0.76)',
              margin: 0,
            }}
          >
            {t('register.story.subtitle', null, lang)}
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
              icon={<ICONS.lock.icon size={18} aria-hidden />}
              title={t('register.story.benefit1.title', null, lang)}
              desc={t('register.story.benefit1.desc', null, lang)}
            />
            <Benefit
              icon={<ICONS.security.icon size={18} aria-hidden />}
              title={t('register.story.benefit2.title', null, lang)}
              desc={t('register.story.benefit2.desc', null, lang)}
            />
            <Benefit
              icon={<ICONS.notifications.icon size={18} aria-hidden />}
              title={t('register.story.benefit3.title', null, lang)}
              desc={t('register.story.benefit3.desc', null, lang)}
            />
          </div>
        </div>

        {/* Trust strip */}
        <div
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
            label={t('register.story.trust1', null, lang)}
          />
          <TrustItem
            icon={<ICONS.lock.icon size={14} aria-hidden />}
            label={t('register.story.trust2', null, lang)}
          />
          <TrustItem
            icon={<ICONS.language.icon size={14} aria-hidden />}
            label={t('register.story.trust3', null, lang)}
          />
        </div>
      </aside>

      {/*
        The shell's layout and its responsive collapse.

        A grid template and a media query cannot be expressed with
        inline styles alone, so the shell's own rules live in a
        page-scoped <style> block — the same pattern app/profile/page.tsx
        uses for its own media queries. The tokens are still the
        design system's; only the LAYOUT lives here.
      */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .register-shell {
              display: grid;
              grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
              min-height: 100vh;
            }
            .register-form-col {
              display: flex;
              flex-direction: column;
              padding: var(--space-6) var(--space-7);
              background: var(--color-surface-page);
            }
            .register-form-wrap {
              flex: 1;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: var(--space-6) 0;
            }
            .register-story {
              position: relative;
              overflow: hidden;
              background: var(--color-surface-inverse);
              color: var(--color-ink-on-dark);
              padding: var(--space-8);
              display: flex;
              flex-direction: column;
              justify-content: space-between;
            }
            @media (max-width: 1024px) {
              .register-shell { grid-template-columns: minmax(0, 1fr) !important; }
              .register-story { display: none !important; }
            }
          `,
        }}
      />
    </div>
  );
}

/**
 * The brand mark — the same pin-and-check drawing `CityFixMark` renders,
 * without the boxed chrome the mockup's lockup uses.
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
 * One stage of the progress rail.
 *
 * The rail is a VISUAL indicator, not a control: the dot is a number,
 * the label is text, and nothing here is focusable or clickable.
 */
function Step({
  index,
  label,
  active = false,
}: {
  index: number;
  label: string;
  active?: boolean;
}) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
      <span
        aria-hidden
        style={{
          width: 22,
          height: 22,
          borderRadius: 'var(--radius-pill)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 'var(--text-micro)',
          fontWeight: 'var(--weight-bold)',
          background: active
            ? 'var(--color-primary)'
            : 'var(--color-surface-raised)',
          color: active ? 'var(--color-on-primary)' : 'var(--color-ink-tertiary)',
          border: `1px solid ${
            active ? 'var(--color-primary)' : 'var(--color-border)'
          }`,
        }}
      >
        {index}
      </span>
      <span
        style={{
          fontSize: 'var(--text-caption)',
          color: active ? 'var(--color-ink)' : 'var(--color-ink-tertiary)',
          fontWeight: active ? 'var(--weight-semibold)' : undefined,
        }}
      >
        {label}
      </span>
    </span>
  );
}

/**
 * A labelled form row: label, control, then the hint / error UNDERNEATH.
 *
 * WHY THIS IS NOT `components/ui`'s `Field`
 * -----------------------------------------
 * The shared `Field` renders its hint ABOVE the control. The approved
 * mockup puts the hint BELOW the input (label → input → hint), and the
 * password field's show/hide adornment has to sit INSIDE the input's
 * box — which `Field`'s single-child contract cannot express, because
 * it clones the child and would move the `id` off the `<input>` onto
 * the wrapper `<div>` that holds the input and its adornment.
 *
 * So the row is composed here, and the wiring `Field` exists to
 * guarantee is reproduced exactly: a real `<label for>`, an
 * `aria-describedby` pointing at the hint and/or the error, and
 * `aria-invalid` on the control. The control itself is still the
 * shared `Input` primitive — `children` is a function that receives
 * the ARIA props to spread onto it.
 */
function RegisterField({
  id,
  label,
  lang,
  hint,
  error,
  describedByExtra,
  children,
}: {
  id: string;
  label: string;
  lang: Language;
  hint?: React.ReactNode;
  error?: string;
  /** Extra element ids the control is described by (e.g. a live panel). */
  describedByExtra?: string;
  children: (aria: {
    id: string;
    'aria-describedby'?: string;
    'aria-invalid'?: true;
  }, control: { invalidStyle?: React.CSSProperties }) => React.ReactNode;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy =
    [hintId, errorId, describedByExtra].filter(Boolean).join(' ') || undefined;

  // The mockup paints an invalid control's border with the danger
  // token. The shared `Input` primitive sets its border inline from the
  // neutral input token, so the override is handed to the caller as a
  // separate argument — it must NOT ride along in the ARIA props,
  // because `Input` spreads those onto the DOM `<input>`.
  const control = {
    invalidStyle: error
      ? { border: '1px solid var(--color-danger)' }
      : undefined,
  };

  return (
    <div style={{ marginBottom: 'var(--space-4)' }}>
      <label
        htmlFor={id}
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
        {label}
      </label>
      {children(
        {
          id,
          'aria-describedby': describedBy,
          'aria-invalid': error ? true : undefined,
        },
        control,
      )}
      {hint ? (
        <span
          id={hintId}
          style={{
            display: 'flex',
            gap: 'var(--space-2)',
            alignItems: 'flex-start',
            fontSize: 'var(--text-caption)',
            color: 'var(--color-ink-secondary)',
            marginTop: 'var(--space-2)',
            lineHeight: 'var(--leading-snug)',
          }}
        >
          {hint}
        </span>
      ) : null}
      {error ? (
        <span
          id={errorId}
          role="alert"
          lang={lang}
          style={{
            display: 'flex',
            gap: 'var(--space-2)',
            alignItems: 'flex-start',
            fontSize: 'var(--text-caption)',
            fontWeight: 'var(--weight-medium)',
            color: 'var(--color-danger)',
            marginTop: 'var(--space-2)',
            lineHeight: 'var(--leading-snug)',
          }}
        >
          <span
            aria-hidden
            style={{ flexShrink: 0, marginTop: 2, display: 'inline-flex' }}
          >
            <ICONS.statusWarning.icon size={14} weight="bold" aria-hidden />
          </span>
          {error}
        </span>
      ) : null}
    </div>
  );
}

/**
 * The show/hide-password adornment.
 *
 * It sits INSIDE the input's box on the right, so the input reserves
 * room for it with a right padding. It is a real button (the shared
 * `Button` primitive in its ghost skin) so it is reachable by keyboard
 * and announced by a screen reader.
 */
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
    <Button
      variant="ghost"
      size="sm"
      onClick={onToggle}
      aria-label={
        shown
          ? t('register.field.password.hide_label', null, lang)
          : t('register.field.password.show_label', null, lang)
      }
      lang={lang}
      icon={<ICONS.eye.icon size={16} aria-hidden />}
      style={{
        position: 'absolute',
        right: 'var(--space-2)',
        top: '50%',
        transform: 'translateY(-50%)',
        minHeight: 32,
        height: 32,
        padding: '0 var(--space-2)',
        gap: 4,
        borderRadius: 'var(--radius-xs)',
        color: 'var(--color-ink-secondary)',
        fontSize: 'var(--text-caption)',
        fontWeight: 'var(--weight-semibold)',
      }}
    >
      {shown ? t('register.cta.hide', null, lang) : t('register.cta.show', null, lang)}
    </Button>
  );
}

/**
 * One row of the story column's benefit list.
 */
function Benefit({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
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
        aria-hidden
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
 * One item of the story column's trust strip.
 */
function TrustItem({
  icon,
  label,
}: {
  icon: React.ReactNode;
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
 * The decorative map behind the story column.
 *
 * Purely ornamental — `aria-hidden` on the wrapper — but it is what
 * gives the dark column its sense of place.
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
