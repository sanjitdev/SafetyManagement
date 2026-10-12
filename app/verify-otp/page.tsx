/**
 * 1.4 Verification (OTP)
 *
 * Per UX spec 1.4-verification-otp/1.4-verification-otp.md:
 *   - 6 single-digit boxes, auto-advance, paste support, backspace-to-prev
 *   - 480px centered card on calm neutral background
 *   - In-flow Verify button (not sticky-bottom per Phase B re-skin)
 *   - 60s resend cooldown with countdown
 *   - "Code didn't arrive?" helper after 30s of no input
 *   - 401 → wrong-code inline error
 *   - 410 → expired-code inline error + immediate resend unlock
 *   - 429 → too-many-attempts full-card message
 *   - 5xx → top-level toast
 *   - Back arrow → confirm dialog → leave → /welcome
 *   - Bilingual copy; phone mask shows last 3 digits
 *
 * On 200 the session cookie has been set by the server; we router.replace
 * to /home.
 *
 * Phase B (2026-10-04): web-first, 1440×900 + 1024×768 viewports.
 */

'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { t, type Language } from '@/lib/i18n/keys';

const LANG_KEY = 'cityfix.preferred_language.v1';
const CODE_LEN = 6;
const RESEND_SECONDS = 60;
const HELPER_NOT_ARRIVED_MS = 30_000;

type ErrorState =
  | { kind: 'wrong_code' }
  | { kind: 'expired' }
  | { kind: 'too_many' }
  | { kind: 'network' };

function maskPhone(raw: string): string {
  // "+8801712345678" → "1712-***-678"
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits.length < 6) return raw;
  const last3 = digits.slice(-3);
  const head = digits.slice(-11, -7);
  return `${head}-***-${last3}`;
}

export default function VerifyOtpPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: '100vh',
            background: 'var(--color-surface-page)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            style={{
              width: 24,
              height: 24,
              border: '2px solid var(--color-border)',
              borderTopColor: 'var(--color-primary)',
              borderRadius: '50%',
              animation: 'cityfix-spin 0.8s linear infinite',
            }}
            aria-hidden
          />
        </div>
      }
    >
      <VerifyOtpInner />
    </Suspense>
  );
}

