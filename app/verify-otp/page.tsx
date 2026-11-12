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
 *   - Back arrow → confirm dialog → leave → /
 *   - Bilingual copy; phone mask shows last 3 digits
 *
 * On 200 the session cookie has been set by the server; we router.replace
 * to /home.
 *
 * Phase B (2026-10-04): web-first, 1440×900 + 1024×768 viewports.
 *
 * VISUAL CONTRACT — mockup 10
 * ----------------------------
 * A SINGLE centred column (520px) on the calm page surface. There is
 * NO dark story column here — unlike login and register, the OTP step
 * is a one-job surface, and a story column would compete with the
 * six boxes the citizen is looking at.
 *
 * The composition, top to bottom:
 *   1. a three-cell top bar (back · centred brand · language pill)
 *   2. the H1 and its subtitle
 *   3. the masked number, with a "change it" link beside it
 *   4. the delivery confirmation ("sent by SMS")
 *   5. the six OTP boxes
 *   6. the inline error, when there is one
 *   7. the full-width Verify button
 *   8. the live resend countdown
 *   9. the recovery help card
 *  10. the anti-fraud footnote
 *
 * This is a PRESENTATION change only. The API calls, the submit
 * handler, the validation, the error mapping, the resend cooldown, the
 * redirects and the session logic are exactly the behaviour the spec
 * describes — only the composition around them changed.
 *
 * THE OTP BOXES ARE REAL INPUTS
 * ------------------------------
 * The mockup draws the six boxes as static `<div>`s because a mockup
 * cannot be typed into. In the product they are six real
 * `<input>` elements, so keyboard entry, screen readers, autofill and
 * paste all work the way a citizen expects. Each box is styled to the
 * mockup's `.otp-box` (64px tall, mono, `--text-h2`, centred) with
 * the `.filled` / `.error` states reproduced as border, inset shadow
 * and fill.
 *
 * The empty box shows an em-dash placeholder. That is drawn BEHIND the
 * input (an absolutely-positioned, `aria-hidden` span) so the real
 * control never has to fake a value.
 */

'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { t, type Language } from '@/lib/i18n/keys';
import { safeNextPath } from '@/lib/safe-next';
import { resolvePostAuthTarget } from '@/lib/role-home';
import { useLanguage } from '@/components/useLanguage';
import { Button, IconButton } from '@/components/ui';
import { ICONS } from '@/lib/ui/icon-map';

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

/**
 * The masked number in the shape the mockup shows it:
 * "+880 1712-***-678".
 *
 * The raw `?phone=` value comes from the register form and may be
 * "01712345678", "+8801712345678" or "8801712345678" — the country
 * code is optional there. This helper splits it off so the country
 * code can be shown as the mockup shows it, then masks the
 * SUBSCRIBER digits with the SAME rule `maskPhone` applies (the first
 * four visible, the middle three hidden, the last three visible).
 *
 * The country code is whatever the caller actually passed — it is not
 * hard-coded to "+880", because a number that does not carry the
 * Bangla country code must not be presented as if it did.
 */
