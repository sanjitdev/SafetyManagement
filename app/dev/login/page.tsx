/**
 * /dev/login — one-click session bootstrap for the Vercel build.
 *
 * v1.1-launch (2026-10-14) — emergency fallback for the live
 * production deploy. The production build has no self-service
 * citizen login wired up yet (that's WO-004). Without a session
 * cookie, /reports and /reports/:id mount in the
 * `signin_required` state and the user sees no data.
 *
 * This page lets the operator mint a session with one click:
 *   1. Reads `?secret=…` from the URL (so the team can
 *      bookmark a pre-filled URL on their password manager).
 *      Falls back to a text input.
 *   2. Calls `POST /api/dev/list-users` to populate a
 *      `<select>` of all users in the demo city.
 *   3. On submit, calls `POST /api/dev/issue-session` with the
 *      secret header + chosen userId.
 *   4. On success, the cookie is set and we redirect to
 *      `/reports` (or `?next=` if provided).
 *
 * The page itself is unauthenticated; the secret is the gate.
 * If `CITYFIX_DEV_PROMOTE_SECRET` is unset on the Vercel env,
 * `list-users` returns 404 and the page surfaces a clear
 * "endpoint disabled" message.
 *
 * This page is NOT a public surface. It is dev-only tooling
 * scoped under `/dev/*` so it can be deleted cleanly once WO-004
 * lands and the escape hatch is retired.
 */

'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

interface UserRow {
  id: string;
  name: string;
  role: 'citizen' | 'dispatcher' | 'crew' | 'admin';
  phone: string;
  cityId: string;
  wardId: string;
  departmentId: string | null;
}

function DevLoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const nextFromUrl = params?.get('next') ?? '/reports';
  const secretFromUrl = params?.get('secret') ?? '';

  const [secret, setSecret] = useState(secretFromUrl);
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [listError, setListError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitOk, setSubmitOk] = useState<{
    userId: string;
    role: string;
    name: string;
    expiresAt: string;
  } | null>(null);

  // Whenever the secret changes (typed by hand), re-fetch the
  // directory. If the secret is wrong, list-users returns 404
  // (env var unset) or 403 (wrong value); we surface either.
  useEffect(() => {
    let cancelled = false;
    if (!secret) {
      setUsers(null);
      setListError(null);
      return;
    }
    (async () => {
      setListError(null);
      setUsers(null);
      try {
        const res = await fetch('/api/dev/list-users', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'x-cityfix-promote-secret': secret,
            'content-type': 'application/json',
          },
          body: JSON.stringify({}),
        });
        if (cancelled) return;
        if (res.status === 404) {
          setListError('list-users: 404 — CITYFIX_DEV_PROMOTE_SECRET is not set on this env');
          return;
        }
        if (res.status === 403) {
          setListError('list-users: 403 — wrong secret');
          return;
        }
        if (!res.ok) {
          setListError(`list-users: HTTP ${res.status}`);
          return;
        }
        const body = (await res.json()) as { users: UserRow[] };
        if (cancelled) return;
        setUsers(body.users);
        // Default to the first citizen if any, otherwise the
        // first row.
        const firstCitizen = body.users.find((u) => u.role === 'citizen');
        setSelectedUserId(firstCitizen?.id ?? body.users[0]?.id ?? '');
      } catch (e) {
        if (!cancelled) {
          setListError(`list-users: ${(e as Error).message}`);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [secret]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!secret || !selectedUserId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/dev/issue-session', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'x-cityfix-promote-secret': secret,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ userId: selectedUserId }),
      });
      if (!res.ok) {
        const text = await res.text();
        setSubmitError(`issue-session: HTTP ${res.status} ${text}`);
        return;
      }
      const body = (await res.json()) as {
        userId: string;
        role: string;
        name: string;
        expiresAt: string;
      };
      setSubmitOk(body);
      // Brief pause so the success state is visible, then redirect.
      window.setTimeout(() => {
        router.push(nextFromUrl);
      }, 600);
    } catch (e) {
      setSubmitError(`issue-session: ${(e as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'var(--color-surface-page)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: 'var(--space-7) var(--space-5)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          background: 'var(--color-surface-card, #ffffff)',
          border: '1px solid var(--color-border, #e5e7eb)',
          borderRadius: 'var(--radius-md, 8px)',
          padding: 'var(--space-5)',
        }}
      >
        <h1
          style={{
            fontSize: 'var(--text-h3, 1.25rem)',
            margin: '0 0 var(--space-2)',
            color: 'var(--color-ink)',
          }}
        >
          Dev session bootstrap
        </h1>
        <p
          style={{
            fontSize: 'var(--text-body-sm, 0.875rem)',
            color: 'var(--color-ink-secondary)',
            margin: '0 0 var(--space-5)',
          }}
        >
          One-click session for the production build. Requires{' '}
          <code>CITYFIX_DEV_PROMOTE_SECRET</code>. Page is dev-only and
          will be retired when WO-004 lands.
        </p>

        <form onSubmit={onSubmit}>
          <label
            htmlFor="dev-login-secret"
            style={{
              display: 'block',
              fontSize: 'var(--text-body-sm, 0.875rem)',
              fontWeight: 'var(--weight-semibold, 600)',
              marginBottom: 'var(--space-1)',
              color: 'var(--color-ink)',
            }}
          >
            Promote secret
          </label>
          <input
            id="dev-login-secret"
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="paste CITYFIX_DEV_PROMOTE_SECRET"
            autoComplete="off"
            data-testid="dev-login-secret"
            style={{
              width: '100%',
              padding: 'var(--space-2) var(--space-3)',
              border: '1px solid var(--color-border, #d1d5db)',
              borderRadius: 'var(--radius-sm, 6px)',
              fontSize: 'var(--text-body, 1rem)',
              fontFamily: 'inherit',
              marginBottom: 'var(--space-4)',
              boxSizing: 'border-box',
              background: 'var(--color-surface-page)',
              color: 'var(--color-ink)',
            }}
          />

          <label
            htmlFor="dev-login-user"
            style={{
              display: 'block',
              fontSize: 'var(--text-body-sm, 0.875rem)',
              fontWeight: 'var(--weight-semibold, 600)',
              marginBottom: 'var(--space-1)',
              color: 'var(--color-ink)',
            }}
          >
            User
          </label>
          <select
            id="dev-login-user"
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            disabled={!users || users.length === 0}
            data-testid="dev-login-user"
            style={{
              width: '100%',
              padding: 'var(--space-2) var(--space-3)',
              border: '1px solid var(--color-border, #d1d5db)',
              borderRadius: 'var(--radius-sm, 6px)',
              fontSize: 'var(--text-body, 1rem)',
              fontFamily: 'inherit',
              marginBottom: 'var(--space-2)',
              boxSizing: 'border-box',
              background: 'var(--color-surface-page)',
              color: 'var(--color-ink)',
            }}
          >
            {!users && (
              <option value="">
                {secret ? 'Loading…' : 'Enter the secret to load users'}
              </option>
            )}
            {users && users.length === 0 && (
              <option value="">No users in this city</option>
            )}
            {users?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} — {u.role} ({u.phone})
              </option>
            ))}
          </select>

          {listError && (
            <p
              role="alert"
              data-testid="dev-login-list-error"
              style={{
                color: 'var(--color-status-cancelled, #b91c1c)',
                fontSize: 'var(--text-body-sm, 0.875rem)',
                margin: 'var(--space-1) 0 var(--space-3)',
              }}
            >
              {listError}
            </p>
          )}

          <button
            type="submit"
            disabled={
              !secret ||
              !selectedUserId ||
              submitting ||
              !users ||
              users.length === 0
            }
            data-testid="dev-login-submit"
            style={{
              width: '100%',
              padding: 'var(--space-3) var(--space-5)',
              background: 'var(--color-primary)',
              color: 'var(--color-on-primary)',
              border: 'none',
              borderRadius: 'var(--radius-md, 8px)',
              fontSize: 'var(--text-body, 1rem)',
              fontWeight: 'var(--weight-semibold, 600)',
              cursor: 'pointer',
              marginTop: 'var(--space-3)',
            }}
          >
            {submitting ? 'Minting…' : 'Mint session & redirect'}
          </button>

          {submitError && (
            <p
              role="alert"
              data-testid="dev-login-submit-error"
              style={{
                color: 'var(--color-status-cancelled, #b91c1c)',
                fontSize: 'var(--text-body-sm, 0.875rem)',
                margin: 'var(--space-3) 0 0',
              }}
            >
              {submitError}
            </p>
          )}

          {submitOk && (
            <p
              role="status"
              data-testid="dev-login-submit-ok"
              style={{
                color: 'var(--color-status-resolved, #1f7a3f)',
                fontSize: 'var(--text-body-sm, 0.875rem)',
                margin: 'var(--space-3) 0 0',
              }}
            >
              Minted session for {submitOk.name} ({submitOk.role}). Redirecting to{' '}
              <code>{nextFromUrl}</code>…
            </p>
          )}
        </form>

        <details style={{ marginTop: 'var(--space-5)' }}>
          <summary
            style={{
              fontSize: 'var(--text-body-sm, 0.875rem)',
              color: 'var(--color-ink-secondary)',
              cursor: 'pointer',
            }}
          >
            How this works
          </summary>
          <ol
            style={{
              fontSize: 'var(--text-body-sm, 0.875rem)',
              color: 'var(--color-ink-secondary)',
              paddingLeft: 'var(--space-5)',
              margin: 'var(--space-3) 0 0',
              lineHeight: 1.6,
            }}
          >
            <li>
              The secret is the value of <code>CITYFIX_DEV_PROMOTE_SECRET</code>{' '}
              on the Vercel project.
            </li>
            <li>
              <code>list-users</code> hits the production Postgres and returns
              every user in the demo city (default{' '}
              <code>dhaka-north</code>).
            </li>
            <li>
              <code>issue-session</code> mints a 14-day session for the
              selected user and sets the <code>cityfix_session</code> cookie.
            </li>
            <li>
              This whole page should be deleted (and the secret removed from
              Vercel) once WO-004 wires real auth.
            </li>
          </ol>
        </details>
      </div>
    </main>
  );
}

export default function DevLoginPage() {
  // useSearchParams must be inside a Suspense boundary on
  // Next.js 14 to keep static export / prerender happy. The
  // fallback matches the same shell so there's no flash of
  // empty UI while the params resolve.
  return (
    <Suspense
      fallback={
        <main
          style={{
            minHeight: '100vh',
            background: 'var(--color-surface-page)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-ink-secondary)',
          }}
        >
          Loading…
        </main>
      }
    >
      <DevLoginInner />
    </Suspense>
  );
}