function VerifyOtpInner() {
  const router = useRouter();
  const params = useSearchParams();
  const phoneParam = params.get('phone') ?? '';
  const masked = useMemo(() => maskPhone(phoneParam), [phoneParam]);

  const [lang, setLang] = useState<Language>('bn');
  const [digits, setDigits] = useState<string[]>(Array(CODE_LEN).fill(''));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ErrorState | null>(null);
  const [lockout, setLockout] = useState(false);
  const [resendTimer, setResendTimer] = useState(RESEND_SECONDS);
  const [resendSending, setResendSending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(false);
  const [showHelper, setShowHelper] = useState(false);
  const [showBackConfirm, setShowBackConfirm] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const firstInputRef = useRef<HTMLInputElement | null>(null);
  const mountedAt = useRef<number>(Date.now());

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LANG_KEY);
      if (stored === 'en' || stored === 'bn') setLang(stored);
    } catch {
      // ignore
    }
    // Auto-focus the first box
    inputRefs.current[0]?.focus();
    // Fire the initial send-otp on mount so the user gets an SMS in prod
    // (or a dev_code in dev mode).
    void requestCode();
  }, []);

  // Resend countdown
  useEffect(() => {
    if (resendTimer <= 0) return;
    const id = window.setInterval(() => {
      setResendTimer((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [resendTimer]);

  // "Code didn't arrive?" helper after 30s
  useEffect(() => {
    const id = window.setTimeout(() => setShowHelper(true), HELPER_NOT_ARRIVED_MS);
    return () => window.clearTimeout(id);
  }, []);

  function toggleLang() {
    const next: Language = lang === 'bn' ? 'en' : 'bn';
    setLang(next);
    try {
      window.localStorage.setItem(LANG_KEY, next);
    } catch {
      // ignore
    }
  }

  function setDigit(idx: number, value: string) {
    setError(null);
    setDigits((prev) => {
      const next = [...prev];
      next[idx] = value.replace(/[^0-9]/g, '').slice(-1);
      return next;
    });
    if (value && idx < CODE_LEN - 1) {
      inputRefs.current[idx + 1]?.focus();
    }
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData('text').replace(/[^0-9]/g, '').slice(0, CODE_LEN);
    if (!pasted) return;
    e.preventDefault();
    setError(null);
    const next = Array(CODE_LEN).fill('');
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setDigits(next);
    const last = Math.min(pasted.length, CODE_LEN - 1);
    inputRefs.current[last]?.focus();
  }

  const code = digits.join('');
  const canSubmit = code.length === CODE_LEN && !submitting && !lockout;

  async function requestCode(): Promise<void> {
    setResendSending(true);
    setResendCooldown(true);
    try {
      const res = await fetch('/api/v1/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phone: phoneParam }),
      });
      if (res.status === 429) {
        // Cooldown; reset timer to whatever the server says
        const data = (await res.json().catch(() => ({}))) as {
          retryAfterMs?: number;
        };
        const seconds = Math.ceil((data.retryAfterMs ?? RESEND_SECONDS * 1000) / 1000);
        setResendTimer(seconds);
        setResendCooldown(true);
      } else if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as { dev_code?: string };
        if (data.dev_code) setDevCode(data.dev_code);
        setResendTimer(RESEND_SECONDS);
        setResendCooldown(false);
        mountedAt.current = Date.now();
      }
    } catch {
      // Network error on send — show as helper, keep retrying via resend
    } finally {
      setResendSending(false);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phone: phoneParam, code }),
      });
      if (res.status === 200) {
        router.replace('/home');
        return;
      }
      if (res.status === 401) {
        setError({ kind: 'wrong_code' });
        // Auto-clear after 2s
        window.setTimeout(() => {
          setDigits(Array(CODE_LEN).fill(''));
          inputRefs.current[0]?.focus();
        }, 2000);
        return;
      }
      if (res.status === 410) {
        setError({ kind: 'expired' });
        setResendTimer(0); // unlock resend
        setDigits(Array(CODE_LEN).fill(''));
        return;
      }
      if (res.status === 429) {
        setLockout(true);
        setError({ kind: 'too_many' });
        return;
      }
      setError({ kind: 'network' });
    } catch {
      setError({ kind: 'network' });
    } finally {
      setSubmitting(false);
    }
  }

  // Lockout full-card view
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
            {t('verify.error.too_many', null, lang)}
          </p>
          <Link
            href="/register"
            lang={lang}
            style={{
              fontSize: 'var(--text-body)',
              color: 'var(--color-primary)',
              textDecoration: 'none',
              fontWeight: 'var(--weight-semibold)',
            }}
          >
            {t('verify.error.too_many_back', null, lang)}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-surface-page)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <header
        style={{
          height: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 var(--space-5)',
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-surface-card)',
        }}
      >
        <button
          type="button"
          onClick={() => setShowBackConfirm(true)}
          aria-label={t('verify.back', null, lang)}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--color-ink-secondary)',
            fontSize: 'var(--text-body-lg)',
            cursor: 'pointer',
            padding: 'var(--space-2)',
          }}
        >
          ←
        </button>
        <Link
          href="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            textDecoration: 'none',
            color: 'var(--color-ink)',
          }}
        >
          <span
            aria-hidden
            style={{
              width: 10,
              height: 10,
              background: 'var(--color-primary)',
              borderRadius: '50%',
            }}
          />
          <span
            style={{
              fontSize: 'var(--text-body)',
              fontWeight: 'var(--weight-bold)',
            }}
          >
            CityFix
          </span>
        </Link>
        <button
          type="button"
          onClick={toggleLang}
          aria-label="Toggle language"
          style={{
            padding: 'var(--space-1) var(--space-3)',
            background: 'transparent',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-pill)',
            color: 'var(--color-ink-secondary)',
            fontSize: 'var(--text-caption)',
            fontWeight: 'var(--weight-semibold)',
            cursor: 'pointer',
          }}
        >
          {t('welcome.lang.toggle', null, lang)}
        </button>
      </header>

      <main
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: 'var(--space-7) var(--space-5)',
        }}
      >
        <div style={{ width: '100%', maxWidth: 480 }}>
          <h1
            lang={lang}
            style={{
              fontSize: 'var(--text-h1)',
              fontWeight: 'var(--weight-semibold)',
              color: 'var(--color-ink)',
              margin: '0 0 var(--space-3)',
              letterSpacing: 'var(--tracking-tight)',
            }}
          >
            {t('verify.title', null, lang)}
          </h1>
          <p
            lang={lang}
            style={{
              fontSize: 'var(--text-body)',
              color: 'var(--color-ink-secondary)',
              margin: '0 0 var(--space-3)',
              lineHeight: 1.5,
            }}
          >
            {t('verify.subtitle', { masked }, lang)}
          </p>
          <p style={{ margin: '0 0 var(--space-6)' }}>
            <Link
              href="/register"
              lang={lang}
              style={{
                fontSize: 'var(--text-body-sm)',
                color: 'var(--color-primary)',
                textDecoration: 'none',
                fontWeight: 'var(--weight-semibold)',
              }}
            >
              {t('verify.change_number', null, lang)}
            </Link>
          </p>

          {/* Dev-mode hint: surface the OTP so the QA can complete the flow */}
          {devCode && (
            <div
              data-testid="dev-otp-hint"
              style={{
                padding: 'var(--space-3) var(--space-4)',
                background: 'var(--color-warning-soft, #fdf2cf)',
                border: '1px solid var(--color-warning, #b58410)',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-body-sm)',
                color: 'var(--color-ink)',
                marginBottom: 'var(--space-4)',
              }}
            >
              <strong>Dev code:</strong> {devCode} <span style={{ color: 'var(--color-ink-tertiary)' }}>(stub provider — production sends SMS via Twilio in v1.1)</span>
            </div>
          )}

          <form onSubmit={onSubmit} noValidate>
            <div
              role="group"
              aria-label={t('verify.input.code_aria', null, lang)}
              style={{
                display: 'flex',
                gap: 'var(--space-2)',
                justifyContent: 'center',
                marginBottom: 'var(--space-4)',
              }}
            >
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    inputRefs.current[i] = el;
                    if (i === 0) firstInputRef.current = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  autoComplete={i === 0 ? 'one-time-code' : 'off'}
                  maxLength={1}
                  value={d}
                  onChange={(e) => setDigit(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  onPaste={i === 0 ? handlePaste : undefined}
                  onFocus={(e) => e.currentTarget.select()}
                  disabled={submitting}
                  aria-label={`Digit ${i + 1}`}
                  style={{
                    width: 56,
                    height: 64,
                    textAlign: 'center',
                    fontSize: 'var(--text-h2)',
                    fontWeight: 'var(--weight-semibold)',
                    border: `1px solid ${error?.kind === 'wrong_code' || error?.kind === 'expired' ? 'var(--color-danger, #c92a2a)' : 'var(--color-border)'}`,
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-surface-card)',
                    color: 'var(--color-ink)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              ))}
            </div>

            {/* Inline error */}
            {error && error.kind !== 'too_many' && error.kind !== 'network' && (
              <p
                lang={lang}
                role="alert"
                style={{
                  fontSize: 'var(--text-body-sm)',
                  color: 'var(--color-danger, #c92a2a)',
                  margin: '0 0 var(--space-3)',
                  textAlign: 'center',
                }}
              >
                {t(`verify.error.${error.kind}`, null, lang)}
              </p>
            )}
            {error?.kind === 'network' && (
              <p
                lang={lang}
                role="alert"
                style={{
                  fontSize: 'var(--text-body-sm)',
                  color: 'var(--color-warning, #b58410)',
                  margin: '0 0 var(--space-3)',
                  textAlign: 'center',
                }}
              >
                {t('verify.error.network', null, lang)}
              </p>
            )}

            {/* "Code didn't arrive?" helper */}
            {showHelper && resendTimer > 0 && !resendCooldown && (
              <p
                lang={lang}
                style={{
                  fontSize: 'var(--text-caption)',
                  color: 'var(--color-ink-tertiary)',
                  margin: '0 0 var(--space-4)',
                  textAlign: 'center',
                }}
              >
                {t('verify.helper.not_arrived', null, lang)}
              </p>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              lang={lang}
              style={{
                width: '100%',
                height: 56,
                background: canSubmit ? 'var(--color-primary)' : 'var(--color-surface-raised)',
                color: canSubmit ? 'var(--color-on-primary)' : 'var(--color-ink-tertiary)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-body-lg)',
                fontWeight: 'var(--weight-semibold)',
                cursor: canSubmit ? 'pointer' : 'not-allowed',
                marginTop: 'var(--space-3)',
              }}
            >
              {submitting
                ? t('verify.cta.submitting', null, lang)
                : t('verify.cta.submit', null, lang)}
            </button>
          </form>

          {/* Resend */}
          <div
            style={{
              marginTop: 'var(--space-6)',
              textAlign: 'center',
            }}
          >
            {resendTimer > 0 ? (
              <span
                lang={lang}
                style={{
                  fontSize: 'var(--text-body-sm)',
                  color: 'var(--color-ink-tertiary)',
                }}
              >
                {t('verify.resend.countdown', { seconds: String(resendTimer).padStart(2, '0') }, lang)}
              </span>
            ) : resendSending ? (
              <span
                lang={lang}
                style={{
                  fontSize: 'var(--text-body-sm)',
                  color: 'var(--color-ink-tertiary)',
                }}
              >
                {t('verify.resend.sending', null, lang)}
              </span>
            ) : (
              <button
                type="button"
                onClick={requestCode}
                lang={lang}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--color-primary)',
                  fontSize: 'var(--text-body-sm)',
                  fontWeight: 'var(--weight-semibold)',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                {t('verify.resend.action', null, lang)}
              </button>
            )}
          </div>
        </div>
      </main>

      {/* Back confirmation dialog */}
      {showBackConfirm && (
        <div
          role="dialog"
          aria-modal
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'var(--space-5)',
            zIndex: 100,
          }}
          onClick={() => setShowBackConfirm(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--color-surface-card)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-6)',
              maxWidth: 360,
              width: '100%',
              boxShadow: '0 10px 30px rgba(0, 0, 0, 0.2)',
            }}
          >
            <h2
              lang={lang}
              style={{
                fontSize: 'var(--text-h3)',
                fontWeight: 'var(--weight-semibold)',
                color: 'var(--color-ink)',
                margin: '0 0 var(--space-5)',
              }}
            >
              {t('verify.back.confirm_title', null, lang)}
            </h2>
            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <button
                type="button"
                onClick={() => setShowBackConfirm(false)}
                lang={lang}
                style={{
                  flex: 1,
                  height: 48,
                  background: 'transparent',
                  color: 'var(--color-ink)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-body)',
                  fontWeight: 'var(--weight-semibold)',
                  cursor: 'pointer',
                }}
              >
                {t('verify.back.stay', null, lang)}
              </button>
              <button
                type="button"
                onClick={() => router.replace('/welcome')}
                lang={lang}
                style={{
                  flex: 1,
                  height: 48,
                  background: 'var(--color-danger, #c92a2a)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-body)',
                  fontWeight: 'var(--weight-semibold)',
                  cursor: 'pointer',
                }}
              >
                {t('verify.back.leave', null, lang)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