function formatMaskedNumber(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();

  // "+8801712345678" / "8801712345678" → country "880", subscriber
  // "1712345678". A bare "01712345678" has no country code but does
  // carry the local trunk prefix "0", which is not part of the
  // subscriber number either.
  const countryMatch = trimmed.match(/^\s*(\+?880)\s*(.*)$/);
  const hasCountry = Boolean(countryMatch);
  const country = hasCountry ? '+880' : '';
  let subscriber = (
    hasCountry
      ? (countryMatch as RegExpMatchArray)[2]
      : trimmed
  ).replace(/[^0-9]/g, '');
  if (!hasCountry && subscriber.length === 11 && subscriber.startsWith('0')) {
    subscriber = subscriber.slice(1);
  }

  if (subscriber.length < 6) return maskPhone(trimmed);

  // The subscriber number is ten digits ("1" + nine): the first four
  // are shown, the next three are hidden, the last three are shown.
  const head = subscriber.slice(0, 4);
  const last3 = subscriber.slice(-3);
  const hidden = Math.max(subscriber.length - 7, 3);
  const masked = `${head}-${'*'.repeat(hidden)}-${last3}`;
  return country ? `${country} ${masked}` : masked;
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
  const nextPath = safeNextPath(params.get('next'), '/home');
  const masked = useMemo(() => formatMaskedNumber(phoneParam), [phoneParam]);

  const { lang, setLang } = useLanguage();
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
    // Auto-focus the first box
    inputRefs.current[0]?.focus();
    // Fire the initial send-otp on mount so the user gets an SMS in prod
    // (or a dev_code in dev mode). Only when we actually know the
    // phone — without `?phone=` the request would 400 and log a
    // console error on every direct visit to this page.
    if (phoneParam) void requestCode();
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
    // The hook's setter persists the choice AND publishes the
    // `cityfix:language-updated` event.
    setLang(next);
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

  // The box that carries the error state. The mockup tints the box
  // that was wrong; the product cannot know which box was wrong (the
  // API answers on the code as a whole), so the FIRST box carries it.
  const erroredBox = error?.kind === 'wrong_code' || error?.kind === 'expired' ? 0 : -1;

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
        // Honor the `?next=` deep link (sanitized by safeNextPath) —
        // but only when the signed-in role may land on it. The OTP
        // path is citizen-only, so a deep link into a staff surface
        // (e.g. `?next=/admin`) must not carry a citizen there.
        const data = (await res.json().catch(() => null)) as {
          role?: string;
        } | null;
        router.replace(
          resolvePostAuthTarget(data?.role ?? 'citizen', nextPath),
        );
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

  /** The countdown, formatted the way the mockup shows it: 0:42. */
  const countdown = `${Math.floor(resendTimer / 60)}:${String(resendTimer % 60).padStart(2, '0')}`;

  return (
    <div
      style={{
        maxWidth: 520,
        margin: '0 auto',
        padding: 'var(--space-6) var(--space-5) var(--space-7)',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-surface-page)',
      }}
    >
      {/* ================= TOP BAR ================= */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '44px 1fr 44px',
          alignItems: 'center',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-7)',
        }}
      >
        {/* LEFT — back. It opens the confirm dialog, it does not leave
            the page silently: the OTP step may already hold a live
            code the citizen would lose. */}
        <IconButton
          label={t('otp.back_aria', null, lang)}
          onClick={() => setShowBackConfirm(true)}
          icon={<ICONS.back.icon size={18} weight={ICONS.back.weight} aria-hidden />}
          style={{
            // The visible control is 40px; the primitive sizes the
            // BUTTON to the 44px touch-target floor on its own, so
            // this override only changes how the control LOOKS.
            width: 40,
            height: 40,
            background: 'transparent',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-input)',
            color: 'var(--color-ink-secondary)',
          }}
        />

        {/* CENTRE — the brand. */}
        <Link
          href="/"
          aria-label="CityFix home"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            justifySelf: 'center',
            textDecoration: 'none',
            color: 'var(--color-ink)',
          }}
        >
          <BrandMark />
          <span
            style={{
              fontSize: 'var(--text-body)',
              fontWeight: 'var(--weight-bold)',
              letterSpacing: 'var(--tracking-tight)',
            }}
          >
            CityFix
          </span>
        </Link>

        {/* RIGHT — the language pill. */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={toggleLang}
          aria-label={t('otp.lang_aria', null, lang)}
          style={{
            justifySelf: 'end',
            height: 40,
            padding: '0 var(--space-3)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-pill)',
            color: 'var(--color-ink-secondary)',
            fontSize: 'var(--text-caption)',
          }}
        >
          {t('welcome.lang.toggle', null, lang)}
        </Button>
      </div>

      {/* ================= TITLE ================= */}
      <h1
        lang={lang}
        style={{
          fontSize: 'var(--text-display-md)',
          lineHeight: 'var(--leading-snug)',
          fontFamily: 'var(--font-display)',
          fontWeight: 'var(--weight-semibold)',
          letterSpacing: 'var(--tracking-tight)',
          color: 'var(--color-ink)',
          margin: '0 0 var(--space-3)',
        }}
      >
        {t('otp.title', null, lang)}
      </h1>
      <p
        lang={lang}
        style={{
          fontSize: 'var(--text-body)',
          color: 'var(--color-ink-secondary)',
          margin: '0 0 var(--space-2)',
          lineHeight: 'var(--leading-normal)',
        }}
      >
        {t('otp.subtitle', null, lang)}
      </p>

      {/* ================= MASKED NUMBER ================= */}
      <span
        lang={lang}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-body-sm)',
          color: 'var(--color-ink)',
          fontWeight: 'var(--weight-semibold)',
          marginBottom: 'var(--space-5)',
        }}
      >
        <ICONS.phone.icon size={14} weight={ICONS.phone.weight} aria-hidden />
        {masked}
        <Link
          href="/register"
          lang={lang}
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-body-sm)',
            color: 'var(--color-accent)',
            fontWeight: 'var(--weight-semibold)',
            textDecoration: 'none',
          }}
        >
          {t('otp.change_number', null, lang)}
        </Link>
      </span>

      {/* ================= DELIVERY CONFIRMATION ================= */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
          padding: 'var(--space-3) var(--space-4)',
          background: 'var(--color-surface-card)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          marginBottom: 'var(--space-5)',
        }}
      >
        <span
          aria-hidden
          style={{
            width: 36,
            height: 36,
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 'var(--radius-pill)',
            background: 'var(--color-status-resolved-soft)',
            color: 'var(--color-status-resolved)',
          }}
        >
          <ICONS.statusResolved.icon size={18} weight={ICONS.statusResolved.weight} />
        </span>
        <span
          lang={lang}
          style={{
            fontSize: 'var(--text-body-sm)',
            color: 'var(--color-ink-secondary)',
            lineHeight: 'var(--leading-snug)',
          }}
        >
          <Highlighted
            template={t('otp.delivery.text', null, lang)}
            token="{channel}"
            value={t('otp.delivery.channel', null, lang)}
          />
        </span>
      </div>

      {/* Dev-mode hint: surface the OTP so the QA can complete the flow */}
      {devCode && (
        <div
          data-testid="dev-otp-hint"
          style={{
            padding: 'var(--space-3) var(--space-4)',
            background: 'var(--color-warning-soft)',
            border: '1px solid var(--color-warning)',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--text-body-sm)',
            color: 'var(--color-ink)',
            marginBottom: 'var(--space-4)',
          }}
        >
          <strong>Dev code:</strong> {devCode}{' '}
          <span style={{ color: 'var(--color-ink-tertiary)' }}>
            (stub provider — production sends SMS via Twilio in v1.1)
          </span>
        </div>
      )}

      <form onSubmit={onSubmit} noValidate>
        {/* ================= OTP BOXES ================= */}
        <div
          role="group"
          aria-label={t('otp.group_aria', null, lang)}
          style={{
            display: 'flex',
            gap: 'var(--space-2)',
            marginBottom: 'var(--space-4)',
          }}
        >
          {digits.map((d, i) => {
            const isError = erroredBox === i;
            const isFilled = d !== '';
            return (
              <div
                key={i}
                style={{
                  position: 'relative',
                  flex: 1,
                  minWidth: 0,
                }}
              >
                {/* The empty-box placeholder. It sits BEHIND the real
                    input so the control keeps its own value semantics
                    (a screen reader never reads "—"). */}
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-h2)',
                    fontWeight: 'var(--weight-semibold)',
                    color: 'var(--color-ink-tertiary)',
                    pointerEvents: 'none',
                  }}
                >
                  {isFilled ? '' : '—'}
                </span>
                <input
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
                  aria-label={t('otp.digit_aria', { position: String(i + 1) }, lang)}
                  aria-invalid={isError || undefined}
                  style={{
                    position: 'relative',
                    width: '100%',
                    height: 64,
                    padding: 0,
                    textAlign: 'center',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-h2)',
                    fontWeight: 'var(--weight-semibold)',
                    background: isError ? 'var(--color-danger-soft)' : 'var(--color-surface-card)',
                    color: isError ? 'var(--color-danger)' : 'var(--color-ink)',
                    border: `1px solid ${
                      isError
                        ? 'var(--color-danger)'
                        : isFilled
                          ? 'var(--color-primary)'
                          : 'var(--color-border-input)'
                    }`,
                    borderRadius: 'var(--radius-input)',
                    boxShadow: isFilled && !isError ? 'inset 0 0 0 1px var(--color-primary)' : 'none',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* ================= INLINE ERROR ================= */}
        {error && error.kind !== 'too_many' && (
          <p
            lang={lang}
            role="alert"
            style={{
              display: 'flex',
              gap: 'var(--space-2)',
              alignItems: 'flex-start',
              fontSize: 'var(--text-body-sm)',
              color: 'var(--color-danger)',
              margin: '0 0 var(--space-4)',
              lineHeight: 'var(--leading-snug)',
            }}
          >
            <ICONS.statusWarning.icon
              size={16}
              weight={ICONS.statusWarning.weight}
              color="var(--color-danger)"
              aria-hidden
              style={{ flexShrink: 0, marginTop: 2 }}
            />
            {error.kind === 'wrong_code'
              ? t('otp.error.wrong_code', null, lang)
              : error.kind === 'expired'
                ? t('otp.error.expired', null, lang)
                : t('otp.error.network', null, lang)}
          </p>
        )}

        {/* "Code didn't arrive?" helper — the 30s nudge the spec asks
            for. The mockup replaces it with the always-visible help
            card, so this only shows while the citizen has NOT yet
            reached the card's advice. */}
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

        {/* ================= SUBMIT ================= */}
        <Button
          type="submit"
          variant="primary"
          fullWidth
          disabled={!canSubmit}
          loading={submitting}
          trailingIcon={<ICONS.check.icon size={18} weight={ICONS.check.weight} aria-hidden />}
          lang={lang}
          style={{ minHeight: 52 }}
        >
          {submitting
            ? t('otp.cta.submitting', null, lang)
            : t('otp.cta.submit', null, lang)}
        </Button>
      </form>

      {/* ================= RESEND ================= */}
      <div
        lang={lang}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--space-2)',
          marginTop: 'var(--space-4)',
          fontSize: 'var(--text-body-sm)',
          color: 'var(--color-ink-tertiary)',
          flexWrap: 'wrap',
        }}
      >
        {resendTimer > 0 ? (
          <>
            <ICONS.statusInProgress.icon
              size={14}
              weight={ICONS.statusInProgress.weight}
              aria-hidden
            />
            <span>
              {t('otp.resend.prefix', null, lang)}{' '}
              <strong
                style={{
                  color: 'var(--color-ink-secondary)',
                  fontWeight: 'var(--weight-semibold)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {countdown}
              </strong>{' '}
              {t('otp.resend.suffix', null, lang)}
            </span>
          </>
        ) : resendSending ? (
          <span>{t('otp.resend.sending', null, lang)}</span>
        ) : null}

        {/*
          The "send now" action.

          The mockup shows it BESIDE the countdown, so the row keeps
          both elements — but the cooldown rule is unchanged: while the
          timer runs the action is DISABLED, so the citizen can never
          spend the server's rate limit early. Once the timer reaches
          zero (or a 410 expired the code) it becomes live.
        */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={requestCode}
          disabled={resendTimer > 0 || resendSending}
          style={{
            border: 'none',
            padding: 0,
            color: 'var(--color-accent)',
            fontSize: 'var(--text-body-sm)',
            textDecoration: 'underline',
            textUnderlineOffset: 2,
          }}
        >
          {t('otp.resend.action', null, lang)}
        </Button>
      </div>

      {/* ================= RECOVERY HELP ================= */}
      <div
        style={{
          marginTop: 'var(--space-7)',
          padding: 'var(--space-4)',
          background: 'var(--color-surface-card)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        <div
          lang={lang}
          style={{
            fontSize: 'var(--text-body-sm)',
            fontWeight: 'var(--weight-semibold)',
            color: 'var(--color-ink)',
            marginBottom: 'var(--space-3)',
          }}
        >
          {t('otp.help.title', null, lang)}
        </div>
        <ul
          lang={lang}
          style={{
            margin: 0,
            paddingLeft: 18,
            color: 'var(--color-ink-secondary)',
            fontSize: 'var(--text-caption)',
            lineHeight: 1.8,
          }}
        >
          <li>
            <Highlighted
              template={t('otp.help.item1', null, lang)}
              token="{highlight}"
              value={t('otp.help.item1_highlight', null, lang)}
            />
          </li>
          <li>
            <Highlighted
              template={t('otp.help.item2', null, lang)}
              token="{highlight}"
              value={t('otp.help.item2_highlight', null, lang)}
            />
          </li>
          <li>
            <Highlighted
              template={t('otp.help.item3', null, lang)}
              token="{highlight}"
              value={t('otp.help.item3_highlight', null, lang)}
            />
          </li>
        </ul>
      </div>

      {/* ================= ANTI-FRAUD FOOTNOTE ================= */}
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
        {t('otp.footnote', null, lang)}
      </p>

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
              boxShadow: 'var(--shadow-modal)',
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
              <Button
                type="button"
                variant="secondary"
                size="lg"
                onClick={() => setShowBackConfirm(false)}
                lang={lang}
                style={{
                  flex: 1,
                  height: 48,
                  color: 'var(--color-ink)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                {t('verify.back.stay', null, lang)}
              </Button>
              <Button
                type="button"
                variant="danger"
                size="lg"
                onClick={() => router.replace('/')}
                lang={lang}
                style={{
                  flex: 1,
                  height: 48,
                  color: 'var(--color-on-danger)',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                {t('verify.back.leave', null, lang)}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * A sentence with ONE emphasised run inside it.
 *
 * The mockup sets the emphasised words in `<strong>` — the delivery
 * channel ("SMS"), and the three help-list highlights. The emphasis
 * has to survive translation, and the two languages put the emphasised
 * run in different places, so the emphasis cannot be a fixed prefix
 * or suffix.
 *
 * The i18n value therefore keeps a `{token}` placeholder in the
 * position that language wants it, and this component splits the
 * resolved string on that token and renders the middle run in
 * `<strong>`. The token is never passed through `t()`'s interpolation
 * (the callers pass no vars), so it survives to be split here.
 */
function Highlighted({
  template,
  token,
  value,
}: {
  template: string;
  token: string;
  value: string;
}) {
  const at = template.indexOf(token);
  if (at === -1) return <>{template}</>;
  return (
    <>
      {template.slice(0, at)}
      <strong
        style={{
          color: 'var(--color-ink)',
          fontWeight: 'var(--weight-semibold)',
        }}
      >
        {value}
      </strong>
      {template.slice(at + token.length)}
    </>
  );
}

/**
 * The brand mark — the same pin-and-check drawing `CityFixMark` renders,
 * without the boxed chrome the shared component draws.
 *
 * The mockup's lockup on this surface is the bare 24×24 mark (the
 * login/register lockups use the same drawing at 28×28), so the size
 * is passed explicitly rather than inherited.
 */
function BrandMark() {
  return (
    <svg
      width="24"
      height="24"
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
